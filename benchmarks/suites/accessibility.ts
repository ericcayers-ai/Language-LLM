import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface AccessibilityCheck {
  id: string;
  description: string;
  passed: boolean;
  wcag: "A" | "AA" | "AAA" | "best-practice";
  detail?: string;
}

export interface AccessibilityEvalReport {
  suite: "accessibility";
  checkCount: number;
  passRate: number;
  failures: AccessibilityCheck[];
  /** Honest classification: these checks assert in-repo surfaces, not a full AT audit. */
  classification: "static-source-assertions";
}

function relativeLuminance(hex: string): number {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const lin = (c: number) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  const R = lin(r);
  const G = lin(g);
  const B = lin(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

/** WCAG contrast ratio between two #RRGGBB colors. */
export function contrastRatio(fg: string, bg: string): number {
  const L1 = relativeLuminance(fg);
  const L2 = relativeLuminance(bg);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

function repoRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "../..");
}

function readRepo(...parts: string[]): string {
  return readFileSync(join(repoRoot(), ...parts), "utf8");
}

/** Parse a `name: "#rrggbb"` entry from tokens.ts color objects. */
function tokenHex(src: string, objectName: string, key: string): string {
  const block = src.match(
    new RegExp(`export const ${objectName}\\s*=\\s*\\{([\\s\\S]*?)\\n\\}`, "m"),
  )?.[1];
  if (!block) throw new Error(`missing ${objectName} in tokens.ts`);
  const hex = block.match(new RegExp(`${key}:\\s*"(#[0-9A-Fa-f]{6})"`))?.[1];
  if (!hex) throw new Error(`missing ${objectName}.${key}`);
  return hex;
}

export function evaluateAccessibilityChecks(
  checks: AccessibilityCheck[],
): AccessibilityEvalReport {
  const failures = checks.filter((c) => !c.passed);
  return {
    suite: "accessibility",
    checkCount: checks.length,
    passRate:
      checks.length === 0
        ? 1
        : (checks.length - failures.length) / checks.length,
    failures,
    classification: "static-source-assertions",
  };
}

/**
 * Real assertions against design tokens and UI source (not hardcoded passes).
 * Does not replace NVDA/VoiceOver/manual browser gates.
 */
export function collectAccessibilityAssertions(): AccessibilityCheck[] {
  const tokensTs = readRepo("packages/ui/src/tokens.ts");
  const tokensCss = readRepo("packages/ui/src/tokens.css");
  const captionSrc = readRepo("packages/ui/src/CaptionOverlay.tsx");
  const statusSrc = readRepo("packages/ui/src/StatusRegion.tsx");
  const transcriptSrc = readRepo("packages/ui/src/TranscriptList.tsx");
  const buttonSrc = readRepo("packages/ui/src/Button.tsx");
  const focusSrc = readRepo("packages/ui/src/FocusRing.ts");

  const lightInk = tokenHex(tokensTs, "colors", "ink");
  const lightPaper = tokenHex(tokensTs, "colors", "paper");
  const darkInk = tokenHex(tokensTs, "darkColors", "ink");
  const darkPaper = tokenHex(tokensTs, "darkColors", "paper");

  const lightContrast = contrastRatio(lightInk, lightPaper);
  const darkContrast = contrastRatio(darkInk, darkPaper);

  return [
    {
      id: "contrast-light",
      description: "Ink on Paper meets 4.5:1 contrast for body text (light)",
      passed: lightContrast >= 4.5,
      wcag: "AA",
      detail: `ratio=${lightContrast.toFixed(2)} (${lightInk}/${lightPaper})`,
    },
    {
      id: "contrast-dark",
      description: "Ink on Paper meets 4.5:1 contrast for body text (dark)",
      passed: darkContrast >= 4.5,
      wcag: "AA",
      detail: `ratio=${darkContrast.toFixed(2)} (${darkInk}/${darkPaper})`,
    },
    {
      id: "focus-1",
      description: "Interactive controls expose a visible focus ring class/style",
      passed:
        tokensCss.includes(".llm-focus-ring:focus-visible") &&
        buttonSrc.includes("llm-focus-ring") &&
        focusSrc.includes("focusRingStyle"),
      wcag: "AA",
    },
    {
      id: "live-1",
      description:
        "StatusRegion announces via aria-live=polite; CaptionOverlay can opt in",
      passed:
        statusSrc.includes('aria-live="polite"') &&
        captionSrc.includes('"aria-live": "polite"'),
      wcag: "AA",
    },
    {
      id: "keyboard-1",
      description: "Transcript list items are keyboard activatable (Enter/Space)",
      passed:
        transcriptSrc.includes('event.key === "Enter"') &&
        transcriptSrc.includes('event.key === " "') &&
        transcriptSrc.includes('role="listitem"') &&
        transcriptSrc.includes("onKeyDown"),
      wcag: "A",
    },
    {
      id: "motion-1",
      description: "tokens.css respects prefers-reduced-motion",
      passed:
        tokensCss.includes("@media (prefers-reduced-motion: reduce)") &&
        tokensCss.includes(".llm-motion-safe"),
      wcag: "best-practice",
    },
  ];
}

export function runAccessibilityHarness(): AccessibilityEvalReport {
  return evaluateAccessibilityChecks(collectAccessibilityAssertions());
}

/** @deprecated Use runAccessibilityHarness — name kept for import stability. */
export function runAccessibilityHarnessFixture(): AccessibilityEvalReport {
  return runAccessibilityHarness();
}
