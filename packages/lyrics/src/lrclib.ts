/**
 * LRCLIB open API client contract.
 * Network calls are opt-in and attribution is mandatory.
 * CI uses fixtures — never hit the live API in tests.
 */

export interface LrcLibTrack {
  id: number;
  name: string;
  trackName: string;
  artistName: string;
  albumName?: string;
  duration?: number;
  instrumental?: boolean;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
}

export interface LrcLibSearchParams {
  track_name: string;
  artist_name?: string;
  album_name?: string;
  duration?: number;
}

export const LRCLIB_BASE = "https://lrclib.net/api";

export function buildLrcLibSearchUrl(params: LrcLibSearchParams): string {
  const q = new URLSearchParams();
  q.set("track_name", params.track_name);
  if (params.artist_name) q.set("artist_name", params.artist_name);
  if (params.album_name) q.set("album_name", params.album_name);
  if (params.duration != null) q.set("duration", String(Math.round(params.duration)));
  return `${LRCLIB_BASE}/search?${q.toString()}`;
}

export function attributionNote(): string {
  return "Lyrics via LRCLIB (https://lrclib.net/). Attribution retained locally; clearable in settings.";
}

/**
 * Fetch lyrics when user allows network open-API use.
 * TODO(weights/network): companion owns the real fetch + hash-verified cache.
 */
export async function fetchLrcLibSearch(
  params: LrcLibSearchParams,
  fetcher: typeof fetch = fetch,
): Promise<LrcLibTrack[]> {
  const url = buildLrcLibSearchUrl(params);
  const res = await fetcher(url, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`LRCLIB search failed: ${res.status}`);
  }
  return (await res.json()) as LrcLibTrack[];
}

export function pickBestTrack(
  tracks: LrcLibTrack[],
  durationSec?: number,
): LrcLibTrack | undefined {
  if (!tracks.length) return undefined;
  if (durationSec == null) return tracks[0];
  let best = tracks[0]!;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const t of tracks) {
    if (t.duration == null) continue;
    const delta = Math.abs(t.duration - durationSec);
    if (delta < bestDelta) {
      best = t;
      bestDelta = delta;
    }
  }
  return best;
}
