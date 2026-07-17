import { useEffect, useRef, type HTMLAttributes } from "react";

export type StatusTone = "info" | "success" | "warn" | "error";

export interface StatusRegionProps extends HTMLAttributes<HTMLDivElement> {
  message: string;
  tone?: StatusTone;
  /** When true, also mirror into a polite aria-live for assistive tech. */
  announce?: boolean;
}

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
        className={["llm-status", "llm-motion-safe", className]
          .filter(Boolean)
          .join(" ")}
        style={style}
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
