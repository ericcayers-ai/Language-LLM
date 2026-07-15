import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  detectDictionaryFormat,
  importDictionaryText,
  lookupLemma,
} from "../adapters/import.js";

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../fixtures",
);

function fixture(name: string): string {
  return readFileSync(join(fixturesDir, name), "utf8");
}

describe("dictionary import fixtures", () => {
  it("parses sample JMdict XML", () => {
    const text = fixture("sample.jmdict.xml");
    expect(detectDictionaryFormat(text)).toBe("jmdict-xml");
    const result = importDictionaryText(text, { filename: "sample.jmdict.xml" });
    expect(result.format).toBe("jmdict-xml");
    expect(result.entries.length).toBe(2);
    expect(lookupLemma(result.entries, "日本")?.senses[0]?.glosses).toContain(
      "Japan",
    );
  });

  it("parses sample JMdict text", () => {
    const text = fixture("sample.jmdict.txt");
    expect(detectDictionaryFormat(text)).toBe("jmdict-text");
    const result = importDictionaryText(text);
    expect(result.entries.map((e) => e.lemma)).toEqual(
      expect.arrayContaining(["日本", "食べる", "猫"]),
    );
  });

  it("parses sample CC-CEDICT", () => {
    const text = fixture("sample.ccedict.txt");
    expect(detectDictionaryFormat(text, { filename: "cedict_ts.u8" })).toBe(
      "cc-cedict",
    );
    const result = importDictionaryText(text);
    expect(lookupLemma(result.entries, "中国")?.readings?.[0]).toMatch(/Zhong/);
    expect(lookupLemma(result.entries, "猫")?.senses[0]?.glosses).toContain(
      "cat",
    );
  });

  it("parses sample Kaikki JSONL", () => {
    const text = fixture("sample.kaikki.jsonl");
    expect(detectDictionaryFormat(text)).toBe("kaikki-jsonl");
    const result = importDictionaryText(text);
    expect(result.entries).toHaveLength(3);
    expect(lookupLemma(result.entries, "cat")?.pronunciations?.[0]?.value).toBe(
      "/kæt/",
    );
  });

  it("returns unknown for empty garbage", () => {
    const result = importDictionaryText("???");
    expect(result.format).toBe("unknown");
    expect(result.entries).toEqual([]);
  });
});
