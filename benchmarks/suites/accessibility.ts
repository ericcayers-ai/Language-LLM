export interface AccessibilityCheck {
  id: string;
  description: string;
  passed: boolean;
  wcag: "A" | "AA" | "AAA" | "best-practice";
}

export interface AccessibilityEvalReport {
  suite: "accessibility";
  checkCount: number;
  passRate: number;
  failures: AccessibilityCheck[];
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
  };
}

export function runAccessibilityHarnessFixture(): AccessibilityEvalReport {
  return evaluateAccessibilityChecks([
    {
      id: "focus-1",
      description: "Interactive overlay controls expose a visible focus ring",
      passed: true,
      wcag: "AA",
    },
    {
      id: "live-1",
      description: "Caption region uses aria-live=polite for cue updates",
      passed: true,
      wcag: "AA",
    },
    {
      id: "contrast-1",
      description: "Ink on Paper meets 4.5:1 contrast for body text",
      passed: true,
      wcag: "AA",
    },
    {
      id: "keyboard-1",
      description: "Transcript list items are keyboard activatable",
      passed: true,
      wcag: "A",
    },
    {
      id: "motion-1",
      description: "Respects prefers-reduced-motion",
      passed: true,
      wcag: "best-practice",
    },
  ]);
}
