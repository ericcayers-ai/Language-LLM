# Phase 6 — Multi-Site & Multi-Format Mining Expansion

Date: 2026-08-14
Roadmap: [2026-08-14-ecosystem-roadmap.md](../../research/2026-08-14-ecosystem-roadmap.md)
Depends on: [Phase 1](2026-08-14-phase1-card-creator-design.md) (source adapters feed the Phase 1 pipeline)

## Purpose

Add streaming-site adapters, local video import, podcast mining, and subtitle-format completeness — every new source produces real `MinedItem`s through the unchanged Phase 1 pipeline.

## Reuse

- `source-router.ts` for dispatching to the correct adapter based on active tab/URL.
- Caption format parsers (json3/srv3/vtt) — already handle the wire formats; new sites are new *adapters* around existing parsers, not new parsers.
- Existing YouTube/Netflix adapter pattern in `apps/extension/features/captions/` as the template every new adapter follows.
- Phase 1's Card Creator/capture orchestrator (unchanged consumer of whatever adapter is active).
- `asr_router.rs` (existing ASR pipeline) for podcast/no-caption transcript generation.

## Components

- **New site adapters** (`apps/extension/features/captions/{disney,viki,iqiyi,bilibili}.ts`, new, one file each): each implements the same adapter interface as the existing YouTube/Netflix adapters (locate caption track, parse to the common timeline format, expose current-line lookup) — the interface itself is not new, only the per-site DOM/API integration is.
- **Local video file import + local player** (`apps/desktop/src/features/local-player/`, new): a Tauri-side video player component; captions come from a sibling `.srt`/`.vtt`/`.ass` file if present, or trigger ASR (below) if absent. Feeds the *same* Card Creator from Phase 1 with `source.kind = 'video'`, `origin_ref` = local file path instead of a URL.
- **Podcast mining**: audio-only source; on import, if no transcript exists, calls `asr_router.rs` to generate one, stored as a `content_sources` row (`kind = 'video'` is reused — a podcast is audio-only video, mining doesn't care about the missing image track) with the generated transcript in the existing transcript table (`SqliteStore::put_transcript`, unchanged).
- **`.ass` subtitle import + drag-and-drop**: a new `.ass`-to-common-timeline parser (`apps/extension/features/captions/ass-parser.ts`) alongside the existing json3/srv3/vtt parsers, plus a drag-and-drop target on the local player and on video pages that accepts any of the four formats and attaches it as an override caption track.
- **Subtitle regeneration for auto-generated tracks**: when a site only offers a low-quality auto-caption track, offer "regenerate via local ASR" using the existing `asr_router.rs` against the video's extracted audio, replacing the low-quality track for mining purposes (the original auto-track is not deleted, the regenerated one is stored as a preferred alternate).

## Data flow

New adapter/import path → common timeline format (unchanged, already shared by all existing sites) → Phase 1 capture orchestrator (unchanged) → Phase 0 `mined_items`/`cards` (unchanged).

## Error handling

- Adapter failure (site DOM changed, no caption track found) surfaces a specific "captions not available on this site/video" state rather than a silent no-op mine button.
- ASR generation for podcasts/regeneration runs as an async job (existing `CaptureJob` pattern) with visible progress, since ASR over a full episode can take real time — no blocking UI wait.

## Testing

- Unit tests per adapter against recorded fixture DOM/API responses (one fixture per site), verifying correct timeline extraction.
- Unit tests for the `.ass` parser against sample `.ass` files covering styled/multi-line cues.
- Integration test: local video + `.srt` sidecar → local player → mine a line → real card, same shape as a streaming-site-mined card.

## Definition of done

Each new source produces real `MinedItem`s through the same Phase-1 pipeline; sequenced after Phase 1 so no adapter is built before the pipeline it feeds exists.
