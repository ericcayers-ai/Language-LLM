export interface PrivacyCheck {
  id: string;
  description: string;
  /** True when the behavior is policy-compliant. */
  passed: boolean;
  category:
    | "no-exfiltration"
    | "offline-inference"
    | "ephemeral-audio"
    | "explicit-download"
    | "local-store-wipe";
}

export interface PrivacyEvalReport {
  suite: "privacy";
  checkCount: number;
  passRate: number;
  failures: PrivacyCheck[];
}

export function evaluatePrivacyChecks(checks: PrivacyCheck[]): PrivacyEvalReport {
  const failures = checks.filter((c) => !c.passed);
  return {
    suite: "privacy",
    checkCount: checks.length,
    passRate: checks.length === 0 ? 1 : (checks.length - failures.length) / checks.length,
    failures,
  };
}

export function runPrivacyHarnessFixture(): PrivacyEvalReport {
  return evaluatePrivacyChecks([
    {
      id: "net-1",
      description: "Inference path performs zero network I/O after models are local",
      passed: true,
      category: "offline-inference",
    },
    {
      id: "audio-1",
      description: "Tab-capture audio stays in ring buffer unless user enables disk buffering",
      passed: true,
      category: "ephemeral-audio",
    },
    {
      id: "dl-1",
      description: "Model download requires explicit user action",
      passed: true,
      category: "explicit-download",
    },
    {
      id: "wipe-1",
      description: "User can wipe transcripts/translations/screenshots locally",
      passed: true,
      category: "local-store-wipe",
    },
    {
      id: "exfil-1",
      description: "WebSocket accepts loopback-only origins",
      passed: true,
      category: "no-exfiltration",
    },
  ]);
}
