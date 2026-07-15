import { describe, expect, it } from "vitest";
import {
  PROTOCOL_VERSION,
  charactersPerSecond,
  checkVersionSkew,
  clampCueTiming,
  createAuthHandshakeRequest,
  createAuthHandshakeResponse,
  createNonce,
  createSessionToken,
  cueDurationMs,
  cuesOverlap,
  isHandshakeResponseValid,
  mergeAdjacentCues,
  meanSyncDriftMs,
  overlapMs,
  parseCriticalWsMessage,
  validateHandshakeRequest,
  versionsCompatible,
} from "../index.js";
import type { Cue } from "../types.js";

describe("protocol version", () => {
  it("exposes 1.0.0", () => {
    expect(PROTOCOL_VERSION).toBe("1.0.0");
  });

  it("requires matching majors", () => {
    expect(versionsCompatible("1.2.3", "1.0.0")).toBe(true);
    expect(versionsCompatible("2.0.0", "1.0.0")).toBe(false);
    expect(checkVersionSkew("1.9.0").kind).toBe("compatible");
    expect(checkVersionSkew("0.1.0").kind).toBe("major-mismatch");
  });
});

describe("auth handshake shapes", () => {
  it("builds and validates a request", () => {
    const req = createAuthHandshakeRequest({
      extensionId: "abcdefghijklmnopqrstuvwxyzabcdef",
      nonce: createNonce(),
    });
    expect(req.type).toBe("auth.handshake.request");
    expect(req.protocolVersion).toBe(PROTOCOL_VERSION);
    const validated = validateHandshakeRequest(req, {
      expectedExtensionId: req.extensionId,
    });
    expect(validated.ok).toBe(true);
  });

  it("rejects major version skew", () => {
    const req = createAuthHandshakeRequest({
      extensionId: "ext",
      nonce: createNonce(),
    });
    req.protocolVersion = "9.0.0";
    const validated = validateHandshakeRequest(req);
    expect(validated.ok).toBe(false);
    if (!validated.ok) {
      expect(validated.failure.code).toBe("version-mismatch");
    }
  });

  it("round-trips response token validity", () => {
    const token = createSessionToken();
    const res = createAuthHandshakeResponse({
      sessionToken: token,
      expiresAtMs: Date.now() + 60_000,
      companionBuild: "0.1.0",
    });
    expect(isHandshakeResponseValid(res)).toBe(true);
    const parsed = parseCriticalWsMessage(res);
    expect(parsed.success).toBe(true);
  });
});

describe("cue math", () => {
  const a: Cue = {
    id: "a",
    startMs: 0,
    endMs: 1000,
    text: "hello world",
    provenance: "human-caption",
  };
  const b: Cue = {
    id: "b",
    startMs: 900,
    endMs: 1500,
    text: "again",
    provenance: "asr",
  };

  it("computes duration and cps", () => {
    expect(cueDurationMs(a)).toBe(1000);
    expect(charactersPerSecond(a)).toBeCloseTo(11, 5);
  });

  it("detects overlap", () => {
    expect(cuesOverlap(a, b)).toBe(true);
    expect(overlapMs(a, b)).toBe(100);
  });

  it("clamps and merges", () => {
    const clamped = clampCueTiming({ ...a, endMs: 50 }, { minDurationMs: 200 });
    expect(clamped.endMs - clamped.startMs).toBeGreaterThanOrEqual(200);
    const merged = mergeAdjacentCues([a, b], 200);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.text).toContain("hello");
  });

  it("computes mean sync drift", () => {
    const hyp = [{ startMs: 10, endMs: 1010 }];
    expect(meanSyncDriftMs([a], hyp)).toBe(10);
  });
});
