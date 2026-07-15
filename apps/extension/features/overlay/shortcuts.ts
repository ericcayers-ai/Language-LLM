/**
 * Overlay keyboard map — pure so tests run without a DOM.
 * Target WCAG keyboard operation for caption/learn surfaces.
 */

export type OverlayShortcutAction =
  | { type: "toggle-source" }
  | { type: "toggle-translation" }
  | { type: "reveal-translation" }
  | { type: "mine-sentence" }
  | { type: "mark-known" }
  | { type: "focus-overlay" }
  | { type: "blur-overlay" }
  | { type: "announce-help" };

export interface ShortcutContext {
  /** True when the event target is an editable field. */
  inEditable: boolean;
  /** True when overlay host (or shadow) currently has focus. */
  overlayFocused: boolean;
  /** Modifier keys pressed. */
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

/**
 * Map a keydown to an overlay action.
 * Uses Alt+letter chords so we do not steal YouTube player keys when unfocused.
 * When the overlay itself is focused, single-letter keys also work.
 */
export function mapOverlayShortcut(
  key: string,
  ctx: ShortcutContext,
): OverlayShortcutAction | null {
  if (ctx.inEditable) return null;
  if (ctx.ctrlKey || ctx.metaKey) return null;

  const k = key.length === 1 ? key.toLowerCase() : key;
  const chord = ctx.altKey || ctx.overlayFocused;

  if (!chord && k !== "Escape") return null;

  switch (k) {
    case "s":
      return { type: "toggle-source" };
    case "t":
      return { type: "toggle-translation" };
    case "r":
      return { type: "reveal-translation" };
    case "m":
      return { type: "mine-sentence" };
    case "k":
      return { type: "mark-known" };
    case "/":
    case "?":
      return { type: "announce-help" };
    case "Escape":
      return ctx.overlayFocused ? { type: "blur-overlay" } : null;
    case "Enter":
      return ctx.overlayFocused ? null : { type: "focus-overlay" };
    default:
      return null;
  }
}

export const OVERLAY_SHORTCUT_HELP =
  "Alt+S source, Alt+T translation, Alt+R reveal, Alt+M mine, Alt+K known, Alt+? help, Esc blur";
