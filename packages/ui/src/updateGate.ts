/**
 * Gate overlay React re-renders so RAF caption ticks do not thrash the DOM
 * or aria-live regions at 60fps.
 */

export interface OverlayVisualKey {
  sourceId?: string;
  translationText?: string;
  showSource: boolean;
  showTranslation: boolean;
  blurTranslation: boolean;
  provenance?: string;
  confidence?: number;
  evidenceSummary?: string;
  karaokeActive?: boolean;
  emptyKind?: string;
  jobState?: string;
  density?: string;
  statusMessage?: string;
  confirmActionId?: string;
}

export function overlayStateKey(state: OverlayVisualKey): string {
  return [
    state.sourceId ?? "",
    state.translationText ?? "",
    state.showSource ? "1" : "0",
    state.showTranslation ? "1" : "0",
    state.blurTranslation ? "1" : "0",
    state.provenance ?? "",
    state.confidence?.toFixed(2) ?? "",
    state.evidenceSummary ?? "",
    state.karaokeActive ? "1" : "0",
    state.emptyKind ?? "",
    state.jobState ?? "",
    state.density ?? "",
    state.statusMessage ?? "",
    state.confirmActionId ?? "",
  ].join("|");
}

export function shouldUpdateOverlay(
  prev: OverlayVisualKey | null,
  next: OverlayVisualKey,
): boolean {
  if (!prev) return true;
  return overlayStateKey(prev) !== overlayStateKey(next);
}
