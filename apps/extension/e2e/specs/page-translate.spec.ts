import { expect, fixtureUrl, test } from "../fixtures";

test.describe("page translate apply/restore (local fixture)", () => {
  test("apply then restore returns original text", async ({ pageContext }) => {
    const page = await pageContext.newPage();
    await page.goto(fixtureUrl("page-translate.html"));

    const before = await page.locator("#p1").textContent();
    await page.evaluate(() => {
      (
        window as unknown as {
          __llmPageTranslate: {
            apply: (t: Record<string, string>) => void;
          };
        }
      ).__llmPageTranslate.apply({
        p1: "[en] The quick brown fox jumps over the lazy dog.",
        title: "[en] Sample article",
      });
    });

    await expect(page.locator("#p1")).toHaveAttribute(
      "data-llm-translated",
      "1",
    );
    await expect(page.locator("html")).toHaveAttribute(
      "data-llm-mode",
      "translated",
    );

    await page.evaluate(() => {
      (
        window as unknown as { __llmPageTranslate: { restore: () => void } }
      ).__llmPageTranslate.restore();
    });

    await expect(page.locator("#p1")).toHaveText(before ?? "");
    await expect(page.locator("html")).toHaveAttribute(
      "data-llm-mode",
      "original",
    );
  });
});
