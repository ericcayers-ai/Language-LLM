import { describe, expect, it } from "vitest";
import { predictDifficulty } from "../difficulty.js";

describe("predictDifficulty", () => {
  it("returns 1 when every token is known", () => {
    const known = new Set(["the", "cat", "sat", "on", "the", "mat"]);
    expect(predictDifficulty(known, ["the", "cat", "sat"])).toBe(1);
  });

  it("returns 10 when every token is unknown", () => {
    const known = new Set<string>();
    expect(predictDifficulty(known, ["x", "y", "z"])).toBe(10);
  });

  it("scales roughly with the unknown-token ratio", () => {
    const known = new Set(["a", "b", "c", "d", "e", "f", "g", "h"]);
    // 1 unknown of 8 tokens → low difficulty
    const low = predictDifficulty(known, ["a", "b", "c", "d", "e", "f", "g", "X"]);
    // 7 unknown of 8 tokens → high difficulty (use tokens that are NOT in known)
    const high = predictDifficulty(known, ["w", "x", "y", "z", "p", "q", "r", "a"]);
    expect(low).toBeLessThan(high);
  });

  it("always returns a value inside [1, 10]", () => {
    const known = new Set<string>(["a"]);
    for (const tokens of [
      ["a"],
      ["b"],
      ["a", "a", "a", "a"],
      ["b", "b", "b", "b"],
      ["a", "b"],
      ["b", "b", "b", "a"],
      [],
    ]) {
      const score = predictDifficulty(known, tokens);
      expect(score).toBeGreaterThanOrEqual(1);
      expect(score).toBeLessThanOrEqual(10);
    }
  });

  it("treats unknown casing as unknown (case-insensitive)", () => {
    const known = new Set(["hello"]);
    // "Hello" matches via case-insensitive comparison
    const score = predictDifficulty(known, ["Hello"]);
    expect(score).toBeLessThanOrEqual(2);
  });

  it("returns a mid-range score for a half-known sentence", () => {
    const known = new Set(["hello", "world"]);
    const tokens = ["hello", "world", "foo", "bar"];
    const score = predictDifficulty(known, tokens);
    expect(score).toBeGreaterThan(1);
    expect(score).toBeLessThan(10);
  });
});
