import { describe, expect, it } from "vitest";
import { chrF, wordErrorRate, meanMidpointDriftMs } from "../src/metrics.js";
import { runAsrHarnessFixture } from "./asr.js";
import { runMtHarnessFixture } from "./mt.js";
import { runSubtitleHarnessFixture } from "./subtitle.js";
import { runAmbiguityHarnessFixture } from "./ambiguity.js";
import { runPrivacyHarnessFixture } from "./privacy.js";
import { runAccessibilityHarnessFixture } from "./accessibility.js";

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

describe("harness fixtures", () => {
  it("runs all suites", () => {
    expect(runAsrHarnessFixture().sampleCount).toBe(2);
    expect(runMtHarnessFixture().meanChrF).toBeGreaterThan(0);
    expect(runSubtitleHarnessFixture().within100msRate).toBe(1);
    expect(runAmbiguityHarnessFixture().precision).toBeLessThan(1);
    expect(runPrivacyHarnessFixture().passRate).toBe(1);
    expect(runAccessibilityHarnessFixture().passRate).toBe(1);
  });
});
