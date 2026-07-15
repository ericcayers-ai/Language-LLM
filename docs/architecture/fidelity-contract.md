# Fidelity Contract

**Status:** Phase 0 freeze  
**Date:** 2026-07-16

## Purpose

“Perfect, 1:1 accurate” translation cannot be guaranteed. Languages are structurally non-isomorphic; source audio and captions can be ambiguous. This document defines what **good translation** means for the Local YouTube Language Suite when literal isomorphism is impossible.

## What “good” means when 1:1 is impossible

Good translation **preserves decision-relevant meaning** under explicit constraints, surfaces uncertainty instead of inventing certainty, and keeps derivable layers (display style, readings, resegmentation) from silently rewriting the **canonical fidelity layer**.

The product therefore optimizes for:

1. Faithful transfer of propositional content and communicative intent.
2. Visibility of omissions, additions, and unresolved ambiguity.
3. Stable linkage between source cues and target cues for learning and QC.
4. User control of **display** style without mutating canonical committed text unless the user edits.

## Must preserve

| Concern | Requirement |
| --- | --- |
| **Meaning** | Core predicates, negation, modality, and question/statement force survive draft + review |
| **Omissions / additions visibility** | If the target drops or inserts content relative to the source span, mark it; never pretend the texts are length-matched peers |
| **Names** | Person/place/org mentions and glossary-locked terms remain consistent unless user edits |
| **Numbers** | Digits, quantities, dates, times, and units match or are explicitly converted with visible conversion |
| **Register** | Formality level and genre remain aligned (lecture ≠ banter) |
| **Honorifics** | JP/KO/etc. honorific and politeness meaning is preserved or explicitly glossed—not stripped for “natural English” |
| **Profanity** | Strength and presence preserved; softening only via user preference that remains a display transform or an explicit edit |
| **Uncertainty** | Low-confidence ASR/MT spans stay marked; alternatives inspectable |
| **Speaker intent** | Sarcasm markers, hedges, interruptions, laughter, songs, and non-speech cues retained as structured annotations where present |
| **Cue linkage** | Stable source cue IDs and token offsets; many-to-many alignment after target resegmentation |

Never infer sensitive identity attributes from voice or image.

## Deterministic checks (non-LLM)

Run after specialized-MT draft (and again after review) on every cue window:

- Missing or extra **numbers**, **names**, and **URLs**
- Missing or flipped **negation** / critical polarity
- **Units** consistency
- **Punctuation intent** (question vs statement) where marked in source
- **Cue count** / empty output detection
- **Script mismatch** (e.g. unexpected Latin-only output for a target that should be primarily Japanese script, unless transliteration mode is on)
- Timing / readability prerequisites handed to subtitle QC (duration, empty cues)
- Glossary constraint violations for locked terms

Failures block silent commit: the cue stays provisional or surfaces an error category for review.

## Draft → constrain → review (normative flow)

1. Group cues into discourse windows; retain stable cue IDs and token offsets.
2. Produce a specialized-MT draft with glossary constraints and a **strict structured schema**.
3. Run deterministic checks above.
4. LLM review against **source + draft**, returning only: corrected target text, aligned source spans, error category, confidence. Do **not** prompt “make it natural” without fidelity constraints.
5. On low confidence or genuine deixis/visual ambiguity, sample relevant local frame(s) only; VLM answers a **narrow** evidence question—it does not translate the whole scene.
6. After full-video pass, consistency-sweep terminology and entities via per-video translation memory.

## Provisional vs committed cues

| State | Behavior |
| --- | --- |
| **Provisional** | Shown quickly in buffered live mode; may revise silently **only while still provisional** when more context arrives |
| **Committed** | Once displayed as committed, later revisions require an **explicit correction marker**—no unnoticed historical rewrites |

Live buffered mode: translate rolling windows; revise only still-uncommitted cues when ambiguity resolves. Full-video mode: build terminology/entity/speaker context first; translate and QC the timeline before treating cues as committed for learning exports.

## Display modes (do not mutate canonical fidelity)

Users may choose:

- **Literal** — closer calque / gloss-friendly
- **Balanced** — default readability under fidelity constraints
- **Idiomatic** — freer phrasing for viewing comfort

These are **presentation transforms** (or alternate derived layers with provenance). The canonical fidelity layer—including uncertainty markers, glossary locks, and committed cue text—remains unchanged unless the user explicitly edits or retranslates a window.

## Uncertainty policy

- Expose source-to-target hover alignment and an “uncertain” indicator.
- Users may inspect alternatives, edit a cue, lock terminology, and retranslate the affected context window.
- **Never silently invent certainty:** no fake word-level timestamps when only segment timing exists; no fake MQM-green styling on Experimental pairs; no stripping hedges/confidence for aesthetics.

## Social and paralinguistic meaning

Preserve explicitly in structured fields where detected: honorifics, politeness, profanity, sarcasm markers, hedges, gender/number uncertainty, dialect, interruptions, stutters, laughter, songs, culturally specific terms. Prefer annotation + careful translation over deletion.

## Related documents

- [Language tiers](./language-tiers.md)
- [ADR-002: Model Routing](./ADR-002-model-routing.md)
- [Source policy](./source-policy.md)
