import type { Cue } from "@language-llm/protocol";
import type { DensityProfile, EmptyStateKind } from "@language-llm/ui";

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
  /** Assistive announcement — updated only when meaning changes. */
  liveAnnouncement?: string;
  /** Truthful empty / recovery surface. */
  emptyKind?: EmptyStateKind;
  jobState?: string;
  density?: DensityProfile;
  statusMessage?: string;
  /** Inline recovery action (e.g. confirm caption→lyrics). */
  confirmAction?: { id: string; label: string };
}

/** Patch that can clear optional fields by assigning `null`. */
export type OverlayStatePatch = {
  [K in keyof OverlayState]?: OverlayState[K] | null;
};

export function applyOverlayPatch(
  state: OverlayState,
  patch: OverlayStatePatch,
): OverlayState {
  const next: Record<string, unknown> = { ...state };
  (Object.keys(patch) as Array<keyof OverlayState>).forEach((key) => {
    const value = patch[key];
    if (value === null) {
      delete next[key as string];
    } else if (value !== undefined) {
      next[key as string] = value;
    }
  });
  return next as unknown as OverlayState;
}

export interface OverlayCallbacks {
  onMine?: (cues: { source?: Cue; translation?: Cue }) => void;
  onMarkKnown?: (surface: string) => void;
  onToggle?: (flags: {
    showSource: boolean;
    showTranslation: boolean;
    blurTranslation: boolean;
  }) => void;
  onTranscribeTab?: () => void;
  onOpenSidePanel?: () => void;
  onConfirmLyrics?: () => void;
}

export type { OverlayVisualKey } from "@language-llm/ui";
export { overlayStateKey, shouldUpdateOverlay } from "@language-llm/ui";
