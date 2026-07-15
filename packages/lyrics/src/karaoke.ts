import type { Cue } from "@language-llm/protocol";

export interface KaraokeState {
  activeCueId: string | null;
  activeIndex: number;
  previousId: string | null;
  nextId: string | null;
}

/**
 * Find the active lyrics cue at media time. Never fabricates mid-line words.
 */
export function karaokeAt(
  cues: Cue[],
  timeMs: number,
): KaraokeState {
  if (!cues.length) {
    return {
      activeCueId: null,
      activeIndex: -1,
      previousId: null,
      nextId: null,
    };
  }
  let activeIndex = -1;
  for (let i = 0; i < cues.length; i++) {
    const c = cues[i]!;
    if (timeMs >= c.startMs && timeMs < c.endMs) {
      activeIndex = i;
      break;
    }
    if (timeMs >= c.startMs) activeIndex = i;
  }
  if (activeIndex < 0) {
    return {
      activeCueId: null,
      activeIndex: -1,
      previousId: null,
      nextId: cues[0]?.id ?? null,
    };
  }
  return {
    activeCueId: cues[activeIndex]!.id,
    activeIndex,
    previousId: cues[activeIndex - 1]?.id ?? null,
    nextId: cues[activeIndex + 1]?.id ?? null,
  };
}

export function syncDriftMs(
  expectedStartMs: number,
  actualStartMs: number,
): number {
  return Math.abs(expectedStartMs - actualStartMs);
}
