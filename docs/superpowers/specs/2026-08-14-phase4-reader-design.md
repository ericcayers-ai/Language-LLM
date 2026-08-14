# Phase 4 — Reader (Text/Ebook)

Date: 2026-08-14
Roadmap: [2026-08-14-ecosystem-roadmap.md](../../research/2026-08-14-ecosystem-roadmap.md)
Depends on: [Phase 0](2026-08-14-phase0-data-model-design.md), [Phase 1](2026-08-14-phase1-card-creator-design.md)

## Purpose

Import epub/html/txt/rtf/subtitle files into a reader view where lookup and mining work identically to video/webpage mining — same `MinedItem` path, no separate "reader card" type.

## Reuse

- `page-translate` segmenter/applier — the reader paginates and tokenizes text through the exact same segmenter used for webpages, so lookup/furigana/mining behave identically.
- Dictionary lookup, furigana/pinyin annotators (unchanged, reader is a new consumer).
- Card Creator from Phase 1 (reader mining opens the same Card Creator UI with `source.kind = 'book'`).
- Phase 3's comprehension-score logic, applied to book content instead of video/page content.
- Phase 1's TTS fallback (voice sidecar) — books have no native audio at all, so every Audio Word/Audio Sentence card mined from the reader is TTS-synthesized by construction, not an edge case. This is the primary case Phase 1's fallback path was designed for, not a bolt-on for Phase 4.

## Components (new)

- **Import pipeline** (`apps/desktop/src/features/reader/import.ts`): format-specific text extraction —
  - `.txt`/`.rtf`: direct read, RTF stripped to plain text via a small RTF-to-text converter (new, self-contained, no external formatting fidelity needed since only text matters for mining).
  - `.html`: reuses the existing page-translate DOM-to-segments logic directly (it's already built for arbitrary HTML).
  - `.epub`: unzip + parse OPF manifest + concatenate spine XHTML documents, each run through the same HTML segmenter as above (an epub is HTML under the hood — no separate epub-specific tokenizer).
  - `.srt`/`.vtt`/subtitle-as-reading-text: reuses the existing caption parsers (json3/srv3/vtt), flattened to plain paginated text.
  - Each import creates one `content_sources` row (`kind = 'book'`) and stores extracted text + a chapter/page index in a new `book_content` table (`source_id`, `chapter_index`, `text`) — kept separate from `mined_items` since it's the full source text, not a mined excerpt.
- **Reader view** (`apps/desktop/src/views/ReaderView.tsx`): paginated text display, tap/click-to-lookup via the existing dictionary lookup path, mine-selection action identical to the webpage "Mine" action added in Phase 1.
- **Per-book comprehension score**: calls Phase 3's `comprehension_score(source_id)` unchanged — `book_content` text is tokenized the same way page text is, so the existing function needs no book-specific branch.

## PDF handling

Explicitly out of scope for Phase 4. PDFs route through the OCR pipeline built in Phase 8 rather than a second, redundant PDF-text-extraction path — a PDF is treated as a sequence of page images, OCR'd like any other image source. This is a deliberate exclusion, not a gap: Phase 4's definition of done does not include PDF.

## Data flow

Import file → format-specific extractor → `content_sources` + `book_content` rows → Reader view paginates `book_content` → click/select → existing lookup + Phase 1 Card Creator → `mined_items`/`cards` (Phase 0 tables, unchanged).

## Error handling

- Malformed epub (missing OPF, broken zip) surfaces a specific "couldn't read this ebook" error naming the failure (bad zip vs. missing manifest vs. empty spine) rather than a generic import failure — this determines whether the user should retry, re-export the epub, or report a bug.
- Unsupported encodings (non-UTF8 txt) are detected and auto-converted where possible; unconvertible files are rejected with a specific message rather than importing as garbled text.

## Testing

- Unit tests per format extractor against fixture files (valid epub, valid txt/rtf/html/srt, and one malformed case per format).
- Integration test: import a fixture epub, open in Reader view, mine a sentence, verify the resulting card is indistinguishable in shape from a video-mined card (same `cards` row shape, `source.kind = 'book'`).

## Definition of done

A real book/ebook can be imported, read, looked up, and mined into cards using the same pipeline as video. PDF is explicitly deferred to Phase 8, not stubbed.
