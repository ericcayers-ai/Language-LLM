import {
  attributionFor,
  detectSongContext,
  linesToTimeline,
  parseLrc,
  parsePlain,
  parseTtml,
  type LrcLibTrack,
} from "@language-llm/lyrics";
import type { LyricsAttribution, SourceTimeline } from "@language-llm/protocol";

export type LyricsResolveResult =
  | {
      ok: true;
      timeline: SourceTimeline;
      attribution: LyricsAttribution;
      /** True when caption tracks were reused as lyrics — UI must confirm. */
      requiresConfirmation?: boolean;
    }
  | { ok: false; reason: string; next: "lrclib" | "import" | "asr" | "none" };


/**
 * Store-safe lyrics router. Proprietary scrapers are intentionally unsupported.
 * Priority: page captions → embedded → LRCLIB → user import → ASR last.
 */
export function resolveLyricsLocal(input: {
  href: string;
  videoId: string;
  title?: string;
  channel?: string;
  category?: string;
  pageCaptionTimeline?: SourceTimeline;
  pageEmbeddedLrc?: string;
  lrclibTrack?: LrcLibTrack;
  imported?: { format: "lrc" | "ttml" | "plain"; content: string };
  treatAsSong?: boolean;
}): LyricsResolveResult {
  const detection = detectSongContext({
    href: input.href,
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.channel !== undefined ? { channel: input.channel } : {}),
    ...(input.category !== undefined ? { category: input.category } : {}),
    ...(input.treatAsSong !== undefined
      ? { treatAsSong: input.treatAsSong }
      : {}),
  });
  if (!detection.isSong && !input.treatAsSong) {
    return { ok: false, reason: "not-song-context", next: "none" };
  }

  if (input.pageCaptionTimeline?.cues.length) {
    return {
      ok: true,
      timeline: input.pageCaptionTimeline,
      attribution: attributionFor("page-caption"),
      requiresConfirmation: true,
    };
  }
  if (input.pageEmbeddedLrc) {
    return {
      ok: true,
      timeline: linesToTimeline(
        input.videoId,
        parseLrc(input.pageEmbeddedLrc),
        "lyrics-import",
      ),
      attribution: attributionFor("page-embedded"),
    };
  }
  if (input.lrclibTrack?.syncedLyrics) {
    return {
      ok: true,
      timeline: linesToTimeline(
        input.videoId,
        parseLrc(input.lrclibTrack.syncedLyrics),
        "lyrics-open-api",
      ),
      attribution: attributionFor("lrclib", {
        provider: "LRCLIB",
        url: "https://lrclib.net/",
        licenseNote: "User-fetched open API lyrics; clearable cache.",
      }),
    };
  }
  if (input.imported) {
    return {
      ok: true,
      timeline: resolveImportedLyrics(
        input.videoId,
        input.imported.format,
        input.imported.content,
      ),
      attribution: attributionFor("user-import"),
    };
  }
  return {
    ok: false,
    reason: "need-user-asr-or-import",
    next: "asr",
  };
}

export function resolveImportedLyrics(
  videoId: string,
  format: "lrc" | "ttml" | "plain",
  content: string,
): SourceTimeline {
  const lines =
    format === "lrc"
      ? parseLrc(content)
      : format === "ttml"
        ? parseTtml(content)
        : parsePlain(content);
  return linesToTimeline(videoId, lines, "lyrics-import");
}
