# Model and Data License Matrix

**Status:** Phase 0 freeze  
**Date:** 2026-07-16  
**Location:** `docs/licenses/model-matrix.md` (governance record)

This matrix records license class, commercial redistribution posture, ship status, attribution needs, and language-scope notes for models and dictionary sources. CI must **reject a release** if a bundled artifact lacks approved license metadata, or if a non-commercial pack enters the **default** distribution.

> License texts and upstream terms are authoritative. Rows below capture the product’s Phase 0 **governance posture** derived from published model/data statements as of roadmap freeze. Re-verify against the exact revision pinned in `models/catalog.json` before any GA cut.

## Default and optional commercial-path models

| Model | License (upstream class) | Commercial redistributable? | Default / optional / research | Attribution notes | Language-scope notes |
| --- | --- | --- | --- | --- | --- |
| **Whisper** (`large-v3-turbo`, `large-v3`, smaller) via whisper.cpp | MIT (OpenAI Whisper weights/code lineage; whisper.cpp MIT) | **Yes** (MIT) | **Default** baseline ASR | Retain MIT copyright notices in docs/about and binary attributions | Broad multilingual ASR; smaller variants for Lite/CPU |
| **Hy-MT2** (1.8B / 7B / 30B-A3B) | Tencent Hunyuan MT-2 published terms (treat as commercial-safe specialized MT per product policy; pin exact SPDX/Terms URL in catalog) | **Yes** for default packs under accepted Hunyuan redistribution terms | **Default** specialized MT (size by hardware profile) | Follow Hunyuan model-card attribution & notice requirements | ~**38 languages** commercial-safe specialized MT |
| **MADLAD-400** (3B / 7B / 10B) | Apache-2.0 (Google MADLAD-400 MT) | **Yes** | **Optional** broad fallback (may be default only where Hy-MT2 coverage is missing **and** Apache-2.0 terms accepted) | Apache-2.0 NOTICE / copyright | Broad inventory named; **mark untested pairs Experimental** until benchmarked |
| **Qwen3.5** (4B; 9B+ on capable HW) | Qwen license / Apache variants per revision—**pin revision** in catalog | **Conditional** — allow in defaults only when pinned revision is commercially redistributable | **Optional** reviewer/VLM (4B ambiguity-only on Balanced) | Qwen attribution + license text in About | Multilingual context review + selective VLM; not unconstrained rewriter |
| **Qwen3-ASR** (1.7B / 0.6B) | Qwen ASR published terms—**pin revision** | **Conditional** — same rule: defaults only if commercially redistributable | **Optional** multilingual ASR candidate (earn default per HW class) | Attribution per Qwen card | ~30 languages + **22 Chinese dialects**; OS accel uneven |
| **Parakeet-TDT 0.6B v3** | NVIDIA open-model / NGC terms for Parakeet—**pin** | **Conditional** on NVIDIA open-model redistribution terms accepted | **Optional** European throughput pack | NVIDIA model-card attribution | **25 European languages** — **not** the 1.1B English-only model |
| **Canary 1B v2** | NVIDIA Canary terms—**pin** | **Conditional** on NVIDIA terms | **Optional** CUDA/NeMo EU ASR/AST pack | NVIDIA attribution | ASR **25 EU langs**; English↔24 speech translation; punctuation/timestamps |
| **Canary-Qwen 2.5B** | NVIDIA / Qwen composite terms—**pin** | **Conditional** | **Optional** English specialist | Combined attribution | **English-only** — never multilingual default |
| **FireRedASR2S** | FireRed team published license—**pin** | **Conditional** — ship optional only when terms permit product redistribution | **Optional** Chinese specialist | Upstream attribution | Mandarin + **20+ dialects/accents**, code-switch, VAD, timestamps, confidence |
| **Moonshine** | Useful Sensors / Moonshine published license—**pin** | **Conditional** | **Optional** edge/live fallback | Upstream attribution | Validate **per-language pack**; do not assume English quality transfers |
| **Gemma 4** (E2B / E4B / 12B) | Google Gemma Terms of Use | **Restricted** — redistribution gated by Gemma ToU; not automatic commons | **Optional** multimodal alternative | Display Gemma ToU acceptance before download | Subject to pair-level eval + license acceptance |

### English-only specialists (catalog clarity)

| Model | Commercial redistributable? | Status | Notes |
| --- | --- | --- | --- |
| **Parakeet-TDT 1.1B** | Conditional (NVIDIA terms) | Optional English specialist | **English-only** — do not market as EU multilingual |
| **Canary-Qwen 2.5B** | Conditional | Optional English specialist | **English-only** |
| Granite Speech 3.3 8B | Conditional (IBM Granite terms) | Optional | Primarily English ASR; limited AST |

### Explicitly excluded from production chooser

| Item | Status | Notes |
| --- | --- | --- |
| **Whale** | Research mention only | **No official deployable weights** — must not appear as an installable pack |

---

## Opt-in research / non-commercial packs

These **must not** ship in default or commercial core distributions. Catalog may list them only behind an explicit license screen as personal/research packs.

| Model | License (class) | Commercial redistributable? | Default / optional / research | Attribution notes | Language-scope notes |
| --- | --- | --- | --- | --- | --- |
| **Tower+** | Non-commercial / research-restrictive (Unbabel Tower lineage—confirm exact revision) | **No** for commercial product redistribution | **Research** opt-in only | Full license text + non-commercial warning before download | Strong MT research pack; isolated from core |
| **NLLB-200** | CC-BY-NC 4.0 (Meta NLLB weights) | **No** (NC) | **Research** opt-in only | CC-BY-NC attribution; no commercial default | Very broad language coverage research path |
| **SeamlessM4T** | Meta Seamless license (non-commercial restrictions) | **No** for commercial defaults | **Research** opt-in only | Meta attribution + restriction banner | Speech/text multimodal research |
| **XCOMET** | Non-commercial research terms (Unbabel XCOMET) | **No** | **Research** opt-in only | Attribution + NC banner | Quality estimation research—not a default gate alone |

---

## Dictionary and lexical data sources

| Resource | License (class) | Commercial redistributable? | Status | Attribution requirements | Notes |
| --- | --- | --- | --- | --- | --- |
| **Kaikki / Wiktextract / Wiktionary extracts** | CC BY-SA (Wiktionary content) + tooling licenses | Share-alike applies to adapted Wiktionary content | Default broad lexicon adapter | **Must** display/export BY-SA attribution and share-alike notices | Broad multilingual coverage; not a substitute for specialist JP/ZH DBs |
| **JMdict / JMnedict** | EDRDG / creative-commons style terms (see EDRDG licence) | Allowed under EDRDG attribution rules | Default Japanese adapter | **Required** EDRDG / JMdict attribution in UI About and exports | Japanese lemmas, readings, sense inventory |
| **KANJIDIC2** | EDRDG licence | Same | Default Japanese kanji details | EDRDG attribution | Kanji metadata for JP kit |
| **CC-CEDICT** | CC BY-SA 4.0 | Share-alike for adaptations | Default Chinese adapter | **Required** CC BY-SA attribution + share-alike | Chinese–English dictionary for ZH kit |
| Open Multilingual WordNet / UniMorph | Per-constituent licenses | **Only where each constituent license is compatible** | Optional | Attribute each constituent | Do not mix incompatible copies into one redistributable blob |
| User-imported Yomitan / StarDict / EPWING | User’s responsibility | N/A (user media) | Optional import | Preserve embedded license metadata when present | Never upload imports; keep local |

Dictionary data lives in the **companion database**, not Chrome sync storage. Show and export attribution/share-alike metadata with mined cards and dictionary views.

---

## Process rules

1. Pin **upstream revision + content hash** for every shipped pack in the signed catalog.
2. Default distribution ⊆ commercially redistributable rows + dictionary sources with fulfilled attribution.
3. Isolating research packs is mandatory: separate install path, explicit license modal, no silent upgrade into defaults.
4. Re-audit this matrix when adding Qwen/NVIDIA/Gemma revisions—license classes can differ by checkpoint.

## Related documents

- [ATTRIBUTIONS.md](./ATTRIBUTIONS.md) — user-facing notice text
- [ADR-002: Model Routing](../architecture/ADR-002-model-routing.md)
- [Threat model](../architecture/threat-model.md)
- [Architecture index](../architecture/README.md)
- [STATUS.md](../../STATUS.md) — which packs are weights-required vs mocked
