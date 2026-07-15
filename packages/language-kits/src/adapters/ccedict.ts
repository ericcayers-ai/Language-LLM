import type { LexiconEntry } from "../lexicon.js";

/**
 * Parse a CC-CEDICT line.
 * Format: Traditional Simplified [pin1 yin1] /gloss 1/gloss 2/
 * Example: 中國 中国 [Zhong1 guo2] /China/Middle Kingdom/
 */
export function parseCcedictLine(line: string): LexiconEntry | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  const m = /^(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+\/(.+)\/\s*$/.exec(trimmed);
  if (!m) return null;

  const traditional = m[1]!;
  const simplified = m[2]!;
  const pinyin = m[3]!.trim();
  const glosses = m[4]!
    .split("/")
    .map((g) => g.trim())
    .filter(Boolean);

  if (glosses.length === 0) return null;

  return {
    id: `ccedict:${simplified}:${pinyin}`,
    lemma: simplified,
    language: "zh",
    readings: [pinyin],
    pronunciations: [{ value: pinyin, system: "pinyin-numbered" }],
    senses: [
      {
        id: "0",
        glosses,
      },
    ],
    source: "cc-cedict",
    license: "CC BY-SA 4.0",
    attribution: "CC-CEDICT / MDBG",
    raw: { traditional, simplified, pinyin },
  };
}

export function parseCcedictText(text: string): LexiconEntry[] {
  return text
    .split(/\r?\n/)
    .map(parseCcedictLine)
    .filter((e): e is LexiconEntry => e !== null);
}
