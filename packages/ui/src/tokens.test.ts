import { describe, expect, it } from "vitest";
import { colors, tokens } from "./tokens.js";

describe("design tokens", () => {
  it("matches the brand palette exactly", () => {
    expect(colors.ink).toBe("#111318");
    expect(colors.paper).toBe("#F7F8FA");
    expect(colors.signalBlue).toBe("#2F6FED");
    expect(colors.amberEvidence).toBe("#C47B17");
    expect(colors.errorRed).toBe("#B42318");
    expect(colors.mutedSlate).toBe("#667085");
    expect(tokens.cssVars.ink).toBe("--llm-ink");
  });
});
