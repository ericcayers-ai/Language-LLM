# Phase 8 — OCR & Clipboard Interactive Text

Date: 2026-08-14
Roadmap: [2026-08-14-ecosystem-roadmap.md](../../research/2026-08-14-ecosystem-roadmap.md)
Depends on: [Phase 1](2026-08-14-phase1-card-creator-design.md) (MinedItem pipeline)

## Purpose

Clipboard paste and OCR capture both feed the exact same lookup/card pipeline as every other source — no separate "OCR card" special case. Also the answer to Phase 4's deferred PDF support.

## Reuse

- Dictionary lookup, MinedItem pipeline (Phase 0/1) — the terminal path for both clipboard and OCR output is identical to webpage mining.
- VLM gate already used for MT ambiguity resolution — same visual-model infra backs OCR text extraction, no new vision model integration.
- Phase 1's TTS fallback (voice sidecar) — like Phase 4, clipboard/OCR/PDF sources have no native audio, so Audio Word/Audio Sentence cards mined here are TTS-synthesized by construction via the same sidecar, no separate wiring needed.

## Components

- **Clipboard capture** (`apps/desktop/src/features/clipboard/`, new): a paste target (global shortcut or in-app button) that takes clipboard text, creates a `content_sources` row (`kind = 'clipboard'`), runs it through the same segmenter used for webpage text (Phase 1 reuse), and opens the same interactive-lookup + mine UI as a webpage selection.
- **OCR capture** (`apps/desktop/src/features/ocr/`, new, desktop-first): user provides an image (screenshot region select, or a photo import for e-readers/physical media) → existing VLM infra extracts text with bounding-box/line structure → extracted text is segmented and rendered as an interactive overlay on the source image (so the user can tap a word directly on the image, not just in a flattened text view) → lookup/mine follows the same Phase 1 path.
- **PDF support**: PDFs are handled by rendering each page to an image and running it through the same OCR path above — this fulfills Phase 4's deferral rather than introducing a third text-extraction system.
- **Game-text hook compatibility (Textractor-style)**: a clipboard-ingestion listener that watches for text pushed by external game-text hookers (which typically write to clipboard or a local named pipe/port Textractor-compatible clients read) — implemented as a second producer into the same Clipboard capture path above, not a new pipeline. If the source game uses a named-pipe protocol instead of clipboard, this phase adds a thin adapter that reads the pipe and forwards into the same capture function clipboard-paste uses.

## Data flow

Image/clipboard text → (OCR via VLM gate, if image) → segmented text → interactive overlay/text view → lookup + mine → Phase 0 `mined_items`/`cards` (`content_sources.kind ∈ {ocr, clipboard}`).

## Error handling

- OCR low-confidence regions are visually flagged (not hidden) so the user knows a lookup on that word may be based on misread text, rather than silently mining a wrong word.
- Clipboard capture on non-text clipboard content (image, file) is a no-op with a clear "clipboard doesn't contain text" state, not a crash.

## Testing

- Unit tests for the clipboard segmentation path (reuses Phase 1's tested segmenter — test is about correct wiring, not re-testing the segmenter itself).
- OCR accuracy tests against a fixture set of images (book page photo, e-reader screenshot, rendered PDF page) with expected extracted text, using the existing VLM gate's test harness.
- Integration test: import a fixture PDF, verify each page becomes an OCR'd interactive source, mine a word, verify a real card lands with `source.kind = 'ocr'`.

## Definition of done

OCR output feeds the exact same lookup/card pipeline as every other source — no separate "OCR card" special case. PDF and Textractor-style game-text both ride the same underlying path rather than each getting a bespoke pipeline.
