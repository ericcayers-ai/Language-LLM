import { findGraphemeSpan, type GraphemeSpan } from "../graphemes.js";

export interface PinyinAnnotation {
  span: GraphemeSpan;
  pinyin: string;
}

/** Numbered pinyin → tone-marked approximation for display hooks. */
const TONE_MAP: Record<string, string[]> = {
  a: ["a", "ā", "á", "ǎ", "à"],
  e: ["e", "ē", "é", "ě", "è"],
  i: ["i", "ī", "í", "ǐ", "ì"],
  o: ["o", "ō", "ó", "ǒ", "ò"],
  u: ["u", "ū", "ú", "ǔ", "ù"],
  v: ["ü", "ǖ", "ǘ", "ǚ", "ǜ"],
  ü: ["ü", "ǖ", "ǘ", "ǚ", "ǜ"],
};

export function numberedToToneMarked(syllable: string): string {
  const m = /^([a-züv]+)([1-5])$/i.exec(syllable.trim());
  if (!m) return syllable;
  const base = m[1]!.toLowerCase().replace(/v/g, "ü");
  const tone = Number(m[2]);
  if (tone === 5) return base;

  const order = ["a", "o", "e", "i", "u", "ü"] as const;
  for (const vowel of order) {
    const idx = base.indexOf(vowel);
    if (idx === -1) continue;
    const tones = TONE_MAP[vowel];
    if (!tones) continue;
    const marked = tones[tone] ?? vowel;
    return base.slice(0, idx) + marked + base.slice(idx + vowel.length);
  }
  return base;
}

export function attachPinyin(
  text: string,
  surface: string,
  pinyinNumbered: string,
): PinyinAnnotation | null {
  const span = findGraphemeSpan(text, surface);
  if (!span) return null;
  const marked = pinyinNumbered
    .split(/\s+/)
    .map(numberedToToneMarked)
    .join(" ");
  return { span, pinyin: marked };
}
