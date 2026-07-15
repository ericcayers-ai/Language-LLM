import type { Cue } from "./types.js";

export function cueDurationMs(cue: Pick<Cue, "startMs" | "endMs">): number {
  return Math.max(0, cue.endMs - cue.startMs);
}

/** Characters per second for readability QC (Netflix-ish guidance input). */
export function charactersPerSecond(
  cue: Pick<Cue, "startMs" | "endMs" | "text">,
): number {
  const durationSec = cueDurationMs(cue) / 1000;
  if (durationSec <= 0) return Number.POSITIVE_INFINITY;
  return cue.text.length / durationSec;
}

export function cuesOverlap(
  a: Pick<Cue, "startMs" | "endMs">,
  b: Pick<Cue, "startMs" | "endMs">,
): boolean {
  return a.startMs < b.endMs && b.startMs < a.endMs;
}

export function overlapMs(
  a: Pick<Cue, "startMs" | "endMs">,
  b: Pick<Cue, "startMs" | "endMs">,
): number {
  const start = Math.max(a.startMs, b.startMs);
  const end = Math.min(a.endMs, b.endMs);
  return Math.max(0, end - start);
}

export function clampCueTiming<T extends Pick<Cue, "startMs" | "endMs">>(
  cue: T,
  options: { minDurationMs?: number; maxDurationMs?: number; timelineEndMs?: number } = {},
): T {
  const minDuration = options.minDurationMs ?? 200;
  const maxDuration = options.maxDurationMs ?? 7000;
  let startMs = Math.max(0, cue.startMs);
  let endMs = Math.max(startMs + minDuration, cue.endMs);

  if (options.timelineEndMs !== undefined) {
    endMs = Math.min(endMs, options.timelineEndMs);
    startMs = Math.min(startMs, Math.max(0, options.timelineEndMs - minDuration));
    endMs = Math.max(startMs + minDuration, endMs);
  }

  if (endMs - startMs > maxDuration) {
    endMs = startMs + maxDuration;
  }

  return { ...cue, startMs, endMs };
}

/**
 * Merge overlapping/adjacent cues when gaps are within `maxGapMs`.
 * Preserves first cue id/provenance and concatenates text with a space.
 */
export function mergeAdjacentCues(
  cues: Cue[],
  maxGapMs = 80,
): Cue[] {
  if (cues.length === 0) return [];
  const sorted = [...cues].sort((a, b) => a.startMs - b.startMs);
  const first = sorted[0];
  if (!first) return [];

  const out: Cue[] = [];
  let current: Cue = { ...first };

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i];
    if (!next) continue;
    const gap = next.startMs - current.endMs;
    if (gap <= maxGapMs) {
      const speaker = current.speaker ?? next.speaker;
      current = {
        ...current,
        endMs: Math.max(current.endMs, next.endMs),
        text: `${current.text} ${next.text}`.replace(/\s+/g, " ").trim(),
        ...(speaker !== undefined ? { speaker } : {}),
      };
    } else {
      out.push(current);
      current = { ...next };
    }
  }
  out.push(current);
  return out;
}

/** Find cues active at a playback position. */
export function cuesAtTime(cues: Cue[], timeMs: number): Cue[] {
  return cues.filter((c) => c.startMs <= timeMs && timeMs < c.endMs);
}

export function shiftCue<T extends Pick<Cue, "startMs" | "endMs">>(
  cue: T,
  deltaMs: number,
): T {
  return {
    ...cue,
    startMs: Math.max(0, cue.startMs + deltaMs),
    endMs: Math.max(0, cue.endMs + deltaMs),
  };
}

/** Sync-drift between two aligned cue lists (mean |Δstart| + |Δend|)/2. */
export function meanSyncDriftMs(
  reference: Array<Pick<Cue, "startMs" | "endMs">>,
  hypothesized: Array<Pick<Cue, "startMs" | "endMs">>,
): number {
  const n = Math.min(reference.length, hypothesized.length);
  if (n === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const ref = reference[i]!;
    const hyp = hypothesized[i]!;
    sum += (Math.abs(ref.startMs - hyp.startMs) + Math.abs(ref.endMs - hyp.endMs)) / 2;
  }
  return sum / n;
}
