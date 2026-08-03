import type { CSSProperties } from "react";

/** Shared focus-ring style object for non-class consumers. */
export const focusRingStyle: CSSProperties = {
  outline: "none",
  boxShadow: `0 0 0 3px color-mix(in srgb, var(--llm-signal-blue) 55%, transparent)`,
};

export const focusRingClassName = "llm-focus-ring";
