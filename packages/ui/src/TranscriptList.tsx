import type { HTMLAttributes, KeyboardEvent } from "react";
import { colors, fonts } from "./tokens.js";

export interface TranscriptItem {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
  active?: boolean;
  uncertain?: boolean;
}

export interface TranscriptListProps extends HTMLAttributes<HTMLDivElement> {
  items: TranscriptItem[];
  onSelectCue?: (id: string) => void;
}

function formatTs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function TranscriptList({
  items,
  onSelectCue,
  style,
  className,
  ...rest
}: TranscriptListProps) {
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, id: string) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelectCue?.(id);
    }
  };

  return (
    <div
      role="list"
      aria-label="Transcript"
      className={className}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.35rem",
        fontFamily: fonts.ui,
        color: colors.ink,
        background: colors.paper,
        ...style,
      }}
      {...rest}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="listitem"
          className="llm-focus-ring"
          aria-current={item.active ? "true" : undefined}
          aria-label={`${formatTs(item.startMs)} ${item.text}`}
          onClick={() => onSelectCue?.(item.id)}
          onKeyDown={(e) => onKeyDown(e, item.id)}
          style={{
            textAlign: "left",
            display: "grid",
            gridTemplateColumns: "3.5rem 1fr",
            gap: "0.5rem",
            padding: "0.4rem 0.5rem",
            border: "none",
            borderRadius: 2,
            cursor: "pointer",
            background: item.active
              ? `color-mix(in srgb, ${colors.signalBlue} 12%, ${colors.paper})`
              : "transparent",
            color: colors.ink,
          }}
        >
          <span
            style={{
              fontFamily: fonts.mono,
              fontSize: "0.75rem",
              color: item.uncertain ? colors.amberEvidence : colors.mutedSlate,
            }}
          >
            {formatTs(item.startMs)}
          </span>
          <span style={{ fontSize: "0.9375rem", lineHeight: 1.4 }}>{item.text}</span>
        </button>
      ))}
    </div>
  );
}
