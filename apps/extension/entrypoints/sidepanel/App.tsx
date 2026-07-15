import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Button,
  DensityProvider,
  EmptyState,
  ProfilePicker,
  ReviewCard,
  StatusRegion,
  TranscriptList,
  useDensity,
  type TranscriptItem,
} from "@language-llm/ui";
import "@language-llm/ui/tokens.css";
import type { StudyCard } from "@language-llm/protocol";
import { importDictionaryText } from "@language-llm/language-kits";
import {
  createCompanionStudyStore,
  StudySession,
} from "../../features/learning/session";
import {
  dictionaryStats,
  formatLookupHit,
  getRetention,
  importDictionary,
  lexiconToCompanionEntries,
  lookupDictionary,
  pingCompanion,
  setRetention,
  wipePrivacy,
  type RetentionPreset,
} from "../../features/companion/runtime";

type CompanionUi = "unknown" | "ready" | "degraded" | "down";

function SidePanelInner() {
  const { profile, setProfile } = useDensity();
  const [items, setItems] = useState<TranscriptItem[]>([]);
  const [activeId, setActiveId] = useState<string | undefined>();
  const [companion, setCompanion] = useState<CompanionUi>("unknown");
  const [status, setStatus] = useState("");
  const [due, setDue] = useState<StudyCard[]>([]);
  const [dictCount, setDictCount] = useState(0);
  const [dictAttr, setDictAttr] = useState("");
  const [lookupQ, setLookupQ] = useState("");
  const [lookupHit, setLookupHit] = useState("");
  const [lyricsNet, setLyricsNet] = useState(false);
  const [retention, setRetentionState] = useState<RetentionPreset>("days7");

  const studyRef = React.useRef<StudySession | null>(null);

  const refreshStudy = useCallback(async () => {
    if (!studyRef.current) {
      // Companion SQLite is study authority; chrome.storage is offline mirror.
      studyRef.current = new StudySession(createCompanionStudyStore());
      await studyRef.current.hydrate();
    }
    setDue(studyRef.current.dueCards());
  }, []);

  const refreshCompanion = useCallback(async () => {
    const ping = await pingCompanion();
    if (ping.ready) setCompanion("ready");
    else if (ping.degraded) setCompanion("degraded");
    else setCompanion("down");
    return ping;
  }, []);

  const refreshDictStats = useCallback(async () => {
    const stats = await dictionaryStats();
    if (stats.ok && typeof stats.entries === "number") {
      setDictCount(stats.entries);
      setDictAttr(
        typeof stats.dictionaries === "number"
          ? `${stats.dictionaries} dictionary pack(s) in companion`
          : "Companion dictionary store",
      );
      return;
    }
    chrome.storage.local.get("language-llm.lexicon", (v) => {
      const lex = v["language-llm.lexicon"] as
        | { count?: number; format?: string; attribution?: string }
        | undefined;
      setDictCount(typeof lex?.count === "number" ? lex.count : 0);
      setDictAttr(
        lex?.attribution ??
          (lex?.format ? `Local cache · ${lex.format}` : ""),
      );
    });
  }, []);

  useEffect(() => {
    void (async () => {
      await refreshCompanion();
      const ret = await getRetention();
      if (ret.preset) setRetentionState(ret.preset);
      await refreshDictStats();
      await refreshStudy();
    })();

    chrome.storage.local.get(
      ["lyricsNetworkAllowed", "language-llm.transcript"],
      (v) => {
        setLyricsNet(Boolean(v.lyricsNetworkAllowed));
        const tr = v["language-llm.transcript"] as
          | { items?: TranscriptItem[]; activeId?: string }
          | undefined;
        if (tr?.items) {
          setItems(tr.items);
          setActiveId(tr.activeId);
        }
      },
    );

    const onStorage = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area !== "local") return;
      const tr = changes["language-llm.transcript"]?.newValue as
        | { items?: TranscriptItem[]; activeId?: string }
        | undefined;
      if (tr?.items) {
        setItems(tr.items);
        setActiveId(tr.activeId);
      }
    };
    chrome.storage.onChanged.addListener(onStorage);
    return () => chrome.storage.onChanged.removeListener(onStorage);
  }, [refreshCompanion, refreshDictStats, refreshStudy]);

  const listItems = useMemo(
    () =>
      items.map((i) => ({
        ...i,
        active: i.id === activeId,
      })),
    [items, activeId],
  );

  const reviewCard = due[0] ?? null;

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: "0.75rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.85rem",
        boxSizing: "border-box",
      }}
    >
      <header>
        <h1 style={{ margin: 0, fontSize: "1.1rem" }}>Language-LLM</h1>
        <p style={{ margin: "0.25rem 0 0", fontSize: "0.8125rem", opacity: 0.75 }}>
          Transcript, learning, dictionaries, lyrics
        </p>
      </header>

      {companion === "down" ? (
        <EmptyState
          kind="no-companion"
          actions={[
            {
              id: "retry",
              label: "Retry ping",
              onClick: () => {
                void refreshCompanion().then((ping) => {
                  setStatus(
                    ping.ready
                      ? "Companion ready"
                      : ping.degraded
                        ? "Companion degraded (native only)"
                        : "Companion still offline",
                  );
                });
              },
            },
          ]}
        />
      ) : companion === "degraded" ? (
        <StatusRegion
          message="Companion degraded — native host up, WebSocket down. Study/privacy sync unavailable until reconnect."
          tone="warn"
        />
      ) : (
        <StatusRegion
          message={
            companion === "ready"
              ? "Companion ready"
              : "Checking companion…"
          }
          tone={companion === "ready" ? "success" : "info"}
        />
      )}

      <ProfilePicker value={profile} onChange={setProfile} compact />

      <section aria-label="Transcript">
        <h2 style={{ fontSize: "0.95rem", margin: "0 0 0.4rem" }}>Transcript</h2>
        {listItems.length === 0 ? (
          <EmptyState
            kind="no-captions"
            description="Open a YouTube video with captions, or start tab transcription. Cues hydrate here when available."
            actions={[
              {
                id: "transcribe",
                label: "Transcribe active tab",
                onClick: () => {
                  chrome.tabs.query(
                    { active: true, currentWindow: true },
                    (tabs) => {
                      const tab = tabs[0];
                      if (!tab?.id) return;
                      chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        func: () =>
                          window.dispatchEvent(
                            new Event("language-llm:transcribe-tab"),
                          ),
                      });
                      setStatus("Capture requested on active tab");
                    },
                  );
                },
              },
            ]}
          />
        ) : (
          <TranscriptList
            items={listItems}
            searchable
            followActive
            onSelectCue={(id) => {
              setActiveId(id);
              const cue = items.find((i) => i.id === id);
              if (!cue) return;
              chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                const tab = tabs[0];
                if (!tab?.id) return;
                chrome.tabs.sendMessage(tab.id, {
                  type: "transcript.seek",
                  startMs: cue.startMs,
                  cueId: id,
                });
              });
            }}
          />
        )}
      </section>

      <section aria-label="Learning" data-llm-chrome="learning">
        <h2 style={{ fontSize: "0.95rem", margin: "0 0 0.4rem" }}>
          Learning · FSRS
        </h2>
        {reviewCard ? (
          <ReviewCard
            sourceText={reviewCard.sourceText}
            {...(reviewCard.translationText
              ? { translationText: reviewCard.translationText }
              : {})}
            onRate={(rating) => {
              void (async () => {
                await studyRef.current?.review(reviewCard.id, rating);
                setStatus(`Rated ${rating}`);
                await refreshStudy();
              })();
            }}
          />
        ) : (
          <EmptyState kind="no-review-due" />
        )}
        <div style={{ marginTop: 8 }}>
          <Button
            variant="ghost"
            onClick={() => {
              const csv = studyRef.current?.exportCsv() ?? "";
              void navigator.clipboard?.writeText(csv);
              setStatus("CSV copied to clipboard");
            }}
          >
            Copy CSV export
          </Button>
        </div>
      </section>

      <section aria-label="Dictionaries">
        <h2 style={{ fontSize: "0.95rem", margin: "0 0 0.4rem" }}>
          Dictionaries
        </h2>
        {dictCount === 0 ? (
          <EmptyState kind="empty-dictionary" />
        ) : (
          <p style={{ fontSize: "0.8125rem", margin: "0 0 0.5rem" }}>
            {dictCount} entries
            {dictAttr ? ` · ${dictAttr}` : ""}
          </p>
        )}
        <DictionaryImport
          companionReady={companion === "ready"}
          onImported={(count, format, viaCompanion) => {
            setDictCount(count);
            setDictAttr(
              viaCompanion
                ? `Companion SQLite · ${format}`
                : `Local cache only · ${format} (companion offline)`,
            );
            setStatus(
              viaCompanion
                ? `Imported ${count} ${format} entries into companion`
                : `Cached ${count} ${format} entries locally — companion import pending`,
            );
          }}
        />
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <input
            value={lookupQ}
            onChange={(e) => setLookupQ(e.target.value)}
            placeholder="Lookup lemma"
            aria-label="Dictionary lookup"
            className="llm-focus-ring"
            style={{
              flex: 1,
              padding: "0.4rem 0.5rem",
              border: "1px solid var(--llm-muted-slate)",
            }}
          />
          <Button
            variant="ghost"
            onClick={() => {
              void (async () => {
                const hit = await lookupDictionary(lookupQ.trim());
                if (hit.ok && hit.entries[0]) {
                  setLookupHit(formatLookupHit(hit.entries[0]));
                  return;
                }
                // Offline fallback: sample cache in chrome.storage.
                chrome.storage.local.get("language-llm.lexicon", (v) => {
                  const lex = v["language-llm.lexicon"] as
                    | {
                        sample?: Array<{
                          lemma: string;
                          readings?: string[];
                          senses: Array<{ glosses: string[] }>;
                        }>;
                      }
                    | undefined;
                  const q = lookupQ.trim().toLowerCase();
                  const local = (lex?.sample ?? []).find(
                    (e) => e.lemma.toLowerCase() === q,
                  );
                  if (local) {
                    setLookupHit(
                      `${local.lemma}: ${local.senses[0]?.glosses.join("; ") ?? ""} (local cache)`,
                    );
                  } else {
                    setLookupHit(hit.error ?? "no hit");
                  }
                });
              })();
            }}
          >
            Look up
          </Button>
        </div>
        {lookupHit ? (
          <p style={{ fontSize: "0.8125rem", marginTop: 6 }}>{lookupHit}</p>
        ) : null}
      </section>

      <section aria-label="Privacy and retention">
        <h2 style={{ fontSize: "0.95rem", margin: "0 0 0.4rem" }}>
          Privacy & retention
        </h2>
        <label
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            fontSize: "0.8125rem",
          }}
        >
          Retention preset
          <select
            value={retention}
            className="llm-focus-ring"
            style={{
              padding: "0.4rem 0.5rem",
              border: "1px solid var(--llm-muted-slate)",
            }}
            onChange={(e) => {
              const preset = e.target.value as RetentionPreset;
              setRetentionState(preset);
              void setRetention(preset).then((res) => {
                setStatus(
                  res.ok
                    ? `Retention set to ${preset}`
                    : res.error ?? "Retention update failed",
                );
              });
            }}
          >
            <option value="session">This session</option>
            <option value="days7">7 days</option>
            <option value="days30">30 days</option>
            <option value="keep">Keep until wipe</option>
          </select>
        </label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
          <Button
            variant="ghost"
            onClick={() => {
              void wipePrivacy("page-cache").then((res) => {
                setStatus(
                  res.ok
                    ? "Page translation cache cleared"
                    : res.error ?? "Wipe failed",
                );
              });
            }}
          >
            Clear page cache
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              void wipePrivacy("lyrics").then((res) => {
                setStatus(
                  res.ok ? "Lyrics cache cleared" : res.error ?? "Wipe failed",
                );
              });
            }}
          >
            Clear lyrics cache
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (
                !window.confirm(
                  "Wipe all companion-stored transcripts, translations, lyrics, study, and dictionaries? This cannot be undone.",
                )
              ) {
                return;
              }
              void wipePrivacy("all").then(async (res) => {
                if (res.ok) {
                  chrome.storage.local.remove([
                    "language-llm.lexicon",
                    "language-llm.study",
                    "language-llm.transcript",
                  ]);
                  setDictCount(0);
                  setDictAttr("");
                  setItems([]);
                  studyRef.current = new StudySession(createCompanionStudyStore());
                  await studyRef.current.hydrate();
                  setDue([]);
                  setStatus("Privacy wipe completed");
                } else {
                  setStatus(res.error ?? "Privacy wipe failed");
                }
              });
            }}
          >
            Full privacy wipe
          </Button>
        </div>
      </section>

      <section aria-label="Lyrics">
        <h2 style={{ fontSize: "0.95rem", margin: "0 0 0.4rem" }}>Lyrics</h2>
        <label
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            fontSize: "0.8125rem",
          }}
        >
          <input
            type="checkbox"
            checked={lyricsNet}
            onChange={(e) => {
              const allowed = e.target.checked;
              setLyricsNet(allowed);
              chrome.runtime.sendMessage({
                type: "lyrics.set-network",
                allowed,
              });
            }}
          />
          Allow attributed LRCLIB fetch (clearable)
        </label>
        <p style={{ fontSize: "0.75rem", opacity: 0.75, margin: "0.35rem 0" }}>
          Caption↔lyrics matches require confirmation — never applied silently.
        </p>
        <LyricsActions lyricsNet={lyricsNet} onStatus={setStatus} />
      </section>

      {status ? <StatusRegion message={status} tone="info" /> : null}

      {profile === "expert" ? (
        <section data-llm-chrome="diagnostics" aria-label="Diagnostics">
          <h2 style={{ fontSize: "0.95rem" }}>Expert diagnostics</h2>
          <p style={{ fontSize: "0.75rem", fontFamily: "var(--llm-font-mono)" }}>
            density={profile} · companion={companion} · cues={items.length} ·
            due={due.length} · dict={dictCount} · retention={retention}
          </p>
        </section>
      ) : null}
    </div>
  );
}

function DictionaryImport({
  companionReady,
  onImported,
}: {
  companionReady: boolean;
  onImported: (count: number, format: string, viaCompanion: boolean) => void;
}) {
  const ref = React.useRef<HTMLInputElement>(null);
  return (
    <>
      <Button variant="ghost" onClick={() => ref.current?.click()}>
        Import dictionary file
      </Button>
      <input
        ref={ref}
        type="file"
        accept=".txt,.xml,.jsonl,.u8,text/plain,application/xml"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            const content = String(reader.result ?? "");
            const result = importDictionaryText(content, {
              filename: file.name,
            });
            if (result.format === "unknown" || result.entries.length === 0) {
              return;
            }
            const sample = result.entries.slice(0, 500);
            chrome.storage.local.set(
              {
                "language-llm.lexicon": {
                  format: result.format,
                  count: result.entries.length,
                  attribution: `${file.name} · verify license before redistribution`,
                  sample,
                },
              },
              () => {
                void (async () => {
                  if (!companionReady) {
                    onImported(result.entries.length, result.format, false);
                    return;
                  }
                  const language =
                    result.entries[0]?.language ??
                    (result.format.startsWith("jmdict")
                      ? "ja"
                      : result.format === "cc-cedict"
                        ? "zh"
                        : "und");
                  const imported = await importDictionary({
                    id: `dict-${Date.now()}`,
                    name: file.name,
                    language,
                    license: "verify-before-redistribution",
                    entries: lexiconToCompanionEntries(result.entries),
                  });
                  onImported(
                    imported.imported ?? result.entries.length,
                    result.format,
                    imported.ok,
                  );
                })();
              },
            );
          };
          reader.readAsText(file);
        }}
      />
    </>
  );
}

function LyricsActions({
  lyricsNet,
  onStatus,
}: {
  lyricsNet: boolean;
  onStatus: (s: string) => void;
}) {
  const fileRef = React.useRef<HTMLInputElement>(null);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
      <Button variant="ghost" onClick={() => fileRef.current?.click()}>
        Import LRC / TTML
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept=".lrc,.ttml,.txt,text/plain"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            const content = String(reader.result ?? "");
            const name = file.name.toLowerCase();
            const format = name.endsWith(".ttml")
              ? "ttml"
              : name.endsWith(".lrc")
                ? "lrc"
                : "plain";
            chrome.runtime.sendMessage({
              type: "lyrics.import-lrc",
              format,
              content,
            });
            onStatus(`Imported ${format} lyrics (attributed to local file)`);
          };
          reader.readAsText(file);
        }}
      />
      <Button
        variant="ghost"
        disabled={!lyricsNet}
        onClick={() => {
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const title = tabs[0]?.title ?? "";
            chrome.runtime.sendMessage(
              {
                type: "lyrics.fetch-lrclib",
                trackName: title,
                videoId: "active",
              },
              (res) => {
                if (res?.ok && res.result?.lrc) {
                  onStatus(
                    "LRCLIB match ready — confirm on the video overlay before applying",
                  );
                  if (tabs[0]?.id) {
                    chrome.tabs.sendMessage(tabs[0].id, {
                      type: "lyrics.confirm-candidate",
                      lrc: res.result.lrc,
                      attribution: "LRCLIB",
                    });
                  }
                } else {
                  onStatus(res?.error ?? "No LRCLIB match");
                }
              },
            );
          });
        }}
      >
        Fetch LRCLIB
      </Button>
    </div>
  );
}

function SidePanel() {
  return (
    <DensityProvider persist>
      <SidePanelInner />
    </DensityProvider>
  );
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<SidePanel />);
