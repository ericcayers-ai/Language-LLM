# Phase 1 — Card Creator & Mining Loop

Date: 2026-08-14
Roadmap: [2026-08-14-ecosystem-roadmap.md](../../research/2026-08-14-ecosystem-roadmap.md)
Depends on: [Phase 0 — Shared Data Model](2026-08-14-phase0-data-model-design.md)

## Purpose

One-click mining from a caption line (or selected webpage text) into a real, saved `MinedItem` + `Card`, with sentence text, audio, screenshot, and dictionary definition all captured — no placeholder assets.

## Reuse

- Caption parsers (json3/srv3/vtt) and `source-router.ts` for locating the active caption line.
- Dictionary lookup (`lookupDictionary()`, `DictionaryLookupHit`) for auto-filled definitions.
- Furigana/pinyin annotators for auto-filled readings on the card back.
- Audio capture path (`RingBuffer`, `f32_to_pcm_i16_le`) for the audio snippet.
- WS job registry / `CaptureJob`/`CaptureJobQueue` pattern for async screenshot + audio-trim jobs so the UI isn't blocked on capture.
- `page-translate` segmenter for knowing what's selectable when mining from arbitrary webpage text.
- Phase 0's `card_create` WS message and `handle_card_create` server handler as the single write path — this phase is the UI + capture orchestration in front of it, not a new persistence path.
- **TTS fallback synthesis**, vendored from the sibling `LLM-PersonaFinetuner` repo's `app/core/voice/` pipeline (`service.py::run_pipeline`, `backends.py`) — the `pocket` backend (light-weight, local, fast enough for on-demand synthesis) generates an audio clip for Audio Word/Audio Sentence cards when a captured audio snippet isn't available for the sentence (see Error handling below). This is a cross-repo reuse, not a rebuild: the pipeline is packaged as a local sidecar service (see Architecture) rather than reimplemented in this app's stack.

### Cross-repo dependency: voice sidecar

`LLM-PersonaFinetuner`'s voice pipeline is Python/FastAPI (`app/api/voice.py`), while this app is Rust/TS (Tauri + WS server). Rather than porting the pipeline, Phase 1 vendors it as a standalone local process:

- A trimmed copy of `app/core/voice/{pipeline.py,backends.py,service.py}` ships under `services/voice-sidecar/` in this repo, run as a child process managed the same way the existing `inference-router`/ASR model processes are (per `ModelManager`/`ModelPaths` in `crates/inference-router`) — one more locally-managed model process, not a new process-management pattern.
- Exposes one endpoint the WS server calls internally: synthesize(text, language) -> wav bytes, using backend="pocket" fixed for Phase 1 (no reference-voice cloning needed here — this is synthesizing a plain, clear pronunciation for a card, not cloning anyone's voice; voice *cloning* is picked back up in Phase 9).
- Packaged/downloaded the same way other optional local models are (already-established pattern in this codebase for ASR/MT model weights) — not bundled into the base install, since `pocket`'s weights are only needed if a user actually uses TTS fallback.

## Architecture

```
Caption line click / webpage selection
        │
        ▼
 Capture orchestrator (new, extension-side)
   - grabs sentence text (existing parser/segmenter)
   - enqueues audio-trim + screenshot CaptureJobs (existing job registry)
   - calls lookupDictionary() for definition/readings
   - if audio-trim yields nothing (e.g. muted source, text-only source),
     enqueues a TTS-synthesis CaptureJob against the voice sidecar instead
        │
        ▼
 Card Creator UI (new, split view)
   - left: dictionary entries + captured assets (read-only until edited)
   - right: live card preview per selected kind
        │
        ▼
 createCardCreateRequest() → WS → handle_card_create (Phase 0) → SqliteStore
```

## Components

- **Capture orchestrator** (`apps/extension/features/mining/capture.ts`, new): given a caption line or a text selection + its source, produces a draft `MinedItemRecord` (sentence text, timestamp, source_id) and kicks off async asset jobs. Depends only on the existing parser/segmenter/job-registry APIs — testable without the UI.
- **Card Creator UI** (`apps/extension/features/mining/CardCreator.tsx`, new): split view. Left pane lists dictionary hits for the mined sentence/word and shows capture status (pending/ready) for audio+screenshot. Right pane renders a live preview of the currently selected card kind, editable inline.
- **Card type selector**: Word / Audio Word / Sentence / Audio Sentence, each mapping to a fixed front/back template (defined once, in `packages/learning/src/card-templates.ts`, new — shared with Phase 7's later "custom templates" work so Phase 7 extends rather than replaces this).
- **Webpage mining entry point**: reuses the existing `page-translate` content-script selection UI; adds a "Mine" action alongside the existing translate action, invoking the same capture orchestrator with `source.kind = 'page'`.

## Data flow

1. User clicks a caption line (or selects webpage text).
2. Orchestrator resolves/creates the `content_sources` row for the current video/page (idempotent — reuses the row if one already exists for this URL/video ID in this session).
3. Orchestrator calls `lookupDictionary()` synchronously (already fast/local) and enqueues audio+screenshot capture jobs.
4. Card Creator UI opens immediately showing the sentence + dictionary hits, with capture assets filled in as their jobs resolve (optimistic UI, not blocked on capture).
5. User picks card kind(s), edits front/back if desired, clicks Save.
6. UI sends `createCardCreateRequest()` for each selected kind; on `isCardCreateResult()` response, shows a saved confirmation and the card enters the FSRS `new` queue.

## Error handling

- If audio/screenshot capture fails (e.g. tab audio permission revoked) or the source has no native audio at all (webpage/reader/OCR text mining), the orchestrator falls back to TTS synthesis via the voice sidecar rather than disabling the Audio card kinds outright — Audio Word/Audio Sentence are only disabled if the sidecar itself is unavailable (not installed, or synthesis genuinely failed), with an inline retry action rather than a silent placeholder. The UI distinguishes "captured from source" vs. "synthesized" audio with a small badge, since the two are not interchangeable in quality (captured audio is the actual speaker; synthesized audio is a clear reference pronunciation) and users mining for authentic native-speaker input should be able to tell them apart.
- If dictionary lookup returns no hits, the back-text field starts empty and editable rather than showing a fake definition.
- Duplicate mining of the same sentence/word is not blocked at capture time but is surfaced as a non-blocking "already have N card(s) for this" note in the left pane (data comes from a `cards` lookup by `mined_item.sentence_text` — no new table needed).

## Testing

- Unit tests for the capture orchestrator: source dedup, job enqueue calls, dictionary lookup wiring (mock the job registry and dictionary API).
- Component tests for Card Creator UI: renders correctly with 0/partial/full asset state, kind selector disables correctly when audio missing, submit sends the correct WS payload per kind.
- Integration test (extension + local server, existing test harness pattern used for `runtime.test.ts`): click a real caption line in a fixture video, verify a `cards` row with real (non-empty) audio_ref/image_ref/sentence_text lands in `SqliteStore`.
- Sidecar test: synthesize a fixture sentence via the vendored `pocket` backend, verify a valid non-empty wav is returned within a bounded time budget; a sidecar-unavailable case verifies the UI falls back to the disabled-with-retry state rather than hanging.

## Definition of done

Matches the roadmap's own line: a user can watch a YouTube/Netflix video with captions on, click a line, and get a real saved card with real audio+screenshot+sentence — no placeholder assets, no "TODO: wire up audio" left behind. Webpage-text mining produces an equivalent real card via the same orchestrator and the same `card_create` path.
