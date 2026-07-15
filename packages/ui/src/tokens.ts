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
  paper: "#F7F8FA",
  signalBlue: "#2F6FED",
  amberEvidence: "#C47B17",
  errorRed: "#B42318",
  mutedSlate: "#667085",
} as const;

export const darkColors = {
  ink: "#F2F4F7",
  paper: "#12141A",
  signalBlue: "#5B8DEF",
  amberEvidence: "#E0A03A",
  errorRed: "#F04438",
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
    paper: "--llm-paper",
    signalBlue: "--llm-signal-blue",
    amberEvidence: "--llm-amber-evidence",
    errorRed: "--llm-error-red",
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
