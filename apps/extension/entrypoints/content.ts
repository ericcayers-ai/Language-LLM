import { mountOverlayHost } from "../features/overlay/mount";
import { extractVideoId, subscribeYtNavigation } from "../features/captions/spa";
import {
  routeCaptionSource,
  type CaptionTrackMeta,
} from "../features/captions/source-router";
import { listBridgeTracks } from "../features/captions/bridge-client";
import {
  activeCueAt,
  parseTimedtextBody,
  parseTimedtextEvents,
} from "../features/captions/parser";
import { preferJson3Url } from "../features/captions/player-response";
import {
  resolveImportedLyrics,
  resolveLyricsLocal,
} from "../features/lyrics/resolve";
import type { SourceTimeline } from "@language-llm/protocol";
import { mockMtDraft } from "@language-llm/mt-core";
import { karaokeAt, linesToTimeline, parseLrc } from "@language-llm/lyrics";
import {
  createChromeStudyStore,
  StudySession,
} from "../features/learning/session";
import { applyVlmGateToDrafts } from "../features/vlm/gate";

export default defineContentScript({
  matches: [
    "*://www.youtube.com/*",
    "*://youtube.com/*",
    "*://music.youtube.com/*",
    "*://m.youtube.com/*",
  ],
  cssInjectionMode: "ui",
  async main() {
    const study = new StudySession(createChromeStudyStore());
    await study.hydrate();

    let showSource = true;
    let showTranslation = true;
    let blurTranslation = false;
    let evidenceByCueIndex: string[] = [];
    let lastEvidence = "";

    const overlay = mountOverlayHost(document.documentElement, {
      onMine: ({ source, translation }) => {
        if (!source?.text) return;
        void study.mineSentence({
          sourceText: source.text,
          ...(translation?.text !== undefined
            ? { translationText: translation.text }
            : {}),
          ...(videoId ? { videoId } : {}),
          tags: ["mined", "youtube"],
        });
      },
      onMarkKnown: (surface) => {
        void study.markSurfaceKnown(surface);
      },
      onToggle: (flags) => {
        showSource = flags.showSource;
        showTranslation = flags.showTranslation;
        blurTranslation = flags.blurTranslation;
      },
    });

    let timeline: SourceTimeline | null = null;
    let translationTexts: string[] = [];
    let lyricsTimeline: SourceTimeline | null = null;
    let videoId: string | null = null;
    let raf = 0;

    const tick = () => {
      const video = document.querySelector("video");
      if (video && timeline) {
        const t = Math.floor(video.currentTime * 1000);
        const source = activeCueAt(timeline, t);
        const idx = timeline.cues.findIndex((c) => c.id === source?.id);
        const translationCue =
          source && idx >= 0 && translationTexts[idx]
            ? {
                ...source,
                text: translationTexts[idx]!,
                provenance: "mt" as const,
              }
            : undefined;
        const karaoke =
          lyricsTimeline != null
            ? karaokeAt(lyricsTimeline.cues, t)
            : null;
        const evidence =
          idx >= 0 && evidenceByCueIndex[idx]
            ? evidenceByCueIndex[idx]!
            : undefined;
        if (evidence) lastEvidence = evidence;
        const evidenceSummary = evidence || lastEvidence || undefined;
        overlay.update({
          showSource,
          showTranslation: showTranslation && Boolean(translationCue),
          blurTranslation,
          karaokeActive: karaoke?.activeCueId === source?.id,
          ...(source ? { sourceCue: source } : {}),
          ...(translationCue ? { translationCue } : {}),
          ...(source?.provenance ? { provenance: source.provenance } : {}),
          ...(evidence ? { confidence: 0.42 } : {}),
          ...(evidenceSummary ? { evidenceSummary } : {}),
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const loadTimelineFromTrack = async (
      id: string,
      track: CaptionTrackMeta,
    ): Promise<SourceTimeline | null> => {
      const provenance =
        track.kind === "human" ? "human-caption" : "auto-caption";

      // Prefer page-session timedtext URL from MAIN bridge (no invented URLs).
      if (track.baseUrl) {
        try {
          const url = preferJson3Url(track.baseUrl);
          const res = await fetch(url, { credentials: "include" });
          const body = await res.text();
          return parseTimedtextBody(id, body, provenance);
        } catch {
          /* fall through to background fixture / cache */
        }
      }

      const events = (await chrome.runtime.sendMessage({
        type: "captions.fetch-events",
        videoId: id,
        trackId: track.id,
      })) as unknown;
      if (typeof events === "string") {
        return parseTimedtextBody(id, events, provenance);
      }
      if (Array.isArray(events)) {
        return parseTimedtextEvents(
          id,
          events as Parameters<typeof parseTimedtextEvents>[1],
          provenance,
        );
      }
      return null;
    };

    const runCaptionSmoke = async (id: string, href: string) => {
      timeline = null;
      translationTexts = [];
      lyricsTimeline = null;
      evidenceByCueIndex = [];
      lastEvidence = "";

      const bridgeTracks = await listBridgeTracks();
      const fixtureTracks = (await chrome.runtime.sendMessage({
        type: "captions.list",
        videoId: id,
      })) as CaptionTrackMeta[] | undefined;

      // Real player tracks win; fixtures cover demos / offline tests.
      const tracks =
        bridgeTracks.length > 0 ? bridgeTracks : (fixtureTracks ?? []);

      const decision = routeCaptionSource({
        tracks,
        userGestureForCapture: false,
        hasOwnedMedia: false,
      });

      if (decision.action === "use-caption") {
        timeline = await loadTimelineFromTrack(id, decision.track);
        if (timeline && timeline.cues.length > 0) {
          const texts = timeline.cues.map((c) => c.text);
          const companion = (await chrome.runtime.sendMessage({
            type: "companion.translate",
            videoId: id,
            texts,
            targetLang: "en",
          })) as {
            ok?: boolean;
            result?: { cues?: Array<{ text?: string }> };
          };
          if (companion?.ok && Array.isArray(companion.result?.cues)) {
            translationTexts = companion.result.cues.map(
              (c, i) => c.text ?? texts[i] ?? "",
            );
          } else {
            translationTexts = mockMtDraft(texts, "en");
          }
          // Selective VLM gate (mock evidence) on low-confidence deixis spans.
          const gated = applyVlmGateToDrafts({
            sources: texts,
            drafts: translationTexts,
            profile: "balanced",
          });
          translationTexts = gated.texts;
          evidenceByCueIndex = gated.evidenceByIndex;
          lastEvidence =
            gated.evidenceByIndex.find((s) => s.length > 0) ?? "";
        }
      }

      const lyrics = resolveLyricsLocal({
        href,
        videoId: id,
        title: document.title,
        ...(timeline ? { pageCaptionTimeline: timeline } : {}),
      });
      if (lyrics.ok) lyricsTimeline = lyrics.timeline;
    };

    const unsub = subscribeYtNavigation(async ({ href, videoId: id }) => {
      videoId = id;
      if (!id) return;
      await runCaptionSmoke(id, href);
    });

    chrome.runtime.onMessage.addListener((message, _s, sendResponse) => {
      if (message?.type === "lyrics.import") {
        const id = String(
          message.videoId ??
            videoId ??
            extractVideoId(location.href) ??
            "import",
        );
        const content = String(message.content ?? "");
        const format = (message.format ?? "lrc") as "lrc" | "ttml" | "plain";
        lyricsTimeline = resolveImportedLyrics(id, format, content);
        if (!timeline && lyricsTimeline) timeline = lyricsTimeline;
        sendResponse({ ok: true, cues: lyricsTimeline.cues.length });
        return true;
      }
      if (message?.type === "lyrics.apply-lrc") {
        const id = String(message.videoId ?? videoId ?? "lrclib");
        lyricsTimeline = linesToTimeline(
          id,
          parseLrc(String(message.lrc ?? "")),
          "lyrics-open-api",
        );
        sendResponse({ ok: true });
        return true;
      }
      return false;
    });

    window.addEventListener("language-llm:transcribe-tab", () => {
      void chrome.runtime.sendMessage({
        type: "capture.start",
        videoId: videoId ?? extractVideoId(location.href),
      });
    });

    return () => {
      cancelAnimationFrame(raf);
      unsub();
      overlay.destroy();
    };
  },
});

declare function defineContentScript(config: {
  matches: string[];
  cssInjectionMode?: string;
  main: () => void | Promise<void | (() => void)>;
}): unknown;
