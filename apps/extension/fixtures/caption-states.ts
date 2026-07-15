/**
 * Fixture matrix for YouTube caption states (hermetic — no network).
 * Includes player-response track shapes and timedtext body samples.
 */

export const JSON3_HUMAN_BODY = JSON.stringify({
  events: [
    { tStartMs: 0, dDurationMs: 1500, segs: [{ utf8: "Hello from human captions" }] },
    { tStartMs: 1500, dDurationMs: 2000, segs: [{ utf8: "Local inference stays offline" }] },
  ],
});

export const JSON3_AUTO_BODY = JSON.stringify({
  events: [
    { tStartMs: 0, dDurationMs: 1200, segs: [{ utf8: "auto generated line" }] },
  ],
});

export const SRV3_BODY = `<?xml version="1.0" encoding="utf-8" ?>
<timedtext format="3">
<body>
<p t="0" d="1000">srv3 first</p>
<p t="1000" d="1500">srv3 <s>second</s></p>
</body>
</timedtext>`;

export const VTT_BODY = `WEBVTT

00:00:00.000 --> 00:00:01.500
Hello VTT

00:00:01.500 --> 00:00:03.000
Second cue
`;

/** Empty timedtext body (player returned 200 with no cues). */
export const EMPTY_BODY = "";

export const CAPTION_FIXTURES = {
  human: {
    videoId: "demo_human",
    tracks: [
      {
        id: "en",
        language: "en",
        kind: "human" as const,
        label: "English",
        baseUrl: "https://www.youtube.com/api/timedtext?v=demo_human&lang=en&fmt=json3",
        format: "json3" as const,
      },
    ],
    body: JSON3_HUMAN_BODY,
  },
  autoOnly: {
    videoId: "demo_auto",
    tracks: [
      {
        id: "en-a",
        language: "en",
        kind: "auto" as const,
        label: "English (auto)",
        baseUrl: "https://www.youtube.com/api/timedtext?v=demo_auto&lang=en&kind=asr&fmt=json3",
        format: "json3" as const,
      },
    ],
    body: JSON3_AUTO_BODY,
  },
  none: {
    videoId: "demo_none",
    tracks: [] as Array<{
      id: string;
      language: string;
      kind: "human" | "auto";
      label: string;
      baseUrl?: string;
    }>,
    body: undefined as string | undefined,
  },
  emptyResponse: {
    videoId: "demo_empty",
    tracks: [
      {
        id: "en",
        language: "en",
        kind: "human" as const,
        label: "English",
        baseUrl: "https://www.youtube.com/api/timedtext?v=demo_empty&lang=en&fmt=json3",
      },
    ],
    events: [] as unknown[],
    body: EMPTY_BODY,
  },
  srv3: {
    videoId: "demo_srv3",
    tracks: [
      {
        id: "en",
        language: "en",
        kind: "human" as const,
        label: "English",
        format: "srv3" as const,
      },
    ],
    body: SRV3_BODY,
  },
  vtt: {
    videoId: "demo_vtt",
    tracks: [
      {
        id: "en",
        language: "en",
        kind: "human" as const,
        label: "English",
        format: "vtt" as const,
      },
    ],
    body: VTT_BODY,
  },
  live: {
    videoId: "demo_live",
    pageKind: "live" as const,
    tracks: [] as [],
  },
  shorts: {
    videoId: "demo_shorts",
    pageKind: "shorts" as const,
    tracks: [{ id: "en", language: "en", kind: "auto" as const, label: "auto" }],
  },
} as const;

/** Minimal ytInitialPlayerResponse-shaped object for bridge unit tests. */
export function playerResponseFixture(
  captionTracks: Array<{
    baseUrl: string;
    languageCode: string;
    kind?: string;
    vssId?: string;
    name?: { simpleText: string };
  }>,
) {
  return {
    captions: {
      playerCaptionsTracklistRenderer: {
        captionTracks,
      },
    },
  };
}
