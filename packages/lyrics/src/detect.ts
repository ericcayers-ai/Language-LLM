import type { SongDetectionResult } from "@language-llm/protocol";

export interface SongDetectInput {
  href: string;
  title?: string;
  channel?: string;
  category?: string;
  treatAsSong?: boolean;
}

/**
 * Heuristic song detection — never claims certainty.
 * Store-safe: uses only page metadata the extension already sees.
 */
export function detectSongContext(input: SongDetectInput): SongDetectionResult {
  if (input.treatAsSong) {
    return { isSong: true, confidence: 1, reasons: ["user-override"] };
  }
  const reasons: string[] = [];
  let score = 0;
  const href = input.href.toLowerCase();
  const title = (input.title ?? "").toLowerCase();
  const channel = (input.channel ?? "").toLowerCase();
  const category = (input.category ?? "").toLowerCase();

  if (href.includes("music.youtube.com")) {
    score += 0.55;
    reasons.push("youtube-music-host");
  }
  if (/official\s*audio|lyrics?\s*video|topic\b/.test(title)) {
    score += 0.25;
    reasons.push("title-marker");
  }
  if (channel.includes(" - topic") || channel.endsWith("topic")) {
    score += 0.2;
    reasons.push("topic-channel");
  }
  if (category.includes("music")) {
    score += 0.25;
    reasons.push("music-category");
  }
  if (/\blyrics?\b/.test(title)) {
    score += 0.1;
    reasons.push("lyrics-in-title");
  }

  const confidence = Math.min(1, score);
  return {
    isSong: confidence >= 0.45,
    confidence,
    reasons,
  };
}

/**
 * Ordered source priority — callers must not invent sources after this list.
 * Proprietary lyric-site scraping is intentionally absent.
 */
export const LYRICS_SOURCE_PRIORITY = [
  "page-caption",
  "page-embedded",
  "lrclib",
  "user-import",
  "asr",
] as const;
