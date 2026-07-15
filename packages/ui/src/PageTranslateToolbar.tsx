import type { CSSProperties, HTMLAttributes } from "react";
import { Button } from "./Button.js";
import { colors, fonts } from "./tokens.js";

export type PageTranslateMode = "original" | "translated" | "dual";

export interface PageTranslateToolbarProps
  extends HTMLAttributes<HTMLElement> {
  mode: PageTranslateMode;
  targetLang: string;
  progress?: number;
  statusMessage?: string;
  localProcessing?: boolean;
  failureMessage?: string;
  onModeChange: (mode: PageTranslateMode) => void;
  onRestore: () => void;
  onTargetLangChange?: (lang: string) => void;
  onRetry?: () => void;
  languages?: Array<{ code: string; label: string }>;
}

const DEFAULT_LANGS = [
  { code: "en", label: "English" },
  { code: "ja", label: "日本語" },
  { code: "zh", label: "中文" },
  { code: "ko", label: "한국어" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
];

export function PageTranslateToolbar({
  mode,
  targetLang,
  progress,
  statusMessage,
  localProcessing = false,
  failureMessage,
  onModeChange,
  onRestore,
  onTargetLangChange,
  onRetry,
  languages = DEFAULT_LANGS,
  style,
  className,
  ...rest
}: PageTranslateToolbarProps) {
  const rootStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
    fontFamily: fonts.ui,
    color: colors.ink,
    background: `color-mix(in srgb, ${colors.paper} 94%, transparent)`,
    border: `1px solid color-mix(in srgb, ${colors.mutedSlate} 40%, transparent)`,
    borderRadius: 2,
    padding: "0.55rem 0.7rem",
    boxShadow: `0 2px 12px color-mix(in srgb, ${colors.ink} 18%, transparent)`,
    maxWidth: "min(36rem, 96vw)",
    pointerEvents: "auto",
    ...style,
  };

  const modes: Array<{ id: PageTranslateMode; label: string }> = [
    { id: "original", label: "Original" },
    { id: "translated", label: "Translated" },
    { id: "dual", label: "Dual" },
  ];

  return (
    <div
      role="toolbar"
      aria-label="Page translation"
      className={["llm-motion-safe", className].filter(Boolean).join(" ")}
      style={rootStyle}
      {...rest}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.35rem",
          alignItems: "center",
        }}
      >
        {modes.map((m) => (
          <Button
            key={m.id}
            variant={mode === m.id ? "primary" : "ghost"}
            aria-pressed={mode === m.id}
            onClick={() => onModeChange(m.id)}
            style={{ padding: "0.35rem 0.65rem", fontSize: "0.8125rem" }}
          >
            {m.label}
          </Button>
        ))}
        <Button
          variant="ghost"
          onClick={onRestore}
          style={{ padding: "0.35rem 0.65rem", fontSize: "0.8125rem" }}
        >
          Restore
        </Button>
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: "0.8125rem",
            marginLeft: "auto",
          }}
        >
          <span className="llm-sr-only">Target language</span>
          <select
            className="llm-focus-ring"
            value={targetLang}
            aria-label="Target language"
            onChange={(e) => onTargetLangChange?.(e.target.value)}
            style={{
              fontFamily: fonts.ui,
              fontSize: "0.8125rem",
              padding: "0.3rem 0.4rem",
              border: `1px solid ${colors.mutedSlate}`,
              borderRadius: 2,
              background: colors.paper,
              color: colors.ink,
            }}
          >
            {languages.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {(localProcessing || progress != null || statusMessage) && (
        <div
          style={{
            fontSize: "0.75rem",
            color: colors.mutedSlate,
            fontFamily: fonts.mono,
          }}
          aria-live="polite"
        >
          {localProcessing ? "Local processing… " : null}
          {progress != null ? `${Math.round(progress * 100)}% ` : null}
          {statusMessage ?? null}
        </div>
      )}

      {failureMessage ? (
        <div
          role="alert"
          style={{
            fontSize: "0.8125rem",
            color: colors.errorRed,
            display: "flex",
            gap: "0.5rem",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <span>{failureMessage}</span>
          {onRetry ? (
            <Button
              variant="danger"
              onClick={onRetry}
              style={{ padding: "0.3rem 0.55rem", fontSize: "0.75rem" }}
            >
              Retry
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
