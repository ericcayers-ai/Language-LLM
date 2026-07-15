import React from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  DEFAULT_DENSITY,
  injectTokenStyles,
  isDensityProfile,
  shouldUpdateOverlay,
  type DensityProfile,
  type OverlayVisualKey,
} from "@language-llm/ui";
import { OverlayApp, announcementForCues } from "./OverlayApp";
import {
  applyOverlayPatch,
  type OverlayCallbacks,
  type OverlayState,
  type OverlayStatePatch,
} from "./types";

export type { OverlayCallbacks, OverlayState, OverlayStatePatch } from "./types";

function toVisualKey(state: OverlayState): OverlayVisualKey {
  const key: OverlayVisualKey = {
    showSource: state.showSource,
    showTranslation: state.showTranslation,
    blurTranslation: state.blurTranslation,
  };
  if (state.sourceCue?.id) key.sourceId = state.sourceCue.id;
  if (state.translationCue?.text) key.translationText = state.translationCue.text;
  if (state.provenance) key.provenance = state.provenance;
  if (state.confidence != null) key.confidence = state.confidence;
  if (state.evidenceSummary) key.evidenceSummary = state.evidenceSummary;
  if (state.karaokeActive != null) key.karaokeActive = state.karaokeActive;
  if (state.emptyKind) key.emptyKind = state.emptyKind;
  if (state.jobState) key.jobState = state.jobState;
  if (state.density) key.density = state.density;
  if (state.statusMessage) key.statusMessage = state.statusMessage;
  if (state.confirmAction?.id) key.confirmActionId = state.confirmAction.id;
  return key;
}

export function mountOverlayHost(
  parent: HTMLElement = document.documentElement,
  callbacks: OverlayCallbacks = {},
): {
  root: ShadowRoot;
  host: HTMLElement;
  update: (state: OverlayStatePatch) => void;
  getState: () => OverlayState;
  destroy: () => void;
} {
  const host = document.createElement("div");
  host.id = "language-llm-overlay-host";
  host.setAttribute("data-llm-overlay", "true");
  host.style.cssText =
    "all:initial;position:fixed;left:0;right:0;bottom:10%;z-index:2147483646;pointer-events:none;";
  parent.appendChild(host);
  const shadow = host.attachShadow({ mode: "open" });
  injectTokenStyles(shadow);

  const mountPoint = document.createElement("div");
  mountPoint.className = "llm-shadow-root";
  shadow.appendChild(mountPoint);

  let state: OverlayState = {
    showSource: true,
    showTranslation: true,
    blurTranslation: false,
    density: DEFAULT_DENSITY,
  };
  let lastKey: OverlayVisualKey | null = null;
  let lastAnnouncedCueId: string | undefined;
  let density: DensityProfile = DEFAULT_DENSITY;
  let reactRoot: Root | null = createRoot(mountPoint);

  const readDensity = () => {
    if (typeof chrome === "undefined" || !chrome.storage?.local) return;
    chrome.storage.local.get("language-llm.density-profile", (v) => {
      if (isDensityProfile(v["language-llm.density-profile"])) {
        density = v["language-llm.density-profile"];
        state = { ...state, density };
        paint(true);
      }
    });
  };
  readDensity();

  if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      const next = changes["language-llm.density-profile"]?.newValue;
      if (isDensityProfile(next)) {
        density = next;
        state = { ...state, density };
        paint(true);
      }
    });
  }

  const paint = (force = false) => {
    const key = toVisualKey(state);
    if (!force && !shouldUpdateOverlay(lastKey, key)) {
      return;
    }
    lastKey = key;

    const cueId = state.sourceCue?.id;
    if (cueId && cueId !== lastAnnouncedCueId) {
      lastAnnouncedCueId = cueId;
      const liveAnnouncement = announcementForCues(
        state.sourceCue,
        state.translationCue,
      );
      if (liveAnnouncement) {
        state = { ...state, liveAnnouncement };
      }
    }

    host.setAttribute("data-llm-density", density);
    reactRoot?.render(
      <OverlayApp
        state={state}
        callbacks={callbacks}
        density={density}
        onStatePatch={(patch) => {
          state = applyOverlayPatch(state, patch);
          paint(true);
        }}
        announce={(message) => {
          state = { ...state, liveAnnouncement: message };
          paint(true);
        }}
      />,
    );
  };

  paint(true);

  return {
    root: shadow,
    host,
    update: (next) => {
      state = applyOverlayPatch(state, next);
      if (next.density && isDensityProfile(next.density)) {
        density = next.density;
      }
      paint(false);
    },
    getState: () => ({ ...state }),
    destroy: () => {
      reactRoot?.unmount();
      reactRoot = null;
      host.remove();
    },
  };
}
