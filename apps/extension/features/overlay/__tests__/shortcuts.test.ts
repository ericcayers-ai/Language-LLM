import { describe, expect, it } from "vitest";
import {
  mapOverlayShortcut,
  OVERLAY_SHORTCUT_HELP,
} from "../shortcuts";

describe("overlay shortcuts", () => {
  const base = {
    inEditable: false,
    overlayFocused: false,
    altKey: true,
    ctrlKey: false,
    metaKey: false,
  };

  it("maps Alt+letter chords when overlay is not focused", () => {
    expect(mapOverlayShortcut("s", base)?.type).toBe("toggle-source");
    expect(mapOverlayShortcut("t", base)?.type).toBe("toggle-translation");
    expect(mapOverlayShortcut("r", base)?.type).toBe("reveal-translation");
    expect(mapOverlayShortcut("m", base)?.type).toBe("mine-sentence");
    expect(mapOverlayShortcut("k", base)?.type).toBe("mark-known");
    expect(mapOverlayShortcut("?", base)?.type).toBe("announce-help");
  });

  it("ignores bare letters when overlay unfocused and Alt not held", () => {
    expect(
      mapOverlayShortcut("s", { ...base, altKey: false }),
    ).toBeNull();
  });

  it("allows single letters when overlay is focused", () => {
    expect(
      mapOverlayShortcut("m", {
        ...base,
        altKey: false,
        overlayFocused: true,
      })?.type,
    ).toBe("mine-sentence");
  });

  it("ignores editable fields and ctrl/meta", () => {
    expect(
      mapOverlayShortcut("m", { ...base, inEditable: true }),
    ).toBeNull();
    expect(mapOverlayShortcut("m", { ...base, ctrlKey: true })).toBeNull();
  });

  it("blurs with Escape only when focused", () => {
    expect(
      mapOverlayShortcut("Escape", { ...base, overlayFocused: true })?.type,
    ).toBe("blur-overlay");
    expect(
      mapOverlayShortcut("Escape", { ...base, overlayFocused: false }),
    ).toBeNull();
  });

  it("exposes help string for live region", () => {
    expect(OVERLAY_SHORTCUT_HELP).toMatch(/Alt\+M mine/i);
  });
});
