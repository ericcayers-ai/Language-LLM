/** Shared metric helpers used by evaluation suites. */

export function normalizeWhitespace(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

export function tokenizeWords(text: string): string[] {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return [];
  return normalized.split(" ");
}

/** Levenshtein edit distance over token sequences. */
export function editDistance(a: string[], b: string[]): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp: number[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => 0),
  );

  for (let i = 0; i < rows; i++) dp[i]![0] = i;
  for (let j = 0; j < cols; j++) dp[0]![j] = j;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + cost,
      );
    }
  }
  return dp[a.length]![b.length]!;
}

/**
 * Word Error Rate = (S + D + I) / N over word tokens.
 * Returns 0 for empty reference when hypothesis is also empty; otherwise 1 if ref empty.
 */
export function wordErrorRate(reference: string, hypothesis: string): number {
  const ref = tokenizeWords(reference);
  const hyp = tokenizeWords(hypothesis);
  if (ref.length === 0) return hyp.length === 0 ? 0 : 1;
  return editDistance(ref, hyp) / ref.length;
}

/** Character n-gram F-score approximation (chrF) without β weighting extras. */
export function chrF(reference: string, hypothesis: string, n = 6): number {
  const ref = normalizeWhitespace(reference).replace(/ /g, "");
  const hyp = normalizeWhitespace(hypothesis).replace(/ /g, "");
  if (ref.length === 0 && hyp.length === 0) return 1;
  if (ref.length === 0 || hyp.length === 0) return 0;

  let precisionSum = 0;
  let recallSum = 0;
  let used = 0;

  for (let order = 1; order <= n; order++) {
    const refGrams = ngrams(ref, order);
    const hypGrams = ngrams(hyp, order);
    if (refGrams.size === 0 && hypGrams.size === 0) continue;
    used += 1;
    const overlap = intersectCount(refGrams, hypGrams);
    const hypTotal = totalCount(hypGrams);
    const refTotal = totalCount(refGrams);
    precisionSum += hypTotal === 0 ? 0 : overlap / hypTotal;
    recallSum += refTotal === 0 ? 0 : overlap / refTotal;
  }

  if (used === 0) return 0;
  const precision = precisionSum / used;
  const recall = recallSum / used;
  if (precision + recall === 0) return 0;
  return (2 * precision * recall) / (precision + recall);
}

function ngrams(text: string, n: number): Map<string, number> {
  const map = new Map<string, number>();
  if (text.length < n) return map;
  for (let i = 0; i <= text.length - n; i++) {
    const g = text.slice(i, i + n);
    map.set(g, (map.get(g) ?? 0) + 1);
  }
  return map;
}

function totalCount(map: Map<string, number>): number {
  let n = 0;
  for (const v of map.values()) n += v;
  return n;
}

function intersectCount(a: Map<string, number>, b: Map<string, number>): number {
  let n = 0;
  for (const [k, av] of a) {
    const bv = b.get(k);
    if (bv !== undefined) n += Math.min(av, bv);
  }
  return n;
}

export interface SyncCue {
  startMs: number;
  endMs: number;
}

/** Mean absolute midpoint drift between aligned cue lists. */
export function meanMidpointDriftMs(reference: SyncCue[], hypothesis: SyncCue[]): number {
  const n = Math.min(reference.length, hypothesis.length);
  if (n === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const ref = reference[i]!;
    const hyp = hypothesis[i]!;
    const refMid = (ref.startMs + ref.endMs) / 2;
    const hypMid = (hyp.startMs + hyp.endMs) / 2;
    sum += Math.abs(refMid - hypMid);
  }
  return sum / n;
}

/** Fraction of cue pairs with midpoint drift under threshold. */
export function syncWithinBudget(
  reference: SyncCue[],
  hypothesis: SyncCue[],
  budgetMs: number,
): number {
  const n = Math.min(reference.length, hypothesis.length);
  if (n === 0) return 1;
  let ok = 0;
  for (let i = 0; i < n; i++) {
    const ref = reference[i]!;
    const hyp = hypothesis[i]!;
    const drift = Math.abs(
      (ref.startMs + ref.endMs) / 2 - (hyp.startMs + hyp.endMs) / 2,
    );
    if (drift <= budgetMs) ok += 1;
  }
  return ok / n;
}
