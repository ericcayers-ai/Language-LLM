# Phase 9 — AI Roleplay & Shadowing

Date: 2026-08-14
Roadmap: [2026-08-14-ecosystem-roadmap.md](../../research/2026-08-14-ecosystem-roadmap.md)
Depends on: [Phase 2](2026-08-14-phase2-review-ui-design.md) (known-word set), local ASR

## Status

This is the roadmap's own flagged highest-effort, most-novel phase (real-time speech scoring). Per the roadmap (line 127), it needs its own dedicated spec with explicit accuracy/latency acceptance criteria decided *with the user* before implementation — a generic design here would be exactly the kind of unexamined-assumption placeholder the brainstorming process exists to prevent. This document scopes the phase and reuse surface; it deliberately stops short of committing to specific scoring thresholds or latency budgets, which require a dedicated brainstorming session once Phases 0–3 have shipped and the known-word data this phase depends on actually exists.

## Purpose

Shadowing (play mined sentence audio, record user attempt, score pronunciation) and a roleplay conversation partner built from the user's actual known-word set.

## Reuse

- Local ASR (`asr_router.rs`) — pronunciation grading needs speech-input scoring; this phase extends the router with a scoring mode rather than a separate ASR integration.
- MT/dictionary infra for scenario/dialogue generation.
- `known-status.ts` (Phase 0) and the `cards`/`review_history` tables (Phase 2) as the source of the user's known-word set — roleplay scenarios are constrained-generated from this set (matching HayaiLearn's approach cited in the roadmap), not free-generated then filtered.

## Components (scoped, not fully designed)

- **Shadowing mode**: plays a mined sentence's stored `audio_ref` (Phase 0/1), records the user's spoken attempt (reuses the existing audio capture path from Phase 1), runs both through `asr_router.rs` to get a transcript + confidence/alignment signal, and surfaces a score. The exact scoring algorithm (phoneme-alignment distance vs. a simpler transcript-match heuristic) and the pass/fail or graded-score presentation are open questions for that phase's dedicated brainstorm — different approaches trade accuracy for implementation cost and latency, and the right tradeoff depends on ASR model quality decisions this roadmap does not make.
- **Roleplay conversation partner**: given the user's known-lemma set (query already defined by Phase 3's `known_word_count()` reuse pattern), constrains an LLM prompt to only use known vocabulary (plus a small, flagged allowance of new words per turn, mirroring how graded readers introduce vocabulary) and holds a turn-based conversation. Requires deciding: which LLM/inference path (local vs. router), turn latency budget, and how "known vocabulary" constraint is enforced (post-hoc filter vs. constrained decoding) — again, deferred to the dedicated spec.

## Explicitly not decided here

- Real-time latency targets for shadowing feedback.
- Accuracy/scoring model choice for pronunciation grading.
- Which inference backend (existing `ModelManager`/`ModelPaths` in `crates/inference-router`) backs roleplay generation, and its cost/latency budget.

## Definition of done for *this* scoping document

This phase's reuse surface and dependencies are identified so Phases 0–3 don't need to be revisited when Phase 9 is designed for real. The actual Phase 9 design/spec/plan cycle happens as its own brainstorming session once the known-word data it depends on exists in production use — starting that cycle now, before Phase 2 has shipped and before real known-word data exists to validate scenario generation against, would produce acceptance criteria with nothing real to check them against.
