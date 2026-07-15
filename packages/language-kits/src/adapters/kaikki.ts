import type { LexiconEntry } from "../lexicon.js";
import { emptySense } from "../lexicon.js";

/**
 * Parse a Kaikki / Wiktionary JSONL line into a normalized lexicon entry.
 * Supports the common flattened shape used by kaikki.org extracts.
 */
export function parseKaikkiLine(line: string): LexiconEntry | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return null;
  }

  const word = typeof raw.word === "string" ? raw.word : null;
  const lang = typeof raw.lang_code === "string"
    ? raw.lang_code
    : typeof raw.lang === "string"
      ? raw.lang
      : null;
  if (!word || !lang) return null;

  const sensesRaw = Array.isArray(raw.senses) ? raw.senses : [];
  const senses = sensesRaw.flatMap((sense, i) => {
    if (typeof sense !== "object" || sense === null) return [];
    const s = sense as Record<string, unknown>;
    const glosses = Array.isArray(s.glosses)
      ? s.glosses.filter((g): g is string => typeof g === "string")
      : [];
    if (glosses.length === 0) return [];
    const pos = Array.isArray(s.pos)
      ? s.pos.filter((p): p is string => typeof p === "string")
      : typeof raw.pos === "string"
        ? [raw.pos]
        : undefined;
    return [
      {
        id: typeof s.id === "string" ? s.id : `${word}:${i}`,
        glosses,
        ...(pos ? { pos } : {}),
        ...(Array.isArray(s.tags)
          ? {
              tags: s.tags.filter((t): t is string => typeof t === "string"),
            }
          : {}),
      },
    ];
  });

  if (senses.length === 0) {
    senses.push(emptySense(`${word}:0`, "(no gloss)"));
  }

  const sounds = Array.isArray(raw.sounds) ? raw.sounds : [];
  const pronunciations = sounds.flatMap((sound) => {
    if (typeof sound !== "object" || sound === null) return [];
    const s = sound as Record<string, unknown>;
    const ipa = typeof s.ipa === "string" ? s.ipa : null;
    if (!ipa) return [];
    return [{ value: ipa, system: "ipa" as const }];
  });

  return {
    id: typeof raw.id === "string" ? raw.id : `kaikki:${lang}:${word}`,
    lemma: word,
    language: lang,
    senses,
    ...(pronunciations.length > 0 ? { pronunciations } : {}),
    source: "kaikki",
    license: "CC BY-SA",
    attribution: "Wiktionary contributors via Kaikki",
    raw,
  };
}

export function parseKaikkiJsonl(text: string): LexiconEntry[] {
  return text
    .split(/\r?\n/)
    .map(parseKaikkiLine)
    .filter((e): e is LexiconEntry => e !== null);
}
