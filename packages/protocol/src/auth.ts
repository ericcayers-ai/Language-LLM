import type {
  AuthHandshakeRequest,
  AuthHandshakeResponse,
  SessionToken,
} from "./types.js";
import { createAuthHandshakeFailure } from "./messages.js";
import { versionsCompatible } from "./compatibility.js";
import { PROTOCOL_VERSION } from "./version.js";

function getCrypto(): Crypto {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.getRandomValues === "function"
  ) {
    return globalThis.crypto;
  }
  throw new Error("Web Crypto API is required for session token generation");
}

/** Cryptographically random hex string (browser / Node 20+ Web Crypto). */
export function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  getCrypto().getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function createSessionToken(): SessionToken {
  return randomHex(32);
}

export function createNonce(bytes = 16): string {
  return randomHex(bytes);
}

export interface HandshakeValidationOk {
  ok: true;
  request: AuthHandshakeRequest;
}

export interface HandshakeValidationErr {
  ok: false;
  failure: ReturnType<typeof createAuthHandshakeFailure>;
}

export function validateHandshakeRequest(
  value: unknown,
  options?: { expectedExtensionId?: string; maxSkewMs?: number },
): HandshakeValidationOk | HandshakeValidationErr {
  if (typeof value !== "object" || value === null) {
    return {
      ok: false,
      failure: createAuthHandshakeFailure({
        code: "internal",
        message: "Handshake payload must be an object",
      }),
    };
  }

  const req = value as Partial<AuthHandshakeRequest>;
  if (req.type !== "auth.handshake.request") {
    return {
      ok: false,
      failure: createAuthHandshakeFailure({
        code: "internal",
        message: "Expected auth.handshake.request",
      }),
    };
  }

  if (
    typeof req.protocolVersion !== "string" ||
    typeof req.extensionId !== "string" ||
    typeof req.nonce !== "string" ||
    typeof req.requestedAtMs !== "number"
  ) {
    return {
      ok: false,
      failure: createAuthHandshakeFailure({
        code: "internal",
        message: "Handshake fields are incomplete",
      }),
    };
  }

  if (!versionsCompatible(req.protocolVersion, PROTOCOL_VERSION)) {
    return {
      ok: false,
      failure: createAuthHandshakeFailure({
        code: "version-mismatch",
        message: `Protocol major mismatch: client=${req.protocolVersion} companion=${PROTOCOL_VERSION}`,
      }),
    };
  }

  if (
    options?.expectedExtensionId &&
    req.extensionId !== options.expectedExtensionId
  ) {
    return {
      ok: false,
      failure: createAuthHandshakeFailure({
        code: "origin-rejected",
        message: "Extension id is not allowlisted",
      }),
    };
  }

  const maxSkew = options?.maxSkewMs ?? 120_000;
  const skew = Math.abs(Date.now() - req.requestedAtMs);
  if (skew > maxSkew) {
    return {
      ok: false,
      failure: createAuthHandshakeFailure({
        code: "rate-limited",
        message: "Handshake timestamp skew too large",
      }),
    };
  }

  if (req.nonce.length < 16) {
    return {
      ok: false,
      failure: createAuthHandshakeFailure({
        code: "internal",
        message: "Nonce too short",
      }),
    };
  }

  return {
    ok: true,
    request: req as AuthHandshakeRequest,
  };
}

export function isSessionToken(value: unknown): value is SessionToken {
  return typeof value === "string" && /^[a-f0-9]{32,128}$/i.test(value);
}

export function isHandshakeResponseValid(
  response: AuthHandshakeResponse,
  nowMs = Date.now(),
): boolean {
  return (
    response.ok === true &&
    versionsCompatible(response.protocolVersion, PROTOCOL_VERSION) &&
    isSessionToken(response.sessionToken) &&
    response.expiresAtMs > nowMs
  );
}
