import {
  PROTOCOL_VERSION,
  createAuthHandshakeRequest,
  createJobSubmit,
  isAuthHandshakeResponse,
  isWsMessage,
} from "@language-llm/protocol";
import type { JobKind, SessionToken } from "@language-llm/protocol";

/** Companion loopback connection lifecycle (background authority). */
export type ConnectionState =
  | "disconnected"
  | "native-only"
  | "connecting"
  | "ready"
  | "degraded"
  | "incompatible"
  | "failed";

export interface CompanionSession {
  token: SessionToken;
  expiresAtMs: number;
  port: number;
  ws: WebSocket;
  send: (msg: unknown) => void;
  close: () => void;
  waitType: (type: string, timeoutMs?: number) => Promise<unknown>;
}

export const NATIVE_HOST_NAME = "com.languagellm.companion";

export interface BootstrapInfo {
  ok: boolean;
  port: number;
  bootstrapToken: string;
  protocolVersion: string;
}

const FAN_IN_TYPES = new Set([
  "timeline.source",
  "timeline.translation",
  "job.progress",
  "error",
  "lyrics.timeline",
  "job.result",
]);

let connectionState: ConnectionState = "disconnected";
const stateListeners = new Set<(state: ConnectionState) => void>();
const fanInHandlers = new Set<(msg: unknown) => void>();
let reconnectAttempt = 0;

export function getConnectionState(): ConnectionState {
  return connectionState;
}

/** Subscribe to connection state transitions. Returns unsubscribe. */
export function onStateChange(
  handler: (state: ConnectionState) => void,
): () => void {
  stateListeners.add(handler);
  return () => stateListeners.delete(handler);
}

/**
 * Persistent inbound fan-in for unpaired WS messages.
 * Contract: background forwards these to content as `companion.event`.
 */
export function onMessage(handler: (msg: unknown) => void): () => void {
  fanInHandlers.add(handler);
  return () => fanInHandlers.delete(handler);
}

function setConnectionState(next: ConnectionState): void {
  if (connectionState === next) return;
  connectionState = next;
  for (const listener of stateListeners) listener(next);
}

function dispatchFanIn(msg: unknown): void {
  if (typeof msg !== "object" || msg === null) return;
  const type = (msg as { type?: string }).type;
  if (!type || !FAN_IN_TYPES.has(type)) return;
  for (const handler of fanInHandlers) handler(msg);
}

function backoffMs(attempt: number): number {
  return Math.min(30_000, 500 * 2 ** Math.min(attempt, 6));
}

/**
 * Native-messaging bootstrap: discover loopback port + short-lived token.
 */
export async function nativeBootstrap(): Promise<BootstrapInfo> {
  const res = (await chrome.runtime.sendNativeMessage(NATIVE_HOST_NAME, {
    type: "bootstrap",
  })) as BootstrapInfo;
  if (!res?.ok || !res.port || !res.bootstrapToken) {
    const err = (res as unknown as { error?: string })?.error;
    throw new Error(
      typeof err === "string" ? err : "companion bootstrap failed",
    );
  }
  return res;
}

/**
 * Connect to companion loopback WebSocket after native-messaging bootstrap
 * supplies port + bootstrap token. Network stays on 127.0.0.1 only.
 */
export async function connectCompanion(input: {
  port: number;
  bootstrapToken: string;
  extensionId: string;
}): Promise<CompanionSession> {
  if (input.port <= 0 || input.port > 65535) {
    throw new Error("invalid companion port");
  }
  setConnectionState("connecting");
  const ws = new WebSocket(
    `ws://127.0.0.1:${input.port}/v1?t=${encodeURIComponent(input.bootstrapToken)}`,
  );
  await waitOpen(ws);
  const nonce = crypto.getRandomValues(new Uint8Array(16)).reduce(
    (s, b) => s + b.toString(16).padStart(2, "0"),
    "",
  );
  const req = createAuthHandshakeRequest({
    extensionId: input.extensionId,
    nonce,
  });
  ws.send(JSON.stringify(req));
  const response = await waitMessage(ws, 5000);
  if (!isWsMessage(response) || !isAuthHandshakeResponse(response)) {
    ws.close();
    setConnectionState("failed");
    throw new Error("companion handshake failed");
  }
  if (
    response.protocolVersion.split(".")[0] !== PROTOCOL_VERSION.split(".")[0]
  ) {
    ws.close();
    setConnectionState("incompatible");
    throw new Error("protocol major mismatch");
  }

  const pending = new Map<
    string,
    {
      resolve: (v: unknown) => void;
      reject: (e: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  const queue: unknown[] = [];

  ws.addEventListener("message", (ev) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(String(ev.data));
    } catch {
      return;
    }
    const type =
      typeof parsed === "object" &&
      parsed !== null &&
      "type" in parsed &&
      typeof (parsed as { type: unknown }).type === "string"
        ? (parsed as { type: string }).type
        : "";
    const waiter = type ? pending.get(type) : undefined;
    if (waiter) {
      clearTimeout(waiter.timer);
      pending.delete(type);
      waiter.resolve(parsed);
      return;
    }
    dispatchFanIn(parsed);
    queue.push(parsed);
  });

  ws.addEventListener("close", () => {
    if (connectionState === "ready" || connectionState === "degraded") {
      setConnectionState("disconnected");
    }
  });

  ws.addEventListener("error", () => {
    setConnectionState("failed");
  });

  reconnectAttempt = 0;
  setConnectionState("ready");

  return {
    token: response.sessionToken,
    expiresAtMs: response.expiresAtMs,
    port: input.port,
    ws,
    send: (msg) => ws.send(JSON.stringify(msg)),
    close: () => ws.close(),
    waitType: (type, timeoutMs = 8000) =>
      new Promise((resolve, reject) => {
        const idx = queue.findIndex(
          (m) =>
            typeof m === "object" &&
            m !== null &&
            (m as { type?: string }).type === type,
        );
        if (idx >= 0) {
          resolve(queue.splice(idx, 1)[0]);
          return;
        }
        const timer = setTimeout(() => {
          pending.delete(type);
          reject(new Error(`timeout waiting for ${type}`));
        }, timeoutMs);
        pending.set(type, { resolve, reject, timer });
      }),
  };
}

/** Full bootstrap → WebSocket handshake with bounded reconnect backoff. */
export async function ensureCompanionSession(
  existing: CompanionSession | null,
): Promise<CompanionSession> {
  if (
    existing &&
    existing.expiresAtMs > Date.now() + 5_000 &&
    existing.ws.readyState === WebSocket.OPEN
  ) {
    return existing;
  }
  existing?.close();

  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const boot = await nativeBootstrap();
      return await connectCompanion({
        port: boot.port,
        bootstrapToken: boot.bootstrapToken,
        extensionId: chrome.runtime.id,
      });
    } catch (e) {
      lastError = e;
      reconnectAttempt = attempt + 1;
      if (attempt < 4) {
        setConnectionState("degraded");
        await sleep(backoffMs(reconnectAttempt));
      }
    }
  }

  try {
    await nativeBootstrap();
    setConnectionState("native-only");
  } catch {
    setConnectionState("failed");
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(String(lastError ?? "companion connect failed"));
}

export function submitJob(
  session: CompanionSession,
  input: {
    jobId: string;
    kind: JobKind;
    videoId: string;
    payload?: Record<string, unknown>;
  },
): void {
  session.send(
    createJobSubmit({
      sessionToken: session.token,
      jobId: input.jobId,
      kind: input.kind,
      videoId: input.videoId,
      ...(input.payload ? { payload: input.payload } : {}),
    }),
  );
}

export function sendAudioChunk(
  session: CompanionSession,
  input: {
    jobId: string;
    sampleRateHz: number;
    seq: number;
    pcmI16Le: ArrayBuffer | Uint8Array;
  },
): void {
  const bytes =
    input.pcmI16Le instanceof Uint8Array
      ? input.pcmI16Le
      : new Uint8Array(input.pcmI16Le);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  const pcmI16LeBase64 = btoa(binary);
  session.send({
    type: "audio.chunk",
    sessionToken: session.token,
    jobId: input.jobId,
    sampleRateHz: input.sampleRateHz,
    seq: input.seq,
    pcmI16LeBase64,
  });
}

function waitOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("ws open timeout")), 5000);
    ws.addEventListener("open", () => {
      clearTimeout(t);
      resolve();
    });
    ws.addEventListener("error", () => {
      clearTimeout(t);
      reject(new Error("ws error"));
    });
  });
}

function waitMessage(ws: WebSocket, timeoutMs: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("ws message timeout")), timeoutMs);
    ws.addEventListener(
      "message",
      (ev) => {
        clearTimeout(t);
        try {
          resolve(JSON.parse(String(ev.data)));
        } catch (e) {
          reject(e);
        }
      },
      { once: true },
    );
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Test helper: reset module-level connection state. */
export function __resetConnectionStateForTests(): void {
  connectionState = "disconnected";
  reconnectAttempt = 0;
  stateListeners.clear();
  fanInHandlers.clear();
}
