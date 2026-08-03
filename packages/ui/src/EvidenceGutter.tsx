import type { HTMLAttributes } from "react";
import { fonts } from "./tokens.js";

export interface EvidenceItem {
  id: string;
  label: string;
  detail?: string;
  severity?: "info" | "warn" | "error";
}

export interface EvidenceGutterProps extends HTMLAttributes<HTMLElement> {
  items: EvidenceItem[];
}

const severityColor = {
  info: "var(--llm-muted-slate)",
  warn: "var(--llm-amber-evidence)",
  error: "var(--llm-error-red)",
} as const;

export function EvidenceGutter({
  items,
  style,
  className,
  ...rest
}: EvidenceGutterProps) {
  return (
    <aside
      role="complementary"
      aria-label="Evidence gutter"
      className={className}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.35rem",
        minWidth: "9rem",
        maxWidth: "14rem",
        fontFamily: fonts.mono,
        fontSize: "0.75rem",
        color: "var(--llm-muted-slate)",
        borderLeft: `2px solid var(--llm-amber-evidence)`,
        paddingLeft: "0.5rem",
        ...style,
      }}
      {...rest}
    >
      {items.length === 0 ? (
        <span>No evidence</span>
      ) : (
        items.map((item) => {
          const sev = item.severity ?? "info";
          return (
            <div key={item.id} style={{ color: severityColor[sev] }}>
              <div style={{ fontWeight: 600 }}>{item.label}</div>
              {item.detail ? (
                <div style={{ color: "var(--llm-muted-slate)" }}>{item.detail}</div>
              ) : null}
            </div>
          );
        })
      )}
    </aside>
  );
}
