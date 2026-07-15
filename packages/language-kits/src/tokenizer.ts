/**
 * Word segmentation via Intl.Segmenter — never hand-roll UTF-16 indices.
 */

export interface TokenSpan {
  text: string;
  /** Grapheme start index within the source string. */
  start: number;
  /** Grapheme end index (exclusive). */
  end: number;
  isWordLike: boolean;
}

export function segmentWords(
  text: string,
  locale = "en",
): TokenSpan[] {
  const segmenter = new Intl.Segmenter(locale, { granularity: "word" });
  const graphemeSeg = new Intl.Segmenter(undefined, { granularity: "grapheme" });

  // Build code-unit → grapheme index map without slicing by UTF-16.
  const unitToGrapheme: number[] = [];
  let gIndex = 0;
  for (const { segment } of graphemeSeg.segment(text)) {
    for (let i = 0; i < segment.length; i++) {
      unitToGrapheme.push(gIndex);
    }
    gIndex += 1;
  }
  // Sentinel for end-of-string unit index.
  unitToGrapheme.push(gIndex);

  const tokens: TokenSpan[] = [];
  for (const part of segmenter.segment(text)) {
    const startUnit = part.index;
    const endUnit = part.index + part.segment.length;
    const start = unitToGrapheme[startUnit] ?? 0;
    const end = unitToGrapheme[endUnit] ?? start;
    tokens.push({
      text: part.segment,
      start,
      end,
      isWordLike: part.isWordLike === true,
    });
  }
  return tokens;
}

export function wordLikeTokens(text: string, locale = "en"): TokenSpan[] {
  return segmentWords(text, locale).filter((t) => t.isWordLike);
}
