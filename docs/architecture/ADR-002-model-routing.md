# ADR-002: Model Routing

**Status:** Accepted  
**Date:** 2026-07-16  
**Deciders:** Product architecture (Phase 0 freeze)

## Context

No single ASR or MT model is best for every language, device, license constraint, and latency target. Routing by parameter count or vendor leaderboards alone is forbidden. The companion maintains a versioned, signed model catalog (`models/catalog.json`) and routes by detected language, task, hardware, latency target, timestamp quality, license, and measured local benchmark scores stored under `benchmarks/model-evals/`.

## Decision

### Hardware profiles

| Profile | Typical hardware | Default ASR posture | Default MT / review posture |
| --- | --- | --- | --- |
| **Lite** | CPU / 8 GB RAM | Small Whisper or Moonshine | Hy-MT2 1.8B quantized; **no** continuous VLM |
| **Balanced** | 16 GB RAM or 6–8 GB VRAM | Whisper `large-v3-turbo` or Qwen3-ASR 0.6B | Hy-MT2 7B quantized; Qwen3.5 4B loaded only on ambiguity |
| **Quality** | 32 GB RAM or 12–16 GB VRAM / unified memory | Qwen3-ASR 1.7B or Whisper `large-v3` | Hy-MT2 7B at higher precision; Qwen3.5 9B reviewer |
| **Workstation** | 24+ GB VRAM or 64+ GB unified memory | Specialist ASR packs as earned | Hy-MT2 30B-A3B and larger review options |

Scheduler rules:

- Run **ASR, MT, and VLM sequentially** unless measured free memory permits co-residency.
- Predict memory, reserve headroom, prevent thermal overload.
- Expose user policies: **Battery**, **Balanced**, and **Maximum Quality**.

---

## ASR router (accuracy-critical facts)

Route selection must treat the following as hard facts—not marketing synonyms.

### Cross-platform baseline (whisper.cpp)

| Model | Role |
| --- | --- |
| Whisper **`large-v3-turbo`** | Fast broad multilingual ASR baseline |
| Whisper **`large-v3`** | Maximum Whisper-family quality |
| Smaller Whisper variants | CPU-only / Lite systems |

All Whisper baselines run through **`whisper.cpp`**.

### Multilingual quality candidate (Qwen3-ASR)

| Model | Role |
| --- | --- |
| **Qwen3-ASR 1.7B** | Multilingual quality candidate (must earn default status per hardware class) |
| **Qwen3-ASR 0.6B** | Lower-memory multilingual option |

Supports ~30 languages plus **22 Chinese dialects**, with a companion forced aligner. Official and community acceleration differ by OS—do not assume Windows/macOS/Linux parity without benchmarks.

### European throughput (Parakeet — do not confuse variants)

| Model | Language scope | Product role |
| --- | --- | --- |
| **Parakeet-TDT 0.6B v3** | **25 European languages** | European throughput candidate |
| **Parakeet-TDT 1.1B** | **English-only** | English specialist only — **not** a multilingual EU default |

**Critical correction:** Do not route the older 1.1B weight as a European multilingual model. The newer **0.6B v3** is the 25-EU-language pack.

### European quality / speech translation (Canary)

| Model | Language scope | Product role |
| --- | --- | --- |
| **Canary 1B v2** | ASR for **25 European languages**; English↔24-language speech translation; punctuation; timestamps | Optional **CUDA/NeMo** pack — not a universal cross-platform default |
| **Canary-Qwen 2.5B** | **English-only** | English specialist — not a multilingual default |

### English specialists (not multilingual defaults)

| Model | Scope note |
| --- | --- |
| **Canary-Qwen 2.5B** | English-only |
| **Parakeet-TDT 1.1B** | English-only |
| Granite Speech 3.3 8B | Primarily English ASR with limited AST directions (optional candidate) |

### Chinese specialist

| Model | Role |
| --- | --- |
| **FireRedASR2S** | Mandarin, **20+ Chinese dialects/accents**, code-switching, VAD, punctuation, timestamps, confidence. Supersedes earlier FireRedASR family for this product. |

### Edge / live fallback

| Model | Role |
| --- | --- |
| **Moonshine** (current streaming builds) | Low-resource CPU/edge / live fallback. Validate **each language pack independently**—do not extrapolate from English results. |

### Research-only exclusions (no production chooser)

| Item | Why excluded from production routing |
| --- | --- |
| **Whale** | Paper/research interest only — **no official deployable weights** |
| SpeechBrain | Toolkit, not a single shippable ASR model |
| XLS-R / Wav2Vec 2.0 | Require task/language-specific fine-tuning |

Keep these in an experimental adapter SDK if needed; never expose them as default catalog choices.

---

## Translation and contextual review router

### Commercial-safe specialized MT — Hy-MT2

| Size | Hardware fit |
| --- | --- |
| Hy-MT2 **1.8B** | Lite |
| Hy-MT2 **7B** | Balanced / Quality |
| Hy-MT2 **30B-A3B** | Workstation only |

**~38 languages**, commercial-safe packing posture for defaults. Official GGUF releases favor a strong `llama.cpp` path.

### Broad fallback — MADLAD-400

| Sizes | Notes |
| --- | --- |
| MADLAD-400 **3B / 7B / 10B** | Very broad coverage. Model card language inventory is large (450+ named), but parallel MT train/eval cover fewer pairs. Mark weak/untested pairs **Experimental** until measured. |

### Contextual reviewer / VLM — Qwen3.5

| Size | Role |
| --- | --- |
| **Qwen3.5 4B** | Initial local multilingual / VLM reviewer (Balanced default for ambiguity-only load) |
| **Qwen3.5 9B+** | Quality / Workstation review |

Use the reviewer to **constrain and check** specialized MT drafts against source cues—not to freely rewrite for “naturalness” without the [fidelity contract](./fidelity-contract.md).

### Optional alternative

- **Gemma 4** E2B/E4B for low-memory multimodal analysis; 12B for quality hardware—subject to pair-level eval and license acceptance.

### Non-commercial / research opt-in only

These must **not** ship as commercial defaults. Catalog may expose them only as **opt-in personal/research packs** behind an explicit license acceptance screen:

- Tower+
- NLLB-200
- SeamlessM4T
- XCOMET

Core and default packs remain commercially redistributable. Full matrix: [docs/licenses/model-matrix.md](../licenses/model-matrix.md).

---

## Scheduling policy

1. Prefer sequential ASR → MT → (optional) VLM unless co-residency is proven safe for the active profile.
2. Never select a model by parameter count alone.
3. Every routing decision must be explainable: language, license class, hardware profile, latency policy, and benchmark revision.
4. Fallbacks are ordered and reversible; the UI shows the active pack and quality tier ([language-tiers.md](./language-tiers.md)).

## Consequences

- Quality claims are per-pair and per-hardware, not global.
- CUDA/NeMo packs (e.g. Canary 1B v2) remain optional islands, not required for Core release.
- English-only specialists and EU multilingual packs are kept strictly distinct to avoid silent quality cliffs.

## Related documents

- [ADR-001: Runtime Boundaries](./ADR-001-runtime-boundaries.md)
- [Language tiers](./language-tiers.md)
- [Model / data license matrix](../licenses/model-matrix.md)
- [Fidelity contract](./fidelity-contract.md)
