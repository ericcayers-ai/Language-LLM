/**
 * Inlineable token CSS for Shadow DOM hosts (no constructable stylesheet required).
 * Kept in sync with tokens.css conceptually; inject into every shadow root.
 */
export const TOKENS_CSS = `
:host, .llm-shadow-root {
  --llm-ink: #111318;
  --llm-ink-secondary: #3d4450;
  --llm-paper: #f7f8fa;
  --llm-surface: #ffffff;
  --llm-surface-raised: #eef0f4;
  --llm-border: color-mix(in srgb, #667085 32%, transparent);
  --llm-border-strong: color-mix(in srgb, #667085 55%, transparent);
  --llm-signal-blue: #2f6fed;
  --llm-signal-blue-hover: #255fd4;
  --llm-signal-blue-soft: color-mix(in srgb, #2f6fed 12%, transparent);
  --llm-amber-evidence: #c47b17;
  --llm-amber-soft: color-mix(in srgb, #c47b17 12%, transparent);
  --llm-error-red: #b42318;
  --llm-error-soft: color-mix(in srgb, #b42318 12%, transparent);
  --llm-success: #0f7a4c;
  --llm-success-soft: color-mix(in srgb, #0f7a4c 12%, transparent);
  --llm-muted-slate: #667085;
  --llm-font-ui: "Atkinson Hyperlegible", "Noto Sans", "Segoe UI", sans-serif;
  --llm-font-script: "Noto Sans", "Noto Sans JP", "Noto Sans SC", "Noto Sans KR",
    "Noto Sans Arabic", "Atkinson Hyperlegible", sans-serif;
  --llm-font-mono: "IBM Plex Mono", ui-monospace, "Cascadia Mono", monospace;
  --llm-focus-ring: 0 0 0 3px color-mix(in srgb, var(--llm-signal-blue) 55%, transparent);
  --llm-focus-offset: 2px;
  --llm-space-1: calc(0.25rem * var(--llm-space-scale, 1));
  --llm-space-2: calc(0.5rem * var(--llm-space-scale, 1));
  --llm-space-3: calc(0.75rem * var(--llm-space-scale, 1));
  --llm-space-4: calc(1rem * var(--llm-space-scale, 1));
  --llm-radius: 4px;
  --llm-radius-lg: 8px;
  --llm-overlay-max-width: min(42rem, 92vw);
  --llm-ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --llm-duration-fast: 120ms;
  --llm-density: balanced;
  --llm-type-scale: 1;
  --llm-space-scale: 1;
  --llm-caption-max-ch: 48;
  --llm-evidence-visible: 1;
  --llm-diagnostics-visible: 0;
  font-family: var(--llm-font-ui);
  color: var(--llm-ink);
}

:host([data-llm-theme="dark"]), .llm-shadow-root[data-llm-theme="dark"] {
  --llm-ink: #f2f4f7;
  --llm-ink-secondary: #c5cad3;
  --llm-paper: #12141a;
  --llm-surface: #1a1d26;
  --llm-surface-raised: #232733;
  --llm-border: color-mix(in srgb, #98a2b3 35%, transparent);
  --llm-border-strong: color-mix(in srgb, #98a2b3 55%, transparent);
  --llm-signal-blue: #5b8def;
  --llm-signal-blue-hover: #7aa3f5;
  --llm-signal-blue-soft: color-mix(in srgb, #5b8def 18%, transparent);
  --llm-amber-evidence: #e0a03a;
  --llm-amber-soft: color-mix(in srgb, #e0a03a 16%, transparent);
  --llm-error-red: #f04438;
  --llm-error-soft: color-mix(in srgb, #f04438 16%, transparent);
  --llm-success: #3dd68c;
  --llm-success-soft: color-mix(in srgb, #3dd68c 16%, transparent);
  --llm-muted-slate: #98a2b3;
}

:host([data-llm-density="focus"]), .llm-shadow-root[data-llm-density="focus"] {
  --llm-density: focus;
  --llm-type-scale: 1.05;
  --llm-space-scale: 0.9;
  --llm-caption-max-ch: 42;
  --llm-evidence-visible: 0;
  --llm-diagnostics-visible: 0;
}

:host([data-llm-density="balanced"]), .llm-shadow-root[data-llm-density="balanced"] {
  --llm-density: balanced;
  --llm-type-scale: 1;
  --llm-space-scale: 1;
  --llm-caption-max-ch: 48;
  --llm-evidence-visible: 1;
  --llm-diagnostics-visible: 0;
}

:host([data-llm-density="expert"]), .llm-shadow-root[data-llm-density="expert"] {
  --llm-density: expert;
  --llm-type-scale: 0.94;
  --llm-space-scale: 0.85;
  --llm-caption-max-ch: 56;
  --llm-evidence-visible: 1;
  --llm-diagnostics-visible: 1;
}

:host([data-llm-density="focus"]) [data-llm-chrome="learning"],
:host([data-llm-density="focus"]) [data-llm-chrome="diagnostics"],
:host([data-llm-density="focus"]) [data-llm-chrome="evidence"],
:host([data-llm-density="focus"]) [data-llm-chrome="nonessential"],
.llm-shadow-root[data-llm-density="focus"] [data-llm-chrome="learning"],
.llm-shadow-root[data-llm-density="focus"] [data-llm-chrome="diagnostics"],
.llm-shadow-root[data-llm-density="focus"] [data-llm-chrome="evidence"],
.llm-shadow-root[data-llm-density="focus"] [data-llm-chrome="nonessential"] {
  display: none !important;
}

:host([data-llm-density="balanced"]) [data-llm-chrome="diagnostics"],
.llm-shadow-root[data-llm-density="balanced"] [data-llm-chrome="diagnostics"] {
  display: none !important;
}

.llm-focus-ring:focus-visible {
  outline: none;
  box-shadow: var(--llm-focus-ring);
  outline-offset: var(--llm-focus-offset);
}

.llm-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.llm-btn {
  font-family: var(--llm-font-ui);
  font-size: calc(0.875rem * var(--llm-type-scale, 1));
  font-weight: 600;
  line-height: 1.3;
  padding: 0.5rem 0.9rem;
  border-radius: var(--llm-radius);
  cursor: pointer;
}
.llm-btn:disabled { cursor: not-allowed; opacity: 0.55; }
.llm-btn--primary {
  background: var(--llm-signal-blue);
  color: #fff;
  border: 1px solid var(--llm-signal-blue);
}
.llm-btn--ghost {
  background: transparent;
  color: var(--llm-ink);
  border: 1px solid var(--llm-border-strong);
}
.llm-btn--danger {
  background: var(--llm-error-red);
  color: #fff;
  border: 1px solid var(--llm-error-red);
}

.llm-status {
  font-family: var(--llm-font-ui);
  font-size: 0.8125rem;
  padding: 0.5rem 0.75rem;
  border-radius: var(--llm-radius);
  border: 1px solid var(--llm-border);
  background: var(--llm-surface);
  color: var(--llm-ink-secondary);
}
.llm-status[data-llm-status="success"] {
  background: var(--llm-success-soft);
  color: var(--llm-success);
}
.llm-status[data-llm-status="warn"] {
  background: var(--llm-amber-soft);
  color: var(--llm-amber-evidence);
}
.llm-status[data-llm-status="error"] {
  background: var(--llm-error-soft);
  color: var(--llm-error-red);
}

.llm-motion-safe {
  transition: opacity 120ms ease, filter 120ms ease;
}

@media (prefers-reduced-motion: reduce) {
  .llm-motion-safe {
    transition: none !important;
    animation: none !important;
  }
}
`;

/** Inject (or replace) a style element with TOKENS_CSS into a shadow root. */
export function injectTokenStyles(shadowRoot: ShadowRoot): HTMLStyleElement {
  let style = shadowRoot.querySelector<HTMLStyleElement>(
    "style[data-llm-tokens]",
  );
  if (!style) {
    style = document.createElement("style");
    style.setAttribute("data-llm-tokens", "true");
    shadowRoot.prepend(style);
  }
  style.textContent = TOKENS_CSS;
  return style;
}
