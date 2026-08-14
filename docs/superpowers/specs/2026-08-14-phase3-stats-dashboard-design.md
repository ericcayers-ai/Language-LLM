# Phase 3 — Stats & Motivation Dashboard

Date: 2026-08-14
Roadmap: [2026-08-14-ecosystem-roadmap.md](../../research/2026-08-14-ecosystem-roadmap.md)
Depends on: [Phase 0](2026-08-14-phase0-data-model-design.md), [Phase 2](2026-08-14-phase2-review-ui-design.md)

## Purpose

A dashboard view computed entirely from real stored review/mining data: known-word count, streaks, cards mined/reviewed per day, and a per-content comprehension ("i+1") score.

## Reuse

- `known-status.ts` (Phase 0) for known-word counting.
- `review_history`/`cards`/`mined_items` tables (Phase 0) as the only data sources — no new tracking tables except a small aggregate cache described below.
- Existing desktop view pattern: sits alongside `OverviewView`/`StorageView`/`ModelsView` in `apps/desktop/src/views/`.

## Components (new, `apps/desktop/src/views/StatsView.tsx`)

- **Known-word count**: `SELECT COUNT(DISTINCT lemma) FROM mined_items JOIN cards ... WHERE learning_status = 'known'` — a new `SqliteStore::known_word_count()` method.
- **Streak (current + longest)**: derived from distinct dates present in `review_history.reviewed_at_ms`, computed as a new `SqliteStore::review_streaks()` method that walks the sorted distinct-day list once (O(days reviewed), not O(all history) per render) — not just trailing-12-months, per the roadmap's explicit correction to Migaku/HayaiLearn's more limited streak views.
- **Cards mined/reviewed per day**: two time-series queries (`GROUP BY date(created_at_ms/1000, 'unixepoch')` equivalent) feeding a simple bar chart, capped to a selectable range (7/30/365 days) so the query stays bounded.
- **Per-content comprehension ("i+1") score**: `comprehension_score(source_id)` = (count of distinct lemmas in that source's `mined_items`/segments that the user already has as `known`) / (total distinct lemmas encountered in that source). Requires knowing "all vocabulary in the source," not just what was mined — for video/page this means running the existing segmenter/tokenizer over the full transcript/page text (already available, reused, not reimplemented) rather than just the subset the user chose to mine.

## Data flow

Dashboard load → parallel queries (known-word count, streaks, time series) → render. Per-content score is computed on-demand when a user opens a specific video/page/book's detail panel (not precomputed for every source up front, since most sources are never revisited).

## Performance note

Streak and time-series queries run once per dashboard load, not per-frame; given local-first SQLite and expected review-history sizes (thousands, not millions, of rows per user), no caching layer is needed for v1. If profiling later shows this is slow, add a materialized daily-rollup table — deliberately not built now, to avoid the exact kind of speculative complexity the ecosystem rules warn against.

## Error handling

- A source with zero mined items shows "not enough data yet" rather than a divide-by-zero or a 0%/NaN score.
- Missing/corrupt `fsrs_state_json` on a card (should be impossible given Phase 0's write path, but defensively) is excluded from known-count rather than crashing the dashboard.

## Testing

- Unit tests for `known_word_count()`, `review_streaks()` (including streak-break and same-day-multiple-reviews edge cases), and `comprehension_score()` against seeded fixture data with known expected outputs.
- Component test: StatsView renders real numbers from a seeded store, not zeros/placeholders.

## Definition of done

Every stat shown is computed from real stored review/mining data, none hardcoded or mocked. Streak logic explicitly handles current + longest, not just a trailing window.
