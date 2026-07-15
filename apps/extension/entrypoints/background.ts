import {
  ensureCompanionSession,
  NATIVE_HOST_NAME,
  onMessage,
  sendAudioChunk,
  submitJob,
  type CompanionSession,
} from "../features/companion/client";

let session: CompanionSession | null = null;
let captureJobId: string | null = null;
let captureTabId: number | null = null;
let audioSeq = 0;
let fanInRegistered = false;

/** Fan-in types forwarded to content as `{ type: "companion.event", event }`. */
const CONTENT_FAN_IN = new Set([
  "timeline.source",
  "timeline.translation",
  "job.progress",
  "error",
]);

function isDemoVideoId(videoId: string): boolean {
  return videoId.startsWith("demo_");
}

function registerCompanionFanIn(): void {
  if (fanInRegistered) return;
  fanInRegistered = true;
  onMessage((event) => {
    if (typeof event !== "object" || event === null) return;
    const type = (event as { type?: string }).type;
    if (!type || !CONTENT_FAN_IN.has(type)) return;
    if (captureTabId == null) return;
    void chrome.tabs.sendMessage(captureTabId, {
      type: "companion.event",
      event,
    });
  });
}

export default defineBackground(() => {
  const fixtureTracks: Record<
    string,
    Array<{
      id: string;
      language: string;
      kind: "human" | "auto";
      label: string;
      baseUrl?: string;
    }>
  > = {
    demo_human: [
      {
        id: "en-human",
        language: "en",
        kind: "human",
        label: "English (human)",
      },
    ],
    demo_auto: [
      {
        id: "en-auto",
        language: "en",
        kind: "auto",
        label: "English (auto)",
      },
    ],
    demo_none: [],
    demo_empty: [
      {
        id: "en-empty",
        language: "en",
        kind: "human",
        label: "English",
      },
    ],
  };

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    void (async () => {
      switch (message?.type) {
        case "captions.list": {
          const vid = String(message.videoId ?? "");
          const tracks = isDemoVideoId(vid) ? (fixtureTracks[vid] ?? []) : [];
          sendResponse(tracks);
          break;
        }
        case "captions.fetch-events": {
          const vid = String(message.videoId ?? "");
          if (!isDemoVideoId(vid)) {
            sendResponse([]);
            break;
          }
          if (vid === "demo_empty" || vid === "demo_none") {
            sendResponse([]);
            break;
          }
          if (vid === "demo_auto") {
            sendResponse([
              {
                tStartMs: 0,
                dDurationMs: 1200,
                segs: [{ utf8: "auto generated line" }],
              },
            ]);
            break;
          }
          sendResponse([
            {
              tStartMs: 0,
              dDurationMs: 2000,
              segs: [{ utf8: "Hello from captions" }],
            },
            {
              tStartMs: 2000,
              dDurationMs: 2000,
              segs: [{ utf8: "Local inference stays offline" }],
            },
          ]);
          break;
        }
        case "capture.start": {
          try {
            session = await ensureCompanionSession(session);
            registerCompanionFanIn();
            const jobId = crypto.randomUUID();
            captureJobId = jobId;
            audioSeq = 0;
            const tabId = sender.tab?.id ?? (await activeTabId());
            captureTabId = tabId ?? null;
            submitJob(session, {
              jobId,
              kind: "asr",
              videoId: String(message.videoId ?? "live"),
            });
            await ensureOffscreen();
            chrome.runtime.sendMessage({
              type: "offscreen.capture",
              videoId: message.videoId,
              jobId,
              tabId,
            });
            sendResponse({ ok: true, active: true, jobId });
          } catch (e) {
            sendResponse({
              ok: false,
              error: e instanceof Error ? e.message : String(e),
            });
          }
          break;
        }
        case "capture.chunk": {
          try {
            session = await ensureCompanionSession(session);
            registerCompanionFanIn();
            const jobId = String(message.jobId ?? captureJobId ?? "");
            if (!jobId) {
              sendResponse({ ok: false, error: "no-capture-job" });
              break;
            }
            sendAudioChunk(session, {
              jobId,
              sampleRateHz: Number(message.sampleRateHz ?? 48000),
              seq: audioSeq++,
              pcmI16Le: base64ToBytes(String(message.pcmI16LeBase64 ?? "")),
            });
            sendResponse({ ok: true, seq: audioSeq });
          } catch (e) {
            sendResponse({
              ok: false,
              error: e instanceof Error ? e.message : String(e),
            });
          }
          break;
        }
        case "capture.cancel": {
          if (session && captureJobId) {
            session.send({
              type: "job.cancel",
              sessionToken: session.token,
              jobId: captureJobId,
            });
          }
          chrome.runtime.sendMessage({ type: "offscreen.stop" });
          captureJobId = null;
          captureTabId = null;
          sendResponse({ ok: true });
          break;
        }
        case "capture.pause": {
          if (session && captureJobId) {
            session.send({
              type: "job.pause",
              sessionToken: session.token,
              jobId: captureJobId,
            });
          }
          chrome.runtime.sendMessage({ type: "offscreen.pause" });
          sendResponse({ ok: true });
          break;
        }
        case "capture.resume": {
          if (session && captureJobId) {
            session.send({
              type: "job.resume",
              sessionToken: session.token,
              jobId: captureJobId,
            });
          }
          chrome.runtime.sendMessage({ type: "offscreen.resume" });
          sendResponse({ ok: true });
          break;
        }
        case "companion.ping": {
          try {
            session = await ensureCompanionSession(session);
            registerCompanionFanIn();
            session.send({
              type: "session.ping",
              sessionToken: session.token,
              atMs: Date.now(),
            });
            await session.waitType("session.pong", 3000);
            sendResponse({
              ok: true,
              ws: true,
              port: session.port,
              protocolVersion: "1.0.0",
            });
          } catch (e) {
            try {
              const res = await chrome.runtime.sendNativeMessage(
                NATIVE_HOST_NAME,
                { type: "bootstrap" },
              );
              // Native-only is explicitly degraded — never look like full ready.
              sendResponse({ ok: true, bootstrap: res, ws: false, degraded: true });
            } catch (inner) {
              sendResponse({
                ok: false,
                error:
                  e instanceof Error
                    ? e.message
                    : String(inner instanceof Error ? inner.message : e),
              });
            }
          }
          break;
        }
        case "ui.open-sidepanel": {
          try {
            const windowId =
              sender.tab?.windowId ??
              (await chrome.windows.getCurrent()).id;
            const sidePanel = (
              chrome as typeof chrome & {
                sidePanel?: {
                  open: (opts: { windowId: number }) => Promise<void>;
                };
              }
            ).sidePanel;
            if (windowId != null && sidePanel?.open) {
              await sidePanel.open({ windowId });
              sendResponse({ ok: true });
            } else {
              sendResponse({ ok: false, error: "side-panel-unavailable" });
            }
          } catch (e) {
            sendResponse({
              ok: false,
              error: e instanceof Error ? e.message : String(e),
            });
          }
          break;
        }
        case "companion.translate": {
          try {
            session = await ensureCompanionSession(session);
            registerCompanionFanIn();
            const jobId = crypto.randomUUID();
            submitJob(session, {
              jobId,
              kind: "translate",
              videoId: String(message.videoId ?? "unknown"),
              payload: {
                texts: message.texts ?? [],
                targetLang: message.targetLang ?? "en",
              },
            });
            const result = await session.waitType("timeline.translation", 10_000);
            sendResponse({ ok: true, result });
          } catch (e) {
            sendResponse({
              ok: false,
              error: e instanceof Error ? e.message : String(e),
            });
          }
          break;
        }
        case "lyrics.set-network": {
          try {
            await chrome.storage.local.set({
              lyricsNetworkAllowed: Boolean(message.allowed),
            });
            session = await ensureCompanionSession(session);
            registerCompanionFanIn();
            session.send({
              type: "settings.lyrics.network",
              sessionToken: session.token,
              allowed: Boolean(message.allowed),
            });
            sendResponse({ ok: true, allowed: Boolean(message.allowed) });
          } catch (e) {
            sendResponse({
              ok: false,
              error: e instanceof Error ? e.message : String(e),
            });
          }
          break;
        }
        case "lyrics.fetch-lrclib": {
          try {
            const stored = await chrome.storage.local.get("lyricsNetworkAllowed");
            if (!stored.lyricsNetworkAllowed) {
              sendResponse({
                ok: false,
                error: "lyrics-network-disabled",
              });
              break;
            }
            session = await ensureCompanionSession(session);
            registerCompanionFanIn();
            session.send({
              type: "settings.lyrics.network",
              sessionToken: session.token,
              allowed: true,
            });
            session.send({
              type: "lyrics.resolve",
              sessionToken: session.token,
              jobId: crypto.randomUUID(),
              videoId: message.videoId ?? "unknown",
              trackName: message.trackName ?? "",
              artistName: message.artistName,
            });
            const result = await Promise.race([
              session.waitType("lyrics.timeline", 15_000),
              session.waitType("error", 15_000),
            ]);
            sendResponse({ ok: true, result });
          } catch (e) {
            sendResponse({
              ok: false,
              error: e instanceof Error ? e.message : String(e),
            });
          }
          break;
        }
        case "lyrics.import-lrc": {
          const tabs = await chrome.tabs.query({
            active: true,
            currentWindow: true,
          });
          const tab = tabs[0];
          if (tab?.id) {
            chrome.tabs.sendMessage(tab.id, {
              type: "lyrics.import",
              format: message.format ?? "lrc",
              content: message.content ?? "",
              videoId: message.videoId,
            });
          }
          sendResponse({ ok: true });
          break;
        }
        case "page-translate.request-permission": {
          const granted = await chrome.permissions.request({
            origins: message.origins ?? ["http://*/*", "https://*/*"],
          });
          sendResponse({ granted });
          break;
        }
        case "page-translate.submit": {
          try {
            session = await ensureCompanionSession(session);
            registerCompanionFanIn();
            const jobId = crypto.randomUUID();
            submitJob(session, {
              jobId,
              kind: "page-translate",
              videoId: String(message.canonicalUrl ?? "page"),
              payload: {
                segments: message.segments ?? [],
                targetLang: message.targetLang ?? "en",
                canonicalUrl: message.canonicalUrl ?? "",
              },
            });
            const result = await session.waitType(
              "page.translate.result",
              60_000,
            );
            const results =
              typeof result === "object" &&
              result !== null &&
              "results" in result
                ? (result as { results: unknown }).results
                : [];
            sendResponse({ ok: true, results, jobId });
          } catch (e) {
            sendResponse({
              ok: false,
              error: e instanceof Error ? e.message : String(e),
            });
          }
          break;
        }
        case "study.sync": {
          try {
            session = await ensureCompanionSession(session);
            registerCompanionFanIn();
            session.send({
              type: "study.sync",
              sessionToken: session.token,
              op: message.op ?? "list",
              kind: message.kind,
              id: message.id,
              payload: message.payload,
            });
            const result = await session.waitType("study.sync.result", 10_000);
            sendResponse({ ok: true, result });
          } catch (e) {
            sendResponse({
              ok: false,
              error: e instanceof Error ? e.message : String(e),
            });
          }
          break;
        }
        case "privacy.wipe": {
          try {
            session = await ensureCompanionSession(session);
            registerCompanionFanIn();
            session.send({
              type: "privacy.wipe",
              sessionToken: session.token,
              scope: message.scope ?? "all",
            });
            const result = await session.waitType(
              "privacy.wipe.result",
              15_000,
            );
            sendResponse({ ok: true, result });
          } catch (e) {
            sendResponse({
              ok: false,
              error: e instanceof Error ? e.message : String(e),
            });
          }
          break;
        }
        case "retention.set": {
          try {
            session = await ensureCompanionSession(session);
            registerCompanionFanIn();
            session.send({
              type: "retention.set",
              sessionToken: session.token,
              preset: message.preset ?? "days7",
            });
            const result = await session.waitType("retention.status", 5_000);
            sendResponse({ ok: true, result });
          } catch (e) {
            sendResponse({
              ok: false,
              error: e instanceof Error ? e.message : String(e),
            });
          }
          break;
        }
        case "retention.get": {
          try {
            session = await ensureCompanionSession(session);
            registerCompanionFanIn();
            session.send({
              type: "retention.get",
              sessionToken: session.token,
            });
            const result = await session.waitType("retention.status", 5_000);
            sendResponse({ ok: true, result });
          } catch (e) {
            sendResponse({
              ok: false,
              error: e instanceof Error ? e.message : String(e),
            });
          }
          break;
        }
        case "timeline.hydrate": {
          try {
            session = await ensureCompanionSession(session);
            registerCompanionFanIn();
            session.send({
              type: "timeline.hydrate",
              sessionToken: session.token,
              videoId: message.videoId,
              sourceHash: message.sourceHash,
            });
            const result = await session.waitType("timeline.hydrated", 8_000);
            sendResponse({ ok: true, result });
          } catch (e) {
            sendResponse({
              ok: false,
              error: e instanceof Error ? e.message : String(e),
            });
          }
          break;
        }
        case "dictionary.lookup": {
          try {
            session = await ensureCompanionSession(session);
            registerCompanionFanIn();
            session.send({
              type: "dictionary.lookup",
              sessionToken: session.token,
              surface: String(message.surface ?? ""),
            });
            const result = await session.waitType("dictionary.lookup", 8_000);
            sendResponse({ ok: true, result });
          } catch (e) {
            sendResponse({
              ok: false,
              error: e instanceof Error ? e.message : String(e),
            });
          }
          break;
        }
        case "dictionary.import": {
          try {
            session = await ensureCompanionSession(session);
            registerCompanionFanIn();
            session.send({
              type: "dictionary.import",
              sessionToken: session.token,
              id: String(message.id ?? crypto.randomUUID()),
              name: String(message.name ?? "imported"),
              language: String(message.language ?? "und"),
              license: String(message.license ?? "verify-before-redistribution"),
              payloadPath: message.payloadPath,
              entries: message.entries ?? [],
            });
            const result = await session.waitType("dictionary.import", 60_000);
            sendResponse({ ok: true, result });
          } catch (e) {
            sendResponse({
              ok: false,
              error: e instanceof Error ? e.message : String(e),
            });
          }
          break;
        }
        case "dictionary.stats": {
          try {
            session = await ensureCompanionSession(session);
            registerCompanionFanIn();
            session.send({
              type: "dictionary.stats",
              sessionToken: session.token,
            });
            const result = await session.waitType("dictionary.stats", 5_000);
            sendResponse({ ok: true, result });
          } catch (e) {
            sendResponse({
              ok: false,
              error: e instanceof Error ? e.message : String(e),
            });
          }
          break;
        }
        default:
          sendResponse({ ok: false, error: "unknown-message" });
      }
    })();
    return true;
  });
});

async function ensureOffscreen(): Promise<void> {
  const existing = await chrome.runtime.getContexts?.({
    contextTypes: ["OFFSCREEN_DOCUMENT" as chrome.runtime.ContextType],
  });
  if (existing && existing.length > 0) return;
  if (chrome.offscreen?.createDocument) {
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["USER_MEDIA" as chrome.offscreen.Reason],
      justification: "User-initiated tab audio capture for local ASR",
    });
  }
}

async function activeTabId(): Promise<number | undefined> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0]?.id;
}

function base64ToBytes(b64: string): Uint8Array {
  if (!b64) return new Uint8Array();
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

declare function defineBackground(main: () => void): unknown;
