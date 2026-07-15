import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { colors, fonts } from "@language-llm/ui";
import { importDictionaryText, lookupLemma } from "@language-llm/language-kits";
import type { StudyCard } from "@language-llm/protocol";
import {
  createChromeStudyStore,
  StudySession,
} from "../../features/learning/session";

const PAGE_ORIGINS = ["http://*/*", "https://*/*"] as const;

function Popup() {
  const [status, setStatus] = useState<"unknown" | "ok" | "down">("unknown");
  const [job, setJob] = useState("idle");
  const [lyricsNet, setLyricsNet] = useState(false);
  const [pagePerm, setPagePerm] = useState(false);
  const [due, setDue] = useState<StudyCard[]>([]);
  const [reviewCard, setReviewCard] = useState<StudyCard | null>(null);
  const [dictCount, setDictCount] = useState(0);
  const [dictHint, setDictHint] = useState("");
  const [lookupQ, setLookupQ] = useState("");
  const [lookupHit, setLookupHit] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const dictRef = useRef<HTMLInputElement>(null);
  const studyRef = useRef<StudySession | null>(null);

  const refreshStudy = useCallback(async () => {
    if (!studyRef.current) {
      studyRef.current = new StudySession(createChromeStudyStore());
      await studyRef.current.hydrate();
    }
    const cards = studyRef.current.dueCards();
    setDue(cards);
    setReviewCard(cards[0] ?? null);
  }, []);

  useEffect(() => {
    chrome.runtime.sendMessage({ type: "companion.ping" }, (res) => {
      setStatus(res?.ok ? "ok" : "down");
    });
    chrome.storage.local.get(["lyricsNetworkAllowed", "language-llm.lexicon"], (v) => {
      setLyricsNet(Boolean(v.lyricsNetworkAllowed));
      const lex = v["language-llm.lexicon"] as { count?: number } | undefined;
      setDictCount(typeof lex?.count === "number" ? lex.count : 0);
    });
    chrome.permissions.contains({ origins: [...PAGE_ORIGINS] }, (granted) => {
      setPagePerm(Boolean(granted));
    });
    void refreshStudy();
  }, [refreshStudy]);

  return (
    <div
      style={{
        width: 360,
        padding: 16,
        fontFamily: fonts.ui,
        color: colors.ink,
        background: colors.paper,
        maxHeight: 560,
        overflow: "auto",
      }}
    >
      <h1 style={{ fontSize: 18, margin: 0 }}>Language-LLM</h1>
      <p style={{ color: colors.mutedSlate, fontSize: 13 }}>
        Local captions, translation, website translate, lyrics — offline after
        model download.
      </p>
      <p>
        Companion:{" "}
        <strong
          style={{
            color: status === "ok" ? colors.signalBlue : colors.errorRed,
          }}
        >
          {status}
        </strong>
      </p>
      <p style={{ fontSize: 12 }}>Job: {job}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button
          type="button"
          style={primaryBtn}
          onClick={() => {
            setJob("translate-page");
            chrome.permissions.request(
              { origins: [...PAGE_ORIGINS] },
              (granted) => {
                setPagePerm(Boolean(granted));
                chrome.tabs.query(
                  { active: true, currentWindow: true },
                  (tabs) => {
                    const tab = tabs[0];
                    if (tab?.id) {
                      chrome.tabs.sendMessage(tab.id, {
                        type: "page-translate.start",
                        targetLang: "en",
                      });
                    }
                    setJob(granted ? "translate-page" : "permission-denied");
                  },
                );
              },
            );
          }}
        >
          Translate this page
        </button>
        <button
          type="button"
          style={secondaryBtn}
          onClick={() => {
            setJob("transcribe-tab");
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
              const tab = tabs[0];
              if (tab?.id) {
                chrome.scripting.executeScript({
                  target: { tabId: tab.id },
                  func: () =>
                    window.dispatchEvent(
                      new Event("language-llm:transcribe-tab"),
                    ),
                });
              }
            });
          }}
        >
          Transcribe this tab
        </button>
      </div>

      <section style={sectionStyle} aria-label="Page translate permissions">
        <h2 style={h2}>Website translate</h2>
        <p style={{ fontSize: 12, margin: "0 0 8px", color: colors.mutedSlate }}>
          Host access:{" "}
          <strong style={{ color: pagePerm ? colors.signalBlue : colors.amberEvidence }}>
            {pagePerm ? "granted" : "not granted"}
          </strong>
          . Text stays on-device.
        </p>
        {pagePerm ? (
          <button
            type="button"
            style={secondaryBtn}
            onClick={() => {
              chrome.permissions.remove(
                { origins: [...PAGE_ORIGINS] },
                (removed) => {
                  setPagePerm(!removed);
                  setJob(removed ? "page-perm-revoked" : "page-perm-keep");
                },
              );
            }}
          >
            Revoke http(s) permission
          </button>
        ) : (
          <button
            type="button"
            style={secondaryBtn}
            onClick={() => {
              chrome.permissions.request(
                { origins: [...PAGE_ORIGINS] },
                (granted) => {
                  setPagePerm(Boolean(granted));
                  setJob(granted ? "page-perm-ok" : "page-perm-denied");
                },
              );
            }}
          >
            Grant http(s) for always-on sites
          </button>
        )}
      </section>

      <section style={sectionStyle} aria-label="Learning review">
        <h2 style={h2}>Learn · FSRS review</h2>
        <p style={{ fontSize: 12, color: colors.mutedSlate, margin: "0 0 8px" }}>
          {due.length} due · mine with Alt+M on the overlay
        </p>
        {reviewCard ? (
          <div>
            <p style={{ margin: "0 0 4px", fontSize: 14 }}>{reviewCard.sourceText}</p>
            <p style={{ margin: "0 0 8px", fontSize: 12, color: colors.mutedSlate }}>
              {reviewCard.translationText ?? "(no translation)"}
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {([1, 2, 3, 4] as const).map((rating) => (
                <button
                  key={rating}
                  type="button"
                  style={secondaryBtn}
                  onClick={() => {
                    void (async () => {
                      await studyRef.current?.review(reviewCard.id, rating);
                      setJob(`reviewed-${rating}`);
                      await refreshStudy();
                    })();
                  }}
                >
                  {rating === 1
                    ? "Again"
                    : rating === 2
                      ? "Hard"
                      : rating === 3
                        ? "Good"
                        : "Easy"}
                </button>
              ))}
            </div>
            <button
              type="button"
              style={{ ...secondaryBtn, marginTop: 8 }}
              onClick={() => {
                const csv = studyRef.current?.exportCsv() ?? "";
                void navigator.clipboard?.writeText(csv);
                setJob("csv-copied");
              }}
            >
              Copy CSV export
            </button>
          </div>
        ) : (
          <p style={{ fontSize: 12, color: colors.mutedSlate }}>
            No cards due. Mine a caption with Alt+M.
          </p>
        )}
      </section>

      <section style={sectionStyle} aria-label="Dictionary import">
        <h2 style={h2}>Dictionaries</h2>
        <p style={{ fontSize: 12, color: colors.mutedSlate, margin: "0 0 8px" }}>
          {dictCount > 0
            ? `${dictCount} entries loaded (${dictHint || "local"})`
            : "Import JMdict / CC-CEDICT / Kaikki JSONL"}
        </p>
        <button
          type="button"
          style={secondaryBtn}
          onClick={() => dictRef.current?.click()}
        >
          Import dictionary file
        </button>
        <input
          ref={dictRef}
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
                setJob("dict-unrecognized");
                return;
              }
              chrome.storage.local.set(
                {
                  "language-llm.lexicon": {
                    format: result.format,
                    count: result.entries.length,
                    // Keep a bounded cache for popup lookup demos.
                    sample: result.entries.slice(0, 500),
                  },
                },
                () => {
                  setDictCount(result.entries.length);
                  setDictHint(result.format);
                  setJob(`dict-${result.format}:${result.entries.length}`);
                },
              );
            };
            reader.readAsText(file);
          }}
        />
        <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
          <input
            value={lookupQ}
            onChange={(e) => setLookupQ(e.target.value)}
            placeholder="Lookup lemma"
            aria-label="Dictionary lookup"
            style={{
              flex: 1,
              border: `1px solid ${colors.mutedSlate}`,
              padding: "6px 8px",
              fontFamily: fonts.ui,
            }}
          />
          <button
            type="button"
            style={secondaryBtn}
            onClick={() => {
              chrome.storage.local.get("language-llm.lexicon", (v) => {
                const lex = v["language-llm.lexicon"] as
                  | { sample?: Parameters<typeof lookupLemma>[0] }
                  | undefined;
                const hit = lookupLemma(lex?.sample ?? [], lookupQ);
                setLookupHit(
                  hit
                    ? `${hit.lemma}: ${hit.senses[0]?.glosses.join("; ") ?? ""}`
                    : "no hit",
                );
              });
            }}
          >
            Look up
          </button>
        </div>
        {lookupHit ? (
          <p style={{ fontSize: 12, marginTop: 6 }}>{lookupHit}</p>
        ) : null}
      </section>

      <hr
        style={{
          border: 0,
          borderTop: `1px solid ${colors.mutedSlate}`,
          margin: "14px 0",
          opacity: 0.35,
        }}
      />
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 13,
          cursor: "pointer",
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
        Allow LRCLIB lyrics fetch (attributed, clearable)
      </label>
      <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          style={secondaryBtn}
          onClick={() => fileRef.current?.click()}
        >
          Import LRC / TTML
        </button>
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
              setJob(`import-${format}`);
              chrome.runtime.sendMessage({
                type: "lyrics.import-lrc",
                format,
                content,
              });
            };
            reader.readAsText(file);
          }}
        />
        <button
          type="button"
          style={secondaryBtn}
          disabled={!lyricsNet}
          onClick={() => {
            setJob("lrclib");
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
                    chrome.tabs.sendMessage(tabs[0]!.id!, {
                      type: "lyrics.apply-lrc",
                      lrc: res.result.lrc,
                    });
                    setJob("lrclib-ok");
                  } else {
                    setJob(res?.error ?? "lrclib-failed");
                  }
                },
              );
            });
          }}
        >
          Fetch LRCLIB
        </button>
      </div>
    </div>
  );
}

const sectionStyle: React.CSSProperties = {
  marginTop: 14,
  paddingTop: 10,
  borderTop: `1px solid color-mix(in srgb, ${colors.mutedSlate} 35%, transparent)`,
};

const h2: React.CSSProperties = {
  fontSize: 14,
  margin: "0 0 6px",
  fontWeight: 600,
};

const primaryBtn: React.CSSProperties = {
  background: colors.signalBlue,
  color: colors.paper,
  border: 0,
  padding: "8px 12px",
  minHeight: 24,
  cursor: "pointer",
};

const secondaryBtn: React.CSSProperties = {
  background: "transparent",
  color: colors.ink,
  border: `1px solid ${colors.mutedSlate}`,
  padding: "8px 12px",
  cursor: "pointer",
};

const root = document.getElementById("root");
if (root) createRoot(root).render(<Popup />);
