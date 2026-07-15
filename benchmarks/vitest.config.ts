import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["suites/**/*.test.ts", "src/**/*.test.ts"],
  },
});
