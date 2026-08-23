import { describe, expect, it } from "vitest";
import { cardsToCsvWithClips, parseClipCsv } from "../clipCard.js";
import { cardsToCsv, createStudyCard, reviewFsrs } from "../fsrs.js";

describe("clip-anchored SRS cards", () => {
  it("emits clip columns when at least one card has clip timestamps", () => {
    const card = createStudyCard({
      id: "c1",
      sourceText: "あの花はきれいだね",
      translationText: "That flower is beautiful",
      videoId: "vid",
    });
    const clipped = {
      ...card,
      videoClipStartMs: 12_500,
      videoClipEndMs: 16_000,
    };
    const csv = cardsToCsvWithClips([card, clipped]);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("source,translation,tags,due,videoClipStartMs,videoClipEndMs");
    expect(lines).toHaveLength(3);
    // Every row aligns to 6 columns when any card has clips
    expect(lines[1]?.split(",")).toHaveLength(6);
    expect(lines[2]?.split(",")).toHaveLength(6);
    // No-clip row leaves trailing clip fields blank
    expect(lines[1]?.endsWith(",,")).toBe(true);
    // Clipped row has the clip values at the end
    expect(lines[2]).toContain("12500");
    expect(lines[2]).toContain("16000");
    expect(lines[2]?.endsWith("12500,16000")).toBe(true);
  });

  it("round-trips clip metadata via parseClipCsv", () => {
    const card = createStudyCard({
      id: "c1",
      sourceText: "こんにちは",
      translationText: "hello",
    });
    const reviewed = reviewFsrs(card.fsrs, 3, 1_700_000_000_000);
    const clipped = {
      ...card,
      fsrs: reviewed,
      videoClipStartMs: 1000,
      videoClipEndMs: 4000,
    };
    const csv = cardsToCsvWithClips([clipped]);
    const parsed = parseClipCsv(csv);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.videoClipStartMs).toBe(1000);
    expect(parsed[0]?.videoClipEndMs).toBe(4000);
    expect(parsed[0]?.fsrs.due).toBe(reviewed.due);
    expect(parsed[0]?.sourceText).toBe("こんにちは");
  });

  it("falls back to legacy csv when the input has no clip columns", () => {
    const card = createStudyCard({ id: "c1", sourceText: "ありがとう" });
    const legacy = cardsToCsv([card]);
    const parsed = parseClipCsv(legacy);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.videoClipStartMs).toBeUndefined();
    expect(parsed[0]?.sourceText).toBe("ありがとう");
  });

  it("rejects a clip window where end <= start", () => {
    const card = createStudyCard({ id: "c1", sourceText: "x" });
    expect(() =>
      cardsToCsvWithClips([
        { ...card, videoClipStartMs: 2000, videoClipEndMs: 2000 },
      ]),
    ).toThrow();
  });
});
