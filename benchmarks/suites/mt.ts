import { chrF } from "../src/metrics.js";

export interface MtSample {
  id: string;
  sourceLang: string;
  targetLang: string;
  reference: string;
  hypothesis: string;
}

export interface MtEvalReport {
  suite: "mt";
  sampleCount: number;
  meanChrF: number;
  perPair: Record<string, { count: number; meanChrF: number }>;
}

export function evaluateMtSamples(samples: MtSample[]): MtEvalReport {
  if (samples.length === 0) {
    return { suite: "mt", sampleCount: 0, meanChrF: 0, perPair: {} };
  }

  const scored = samples.map((s) => ({
    ...s,
    score: chrF(s.reference, s.hypothesis),
    pair: `${s.sourceLang}->${s.targetLang}`,
  }));

  const meanChrF =
    scored.reduce((acc, s) => acc + s.score, 0) / scored.length;

  const perPair: MtEvalReport["perPair"] = {};
  for (const s of scored) {
    const bucket = perPair[s.pair] ?? { count: 0, meanChrF: 0 };
    const nextCount = bucket.count + 1;
    bucket.meanChrF =
      (bucket.meanChrF * bucket.count + s.score) / nextCount;
    bucket.count = nextCount;
    perPair[s.pair] = bucket;
  }

  return {
    suite: "mt",
    sampleCount: samples.length,
    meanChrF,
    perPair,
  };
}

export function runMtHarnessFixture(): MtEvalReport {
  return evaluateMtSamples([
    {
      id: "ja-en-1",
      sourceLang: "ja",
      targetLang: "en",
      reference: "I will eat sushi tomorrow",
      hypothesis: "I will eat sushi tomorrow",
    },
    {
      id: "zh-en-1",
      sourceLang: "zh",
      targetLang: "en",
      reference: "China is large",
      hypothesis: "China is big",
    },
  ]);
}
