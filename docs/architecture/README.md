# Architecture Documentation Index

Phase 0+ product, legal, and technical specification for **Language-LLM**: a privacy-first Chrome extension (MV3 / WXT) plus signed local companion (Tauri 2 / Rust) for caption-first video language tools, **in-place website translation**, **store-safe song lyrics**, dictionaries, and language study.

## Decision records

| Document | Summary |
| --- | --- |
| [ADR-001 — Runtime Boundaries](./ADR-001-runtime-boundaries.md) | Extension vs companion; caption-first → tabCapture → owned-media. **Accepted.** |
| [ADR-002 — Model Routing](./ADR-002-model-routing.md) | Hardware profiles; correct ASR/MT facts; research packs opt-in. **Accepted.** |
| [ADR-003 — Website translate](./ADR-003-website-translate.md) | Local MT in-place DOM translation; Original/Translated/Dual; minimal permissions. **Accepted.** |
| [ADR-004 — Song lyrics](./ADR-004-song-lyrics.md) | Captions → LRCLIB → import → ASR; no proprietary scrapers. **Accepted.** |

## Core contracts

| Document | Summary |
| --- | --- |
| [Threat model](./threat-model.md) | Assets, trust boundaries, mitigations, STRIDE. |
| [Language tiers](./language-tiers.md) | Verified / Supported / Experimental / Unavailable. |
| [Fidelity contract](./fidelity-contract.md) | Non-isomorphic translation preservation rules. |
| [Source policy](./source-policy.md) | No YouTube download; store-safe lyrics; page-translate privacy. |

## Licensing

| Document | Summary |
| --- | --- |
| [Model & data license matrix](../licenses/model-matrix.md) | Defaults, optionals, research opt-in, dictionaries. |
