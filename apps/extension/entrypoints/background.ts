import {
  ensureCompanionSession,
  NATIVE_HOST_NAME,
  sendAudioChunk,
  submitJob,
  type CompanionSession,
} from "../features/companion/client";

let session: CompanionSession | null = null;
let captureJobId: string | null = null;
let audioSeq = 0;

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
          const tracks =
            fixtureTracks[message.videoId as string] ??
            fixtureTracks.demo_human ??
            [];
          sendResponse(tracks);
          break;
        }
        case "captions.fetch-events": {
          const vid = String(message.videoId ?? "");
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
            const jobId = crypto.randomUUID();
            captureJobId = jobId;
            audioSeq = 0;
            submitJob(session, {
              jobId,
              kind: "asr",
              videoId: String(message.videoId ?? "live"),
            });
            await ensureOffscreen();
            const tabId = sender.tab?.id ?? (await activeTabId());
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
          captureJobId = null;
          sendResponse({ ok: true });
          break;
        }
        case "companion.ping": {
          try {
            session = await ensureCompanionSession(session);
            session.send({
              type: "session.ping",
              sessionToken: session.token,
              atMs: Date.now(),
            });
            await session.waitType("session.pong", 3000);
            sendResponse({
              ok: true,
              port: session.port,
              protocolVersion: "1.0.0",
            });
          } catch (e) {
            try {
              const res = await chrome.runtime.sendNativeMessage(
                NATIVE_HOST_NAME,
                { type: "bootstrap" },
              );
              sendResponse({ ok: true, bootstrap: res, ws: false });
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
        case "companion.translate": {
          try {
            session = await ensureCompanionSession(session);
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
          // Forward to active YouTube tab content script.
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
