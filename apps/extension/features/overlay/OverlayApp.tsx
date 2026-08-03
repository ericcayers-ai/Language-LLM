import React, { useEffect, useRef } from "react";
import {
  CaptionOverlay,
  EmptyState,
  EvidenceGutter,
  StatusRegion,
  Button,
  type DensityProfile,
  type EmptyStateKind,
} from "@language-llm/ui";
import type { Cue } from "@language-llm/protocol";
import {
  mapOverlayShortcut,
  OVERLAY_SHORTCUT_HELP,
  type OverlayShortcutAction,
} from "./shortcuts";
import type { OverlayCallbacks, OverlayState, OverlayStatePatch } from "./types";

export interface OverlayAppProps {
  state: OverlayState;
  callbacks: OverlayCallbacks;
  density: DensityProfile;
  onStatePatch: (patch: OverlayStatePatch) => void;
  announce: (message: string) => void;
}

export function OverlayApp({
  state,
  callbacks,
  density,
  onStatePatch,
  announce,
}: OverlayAppProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef(state);
  const callbacksRef = useRef(callbacks);
  const onStatePatchRef = useRef(onStatePatch);
  const announceRef = useRef(announce);
  stateRef.current = state;
  callbacksRef.current = callbacks;
  onStatePatchRef.current = onStatePatch;
  announceRef.current = announce;

  useEffect(() => {
    const applyAction = (action: OverlayShortcutAction) => {
      const s = stateRef.current;
      const cb = callbacksRef.current;
      switch (action.type) {
        case "toggle-source": {
          const showSource = !s.showSource;
          onStatePatchRef.current({ showSource });
          cb.onToggle?.({
            showSource,
            showTranslation: s.showTranslation,
            blurTranslation: s.blurTranslation,
          });
          announceRef.current(
            showSource ? "Source captions shown" : "Source captions hidden",
          );
          break;
        }
        case "toggle-translation": {
          const showTranslation = !s.showTranslation;
          onStatePatchRef.current({ showTranslation });
          cb.onToggle?.({
            showSource: s.showSource,
            showTranslation,
            blurTranslation: s.blurTranslation,
          });
          announceRef.current(
            showTranslation ? "Translation shown" : "Translation hidden",
          );
          break;
        }
        case "reveal-translation": {
          const blurTranslation = !s.blurTranslation;
          onStatePatchRef.current({ blurTranslation });
          cb.onToggle?.({
            showSource: s.showSource,
            showTranslation: s.showTranslation,
            blurTranslation,
          });
          announceRef.current(
            blurTranslation ? "Translation blurred" : "Translation revealed",
          );
          break;
        }
        case "mine-sentence":
          cb.onMine?.({
            ...(s.sourceCue ? { source: s.sourceCue } : {}),
            ...(s.translationCue ? { translation: s.translationCue } : {}),
          });
          announceRef.current("Sentence mined for review");
          break;
        case "mark-known":
          if (s.sourceCue?.text) {
            cb.onMarkKnown?.(s.sourceCue.text);
            announceRef.current("Marked known");
          }
          break;
        case "focus-overlay":
          wrapRef.current?.focus();
          announceRef.current("Caption overlay focused");
          break;
        case "blur-overlay":
          wrapRef.current?.blur();
          announceRef.current("Caption overlay blurred");
          break;
        case "announce-help":
          announceRef.current(OVERLAY_SHORTCUT_HELP);
          break;
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase() ?? "";
      const inEditable =
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        Boolean(target?.isContentEditable);
      const overlayFocused =
        wrapRef.current != null &&
        (wrapRef.current.contains(document.activeElement) ||
          document.activeElement === wrapRef.current);

      const action = mapOverlayShortcut(event.key, {
        inEditable,
        overlayFocused,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
      });
      if (!action) return;
      event.preventDefault();
      event.stopPropagation();
      applyAction(action);
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  const emptyKind: EmptyStateKind | undefined = state.emptyKind;
  const uncertain = state.confidence != null && state.confidence < 0.55;

  return (
    <div
      data-llm-density={density}
      style={{
        pointerEvents: "none",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "0.5rem",
      }}
    >
      <div
        ref={wrapRef}
        tabIndex={0}
        role="group"
        aria-label="Caption overlay, press question mark for keyboard shortcuts"
        style={{ pointerEvents: "auto", outline: "none" }}
        className="llm-focus-ring"
      >
        {emptyKind ? (
          <EmptyState
            kind={emptyKind}
            style={{
              maxWidth: "min(28rem, 92vw)",
              pointerEvents: "auto",
            }}
            actions={emptyActions(emptyKind, callbacks)}
          />
        ) : (
          <CaptionOverlay
            {...(state.sourceCue?.text
              ? { sourceText: state.sourceCue.text }
              : {})}
            {...(state.translationCue?.text
              ? { translationText: state.translationCue.text }
              : {})}
            showSource={state.showSource}
            showTranslation={
              state.showTranslation && Boolean(state.translationCue)
            }
            blurTranslation={state.blurTranslation}
            uncertain={uncertain}
            karaokeActive={Boolean(state.karaokeActive)}
            {...(state.provenance ? { provenance: state.provenance } : {})}
            {...(state.confidence != null
              ? { confidence: state.confidence }
              : {})}
            liveRegion={false}
            {...(state.evidenceSummary
              ? {
                  evidenceSlot: (
                    <EvidenceGutter
                      items={[
                        {
                          id: "vlm",
                          label: "Vision evidence",
                          detail: state.evidenceSummary,
                          severity: "warn" as const,
                        },
                      ]}
                      style={{
                        margin: "0 auto",
                        textAlign: "left",
                        maxWidth: "28rem",
                      }}
                    />
                  ),
                }
              : {})}
          />
        )}
      </div>
      {state.statusMessage ? (
        <div
          style={{
            pointerEvents: "auto",
            maxWidth: "min(28rem, 92vw)",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <StatusRegion message={state.statusMessage} tone="info" />
          {state.confirmAction ? (
            <Button
              variant="primary"
              onClick={() => {
                if (state.confirmAction?.id === "confirm-lyrics") {
                  callbacks.onConfirmLyrics?.();
                }
              }}
            >
              {state.confirmAction.label}
            </Button>
          ) : null}
        </div>
      ) : null}
      <div className="llm-sr-only" role="status" aria-live="polite">
        {state.liveAnnouncement ?? ""}
      </div>
    </div>
  );
}

function emptyActions(
  kind: EmptyStateKind,
  callbacks: OverlayCallbacks,
): Array<{ id: string; label: string; onClick: () => void }> {
  switch (kind) {
    case "no-captions":
      return [
        {
          id: "transcribe",
          label: "Transcribe this tab",
          onClick: () => callbacks.onTranscribeTab?.(),
        },
      ];
    case "no-lyrics":
      return [
        {
          id: "confirm-lyrics",
          label: "Confirm lyrics match",
          onClick: () => callbacks.onConfirmLyrics?.(),
        },
        {
          id: "sidepanel",
          label: "Open side panel",
          onClick: () => callbacks.onOpenSidePanel?.(),
        },
      ];
    case "no-companion":
    case "no-model":
    case "model-installing":
      return [
        {
          id: "sidepanel",
          label: "Open side panel",
          onClick: () => callbacks.onOpenSidePanel?.(),
        },
      ];
    default:
      return [];
  }
}

export function announcementForCues(
  source?: Cue,
  translation?: Cue,
): string | undefined {
  if (!source && !translation) return undefined;
  const parts: string[] = [];
  if (source?.text) parts.push(source.text);
  if (translation?.text) parts.push(translation.text);
  return parts.join(" — ");
}
