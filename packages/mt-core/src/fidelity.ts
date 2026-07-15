import type { Cue, FidelityCheckResult, GlossaryEntry } from "@language-llm/protocol";

const NUMBER_RE = /\d+(?:[.,]\d+)?/g;
const URL_RE = /https?:\/\/[^\s]+/gi;

export function extractNumbers(text: string): string[] {
  return text.match(NUMBER_RE) ?? [];
}

export function extractUrls(text: string): string[] {
  return text.match(URL_RE) ?? [];
}

export function runFidelityChecks(input: {
  sourceCues: Cue[];
  targetTexts: string[];
  glossary?: GlossaryEntry[];
}): FidelityCheckResult {
  const checks: FidelityCheckResult["checks"] = [];
  const sourceJoined = input.sourceCues.map((c) => c.text).join(" ");
  const targetJoined = input.targetTexts.join(" ");

  const srcNums = new Set(extractNumbers(sourceJoined));
  const tgtNums = new Set(extractNumbers(targetJoined));
  const missingNums = [...srcNums].filter((n) => !tgtNums.has(n));
  const extraNums = [...tgtNums].filter((n) => !srcNums.has(n));
  checks.push({
    kind: "missing-number",
    passed: missingNums.length === 0,
    ...(missingNums.length ? { detail: missingNums.join(", ") } : {}),
  });
  checks.push({
    kind: "extra-number",
    passed: extraNums.length === 0,
    ...(extraNums.length ? { detail: extraNums.join(", ") } : {}),
  });

  const srcUrls = new Set(extractUrls(sourceJoined).map((u) => u.toLowerCase()));
  const tgtUrls = new Set(extractUrls(targetJoined).map((u) => u.toLowerCase()));
  const urlOk = [...srcUrls].every((u) => tgtUrls.has(u));
  checks.push({
    kind: "url-mismatch",
    passed: urlOk,
  });

  const empty = input.targetTexts.some((t) => !t.trim());
  checks.push({ kind: "empty-output", passed: !empty });

  const cueCountOk =
    input.targetTexts.length === 0 ||
    Math.abs(input.targetTexts.length - input.sourceCues.length) <=
      Math.max(2, Math.floor(input.sourceCues.length * 0.5));
  checks.push({ kind: "cue-count", passed: cueCountOk });

  if (input.glossary?.length) {
    for (const g of input.glossary.filter((x) => x.locked)) {
      const present = targetJoined.includes(g.target);
      checks.push({
        kind: "missing-name",
        passed: present,
        detail: `glossary:${g.source}->${g.target}`,
      });
    }
  }

  const passed = checks.filter((c) => c.passed).length;
  const score = checks.length ? passed / checks.length : 1;
  return { ok: checks.every((c) => c.passed), checks, score };
}

const CRITICAL_CHECK_KINDS = new Set([
  "empty-output",
  "missing-number",
  "url-mismatch",
]);

export function hasCriticalFidelityFailure(result: FidelityCheckResult): boolean {
  return result.checks.some(
    (c) => !c.passed && CRITICAL_CHECK_KINDS.has(c.kind),
  );
}

export function formatFidelityEvidence(result: FidelityCheckResult): string {
  return result.checks
    .filter((c) => !c.passed)
    .map((c) => `${c.kind}${c.detail ? `: ${c.detail}` : ""}`)
    .join("; ");
}

export type MtAdapterId = "hy-mt2" | "madlad-400" | "mock";

export interface MtRouteDecision {
  adapter: MtAdapterId;
  modelId: string;
  reason: string;
  licenseClass: "commercial-default" | "optional" | "research-opt-in";
}

export function routeMt(input: {
  sourceLang: string;
  targetLang: string;
  profile: "lite" | "balanced" | "quality" | "workstation";
  preferBroadCoverage?: boolean;
}): MtRouteDecision {
  if (input.preferBroadCoverage) {
    const modelId =
      input.profile === "lite"
        ? "madlad-400-3b"
        : input.profile === "workstation" || input.profile === "quality"
          ? "madlad-400-10b"
          : "madlad-400-7b";
    return {
      adapter: "madlad-400",
      modelId,
      reason: "broad-coverage-fallback",
      licenseClass: "commercial-default",
    };
  }
  // Hy-MT2 default for commercial-safe specialized pairs
  const size =
    input.profile === "lite"
      ? "1.8b"
      : input.profile === "workstation"
        ? "30b-a3b"
        : "7b";
  return {
    adapter: "hy-mt2",
    modelId: `hy-mt2-${size}`,
    reason: "commercial-specialized-default",
    licenseClass: "commercial-default",
  };
}

/**
 * Structured MT draft stub — real weights load in companion llama.cpp worker.
 * TODO(weights): load Hy-MT2 / MADLAD GGUF via llama.cpp; this stub keeps schema fidelity.
 */
export function mockMtDraft(
  texts: string[],
  targetLang: string,
): string[] {
  return texts.map((t) => `[${targetLang}] ${t}`);
}

export function windowCues(
  cues: Cue[],
  centerIndex: number,
  radius = 2,
): { window: Cue[]; preceding: Cue[]; following: Cue[] } {
  const start = Math.max(0, centerIndex - radius);
  const end = Math.min(cues.length, centerIndex + radius + 1);
  return {
    window: cues.slice(start, end),
    preceding: cues.slice(Math.max(0, start - radius), start),
    following: cues.slice(end, Math.min(cues.length, end + radius)),
  };
}
