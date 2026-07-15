/**
 * Selective VLM review — only for flagged visual ambiguity spans.
 * Constrained correction schema; never free-form full-scene translation.
 */

export interface VlmCorrectionRequest {
  sourceText: string;
  draftText: string;
  question: string;
  frameRefs: string[];
  maxTokens?: number;
}

export interface VlmCorrectionResponse {
  correctedTargetText: string;
  alignedSourceSpans: Array<{ start: number; end: number }>;
  errorCategory:
    | "deixis"
    | "visible-text"
    | "entity"
    | "none"
    | "other";
  confidence: number;
  evidenceSummary: string;
}

export function shouldInvokeVlm(input: {
  confidence: number;
  flaggedAmbiguity: boolean;
  profile: "lite" | "balanced" | "quality" | "workstation";
}): boolean {
  if (input.profile === "lite") return false;
  return input.flaggedAmbiguity && input.confidence < 0.55;
}

/**
 * Offline stub enforcing the constrained schema.
 * TODO(weights): load Qwen3.5 4B (or Gemma) via llama.cpp multimodal adapter.
 */
export function mockVlmCorrection(
  req: VlmCorrectionRequest,
): VlmCorrectionResponse {
  return {
    correctedTargetText: req.draftText,
    alignedSourceSpans: [{ start: 0, end: req.sourceText.length }],
    errorCategory: "none",
    confidence: 0.4,
    evidenceSummary: `Stub VLM; question=${req.question}; frames=${req.frameRefs.length}`,
  };
}

export function parseVlmJson(raw: string): VlmCorrectionResponse | null {
  try {
    const parsed = JSON.parse(raw) as VlmCorrectionResponse;
    if (
      typeof parsed.correctedTargetText !== "string" ||
      typeof parsed.confidence !== "number"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
