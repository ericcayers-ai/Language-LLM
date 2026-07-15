import { describe, expect, it } from "vitest";
import {
  absoluteNodePath,
  buildNodePath,
  collectTextSegments,
  RestoreTable,
} from "../segmenter.js";
import {
  buildAppliedMap,
  mockTranslateSegment,
  resolveDisplayText,
} from "../apply.js";

function applyTranslations(
  doc: Document,
  mode: "original" | "translated" | "dual",
  restore: RestoreTable,
  results: Array<{
    id: string;
    translatedText: string;
    confidence: number;
    provisional: boolean;
  }>,
): void {
  const applied = buildAppliedMap(mode, restore, results);
  const displayByPath = new Map<string, string>();
  for (const seg of applied) {
    const entry = restore.get(seg.id);
    if (entry) displayByPath.set(entry.path, seg.displayText);
  }
  const originalsByPath = restore.originalsByPath();
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  let n: Node | null;
  while ((n = walker.nextNode())) {
    const text = n as Text;
    if (!text.parentElement) continue;
    const path = absoluteNodePath(text);
    const display = displayByPath.get(path);
    if (display != null) {
      const original = originalsByPath.get(path) ?? text.textContent ?? "";
      const resolved = resolveDisplayText(mode, original, display);
      text.textContent = resolved.text;
    }
  }
}

function restoreDom(doc: Document, restore: RestoreTable): void {
  const originalsByPath = restore.originalsByPath();
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  let n: Node | null;
  while ((n = walker.nextNode())) {
    const text = n as Text;
    const path = absoluteNodePath(text);
    const original = originalsByPath.get(path);
    if (original != null) text.textContent = original;
  }
}

describe("DOM round-trip", () => {
  it("collects, applies, and restores nested DOM text", () => {
    const doc = document.implementation.createHTMLDocument("test");
    doc.body.innerHTML = `
      <div id="wrap">
        <p>Hello <span>world</span></p>
        <p>Second line</p>
      </div>
    `;

    const { segments, restore: entries } = collectTextSegments(doc.body, {
      skipCodePre: true,
    });
    expect(segments.length).toBeGreaterThanOrEqual(2);

    const restore = new RestoreTable(entries);
    const results = segments.map((s) => ({
      id: s.id,
      translatedText: mockTranslateSegment(s.originalText, "es"),
      confidence: 0.9,
      provisional: false,
    }));

    applyTranslations(doc, "translated", restore, results);

    const translatedTexts = Array.from(
      doc.body.querySelectorAll("p, span"),
    ).map((el) => el.textContent);
    for (const t of translatedTexts) {
      expect(t).toMatch(/^\[es\]/);
    }

    restoreDom(doc, restore);
    expect(doc.body.textContent).toContain("Hello");
    expect(doc.body.textContent).toContain("world");
    expect(doc.body.textContent).toContain("Second line");
    expect(doc.body.textContent).not.toMatch(/\[es\]/);
  });

  it("gives duplicate text nodes distinct paths and both translate", () => {
    const doc = document.implementation.createHTMLDocument("test");
    doc.body.innerHTML = `
      <div><p>Same</p></div>
      <div><p>Same</p></div>
    `;

    const { segments, restore: entries } = collectTextSegments(doc.body, {
      skipCodePre: true,
    });
    const sameSegs = segments.filter((s) => s.originalText === "Same");
    expect(sameSegs).toHaveLength(2);
    expect(sameSegs[0]!.path).not.toBe(sameSegs[1]!.path);

    const restore = new RestoreTable(entries);
    const results = segments.map((s) => ({
      id: s.id,
      translatedText: `[ja] ${s.originalText}`,
      confidence: 1,
      provisional: false,
    }));
    applyTranslations(doc, "translated", restore, results);

    const translated = Array.from(doc.body.querySelectorAll("p")).map(
      (p) => p.textContent,
    );
    expect(translated).toEqual(["[ja] Same", "[ja] Same"]);
  });

  it("absoluteNodePath matches collect paths for every text node", () => {
    const doc = document.implementation.createHTMLDocument("test");
    doc.body.innerHTML = `
      <article>
        <h1>Title</h1>
        <p>Alpha <em>beta</em> gamma</p>
      </article>
    `;

    const { segments } = collectTextSegments(doc.body, { skipCodePre: true });
    const collectPaths = new Set(segments.map((s) => s.path));

    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    let n: Node | null;
    const livePaths: string[] = [];
    while ((n = walker.nextNode())) {
      const text = (n as Text).textContent?.replace(/\s+/g, " ").trim();
      if (!text) continue;
      livePaths.push(absoluteNodePath(n));
    }

    for (const path of livePaths) {
      expect(collectPaths.has(path)).toBe(true);
    }
    expect(livePaths.length).toBe(collectPaths.size);
  });

  it("buildNodePath stays stable for unit-style paths", () => {
    const path = buildNodePath([
      { tag: "ROOT", index: 0 },
      { tag: "BODY", index: 0 },
      { tag: "P", index: 1 },
      { tag: "#text", index: 0 },
    ]);
    expect(path).toBe("0.ROOT/0.BODY/1.P/0.#text");
  });
});
