import { describe, expect, it, vi } from "vitest";
import {
  formatLookupHit,
  interpretCompanionPing,
  lexiconToCompanionEntries,
  lookupDictionary,
  wipePrivacy,
} from "../runtime";

describe("companion runtime glue", () => {
  it("labels ready vs degraded companion.ping responses", () => {
    expect(interpretCompanionPing({ ok: true, ws: true, port: 17321 })).toEqual(
      {
        ok: true,
        ready: true,
        degraded: false,
        port: 17321,
      },
    );
    expect(
      interpretCompanionPing({ ok: true, ws: false, bootstrap: { ok: true } }),
    ).toMatchObject({ ok: true, ready: false, degraded: true });
    expect(interpretCompanionPing({ ok: false, error: "down" })).toMatchObject({
      ok: false,
      ready: false,
      degraded: false,
      error: "down",
    });
  });

  it("maps lexicon entries for dictionary.import", () => {
    const rows = lexiconToCompanionEntries(
      [
        {
          id: "1",
          lemma: "猫",
          readings: ["ねこ"],
          senses: [{ glosses: ["cat"] }],
        },
      ],
      10,
    );
    expect(rows).toEqual([
      {
        id: "1",
        surface: "猫",
        reading: "ねこ",
        glossaryJson: '["cat"]',
      },
    ]);
  });

  it("formats dictionary lookup hits", () => {
    expect(
      formatLookupHit({
        surface: "猫",
        reading: "neko",
        glossaryJson: '["cat","feline"]',
      }),
    ).toBe("猫 [neko]: cat; feline");
  });

  it("routes dictionary.lookup and privacy.wipe through send", async () => {
    const send = vi.fn(async (message: Record<string, unknown>) => {
      if (message.type === "dictionary.lookup") {
        return {
          ok: true,
          result: {
            type: "dictionary.lookup",
            entries: [
              {
                id: "e1",
                dictionaryId: "d1",
                surface: String(message.surface),
                glossaryJson: '["hit"]',
              },
            ],
          },
        };
      }
      if (message.type === "privacy.wipe") {
        return { ok: true, result: { cleared: { study: 1 } } };
      }
      return { ok: false };
    });

    const lookup = await lookupDictionary("猫", send);
    expect(send).toHaveBeenCalledWith({
      type: "dictionary.lookup",
      surface: "猫",
    });
    expect(lookup.entries[0]?.surface).toBe("猫");

    const wipe = await wipePrivacy("study", send);
    expect(send).toHaveBeenCalledWith({ type: "privacy.wipe", scope: "study" });
    expect(wipe.ok).toBe(true);
  });
});
