import { describe, expect, it } from "vitest";
import { colors, tokens } from "./tokens.js";
import {
  DENSITY_PROFILES,
  densityCssVars,
  isDensityProfile,
  profileLabel,
} from "./density.js";

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

  it("encodes Focus / Balanced / Expert density profiles", () => {
    expect(isDensityProfile("focus")).toBe(true);
    expect(isDensityProfile("balanced")).toBe(true);
    expect(isDensityProfile("expert")).toBe(true);
    expect(isDensityProfile("lite")).toBe(false);
    expect(DENSITY_PROFILES.focus.chromeLevel).toBe("minimal");
    expect(DENSITY_PROFILES.balanced.evidenceVisible).toBe(true);
    expect(DENSITY_PROFILES.expert.diagnosticsVisible).toBe(true);
    expect(profileLabel("expert")).toBe("Expert");
    expect(densityCssVars("focus")["--llm-density"]).toBe("focus");
  });
});
