import type { Cue, LyricsAttribution, SourceTimeline } from "@language-llm/protocol";
import { fnv1aLike } from "./hash.js";

/** Parse enhanced or simple LRC timestamps [mm:ss.xx] or [mm:ss.xxx] */
const TS = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?]/g;

export function parseTimestampMs(
  mm: string,
  ss: string,
  frac?: string,
): number {
  const minutes = Number(mm);
  const seconds = Number(ss);
  let ms = 0;
  if (frac) {
    const padded = frac.length === 1 ? frac + "00" : frac.length === 2 ? frac + "0" : frac.slice(0, 3);
    ms = Number(padded);
  }
  return (minutes * 60 + seconds) * 1000 + ms;
}

export interface ParsedLine {
  startMs: number;
  text: string;
}

export function parseLrc(content: string): ParsedLine[] {
  const lines: ParsedLine[] = [];
  for (const raw of content.split(/\r?\n/)) {
    const textPart = raw.replace(TS, "").trim();
    const stamps = [...raw.matchAll(TS)];
    if (!stamps.length) continue;
    for (const m of stamps) {
      lines.push({
        startMs: parseTimestampMs(m[1]!, m[2]!, m[3]),
        text: textPart,
      });
    }
  }
  lines.sort((a, b) => a.startMs - b.startMs);
  return lines.filter((l) => l.text.length > 0);
}

/** Minimal TTML `<p begin="" end="">` extractor (store-safe subset). */
export function parseTtml(content: string): ParsedLine[] {
  const lines: ParsedLine[] = [];
  const re =
    /<p\b[^>]*\bbegin="([^"]+)"[^>]*\bend="([^"]+)"[^>]*>([\s\S]*?)<\/p>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    const text = m[3]!.replace(/<[^>]+>/g, "").trim();
    if (!text) continue;
    lines.push({
      startMs: parseClock(m[1]!),
      text,
    });
  }
  return lines;
}

function parseClock(value: string): number {
  // Supports ss.mmm or hh:mm:ss.mmm
  if (value.includes(":")) {
    const parts = value.split(":");
    const secPart = parts[parts.length - 1]!;
    const seconds = Number(secPart);
    const minutes = Number(parts[parts.length - 2] ?? 0);
    const hours = Number(parts[parts.length - 3] ?? 0);
    return Math.round((hours * 3600 + minutes * 60 + seconds) * 1000);
  }
  return Math.round(Number(value) * 1000);
}

export function parsePlain(content: string, lineDurationMs = 3000): ParsedLine[] {
  const rows = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  return rows.map((text, i) => ({
    startMs: i * lineDurationMs,
    text,
  }));
}

export function linesToTimeline(
  videoId: string,
  lines: ParsedLine[],
  provenance: Cue["provenance"],
  defaultDurationMs = 3000,
): SourceTimeline {
  const cues: Cue[] = lines.map((line, i) => {
    const next = lines[i + 1];
    const endMs = next
      ? Math.max(next.startMs, line.startMs + 200)
      : line.startMs + defaultDurationMs;
    return {
      id: `lyr_${fnv1aLike(`${videoId}:${i}:${line.startMs}:${line.text}`)}`,
      startMs: line.startMs,
      endMs,
      text: line.text,
      provenance,
    };
  });
  const sourceHash = fnv1aLike(cues.map((c) => c.text).join("\n"));
  return {
    videoId,
    cues,
    sourceHash,
    immutable: true,
    captionSource: provenance === "asr" ? "asr-import" : "human",
  };
}

export function attributionFor(
  source: LyricsAttribution["source"],
  extra: Partial<LyricsAttribution> = {},
): LyricsAttribution {
  return {
    source,
    fetchedAtMs: Date.now(),
    ...extra,
  };
}
