import type { CSSProperties } from "react";
import { colors } from "./tokens.js";

/** Shared focus-ring style object for non-class consumers. */
export const focusRingStyle: CSSProperties = {
  outline: "none",
  boxShadow: `0 0 0 3px color-mix(in srgb, ${colors.signalBlue} 55%, transparent)`,
};

export const focusRingClassName = "llm-focus-ring";
