# Phase 0 Spec — Shared Data Model & Protocol Foundation (v2)

Date: 2026-08-26
Branch: `feat/migaku-hayailearn`
Roadmap: [2026-08-14-ecosystem-roadmap.md](../research/2026-08-14-ecosystem-roadmap.md) (Phase 0)
Supersedes: [2026-08-14-phase0-data-model-design.md](../superpowers/specs/2026-08-14-phase0-data-model-design.md) — see "Why this revision exists" below.

## Purpose

Give every later phase (1–9) one shared persistence surface and protocol surface for mined items, cards, sources, and known-word status, so no later phase invents its own shape. Phase 0 ships **schema + protocol + unit tests only** — no UI, by design ("invisible foundation" per the roadmap).

This is the design/spec document for that work. No code in this phase beyond the trivial gaps it identifies in modules that already landed.

## Why this revision exists

The 2026-08-14 Phase 0 design specified a fully normalized schema (`content_sources`, `mined_items`, `cards`, `review_history`) as `MIGRATION_V3`. What actually shipped (commit `a35a723`, 2026-08-23) took a deliberately lighter slice:

- `MIGRATION_V3` (`crates/local-store/src/lib.rs:296`) adds clip-window columns to the generic key–value `study_data` table plus a new `word_status` table — not the normalized five-table schema.
- New TS modules landed: `packages/learning/src/clipCard.ts` (clip-anchored CSV export/import) and `packages/learning/src/difficulty.ts` (unknown-ratio difficulty predictor), both with passing Vitest suites.
- `StudyCard` (`packages/protocol/src/types.ts`) gained optional `videoClipStartMs` / `videoClipEndMs` / `perWord` fields, mirrored by `PerWordStatus` / `WordStatus` in `packages/protocol/rust/src/lib.rs` and enforced by `scripts/check-protocol-parity.mjs`.

This revision treats the lighter slice as the correct baseline — the generic `study_data(kind, payload_json)` table already works end to end through `study.sync`, and rewriting to a normalized schema before any consumer exists would violate the repo's own reuse-before-build rule. It defines the remaining Phase 0 work as five concrete gaps against the current tree. Conditions that would trigger revisiting normalization are listed under Non-goals.

## Current-state audit (verified on this branch, 2026-08-26)

| Capability | Status | Evidence |
| --- | --- | --- |
| Migrating store with version tracking | Done | `MIGRATION_V1/V2/V3` + `schema_migrations` guard chain, `crates/local-store/src/lib.rs:217-374` |
| Generic card/item persistence (put/get/list/delete) | Done | `study_data` table; `SqliteStore::{put_study,get_study,list_study_by_kind,delete_study}`; WS handler `handle_study_sync` (`apps/desktop/src-tauri/src/ws_server.rs:1393`) with ops `put/get/list/delete` |
| Clip-window columns at rest | Partial | Columns exist (`MIGRATION_V3`); `get_study_with_clip()` (`lib.rs:570`) is implemented but **never called** — `get`/`list` responses drop them |
| Known-word status storage | Done | `word_status` table; `put_word_status` / `list_word_status` / `word_status_histogram`; **no WS message reaches it** — desktop-only |
| Word lifecycle enum (TS↔Rust parity) | Done | `WordStatus` = unknown/learning/known/ignored/tracked in both `types.ts:45` and `lib.rs` (Rust mirror); parity-scripted |
| Learning-status state machine (new→learning→young→known) | Missing | Roadmap requires it as a single shared module; nothing computes card status from FSRS intervals today |
| Clip CSV round-trip | Done | `clipCard.ts` (`cardsToCsvWithClips` / `parseClipCsv`) + `__tests__/clipCard.test.ts` |
| Per-content difficulty ("i+1") predictor | Done (module) / Unwired | `difficulty.ts::predictDifficulty` + `tokenizeSurfaces`; no caller stores its output |
| Protocol typing/validation for study.sync | Partial | Factory + discriminated union entry exist (`messages.ts:248-263`); **no Zod schema** in `schemas.ts` and no clip fields on the message type |

## Gap designs

### P0-1 — Close the clip-column round-trip (protocol + handler)

Trivial-gap class: all storage primitives exist; two call sites need to use them.

**Files & changes**

1. `packages/protocol/src/types.ts` — extend the `study.sync` message variant: add optional `videoClipStartMs?: number` and `videoClipEndMs?: number`. The `study.sync.result` payloads are plain objects today; give `get`/`list` results an explicit exported shape (`StudySyncGetResult`, `StudySyncListResult`) whose records carry the same two optional fields. Additive only; stays inside protocol major version 1 (the compatibility contract in `compatibility.ts` pins major equality only, so additive optional fields are non-breaking).
2. `packages/protocol/src/messages.ts` — `createStudySync()` accepts and forwards the two optional clip fields (same conditional-spread pattern used for `kind`/`id`/`payload`).
3. `apps/desktop/src-tauri/src/ws_server.rs` — in `handle_study_sync`: `"get"` op switches from `get_study` to `get_study_with_clip` and includes `videoClipStartMs`/`videoClipEndMs` in the JSON response when present; `"list"` op switches to a new `list_study_with_clip_by_kind` (thin clone of `list_study_by_kind` adding the two columns) and does the same. `"put"` already persists clips — unchanged.
4. `crates/local-store/src/lib.rs` — add `list_study_with_clip_by_kind` next to `list_study_by_kind` (SELECT includes `video_clip_start_ms, video_clip_end_ms`). Keep `get_study` for backward compat or migrate its callers; do not delete public methods in this phase.
5. `packages/protocol/src/schemas.ts` — add `studySyncSchema` (Zod): discriminated on `type: "study.sync"`, `op` enum `["put","get","list","delete"]`, optional `kind`/`id` strings, `payload` passthrough object, optional non-negative-int clip fields. Register it wherever sibling message schemas are registered so inbound validation covers it.

**Acceptance criteria**

- Put a card with clip window over WS → `get` returns identical `videoClipStartMs`/`videoClipEndMs`; `list` shows them too.
- Put without clips → fields are absent (not `null`) in responses.
- Zod parse of a valid `study.sync` passes; `op: "upsert"` fails closed.

### P0-2 — Expose word-status sync over WS

`put_word_status` / `list_word_status` have no protocol path. Phase 3 (stats) needs the histogram remotely; the extension needs read/write for its known-word tracker UI.

**Files & changes**

1. `apps/desktop/src-tauri/src/ws_server.rs` — new handler `handle_word_status_sync(state, value, sink, session_token)` following the `handle_study_sync` pattern exactly (same auth gate via `authed(...)`, same error-shape discipline):
   - op `"put"`: body `{ surface: string, status: WordStatus, encounters: number, updatedAtMs: number }` → `put_word_status(WordStatusRow{...})` → respond `{ ok }`.
   - op `"list"`: → `list_word_status()` → `{ ok: true, items: [...] }`.
   - op `"histogram"`: → `word_status_histogram()` → `{ ok: true, counts: { "<status>": n } }`.
   - Dispatch arms `"wordstatus.put"` / `"wordstatus.list"` / `"wordstatus.histogram"` added to the `match msg_type` block beside `"study.sync"`.
2. `packages/protocol/src/messages.ts` + `types.ts` — factories/guards `createWordStatusSync(input)` / result types, mirroring `createStudySync`. Reuse the existing `WordStatus` union from `types.ts`.
3. `packages/protocol/rust/src/lib.rs` — no change required: the companion constructs responses dynamically (`serde_json::json!`), and `WordStatus`/`PerWordStatus` already exist there. If the implementer prefers typed variants, they must add them to **both** sides and register the pair in `scripts/check-protocol-parity.mjs` — half-mirrored additions are a review-blocking defect.
4. `scripts/check-protocol-parity.mjs` — no change under option 3's default (dynamic responses carry existing mirrored types).

**Acceptance criteria**

- Round-trip: put three surfaces with mixed statuses → `list` returns all three ordered by `updatedAtMs DESC`; `histogram` returns correct counts per status.
- Unknown `op` → `{ ok: false, error: "unknown op" }`; unauthenticated request → auth error, no store touch.

### P0-3 — Learning-status derivation module (the state machine)

Roadmap requirement verbatim: *"Define the 'known' threshold and learning-status state machine (new word → learning → young → known …) as a single shared module, not duplicated per-feature."*

**Design**

New pure module `packages/learning/src/knownStatus.ts`, re-exported from `index.ts` alongside `fsrs.js`:

```ts
export type CardLearningStatus = "new" | "learning" | "young" | "known";

export const DEFAULT_KNOWN_THRESHOLD_DAYS = 21;

export function deriveLearningStatus(
  fsrsState: Pick<FsrsState, "reps" | "scheduledDays">,
  knownThresholdDays: number = DEFAULT_KNOWN_THRESHOLD_DAYS,
): CardLearningStatus
```

Transition rule (pure function of FSRS output; no I/O, no clock reads):

- never-reviewed (`reps === 0`) → `"new"`
- `scheduledDays < 1` → `"learning"`
- `1 <= scheduledDays < knownThresholdDays` → `"young"`
- `scheduledDays >= knownThresholdDays` → `"known"`

Rules binding all consumers:

- This module is the **only** place card status is derived. Phase 2 (review UI), Phase 3 (stats), and Phase 5 (furigana unknown-only mode) import it; none may re-derive from raw intervals.
- Status changes flow through `reviewFsrs()` output → `deriveLearningStatus` → persisted `learningStatus` on the card payload. A lapse recomputes from the new interval; the enum path is derivable, not hand-maintained.
- `knownThresholdDays` default 21 matches the roadmap; it is caller-supplied so a future settings row can override it without touching this module.
- Deliberate divergence from the old spec's `interval_days` naming: FSRS here exposes `scheduledDays` on `FsrsState` (`packages/learning/src/fsrs.ts`), so the module consumes that field directly instead of inventing a parallel interval concept.

**Note on the four Migaku card kinds** (`word` / `audio_word` / `sentence` / `audio_sentence`): kind is metadata of a mined card, orthogonal to status derivation; it travels in the card `payload_json` until a consumer (Phase 1 Card Creator) needs first-class typing. Not part of this gap.

**Tests** — `packages/learning/src/__tests__/knownStatus.test.ts`:

- reps=0 → `new` regardless of interval.
- Boundaries: `scheduledDays = 0` → `learning`; `= 1` → `young`; `= 20` → `young` (threshold 21); `= 21` → `known`; `= 999` → `known`.
- Custom threshold (e.g. 7): `7` → `known`, `6` → `young`.
- Lapse case: previously-known state re-reviewed to `scheduledDays = 3` → returns `young` (derivation is stateless; history lives in persisted payloads/reviews).
- Property-ish sweep: for threshold T and days D ∈ [-1..60], assert piecewise membership exactly once (no overlap/gap between the four states).

### P0-4 — Wire difficulty + word snapshot into the mining session

`predictDifficulty` exists but nothing calls it; `StudyCard.perWord` exists but nothing populates it. Phase 0's data-model job is to make these real outputs of the capture path so Phase 3 comprehension scoring has data waiting for it.

**Files & changes**

1. `apps/extension/features/learning/session.ts` — where a study card is assembled during sentence mining, compute `const tokens = tokenizeSurfaces(sentenceText)` and attach to the outgoing `study.sync` payload: `difficulty: predictDifficulty(knownWords, tokens)` and `perWord: PerWordStatus[]` snapshot (surface/status/encounters from the session's tracker state). `knownWords` comes from the extension's existing known-word set (lowercased surfaces — matching `predictDifficulty`'s contract).
2. `apps/extension/features/learning/__tests__/session.test.ts` — extend: mining a sentence produces a payload containing integer `difficulty` in [1,10] and a `perWord` array whose surfaces ⊆ tokenized sentence.
3. No desktop change: `payload_json` is schema-agnostic by design; the validator for these fields belongs to Phase 3's stats ingestion, which will read them.

**Acceptance criteria**

- Mining a caption line stores `payload.difficulty` (int 1–10) and `payload.perWord` in `study_data.payload_json`.
- All-unknown sentence → difficulty 9–10 range behavior documented by existing `difficulty.test.ts` holds through the wired path (integration spot-check).

### P0-5 — Schema hardening notes (documented deferral, not code)

SQLite cannot add CHECK constraints via `ALTER TABLE`; enforcing `kind`/`status` value domains at the DB layer requires a table-rebuild migration. Decision:

- Validation stays at the TS/Zod boundary (P0-1/P0-2 schemas) and at Rust handler boundaries until Phase 2 introduces bulk review writes.
- When Phase 2 lands its first write-heavy feature, ship `MIGRATION_V4` rebuilding `study_data` and `word_status` with CHECK domains and FK enforcement enabled (`PRAGMA foreign_keys = ON` is currently not set anywhere — verified). That migration owns the rebuild pattern; Phase 0 does not pre-pay it.
- Canonical `kind` string registry (single source of truth for the generic table's discriminators): `card`, `mined-item`, `source`, plus future Phase 1 additions. Declared here so phases stop inventing ad-hoc kinds; enforce in Zod schemas, not SQL, for now.

## Non-goals

- **No normalized-schema rewrite** (`content_sources`/`mined_items`/`cards` tables). The generic `study_data` path works and is exercised end-to-end. Revisit triggers: (a) any query needing joins across item/card/source that JSON payloads make O(n)-slow, (b) Phase 2 bulk-review write volume, (c) Anki two-way sync (Phase 7) needing stable relational identity. Each is a *measured* trigger, not anticipation.
- **No UI**, no review scheduler changes, no second SRS implementation — `reviewFsrs()` stays the only engine.
- **No breaking protocol changes**: everything here is additive within major version 1; `versionsCompatible()` semantics untouched.

## Test plan

| Layer | Command | Scope added by this spec |
| --- | --- | --- |
| TS units | `pnpm --filter @language-llm/learning test` | `knownStatus.test.ts` (new), existing `clipCard`/`difficulty`/`learning` suites stay green |
| Protocol | `pnpm --filter @language-llm/protocol test` | round-trip + Zod-negative cases for `study.sync` clip fields; `wordstatus.*` factory/guard cases |
| Extension | `pnpm --filter @language-llm/extension test` | session mining attaches `difficulty` + `perWord` |
| Rust store | `cargo test -p local-store` | `list_study_with_clip_by_kind` round-trips clip columns; `put_word_status` upsert semantics |
| Rust workspace | `cargo test --workspace` | no regressions (baseline green on 2026-08-26) |
| Parity | `node scripts/check-protocol-parity.mjs` | passes unchanged unless typed Rust variants are opted into (then pairs updated) |
| Full gate | `pnpm verify:quick` | repo-standard verification |

Manual/integration spot-check (one-time, recorded in PR description): run desktop companion, connect extension harness, issue `study.sync put` with clips → `get` echoes clips; `wordstatus.put` ×3 → `histogram` counts correct.

## Definition of done

- [ ] `study.sync` get/list echo clip windows; message type + Zod schema cover them.
- [ ] `wordstatus.put/list/histogram` reachable over WS with auth gating and typed results.
- [ ] `deriveLearningStatus` is the sole status derivation point; boundary + lapse tests pass; exported from `@language-llm/learning`.
- [ ] Mining path persists `difficulty` and `perWord` on card payloads.
- [ ] All suites in the Test plan green; `git grep` finds no second implementation of status derivation.
- [ ] Still no UI — Phase 0 remains invisible to the user, which is correct, not a stub.

## Implementation order

1. P0-3 (pure module + tests; unblocks Phase 2 design immediately).
2. P0-1 (protocol types → schemas → handler/store swap; smallest blast radius first).
3. P0-2 (new handler mirrors proven patterns from P0-1).
4. P0-4 (extension-side wiring; depends on nothing else in this list).
5. P0-5 requires no code — carried into Phase 2 planning as a precondition.

Steps 1–4 are independently shippable; none blocks another.
