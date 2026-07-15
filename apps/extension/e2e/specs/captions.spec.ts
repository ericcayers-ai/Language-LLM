import { expect, fixtureUrl, test } from "../fixtures";

test.describe("caption fixtures (local)", () => {
  test("caption present page exposes fixture marker", async ({
    pageContext,
  }) => {
    const page = await pageContext.newPage();
    await page.goto(fixtureUrl("caption-present.html"));
    await expect(
      page.locator("[data-llm-fixture='captions-present']"),
    ).toHaveText(/Hello from fixture/);
    await expect(page.locator("#captions")).toHaveCount(1);
  });

  test("caption absent page has no track and marks absent", async ({
    pageContext,
  }) => {
    const page = await pageContext.newPage();
    await page.goto(fixtureUrl("caption-absent.html"));
    await expect(
      page.locator("[data-llm-fixture='captions-absent']"),
    ).toBeVisible();
    await expect(page.locator("track")).toHaveCount(0);
  });
});
