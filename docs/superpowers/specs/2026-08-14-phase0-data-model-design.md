# Phase 0 — Shared Data Model & Protocol Foundation

Date: 2026-08-14
Roadmap: [2026-08-14-ecosystem-roadmap.md](../../research/2026-08-14-ecosystem-roadmap.md)

## Purpose

Give every later phase (1–9) a single shared schema and protocol surface for mined items, cards, reviews, sources, and known-word status, so no phase invents its own shape. This phase ships schema + protocol + unit tests only — no UI.

## Reuse

- `SqliteStore` (`crates/local-store/src/lib.rs`) — extend with `MIGRATION_V3`, following the existing `MIGRATION_V1`/`MIGRATION_V2` + `schema_migrations` version-tracking pattern already in `.migrate()`.
- `packages/protocol/src/{messages.ts,schemas.ts,types.ts}` — extend with new message/type definitions following the existing `createAuthHandshakeRequest()`-style factory + `isXxx()` type-guard pattern.
- FSRS engine (`packages/learning/src/fsrs.ts`, `reviewFsrs()`, `createInitialFsrs()`) — Phase 0 stores its output, does not reimplement it.

## Schema (SQLite, `MIGRATION_V3`)

```sql
CREATE TABLE content_sources (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('video','page','book','ocr','clipboard')),
  title TEXT,
  origin_ref TEXT NOT NULL,        -- URL, file path, or video ID depending on kind
  language TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL
);

CREATE TABLE mined_items (
  id TEXT PRIMARY KEY NOT NULL,
  source_id TEXT NOT NULL REFERENCES content_sources(id) ON DELETE CASCADE,
  sentence_text TEXT NOT NULL,
  word_text TEXT,                  -- NULL for sentence-only capture
  lemma TEXT,
  audio_ref TEXT,                  -- path/key into blob storage, nullable
  image_ref TEXT,                  -- path/key into blob storage, nullable
  timestamp_ms INTEGER,            -- position within source, nullable for non-timed sources
  dictionary_meta_id TEXT,         -- FK-by-convention into existing dictionary tables
  created_at_ms INTEGER NOT NULL
);
CREATE INDEX idx_mined_items_source ON mined_items(source_id);

CREATE TABLE cards (
  id TEXT PRIMARY KEY NOT NULL,
  mined_item_id TEXT NOT NULL REFERENCES mined_items(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('word','audio_word','sentence','audio_sentence')),
  front_text TEXT NOT NULL,
  back_text TEXT NOT NULL,
  audio_ref TEXT,
  image_ref TEXT,
  fsrs_state_json TEXT NOT NULL,   -- opaque snapshot from packages/learning/src/fsrs.ts
  learning_status TEXT NOT NULL DEFAULT 'new'
    CHECK (learning_status IN ('new','learning','young','known')),
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);
CREATE INDEX idx_cards_mined_item ON cards(mined_item_id);
CREATE INDEX idx_cards_status ON cards(learning_status);

CREATE TABLE review_history (
  id TEXT PRIMARY KEY NOT NULL,
  card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  grade INTEGER NOT NULL CHECK (grade BETWEEN 1 AND 4),
  reviewed_at_ms INTEGER NOT NULL,
  prior_status TEXT NOT NULL,
  new_status TEXT NOT NULL,
  interval_days_after REAL NOT NULL
);
CREATE INDEX idx_review_history_card ON review_history(card_id, reviewed_at_ms);

CREATE TABLE learning_settings (
  profile_id TEXT PRIMARY KEY NOT NULL,
  known_threshold_days INTEGER NOT NULL DEFAULT 21
);
```

Per the ecosystem rule of one data model: video captions, webpage text, ebook text, and OCR output all become `content_sources` rows of different `kind`, and every capture (regardless of origin) becomes one `mined_items` row. Nothing downstream (cards, review, stats) branches on source kind.

## Known-word status state machine

Single shared module: `packages/learning/src/known-status.ts`.

- States: `new → learning → young → known` (no skipping, no re-entry from `known` back to `new` — a lapse recomputes status from FSRS interval, it does not reset the enum path).
- Transition rule: after each `reviewFsrs()` call, `deriveLearningStatus(fsrsState, knownThresholdDays)` computes the new status purely from the resulting interval:
  - `interval < 1 day` → `learning`
  - `1 day <= interval < knownThresholdDays` → `young`
  - `interval >= knownThresholdDays` → `known`
  - a card that has never been reviewed stays `new`
- `knownThresholdDays` is read from `learning_settings` (default 21, per user decision — configurable, not a fixed constant) and passed in by the caller; the module itself has no I/O.
- This function is the *only* place status is computed — Phase 2 (review), Phase 3 (stats), and Phase 5 (furigana unknown-only mode) all call it rather than re-deriving status from raw intervals themselves.

## Protocol additions (`packages/protocol/src/{types.ts,messages.ts,schemas.ts}`)

New types in `types.ts`:

```ts
export interface MinedItemRecord {
  id: string; sourceId: string; sentenceText: string; wordText?: string;
  lemma?: string; audioRef?: string; imageRef?: string; timestampMs?: number;
  dictionaryMetaId?: string; createdAtMs: number;
}

export type CardKind = 'word' | 'audio_word' | 'sentence' | 'audio_sentence';
export type LearningStatus = 'new' | 'learning' | 'young' | 'known';

export interface CardRecord {
  id: string; minedItemId: string; kind: CardKind;
  frontText: string; backText: string; audioRef?: string; imageRef?: string;
  fsrsStateJson: string; learningStatus: LearningStatus;
  createdAtMs: number; updatedAtMs: number;
}

export interface ReviewSubmission {
  cardId: string; grade: 1 | 2 | 3 | 4; reviewedAtMs: number;
}
```

New WS message pairs in `messages.ts`, following the existing `createAuthHandshakeRequest()` / `isAuthHandshakeRequest()` factory + guard pattern:

- `createMinedItemMessage(item: MinedItemRecord)` / `isMinedItemMessage()`
- `createCardCreateRequest(card: Omit<CardRecord,'id'|'createdAtMs'|'updatedAtMs'>)` / `isCardCreateRequest()`
- `createCardCreateResult(card: CardRecord)` / `isCardCreateResult()`
- `createReviewSubmitRequest(submission: ReviewSubmission)` / `isReviewSubmitRequest()`
- `createReviewSubmitResult(card: CardRecord)` / `isReviewSubmitResult()`

Each new message type is added to the discriminated union consumed by `isWsMessage()` and gets a matching Zod schema in `schemas.ts`, matching how `AuthHandshakeRequest`/`AuthHandshakeResponse` are wired today. `PROTOCOL_VERSION` (`packages/protocol/src/version.ts`) is bumped by one minor version; `compatibility.ts` gets an entry documenting that clients below the new version simply don't send/receive the new message kinds (no breaking change to existing messages).

Rust side: `packages/protocol/rust/src/lib.rs` mirrors the same three record types and message variants, kept in sync by the existing protocol test (`packages/protocol/src/__tests__/protocol.test.ts` gets new cases; a matching Rust test module is added alongside it).

## Server wiring

`ws_server.rs` gets three new handlers following the existing `handle_dictionary_lookup`-style pattern:
- `handle_card_create` — inserts into `mined_items` (if not already linked) + `cards`, returns the created `CardRecord`.
- `handle_review_submit` — loads the card's `fsrs_state_json`, calls `reviewFsrs()`-equivalent (Rust FSRS port, already exists per Phase 2 reuse note) or delegates to the TS engine via existing IPC if the FSRS engine is TS-only, computes new status via the ported `deriveLearningStatus` logic, writes `review_history` + updates `cards`.
- `handle_item_source_link` — for the case a MinedItem must be attached to a `content_sources` row created out-of-band (e.g. OCR capture that arrives after the source registration).

## Error handling

- All three handlers validate FK existence (`source_id`, `mined_item_id`, `card_id`) before writing and return a typed protocol error (reusing the existing WS error-message shape) rather than a raw SQLite constraint failure.
- `review_history.grade` and `cards.learning_status`/`kind` are enforced by `CHECK` constraints at the DB layer as a second line of defense, not the primary validation.
- Migration is additive-only (new tables, no column changes to existing tables) so `MIGRATION_V3` cannot fail against existing databases; `.migrate()`'s existing `current < 3` guard makes it idempotent on re-run.

## Testing

- Rust: unit tests in `crates/local-store/src/lib.rs` test module for each new `SqliteStore` method (create source → mined item → card → review, cascade deletes, `learning_settings` default row creation on first read).
- TS: `packages/learning/src/__tests__/known-status.test.ts` — table-driven tests over the four status transitions plus the configurable-threshold boundary (interval exactly equal to threshold, threshold changed mid-history should not retroactively rewrite past `review_history` rows).
- Protocol: extend `protocol.test.ts` with round-trip encode/decode + type-guard tests for each new message.
- No UI, so no component/e2e tests in this phase — covered by Phase 1/2's own test suites once they consume this schema.

## Definition of done

- `MIGRATION_V3` applies cleanly on top of an existing `MIGRATION_V2` database in a test fixture.
- All five new `SqliteStore` methods have passing unit tests.
- All five new protocol message pairs round-trip through `isWsMessage()` and have Zod schema coverage.
- `known-status.ts` has 100% branch coverage over its four transitions.
- No UI changes, no stub handlers — `handle_card_create`/`handle_review_submit`/`handle_item_source_link` are real, tested implementations, since Phase 1/2 will call them directly.
