import { describe, expect, it } from "vitest";
import {
  preferCaptionTrack,
  routeCaptionSource,
  wouldAutoStartCapture,
} from "../source-router";
import {
  parseJson3Timedtext,
  parseSrv3Timedtext,
  parseTimedtextBody,
  parseTimedtextEvents,
  parseVttTimedtext,
} from "../parser";
import {
  extractPlayerResponseFromScript,
  preferJson3Url,
  tracksFromPlayerResponse,
} from "../player-response";
import { extractVideoId } from "../spa";
import { resolveLyricsLocal } from "../../lyrics/resolve";
import { shouldInvokeVlm, mockVlmCorrection } from "../../vlm/review";
import {
  CAPTION_FIXTURES,
  EMPTY_BODY,
  JSON3_AUTO_BODY,
  JSON3_HUMAN_BODY,
  playerResponseFixture,
  SRV3_BODY,
  VTT_BODY,
} from "../../../fixtures/caption-states";

describe("caption source router", () => {
  it("prefers human over auto", () => {
    const track = preferCaptionTrack([
      { id: "a", language: "en", kind: "auto", label: "auto" },
      { id: "h", language: "en", kind: "human", label: "human" },
    ]);
    expect(track?.id).toBe("h");
  });

  it("never auto-starts capture when captions exist", () => {
    const d = routeCaptionSource({
      tracks: [{ id: "h", language: "en", kind: "human", label: "human" }],
      userGestureForCapture: false,
      hasOwnedMedia: false,
    });
    expect(d.action).toBe("use-caption");
    expect(wouldAutoStartCapture(d)).toBe(false);
  });

  it("asks for gesture when no captions", () => {
    const d = routeCaptionSource({
      tracks: [],
      userGestureForCapture: false,
      hasOwnedMedia: false,
    });
    expect(d.action).toBe("ask-tab-capture");
  });
});

describe("timedtext parsers", () => {
  it("parses timedtext events", () => {
    const tl = parseTimedtextEvents("v1", [
      { tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: "Hi" }] },
    ]);
    expect(tl.immutable).toBe(true);
    expect(tl.cues[0]?.text).toBe("Hi");
  });

  it("parses json3 human fixture", () => {
    const tl = parseJson3Timedtext("demo_human", JSON3_HUMAN_BODY, "human-caption");
    expect(tl.captionSource).toBe("human");
    expect(tl.cues).toHaveLength(2);
    expect(tl.cues[0]?.text).toContain("human captions");
  });

  it("parses json3 auto fixture", () => {
    const tl = parseTimedtextBody("demo_auto", JSON3_AUTO_BODY, "auto-caption");
    expect(tl.captionSource).toBe("auto");
    expect(tl.cues[0]?.text).toBe("auto generated line");
  });

  it("parses srv3 and vtt", () => {
    const srv3 = parseSrv3Timedtext("demo_srv3", SRV3_BODY, "human-caption");
    expect(srv3.cues.map((c) => c.text)).toEqual(["srv3 first", "srv3 second"]);
    const vtt = parseVttTimedtext("demo_vtt", VTT_BODY, "human-caption");
    expect(vtt.cues).toHaveLength(2);
    expect(vtt.cues[0]?.text).toBe("Hello VTT");
  });

  it("empty body yields empty immutable timeline", () => {
    const tl = parseTimedtextBody("demo_empty", EMPTY_BODY, "human-caption");
    expect(tl.immutable).toBe(true);
    expect(tl.cues).toHaveLength(0);
  });

  it("fixture matrix covers human / auto / none / empty", () => {
    expect(CAPTION_FIXTURES.human.tracks[0]?.kind).toBe("human");
    expect(CAPTION_FIXTURES.autoOnly.tracks[0]?.kind).toBe("auto");
    expect(CAPTION_FIXTURES.none.tracks).toHaveLength(0);
    expect(CAPTION_FIXTURES.emptyResponse.body).toBe("");
    const noneDecision = routeCaptionSource({
      tracks: [...CAPTION_FIXTURES.none.tracks],
      userGestureForCapture: false,
      hasOwnedMedia: false,
    });
    expect(noneDecision.action).toBe("ask-tab-capture");
  });

  it("extracts video ids", () => {
    expect(extractVideoId("https://www.youtube.com/watch?v=abc123")).toBe(
      "abc123",
    );
  });
});

describe("player response caption tracks", () => {
  it("extracts human and auto timedtext URLs", () => {
    const pr = playerResponseFixture([
      {
        baseUrl: "https://www.youtube.com/api/timedtext?v=x&lang=en&fmt=json3",
        languageCode: "en",
        vssId: ".en",
        name: { simpleText: "English" },
      },
      {
        baseUrl:
          "https://www.youtube.com/api/timedtext?v=x&lang=en&kind=asr&fmt=json3",
        languageCode: "en",
        kind: "asr",
        vssId: "a.en",
        name: { simpleText: "English (auto-generated)" },
      },
    ]);
    const tracks = tracksFromPlayerResponse(pr);
    expect(tracks).toHaveLength(2);
    expect(tracks[0]?.kind).toBe("human");
    expect(tracks[1]?.kind).toBe("auto");
    expect(tracks[0]?.baseUrl).toContain("timedtext");
  });

  it("returns empty for no captions / missing renderer", () => {
    expect(tracksFromPlayerResponse({})).toEqual([]);
    expect(tracksFromPlayerResponse(null)).toEqual([]);
    expect(
      tracksFromPlayerResponse({
        captions: { playerCaptionsTracklistRenderer: { captionTracks: [] } },
      }),
    ).toEqual([]);
  });

  it("parses embedded script ytInitialPlayerResponse", () => {
    const pr = playerResponseFixture([
      {
        baseUrl: "https://www.youtube.com/api/timedtext?v=y&lang=ja",
        languageCode: "ja",
        name: { simpleText: "Japanese" },
      },
    ]);
    const script = `var ytInitialPlayerResponse = ${JSON.stringify(pr)};`;
    const extracted = extractPlayerResponseFromScript(script);
    const tracks = tracksFromPlayerResponse(extracted);
    expect(tracks[0]?.language).toBe("ja");
    expect(preferJson3Url(tracks[0]!.baseUrl!)).toContain("fmt=json3");
  });
});

describe("lyrics + vlm", () => {
  it("uses page captions first for songs", () => {
    const tl = parseTimedtextEvents("v", [
      { tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: "la la" }] },
    ]);
    const r = resolveLyricsLocal({
      href: "https://music.youtube.com/watch?v=v",
      videoId: "v",
      pageCaptionTimeline: tl,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.attribution.source).toBe("page-caption");
  });

  it("gates VLM to ambiguity on non-lite", () => {
    expect(
      shouldInvokeVlm({
        confidence: 0.4,
        flaggedAmbiguity: true,
        profile: "balanced",
      }),
    ).toBe(true);
    expect(
      shouldInvokeVlm({
        confidence: 0.4,
        flaggedAmbiguity: true,
        profile: "lite",
      }),
    ).toBe(false);
    const stub = mockVlmCorrection({
      sourceText: "that",
      draftText: "eso",
      question: "what is that?",
      frameRefs: ["frame1"],
    });
    expect(stub.correctedTargetText).toBe("eso");
  });
});
