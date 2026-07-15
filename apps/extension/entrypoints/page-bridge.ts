/**
 * MAIN-world bridge — audited surface to read YouTube player caption metadata
 * and timedtext base URLs from the page session (when the player exposes them).
 *
 * Does NOT download videos or bypass BotGuard. Caption track URLs are only those
 * already present in the player's own response for this page session.
 */

import {
  extractPlayerResponseFromScript,
  tracksFromPlayerResponse,
  type PlayerCaptionTrack,
} from "../features/captions/player-response";

const BRIDGE = "__LANGUAGE_LLM_BRIDGE_V1__";
const CHANNEL = "language-llm";

export interface BridgePlayerState {
  videoId: string | null;
  currentTimeMs: number;
  paused: boolean;
  title?: string;
  tracks: PlayerCaptionTrack[];
  playerResponseFound: boolean;
}

declare global {
  interface Window {
    [BRIDGE]?: {
      getState: () => BridgePlayerState;
      getTracks: () => PlayerCaptionTrack[];
    };
    ytInitialPlayerResponse?: unknown;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ytplayer?: any;
  }
}

function videoIdFromHref(href: string): string | null {
  const watch = href.match(/[?&]v=([^&]+)/);
  if (watch?.[1]) return decodeURIComponent(watch[1]);
  const shorts = href.match(/\/shorts\/([^/?&]+)/);
  if (shorts?.[1]) return decodeURIComponent(shorts[1]);
  return null;
}

function readEmbeddedPlayerResponse(): {
  tracks: PlayerCaptionTrack[];
  found: boolean;
} {
  if (typeof window.ytInitialPlayerResponse !== "undefined") {
    return {
      tracks: tracksFromPlayerResponse(window.ytInitialPlayerResponse),
      found: true,
    };
  }

  try {
    const player =
      window.ytplayer?.config?.args?.raw_player_response ??
      window.ytplayer?.config?.args?.player_response;
    if (player) {
      const parsed =
        typeof player === "string" ? (JSON.parse(player) as unknown) : player;
      return { tracks: tracksFromPlayerResponse(parsed), found: true };
    }
  } catch {
    /* ignore */
  }

  const scripts = document.querySelectorAll("script");
  for (const script of scripts) {
    const text = script.textContent ?? "";
    const pr = extractPlayerResponseFromScript(text);
    if (pr) {
      return { tracks: tracksFromPlayerResponse(pr), found: true };
    }
  }

  return { tracks: [], found: false };
}

function readPlayer(): BridgePlayerState {
  const video = document.querySelector("video") as HTMLVideoElement | null;
  const { tracks, found } = readEmbeddedPlayerResponse();
  return {
    videoId: videoIdFromHref(location.href),
    currentTimeMs: video ? Math.floor(video.currentTime * 1000) : 0,
    paused: video?.paused ?? true,
    title: document.title,
    tracks,
    playerResponseFound: found,
  };
}

export default defineContentScript({
  matches: [
    "*://www.youtube.com/*",
    "*://youtube.com/*",
    "*://music.youtube.com/*",
    "*://m.youtube.com/*",
  ],
  world: "MAIN",
  runAt: "document_start",
  main() {
    window[BRIDGE] = {
      getState: readPlayer,
      getTracks: () => readPlayer().tracks,
    };

    window.addEventListener("message", (event) => {
      if (event.source !== window) return;
      const data = event.data;
      if (!data || data.channel !== CHANNEL) return;

      if (data.type === "bridge.ping" || data.type === "bridge.getState") {
        window.postMessage(
          {
            channel: CHANNEL,
            type: data.type === "bridge.ping" ? "bridge.pong" : "bridge.state",
            state: readPlayer(),
            requestId: data.requestId,
          },
          "*",
        );
        return;
      }

      if (data.type === "bridge.getTracks") {
        const state = readPlayer();
        window.postMessage(
          {
            channel: CHANNEL,
            type: "bridge.tracks",
            tracks: state.tracks,
            videoId: state.videoId,
            playerResponseFound: state.playerResponseFound,
            requestId: data.requestId,
          },
          "*",
        );
      }
    });
  },
});

declare function defineContentScript(config: {
  matches: string[];
  world?: "MAIN" | "ISOLATED";
  runAt?: "document_start" | "document_end" | "document_idle";
  main: () => void | Promise<void | (() => void)>;
}): unknown;
