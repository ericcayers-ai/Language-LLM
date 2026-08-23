/**
 * Lightweight difficulty predictor for subtitle/segment text.
 *
 * Input:
 *   - knownWords: lowercase set of surfaces the learner already knows
 *   - tokens:    ordered tokens extracted from the subtitle (whitespace + punctuation split)
 *
 * Output: integer in [1, 10]. 1 = everything known; 10 = nothing known.
 *
 * Strategy:
 *   1. Compute the unknown ratio (unknownTokens / totalTokens, defaulting to 1 when no tokens).
 *   2. Map that ratio to [1, 10] using a mild concave curve so a 50/50 sentence
 *      sits around 5-6 (matching the "half-known, half-unknown" mid-range feeling
 *      learners report in tools like Migaku).
 *
 * Pure function — no LLM, no network. Designed to run on every subtitle update.
 */
export function predictDifficulty(
  knownWords: Set<string>,
  tokens: string[],
): number {
  if (tokens.length === 0) return 1;

  let unknown = 0;
  for (const token of tokens) {
    if (!knownWords.has(token.toLowerCase())) unknown += 1;
  }

  const ratio = unknown / tokens.length;
  const scaled = 1 + 9 * Math.pow(ratio, 0.85);
  const score = Math.round(scaled);
  return Math.min(10, Math.max(1, score));
}

/**
 * Split free-form text into word-like surfaces (whitespace + Unicode punctuation).
 * Exported so caption/subtitle helpers can tokenize without re-implementing.
 */
export function tokenizeSurfaces(text: string): string[] {
  return text
    .split(/[\s\p{P}]+/u)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}
