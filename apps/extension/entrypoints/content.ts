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
import {
  formatFidelityEvidence,
  hasCriticalFidelityFailure,
  mockMtDraft,
  runFidelityChecks,
} from "@language-llm/mt-core";
import { karaokeAt, linesToTimeline, parseLrc } from "@language-llm/lyrics";
import {
  createCompanionStudyStore,
  StudySession,
} from "../features/learning/session";
import { hydrateTimeline } from "../features/companion/runtime";
import { applyVlmGateToDrafts } from "../features/vlm/gate";
import { isDevelopmentMtFallbackAllowed } from "@language-llm/page-translate";
import type { EmptyStateKind } from "@language-llm/ui";

export default defineContentScript({
  matches: [
    "*://www.youtube.com/*",
    "*://youtube.com/*",
    "*://music.youtube.com/*",
    "*://m.youtube.com/*",
  ],
  cssInjectionMode: "ui",
  async main() {
    const study = new StudySession(createCompanionStudyStore());
    await study.hydrate();

    let showSource = true;
    let showTranslation = true;
    let blurTranslation = false;
    let evidenceByCueIndex: string[] = [];
    let lastEvidence = "";
    let emptyKind: EmptyStateKind | undefined = "no-captions";
    let pendingLyricsLrc: string | null = null;
    let pendingLyricsTimeline: SourceTimeline | null = null;
    let syncOffsetMs = 0;
    let captionSourceLabel: string | undefined;

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
      onTranscribeTab: () => {
        void chrome.runtime.sendMessage({
          type: "capture.start",
          videoId: videoId ?? extractVideoId(location.href),
        });
        overlay.update({
          emptyKind: null,
          statusMessage: "Capture started — waiting for ASR…",
          jobState: "asr-running",
        });
      },
      onOpenSidePanel: () => {
        void chrome.runtime.sendMessage({ type: "ui.open-sidepanel" });
      },
      onConfirmLyrics: () => {
        if (pendingLyricsLrc) {
          const id = String(
            videoId ?? extractVideoId(location.href) ?? "lrclib",
          );
          lyricsTimeline = linesToTimeline(
            id,
            parseLrc(pendingLyricsLrc),
            "lyrics-open-api",
          );
          pendingLyricsLrc = null;
        } else if (pendingLyricsTimeline) {
          lyricsTimeline = pendingLyricsTimeline;
          pendingLyricsTimeline = null;
        } else {
          return;
        }
        overlay.update({
          emptyKind: null,
          statusMessage: "Lyrics confirmed and applied",
          confirmAction: null,
        });
      },
    });

    let asrCaptureActive = false;

    const applyTranslationTexts = (
      sources: string[],
      drafts: string[],
      provisional = false,
      provisionalReason:
        | "offline-mock"
        | "dev-fallback"
        | "vlm-stub"
        | undefined = undefined,
    ) => {
      const fidelity = runFidelityChecks({
        sourceCues: sources.map((text, i) => ({
          id: `c-${i}`,
          startMs: 0,
          endMs: 1000,
          text,
          provenance: "human-caption" as const,
        })),
        targetTexts: drafts,
      });
      if (hasCriticalFidelityFailure(fidelity)) {
        if (isDevelopmentMtFallbackAllowed()) {
          translationTexts = mockMtDraft(sources, "en");
          overlay.update({
            statusMessage:
              "Fidelity check failed — provisional [dev] draft shown (not a real MT result)",
          });
        } else {
          translationTexts = [];
          overlay.update({
            statusMessage: "Fidelity check blocked translation revision",
          });
        }
        evidenceByCueIndex = sources.map(() =>
          formatFidelityEvidence(fidelity),
        );
        lastEvidence = formatFidelityEvidence(fidelity);
        return;
      }
      translationTexts = drafts;
      if (provisional || !fidelity.ok) {
        evidenceByCueIndex = sources.map(() =>
          fidelity.ok ? "" : formatFidelityEvidence(fidelity),
        );
        lastEvidence = formatFidelityEvidence(fidelity);
        if (provisional) {
          const statusMessage =
            provisionalReason === "vlm-stub"
              ? "Stub VLM (no multimodal weights) — provisional correction"
              : provisionalReason === "dev-fallback"
                ? "Companion MT unavailable — provisional [dev] draft (not a real translation)"
                : "Provisional OfflineMock draft (weights not installed; companion connected)";
          overlay.update({ statusMessage });
        }
      }
    };

    const mergeAsrTimeline = (incoming: SourceTimeline) => {
      if (!incoming.cues?.length) return;
      if (timeline && timeline.cues.length > 0) {
        const byId = new Map(timeline.cues.map((c) => [c.id, c]));
        for (const cue of incoming.cues) byId.set(cue.id, cue);
        timeline = {
          ...timeline,
          cues: [...byId.values()].sort((a, b) => a.startMs - b.startMs),
          ...(incoming.captionSource
            ? { captionSource: incoming.captionSource }
            : {}),
          ...(incoming.developmentFallback !== undefined
            ? { developmentFallback: incoming.developmentFallback }
            : {}),
        };
      } else {
        timeline = incoming;
      }
      asrCaptureActive = true;
    };
    let timeline: SourceTimeline | null = null;
    let translationTexts: string[] = [];
    let lyricsTimeline: SourceTimeline | null = null;
    let videoId: string | null = null;
    let raf = 0;
    let lastPaintedCueId: string | undefined;

    const publishTranscript = (activeCueId?: string) => {
      if (!timeline) {
        void chrome.storage.local.set({
          "language-llm.transcript": { items: [], activeId: undefined },
        });
        return;
      }
      const items = timeline.cues.map((c, i) => ({
        id: c.id,
        startMs: c.startMs,
        endMs: c.endMs,
        text: c.text,
        ...(translationTexts[i] ? { translationText: translationTexts[i] } : {}),
        ...(c.provenance ? { provenance: c.provenance } : {}),
      }));
      void chrome.storage.local.set({
        "language-llm.transcript": {
          items,
          activeId: activeCueId,
          videoId,
          captionSource: captionSourceLabel,
        },
      });
    };

    const tick = () => {
      const video = document.querySelector("video");
      if (video && timeline && timeline.cues.length > 0) {
        const t = Math.floor(video.currentTime * 1000) + syncOffsetMs;
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

        // Visual update is change-gated inside mountOverlayHost.
        const provenance =
          captionSourceLabel ??
          source?.provenance ??
          translationCue?.provenance;
        overlay.update({
          showSource,
          showTranslation: showTranslation && Boolean(translationCue),
          blurTranslation,
          karaokeActive: karaoke?.activeCueId === source?.id,
          emptyKind: null,
          ...(source ? { sourceCue: source } : {}),
          ...(translationCue ? { translationCue } : {}),
          ...(provenance ? { provenance } : {}),
          ...(evidence ? { confidence: 0.42 } : {}),
          ...(evidenceSummary ? { evidenceSummary } : {}),
        });

        if (source?.id && source.id !== lastPaintedCueId) {
          lastPaintedCueId = source.id;
          publishTranscript(source.id);
        }
      } else if (emptyKind) {
        overlay.update({ emptyKind, showSource, showTranslation, blurTranslation });
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
      captionSourceLabel = track.kind === "human" ? "human" : "auto";

      if (track.baseUrl) {
        try {
          const url = preferJson3Url(track.baseUrl);
          const res = await fetch(url, { credentials: "include" });
          const body = await res.text();
          return parseTimedtextBody(id, body, provenance);
        } catch {
          /* fall through */
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

    const applyHydratedCompanionState = async (id: string) => {
      const hydrated = await hydrateTimeline(id);
      if (!hydrated.ok) return false;
      const stored = hydrated.timeline as SourceTimeline | undefined;
      if (!stored?.cues?.length) return false;
      timeline = stored;
      emptyKind = undefined;
      captionSourceLabel = stored.captionSource ?? "asr-live";
      const texts = stored.cues.map((c) => c.text);
      const tr = hydrated.translation as
        | { cues?: Array<{ text?: string; provisional?: boolean }> }
        | undefined;
      if (Array.isArray(tr?.cues) && tr.cues.length > 0) {
        const drafts = tr.cues.map((c, i) => c.text ?? texts[i] ?? "");
        applyTranslationTexts(
          texts,
          drafts,
          Boolean(tr.cues.some((c) => c.provisional)),
        );
      }
      publishTranscript();
      overlay.update({
        emptyKind: null,
        statusMessage: "Restored timeline from companion store",
      });
      return true;
    };

    const runCaptionSmoke = async (id: string, href: string) => {
      timeline = null;
      translationTexts = [];
      lyricsTimeline = null;
      evidenceByCueIndex = [];
      lastEvidence = "";
      lastPaintedCueId = undefined;
      emptyKind = "no-captions";
      captionSourceLabel = undefined;
      pendingLyricsLrc = null;
      pendingLyricsTimeline = null;
      overlay.update({
        emptyKind: "no-captions",
      });
      publishTranscript();

      // Companion SQLite is authority across restarts — hydrate before live routes.
      await applyHydratedCompanionState(id);
      // CFA keeps `timeline` narrowed to null after the assignment above; widen explicitly.
      const restoredCueCount = (timeline as SourceTimeline | null)?.cues.length ?? 0;

      const bridgeTracks = await listBridgeTracks();
      const fixtureTracks = (await chrome.runtime.sendMessage({
        type: "captions.list",
        videoId: id,
      })) as CaptionTrackMeta[] | undefined;

      const tracks =
        bridgeTracks.length > 0 ? bridgeTracks : (fixtureTracks ?? []);

      const decision = routeCaptionSource({
        tracks,
        userGestureForCapture: false,
        hasOwnedMedia: false,
      });

      if (decision.action === "use-caption") {
        const live = await loadTimelineFromTrack(id, decision.track);
        if (live && live.cues.length > 0) {
          timeline = live;
          emptyKind = undefined;
          const texts = timeline.cues.map((c) => c.text);
          const companion = (await chrome.runtime.sendMessage({
            type: "companion.translate",
            videoId: id,
            texts,
            targetLang: "en",
          })) as {
            ok?: boolean;
            result?: { cues?: Array<{ text?: string; provisional?: boolean }> };
          };
          let mtProvisional = false;
          let mtReason: "offline-mock" | "dev-fallback" | undefined;
          if (companion?.ok && Array.isArray(companion.result?.cues)) {
            const drafts = companion.result.cues.map(
              (c, i) => c.text ?? texts[i] ?? "",
            );
            mtProvisional = Boolean(
              companion.result?.cues?.some((c) => c.provisional),
            );
            mtReason = mtProvisional ? "offline-mock" : undefined;
            applyTranslationTexts(texts, drafts, mtProvisional, mtReason);
          } else if (isDevelopmentMtFallbackAllowed()) {
            mtProvisional = true;
            mtReason = "dev-fallback";
            applyTranslationTexts(
              texts,
              mockMtDraft(texts, "en"),
              true,
              "dev-fallback",
            );
          } else {
            translationTexts = [];
            // Keep source captions visible; label companion failure without hiding the overlay.
            overlay.update({
              statusMessage:
                "Companion MT unavailable — showing source captions only",
            });
          }
          if (translationTexts.length > 0) {
            const gated = applyVlmGateToDrafts({
              sources: texts,
              drafts: translationTexts,
              profile: "balanced",
            });
            const provisional = mtProvisional || gated.invokedCount > 0;
            applyTranslationTexts(
              texts,
              gated.texts,
              provisional,
              gated.invokedCount > 0 ? "vlm-stub" : mtReason,
            );
            evidenceByCueIndex = gated.evidenceByIndex;
            lastEvidence =
              gated.evidenceByIndex.find((s) => s.length > 0) ?? "";
          }
          publishTranscript();
          overlay.update({ emptyKind: null });
          emptyKind = undefined;
        } else if (restoredCueCount === 0) {
          emptyKind = "no-captions";
          overlay.update({ emptyKind: "no-captions" });
        }
      } else if (decision.action === "ask-tab-capture") {
        if (restoredCueCount === 0) {
          emptyKind = "no-captions";
          overlay.update({
            emptyKind: "no-captions",
            statusMessage: asrCaptureActive
              ? "Waiting for ASR…"
              : "No captions — transcribe tab audio?",
          });
        }
      } else if (restoredCueCount === 0) {
        emptyKind = "no-captions";
        overlay.update({ emptyKind: "no-captions" });
      }

      const lyrics = resolveLyricsLocal({
        href,
        videoId: id,
        title: document.title,
        ...(timeline ? { pageCaptionTimeline: timeline } : {}),
      });
      // Do not auto-apply caption↔lyrics equivalence — require confirmation.
      if (lyrics.ok && lyrics.requiresConfirmation) {
        pendingLyricsTimeline = lyrics.timeline;
        overlay.update({
          statusMessage:
            "Possible lyrics match from captions — confirm before karaoke",
          confirmAction: { id: "confirm-lyrics", label: "Confirm as lyrics" },
        });
      } else if (lyrics.ok) {
        lyricsTimeline = lyrics.timeline;
      }
    };

    const unsub = subscribeYtNavigation(async ({ href, videoId: id }) => {
      videoId = id;
      if (!id) return;
      await runCaptionSmoke(id, href);
    });

    chrome.runtime.onMessage.addListener((message, _s, sendResponse) => {
      if (message?.type === "companion.event") {
        const event = message.event as {
          type?: string;
          timeline?: SourceTimeline;
          cues?: Array<{ text?: string; provisional?: boolean }>;
          progress?: { status?: string; message?: string; fraction?: number };
          message?: string;
          code?: string;
        };
        if (event?.type === "timeline.source" && event.timeline) {
          mergeAsrTimeline(event.timeline);
          emptyKind = undefined;
          const stub = Boolean(event.timeline.developmentFallback);
          // Never label OfflineMock as live ASR in the overlay provenance chip.
          captionSourceLabel = stub
            ? undefined
            : (event.timeline.captionSource ?? "asr-live");
          overlay.update({
            jobState: "asr-running",
            statusMessage: stub
              ? "Offline ASR stub (weights not installed) — not a real transcript"
              : "Live ASR cues received",
          });
          publishTranscript();
        }
        if (event?.type === "timeline.translation" && timeline) {
          const texts = timeline.cues.map((c) => c.text);
          const drafts = (event.cues ?? []).map(
            (c, i) => c.text ?? texts[i] ?? "",
          );
          const provisional = Boolean(event.cues?.some((c) => c.provisional));
          applyTranslationTexts(
            texts,
            drafts,
            provisional,
            provisional ? "offline-mock" : undefined,
          );
          publishTranscript();
        }
        if (event?.type === "job.progress" && event.progress?.message) {
          overlay.update({
            ...(event.progress.status === "running"
              ? { jobState: "asr-running" }
              : {}),
            statusMessage: event.progress.message,
          });
        }
        if (event?.type === "error") {
          const msg = event.message ?? event.code ?? "Companion error";
          overlay.update({ statusMessage: msg });
        }
        sendResponse({ ok: true });
        return true;
      }
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
        emptyKind = undefined;
        overlay.update({
          emptyKind: null,
          statusMessage: "Imported lyrics applied",
        });
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
        overlay.update({ statusMessage: "Lyrics applied (attributed)" });
        sendResponse({ ok: true });
        return true;
      }
      if (message?.type === "lyrics.confirm-candidate") {
        pendingLyricsLrc = String(message.lrc ?? "");
        overlay.update({
          emptyKind: "no-lyrics",
          statusMessage: `Lyrics candidate from ${String(message.attribution ?? "open API")} — confirm to apply`,
        });
        sendResponse({ ok: true });
        return true;
      }
      if (message?.type === "transcript.seek") {
        const video = document.querySelector("video");
        const startMs = Number(message.startMs ?? 0);
        if (video && Number.isFinite(startMs)) {
          video.currentTime = startMs / 1000;
        }
        sendResponse({ ok: true });
        return true;
      }
      if (message?.type === "overlay.set-sync-offset") {
        syncOffsetMs = Number(message.offsetMs ?? 0);
        overlay.update({
          statusMessage: `Sync offset ${syncOffsetMs}ms`,
        });
        sendResponse({ ok: true });
        return true;
      }
      if (message?.type === "overlay.set-empty") {
        emptyKind = message.kind as EmptyStateKind;
        overlay.update({ emptyKind });
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
      emptyKind = undefined;
      overlay.update({
        emptyKind: null,
        statusMessage: "Capture started — waiting for ASR…",
        jobState: "asr-running",
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
