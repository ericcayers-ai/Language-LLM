# Phase 9 — AI Roleplay & Shadowing

Date: 2026-08-14 (revised — added `LLM-PersonaFinetuner` reuse)
Roadmap: [2026-08-14-ecosystem-roadmap.md](../../research/2026-08-14-ecosystem-roadmap.md)
Depends on: [Phase 0](2026-08-14-phase0-data-model-design.md), [Phase 2](2026-08-14-phase2-review-ui-design.md) (known-word set)

## Purpose

Shadowing (play a mined sentence's audio, record the user's attempt, score pronunciation) and a roleplay conversation partner built from the user's actual known-word set.

## Revision note

The original version of this spec deliberately left scoring/generation approach undecided, reasoning that no local ASR/TTS/LLM-chat infrastructure existed yet to build on. That's no longer true: the sibling repo `LLM-PersonaFinetuner` (`C:\Users\ericc\OneDrive\Desktop\Programs\misc\LLM-PersonaFinetuner`) already has a working, local-first voice-cloning pipeline and a persona-chat inference engine that cover most of what this phase needs. This revision reuses that instead of re-deriving it, per the ecosystem's own "reuse before build" rule — it does not fully eliminate the "needs its own dedicated spec" caveat (there are still real product decisions below), but it replaces several previously-open infrastructure questions with concrete answers.

## Reuse

- **Voice sidecar** (introduced in Phase 1, `LLM-PersonaFinetuner`'s `app/core/voice/`): full multi-backend TTS with zero-shot voice cloning (`f5tts`, `xtts`, `chatterbox`, `pocket`, and others — see `app/core/voice/backends.py`), plus a **live adaptive voice session** (`VoiceSession`/`VoiceSessionManager` in `service.py`) that accumulates streamed reference audio and locks in a cloned-voice reference after a configurable duration. This is a materially better starting point than building shadowing playback from scratch — Phase 9 can optionally let the roleplay partner speak in a cloned voice (e.g. a voice actor's clip, or the user's own past recordings played back as a "target" for shadowing) rather than only a generic TTS voice.
- **Reference transcription**: the sidecar already calls `faster-whisper` (`service.py::transcribe_reference`) to produce `ref_text` for backends that need it. The same integration point is reused for shadowing's ASR side — scoring a user's spoken attempt is a transcribe-and-compare operation, and this app already has a local ASR path (`asr_router.rs`) plus now this whisper integration as a second option; Phase 9's own spec picks one rather than this document prescribing it, since the tradeoff (existing `asr_router.rs` vs. whisper-via-sidecar) depends on which is already loaded/warm in the target deployment.
- **Persona chat inference** (`app/core/inference.py::InferenceEngine`): loads a base model + LoRA adapter with Unsloth, applies a system-prompt-driven chat template, generates responses, and supports a `compare_base` mode (base vs. fine-tuned side by side). For roleplay, the "persona" is the conversation partner — the same `system_prompt`-driven approach in `InferenceEngine.generate()` is the mechanism for constraining generation to known vocabulary (the system prompt is built from Phase 2's known-lemma query, not free-generated then filtered), reused as-is rather than inventing a second prompt-constraint mechanism.
- **LoRA persona training** (`app/core/trainer.py`, `app/core/dataset_builder.py`, `app/core/synthetic_qa.py`): if a *fixed-personality* conversation partner is wanted (as opposed to a purely system-prompt-defined one), this repo's existing Source → Train → Test wizard (chat-export parsing, synthetic Q&A generation, Unsloth LoRA/QLoRA fine-tuning with SSE progress) is the path — not a new fine-tuning pipeline. This is optional for Phase 9's MVP (a good system prompt over a capable base model may be enough) and is called out as a later-enhancement option, not a blocking dependency.
- `known-status.ts` (Phase 0) and the `cards`/`review_history` tables (Phase 2) as the source of the user's known-word set feeding the roleplay system prompt.

## Cross-repo integration approach

Same pattern as Phase 1's voice sidecar: `LLM-PersonaFinetuner`'s FastAPI service (`app/api/inference.py`, `app/api/voice.py`) runs as a local sidecar process rather than being ported into this app's Rust/TS stack. Phase 9 adds:
- A `chat` sidecar call (`POST /api/inference/chat`-equivalent) for roleplay turns, invoked from the WS server the same way the voice sidecar is invoked from Phase 1.
- Reuse of the *same* voice sidecar process from Phase 1/4/8 for shadowing playback and (optionally) cloned-voice roleplay speech — one sidecar, not two, since it's the same underlying service.
- GPU requirement inherited from `InferenceEngine` (`torch.cuda.is_available()` check, 6+ GB VRAM for a 3B base model per the sidecar repo's own README) — this is a real constraint this app did not previously have for any other phase (all prior phases target CPU-feasible local inference). Phase 9's dedicated spec must decide how the app degrades on CPU-only machines: skip roleplay generation entirely, or fall back to a smaller/quantized inference path. That decision is explicitly left open here rather than assumed, since it changes minimum system requirements for anyone who wants this feature.

## Components (scoped, still not fully designed)

- **Shadowing mode**: plays a mined sentence's stored `audio_ref` (captured or TTS-synthesized per Phase 1/4/8) or a freshly-cloned reference via the voice sidecar, records the user's spoken attempt (reuses the existing audio capture path from Phase 1), transcribes it (ASR path — see Reuse above) and scores against the target transcript. The exact scoring algorithm (phoneme-alignment distance vs. a simpler transcript-match heuristic) is still an open question for the dedicated spec — reusing the sidecar's whisper integration answers "how do we get a transcript," not "how do we score pronunciation accuracy from it," which is a separate, harder problem this document does not resolve.
- **Roleplay conversation partner**: given the user's known-lemma set (Phase 3's `known_word_count()`-style query, reused as a lemma list rather than a count), builds a system prompt constraining the partner to that vocabulary (plus a small, flagged allowance of new words per turn, mirroring how graded readers introduce vocabulary) and sends it to the persona-chat sidecar's `generate()`. Turn-based, text first; voice output (via the TTS sidecar, same as shadowing playback) is a straightforward layer on top once text roleplay works, not a separate generation problem.
- **Optional: a purpose-built "conversation partner" persona**, LoRA-fine-tuned via the sidecar's existing training wizard on curated target-language dialogue data, if a generic base-model-plus-system-prompt partner turns out to sound too generic/robotic in testing. Deferred until after an MVP validates whether that's actually needed.

## Explicitly not decided here

- Pronunciation-scoring algorithm and its accuracy targets.
- Real-time latency targets for shadowing feedback and roleplay turn generation (GPU inference adds a new latency source this app hasn't had to budget for before).
- CPU-only degradation strategy (skip vs. smaller model).
- Whether the MVP roleplay partner is system-prompt-only or needs the LoRA fine-tuning path.
- Cloned-voice consent/privacy handling if a user points shadowing/roleplay at a voice-cloning reference clip of a real person other than themselves — this needs an explicit product decision (e.g. restrict cloning targets to the user's own recorded voice, or content the user has rights to) before the voice-cloning backends are exposed in this app's UI, since `LLM-PersonaFinetuner`'s backends are general-purpose voice cloners with no such restriction built in.

## Definition of done for *this* scoping document

This phase's reuse surface, cross-repo integration shape, and dependencies (including the new GPU requirement) are identified so Phases 0–3 don't need to be revisited when Phase 9 is designed for real, and so the dedicated Phase 9 spec starts from "here's what already exists to build on" instead of from scratch. The open product/algorithm/privacy decisions above still require a dedicated brainstorming session once Phases 0–3 have shipped and real known-word data exists to validate scenario generation against.
