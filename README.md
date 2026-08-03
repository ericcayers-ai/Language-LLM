# Language-LLM

Local-first Chrome extension + desktop companion for:

1. **YouTube language suite** — caption-first subtitles, user-initiated tab capture ASR, context-aware translation, dictionaries, learning
2. **Website translate** — in-place DOM translation (local MT only)
3. **Song lyrics** — store-safe karaoke (captions → LRCLIB → import → ASR last)

Inference stays on your machine. Network is for explicit model/dictionary download, optional attributed LRCLIB fetches, and (when configured) signed updates.

**Default git branch:** **`main`**.

Honest status lives in **[STATUS.md](./STATUS.md)**. Do not treat this README as a GA claim.

## Status legend

| Label | Meaning |
| --- | --- |
| **Implemented** | Code path exists in-repo and is covered by automated tests or intentional smoke wiring |
| **Development fallback** | Labeled mock/stub used when weights, CLIs, or production pins are absent — never silent fake success in specialist paths |
| **Weights-required** | Real ASR/MT/VLM needs verified local files under `models/weights/` plus CLIs |
| **Manually verified** | Human / real-browser gate run and recorded — not assumed from unit tests |
| **Deferred** | Needs store credentials, notarization secrets, native-speaker QA, or multi-month ops |

## Architecture

```
apps/extension     Chrome MV3 (WXT + React/TS)
apps/desktop       Tauri 2 manager UI + Rust companion (native messaging + loopback WS)
packages/*         protocol, ui, language-kits, page-translate, lyrics, learning, mt-core
crates/*           media-pipeline, inference-router, subtitle-core, local-store
models/catalog.json  license-aware model router catalog (digests often PENDING_*)
docs/              ADRs, privacy, enterprise, troubleshooting, licenses
```

Hard constraints: **no automatic YouTube downloading**; **no proprietary lyric-site scraping**; **commercially redistributable model defaults** when packs are offered (Hy-MT2, MADLAD, Whisper, Qwen3.*, etc.).

Application source is MIT ([LICENSE](./LICENSE)). Model weights and dictionaries keep **upstream** licenses — see [docs/licenses/model-matrix.md](./docs/licenses/model-matrix.md) and [docs/licenses/ATTRIBUTIONS.md](./docs/licenses/ATTRIBUTIONS.md).

## Prerequisites

- Node.js ≥ 20
- Rust stable (`rustup`) — optional; needed for the desktop companion, skippable if you only want the extension

pnpm itself is not a separate install: `pnpm setup` below activates the pinned version via corepack.

## Quickstart

```bash
pnpm setup    # installs deps, activates pinned pnpm, builds the companion if Rust is present
pnpm dev      # runs the companion (loopback WS) + extension watch build together
```

Then in Chrome: `chrome://extensions` → enable **Developer mode** → **Load unpacked** → pick `apps/extension/.output/chrome-mv3`.

That's it for local dev. `pnpm setup` prints the same next-steps if you lose this page. Native messaging (for auto-discovering the companion instead of pasting a port) is optional — see [step 3](#3-native-messaging-extension-bootstrap) below.

For full quality gates (lint, typecheck, cargo test, e2e) run `pnpm verify` instead of `pnpm dev`.

## Manual / step-by-step run

The commands below are what `pnpm dev` runs for you. Use them directly if you want to run a single piece, run headless, or debug a step in isolation.

### 1. Companion — headless (CI / extension without window)

```bash
cargo run -p language-llm-desktop -- --serve
# Stdout bootstrap JSON: port + bootstrapToken + protocolVersion
# Health: http://127.0.0.1:<port>/health
# WS:     ws://127.0.0.1:<port>/v1?t=<bootstrapToken>
```

Without `--serve`, the process still supports native-messaging / GUI entrypoints depending on how it is launched. Prefer `--serve` for loopback-only smoke.

Auth: client sends `auth.handshake.request` (`@language-llm/protocol`); companion returns `sessionToken`. Translate / ASR / page-translate jobs use **real whisper/llama CLIs when verified weights are installed**; otherwise commercial paths use a labeled **OfflineMock** development fallback. Specialists return **model not installed** (not silent mock).

SQLite defaults to the OS data dir under `language-llm/` (`dirs::data_dir()`, e.g. `%APPDATA%\language-llm` on Windows). Override with `LANGUAGE_LLM_DATA_DIR`.

### 2. Desktop manager (Tauri 2)

**Implemented** as a real Tauri 2 app with React + `@language-llm/ui` views (Overview, Models, Dictionaries, Storage & privacy, Jobs, Hardware, Diagnostics, Licenses, Updates). Updater **pubkey is a placeholder** until release secrets exist — do not claim signing/notarization works yet.

```bash
pnpm --filter @language-llm/desktop tauri:dev   # builds with --features gui
```

Pin the extension for release WS Origin checks:

- `LANGUAGE_LLM_EXTENSION_ID=<chrome-extension-id>`, or
- `data_dir/extension_id` (Overview → Pin ID / Repair native host)

### 3. Native messaging (extension bootstrap)

Host name: **`com.languagellm.companion`**.

```bash
cargo build -p language-llm-desktop --release
# Load unpacked extension once, copy ID from chrome://extensions, then:

# Windows
powershell -File apps/desktop/scripts/register-windows.ps1 -ExtensionId <id>

# macOS / Linux
./apps/desktop/scripts/register-macos.sh <id>
./apps/desktop/scripts/register-linux.sh <id>
```

Uninstall native host: `uninstall-windows.ps1` / `uninstall-macos.sh` / `uninstall-linux.sh`.  
Full steps: [apps/desktop/scripts/README.md](./apps/desktop/scripts/README.md).  
Data removal / wipe: [docs/privacy.md](./docs/privacy.md) and [docs/troubleshooting.md](./docs/troubleshooting.md).

### 4. Extension (unpacked)

```bash
pnpm --filter @language-llm/extension dev
# Load apps/extension/.output/chrome-mv3 in chrome://extensions
```

Surfaces: popup (launcher), YouTube overlay, side panel, page-translate toolbar. Density profiles **Focus / Balanced / Expert** via `@language-llm/ui` (`ProfilePicker`).

Live YouTube caption SPA behavior and gesture-gated `tabCapture` are **not** claimed as manually verified in CI — see STATUS.md.

## Local models

Weights are **not** committed. Until verified files land under `models/weights/<id>/` with a real SHA-256 (not `sha256:PENDING_*`) and a `.installed` marker, Whisper / Hy-MT2 / MADLAD stay on labeled offline mocks.

```
<repo-or-LANGUAGE_LLM_DATA_DIR>/
  models/catalog.json
  models/bin/                          # optional: whisper-cli / llama-cli
  models/weights/<model-id>/
    model.gguf
    .installed                         # only after digest verify
```

Details: [models/README.md](./models/README.md).

## Accessibility shortcuts (overlay)

Alt+letter chords (or focused overlay): **S** source · **T** translation · **R** reveal · **M** mine · **K** known · **?** help · **Esc** blur.  
Do not steal YouTube keys when the overlay is unfocused. Full list: [docs/troubleshooting.md](./docs/troubleshooting.md#accessibility-shortcuts).

## Legal / source constraints

- **No YouTube downloading** — caption track on page → user-initiated `tabCapture` → owned-media import only
- Page translate: on-device text; originals recoverable
- Lyrics: captions / LRCLIB (attributed) / user import / ASR — never Genius-style scrapers
- Local-first: inference and transcripts stay on device

## Contributing & community

- [CONTRIBUTING.md](./CONTRIBUTING.md) · [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)
- [SECURITY.md](./SECURITY.md) · [CHANGELOG.md](./CHANGELOG.md)
- [docs/privacy.md](./docs/privacy.md) · [docs/enterprise-chrome.md](./docs/enterprise-chrome.md)

## Docs index

| Doc | Purpose |
| --- | --- |
| [STATUS.md](./STATUS.md) | Implemented vs fallback vs weights vs manual vs deferred |
| [docs/architecture](./docs/architecture/README.md) | ADRs, threat model, fidelity, source policy |
| [docs/licenses/model-matrix.md](./docs/licenses/model-matrix.md) | License posture |
| [docs/licenses/ATTRIBUTIONS.md](./docs/licenses/ATTRIBUTIONS.md) | Attribution / notice text |
| [docs/privacy.md](./docs/privacy.md) | Retention, wipe, uninstall |
| [docs/troubleshooting.md](./docs/troubleshooting.md) | IDs, companion, models, a11y |
| [docs/enterprise-chrome.md](./docs/enterprise-chrome.md) | Enterprise / force-install guidance |
| [apps/desktop/README.md](./apps/desktop/README.md) | Tauri manager modes |
