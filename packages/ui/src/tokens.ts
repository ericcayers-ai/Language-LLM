/**
 * Design tokens — Language-LLM
 *
 * Fonts (load in host app):
 * - Atkinson Hyperlegible — UI + captions
 * - Noto Sans — broad script coverage
 * - IBM Plex Mono — timestamps / evidence codes
 */

import type { DensityProfile } from "./density.js";
import { DENSITY_PROFILES } from "./density.js";

export const colors = {
  ink: "#111318",
  inkSecondary: "#3D4450",
  paper: "#F7F8FA",
  surface: "#FFFFFF",
  surfaceRaised: "#EEF0F4",
  signalBlue: "#2F6FED",
  amberEvidence: "#C47B17",
  errorRed: "#B42318",
  success: "#0F7A4C",
  mutedSlate: "#667085",
} as const;

export const darkColors = {
  ink: "#F2F4F7",
  inkSecondary: "#C5CAD3",
  paper: "#12141A",
  surface: "#1A1D26",
  surfaceRaised: "#232733",
  signalBlue: "#5B8DEF",
  amberEvidence: "#E0A03A",
  errorRed: "#F04438",
  success: "#3DD68C",
  mutedSlate: "#98A2B3",
} as const;

export const fonts = {
  ui: '"Atkinson Hyperlegible", "Noto Sans", "Segoe UI", sans-serif',
  script:
    '"Noto Sans", "Noto Sans JP", "Noto Sans SC", "Noto Sans KR", "Noto Sans Arabic", "Atkinson Hyperlegible", sans-serif',
  mono: '"IBM Plex Mono", ui-monospace, "Cascadia Mono", monospace',
} as const;

export const tokens = {
  colors,
  darkColors,
  fonts,
  density: DENSITY_PROFILES,
  cssVars: {
    ink: "--llm-ink",
    inkSecondary: "--llm-ink-secondary",
    paper: "--llm-paper",
    surface: "--llm-surface",
    surfaceRaised: "--llm-surface-raised",
    signalBlue: "--llm-signal-blue",
    amberEvidence: "--llm-amber-evidence",
    errorRed: "--llm-error-red",
    success: "--llm-success",
    mutedSlate: "--llm-muted-slate",
    density: "--llm-density",
    typeScale: "--llm-type-scale",
    spaceScale: "--llm-space-scale",
    captionMaxCh: "--llm-caption-max-ch",
  },
} as const;

export type ColorToken = keyof typeof colors;

/** Resolve whether a surface should show expert diagnostics. */
export function showDiagnostics(profile: DensityProfile): boolean {
  return DENSITY_PROFILES[profile].diagnosticsVisible;
}

/** Resolve whether a surface should show evidence gutters. */
export function showEvidence(profile: DensityProfile): boolean {
  return DENSITY_PROFILES[profile].evidenceVisible;
}
