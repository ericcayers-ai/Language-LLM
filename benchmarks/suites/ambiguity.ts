export interface AmbiguityCase {
  id: string;
  cueIds: string[];
  expectedNeedsVlm: boolean;
  modelRequestedVlm: boolean;
  vlmHelped?: boolean;
  confidence: number;
}

export interface AmbiguityEvalReport {
  suite: "ambiguity";
  sampleCount: number;
  precision: number;
  recall: number;
  falsePositiveRate: number;
  helpfulResolutionRate: number;
}

/**
 * Evaluates whether VLM reviews fire only on genuine ambiguities
 * and whether evidence actually resolves them.
 */
export function evaluateAmbiguityCases(
  cases: AmbiguityCase[],
): AmbiguityEvalReport {
  if (cases.length === 0) {
    return {
      suite: "ambiguity",
      sampleCount: 0,
      precision: 1,
      recall: 1,
      falsePositiveRate: 0,
      helpfulResolutionRate: 1,
    };
  }

  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  let helpful = 0;
  let vlmFired = 0;

  for (const c of cases) {
    if (c.expectedNeedsVlm && c.modelRequestedVlm) tp += 1;
    else if (!c.expectedNeedsVlm && c.modelRequestedVlm) fp += 1;
    else if (c.expectedNeedsVlm && !c.modelRequestedVlm) fn += 1;
    else tn += 1;

    if (c.modelRequestedVlm) {
      vlmFired += 1;
      if (c.vlmHelped) helpful += 1;
    }
  }

  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  const falsePositiveRate = fp + tn === 0 ? 0 : fp / (fp + tn);

  return {
    suite: "ambiguity",
    sampleCount: cases.length,
    precision,
    recall,
    falsePositiveRate,
    helpfulResolutionRate: vlmFired === 0 ? 1 : helpful / vlmFired,
  };
}

/**
 * Synthetic VLM-gate ambiguity metric smoke — not release-quality VLM evidence.
 * Classification: fixture-metric-smoke.
 */
export function runAmbiguitySyntheticMetricSmoke(): AmbiguityEvalReport {
  return evaluateAmbiguityCases([
    {
      id: "deixis-1",
      cueIds: ["c1"],
      expectedNeedsVlm: true,
      modelRequestedVlm: true,
      vlmHelped: true,
      confidence: 0.4,
    },
    {
      id: "clear-1",
      cueIds: ["c2"],
      expectedNeedsVlm: false,
      modelRequestedVlm: false,
      confidence: 0.92,
    },
    {
      id: "false-fire",
      cueIds: ["c3"],
      expectedNeedsVlm: false,
      modelRequestedVlm: true,
      vlmHelped: false,
      confidence: 0.55,
    },
  ]);
}

/** @deprecated Alias — prefer runAmbiguitySyntheticMetricSmoke. */
export function runAmbiguityHarnessFixture(): AmbiguityEvalReport {
  return runAmbiguitySyntheticMetricSmoke();
}
