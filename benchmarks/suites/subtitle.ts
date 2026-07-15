import {
  meanMidpointDriftMs,
  syncWithinBudget,
  type SyncCue,
} from "../src/metrics.js";
import { charactersPerSecond } from "@language-llm/protocol";

export interface SubtitleSample {
  id: string;
  reference: SyncCue[];
  hypothesis: SyncCue[];
  texts?: string[];
}

export interface SubtitleEvalReport {
  suite: "subtitle";
  sampleCount: number;
  meanDriftMs: number;
  within100msRate: number;
  meanCps?: number;
  durationViolations: number;
}

export function evaluateSubtitleSamples(
  samples: SubtitleSample[],
): SubtitleEvalReport {
  if (samples.length === 0) {
    return {
      suite: "subtitle",
      sampleCount: 0,
      meanDriftMs: 0,
      within100msRate: 1,
      durationViolations: 0,
    };
  }

  let driftSum = 0;
  let withinSum = 0;
  let cpsSum = 0;
  let cpsCount = 0;
  let durationViolations = 0;

  for (const sample of samples) {
    driftSum += meanMidpointDriftMs(sample.reference, sample.hypothesis);
    withinSum += syncWithinBudget(sample.reference, sample.hypothesis, 100);

    const cues = sample.hypothesis;
    for (let i = 0; i < cues.length; i++) {
      const cue = cues[i]!;
      const dur = cue.endMs - cue.startMs;
      if (dur < 200 || dur > 7000) durationViolations += 1;
      const text = sample.texts?.[i];
      if (text) {
        cpsSum += charactersPerSecond({
          startMs: cue.startMs,
          endMs: cue.endMs,
          text,
        });
        cpsCount += 1;
      }
    }
  }

  return {
    suite: "subtitle",
    sampleCount: samples.length,
    meanDriftMs: driftSum / samples.length,
    within100msRate: withinSum / samples.length,
    ...(cpsCount > 0 ? { meanCps: cpsSum / cpsCount } : {}),
    durationViolations,
  };
}

/**
 * Synthetic sync-drift metric smoke only — not release-quality timing evidence.
 * Classification: fixture-metric-smoke.
 */
export function runSubtitleSyntheticMetricSmoke(): SubtitleEvalReport {
  return evaluateSubtitleSamples([
    {
      id: "sync-1",
      reference: [
        { startMs: 0, endMs: 1000 },
        { startMs: 1200, endMs: 2200 },
      ],
      hypothesis: [
        { startMs: 40, endMs: 1040 },
        { startMs: 1180, endMs: 2180 },
      ],
      texts: ["Hello there", "Second line of dialogue"],
    },
  ]);
}

/** @deprecated Alias — prefer runSubtitleSyntheticMetricSmoke. */
export function runSubtitleHarnessFixture(): SubtitleEvalReport {
  return runSubtitleSyntheticMetricSmoke();
}
