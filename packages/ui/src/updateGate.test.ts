import { describe, expect, it } from "vitest";
import { overlayStateKey, shouldUpdateOverlay } from "./updateGate.js";

describe("overlay update gate", () => {
  it("ignores identical visual keys", () => {
    const a = {
      sourceId: "c1",
      translationText: "hello",
      showSource: true,
      showTranslation: true,
      blurTranslation: false,
      provenance: "human",
      confidence: 0.9,
      evidenceSummary: "",
      karaokeActive: false,
      jobState: "idle",
      density: "balanced",
    };
    expect(shouldUpdateOverlay(a, { ...a })).toBe(false);
  });

  it("updates when cue id or translation changes", () => {
    const base = {
      sourceId: "c1",
      translationText: "a",
      showSource: true,
      showTranslation: true,
      blurTranslation: false,
      provenance: "human",
      confidence: 0.9,
      evidenceSummary: "",
      karaokeActive: false,
      jobState: "idle",
      density: "balanced",
    };
    expect(shouldUpdateOverlay(base, { ...base, sourceId: "c2" })).toBe(true);
    expect(
      shouldUpdateOverlay(base, { ...base, translationText: "b" }),
    ).toBe(true);
    expect(overlayStateKey({ ...base, karaokeActive: true })).not.toBe(
      overlayStateKey(base),
    );
  });
});
