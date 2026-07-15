# Implementation status

Living checklist for the greenfield monorepo. Updated 2026-07-16.

## Roadmap completion

Honest cut of the plan vs in-repo product surfaces (without GPU weights / store signing / multi-month native QA).

### Fully shipped (in-repo, weights optional / mocked)

| Area | Notes |
| --- | --- |
| Phase 0 docs (ADRs, threat model, licenses, tiers, fidelity, source policy) | Done |
| ADR-003 website translate + ADR-004 lyrics | Done |
| Monorepo scaffold (pnpm + Cargo, protocol, UI tokens) | Done |
| Caption-first YouTube path (router, fixtures, SPA, overlay, MAIN bridge parsers) | Done |
| Local companion (WS auth, jobs, native messaging install scripts) | Done |
| Capture cancel/resume + PCM ingest wiring (stub ASR until whisper CLI+weights) | Done |
| MT fidelity + page-translate DOM path (mock MT; SPA MutationObserver) | Done |
| Lyrics LRC/TTML / LRCLIB opt-in / karaoke helpers | Done |
| Model catalog + whisper/llama spawn builders + specialist “not installed” | Done |
| SQLite local-store (transcripts, translations, lyrics, page-translate, study) | Done |
| Dictionary adapters (JMdict / CC-CEDICT / Kaikki) + **fixture import + popup import/lookup** | Done |
| Learning suite **library + UI**: FSRS review in popup, Alt+M mine, known-word mark, CSV export | Done |
| Overlay **keyboard/ARIA** (Alt+S/T/R/M/K, focus ring, live region, evidence gutter) | Done |
| Context/VLM **gate** with mocked vision evidence on deixis spans | Done (real VLM needs weights) |
| Page-translate **host permission** grant/revoke status in popup | Done |
| Combined verify: `pnpm verify` (pnpm tests + cargo workspace) | Done |

### Runtime needs weights / OS integration

| Area | Leaf TODO |
| --- | --- |
| whisper.cpp / llama.cpp **GPU inference** with real weights | Drop GGUF under `models/weights/<id>/` + CLI under `models/bin/`; see `models/README.md` |
| Specialist ASR workers (ONNX / NeMo) | Router payloads ready; OS-specific worker processes still thin |
| Qwen3.5 / Gemma **real VLM** multimodal adapter | Gate + mock evidence shipped; swap stub for llama.cpp multimodal |
| Live YouTube timedtext on real watch pages | Bridge extracts player URLs; needs page session cookies / player response present |
| tabCapture MediaStream → PCM | Offscreen path wired; Chrome needs real gesture + `getMediaStreamId` success |
| Tauri window UI shell | Binary serves WS/native host; full settings UI still thin |
| SQLite encryption at rest | Schema ready; optional SQLCipher later |

### Deferred (humans / store / multi-month QA)

| Area | Why deferred |
| --- | --- |
| Chrome Web Store package, signing, notarization | Release hardening (plan Phase 10) |
| Pair-level **Verified** language human MQM | Broad-language QA (plan Phase 9) — native reviewers + months |
| External a11y audit (NVDA/VoiceOver/axe on full surfaces) | Manual + beta (keyboard baseline is in-repo) |
| Signed model-catalog Ed25519 + auto-update pipeline | Ops/release |
| Full AnkiConnect live handshake | Shapes + CSV ready; opt-in network to Anki is user-local |

**Verdict:** Beyond weights/hardware, store signing, and multi-month language QA, there is **no large must-have product hole** left in the roadmap’s Core → Learning → Advanced(mock) rings. Remaining polish is packaging and real inference—not missing library stubs that break the offline product promise.

## Fully working in-repo (no GPU weights required)

| Area | Status |
| --- | --- |
| Phase 0 docs (ADRs, threat model, licenses, tiers, fidelity, source policy) | Done |
| ADR-003 website translate + ADR-004 lyrics | Done |
| pnpm + Cargo monorepo scaffold | Done |
| `@language-llm/protocol` TS + Rust (incl. page/lyrics messages) | Done |
| `@language-llm/ui` tokens + primitives | Done |
| `@language-llm/language-kits` lexicon adapters + graphemes + fixture import | Done + tests |
| `@language-llm/page-translate` segmenter, restore, cache keys, modes | Done + tests |
| `@language-llm/lyrics` LRC/TTML, detect, LRCLIB contract, karaoke | Done + tests |
| `@language-llm/mt-core` Hy-MT2/MADLAD router + fidelity checks | Done + tests |
| `@language-llm/learning` FSRS, known words, CSV/AnkiConnect shapes | Done + tests |
| Extension learning session (mine / review / export) + popup FSRS UI | Done + tests |
| Extension caption router, SPA, overlay (a11y shortcuts), fixtures, popup, offscreen | Done |
| Caption → timeline → mock MT → VLM gate (mock) → overlay smoke | Done |
| Page-translate content script + permission grant/revoke UX | Done |
| Lyrics resolve priority (no proprietary scrapers) | Done |
| Lyrics: LRCLIB via companion when user enables network toggle; LRC/TTML import | Done |
| VLM gate + constrained mock schema + evidence gutter | Done |
| Rust crates: VAD/resample, capture job cancel/resume + PCM ingest, model SHA-256 verify | Done + unit tests |
| SQLite local-store migrations (transcripts, translations, lyrics, page-translate, study) | Done + tests |
| Companion loopback WebSocket + auth handshake + job/audio/lyrics handlers | Done |
| Native messaging bootstrap + OS install scripts | Done |
| Extension background ↔ companion bootstrap (native + WS session) | Done |
| whisper.cpp / llama.cpp spawn + GGUF discovery + command builders | Done (mock when absent) |
| Specialist ASR catalog router | Done (`ModelNotInstalled` when absent) |
| YouTube MAIN-world caption URL bridge + json3/srv3/VTT parsers | Done |
| Model manager: catalog install hooks, SHA-256 verify, offline mock | Done |
| Benchmarks harness + suites | Present |
| `models/catalog.json` | Present |
| CI workflow + `pnpm verify` | Present |

## Product gates encoded in tests

- Caption videos do not auto-start capture (`wouldAutoStartCapture` is always false; router prefers captions)
- Lyrics priority excludes proprietary scrapers
- Page-translate mock preserves numbers/URLs (fidelity)
- Protocol major-version handshake compatibility
- Companion WS handshake + mock translate (`apps/desktop/src-tauri/tests/ws_smoke.rs`)
- Capture job cancel/resume + SHA-256 model install verify (crate tests)
- Specialist ASR returns `ModelNotInstalled` when weights absent (not silent mock)
- Fake whisper/llama CLI integration (`inference-router` backends tests)
- Caption fixture matrix: human / auto / none / empty body parsers
- Dictionary fixture parsers (JMdict XML/text, CC-CEDICT, Kaikki JSONL)
- Overlay shortcut map (Alt chords; no steal when unfocused)
- Study session mine → FSRS review → CSV
- VLM gate: lite skips; balanced deixis returns mock evidence
