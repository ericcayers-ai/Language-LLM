import { findGraphemeSpan, type GraphemeSpan } from "../graphemes.js";

export interface HangulAnnotation {
  span: GraphemeSpan;
  romanization: string;
}

/**
 * Minimal Revised Romanization hook for single Hangul syllables.
 * Full morphological analysis belongs in a later dictionary layer.
 */
const INITIALS = [
  "g", "kk", "n", "d", "tt", "r", "m", "b", "pp", "s", "ss", "", "j", "jj", "ch", "k", "t", "p", "h",
];
const MEDIALS = [
  "a", "ae", "ya", "yae", "eo", "e", "yeo", "ye", "o", "wa", "wae", "oe", "yo", "u", "wo", "we", "wi", "yu", "eu", "ui", "i",
];
const FINALS = [
  "", "k", "k", "k", "n", "n", "n", "t", "l", "l", "l", "l", "l", "l", "l", "l", "m", "p", "p", "t", "t", "ng", "t", "t", "k", "t", "p", "t",
];

export function romanizeHangulSyllable(ch: string): string | null {
  const code = ch.codePointAt(0);
  if (code === undefined || code < 0xac00 || code > 0xd7a3) return null;
  const s = code - 0xac00;
  const initial = Math.floor(s / 588);
  const medial = Math.floor((s % 588) / 28);
  const final = s % 28;
  return `${INITIALS[initial] ?? ""}${MEDIALS[medial] ?? ""}${FINALS[final] ?? ""}`;
}

export function romanizeHangulText(text: string): string {
  let out = "";
  for (const ch of text) {
    out += romanizeHangulSyllable(ch) ?? ch;
  }
  return out;
}

export function attachHangulRomanization(
  text: string,
  surface: string,
): HangulAnnotation | null {
  const span = findGraphemeSpan(text, surface);
  if (!span) return null;
  return { span, romanization: romanizeHangulText(surface) };
}

export function isHangulSyllable(ch: string): boolean {
  const code = ch.codePointAt(0);
  return code !== undefined && code >= 0xac00 && code <= 0xd7a3;
}
