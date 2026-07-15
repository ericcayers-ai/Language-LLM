import { describe, expect, it } from "vitest";
import {
  cardsToCsv,
  createKnownWordTracker,
  createStudyCard,
  FSRS_DEFAULT_WEIGHTS,
  isKnown,
  markKnown,
  noteEncounter,
  retrievability,
  reviewFsrs,
  testAnkiConnect,
  toAnkiConnectNotes,
} from "../fsrs.js";

describe("FSRS-5 scheduler", () => {
  it("exposes reference weight vector length 19", () => {
    expect(FSRS_DEFAULT_WEIGHTS).toHaveLength(19);
  });

  it("schedules good reviews into the future with positive stability", () => {
    const card = createStudyCard({ id: "1", sourceText: "猫", translationText: "cat" });
    const next = reviewFsrs(card.fsrs, 3, 1_000_000);
    expect(next.state).toBe("review");
    expect(next.due).toBeGreaterThan(1_000_000);
    expect(next.reps).toBe(1);
    expect(next.stability).toBeGreaterThan(0);
    expect(next.scheduledDays).toBeGreaterThanOrEqual(1);
  });

  it("handles again as relearning", () => {
    const card = createStudyCard({ id: "1", sourceText: "犬" });
    const next = reviewFsrs(card.fsrs, 1);
    expect(next.state).toBe("relearning");
    expect(next.lapses).toBe(1);
  });

  it("increases interval after successive good reviews", () => {
    let state = createStudyCard({ id: "1", sourceText: "水" }).fsrs;
    const t0 = 1_000_000;
    state = reviewFsrs(state, 3, t0);
    const firstDue = state.due;
    state = reviewFsrs(state, 3, firstDue);
    expect(state.due - firstDue).toBeGreaterThanOrEqual(firstDue - t0);
  });

  it("computes retrievability between 0 and 1", () => {
    const r0 = retrievability(10, 0);
    const r1 = retrievability(10, 10);
    expect(r0).toBeCloseTo(1, 5);
    expect(r1).toBeLessThan(r0);
    expect(r1).toBeGreaterThan(0);
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

  it("AnkiConnect test fails gracefully without localhost service", async () => {
    const res = await testAnkiConnect("http://127.0.0.1:9", async () => {
      throw new Error("connection refused");
    });
    expect(res.ok).toBe(false);
    expect(res.error).toContain("connection refused");
  });
});
