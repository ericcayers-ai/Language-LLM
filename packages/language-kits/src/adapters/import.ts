import type { LexiconEntry } from "../lexicon.js";
import { parseCcedictText } from "./ccedict.js";
import { parseJmdictEntryXml, parseJmdictTextLine } from "./jmdict.js";
import { parseKaikkiJsonl } from "./kaikki.js";

export type DictionaryFormat =
  | "jmdict-xml"
  | "jmdict-text"
  | "cc-cedict"
  | "kaikki-jsonl"
  | "unknown";

export interface DictionaryImportResult {
  format: DictionaryFormat;
  entries: LexiconEntry[];
  skippedLines: number;
}

/**
 * Heuristic format detection for user-imported dictionary dumps.
 * Prefer extension/MIME hints when available; otherwise sniff content.
 */
export function detectDictionaryFormat(
  text: string,
  hint?: { filename?: string; mime?: string },
): DictionaryFormat {
  const name = (hint?.filename ?? "").toLowerCase();
  if (name.endsWith(".jsonl") || name.includes("kaikki")) return "kaikki-jsonl";
  if (name.includes("cedict") || name.endsWith(".u8")) return "cc-cedict";
  if (name.includes("jmdict") && name.endsWith(".xml")) return "jmdict-xml";
  if (name.includes("jmdict") || name.includes("edict")) return "jmdict-text";

  const sample = text.slice(0, 4000).trim();
  if (!sample) return "unknown";

  if (sample.startsWith("{") || sample.includes('"lang_code"')) {
    return "kaikki-jsonl";
  }
  if (/<entry[\s>]/.test(sample) || /<ent_seq>/.test(sample)) {
    return "jmdict-xml";
  }
  // Traditional Simplified [pinyin] /gloss/
  if (/^\S+\s+\S+\s+\[[^\]]+\]\s+\//m.test(sample)) {
    return "cc-cedict";
  }
  // lemma [reading] /(pos)/gloss/
  if (/^.+?\s+(?:\[[^\]]+\]\s+)?\//m.test(sample)) {
    return "jmdict-text";
  }
  return "unknown";
}

export function parseJmdictXmlDump(text: string): LexiconEntry[] {
  const entries: LexiconEntry[] = [];
  const re = /<entry[\s>][\s\S]*?<\/entry>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const entry = parseJmdictEntryXml(m[0]!);
    if (entry) entries.push(entry);
  }
  return entries;
}

export function parseJmdictTextDump(text: string): LexiconEntry[] {
  return text
    .split(/\r?\n/)
    .map(parseJmdictTextLine)
    .filter((e): e is LexiconEntry => e !== null);
}

/**
 * Import a dictionary dump into normalized lexicon entries.
 * Returns empty entries (not throw) for unknown formats so UI can prompt.
 */
export function importDictionaryText(
  text: string,
  hint?: { filename?: string; mime?: string; format?: DictionaryFormat },
): DictionaryImportResult {
  const format =
    hint?.format && hint.format !== "unknown"
      ? hint.format
      : detectDictionaryFormat(text, hint);

  switch (format) {
    case "jmdict-xml": {
      const entries = parseJmdictXmlDump(text);
      return { format, entries, skippedLines: 0 };
    }
    case "jmdict-text": {
      const lines = text.split(/\r?\n/);
      const entries = parseJmdictTextDump(text);
      return {
        format,
        entries,
        skippedLines: Math.max(0, lines.length - entries.length),
      };
    }
    case "cc-cedict": {
      const lines = text.split(/\r?\n/);
      const entries = parseCcedictText(text);
      return {
        format,
        entries,
        skippedLines: Math.max(0, lines.length - entries.length),
      };
    }
    case "kaikki-jsonl": {
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      const entries = parseKaikkiJsonl(text);
      return {
        format,
        entries,
        skippedLines: Math.max(0, lines.length - entries.length),
      };
    }
    default:
      return { format: "unknown", entries: [], skippedLines: 0 };
  }
}

/** Look up lemma (case-fold + exact) in an in-memory lexicon list. */
export function lookupLemma(
  entries: LexiconEntry[],
  surface: string,
): LexiconEntry | undefined {
  const key = surface.trim().toLowerCase();
  return (
    entries.find((e) => e.lemma.toLowerCase() === key) ??
    entries.find((e) => e.readings?.some((r) => r.toLowerCase() === key))
  );
}
