import { wordErrorRate } from "../src/metrics.js";

export interface AsrSample {
  id: string;
  reference: string;
  hypothesis: string;
  language: string;
  durationMs: number;
}

export interface AsrEvalReport {
  suite: "asr";
  sampleCount: number;
  meanWer: number;
  perLanguage: Record<string, { count: number; meanWer: number }>;
  worst: Array<{ id: string; wer: number }>;
}

export function evaluateAsrSamples(samples: AsrSample[]): AsrEvalReport {
  if (samples.length === 0) {
    return {
      suite: "asr",
      sampleCount: 0,
      meanWer: 0,
      perLanguage: {},
      worst: [],
    };
  }

  const scored = samples.map((s) => ({
    ...s,
    wer: wordErrorRate(s.reference, s.hypothesis),
  }));

  const meanWer =
    scored.reduce((acc, s) => acc + s.wer, 0) / scored.length;

  const perLanguage: AsrEvalReport["perLanguage"] = {};
  for (const s of scored) {
    const bucket = perLanguage[s.language] ?? { count: 0, meanWer: 0 };
    const nextCount = bucket.count + 1;
    bucket.meanWer = (bucket.meanWer * bucket.count + s.wer) / nextCount;
    bucket.count = nextCount;
    perLanguage[s.language] = bucket;
  }

  const worst = [...scored]
    .sort((a, b) => b.wer - a.wer)
    .slice(0, 5)
    .map((s) => ({ id: s.id, wer: s.wer }));

  return {
    suite: "asr",
    sampleCount: samples.length,
    meanWer,
    perLanguage,
    worst,
  };
}

/** Harness entry used by CI microbenchmarks before real model adapters land. */
export function runAsrHarnessFixture(): AsrEvalReport {
  return evaluateAsrSamples([
    {
      id: "en-1",
      language: "en",
      durationMs: 2500,
      reference: "the quick brown fox jumps over the lazy dog",
      hypothesis: "the quick brown fox jumped over the lazy dog",
    },
    {
      id: "en-2",
      language: "en",
      durationMs: 1800,
      reference: "local inference stays on device",
      hypothesis: "local inference stays on device",
    },
  ]);
}
