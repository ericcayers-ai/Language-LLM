import {
  PROTOCOL_VERSION,
  createAuthHandshakeRequest,
  createJobSubmit,
  isAuthHandshakeResponse,
  isWsMessage,
} from "@language-llm/protocol";
import type { JobKind, SessionToken } from "@language-llm/protocol";

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
    throw new Error("companion handshake failed");
  }
  if (
    response.protocolVersion.split(".")[0] !== PROTOCOL_VERSION.split(".")[0]
  ) {
    ws.close();
    throw new Error("protocol major mismatch");
  }

  const pending = new Map<
    string,
    { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }
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
    queue.push(parsed);
  });

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

/** Full bootstrap → WebSocket handshake used by the background service worker. */
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
  const boot = await nativeBootstrap();
  return connectCompanion({
    port: boot.port,
    bootstrapToken: boot.bootstrapToken,
    extensionId: chrome.runtime.id,
  });
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
