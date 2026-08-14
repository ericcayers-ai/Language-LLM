# All-in-One Ecosystem Roadmap

Date: 2026-08-14
Builds on: [2026-08-14-migaku-hayailearn-gap-analysis.md](./2026-08-14-migaku-hayailearn-gap-analysis.md)

## Purpose and ground rules

This is a **decomposition roadmap**, not an implementation plan. Each phase below is its own sub-project and gets its own brainstorming → spec → plan cycle before code is written — that's how "no stubs, no mistakes" is actually enforced: nothing here ships half-built, because nothing here ships without going through the full skill lifecycle (spec → plan → incremental implementation → tests → review) first.

Two rules apply across every phase, to keep this from becoming 11 disconnected features bolted onto one app:

1. **One data model.** A "mined item" is the same underlying record whether it came from a video subtitle, a webpage, an ebook, or OCR — it flows through lookup → card → review → stats → (later) roleplay without duplication. Phase 0 exists specifically to define this before any UI is built on top of it, because retrofitting a shared schema after three features assume three different ones is exactly how ecosystems fragment.
2. **Reuse before build.** Every phase below opens by naming what already exists in this codebase that the phase must extend rather than replace (FSRS engine, dictionary adapters, page-translate segmenter, caption parsers, ASR/MT/VLM pipeline). If a phase's plan proposes a parallel implementation of something Phase 0 already centralized, that's a red flag to catch in that phase's spec review, not after.

## Architectural throughline

```
Capture sources (video captions, webpage, reader text, OCR, clipboard, local file)
        │
        ▼
  Shared "MinedItem" record  ──────────────► Dictionary/language-kit lookup (exists)
  (sentence, audio, image,                    (JMdict/CC-CEDICT/kaikki, furigana/
   source ref, timestamp)                      pinyin/hangul — exists)
        │
        ▼
   Card Creator (new)  ──► FSRS scheduling (exists) ──► Review UI (new)
        │                                                    │
        ▼                                                    ▼
   Anki export (exists, extend)                      Known-word tracker (exists)
                                                              │
                                                              ▼
                                                     Stats dashboard (new)
```

Everything left of "new" already exists in the graph; everything marked "new" is what this roadmap builds.

## Phase 0 — Shared data model & protocol foundation

**Why first:** every later phase writes to or reads from this. Building it once now is cheaper than three phases each inventing their own card/item shape.

- Extend `SqliteStore` (currently the top god-node at 34 edges — it's already the central store, this formalizes it) with tables for: mined items, cards (word/audio-word/sentence/audio-sentence — the four Migaku card types), review history, content sources (video/page/book/OCR), and known-word status transitions.
- Extend the WS protocol (`packages/protocol/src/messages.ts`, `schemas.ts`) with message types for card creation, review submission, and item-source linking — following the existing `handle_dictionary_lookup`-style pattern in `ws_server.rs`.
- Define the "known" threshold and learning-status state machine (new word → learning → young → known at 21+ day interval, matching the FSRS engine's own interval output) as a single shared module, not duplicated per-feature.
- **Definition of done:** schema + protocol only, covered by unit tests and a migration; no UI. This phase is intentionally invisible to the user — that's correct, not a stub, because every other phase's UI depends on it existing first.

## Phase 1 — Card Creator & mining loop

**Reuses:** caption parsers, source router, dictionary lookup, furigana/pinyin annotators, WS job registry (for async audio/screenshot capture, same pattern as existing `CaptureJob`/`CaptureJobQueue`).

- One-click mining from a caption line: capture sentence text + audio snippet (reuse `RingBuffer`/`f32_to_pcm_i16_le` capture path) + video frame screenshot + dictionary definition, written as a Phase-0 MinedItem.
- Card Creator UI: split view — dictionary entries/captured assets on one side, live card preview on the other (matches the reuse-first rule: this is a new UI over existing lookup data, not a new lookup engine).
- Four card types (Word / Audio Word / Sentence / Audio Sentence), auto-fill with manual override.
- Card creation from arbitrary webpage text (not just video) — reuses `page-translate` segmenter to know what's selectable.
- **Definition of done:** a user can watch a YouTube/Netflix video with captions on, click a line, and get a real saved card with real audio+screenshot+sentence — no placeholder assets, no "TODO: wire up audio" left behind.

## Phase 2 — Review UI

**Reuses:** FSRS engine (`reviewFsrs()`, `createInitialFsrs()`) — this phase is purely a UI over an already-correct scheduler, not a new SRS.

- Review session screen: shows due cards, records grade, calls `reviewFsrs()`, persists via Phase-0 tables.
- Study summary screen (session results), "Reset to New," shuffle-across-decks, bulk "Delete and Mark As...".
- Word Browser: list/search/filter/sort known words, jump from a word to its card(s).
- **Definition of done:** full review loop works end to end against the FSRS engine already in `packages/learning/src/fsrs.ts` — no second scheduling algorithm introduced.

## Phase 3 — Stats & motivation dashboard

**Reuses:** known-word tracker, review history from Phase 0/2.

- Dashboard view (new `apps/desktop/src/views/StatsView.tsx`, alongside existing `OverviewView`/`StorageView`/`ModelsView`) showing: known-word count, streak (current + longest, not just trailing-12-months), cards mined/reviewed per day.
- Per-content comprehension score ("i+1" indicator) — computed from the user's actual known-word set against a given video/page/book's vocabulary, matching Migaku's approach rather than a generic difficulty label.
- **Definition of done:** every stat shown is computed from real stored review/mining data, none hardcoded or mocked.

## Phase 4 — Reader (text/ebook)

**Reuses:** page-translate segmenter/applier, dictionary lookup, furigana/pinyin, Card Creator from Phase 1.

- Import epub/html/txt/rtf/subtitle files into a reader view; reuse the segmenter so lookup/mining works identically to video/webpage mining (same MinedItem path — no separate "reader card" type).
- Per-book comprehension score (Phase 3's scoring logic, applied to book content).
- PDF: no native parser in Phase 4 — route through the OCR pipeline being built in Phase 8 rather than building a second, redundant PDF-specific text extractor.
- **Definition of done:** a real book/ebook can be imported, read, looked up, and mined into cards using the same pipeline as video.

## Phase 5 — Language tooling parity

**Reuses:** furigana/pinyin/hangul annotators, dictionary adapters.

- Furigana display modes: none / all / unknown-only / on-hover (currently the annotator exists; this phase is the display-mode UI switch).
- Grammar reference/notes per language, sourced and stored like the dictionary data already is.
- Inline word translations (word-level gloss shown under unknown words, not just on click).
- Plaintext lookups (shift+hover lookup that works without the extension being "enabled" on a page) — extends the existing content-script lookup path.
- Zhuyin support alongside existing pinyin.
- **Definition of done:** each mode is a real toggle backed by the existing annotators, not a UI element with no data behind it.

## Phase 6 — Multi-site & multi-format mining expansion

**Reuses:** `source-router.ts`, caption format parsers (json3/srv3/vtt already exist).

- Additional streaming sites: Disney+, Viki, iQIYI, Bilibili (each is a new source adapter following the existing YouTube/Netflix pattern in `apps/extension/features/captions/`).
- Local video file import + local player (equivalent to Migaku's Local Player) — reuses the Card Creator from Phase 1, new source type only.
- Podcast mining: audio-only source, feeds the existing ASR router (`asr_router.rs`) to generate transcripts/captions where none exist — this is where the local-first ASR advantage over both competitors actually pays off.
- Subtitle format completeness: `.ass` import, drag-and-drop subtitle files, subtitle regeneration for auto-generated tracks.
- **Definition of done:** each new source produces real MinedItems through the same Phase-1 pipeline; explicitly sequenced after Phase 1 so there's no risk of building six source adapters before the thing they feed into exists.

## Phase 7 — Anki depth & card templates

**Reuses:** existing AnkiConnect export (`addNotesViaAnkiConnect`, `cardsToCsv`).

- Cloze card generation (auto-wrap the target lemma in `{{c1::}}` against the exported sentence field — equivalent to the community Migaku Anki Cloze Helper, but built in rather than a separate add-on).
- Custom card template editor (HTML-level, following Anki's note-type model).
- Two-way sync conflict handling (export status tracking so re-export doesn't duplicate, and local review state doesn't drift from Anki's).
- **Definition of done:** templates are user-editable and persisted; no "coming soon" placeholder templates.

## Phase 8 — OCR & Clipboard interactive text

**Reuses:** dictionary lookup, MinedItem pipeline, VLM gate (already exists for MT ambiguity — same visual-model infra can back OCR).

- Clipboard: paste arbitrary text, get the same interactive lookup/mining as a webpage.
- OCR capture (photo → interactive text) for books, e-readers, physical media — desktop first, given no mobile app exists yet (see Phase 10 note).
- Game-text hook compatibility (Textractor-style clipboard ingestion) — this is really just Clipboard with a different upstream source, so it rides on the same code path.
- **Definition of done:** OCR output feeds the exact same lookup/card pipeline as every other source — no separate "OCR card" special case.

## Phase 9 — AI roleplay & shadowing

**Reuses:** local ASR (pronunciation grading needs speech input scoring — build on `asr_router.rs`), MT/dictionary for scenario generation, known-word tracker (scenarios should be built from vocabulary the user has actually mined, matching HayaiLearn's approach).

- Shadowing mode: play a mined sentence's audio, record the user's attempt, score against it.
- Roleplay conversation partner constructed dynamically from the user's known-word set.
- **Definition of done:** this is the highest-effort, most novel phase (real-time speech scoring). It should get its own dedicated spec with explicit accuracy/latency acceptance criteria before implementation starts — flagging now so it isn't compressed into a quick add-on later.

## Phase 10 — Cross-platform (flag, not yet scoped)

Both competitors ship mobile apps; this app is currently desktop (Tauri) + browser extension only. Mobile is a genuinely separate platform effort (not a phase that reuses existing code the way Phases 1–9 do) — recommend treating "should this become a mobile app" as its own decision point after Phases 0–3 ship and prove the core loop, rather than committing to it now.

## Sequencing summary

```
Phase 0 (foundation, invisible)
   │
   ▼
Phase 1 (mining/cards) ──► Phase 2 (review) ──► Phase 3 (stats)
   │                                                 │
   ▼                                                 │
Phase 4 (reader) ◄───────────── shares MinedItem ────┘
   │
   ▼
Phase 5 (language tooling parity) — can run parallel to 4/6
Phase 6 (multi-site/format expansion) — depends on Phase 1 existing
Phase 7 (Anki depth) — depends on Phase 1/2
Phase 8 (OCR/Clipboard) — depends on Phase 1
Phase 9 (roleplay/shadowing) — depends on Phase 2 (known-word set) + local ASR
Phase 10 (mobile) — deferred decision, not sequenced yet
```

Phases 0–3 are the critical path: they're what makes this "an app" instead of "a set of engines with no interface." Everything from Phase 4 onward is genuinely additive and can be resequenced based on what you want to use first.

## Next step

Per the brainstorming process, each phase now needs its own design before implementation. Recommend starting with **Phase 0**, since every other phase depends on its schema — I'll brainstorm that one in detail next unless you'd rather start elsewhere (e.g. jump straight to Phase 1's UI if you want something visible fast, accepting that Phase 0 gets defined alongside it instead of strictly before).
