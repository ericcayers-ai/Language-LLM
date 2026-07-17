import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Button,
  DensityProvider,
  EmptyState,
  ProfilePicker,
  StatusRegion,
  useDensity,
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

function companionChip(state: CompanionUi): { className: string; label: string } {
  switch (state) {
    case "ready":
      return { className: "llm-chip llm-chip--ok", label: "Companion ready" };
    case "degraded":
      return {
        className: "llm-chip llm-chip--warn",
        label: "Companion degraded",
      };
    case "down":
      return { className: "llm-chip llm-chip--err", label: "Companion offline" };
    default:
      return { className: "llm-chip", label: "Checking…" };
  }
}

function PopupInner() {
  const { profile, setProfile } = useDensity();
  const [companion, setCompanion] = useState<CompanionUi>("unknown");
  const [pagePerm, setPagePerm] = useState(false);
  const [status, setStatus] = useState("");
  const [tabTitle, setTabTitle] = useState("");
  const [retention, setRetentionState] = useState<RetentionPreset>("days7");

  const refreshCompanion = () => {
    void pingCompanion().then((ping) => {
      if (ping.ready) setCompanion("ready");
      else if (ping.degraded) setCompanion("degraded");
      else setCompanion("down");
    });
  };

  useEffect(() => {
    refreshCompanion();
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
        setStatus("Side panel opened");
      } else {
        setStatus("Side panel API unavailable in this browser");
      }
    });
  };

  const chip = companionChip(companion);

  return (
    <div className="llm-surface popup-shell">
      <header className="popup-header">
        <div className="popup-header__top">
          <h1 className="popup-title">Language-LLM</h1>
          <span className={chip.className}>{chip.label}</span>
        </div>
        {tabTitle ? (
          <p className="popup-tab" title={tabTitle}>
            {tabTitle}
          </p>
        ) : (
          <p className="popup-tab popup-tab--muted">Current tab</p>
        )}
      </header>

      {companion === "down" ? (
        <EmptyState
          kind="no-companion"
          actions={[
            {
              id: "retry",
              label: "Retry",
              onClick: refreshCompanion,
            },
          ]}
        />
      ) : null}

      <section className="popup-actions" aria-label="Quick actions">
        <Button
          variant="primary"
          onClick={() => {
            chrome.permissions.request(
              { origins: [...PAGE_ORIGINS] },
              (granted) => {
                setPagePerm(Boolean(granted));
                if (!granted) {
                  setStatus("Host permission denied");
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
                    setStatus("Page translate started");
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
                setStatus("Tab transcription requested");
              }
            });
          }}
        >
          Transcribe tab
        </Button>
        <Button variant="ghost" onClick={openSidePanel}>
          Open side panel
        </Button>
      </section>

      <section className="popup-perm" aria-label="Website permission">
        <div className="popup-perm__row">
          <span className="llm-meta">Website hosts</span>
          <span className={`llm-chip ${pagePerm ? "llm-chip--ok" : ""}`}>
            {pagePerm ? "Granted" : "Not granted"}
          </span>
        </div>
        <Button
          variant="ghost"
          onClick={() => {
            if (pagePerm) {
              chrome.permissions.remove(
                { origins: [...PAGE_ORIGINS] },
                (removed) => {
                  setPagePerm(!removed);
                  setStatus(removed ? "Permission revoked" : "Still granted");
                },
              );
            } else {
              chrome.permissions.request(
                { origins: [...PAGE_ORIGINS] },
                (granted) => {
                  setPagePerm(Boolean(granted));
                  setStatus(
                    granted ? "Host permission granted" : "Permission denied",
                  );
                },
              );
            }
          }}
        >
          {pagePerm ? "Revoke permission" : "Grant permission"}
        </Button>
      </section>

      {profile !== "focus" ? (
        <details className="popup-more" data-llm-chrome="nonessential">
          <summary>Privacy shortcuts</summary>
          <div className="popup-more__body">
            <label className="llm-field">
              <span>Retention</span>
              <select
                className="llm-select llm-focus-ring"
                value={retention}
                aria-label="Retention preset"
                onChange={(e) => {
                  const preset = e.target.value as RetentionPreset;
                  setRetentionState(preset);
                  void setRetention(preset).then((res) => {
                    setStatus(
                      res.ok
                        ? `Retention → ${preset}`
                        : res.error ?? "Retention failed",
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
                      ? "Privacy wipe completed"
                      : res.error ?? "Wipe failed",
                  );
                });
              }}
            >
              Privacy wipe…
            </Button>
          </div>
        </details>
      ) : null}

      <ProfilePicker value={profile} onChange={setProfile} compact />

      {status ? <StatusRegion message={status} tone="info" /> : null}

      <p className="popup-footer">
        Transcript, learning, dictionaries, and lyrics live in the side panel.
      </p>

      <style>{`
        .popup-shell {
          width: 340px;
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          box-sizing: border-box;
        }
        .popup-header__top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        .popup-title {
          font-size: 1.05rem;
          margin: 0;
          font-weight: 750;
          letter-spacing: -0.02em;
        }
        .popup-tab {
          margin: 6px 0 0;
          font-size: 0.75rem;
          color: var(--llm-ink-secondary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .popup-tab--muted { color: var(--llm-muted-slate); }
        .popup-actions {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .popup-actions .llm-btn { width: 100%; }
        .popup-perm {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding-top: 4px;
          border-top: 1px solid var(--llm-border);
        }
        .popup-perm__row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        .popup-more {
          border: 1px solid var(--llm-border);
          border-radius: var(--llm-radius);
          padding: 0.35rem 0.55rem;
        }
        .popup-more summary {
          cursor: pointer;
          font-size: 0.8125rem;
          font-weight: 600;
          color: var(--llm-ink-secondary);
          padding: 0.25rem 0;
        }
        .popup-more__body {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding: 0.5rem 0 0.35rem;
        }
        .popup-footer {
          font-size: 0.6875rem;
          margin: 0;
          color: var(--llm-muted-slate);
          line-height: 1.4;
        }
      `}</style>
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
