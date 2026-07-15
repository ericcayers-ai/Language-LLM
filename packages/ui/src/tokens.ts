/**
 * Design tokens — Language-LLM
 *
 * Fonts (load in host app):
 * - Atkinson Hyperlegible — UI + captions
 * - Noto Sans — broad script coverage
 * - IBM Plex Mono — timestamps / evidence codes
 */

export const colors = {
  ink: "#111318",
  paper: "#F7F8FA",
  signalBlue: "#2F6FED",
  amberEvidence: "#C47B17",
  errorRed: "#B42318",
  mutedSlate: "#667085",
} as const;

export const fonts = {
  ui: '"Atkinson Hyperlegible", "Noto Sans", sans-serif',
  script: '"Noto Sans", "Atkinson Hyperlegible", sans-serif',
  mono: '"IBM Plex Mono", ui-monospace, monospace',
} as const;

export const tokens = {
  colors,
  fonts,
  cssVars: {
    ink: "--llm-ink",
    paper: "--llm-paper",
    signalBlue: "--llm-signal-blue",
    amberEvidence: "--llm-amber-evidence",
    errorRed: "--llm-error-red",
    mutedSlate: "--llm-muted-slate",
  },
} as const;

export type ColorToken = keyof typeof colors;
