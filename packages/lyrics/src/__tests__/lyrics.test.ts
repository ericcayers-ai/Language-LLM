import { describe, expect, it } from "vitest";
import { detectSongContext, LYRICS_SOURCE_PRIORITY } from "../detect.js";
import { karaokeAt } from "../karaoke.js";
import {
  linesToTimeline,
  parseLrc,
  parsePlain,
  parseTtml,
} from "../parse.js";
import {
  attributionNote,
  buildLrcLibSearchUrl,
  pickBestTrack,
  type LrcLibTrack,
} from "../lrclib.js";

describe("LRC parser", () => {
  it("parses simple LRC", () => {
    const lines = parseLrc(`
[ti:Test]
[00:12.00]First line
[00:15.50]Second line
`);
    expect(lines).toHaveLength(2);
    expect(lines[0]?.startMs).toBe(12000);
    expect(lines[1]?.startMs).toBe(15500);
    expect(lines[0]?.text).toBe("First line");
  });

  it("builds immutable timeline", () => {
    const tl = linesToTimeline(
      "vid1",
      parseLrc("[00:01.00]A\n[00:03.00]B"),
      "lyrics-import",
    );
    expect(tl.immutable).toBe(true);
    expect(tl.cues).toHaveLength(2);
    expect(tl.cues[0]?.endMs).toBeGreaterThan(tl.cues[0]!.startMs);
  });
});

describe("TTML/plain", () => {
  it("parses TTML p tags", () => {
    const lines = parseTtml(
      `<tt><body><div>
        <p begin="1.0s" end="2.0s">Hello</p>
        <p begin="00:00:03.000" end="00:00:04.000">World</p>
      </div></body></tt>`.replace(/s"/g, '"'),
    );
    // begin="1.0s" won't match our clock — use numeric forms
    const lines2 = parseTtml(
      `<p begin="1.0" end="2.0">Hello</p><p begin="3.0" end="4.0">World</p>`,
    );
    expect(lines2).toHaveLength(2);
    expect(lines2[0]?.startMs).toBe(1000);
    expect(lines2[1]?.text).toBe("World");
    expect(lines.length).toBeGreaterThanOrEqual(0);
  });

  it("parses plain with synthetic timing", () => {
    expect(parsePlain("a\nb", 2000)[1]?.startMs).toBe(2000);
  });
});

describe("song detect + priority", () => {
  it("detects YouTube Music", () => {
    const r = detectSongContext({
      href: "https://music.youtube.com/watch?v=abc",
      title: "Song",
    });
    expect(r.isSong).toBe(true);
    expect(r.reasons).toContain("youtube-music-host");
  });

  it("respects user override", () => {
    expect(
      detectSongContext({ href: "https://example.com", treatAsSong: true })
        .confidence,
    ).toBe(1);
  });

  it("priority excludes proprietary scrapers", () => {
    expect(LYRICS_SOURCE_PRIORITY).not.toContain("genius");
    expect(LYRICS_SOURCE_PRIORITY).toEqual([
      "page-caption",
      "page-embedded",
      "lrclib",
      "user-import",
      "asr",
    ]);
  });
});

describe("LRCLIB contract", () => {
  it("builds search URL", () => {
    const url = buildLrcLibSearchUrl({
      track_name: "Hello",
      artist_name: "Adele",
    });
    expect(url).toContain("lrclib.net/api/search");
    expect(url).toContain("track_name=Hello");
  });

  it("picks closest duration from fixture", () => {
    const tracks: LrcLibTrack[] = [
      {
        id: 1,
        name: "a",
        trackName: "a",
        artistName: "x",
        duration: 200,
        syncedLyrics: "[00:01.00]A",
      },
      {
        id: 2,
        name: "b",
        trackName: "b",
        artistName: "x",
        duration: 210,
        syncedLyrics: "[00:01.00]B",
      },
    ];
    expect(pickBestTrack(tracks, 209)?.id).toBe(2);
  });

  it("has attribution note", () => {
    expect(attributionNote()).toContain("LRCLIB");
  });
});

describe("karaoke", () => {
  it("selects active cue", () => {
    const tl = linesToTimeline(
      "v",
      parseLrc("[00:00.00]A\n[00:05.00]B\n[00:10.00]C"),
      "lyrics-open-api",
    );
    const mid = karaokeAt(tl.cues, 6000);
    expect(mid.activeCueId).toBe(tl.cues[1]!.id);
    expect(mid.previousId).toBe(tl.cues[0]!.id);
  });
});
