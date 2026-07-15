import { describe, expect, it } from "vitest";
import {
  buildNodePath,
  makeSegment,
  RestoreTable,
  segmentPlainBlocks,
  shouldSkipElement,
} from "../segmenter.js";
import { canonicalUrl, fnv1a, segmentCacheKey } from "../hash.js";
import { buildAppliedMap, mockTranslateSegment, resolveDisplayText } from "../apply.js";

describe("page-translate hash", () => {
  it("hashes stably", () => {
    expect(fnv1a("hello")).toBe(fnv1a("hello"));
    expect(fnv1a("hello")).not.toBe(fnv1a("world"));
  });

  it("canonicalizes tracking params", () => {
    const c = canonicalUrl(
      "https://example.com/path?utm_source=x&q=1&fbclid=abc#hash",
    );
    expect(c).toContain("q=1");
    expect(c).not.toContain("utm_source");
    expect(c).not.toContain("fbclid");
    expect(c).not.toContain("#hash");
  });

  it("builds cache keys", () => {
    const key = segmentCacheKey({
      canonicalUrl: "https://ex.com/",
      modelId: "hy-mt2-1.8b",
      modelRevision: "r1",
      sourceLang: "en",
      targetLang: "ja",
      textHash: "abcd",
    });
    expect(key.split("|")).toHaveLength(6);
  });
});

describe("segmenter", () => {
  it("skips script/style by default", () => {
    expect(shouldSkipElement("SCRIPT")).toBe(true);
    expect(shouldSkipElement("P")).toBe(false);
    expect(shouldSkipElement("CODE")).toBe(true);
    expect(shouldSkipElement("CODE", { skipCodePre: false })).toBe(false);
  });

  it("builds paths and segments", () => {
    const path = buildNodePath([
      { tag: "BODY", index: 0 },
      { tag: "P", index: 1 },
      { tag: "#text", index: 0 },
    ]);
    const seg = makeSegment(path, "  Hello world  ");
    expect(seg?.originalText).toBe("Hello world");
    expect(seg?.id.startsWith("seg_")).toBe(true);
  });

  it("segments plain blocks", () => {
    const segs = segmentPlainBlocks([
      { path: "0.P", text: "One" },
      { path: "1.P", text: "   " },
      { path: "2.P", text: "Two 🍎" },
    ]);
    expect(segs).toHaveLength(2);
    expect(segs[1]?.originalText).toContain("🍎");
  });

  it("restore table round-trips", () => {
    const segs = segmentPlainBlocks([{ path: "0", text: "Alpha" }]);
    const table = new RestoreTable(
      segs.map((s) => ({
        segmentId: s.id,
        originalText: s.originalText,
        path: s.path,
      })),
    );
    expect(table.size).toBe(1);
    expect(table.get(segs[0]!.id)?.originalText).toBe("Alpha");
  });
});

describe("display modes", () => {
  it("supports original/translated/dual", () => {
    expect(resolveDisplayText("original", "A", "B").text).toBe("A");
    expect(resolveDisplayText("translated", "A", "B").text).toBe("B");
    const dual = resolveDisplayText("dual", "A", "B");
    expect(dual.text).toBe("B");
    expect(dual.title).toBe("A");
  });

  it("mock translator preserves numbers and urls", () => {
    const t = mockTranslateSegment("Pay 12.50 at https://pay.example/", "es");
    expect(t).toContain("12.50");
    expect(t).toContain("https://pay.example/");
  });

  it("builds applied map from restore + results", () => {
    const segs = segmentPlainBlocks([{ path: "0", text: "Hello" }]);
    const table = new RestoreTable(
      segs.map((s) => ({
        segmentId: s.id,
        originalText: s.originalText,
        path: s.path,
      })),
    );
    const applied = buildAppliedMap("translated", table, [
      {
        id: segs[0]!.id,
        translatedText: "Hola",
        confidence: 0.9,
        provisional: false,
      },
    ]);
    expect(applied[0]?.displayText).toBe("Hola");
  });
});
