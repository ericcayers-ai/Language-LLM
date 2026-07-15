import { describe, expect, it } from "vitest";
import {
  applyVlmGateToDrafts,
  flagVisualAmbiguity,
  runVlmGate,
} from "../gate";
import { mockVlmCorrection } from "../review";

describe("VLM gate end-to-end (mocked vision)", () => {
  it("flags deixis on low confidence", () => {
    expect(flagVisualAmbiguity("look at that", 0.4)).toBe(true);
    expect(flagVisualAmbiguity("look at that", 0.9)).toBe(false);
    expect(flagVisualAmbiguity("the cat sat", 0.4)).toBe(false);
  });

  it("skips on lite profile even when flagged", () => {
    const result = runVlmGate(
      {
        sourceText: "that",
        draftText: "eso",
        confidence: 0.4,
        flaggedAmbiguity: true,
        question: "what is that?",
        frameRefs: ["frame-1"],
      },
      "lite",
    );
    expect(result.invoked).toBe(false);
    expect(result.targetText).toBe("eso");
  });

  it("invokes mock correction and returns evidence on balanced", () => {
    const result = runVlmGate(
      {
        sourceText: "that",
        draftText: "eso",
        confidence: 0.4,
        flaggedAmbiguity: true,
        question: "what is that?",
        frameRefs: ["frame-1"],
      },
      "balanced",
      mockVlmCorrection,
    );
    expect(result.invoked).toBe(true);
    expect(result.evidence?.summary).toMatch(/Stub VLM/);
    expect(result.targetText).toContain("[visual-ref]");
    expect(result.correction?.errorCategory).toBe("deixis");
  });

  it("applies per-cue evidence across a draft batch", () => {
    const batch = applyVlmGateToDrafts({
      sources: ["hello world", "look at that"],
      drafts: ["hola mundo", "mira eso"],
      profile: "balanced",
    });
    expect(batch.texts[0]).toBe("hola mundo");
    expect(batch.evidenceByIndex[0]).toBe("");
    expect(batch.invokedCount).toBe(1);
    expect(batch.texts[1]).toContain("[visual-ref]");
    expect(batch.evidenceByIndex[1]).toMatch(/Stub VLM/);
  });
});
