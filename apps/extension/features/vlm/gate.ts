import type { VlmCorrectionResponse } from "./review";
import { mockVlmCorrection, shouldInvokeVlm } from "./review";

export interface AmbiguitySpan {
  sourceText: string;
  draftText: string;
  confidence: number;
  /** Heuristic or model flag that visual context may resolve deixis/visible text. */
  flaggedAmbiguity: boolean;
  question: string;
  frameRefs: string[];
}

export interface VlmGateResult {
  invoked: boolean;
  reason: string;
  /** Final target text (draft or corrected). */
  targetText: string;
  evidence?: {
    summary: string;
    errorCategory: VlmCorrectionResponse["errorCategory"];
    confidence: number;
  };
  correction?: VlmCorrectionResponse;
}

const DEIXIS_RE =
  /\b(this|that|these|those|here|there|it|eso|esto|aquel|celle|celui)\b/i;

/**
 * Flag cue pairs that look like visual deixis so the gated VLM path can run.
 * Offline-safe: no frames required until companion vision path is live.
 */
export function flagVisualAmbiguity(
  sourceText: string,
  draftConfidence: number,
): boolean {
  return draftConfidence < 0.55 && DEIXIS_RE.test(sourceText);
}

/**
 * End-to-end VLM gate: decide, optionally invoke constrained mock correction,
 * and return evidence suitable for the overlay gutter.
 */
export function runVlmGate(
  span: AmbiguitySpan,
  profile: "lite" | "balanced" | "quality" | "workstation" = "balanced",
  correct: typeof mockVlmCorrection = mockVlmCorrection,
): VlmGateResult {
  const invoke = shouldInvokeVlm({
    confidence: span.confidence,
    flaggedAmbiguity: span.flaggedAmbiguity,
    profile,
  });

  if (!invoke) {
    return {
      invoked: false,
      reason: span.flaggedAmbiguity
        ? "gate-skipped-profile-or-confidence"
        : "no-ambiguity",
      targetText: span.draftText,
    };
  }

  const frames =
    span.frameRefs.length > 0 ? span.frameRefs : ["mock-frame:active-cue"];
  const correction = correct({
    sourceText: span.sourceText,
    draftText: span.draftText,
    question: span.question,
    frameRefs: frames,
  });

  // Mock path: if draft looked like deixis, prefer a slightly more specific gloss.
  const targetText =
    correction.errorCategory === "none" && DEIXIS_RE.test(span.sourceText)
      ? `${span.draftText} [visual-ref]`
      : correction.correctedTargetText;

  return {
    invoked: true,
    reason: "ambiguity-gated",
    targetText,
    evidence: {
      summary: correction.evidenceSummary,
      errorCategory: correction.errorCategory,
      confidence: correction.confidence,
    },
    correction: {
      ...correction,
      correctedTargetText: targetText,
      errorCategory:
        correction.errorCategory === "none" ? "deixis" : correction.errorCategory,
    },
  };
}

/**
 * Apply VLM evidence across a batch of MT drafts (caption → MT → optional VLM).
 */
export function applyVlmGateToDrafts(input: {
  sources: string[];
  drafts: string[];
  confidences?: number[];
  profile?: "lite" | "balanced" | "quality" | "workstation";
}): {
  texts: string[];
  /** Per-cue evidence summary (empty string when gate not invoked). */
  evidenceByIndex: string[];
  invokedCount: number;
} {
  const texts: string[] = [];
  const evidenceByIndex: string[] = [];
  let invokedCount = 0;

  for (let i = 0; i < input.sources.length; i++) {
    const source = input.sources[i] ?? "";
    const draft = input.drafts[i] ?? source;
    const confidence = input.confidences?.[i] ?? 0.5;
    const flagged = flagVisualAmbiguity(source, confidence);
    const result = runVlmGate(
      {
        sourceText: source,
        draftText: draft,
        confidence,
        flaggedAmbiguity: flagged,
        question: `Resolve visual referent in: ${source.slice(0, 80)}`,
        frameRefs: [],
      },
      input.profile ?? "balanced",
    );
    texts.push(result.targetText);
    if (result.invoked && result.evidence) {
      invokedCount += 1;
      evidenceByIndex.push(result.evidence.summary);
    } else {
      evidenceByIndex.push("");
    }
  }

  return { texts, evidenceByIndex, invokedCount };
}
