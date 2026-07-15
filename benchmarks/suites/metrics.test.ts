import { describe, expect, it } from "vitest";
import { chrF, wordErrorRate, meanMidpointDriftMs } from "../src/metrics.js";
import { runAsrSyntheticMetricSmoke } from "./asr.js";
import { runMtSyntheticMetricSmoke } from "./mt.js";
import { runSubtitleSyntheticMetricSmoke } from "./subtitle.js";
import { runAmbiguitySyntheticMetricSmoke } from "./ambiguity.js";
import {
  contrastRatio,
  collectAccessibilityAssertions,
  runAccessibilityHarness,
} from "./accessibility.js";
import { runPrivacyHarness } from "./privacy.js";

describe("metric stubs", () => {
  it("computes WER", () => {
    expect(wordErrorRate("a b c", "a b c")).toBe(0);
    expect(wordErrorRate("a b c", "a x c")).toBeCloseTo(1 / 3, 5);
  });

  it("computes chrF-like score", () => {
    expect(chrF("hello", "hello")).toBeGreaterThan(0.9);
    expect(chrF("hello", "world")).toBeLessThan(0.5);
  });

  it("computes sync drift", () => {
    expect(
      meanMidpointDriftMs(
        [{ startMs: 0, endMs: 1000 }],
        [{ startMs: 100, endMs: 1100 }],
      ),
    ).toBe(100);
  });
});

describe("synthetic metric smokes (not release quality)", () => {
  it("runs fixture-metric-smoke suites", () => {
    expect(runAsrSyntheticMetricSmoke().sampleCount).toBe(2);
    expect(runMtSyntheticMetricSmoke().meanChrF).toBeGreaterThan(0);
    expect(runSubtitleSyntheticMetricSmoke().within100msRate).toBe(1);
    expect(runAmbiguitySyntheticMetricSmoke().precision).toBeLessThan(1);
  });
});

describe("accessibility / privacy source assertions", () => {
  it("computes real contrast from tokens.ts", () => {
    const checks = collectAccessibilityAssertions();
    const light = checks.find((c) => c.id === "contrast-light");
    expect(light?.passed).toBe(true);
    expect(contrastRatio("#111318", "#F7F8FA")).toBeGreaterThanOrEqual(4.5);
  });

  it("passes accessibility harness with real checks", () => {
    const report = runAccessibilityHarness();
    expect(report.classification).toBe("static-source-assertions");
    expect(report.failures).toEqual([]);
    expect(report.passRate).toBe(1);
  });

  it("passes privacy harness with real checks", () => {
    const report = runPrivacyHarness();
    expect(report.classification).toBe("static-source-assertions");
    expect(report.failures).toEqual([]);
    expect(report.passRate).toBe(1);
  });
});
