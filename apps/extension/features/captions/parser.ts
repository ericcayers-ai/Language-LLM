import type { Cue, SourceTimeline } from "@language-llm/protocol";

/** Parse YouTube-like timedtext JSON (event list) into immutable cues. */
export interface YtTimedtextEvent {
  tStartMs?: number;
  dDurationMs?: number;
  segs?: Array<{ utf8?: string }>;
  /** srv3 / xml-ish body sometimes uses `wWinId` etc. — ignored. */
}

export function parseTimedtextEvents(
  videoId: string,
  events: YtTimedtextEvent[],
  provenance: Cue["provenance"] = "auto-caption",
): SourceTimeline {
  const cues: Cue[] = [];
  for (let i = 0; i < events.length; i++) {
    const e = events[i]!;
    const text = (e.segs ?? [])
      .map((s) => s.utf8 ?? "")
      .join("")
      .replace(/\n/g, " ")
      .trim();
    if (!text) continue;
    const startMs = e.tStartMs ?? 0;
    const endMs = startMs + (e.dDurationMs ?? 2000);
    cues.push({
      id: `yt_${videoId}_${i}_${startMs}`,
      startMs,
      endMs,
      text,
      provenance,
    });
  }
  return timelineFromCues(videoId, cues, provenance);
}

/**
 * Parse YouTube `fmt=json3` body: `{ events: [...] }`.
 * Empty body / missing events → empty immutable timeline (not an exception).
 */
export function parseJson3Timedtext(
  videoId: string,
  body: string,
  provenance: Cue["provenance"] = "auto-caption",
): SourceTimeline {
  const trimmed = body.trim();
  if (!trimmed) {
    return emptyTimeline(videoId, provenance);
  }
  let parsed: { events?: YtTimedtextEvent[] };
  try {
    parsed = JSON.parse(trimmed) as { events?: YtTimedtextEvent[] };
  } catch {
    return emptyTimeline(videoId, provenance);
  }
  const events = Array.isArray(parsed.events) ? parsed.events : [];
  return parseTimedtextEvents(videoId, events, provenance);
}

/**
 * Parse YouTube `fmt=srv3` XML-ish timedtext:
 * `<p t="0" d="1000">text</p>` or nested `<s>` runs.
 */
export function parseSrv3Timedtext(
  videoId: string,
  body: string,
  provenance: Cue["provenance"] = "auto-caption",
): SourceTimeline {
  const trimmed = body.trim();
  if (!trimmed) return emptyTimeline(videoId, provenance);

  const cues: Cue[] = [];
  const pRe = /<p\b([^>]*)>([\s\S]*?)<\/p>/gi;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = pRe.exec(trimmed)) !== null) {
    const attrs = match[1] ?? "";
    const inner = match[2] ?? "";
    const t = attrNumber(attrs, "t") ?? 0;
    const d = attrNumber(attrs, "d") ?? 2000;
    const text = stripXml(inner).replace(/\s+/g, " ").trim();
    if (!text) continue;
    cues.push({
      id: `yt_${videoId}_srv3_${i}_${t}`,
      startMs: t,
      endMs: t + d,
      text,
      provenance,
    });
    i++;
  }
  return timelineFromCues(videoId, cues, provenance);
}

/** Parse WebVTT (YouTube `fmt=vtt` or imported). */
export function parseVttTimedtext(
  videoId: string,
  body: string,
  provenance: Cue["provenance"] = "auto-caption",
): SourceTimeline {
  const trimmed = body.replace(/^\uFEFF/, "").trim();
  if (!trimmed) return emptyTimeline(videoId, provenance);

  const lines = trimmed.split(/\r?\n/);
  const cues: Cue[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!.trim();
    if (!line || line.startsWith("WEBVTT") || line.startsWith("NOTE") || line.startsWith("STYLE")) {
      i++;
      continue;
    }
    // Optional cue id line before timing.
    let timingLine = line;
    if (!timingLine.includes("-->") && i + 1 < lines.length && lines[i + 1]!.includes("-->")) {
      i++;
      timingLine = lines[i]!.trim();
    }
    const times = timingLine.match(
      /(\d{1,2}:)?\d{2}:\d{2}\.\d{3}\s*-->\s*(\d{1,2}:)?\d{2}:\d{2}\.\d{3}/,
    );
    if (!times) {
      i++;
      continue;
    }
    const parts = timingLine.split("-->").map((s) => s.trim());
    const startMs = parseVttTimestamp(parts[0]!.split(/\s+/)[0]!);
    const endMs = parseVttTimestamp(parts[1]!.split(/\s+/)[0]!);
    i++;
    const textLines: string[] = [];
    while (i < lines.length && lines[i]!.trim() !== "") {
      textLines.push(lines[i]!.trim());
      i++;
    }
    const text = textLines.join(" ").replace(/<[^>]+>/g, "").trim();
    if (text) {
      cues.push({
        id: `yt_${videoId}_vtt_${cues.length}_${startMs}`,
        startMs,
        endMs,
        text,
        provenance,
      });
    }
    i++;
  }
  return timelineFromCues(videoId, cues, provenance);
}

/**
 * Auto-detect json3 / srv3 / vtt from body shape and parse into timeline.
 */
export function parseTimedtextBody(
  videoId: string,
  body: string,
  provenance: Cue["provenance"] = "auto-caption",
  formatHint?: "json3" | "srv3" | "vtt" | "srv1" | "unknown",
): SourceTimeline {
  const trimmed = (body ?? "").trim();
  if (!trimmed) return emptyTimeline(videoId, provenance);

  const hint = formatHint ?? detectFormat(trimmed);
  switch (hint) {
    case "vtt":
      return parseVttTimedtext(videoId, trimmed, provenance);
    case "srv3":
    case "srv1":
      return parseSrv3Timedtext(videoId, trimmed, provenance);
    case "json3":
    default:
      if (trimmed.startsWith("{")) {
        return parseJson3Timedtext(videoId, trimmed, provenance);
      }
      if (trimmed.includes("WEBVTT") || /^\d{2}:\d{2}/.test(trimmed)) {
        return parseVttTimedtext(videoId, trimmed, provenance);
      }
      if (trimmed.includes("<p ") || trimmed.includes("<transcript")) {
        return parseSrv3Timedtext(videoId, trimmed, provenance);
      }
      return parseJson3Timedtext(videoId, trimmed, provenance);
  }
}

export function detectFormat(body: string): "json3" | "srv3" | "vtt" | "unknown" {
  const t = body.trim();
  if (t.startsWith("{") || t.startsWith("[")) return "json3";
  if (t.includes("WEBVTT")) return "vtt";
  if (t.includes("<p ") || t.includes("<transcript") || t.includes("<?xml")) return "srv3";
  return "unknown";
}

function emptyTimeline(
  videoId: string,
  provenance: Cue["provenance"],
): SourceTimeline {
  return timelineFromCues(videoId, [], provenance);
}

function timelineFromCues(
  videoId: string,
  cues: Cue[],
  provenance: Cue["provenance"],
): SourceTimeline {
  const sourceHash = simpleHash(cues.map((c) => c.text).join("|"));
  return {
    videoId,
    cues,
    sourceHash,
    immutable: true,
    captionSource: provenance === "human-caption" ? "human" : "auto",
  };
}

function attrNumber(attrs: string, name: string): number | undefined {
  const m = attrs.match(new RegExp(`\\b${name}="(\\d+)"`, "i"));
  return m ? Number(m[1]) : undefined;
}

function stripXml(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseVttTimestamp(ts: string): number {
  const parts = ts.trim().split(":");
  let h = 0;
  let m = 0;
  let s = 0;
  if (parts.length === 3) {
    h = Number(parts[0]);
    m = Number(parts[1]);
    s = Number(parts[2]);
  } else if (parts.length === 2) {
    m = Number(parts[0]);
    s = Number(parts[1]);
  } else {
    s = Number(parts[0]);
  }
  return Math.round((h * 3600 + m * 60 + s) * 1000);
}

function simpleHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

export function activeCueAt(
  timeline: SourceTimeline,
  timeMs: number,
): Cue | undefined {
  return timeline.cues.find((c) => timeMs >= c.startMs && timeMs < c.endMs);
}
