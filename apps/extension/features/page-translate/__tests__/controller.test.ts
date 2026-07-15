// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { createPageTranslateController } from "../controller";
import { absoluteNodePath, collectTextSegments } from "@language-llm/page-translate";
import type { PageSegment, PageTranslateSegmentResult } from "@language-llm/protocol";

describe("page-translate controller", () => {
  it("apply/restore uses the same paths as collectTextSegments", async () => {
    const doc = document.implementation.createHTMLDocument("page");
    doc.body.innerHTML = `<main><p>One</p><p>Two</p></main>`;

    const { segments } = collectTextSegments(doc.body, { skipCodePre: true });
    const translateSegments = async (
      segs: PageSegment[],
    ): Promise<PageTranslateSegmentResult[]> =>
      segs.map((s) => ({
        id: s.id,
        translatedText: `T:${s.originalText}`,
        confidence: 1,
        provisional: false,
      }));

    const controller = createPageTranslateController(doc, {
      translateSegments: async (segs, _lang, _url) => translateSegments(segs),
    });

    await controller.translateNow("fr");
    expect(controller.getMode()).toBe("translated");
    expect(doc.body.textContent).toContain("T:One");
    expect(doc.body.textContent).toContain("T:Two");

    controller.restore();
    expect(controller.getMode()).toBe("original");
    expect(doc.body.textContent).toContain("One");
    expect(doc.body.textContent).toContain("Two");
    expect(doc.body.textContent).not.toContain("T:");

    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    let n: Node | null;
    const collected = new Set(segments.map((s) => s.path));
    while ((n = walker.nextNode())) {
      const text = (n as Text).textContent?.trim();
      if (!text) continue;
      expect(collected.has(absoluteNodePath(n))).toBe(true);
    }

    controller.destroy();
  });
});
