import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { fonts } from "./tokens.js";

export interface ContextRibbonItem {
  id: string;
  label: string;
  active?: boolean;
  confidence?: number;
}

export interface ContextRibbonProps extends HTMLAttributes<HTMLElement> {
  items: ContextRibbonItem[];
  evidenceSlot?: ReactNode;
  "aria-label"?: string;
}

export function ContextRibbon({
  items,
  evidenceSlot,
  style,
  className,
  "aria-label": ariaLabel = "Context ribbon",
  ...rest
}: ContextRibbonProps) {
  return (
    <nav
      role="navigation"
      aria-label={ariaLabel}
      className={["llm-motion-safe", className].filter(Boolean).join(" ")}
      style={{
        display: "grid",
        gridTemplateColumns: evidenceSlot ? "1fr auto" : "1fr",
        gap: "0.75rem",
        alignItems: "center",
        background: "var(--llm-paper)",
        color: "var(--llm-ink)",
        fontFamily: fonts.ui,
        padding: "0.5rem 0.75rem",
        borderBottom: `1px solid color-mix(in srgb, var(--llm-muted-slate) 35%, transparent)`,
        ...style,
      }}
      {...rest}
    >
      <ol
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          gap: "0.5rem",
          alignItems: "baseline",
          overflowX: "auto",
        }}
      >
        {items.map((item) => {
          const opacity = item.active ? 1 : 0.45;
          const itemStyle: CSSProperties = {
            opacity,
            fontWeight: item.active ? 700 : 500,
            color: item.active ? "var(--llm-ink)" : "var(--llm-muted-slate)",
            whiteSpace: "nowrap",
            maxWidth: item.active ? "28rem" : "10rem",
            overflow: "hidden",
            textOverflow: "ellipsis",
          };
          return (
            <li key={item.id} style={itemStyle} aria-current={item.active ? "true" : undefined}>
              <span>{item.label}</span>
              {typeof item.confidence === "number" ? (
                <span
                  style={{
                    marginLeft: "0.35rem",
                    fontFamily: fonts.mono,
                    fontSize: "0.75rem",
                    color: "var(--llm-amber-evidence)",
                  }}
                  aria-label={`Confidence ${Math.round(item.confidence * 100)} percent`}
                >
                  {Math.round(item.confidence * 100)}%
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
      {evidenceSlot}
    </nav>
  );
}
