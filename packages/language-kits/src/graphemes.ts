/**
 * Grapheme-safe string operations using Intl.Segmenter.
 * NEVER use UTF-16 code-unit slicing for highlight ranges.
 */

export interface GraphemeSpan {
  /** Inclusive start index in grapheme units. */
  start: number;
  /** Exclusive end index in grapheme units. */
  end: number;
}

export interface GraphemeSlice {
  text: string;
  start: number;
  end: number;
}

function graphemeSegmenter(): Intl.Segmenter {
  return new Intl.Segmenter(undefined, { granularity: "grapheme" });
}

export function segmentGraphemes(text: string): string[] {
  return [...graphemeSegmenter().segment(text)].map((s) => s.segment);
}

export function graphemeLength(text: string): number {
  return segmentGraphemes(text).length;
}

/**
 * Slice by grapheme indices. Safe for emoji, ZWJ sequences, and combining marks.
 */
export function sliceGraphemes(
  text: string,
  start: number,
  end?: number,
): string {
  const graphemes = segmentGraphemes(text);
  const to = end ?? graphemes.length;
  return graphemes.slice(Math.max(0, start), Math.max(0, to)).join("");
}

export function highlightGraphemeRange(
  text: string,
  span: GraphemeSpan,
): { before: string; match: string; after: string } {
  const start = Math.max(0, span.start);
  const end = Math.max(start, span.end);
  return {
    before: sliceGraphemes(text, 0, start),
    match: sliceGraphemes(text, start, end),
    after: sliceGraphemes(text, end),
  };
}

/**
 * Map a byte/code-point unsafe legacy offset pair into grapheme indices
 * by locating the substring that still exists in `text`. Prefer passing
 * grapheme spans directly from tokenizers.
 */
export function findGraphemeSpan(text: string, surface: string): GraphemeSpan | null {
  if (!surface) return null;
  const graphemes = segmentGraphemes(text);
  const needle = segmentGraphemes(surface);
  if (needle.length === 0) return null;

  outer: for (let i = 0; i <= graphemes.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (graphemes[i + j] !== needle[j]) continue outer;
    }
    return { start: i, end: i + needle.length };
  }
  return null;
}

export function splitHighlightSurfaces(
  text: string,
  surfaces: string[],
): GraphemeSlice[] {
  const spans = surfaces
    .map((s) => findGraphemeSpan(text, s))
    .filter((s): s is GraphemeSpan => s !== null)
    .sort((a, b) => a.start - b.start);

  const out: GraphemeSlice[] = [];
  let cursor = 0;
  for (const span of spans) {
    if (span.start < cursor) continue;
    if (span.start > cursor) {
      out.push({
        text: sliceGraphemes(text, cursor, span.start),
        start: cursor,
        end: span.start,
      });
    }
    out.push({
      text: sliceGraphemes(text, span.start, span.end),
      start: span.start,
      end: span.end,
    });
    cursor = span.end;
  }
  if (cursor < graphemeLength(text)) {
    out.push({
      text: sliceGraphemes(text, cursor),
      start: cursor,
      end: graphemeLength(text),
    });
  }
  return out;
}
