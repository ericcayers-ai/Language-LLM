import type { CSSProperties, HTMLAttributes } from "react";
import { colors, fonts } from "./tokens.js";

export interface CaptionOverlayProps extends HTMLAttributes<HTMLDivElement> {
  lines: string[];
  showSource?: boolean;
  uncertain?: boolean;
  fontScale?: number;
  opacity?: number;
}

export function CaptionOverlay({
  lines,
  showSource = false,
  uncertain = false,
  fontScale = 1,
  opacity = 0.92,
  style,
  className,
  ...rest
}: CaptionOverlayProps) {
  const rootStyle: CSSProperties = {
    position: "absolute",
    left: "50%",
    bottom: "8%",
    transform: "translateX(-50%)",
    width: "var(--llm-overlay-max-width, min(42rem, 92vw))",
    textAlign: "center",
    pointerEvents: "auto",
    fontFamily: fonts.script,
    color: colors.paper,
    textShadow: `0 1px 2px ${colors.ink}`,
    opacity,
    ...style,
  };

  return (
    <div
      role="region"
      aria-label={showSource ? "Source captions" : "Translated captions"}
      aria-live="polite"
      className={["llm-focus-ring", className].filter(Boolean).join(" ")}
      tabIndex={0}
      style={rootStyle}
      {...rest}
    >
      {uncertain ? (
        <span
          style={{
            display: "inline-block",
            marginBottom: "0.25rem",
            fontFamily: fonts.mono,
            fontSize: "0.75rem",
            color: colors.amberEvidence,
          }}
          aria-label="Uncertain translation"
        >
          uncertain
        </span>
      ) : null}
      {lines.slice(0, 2).map((line, i) => (
        <p
          key={`${i}-${line.slice(0, 12)}`}
          style={{
            margin: "0.1rem 0",
            padding: "0.15rem 0.5rem",
            background: `color-mix(in srgb, ${colors.ink} 72%, transparent)`,
            fontSize: `${1.15 * fontScale}rem`,
            lineHeight: 1.35,
            userSelect: "text",
          }}
        >
          {line}
        </p>
      ))}
    </div>
  );
}
