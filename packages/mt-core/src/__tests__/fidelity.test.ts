import { describe, expect, it } from "vitest";
import {
  mockMtDraft,
  routeMt,
  runFidelityChecks,
  windowCues,
} from "../fidelity.js";
import type { Cue } from "@language-llm/protocol";

const cue = (id: string, text: string): Cue => ({
  id,
  startMs: 0,
  endMs: 1000,
  text,
  provenance: "human-caption",
});

describe("fidelity", () => {
  it("flags dropped numbers", () => {
    const r = runFidelityChecks({
      sourceCues: [cue("1", "Pay 42 dollars")],
      targetTexts: ["Pay dollars"],
    });
    expect(r.ok).toBe(false);
    expect(r.checks.find((c) => c.kind === "missing-number")?.passed).toBe(
      false,
    );
  });

  it("passes when numbers preserved", () => {
    const r = runFidelityChecks({
      sourceCues: [cue("1", "Pay 42 dollars")],
      targetTexts: ["Pague 42 dólares"],
    });
    expect(r.checks.find((c) => c.kind === "missing-number")?.passed).toBe(
      true,
    );
  });
});

describe("router", () => {
  it("defaults to Hy-MT2 commercial", () => {
    const d = routeMt({
      sourceLang: "en",
      targetLang: "ja",
      profile: "balanced",
    });
    expect(d.adapter).toBe("hy-mt2");
    expect(d.licenseClass).toBe("commercial-default");
  });

  it("can prefer MADLAD for breadth", () => {
    expect(
      routeMt({
        sourceLang: "en",
        targetLang: "xx",
        profile: "lite",
        preferBroadCoverage: true,
      }),
    ).toMatchObject({ adapter: "madlad-400", modelId: "madlad-400-3b" });
    expect(
      routeMt({
        sourceLang: "en",
        targetLang: "xx",
        profile: "balanced",
        preferBroadCoverage: true,
      }).modelId,
    ).toBe("madlad-400-7b");
    expect(
      routeMt({
        sourceLang: "en",
        targetLang: "xx",
        profile: "workstation",
        preferBroadCoverage: true,
      }).modelId,
    ).toBe("madlad-400-10b");
  });
});

describe("window + mock", () => {
  it("windows cues", () => {
    const cues = [1, 2, 3, 4, 5].map((i) => cue(String(i), `t${i}`));
    const w = windowCues(cues, 2, 1);
    expect(w.window.map((c) => c.id)).toEqual(["2", "3", "4"]);
  });

  it("mock draft prefixes lang", () => {
    expect(mockMtDraft(["hi"], "fr")[0]).toBe("[fr] hi");
  });
});
