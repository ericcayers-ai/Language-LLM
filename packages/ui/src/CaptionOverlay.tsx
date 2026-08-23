import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { fonts } from "./tokens.js";

export type CaptionProvenanceLabel =
  | "human"
  | "auto"
  | "asr"
  | "mt"
  | "lyrics"
  | "user"
  | "vlm";

export interface CaptionOverlayProps extends HTMLAttributes<HTMLDivElement> {
  /** Source-language caption line (optional). */
  sourceText?: string;
  /** Translated caption line (optional). */
  translationText?: string;
  /** Legacy: free-form lines; prefer sourceText/translationText. */
  lines?: string[];
  showSource?: boolean;
  showTranslation?: boolean;
  blurTranslation?: boolean;
  uncertain?: boolean;
  karaokeActive?: boolean;
  provenance?: CaptionProvenanceLabel | string;
  confidence?: number;
  /** Per-subtitle difficulty score (1..10) for the active learner. */
  difficulty?: number;
  fontScale?: number;
  opacity?: number;
  /** Evidence / VLM summary shown beside captions in Balanced/Expert. */
  evidenceSlot?: ReactNode;
  /**
   * When true, attach aria-live to the visual root.
   * Prefer false — host should announce via a separate status region.
   */
  liveRegion?: boolean;
}

function provenanceLabel(p: string): string {
  switch (p) {
    case "human":
    case "human-caption":
      return "human";
    case "auto":
    case "auto-caption":
      return "auto";
    case "asr":
    case "asr-live":
    case "asr-import":
      return "asr";
    case "mt":
      return "mt";
    case "lyrics":
    case "lyrics-open-api":
    case "lyrics-import":
      return "lyrics";
    case "user":
    case "user-edit":
      return "edited";
    case "vlm":
    case "vlm-corrected":
      return "vlm";
    default:
      return p;
  }
}

export function CaptionOverlay({
  sourceText,
  translationText,
  lines,
  showSource = true,
  showTranslation = true,
  blurTranslation = false,
  uncertain = false,
  karaokeActive = false,
  provenance,
  confidence,
  difficulty,
  fontScale = 1,
  opacity = 0.92,
  evidenceSlot,
  liveRegion = false,
  style,
  className,
  ...rest
}: CaptionOverlayProps) {
  const rootStyle: CSSProperties = {
    position: "relative",
    width: "var(--llm-overlay-max-width, min(42rem, 92vw))",
    maxWidth: "calc(var(--llm-caption-max-ch, 48) * 1ch)",
    margin: "0 auto",
    textAlign: "center",
    pointerEvents: "auto",
    fontFamily: fonts.script,
    color: "var(--llm-paper)",
    textShadow: `0 1px 2px var(--llm-ink)`,
    opacity,
    ...style,
  };

  const cueStyle = (extra?: CSSProperties): CSSProperties => ({
    margin: "0.15rem 0",
    padding: "0.45rem 0.85rem",
    background: `color-mix(in srgb, var(--llm-ink) 78%, transparent)`,
    fontSize: `calc(${1.15 * fontScale}rem * var(--llm-type-scale, 1))`,
    lineHeight: 1.35,
    borderRadius: 2,
    userSelect: "text",
    ...extra,
  });

  const legacyLines = lines?.slice(0, 2) ?? [];
  const hasStructured = sourceText != null || translationText != null;

  return (
    <div
      role="region"
      aria-label="Language-LLM captions"
      {...(liveRegion ? { "aria-live": "polite" as const } : {})}
      className={["llm-focus-ring", "llm-motion-safe", className]
        .filter(Boolean)
        .join(" ")}
      tabIndex={0}
      style={rootStyle}
      {...rest}
    >
      {uncertain || provenance || confidence != null || difficulty != null ? (
        <div
          data-llm-chrome="diagnostics"
          style={{
            display: "flex",
            justifyContent: "center",
            gap: "0.5rem",
            marginBottom: "0.25rem",
            fontFamily: fonts.mono,
            fontSize: "0.75rem",
            color: uncertain ? "var(--llm-amber-evidence)" : "var(--llm-muted-slate)",
          }}
        >
          {uncertain ? (
            <span aria-label="Uncertain translation">uncertain</span>
          ) : null}
          {provenance ? (
            <span aria-label={`Provenance ${provenanceLabel(provenance)}`}>
              {provenanceLabel(provenance)}
            </span>
          ) : null}
          {confidence != null ? (
            <span
              aria-label={`Confidence ${Math.round(confidence * 100)} percent`}
            >
              {Math.round(confidence * 100)}%
            </span>
          ) : null}
          {difficulty != null ? (
            <span aria-label={`Difficulty ${difficulty} of 10`}>
              difficulty {difficulty}/10
            </span>
          ) : null}
        </div>
      ) : null}

      {hasStructured ? (
        <>
          {showSource && sourceText ? (
            <p data-llm-source="1" style={cueStyle()}>
              {sourceText}
            </p>
          ) : null}
          {showTranslation && translationText ? (
            <p
              data-llm-translation="1"
              style={cueStyle({
                filter: blurTranslation ? "blur(6px)" : undefined,
                userSelect: blurTranslation ? "none" : "text",
                outline: karaokeActive
                  ? `2px solid var(--llm-signal-blue)`
                  : undefined,
                color: uncertain ? "var(--llm-amber-evidence)" : "var(--llm-paper)",
                boxShadow: `0 1px 0 color-mix(in srgb, var(--llm-signal-blue) 35%, transparent)`,
              })}
            >
              {translationText}
            </p>
          ) : null}
        </>
      ) : (
        legacyLines.map((line, i) => (
          <p key={`${i}-${line.slice(0, 12)}`} style={cueStyle()}>
            {line}
          </p>
        ))
      )}

      {evidenceSlot ? (
        <div data-llm-chrome="evidence" style={{ marginTop: "0.35rem" }}>
          {evidenceSlot}
        </div>
      ) : null}
    </div>
  );
}
