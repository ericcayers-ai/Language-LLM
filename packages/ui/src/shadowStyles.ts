/**
 * Inlineable token CSS for Shadow DOM hosts (no constructable stylesheet required).
 * Kept in sync with tokens.css conceptually; inject into every shadow root.
 */
export const TOKENS_CSS = `
:host, .llm-shadow-root {
  --llm-ink: #111318;
  --llm-paper: #f7f8fa;
  --llm-signal-blue: #2f6fed;
  --llm-amber-evidence: #c47b17;
  --llm-error-red: #b42318;
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
  --llm-radius: 2px;
  --llm-overlay-max-width: min(42rem, 92vw);
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
  --llm-paper: #12141a;
  --llm-signal-blue: #5b8def;
  --llm-amber-evidence: #e0a03a;
  --llm-error-red: #f04438;
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
