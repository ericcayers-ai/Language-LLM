import { describe, expect, it } from "vitest";
import {
  createCompanionStudyStore,
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

  it("companion store syncs to authority with offline mirror", async () => {
    const offline = createMemoryStudyStore();
    let putPayload: unknown;
    const store = createCompanionStudyStore(offline, async (message) => {
      if (message.op === "list") {
        return {
          ok: true,
          result: {
            type: "study.sync.result",
            result: {
              ok: true,
              items: [
                {
                  id: "session",
                  kind: "study-session",
                  payload: {
                    cards: [
                      {
                        id: "remote",
                        sourceText: "remote",
                        tags: [],
                        provenance: "user-edit",
                        fsrs: {
                          due: 1,
                          stability: 1,
                          difficulty: 5,
                          elapsedDays: 0,
                          scheduledDays: 1,
                          reps: 0,
                          lapses: 0,
                          state: "new",
                        },
                        createdAtMs: 1,
                        updatedAtMs: 1,
                      },
                    ],
                    knownWords: ["hi"],
                  },
                },
              ],
            },
          },
        };
      }
      if (message.op === "put") {
        putPayload = message.payload;
        return { ok: true, result: { type: "study.sync.result", result: { ok: true } } };
      }
      return { ok: false, error: "unknown" };
    });
    const snap = await store.load();
    expect(snap.cards[0]?.sourceText).toBe("remote");
    expect(snap.knownWords).toContain("hi");
    await store.save({ cards: snap.cards, knownWords: ["hi", "yo"] });
    expect(putPayload).toMatchObject({ knownWords: ["hi", "yo"] });
    const mirrored = await offline.load();
    expect(mirrored.knownWords).toContain("yo");
  });
});
