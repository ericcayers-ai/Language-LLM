import { useMemo, useState, type HTMLAttributes, type KeyboardEvent } from "react";
import { colors, fonts } from "./tokens.js";

export interface TranscriptItem {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
  translationText?: string;
  active?: boolean;
  uncertain?: boolean;
  provenance?: string;
}

export interface TranscriptListProps extends HTMLAttributes<HTMLDivElement> {
  items: TranscriptItem[];
  onSelectCue?: (id: string) => void;
  /** When set, shows a filter input above the list. */
  searchable?: boolean;
  followActive?: boolean;
  emptyLabel?: string;
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
  searchable = false,
  followActive = true,
  emptyLabel = "No transcript cues yet.",
  style,
  className,
  ...rest
}: TranscriptListProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.text.toLowerCase().includes(q) ||
        (item.translationText?.toLowerCase().includes(q) ?? false),
    );
  }, [items, query]);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, id: string) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelectCue?.(id);
    }
  };

  return (
    <div
      className={className}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
        fontFamily: fonts.ui,
        color: colors.ink,
        background: colors.paper,
        ...style,
      }}
      {...rest}
    >
      {searchable ? (
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="llm-sr-only">Search transcript</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search transcript"
            className="llm-focus-ring"
            style={{
              fontFamily: fonts.ui,
              fontSize: "0.875rem",
              padding: "0.45rem 0.6rem",
              border: `1px solid ${colors.mutedSlate}`,
              borderRadius: 2,
              background: colors.paper,
              color: colors.ink,
            }}
          />
        </label>
      ) : null}

      {filtered.length === 0 ? (
        <p
          role="status"
          style={{ margin: 0, fontSize: "0.875rem", color: colors.mutedSlate }}
        >
          {items.length === 0 ? emptyLabel : "No cues match this search."}
        </p>
      ) : (
        <div role="list" aria-label="Transcript" aria-busy={false}>
          {filtered.map((item) => (
            <div key={item.id} role="listitem">
              <button
                type="button"
                className="llm-focus-ring"
                aria-current={item.active ? "true" : undefined}
                aria-label={`${formatTs(item.startMs)} ${item.text}`}
                ref={
                  followActive && item.active
                    ? (el) => {
                        el?.scrollIntoView?.({
                          block: "nearest",
                          behavior: "smooth",
                        });
                      }
                    : undefined
                }
                onClick={() => onSelectCue?.(item.id)}
                onKeyDown={(e) => onKeyDown(e, item.id)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  display: "grid",
                  gridTemplateColumns: "3.5rem 1fr",
                  gap: "0.5rem",
                  padding: "0.4rem 0.5rem",
                  marginBottom: "0.35rem",
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
                    color: item.uncertain
                      ? colors.amberEvidence
                      : colors.mutedSlate,
                  }}
                >
                  {formatTs(item.startMs)}
                </span>
                <span>
                  <span style={{ fontSize: "0.9375rem", lineHeight: 1.4 }}>
                    {item.text}
                  </span>
                  {item.translationText ? (
                    <span
                      style={{
                        display: "block",
                        fontSize: "0.8125rem",
                        color: colors.mutedSlate,
                        marginTop: 2,
                      }}
                    >
                      {item.translationText}
                    </span>
                  ) : null}
                  {item.provenance ? (
                    <span
                      data-llm-chrome="diagnostics"
                      style={{
                        display: "block",
                        fontFamily: fonts.mono,
                        fontSize: "0.7rem",
                        color: colors.mutedSlate,
                        marginTop: 2,
                      }}
                    >
                      {item.provenance}
                    </span>
                  ) : null}
                </span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
