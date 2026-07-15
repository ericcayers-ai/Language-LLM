import { segmentGraphemes, type GraphemeSpan } from "../graphemes.js";

export interface FuriganaAnnotation {
  /** Surface kanji/kana span in grapheme indices over the source cue. */
  span: GraphemeSpan;
  reading: string;
}

/**
 * Attach furigana by pairing a surface span with a reading.
 * `surface` is matched grapheme-safely within `text`.
 */
export function attachFurigana(
  text: string,
  surface: string,
  reading: string,
): FuriganaAnnotation | null {
  const graphemes = segmentGraphemes(text);
  const needle = segmentGraphemes(surface);
  if (needle.length === 0) return null;

  outer: for (let i = 0; i <= graphemes.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (graphemes[i + j] !== needle[j]) continue outer;
    }
    return {
      span: { start: i, end: i + needle.length },
      reading,
    };
  }
  return null;
}

/** Ruby-style pairs for rendering (base + rt). */
export function toRubyPairs(
  text: string,
  annotations: FuriganaAnnotation[],
): Array<{ base: string; reading?: string }> {
  const sorted = [...annotations].sort((a, b) => a.span.start - b.span.start);
  const graphemes = segmentGraphemes(text);
  const out: Array<{ base: string; reading?: string }> = [];
  let cursor = 0;
  for (const ann of sorted) {
    if (ann.span.start < cursor) continue;
    if (ann.span.start > cursor) {
      out.push({ base: graphemes.slice(cursor, ann.span.start).join("") });
    }
    out.push({
      base: graphemes.slice(ann.span.start, ann.span.end).join(""),
      reading: ann.reading,
    });
    cursor = ann.span.end;
  }
  if (cursor < graphemes.length) {
    out.push({ base: graphemes.slice(cursor).join("") });
  }
  return out;
}

export function isKana(ch: string): boolean {
  return /^[\u3040-\u309F\u30A0-\u30FF\uFF66-\uFF9D]$/u.test(ch);
}

export function isKanji(ch: string): boolean {
  return /^[\u3400-\u9FFF\uF900-\uFAFF]$/u.test(ch);
}
