/**
 * Isolated-world helper: talk to MAIN-world page bridge via postMessage.
 */

import type { CaptionTrackMeta } from "./source-router";

const CHANNEL = "language-llm";

export interface BridgePlayerStateMsg {
  videoId: string | null;
  currentTimeMs: number;
  paused: boolean;
  title?: string;
  tracks: CaptionTrackMeta[];
  playerResponseFound?: boolean;
}

function requestId(): string {
  return `br_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function pingBridge(timeoutMs = 800): Promise<BridgePlayerStateMsg | null> {
  return new Promise((resolve) => {
    const id = requestId();
    const timer = setTimeout(() => {
      window.removeEventListener("message", onMsg);
      resolve(null);
    }, timeoutMs);

    const onMsg = (event: MessageEvent) => {
      if (event.source !== window) return;
      const data = event.data;
      if (
        !data ||
        data.channel !== CHANNEL ||
        (data.type !== "bridge.pong" && data.type !== "bridge.state") ||
        data.requestId !== id
      ) {
        return;
      }
      clearTimeout(timer);
      window.removeEventListener("message", onMsg);
      resolve((data.state as BridgePlayerStateMsg) ?? null);
    };

    window.addEventListener("message", onMsg);
    window.postMessage(
      { channel: CHANNEL, type: "bridge.ping", requestId: id },
      "*",
    );
  });
}

export async function listBridgeTracks(
  timeoutMs = 800,
): Promise<CaptionTrackMeta[]> {
  const state = await pingBridge(timeoutMs);
  return state?.tracks ?? [];
}
