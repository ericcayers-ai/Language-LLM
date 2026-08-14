# Phase 5 — Language Tooling Parity

Date: 2026-08-14
Roadmap: [2026-08-14-ecosystem-roadmap.md](../../research/2026-08-14-ecosystem-roadmap.md)
Depends on: [Phase 0](2026-08-14-phase0-data-model-design.md) (for unknown-word display mode); can run parallel to Phases 4/6.

## Purpose

Real, data-backed toggles for furigana display modes, grammar notes, inline gloss, plaintext lookup, and zhuyin — no UI element without data behind it.

## Reuse

- Existing furigana/pinyin/hangul annotators (unchanged core; this phase adds display-mode switching on top).
- Dictionary adapters (grammar notes are sourced/stored the same way dictionary entries already are).
- Existing content-script lookup path (shift+hover) — plaintext lookup extends it rather than replacing it.

## Components

- **Furigana display-mode switch** (`packages/language-kits/src/furigana-mode.ts`, new): a pure function `applyDisplayMode(annotatedText, mode, knownLemmas)` where `mode ∈ {none, all, unknown-only, on-hover}`. `unknown-only` filters using the Phase 0 `known-status.ts` output (a lemma is "known" if its most-advanced card has `learning_status = 'known'`) — this is the one place this phase depends on Phase 0's schema; the other three modes are pure display and need no new data.
- **Grammar reference/notes**: new `grammar_notes` table (`id`, `language`, `pattern`, `explanation_md`, `source_citation`) populated from a curated per-language dataset (sourced the same way dictionary data is — bundled/downloadable data files, not scraped at runtime), surfaced in a new `GrammarPanel.tsx` triggered from a word/pattern lookup result.
- **Inline word translations**: gloss text rendered under unknown words directly in video captions/webpage text/reader text, reusing the existing furigana positioning logic (the gloss is laid out the same way a reading annotation is, just showing the dictionary short-gloss instead of a reading) — gated by the same `unknown-only`-style known-lemma check.
- **Plaintext lookup (shift+hover without extension "enabled")**: the existing content-script lookup currently requires an enabled/active state per the extension's own gating; this phase adds a lightweight always-on listener that only activates on the shift-hover chord, bypassing the "enabled" gate specifically for this on-demand path (does not bypass any permission/privacy gating, only the manual on/off toggle).
- **Zhuyin support**: new adapter in `packages/language-kits/src/adapters/zhuyin.ts`, following the existing pinyin adapter's shape exactly (same interface, alternate romanization/phonetic table), selectable alongside pinyin in the existing reading-display settings.

## Data flow

Display-mode settings are per-profile (stored alongside `learning_settings` from Phase 0, extended with `furigana_mode`, `reading_system` columns). Every surface that renders annotated text (captions, page-translate overlay, reader) reads these settings once and calls the same `applyDisplayMode()`/annotator, so there is exactly one code path per concern, not one per surface.

## Error handling

- Missing grammar data for a language falls back to "no grammar notes available for this language yet" rather than an empty/broken panel.
- `unknown-only` mode with zero known lemmas (new user) is not an error — it's equivalent to `all` mode until the user has mined/reviewed enough for the distinction to matter.

## Testing

- Unit tests for `applyDisplayMode()` across all four modes against fixture annotated text + a fixture known-lemma set.
- Unit tests for the zhuyin adapter against the same fixture inputs used for the existing pinyin adapter's tests (parity, not just presence).
- Integration test: toggle each display mode in settings, verify caption/page/reader surfaces re-render correctly.

## Definition of done

Each mode is a real toggle backed by the existing annotators, not a UI element with no data behind it. Zhuyin has the same test coverage as pinyin, not partial parity.
