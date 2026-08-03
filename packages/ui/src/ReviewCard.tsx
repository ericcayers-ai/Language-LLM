import { useState, type HTMLAttributes } from "react";
import { Button } from "./Button.js";
import { fonts } from "./tokens.js";

export interface ReviewCardProps extends HTMLAttributes<HTMLDivElement> {
  sourceText: string;
  translationText?: string;
  onRate: (rating: 1 | 2 | 3 | 4) => void;
  onSkip?: () => void;
}

/** Front → reveal → rating FSRS review surface. */
export function ReviewCard({
  sourceText,
  translationText,
  onRate,
  onSkip,
  style,
  className,
  ...rest
}: ReviewCardProps) {
  const [revealed, setRevealed] = useState(false);

  return (
    <div
      className={className}
      style={{
        fontFamily: fonts.ui,
        color: "var(--llm-ink)",
        background: "var(--llm-paper)",
        border: `1px solid color-mix(in srgb, var(--llm-muted-slate) 35%, transparent)`,
        borderRadius: 2,
        padding: "0.75rem",
        ...style,
      }}
      {...rest}
    >
      <p style={{ margin: "0 0 0.5rem", fontSize: "1rem", lineHeight: 1.4 }}>
        {sourceText}
      </p>
      {revealed ? (
        <>
          <p
            style={{
              margin: "0 0 0.75rem",
              fontSize: "0.875rem",
              color: "var(--llm-muted-slate)",
            }}
          >
            {translationText ?? "(no translation)"}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {(
              [
                [1, "Again"],
                [2, "Hard"],
                [3, "Good"],
                [4, "Easy"],
              ] as const
            ).map(([rating, label]) => (
              <Button
                key={rating}
                variant={rating === 1 ? "danger" : "ghost"}
                onClick={() => {
                  onRate(rating);
                  setRevealed(false);
                }}
              >
                {label}
              </Button>
            ))}
            {onSkip ? (
              <Button variant="ghost" onClick={onSkip}>
                Skip
              </Button>
            ) : null}
          </div>
        </>
      ) : (
        <Button variant="primary" onClick={() => setRevealed(true)}>
          Reveal
        </Button>
      )}
    </div>
  );
}
