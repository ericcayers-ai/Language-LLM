import {
  test as base,
  chromium,
  type Browser,
  type BrowserContext,
} from "@playwright/test";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const extensionRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const extensionPath = join(extensionRoot, ".output", "chrome-mv3");

type Fixtures = {
  /** Plain Chromium — local HTML fixtures only (CI-safe headless). */
  pageContext: BrowserContext;
  /** Extension-loaded context (may be headed; skipped when build missing / headless-only CI). */
  extensionContext: BrowserContext;
  extensionId: string;
};

export const test = base.extend<Fixtures>({
  // eslint-disable-next-line no-empty-pattern
  pageContext: async ({}, use) => {
    const browser: Browser = await chromium.launch({
      headless: true,
    });
    const context = await browser.newContext();
    await use(context);
    await context.close();
    await browser.close();
  },
  // eslint-disable-next-line no-empty-pattern
  extensionContext: async ({}, use, testInfo) => {
    testInfo.skip(
      !existsSync(extensionPath),
      `Extension build missing at ${extensionPath}`,
    );
    testInfo.skip(
      process.env.VERIFY_EXTENSION_HEADED !== "1" && !!process.env.CI,
      "Extension load requires VERIFY_EXTENSION_HEADED=1 in CI (Chromium MV3 + headed/xvfb)",
    );
    const context = await chromium.launchPersistentContext("", {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        "--no-first-run",
        "--disable-default-apps",
      ],
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ extensionContext }, use) => {
    let sw = extensionContext.serviceWorkers()[0];
    if (!sw) {
      sw = await extensionContext.waitForEvent("serviceworker", {
        timeout: 15_000,
      });
    }
    const id = sw.url().split("/")[2] ?? "";
    await use(id);
  },
});

export { expect } from "@playwright/test";

export function fixtureUrl(name: string): string {
  const path = join(dirname(fileURLToPath(import.meta.url)), "fixtures", name);
  return `file://${path.replace(/\\/g, "/")}`;
}
