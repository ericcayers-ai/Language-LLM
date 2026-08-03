import { useEffect, useRef, type HTMLAttributes } from "react";
import { fonts } from "./tokens.js";

export type StatusTone = "info" | "success" | "warn" | "error";

export interface StatusRegionProps extends HTMLAttributes<HTMLDivElement> {
  message: string;
  tone?: StatusTone;
  /** When true, also mirror into a polite aria-live for assistive tech. */
  announce?: boolean;
}

const toneColor: Record<StatusTone, string> = {
  info: "var(--llm-muted-slate)",
  success: "var(--llm-signal-blue)",
  warn: "var(--llm-amber-evidence)",
  error: "var(--llm-error-red)",
};

/**
 * Visible toast/status region. Visual updates are independent of 60fps caption ticks;
 * callers should set `message` only when outcomes change.
 */
export function StatusRegion({
  message,
  tone = "info",
  announce = true,
  style,
  className,
  ...rest
}: StatusRegionProps) {
  const liveRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!announce || !message || !liveRef.current) return;
    liveRef.current.textContent = "";
    // Force a re-announcement when the same string is re-posted.
    requestAnimationFrame(() => {
      if (liveRef.current) liveRef.current.textContent = message;
    });
  }, [announce, message]);

  if (!message) return null;

  return (
    <>
      <div
        role="status"
        data-llm-status={tone}
        className={["llm-motion-safe", className].filter(Boolean).join(" ")}
        style={{
          fontFamily: fonts.ui,
          fontSize: "0.8125rem",
          color: toneColor[tone],
          borderLeft: `3px solid ${toneColor[tone]}`,
          padding: "0.4rem 0.65rem",
          background: `color-mix(in srgb, ${toneColor[tone]} 8%, var(--llm-paper))`,
          ...style,
        }}
        {...rest}
      >
        {message}
      </div>
      {announce ? (
        <div ref={liveRef} className="llm-sr-only" aria-live="polite" />
      ) : null}
    </>
  );
}
