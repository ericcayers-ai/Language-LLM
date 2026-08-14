# Phase 7 — Anki Depth & Card Templates

Date: 2026-08-14
Roadmap: [2026-08-14-ecosystem-roadmap.md](../../research/2026-08-14-ecosystem-roadmap.md)
Depends on: [Phase 1](2026-08-14-phase1-card-creator-design.md), [Phase 2](2026-08-14-phase2-review-ui-design.md)

## Purpose

Cloze generation, a real custom card-template editor, and two-way Anki sync conflict handling — no "coming soon" placeholder templates.

## Reuse

- Existing AnkiConnect export (`addNotesViaAnkiConnect`, `cardsToCsv`) as the only export transport — this phase adds template/cloze logic in front of it, not a second exporter.
- `card-templates.ts` (introduced in Phase 1) as the base template set this phase makes user-editable.

## Components

- **Cloze card generation** (`packages/learning/src/cloze.ts`, new): given a card's `front_text`/`back_text` and the mined item's `lemma`, wraps the lemma occurrence(s) in the exported sentence field with `{{c1::lemma}}`, matching the target-lemma position found via exact + inflection-aware match (reusing the existing dictionary adapter's lemmatization, not a new NLP pass). Applied at export time as a transform on top of the existing `cardsToCsv()`/AnkiConnect payload — cloze is an export-format concern, not a new stored card kind.
- **Custom card template editor** (`apps/desktop/src/views/TemplateEditorView.tsx`, new): HTML-level editor over a new `card_templates` table (`id`, `kind`, `name`, `front_html`, `back_html`, `css`, `is_default`), following Anki's own note-type model (front/back HTML + shared CSS, with `{{field}}` placeholders resolved against a card's stored fields at render/export time). The four built-in templates from Phase 1 are seeded as `is_default = true` rows so "custom templates" is additive, not a fork of the built-ins.
- **Two-way sync conflict handling**: extends the `cards` table (Phase 0) with `anki_note_id` (nullable) and `anki_export_hash` (nullable) columns via a new migration. Re-export compares the current card's content hash against `anki_export_hash`; unchanged cards are skipped (no duplicate), changed cards trigger an AnkiConnect `updateNoteFields` call instead of `addNote`. Local review state (`learning_status`, `fsrs_state_json`) is never overwritten by Anki's own scheduling data — this app's FSRS state is the source of truth for local review, Anki's copy is a one-way mirror of content only, so there is no bidirectional scheduling conflict to resolve, only a content-drift conflict, which is what the hash comparison solves.

## Data flow

Card save (Phase 1/2, unchanged) → export triggered (manual or scheduled) → template resolution (`card_templates` row for the card's kind) → cloze transform if enabled → hash check against `anki_export_hash` → AnkiConnect `addNote`/`updateNoteFields` → `anki_note_id`/`anki_export_hash` written back.

## Error handling

- AnkiConnect unavailable (Anki not running) surfaces a specific "Anki isn't running" state with a retry, distinct from a template-rendering error.
- A custom template referencing a field the card kind doesn't have (e.g. `{{audio}}` on a text-only Word card) is caught at template-save time with a validation error, not at export time.

## Testing

- Unit tests for cloze wrapping against fixture sentences with single/multiple/inflected lemma occurrences.
- Unit tests for template resolution (default + custom, missing-field validation).
- Integration test against a mocked AnkiConnect: first export creates notes, second export with no changes skips, second export with an edited field calls update not create.

## Definition of done

Templates are user-editable and persisted; cloze and sync-conflict handling are real, tested logic — no "coming soon" placeholder templates.
