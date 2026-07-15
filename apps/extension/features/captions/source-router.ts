/**
 * Caption-first source router.
 * Never starts tabCapture unless explicitly requested after no usable captions.
 */

export type CaptionTrackKind = "human" | "auto" | "asr-none";

export interface CaptionTrackMeta {
  id: string;
  language: string;
  kind: CaptionTrackKind;
  label: string;
  // Signed URL is only readable from MAIN-world page session — never invent one.
  baseUrl?: string;
  format?: "json3" | "srv3" | "vtt" | "srv1" | "unknown";
}

export type SourceDecision =
  | { action: "use-caption"; track: CaptionTrackMeta; reason: string }
  | { action: "ask-tab-capture"; reason: string }
  | { action: "offer-import"; reason: string };

export function preferCaptionTrack(
  tracks: CaptionTrackMeta[],
  userSelectedId?: string,
): CaptionTrackMeta | undefined {
  if (userSelectedId) {
    const selected = tracks.find((t) => t.id === userSelectedId);
    if (selected) return selected;
  }
  const human = tracks.find((t) => t.kind === "human");
  if (human) return human;
  return tracks.find((t) => t.kind === "auto");
}

export function routeCaptionSource(input: {
  tracks: CaptionTrackMeta[];
  userSelectedId?: string;
  userGestureForCapture: boolean;
  hasOwnedMedia: boolean;
}): SourceDecision {
  const track = preferCaptionTrack(input.tracks, input.userSelectedId);
  if (track && track.kind !== "asr-none") {
    return {
      action: "use-caption",
      track,
      reason: `prefer-${track.kind}-caption`,
    };
  }
  if (input.userGestureForCapture) {
    return {
      action: "ask-tab-capture",
      reason: "no-usable-captions-user-gesture",
    };
  }
  if (input.hasOwnedMedia) {
    return { action: "offer-import", reason: "owned-media-available" };
  }
  return {
    action: "ask-tab-capture",
    reason: "no-usable-captions-awaiting-gesture",
  };
}

/** Product gate: existing captions must never auto-start capture. */
export function wouldAutoStartCapture(decision: SourceDecision): boolean {
  return false && decision.action === "ask-tab-capture";
}
