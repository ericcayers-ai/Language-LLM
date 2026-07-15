import { describe, expect, it } from "vitest";
import { applyOverlayPatch, type OverlayState } from "../types";

describe("applyOverlayPatch", () => {
  it("clears optional fields when patch value is null", () => {
    const base: OverlayState = {
      showSource: true,
      showTranslation: true,
      blurTranslation: false,
      emptyKind: "no-captions",
      statusMessage: "waiting",
    };
    const next = applyOverlayPatch(base, {
      emptyKind: null,
      statusMessage: "ready",
    });
    expect(next.emptyKind).toBeUndefined();
    expect(next.statusMessage).toBe("ready");
    expect(next.showSource).toBe(true);
  });
});
