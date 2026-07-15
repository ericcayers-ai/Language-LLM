import type { Cue } from "@language-llm/protocol";
import { colors, fonts } from "@language-llm/ui";
import {
  mapOverlayShortcut,
  OVERLAY_SHORTCUT_HELP,
  type OverlayShortcutAction,
} from "./shortcuts";

export interface OverlayState {
  sourceCue?: Cue;
  translationCue?: Cue;
  showSource: boolean;
  showTranslation: boolean;
  blurTranslation: boolean;
  confidence?: number;
  provenance?: string;
  karaokeActive?: boolean;
  /** Amber evidence gutter (VLM / fidelity). */
  evidenceSummary?: string;
  liveAnnouncement?: string;
}

export interface OverlayCallbacks {
  onMine?: (cues: { source?: Cue; translation?: Cue }) => void;
  onMarkKnown?: (surface: string) => void;
  onToggle?: (flags: {
    showSource: boolean;
    showTranslation: boolean;
    blurTranslation: boolean;
  }) => void;
}

export function mountOverlayHost(
  parent: HTMLElement = document.documentElement,
  callbacks: OverlayCallbacks = {},
): {
  root: ShadowRoot;
  host: HTMLElement;
  update: (state: OverlayState) => void;
  getState: () => OverlayState;
  destroy: () => void;
} {
  const host = document.createElement("div");
  host.id = "language-llm-overlay-host";
  host.setAttribute("data-llm-overlay", "true");
  host.style.cssText =
    "all:initial;position:fixed;left:0;right:0;bottom:12%;z-index:2147483646;pointer-events:none;";
  parent.appendChild(host);
  const root = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; }
    .ribbon {
      font-family: ${fonts.ui};
      color: ${colors.paper};
      text-align: center;
      max-width: min(920px, 92vw);
      margin: 0 auto;
      pointer-events: auto;
      outline: none;
    }
    .ribbon:focus-visible {
      box-shadow: 0 0 0 3px color-mix(in srgb, ${colors.signalBlue} 55%, transparent);
      border-radius: 6px;
    }
    .cue {
      background: color-mix(in srgb, ${colors.ink} 78%, transparent);
      padding: 0.55rem 0.9rem;
      border-radius: 4px;
      line-height: 1.35;
      font-size: clamp(1rem, 2.1vw, 1.35rem);
      box-shadow: 0 1px 0 color-mix(in srgb, ${colors.signalBlue} 35%, transparent);
    }
    .cue.blurred .translation { filter: blur(6px); user-select: none; }
    .meta {
      margin-top: 0.25rem;
      font-size: 0.75rem;
      color: ${colors.mutedSlate};
      font-family: ${fonts.mono};
    }
    .evidence {
      margin-top: 0.35rem;
      font-size: 0.75rem;
      color: ${colors.amberEvidence};
      font-family: ${fonts.mono};
      border-left: 2px solid ${colors.amberEvidence};
      padding-left: 0.5rem;
      text-align: left;
      max-width: 28rem;
      margin-left: auto;
      margin-right: auto;
    }
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
    .karaoke { outline: 2px solid ${colors.signalBlue}; }
    .uncertain { color: ${colors.amberEvidence}; }
  `;
  root.appendChild(style);

  const wrap = document.createElement("div");
  wrap.className = "ribbon";
  wrap.setAttribute("role", "region");
  wrap.setAttribute("aria-label", "Language-LLM captions");
  wrap.setAttribute("aria-live", "polite");
  wrap.setAttribute("tabindex", "0");
  root.appendChild(wrap);

  const announce = document.createElement("div");
  announce.className = "sr-only";
  announce.setAttribute("role", "status");
  announce.setAttribute("aria-live", "polite");
  root.appendChild(announce);

  let state: OverlayState = {
    showSource: true,
    showTranslation: true,
    blurTranslation: false,
  };

  const render = () => {
    const parts: string[] = [];
    if (state.showSource && state.sourceCue) {
      parts.push(
        `<div class="cue source" data-llm-source="1">${escapeHtml(state.sourceCue.text)}</div>`,
      );
    }
    if (state.showTranslation && state.translationCue) {
      const blur = state.blurTranslation ? " blurred" : "";
      const karaoke = state.karaokeActive ? " karaoke" : "";
      const uncertain =
        state.confidence != null && state.confidence < 0.55 ? " uncertain" : "";
      parts.push(
        `<div class="cue translation${blur}${karaoke}${uncertain}" data-llm-translation="1">${escapeHtml(state.translationCue.text)}</div>`,
      );
    }
    const meta: string[] = [];
    if (state.provenance) meta.push(state.provenance);
    if (state.confidence != null) meta.push(`conf ${state.confidence.toFixed(2)}`);
    let html =
      parts.join("") +
      (meta.length ? `<div class="meta">${escapeHtml(meta.join(" · "))}</div>` : "");
    if (state.evidenceSummary) {
      html += `<div class="evidence" role="note" aria-label="Vision evidence">${escapeHtml(state.evidenceSummary)}</div>`;
    }
    wrap.innerHTML = html;
    if (state.liveAnnouncement) {
      announce.textContent = state.liveAnnouncement;
    }
  };

  const applyAction = (action: OverlayShortcutAction) => {
    switch (action.type) {
      case "toggle-source":
        state = { ...state, showSource: !state.showSource };
        callbacks.onToggle?.({
          showSource: state.showSource,
          showTranslation: state.showTranslation,
          blurTranslation: state.blurTranslation,
        });
        announce.textContent = state.showSource
          ? "Source captions shown"
          : "Source captions hidden";
        render();
        break;
      case "toggle-translation":
        state = { ...state, showTranslation: !state.showTranslation };
        callbacks.onToggle?.({
          showSource: state.showSource,
          showTranslation: state.showTranslation,
          blurTranslation: state.blurTranslation,
        });
        announce.textContent = state.showTranslation
          ? "Translation shown"
          : "Translation hidden";
        render();
        break;
      case "reveal-translation":
        state = { ...state, blurTranslation: !state.blurTranslation };
        callbacks.onToggle?.({
          showSource: state.showSource,
          showTranslation: state.showTranslation,
          blurTranslation: state.blurTranslation,
        });
        announce.textContent = state.blurTranslation
          ? "Translation blurred"
          : "Translation revealed";
        render();
        break;
      case "mine-sentence":
        callbacks.onMine?.({
          ...(state.sourceCue ? { source: state.sourceCue } : {}),
          ...(state.translationCue ? { translation: state.translationCue } : {}),
        });
        announce.textContent = "Sentence mined for review";
        break;
      case "mark-known":
        if (state.sourceCue?.text) {
          callbacks.onMarkKnown?.(state.sourceCue.text);
          announce.textContent = "Marked known";
        }
        break;
      case "focus-overlay":
        wrap.focus();
        announce.textContent = "Caption overlay focused";
        break;
      case "blur-overlay":
        wrap.blur();
        announce.textContent = "Caption overlay blurred";
        break;
      case "announce-help":
        announce.textContent = OVERLAY_SHORTCUT_HELP;
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
      root.activeElement === wrap || document.activeElement === host;

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

  // Capture phase so Alt chords work even when YouTube player has focus.
  window.addEventListener("keydown", onKeyDown, true);

  const update = (next: OverlayState) => {
    state = { ...state, ...next };
    render();
  };

  return {
    root,
    host,
    update,
    getState: () => ({ ...state }),
    destroy: () => {
      window.removeEventListener("keydown", onKeyDown, true);
      host.remove();
    },
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
