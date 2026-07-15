# Language Quality Tiers

**Status:** Phase 0 freeze  
**Date:** 2026-07-16

## Purpose

Broad launch coverage means **capability tiers**, not equal quality. Every source→target pair for the selected local model revision and hardware profile receives a published status. Marketing and UI copy must never imply that Experimental pairs are Verified.

## Rubric

| Tier | Meaning | User-facing expectation |
| --- | --- | --- |
| **Verified** | Passes automated regression **and** blinded human MQM above the pair-specific threshold; subtitle readability gates green on the release-critical suite; materially beats the selected baseline | Suitable to recommend as a primary pair for that model/hardware |
| **Supported** | Deterministic fidelity checks pass; automated MT/ASR metrics within acceptable bands; limited or no full native MQM yet; known limitations listed | Usable daily; user should expect occasional register/idiom issues |
| **Experimental** | Catalog-installed and runnable, but coverage is thin, benchmarks incomplete, or MADLAD/weak-pair inventory without pair validation | Available with warnings; do not upsell |
| **Unavailable** | Model/hardware/license/script support missing, or quality below Experimental floor | Hidden from primary pickers or shown as explicitly unavailable with reason |

Tiers are **per (source, target, model-revision, hardware-profile)**. Changing ASR or MT packs can change the label.

## Promotion criteria

A pair may move **Experimental → Supported** when all of the following hold for the pinned revisions:

1. **Benchmarks:** Reproducible scores in `benchmarks/model-evals/` for ASR (WER/CER as applicable) and MT (chrF++ primary; sacreBLEU regression-only) on the language’s evaluation slice; latency/memory recorded for Lite and Balanced where claimed.
2. **Deterministic fidelity:** Zero silent drops of numbers, names, negations, and URLs on the critical curated suite ([fidelity-contract.md](./fidelity-contract.md)).
3. **Subtitle readability:** Language-specific CPS/line-length, duration, and resegmentation rules pass on the subtitle suite (Netflix/W3C guidance as input, not a universal rule).

A pair may move **Supported → Verified** when additionally:

4. **Human MQM:** Blinded native-speaker MQM meets the **pair-specific** threshold; critical translation errors are zero on the release-critical suite.
5. **Context suite sample:** Pronouns/honorifics/profanity/idioms (and language-specific must-haves such as JP honorifics or ZH code-switch) reviewed without systematic failure.
6. **Beats baseline:** Materially outperforms the frozen baseline pack for that pair on the same corpus/hardware fingerprint.

Demotion is mandatory if a new model revision regresses below the threshold or if license class changes to forbid shipping.

## Initial target matrix discussion (JP / ZH / KO / ES / FR / DE / EN)

Phase 0 prioritizes honest labeling for the following **product-interesting** pairs—not a claim that all are Verified at freeze.

### Directionality to evaluate early

| Source → Target | Strategic notes | Likely early tier posture |
| --- | --- | --- |
| **JA → EN**, **EN → JA** | High immersion learner demand; JP kit (JMdict/KANJIDIC), honorifics/register in fidelity contract | Aim Supported early with Whisper/Hy-MT2; Verified after JP MQM |
| **ZH → EN**, **EN → ZH** | Dialect/code-switch; FireRedASR2S + Qwen3-ASR candidates; CC-CEDICT | Aim Supported with specialist ASR when available; auto-captions vs ASR paths labeled separately |
| **KO → EN**, **EN → KO** | Morphology/spacing-aware lookup; honorifics | Supported after glossary + subtitle rules; Verified with KO MQM |
| **ES ↔ EN**, **FR ↔ EN**, **DE ↔ EN** | Strong EU pack candidates (Parakeet 0.6B v3 / Canary 1B v2 optional) | Often early Supported candidates on Whisper + Hy-MT2; EU packs for throughput/quality uplift |
| **ES ↔ FR**, **FR ↔ DE**, **DE ↔ ES**, etc. | Non-English pivots; may rely more on MADLAD or multi-hop review | Start Experimental until direct-pair eval exists |
| **JA ↔ ZH**, **JA ↔ KO**, **ZH ↔ KO** | High structural/register risk | Experimental until dedicated MQM; never imply EN-pivot quality equals direct |
| Same-language display (**EN → EN**, etc.) | Identity / cleanup only | Separate mode—do not fake “translation Verified” |

### ASR vs caption provenance

UI tiers for translation assume a stated **source mode**:

- Human caption track
- Auto-generated caption track
- Local ASR (model revision)

A Verified JA→EN pair on human captions is **not** automatically Verified on noisy live ASR.

## How the UI must display labels honestly

1. **Always show the tier** beside the language pair and active model names (context ribbon / settings / pair picker).
2. **Never restyle Experimental as Verified** (no green “ready” chrome for Experimental).
3. On first use of an Experimental or Supported pair, show a short limitation blurb (known failure modes from the catalog).
4. Full-video and live modes must display the **same** pair tier unless a mode-specific demotion exists (e.g. live Experimental when only full-pass is Supported).
5. Marketing copy, store listing, and in-app screenshots must use the same vocabulary: Verified / Supported / Experimental / Unavailable.
6. “Broad language support” language in the store listing must disclaim that coverage is tiered, not uniform.

## Related documents

- [ADR-002: Model Routing](./ADR-002-model-routing.md)
- [Fidelity contract](./fidelity-contract.md)
- [Model / data license matrix](../licenses/model-matrix.md)
