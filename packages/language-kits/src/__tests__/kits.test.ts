import { describe, expect, it } from "vitest";
import {
  graphemeLength,
  highlightGraphemeRange,
  parseCcedictLine,
  parseJmdictTextLine,
  parseKaikkiLine,
  sliceGraphemes,
  numberedToToneMarked,
  attachFurigana,
  romanizeHangulText,
} from "../index.js";

describe("grapheme highlighting", () => {
  it("handles emoji as single graphemes (not UTF-16 halves)", () => {
    const text = "hi👍there";
    // "👍" is one grapheme but two UTF-16 code units
    expect(graphemeLength(text)).toBe(8);
    expect(sliceGraphemes(text, 2, 3)).toBe("👍");
    const hl = highlightGraphemeRange(text, { start: 2, end: 3 });
    expect(hl.match).toBe("👍");
    expect(hl.before).toBe("hi");
    expect(hl.after).toBe("there");
  });

  it("keeps combining marks with base characters", () => {
    const text = "cafe\u0301"; // e + combining acute
    expect(graphemeLength(text)).toBe(4);
    expect(sliceGraphemes(text, 3, 4)).toBe("e\u0301");
  });

  it("highlights CJK without code-unit slicing", () => {
    const text = "日本語テスト";
    const hl = highlightGraphemeRange(text, { start: 0, end: 3 });
    expect(hl.match).toBe("日本語");
    expect(hl.after).toBe("テスト");
  });

  it("handles ZWJ family emoji as one grapheme when Segmenter does", () => {
    const family = "👨‍👩‍👧‍👦";
    // Segmenter may report 1 grapheme for ZWJ sequences
    expect(graphemeLength(family)).toBeGreaterThanOrEqual(1);
    expect(sliceGraphemes(family, 0, graphemeLength(family))).toBe(family);
  });
});

describe("dictionary adapters", () => {
  it("parses Kaikki JSONL", () => {
    const line = JSON.stringify({
      word: "test",
      lang_code: "en",
      pos: "noun",
      senses: [{ glosses: ["a procedure"] }],
      sounds: [{ ipa: "/tɛst/" }],
    });
    const entry = parseKaikkiLine(line);
    expect(entry?.lemma).toBe("test");
    expect(entry?.senses[0]?.glosses[0]).toBe("a procedure");
    expect(entry?.pronunciations?.[0]?.value).toBe("/tɛst/");
  });

  it("parses JMdict text lines", () => {
    const entry = parseJmdictTextLine(
      "食べる [たべる] /(v1)/to eat/to live on (food)/",
    );
    expect(entry?.lemma).toBe("食べる");
    expect(entry?.readings?.[0]).toBe("たべる");
    expect(entry?.senses[0]?.glosses).toContain("to eat");
  });

  it("parses CC-CEDICT lines", () => {
    const entry = parseCcedictLine(
      "中國 中国 [Zhong1 guo2] /China/Middle Kingdom/",
    );
    expect(entry?.lemma).toBe("中国");
    expect(entry?.readings?.[0]).toBe("Zhong1 guo2");
    expect(entry?.senses[0]?.glosses).toContain("China");
  });
});

describe("script kits", () => {
  it("attaches furigana spans", () => {
    const ann = attachFurigana("今日は", "今日", "きょう");
    expect(ann?.span).toEqual({ start: 0, end: 2 });
    expect(ann?.reading).toBe("きょう");
  });

  it("marks pinyin tones", () => {
    expect(numberedToToneMarked("zhong1")).toBe("zhōng");
    expect(numberedToToneMarked("ma1")).toBe("mā");
    expect(numberedToToneMarked("ma3")).toBe("mǎ");
  });

  it("romanizes Hangul", () => {
    expect(romanizeHangulText("한글")).toMatch(/han/i);
  });
});
