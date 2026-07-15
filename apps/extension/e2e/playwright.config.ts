import { defineConfig, devices } from "@playwright/test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const extensionPath = join(root, ".output", "chrome-mv3");

/**
 * Chrome-extension e2e against local HTML fixtures.
 * Requires a prior `pnpm --filter @language-llm/extension build`.
 * YouTube SPA / tabCapture are manual — see MANUAL_GATES.md.
 */
export default defineConfig({
  testDir: "./specs",
  timeout: 60_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium-extension",
      use: {
        ...devices["Desktop Chrome"],
        channel: process.env.PLAYWRIGHT_CHROME_CHANNEL ?? undefined,
      },
    },
  ],
  metadata: {
    extensionPath,
  },
});
