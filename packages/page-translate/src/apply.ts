import type { PageTranslateMode, PageTranslateSegmentResult } from "@language-llm/protocol";
import type { RestoreTable } from "./segmenter.js";

export interface AppliedSegment {
  id: string;
  displayText: string;
  originalText: string;
}

/**
 * Build display strings for Original / Translated / Dual modes.
 * Dual keeps the translated text primary and attaches original as a title/aria.
 */
export function resolveDisplayText(
  mode: PageTranslateMode,
  original: string,
  translated: string,
): { text: string; title?: string } {
  switch (mode) {
    case "original":
      return { text: original };
    case "translated":
      return { text: translated };
    case "dual":
      return { text: translated, title: original };
    default:
      return { text: original };
  }
}

export function buildAppliedMap(
  mode: PageTranslateMode,
  restore: RestoreTable,
  results: PageTranslateSegmentResult[],
): AppliedSegment[] {
  const byId = new Map(results.map((r) => [r.id, r]));
  const out: AppliedSegment[] = [];
  for (const [id, entry] of restore.originals()) {
    const result = byId.get(id);
    const translated = result?.translatedText ?? entry;
    const display = resolveDisplayText(mode, entry, translated);
    out.push({
      id,
      displayText: display.text,
      originalText: entry,
    });
  }
  return out;
}

/**
 * True when dev-only MT fallback is permitted (tests / local extension dev).
 * Production builds must route MT through the companion and never call mock.
 */
export function isDevelopmentMtFallbackAllowed(): boolean {
  try {
    const meta = import.meta as ImportMeta & { env?: { DEV?: boolean } };
    if (meta.env?.DEV === true) return true;
  } catch {
    // import.meta unavailable
  }
  try {
    if (
      typeof process !== "undefined" &&
      process.env?.NODE_ENV !== "production"
    ) {
      return true;
    }
  } catch {
    // process unavailable
  }
  return false;
}

/**
 * Dev/test-only mock translator. Production must not inject `[lang]` mock text.
 * Preserves numbers and URLs (fidelity-friendly stub).
 */
export function mockTranslateSegment(
  text: string,
  targetLang: string,
): string {
  const urls = text.match(/https?:\/\/\S+/g) ?? [];
  const numbers = text.match(/\d+(?:[.,]\d+)?/g) ?? [];
  let body = `[${targetLang}] ${text}`;
  for (const u of urls) {
    if (!body.includes(u)) body += ` ${u}`;
  }
  for (const n of numbers) {
    if (!body.includes(n)) body += ` ${n}`;
  }
  return body;
}
