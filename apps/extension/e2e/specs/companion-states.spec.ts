import { expect, fixtureUrl, test } from "../fixtures";

test.describe("companion connection states (local fixture)", () => {
  test("cycles ready / degraded / failed stubs", async ({ pageContext }) => {
    const page = await pageContext.newPage();
    await page.goto(fixtureUrl("companion-states.html"));

    for (const state of [
      "ready",
      "degraded",
      "failed",
      "disconnected",
    ] as const) {
      await page.evaluate((s) => {
        (
          window as unknown as {
            __llmCompanionFixture: { set: (x: string) => void };
          }
        ).__llmCompanionFixture.set(s);
      }, state);
      await expect(
        page.locator("[data-llm-fixture='companion']"),
      ).toHaveAttribute("data-state", state);
    }
  });

  test("extension service worker is present when loaded", async ({
    extensionContext,
    extensionId,
  }) => {
    expect(extensionId.length).toBeGreaterThan(10);
    expect(extensionContext.serviceWorkers().length).toBeGreaterThan(0);
  });
});
