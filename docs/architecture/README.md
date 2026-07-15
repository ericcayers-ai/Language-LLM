# Architecture Documentation Index

Phase 0+ product, legal, and technical specification for **Language-LLM**: a privacy-first Chrome extension (MV3 / WXT) plus a local companion (Tauri 2 / Rust) for caption-first video language tools, **in-place website translation**, **store-safe song lyrics**, dictionaries, and language study.

## Reading this folder honestly

Architecture ADRs describe **intended contracts**. Implementation maturity is tracked in [`STATUS.md`](../../STATUS.md) using:

| Label | Meaning |
| --- | --- |
| Implemented | Code + automated coverage / intentional wiring |
| Development fallback | Labeled OfflineMock / constrained stubs when weights or pins are absent |
| Weights-required | Needs verified local model files + CLIs |
| Manually verified | Real-browser / OS gate recorded (many still empty) |
| Deferred | Store signing, notarization secrets, CWS, long-horizon QA |

Notable gaps between ADR aspiration and today:

- **Companion “signed” binaries / signed catalog** — threat model and ADRs assume signed artifacts; updater pubkey is still a placeholder and Ed25519 catalog verify is ops-deferred (see STATUS).
- **FSRS** — `packages/learning` implements FSRS-5 against reference weights with unit tests; do not oversell as independent spaced-repetition certification.
- **Tauri window** — real manager UI exists; headless `--serve` remains the CI/smoke path.

Default git branch: **`main`**.

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

## Related product docs

| Document | Summary |
| --- | --- |
| [Privacy & data](../privacy.md) | Retention, wipe scopes, uninstall |
| [Troubleshooting](../troubleshooting.md) | Extension/native-host IDs, companion, a11y |
| [Enterprise Chrome](../enterprise-chrome.md) | Force-install / managed deployment |
| [Model & data license matrix](../licenses/model-matrix.md) | Defaults, optionals, research opt-in, dictionaries |
| [Attributions](../licenses/ATTRIBUTIONS.md) | User-facing notice text |

## Companion runtime shapes (implementation)

| Mode | Entry | Role |
| --- | --- | --- |
| Headless serve | `language-llm-desktop --serve` | Loopback WS + SQLite + jobs (CI / no GUI) |
| Native messaging | `--native-messaging` / `LANGUAGE_LLM_NATIVE=1` | Bootstrap port+token for Chrome |
| Manager GUI | Tauri `gui` feature | Models, privacy, jobs, diagnostics, updates UI |

Extension ↔ companion streaming uses authenticated **loopback WebSocket**, not native-messaging payloads (1 MB cap on native messaging).
