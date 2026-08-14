# Phase 2 — Review UI

Date: 2026-08-14
Roadmap: [2026-08-14-ecosystem-roadmap.md](../../research/2026-08-14-ecosystem-roadmap.md)
Depends on: [Phase 0](2026-08-14-phase0-data-model-design.md), [Phase 1](2026-08-14-phase1-card-creator-design.md)

## Purpose

A full review loop (due-card queue, grading, session summary, word browser) over the existing FSRS engine — purely UI, no new scheduling logic.

## Reuse

- `reviewFsrs()` / `createInitialFsrs()` (`packages/learning/src/fsrs.ts`) — the only scheduler.
- Phase 0's `review_submit` WS message / `handle_review_submit` handler for persistence.
- `known-status.ts` (Phase 0) for status badges shown in the Word Browser.
- Existing `StudySession`/`.persist()` pattern (`apps/extension/features/learning/session.ts`) as the template for session state management — this phase generalizes it to the new `cards` table rather than replacing it.

## Components (new, `apps/desktop/src/views/ReviewView.tsx` + subcomponents)

- **Due-card queue**: fetches cards where `learning_status != 'known'` OR FSRS due-date <= now, ordered by due date; batches by deck if decks exist (deck concept reuses `content_sources` grouping — "deck" = cards mined from a given source, or "all"/shuffle-across-decks).
- **Review session screen**: shows card front, reveal-back on input, four-grade buttons (Again/Hard/Good/Easy → grades 1–4), calls `createReviewSubmitRequest()`, advances queue on `isReviewSubmitResult()`.
- **Study summary screen**: session totals (reviewed count, grade distribution, new known-status transitions this session) computed client-side from the session's accumulated results — no new aggregate table needed, this is a session-scoped in-memory reduce.
- **"Reset to New"**: writes a `review_history` row with a sentinel `grade = 0`... — no: grade is constrained 1-4 by Phase 0's schema, so instead this is a dedicated `handle_card_reset` server action (new, symmetric with `handle_review_submit`) that clears `fsrs_state_json` back to `createInitialFsrs()`'s output and sets `learning_status = 'new'`, without inserting a `review_history` row (a reset is not a review).
- **Shuffle-across-decks**: a queue-ordering toggle (client-side randomization of the fetched due-card list), not a data model concept.
- **Bulk "Delete and Mark As..."**: multi-select in the Word Browser, calls a new `handle_cards_bulk_update` server action (kind change or delete, batched in one SQLite transaction).
- **Word Browser**: list/search/filter (by status, by source, by kind)/sort, backed by a paginated `list_cards` query on `SqliteStore` (new method, filters translate directly to `WHERE`/`ORDER BY` on the Phase 0 `cards` table — no separate search index needed at this scale).

## Data flow

Due-card fetch → grade input → `review_submit` → Phase 0 handler updates `cards.fsrs_state_json`/`learning_status` and inserts `review_history` → UI advances to next card → session summary reduces the in-memory list of results when the queue empties.

## Error handling

- If `review_submit` fails mid-session (e.g. connection drop), the grade button shows a retry state and the card stays in the queue rather than silently advancing — no lost reviews.
- Bulk delete requires an explicit confirm step (irreversible — cascades to `mined_items`? No: deleting a card does not delete its `mined_item`, since other cards may reference the same mined item; only `review_history` cascades via the existing FK).

## Testing

- Unit tests for queue ordering/filtering logic and the client-side session-summary reducer.
- Integration test: seed `SqliteStore` with due/not-due cards, run a review session end-to-end, assert `learning_status` transitions match `known-status.ts` expectations from Phase 0's own test table.
- Component tests for Word Browser filters/sort/bulk-select.

## Definition of done

Full review loop works end to end against the FSRS engine already in `packages/learning/src/fsrs.ts` — no second scheduling algorithm introduced. Reset, bulk actions, and Word Browser are real and backed by real queries, not mocked lists.
