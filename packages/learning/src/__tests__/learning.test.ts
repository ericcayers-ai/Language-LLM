import { describe, expect, it } from "vitest";
import {
  cardsToCsv,
  createKnownWordTracker,
  createStudyCard,
  isKnown,
  markKnown,
  noteEncounter,
  reviewFsrs,
  toAnkiConnectNotes,
} from "../fsrs.js";

describe("FSRS stub", () => {
  it("schedules good reviews into the future", () => {
    const card = createStudyCard({ id: "1", sourceText: "猫", translationText: "cat" });
    const next = reviewFsrs(card.fsrs, 3, 1_000_000);
    expect(next.state).toBe("review");
    expect(next.due).toBeGreaterThan(1_000_000);
    expect(next.reps).toBe(1);
  });

  it("handles again as relearning", () => {
    const card = createStudyCard({ id: "1", sourceText: "犬" });
    const next = reviewFsrs(card.fsrs, 1);
    expect(next.state).toBe("relearning");
    expect(next.lapses).toBe(1);
  });
});

describe("known words + export", () => {
  it("tracks known words", () => {
    const t = createKnownWordTracker(["the"]);
    noteEncounter(t, "Cat");
    markKnown(t, "Cat");
    expect(isKnown(t, "cat")).toBe(true);
  });

  it("exports csv and anki notes", () => {
    const cards = [
      createStudyCard({
        id: "1",
        sourceText: "hello, world",
        translationText: "hola",
        tags: ["greet"],
      }),
    ];
    const csv = cardsToCsv(cards);
    expect(csv.split("\n")[0]).toContain("source");
    expect(csv).toContain('"hello, world"');
    expect(toAnkiConnectNotes(cards)[0]?.fields.Front).toBe("hello, world");
  });
});
