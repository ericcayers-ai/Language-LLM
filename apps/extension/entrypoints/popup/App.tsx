import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Button,
  DensityProvider,
  EmptyState,
  ProfilePicker,
  StatusRegion,
  useDensity,
  type StatusTone,
} from "@language-llm/ui";
import "@language-llm/ui/tokens.css";
import {
  pingCompanion,
  setRetention,
  wipePrivacy,
  type RetentionPreset,
} from "../../features/companion/runtime";

const PAGE_ORIGINS = ["http://*/*", "https://*/*"] as const;

type CompanionUi = "unknown" | "ready" | "degraded" | "down";

function PopupInner() {
  const { profile, setProfile } = useDensity();
  const [companion, setCompanion] = useState<CompanionUi>("unknown");
  const [pagePerm, setPagePerm] = useState(false);
  const [status, setStatus] = useState<{ message: string; tone: StatusTone }>(
    { message: "", tone: "info" },
  );
  const [tabTitle, setTabTitle] = useState("");
  const [retention, setRetentionState] = useState<RetentionPreset>("days7");

  useEffect(() => {
    void pingCompanion()
      .then((ping) => {
        if (ping.ready) setCompanion("ready");
        else if (ping.degraded) setCompanion("degraded");
        else setCompanion("down");
      })
      .catch(() => setCompanion("down"));
    chrome.permissions.contains({ origins: [...PAGE_ORIGINS] }, (granted) => {
      setPagePerm(Boolean(granted));
    });
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      setTabTitle(tabs[0]?.title ?? "");
    });
  }, []);

  const openSidePanel = () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab?.windowId) return;
      const sidePanel = (
        chrome as typeof chrome & {
          sidePanel?: {
            open: (opts: { windowId: number }) => Promise<void>;
          };
        }
      ).sidePanel;
      if (sidePanel?.open) {
        void sidePanel.open({ windowId: tab.windowId });
        setStatus({ message: "Side panel opened", tone: "success" });
      } else {
        setStatus({
          message: "Side panel API unavailable in this browser",
          tone: "error",
        });
      }
    });
  };

  return (
    <div
      style={{
        width: 340,
        padding: 14,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        boxSizing: "border-box",
      }}
    >
      <header>
        <h1 style={{ fontSize: 17, margin: 0 }}>Language-LLM</h1>
        <p style={{ margin: "4px 0 0", fontSize: 12, opacity: 0.75 }}>
          Launcher for the current tab
        </p>
        {tabTitle ? (
          <p
            style={{
              margin: "6px 0 0",
              fontSize: 11,
              opacity: 0.65,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={tabTitle}
          >
            {tabTitle}
          </p>
        ) : null}
      </header>

      {companion === "down" ? (
        <EmptyState
          kind="no-companion"
          actions={[
            {
              id: "retry",
              label: "Retry",
              onClick: () => {
                void pingCompanion().then((ping) => {
                  if (ping.ready) setCompanion("ready");
                  else if (ping.degraded) setCompanion("degraded");
                  else setCompanion("down");
                });
              },
            },
          ]}
        />
      ) : companion === "degraded" ? (
        <StatusRegion
          message="Companion degraded (native only) — open side panel for recovery"
          tone="warn"
        />
      ) : (
        <StatusRegion
          message={
            companion === "ready" ? "Companion ready" : "Checking companion…"
          }
          tone={companion === "ready" ? "success" : "info"}
        />
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <Button
          variant="primary"
          onClick={() => {
            chrome.permissions.request(
              { origins: [...PAGE_ORIGINS] },
              (granted) => {
                setPagePerm(Boolean(granted));
                if (!granted) {
                  setStatus({ message: "Host permission denied", tone: "error" });
                  return;
                }
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
                    setStatus({ message: "Page translate started", tone: "success" });
                  },
                );
              },
            );
          }}
        >
          Translate page
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
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
                setStatus({ message: "Tab transcription requested", tone: "success" });
              }
            });
          }}
        >
          Transcribe tab
        </Button>
        <Button variant="ghost" onClick={openSidePanel}>
          Open side panel
        </Button>
      </div>

      <section aria-label="Website translate permission">
        <p style={{ fontSize: 12, margin: "0 0 6px", opacity: 0.8 }}>
          Website hosts:{" "}
          <strong>{pagePerm ? "granted" : "not granted"}</strong>
        </p>
        {pagePerm ? (
          <Button
            variant="ghost"
            onClick={() => {
              chrome.permissions.remove(
                { origins: [...PAGE_ORIGINS] },
                (removed) => {
                  setPagePerm(!removed);
                  setStatus(
                    removed
                      ? { message: "Permission revoked", tone: "success" }
                      : { message: "Still granted", tone: "info" },
                  );
                },
              );
            }}
          >
            Revoke host permission
          </Button>
        ) : (
          <Button
            variant="ghost"
            onClick={() => {
              chrome.permissions.request(
                { origins: [...PAGE_ORIGINS] },
                (granted) => {
                  setPagePerm(Boolean(granted));
                  setStatus(
                    granted
                      ? { message: "Host permission granted", tone: "success" }
                      : { message: "Permission denied", tone: "error" },
                  );
                },
              );
            }}
          >
            Grant host permission
          </Button>
        )}
      </section>

      {profile !== "focus" ? (
        <section aria-label="Quick privacy">
          <p style={{ fontSize: 12, margin: "0 0 6px", opacity: 0.8 }}>
            Retention:{" "}
            <select
              value={retention}
              aria-label="Retention preset"
              onChange={(e) => {
                const preset = e.target.value as RetentionPreset;
                setRetentionState(preset);
                void setRetention(preset).then((res) => {
                  setStatus(
                    res.ok
                      ? { message: `Retention → ${preset}`, tone: "success" }
                      : { message: res.error ?? "Retention failed", tone: "error" },
                  );
                });
              }}
            >
              <option value="session">session</option>
              <option value="days7">7 days</option>
              <option value="days30">30 days</option>
              <option value="keep">keep</option>
            </select>
          </p>
          <Button
            variant="ghost"
            onClick={() => {
              if (
                !window.confirm(
                  "Wipe all companion-stored data (transcripts, study, dictionaries)?",
                )
              ) {
                return;
              }
              void wipePrivacy("all").then((res) => {
                setStatus(
                  res.ok
                    ? { message: "Privacy wipe completed", tone: "success" }
                    : { message: res.error ?? "Wipe failed", tone: "error" },
                );
              });
            }}
          >
            Privacy wipe…
          </Button>
        </section>
      ) : null}

      <ProfilePicker value={profile} onChange={setProfile} compact />

      {status.message ? (
        <StatusRegion message={status.message} tone={status.tone} />
      ) : null}

      <p style={{ fontSize: 11, margin: 0, opacity: 0.65 }}>
        Reviews, dictionaries, and lyrics live in the side panel.
        {profile === "focus" ? " Focus mode hides nonessential chrome." : ""}
      </p>
    </div>
  );
}

function Popup() {
  return (
    <DensityProvider persist>
      <PopupInner />
    </DensityProvider>
  );
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<Popup />);
