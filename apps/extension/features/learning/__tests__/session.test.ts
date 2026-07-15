import { describe, expect, it } from "vitest";
import {
  createMemoryStudyStore,
  StudySession,
} from "../session";

describe("study session", () => {
  it("mines a sentence, tracks known words, and reviews with FSRS", async () => {
    const session = new StudySession(createMemoryStudyStore());
    await session.hydrate();

    const card = await session.mineSentence({
      sourceText: "that cat",
      translationText: "ese gato",
      videoId: "abc",
      tags: ["mined"],
    });
    expect(card.sourceText).toBe("that cat");
    expect(session.dueCards().length).toBe(1);

    await session.markSurfaceKnown("cat");
    expect(session.isSurfaceKnown("Cat")).toBe(true);

    const reviewed = await session.review(card.id, 3, 1_000_000);
    expect(reviewed?.fsrs.reps).toBe(1);
    expect(reviewed?.fsrs.due).toBeGreaterThan(1_000_000);

    const csv = session.exportCsv();
    expect(csv).toContain("that cat");
  });

  it("persists across hydrate", async () => {
    const store = createMemoryStudyStore();
    const a = new StudySession(store);
    await a.hydrate();
    await a.mineSentence({ sourceText: "ねこ", translationText: "cat" });

    const b = new StudySession(store);
    await b.hydrate();
    expect(b.listCards()).toHaveLength(1);
    expect(b.listCards()[0]?.sourceText).toBe("ねこ");
  });
});
