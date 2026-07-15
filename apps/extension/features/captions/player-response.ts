/**
 * Pure parsers for YouTube player caption tracklists (no DOM).
 * Used by the MAIN-world bridge and hermetic tests.
 */

export type CaptionTrackKind = "human" | "auto";

export interface PlayerCaptionTrack {
  id: string;
  language: string;
  kind: CaptionTrackKind;
  label: string;
  baseUrl?: string;
  format?: "json3" | "srv3" | "vtt" | "srv1" | "unknown";
}

type RawTrack = {
  baseUrl?: string;
  languageCode?: string;
  languageName?: { simpleText?: string } | string;
  name?: { simpleText?: string } | string;
  vssId?: string;
  kind?: string;
};

function labelOf(t: RawTrack): string {
  const n = t.name ?? t.languageName;
  if (typeof n === "string") return n;
  if (n && typeof n === "object" && n.simpleText) return n.simpleText;
  return t.languageCode ?? t.vssId ?? "caption";
}

function kindOf(t: RawTrack): CaptionTrackKind {
  if ((t.kind ?? "").toLowerCase() === "asr") return "auto";
  if ((t.vssId ?? "").includes(".a.")) return "auto";
  return "human";
}

export function formatHintFromUrl(baseUrl?: string): PlayerCaptionTrack["format"] {
  if (!baseUrl) return undefined;
  if (/[?&]fmt=json3\b/i.test(baseUrl)) return "json3";
  if (/[?&]fmt=srv3\b/i.test(baseUrl)) return "srv3";
  if (/[?&]fmt=vtt\b/i.test(baseUrl)) return "vtt";
  if (/[?&]fmt=srv1\b/i.test(baseUrl)) return "srv1";
  return "unknown";
}

/** Ensure timedtext URL requests json3 when no fmt is set. */
export function preferJson3Url(baseUrl: string): string {
  if (/[?&]fmt=/i.test(baseUrl)) return baseUrl;
  return baseUrl.includes("?") ? `${baseUrl}&fmt=json3` : `${baseUrl}?fmt=json3`;
}

/** Extract caption tracks from a ytInitialPlayerResponse-like object. */
export function tracksFromPlayerResponse(pr: unknown): PlayerCaptionTrack[] {
  if (!pr || typeof pr !== "object") return [];
  const caps = (pr as { captions?: unknown }).captions as
    | {
        playerCaptionsTracklistRenderer?: {
          captionTracks?: RawTrack[];
        };
      }
    | undefined;
  const raw = caps?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t) => typeof t?.baseUrl === "string" && t.baseUrl.length > 0)
    .map((t, i) => {
      const language = t.languageCode ?? "und";
      const kind = kindOf(t);
      const id = t.vssId ?? `${language}-${kind}-${i}`;
      const baseUrl = t.baseUrl as string;
      const format = formatHintFromUrl(baseUrl);
      return {
        id,
        language,
        kind,
        label: labelOf(t),
        baseUrl,
        ...(format ? { format } : {}),
      };
    });
}

/** Extract a balanced `{...}` JSON object starting at `start` (must be `{`). */
export function extractJsonObject(source: string, start: number): string | null {
  if (source[start] !== "{") return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < source.length; i++) {
    const c = source[i]!;
    if (inString) {
      if (escape) {
        escape = false;
      } else if (c === "\\") {
        escape = true;
      } else if (c === '"') {
        inString = false;
      }
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return null;
}

/** Find ytInitialPlayerResponse JSON embedded in a script text blob. */
export function extractPlayerResponseFromScript(text: string): unknown | null {
  const marker = "ytInitialPlayerResponse";
  const idx = text.indexOf(marker);
  if (idx < 0) return null;
  const eq = text.indexOf("=", idx);
  if (eq < 0) return null;
  let i = eq + 1;
  while (i < text.length && /\s/.test(text[i]!)) i++;
  if (text[i] !== "{") return null;
  const json = extractJsonObject(text, i);
  if (!json) return null;
  try {
    return JSON.parse(json) as unknown;
  } catch {
    return null;
  }
}
