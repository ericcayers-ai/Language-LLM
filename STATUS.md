# Implementation status

Living checklist for the monorepo. Updated **2026-08-03** (native-messaging port fix, Netflix support, DX scripts).

**Default git branch:** **`main`**.

## Status taxonomy

| Label | Use when |
| --- | --- |
| **Implemented** | Shipped in-repo with automated coverage or intentional integration wiring |
| **Development fallback** | Explicit mock/stub when production prerequisites are missing |
| **Weights-required** | Needs local GGUF/ONNX + CLI + verified digest (`.installed`) |
| **Manually verified** | Human gate recorded on real Chrome / OS — **not** yet claimed for YT SPA or tabCapture |
| **Deferred** | External credentials, store access, notarization, or multi-month language/a11y QA |

## Blockers for release (external or manual)

These remain after software-side overhaul work. Do **not** close them by weakening tests.

| Blocker | Why it blocks GA claims | What “done” looks like |
| --- | --- | --- |
| Model weights + real digests | Catalog still carries `sha256:PENDING_*`; OfflineMock until filled | Pin digests in `models/catalog.json`, write `.installed`, run real ASR/MT smoke |
| Tauri updater / code signing / notarization | `pubkey` is `UNCONFIGURED_UPDATER_PUBLIC_KEY`; no private keys in-repo | CI secrets + configured pubkey + signed artifacts |
| Chrome Web Store access | Packaging prepared in-repo; submission not available here | CWS upload + review |
| Manual YouTube SPA / caption gates | Bridge + fixtures tested; live watch-page not recorded as manual pass | Record OS × Chrome results in this file |
| Manual tabCapture gesture gates | Offscreen path wired; real `getMediaStreamId` success not recorded | Same manual matrix |
| Extension ID pin for release | Unpacked IDs vary; WS Origin enforce needs pin | Set `LANGUAGE_LLM_EXTENSION_ID` or `data_dir/extension_id` |
| Signed model-catalog Ed25519 | Catalog is “signed-ready”; auto-verify pipeline not ops-live | Release signing ops |
| External a11y audit (NVDA / VoiceOver) | Keyboard baseline + component tests in-repo | Manual audit notes |
| Pair-level **Verified** language MQM | Tiers defined; broad human eval deferred | Native-speaker bench artifacts |

## Phase snapshots (recent)

### Phase 4 — Completion audit + v0.1.0 re-release gap pass

| Item | Label |
| --- | --- |
| Fresh gap audit vs plan / STATUS / threat model / CWS | **Implemented** (2026-07-17 re-release pass) |
| OfflineMock ASR labeled (`developmentFallback`; stub timelines omit `captionSource: asr-live`) | **Implemented** |
| Page-translate uses llama when verified weights installed; OfflineMock only when absent | **Implemented** |
| Unsupported `job.submit` kinds fail closed (no `{ ok: true, mock: true }`) | **Implemented** |
| Provisional MT / VLM status distinguishes OfflineMock vs [dev] companion-down vs stub VLM | **Implemented** |
| Playwright / e2e report dirs gitignored | **Implemented** |
| Default branch `main`; CI triggers only on `main` | **Implemented** |
| Package / extension versions aligned to `0.1.0` for release zip naming | **Implemented** |
| `release.yml` attaches normalized unsigned assets to a GitHub Release when `tag` is provided | **Implemented** (signing/CWS still **Deferred**) |

### Phase 3A — Quality gates

| Item | Label |
| --- | --- |
| Expanded `scripts/verify.mjs` (typecheck, lint, tests, fmt, clippy, builds, validators) | **Implemented** |
| Real a11y/privacy source assertions (no hardcoded-pass fixtures) | **Implemented** |
| Testing Library + axe on `@language-llm/ui` + desktop shell | **Implemented** |
| Playwright local fixtures (captions / page-translate / companion stubs) | **Implemented** (CI headless); headed extension load opt-in |
| Cross-platform CI (Ubuntu/Windows/macOS) + unsigned headless binaries | **Implemented** |
| Protected `.github/workflows/release.yml` stub (secrets external; dry_run default) | **Implemented** plumbing; signing/CWS **Deferred** |
| `benchmarks/model-evals` classification (`mock` / fixture ≠ release quality) | **Implemented** |

**Manual gates:** `apps/extension/e2e/MANUAL_GATES.md` (YouTube SPA, tabCapture). GUI Tauri CI job is `continue-on-error` until WebKit/icons settle. Keep MANUAL_GATES as source of truth for browser matrices.

### Phase 2A — Tauri desktop manager

| Item | Label |
| --- | --- |
| Real Tauri 2 app (`gui` feature) + React/`@language-llm/ui` shell | **Implemented** |
| Headless `--serve` + `--native-messaging` retained | **Implemented** |
| Views: Overview, Models, Dictionaries, Storage & privacy, Jobs, Hardware, Diagnostics, Licenses, Updates | **Implemented** |
| Tray / start-stop / disk estimates / backend discovery / redacted log export / native-host repair | **Implemented** |
| Updater endpoints + pubkey placeholder | **Implemented** plumbing; signing **Deferred** |
| Density default Balanced; Expert diagnostics | **Implemented** |
| Extension ID via env or `data_dir/extension_id` | **Implemented** (release pin required) |

**Run:** `pnpm --filter @language-llm/desktop tauri:dev` · Headless: `cargo run -p language-llm-desktop -- --serve`

### Phase 1A — Runtime / security / SQLite

| Item | Label |
| --- | --- |
| Shared page-translate node paths + round-trip tests | **Implemented** |
| Companion MT (`page-translate.submit` → result); `[lang]` mock only via `isDevelopmentMtFallbackAllowed()` | **Implemented** + **Development fallback** |
| Whisper/llama when verified weights installed | **Weights-required** (path **Implemented**) |
| `.installed` + digest gate; `LANGUAGE_LLM_DEV_CATALOG` / `PENDING_*` for dev | **Implemented** |
| ASR WS fan-in + cancel/pause/resume → offscreen | **Implemented** |
| Fixture captions gated to `demo_*` video IDs | **Implemented** |
| Fidelity checks; MADLAD IDs match catalog | **Implemented** |
| WS auth: no CORS Any, Origin / extension pin, skew, bootstrap rotate | **Implemented** |
| Companion connection state machine + reconnect | **Implemented** |
| SQLite authority: timelines, study, dicts, retention, wipe, hydrate | **Implemented** |
| FSRS-5 in `packages/learning` + companion study sync | **Implemented** (library math + sync; not a marketing “certified FSRS product” claim) |
| AnkiConnect test/add-note helpers (localhost) + CSV fallback | **Implemented** helpers; live disclosure polish may continue |

## Product surfaces (honest cut)

### Implemented (in-repo)

| Area | Notes |
| --- | --- |
| Phase 0 docs (ADRs, threat model, licenses, tiers, fidelity, source policy) | Docs |
| Monorepo (pnpm + Cargo), `@language-llm/protocol` TS+Rust | |
| Shared UI tokens/primitives + Focus/Balanced/Expert density | Extension + desktop |
| Caption-first YouTube + Netflix path (router, fixtures, SPA helpers, overlay, MAIN bridge parsers) | Live YT/Netflix still **Manually verified** empty |
| Page-translate segmenter/apply/restore + toolbar + host permission UX | Companion MT when connected; real llama when weights verified |
| Lyrics LRC/TTML / LRCLIB opt-in / karaoke helpers / priority excludes scrapers | |
| Dictionary adapters (JMdict / CC-CEDICT / Kaikki) + import/lookup paths | Attribution display required in UI About |
| Learning: mine / review / known / CSV; FSRS-5 weights length 19 | Unit-tested scheduler |
| Overlay a11y shortcuts (Alt+S/T/R/M/K, live region) | External audit **Deferred** |
| Companion WS + jobs + PCM ingest + mock/real backends | OfflineMock ASR/MT labeled via `developmentFallback` / `provisional` |
| Native messaging host `com.languagellm.companion` + OS register scripts | |
| Model catalog, SHA-256 install verify, specialist `ModelNotInstalled` | |
| `pnpm verify` + CI matrix (Ubuntu/Windows/macOS) + release workflow stub | See Phase 3A; YouTube/tabCapture still **Manually verified** empty |

### Development fallback

| Area | Behavior |
| --- | --- |
| Whisper / Hy-MT2 / MADLAD without verified weights | `InferenceMode::OfflineMock` — structured stubs, not remote APIs; UI must not claim “live ASR” / “on-device committed MT” |
| Page MT when companion unavailable **and** dev fallback allowed | Clearly labeled `[dev]`; production must not inject `[en]`-style mocks |
| VLM / context evidence without multimodal weights | Constrained mock schema for gate UX; status marks stub VLM provisional |
| Fixture captions | Only `demo_*` (and explicit test) video IDs |

### Weights-required

| Area | Leaf TODO |
| --- | --- |
| whisper.cpp / llama.cpp GPU/CPU inference | Drop GGUF under `models/weights/<id>/` + CLI under `models/bin/`; replace `PENDING_*` digests |
| Specialist ASR (ONNX / NeMo workers) | Router ready; OS workers thin |
| Qwen3.5 / Gemma real VLM | Gate + mock shipped; swap stub for multimodal CLI |

### Manually verified

| Gate | Status |
| --- | --- |
| Live YouTube watch SPA + timedtext with real cookies/player | **Not recorded** |
| Gesture-gated tabCapture → PCM → ASR on Win/macOS/Linux | **Not recorded** |
| Signed desktop installers / notarization | **Not recorded** (secrets absent) |
| CWS store listing end-to-end | **Not recorded** |

### Deferred

| Area | Why |
| --- | --- |
| Chrome Web Store package + review | Needs publisher account |
| Code signing / notarization / updater pubkey | Secrets + CI release job |
| Signed catalog Ed25519 auto-update | Ops |
| SQLCipher encryption at rest | Schema ready; optional later |
| Pair-level Verified language human MQM | Native reviewers + months |
| Full external a11y audit | Manual + beta |
| AnkiConnect live UI opt-in disclosure polish | Helpers exist |

## Product gates encoded in automated tests

- Caption videos do not auto-start capture (`wouldAutoStartCapture` false)
- Lyrics priority excludes proprietary scrapers
- Page-translate fidelity preserves numbers/URLs in checks
- Protocol major-version handshake compatibility
- Companion WS handshake + translate smoke (`ws_smoke`)
- Capture cancel/resume + SHA-256 model install verify
- Specialist ASR → `ModelNotInstalled` when weights absent
- Fake whisper/llama CLI integration tests
- Dictionary fixture parsers; overlay shortcut map; study session mine → FSRS → CSV
- VLM gate: lite skips; balanced deixis returns mock evidence

## Verdict (for agents and humans)

Software paths for companion auth, SQLite authority, UI density profiles, Tauri manager shell, and labeled fallbacks are **in-repo**. That is **not** the same as a signed, weight-backed, store-published product.

**Release narrative must say:** implemented locally; development fallbacks when weights missing; real inference weights-required; YouTube/tabCapture/signing/CWS manually verified or deferred per table above.
