/**
 * Adaptive density profiles — Focus / Balanced / Expert.
 * Encoded as CSS custom properties so hosts apply them without component forks.
 */

export type DensityProfile = "focus" | "balanced" | "expert";

export type ThemePreference = "light" | "dark" | "system";

export interface DensityTokenSet {
  typeScale: number;
  spaceScale: number;
  captionMaxCh: number;
  evidenceVisible: boolean;
  diagnosticsVisible: boolean;
  animationLevel: "none" | "reduced" | "full";
  chromeLevel: "minimal" | "essential" | "dense";
}

export const DENSITY_PROFILES: Record<DensityProfile, DensityTokenSet> = {
  focus: {
    typeScale: 1.05,
    spaceScale: 0.9,
    captionMaxCh: 42,
    evidenceVisible: false,
    diagnosticsVisible: false,
    animationLevel: "reduced",
    chromeLevel: "minimal",
  },
  balanced: {
    typeScale: 1,
    spaceScale: 1,
    captionMaxCh: 48,
    evidenceVisible: true,
    diagnosticsVisible: false,
    animationLevel: "full",
    chromeLevel: "essential",
  },
  expert: {
    typeScale: 0.94,
    spaceScale: 0.85,
    captionMaxCh: 56,
    evidenceVisible: true,
    diagnosticsVisible: true,
    animationLevel: "full",
    chromeLevel: "dense",
  },
};

export const DENSITY_STORAGE_KEY = "language-llm.density-profile";
export const THEME_STORAGE_KEY = "language-llm.theme";

export const DEFAULT_DENSITY: DensityProfile = "balanced";
export const DEFAULT_THEME: ThemePreference = "system";

export function isDensityProfile(value: unknown): value is DensityProfile {
  return value === "focus" || value === "balanced" || value === "expert";
}

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

/** CSS custom-property map for a density profile (apply on :host / :root). */
export function densityCssVars(
  profile: DensityProfile,
): Record<string, string> {
  const t = DENSITY_PROFILES[profile];
  return {
    "--llm-density": profile,
    "--llm-type-scale": String(t.typeScale),
    "--llm-space-scale": String(t.spaceScale),
    "--llm-caption-max-ch": String(t.captionMaxCh),
    "--llm-evidence-visible": t.evidenceVisible ? "1" : "0",
    "--llm-diagnostics-visible": t.diagnosticsVisible ? "1" : "0",
  };
}

export function profileLabel(profile: DensityProfile): string {
  switch (profile) {
    case "focus":
      return "Focus";
    case "balanced":
      return "Balanced";
    case "expert":
      return "Expert";
  }
}

export function profileDescription(profile: DensityProfile): string {
  switch (profile) {
    case "focus":
      return "Captions and essential actions only.";
    case "balanced":
      return "Overlay, transcript, lookup, and learning controls.";
    case "expert":
      return "Model provenance, timing, confidence, and queue diagnostics.";
  }
}
