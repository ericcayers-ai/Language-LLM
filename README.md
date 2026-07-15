# Language-LLM

Local-first Chrome extension + desktop companion for:

1. **YouTube language suite** — caption-first subtitles, user-initiated tab capture ASR, context-aware translation, dictionaries, learning
2. **Website translate** — Google Translate–like in-place DOM translation (local MT only)
3. **Song lyrics** — store-safe karaoke (captions → LRCLIB → import → ASR last)

Inference stays on your machine. Network is for explicit model/dictionary download, signed updates, and optional attributed LRCLIB fetches.

See **[STATUS.md](./STATUS.md)** for what is shipped in-repo vs what needs GPU weights / store signing.

## Architecture

```
apps/extension     Chrome MV3 (WXT + React/TS)
apps/desktop       Tauri 2 / Rust companion (native messaging + loopback IPC)
packages/*         protocol, ui, language-kits, page-translate, lyrics, learning, mt-core
crates/*           media-pipeline, inference-router, subtitle-core, local-store
models/catalog.json  license-aware model router catalog
docs/architecture    ADRs, threat model, fidelity, source policy
```

Hard constraints: **no automatic YouTube downloading**; **no proprietary lyric-site scraping**; **commercially redistributable model defaults** (Hy-MT2, MADLAD, Whisper, Qwen3.*, etc.).

Application source is MIT ([LICENSE](./LICENSE)). Bundled or downloaded model weights and dictionaries keep their **own** upstream licenses — see [docs/licenses/model-matrix.md](./docs/licenses/model-matrix.md) and [models/README.md](./models/README.md). This repo does not relicense third-party weights.

## Prerequisites

- Node.js ≥ 20
- pnpm 9 (`corepack enable && corepack prepare pnpm@9.15.0 --activate`)
- Rust stable (`rustup`)

## Setup

```bash
corepack enable
pnpm install
pnpm verify          # pnpm tests + typecheck + cargo test --workspace
# or separately:
pnpm test
pnpm typecheck
cargo test --workspace
```

## How to run

### 1. Companion (loopback WebSocket)

```bash
# From repo root — binds 127.0.0.1:<ephemeral>, prints bootstrap JSON on stdout
cargo run -p language-llm-desktop

# Example stdout: {"ok":true,"port":54321,"bootstrapToken":"…","protocolVersion":"1.0.0"}
# Health: http://127.0.0.1:<port>/health
# WS:     ws://127.0.0.1:<port>/v1?t=<bootstrapToken>
```

Auth: client sends `auth.handshake.request` (see `@language-llm/protocol`); companion returns `sessionToken`. Jobs (`job.submit` translate / ASR / page-translate), `audio.chunk`, and opt-in `lyrics.resolve` work in **mock / stub** mode until weights land under `models/weights/`.

SQLite DB defaults to `%APPDATA%/language-llm/local-store.sqlite` (or `$XDG_DATA_HOME` / macOS Application Support). Override with `LANGUAGE_LLM_DATA_DIR`.

### 2. Native messaging (extension bootstrap)

Register the host so the extension can discover port + token. Installers write an absolute-path wrapper (Chrome does not pass `--native-messaging` via the JSON manifest) and OS registration:

```bash
# Build release binary first
cargo build -p language-llm-desktop --release

# Load unpacked extension once, copy its ID from chrome://extensions, then:
# Windows
powershell -File apps/desktop/scripts/register-windows.ps1 -ExtensionId <id>

# macOS / Linux
./apps/desktop/scripts/register-macos.sh <id>
./apps/desktop/scripts/register-linux.sh <id>
```

Uninstall: `uninstall-windows.ps1` / `uninstall-macos.sh` / `uninstall-linux.sh`.

Verify handshake: open the popup → **Companion: ok** (native bootstrap → WebSocket → `session.ping`). Full steps: `apps/desktop/scripts/README.md`.

Manual native mode (without Chrome):

```bash
LANGUAGE_LLM_NATIVE=1 target/release/language-llm-desktop
# or: language-llm-desktop --native-messaging
```

### 3. Extension (unpacked)

```bash
pnpm --filter @language-llm/extension dev
# Load apps/extension/.output/chrome-mv3-dev in chrome://extensions
```

Popup actions:

- **Companion** status (native + WS)
- **Translate this page** + grant/revoke `http(s)://*` host permission
- **Transcribe this tab** (gesture-gated tabCapture → offscreen PCM → companion ASR; stub until whisper.cpp)
- **Learn** — FSRS review (due cards, Again/Hard/Good/Easy, CSV copy); mine cues with **Alt+M** on the overlay
- **Dictionaries** — import JMdict / CC-CEDICT / Kaikki JSONL, local lemma lookup
- **Allow LRCLIB lyrics fetch** toggle + **Fetch LRCLIB** / **Import LRC**

Overlay shortcuts (Alt+letter, or focused overlay): **S** source, **T** translation, **R** reveal, **M** mine, **K** known, **?** help.

YouTube content script smoke: captions → mock MT → optional VLM gate (mock evidence) → overlay.

## How to drop weights (local inference)

Weights are **not** committed. Until files land under `models/weights/`, Whisper / Hy-MT2 / MADLAD stay on structured offline mocks. Specialists return **model not installed** instead of silently mocking.

```
<repo-or-LANGUAGE_LLM_DATA_DIR>/
  models/catalog.json
  models/bin/                          # optional: whisper-cli / llama-cli
  models/weights/<model-id>/
    model.gguf                         # or .onnx / NeMo pack
    .installed                         # written after SHA-256 verify
```

1. Accept the model license (see `docs/licenses/model-matrix.md`).
2. Download the GGUF/ONNX pack into `models/weights/<catalog-id>/`.
3. Optionally place `whisper-cli` / `llama-cli` under `models/bin/` (or set `LANGUAGE_LLM_WHISPER_CLI` / `LANGUAGE_LLM_LLAMA_CLI`).
4. Replace `sha256:PENDING_*` in `catalog.json` with the real digest, then verify via the companion model manager.
5. Restart the companion.

Env overrides: `LANGUAGE_LLM_DATA_DIR`, `LANGUAGE_LLM_BIN_DIR`, `LANGUAGE_LLM_WHISPER_CLI`, `LANGUAGE_LLM_LLAMA_CLI`.

Details: [models/README.md](./models/README.md).

## Legal / source constraints

- **No YouTube downloading** — caption track on page → user-initiated `tabCapture` → owned-media import only
- Page translate: on-device text only; originals recoverable
- Lyrics: captions / LRCLIB (attributed) / user import / ASR — never Genius-style scrapers
- Local-first: inference and transcripts stay on device

## Design

Ink `#111318`, Paper `#F7F8FA`, Signal Blue `#2F6FED`, Amber Evidence `#C47B17` — Atkinson Hyperlegible + Noto + IBM Plex Mono. Signature: context ribbon + evidence gutter.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).

## Docs

- [STATUS.md](./STATUS.md) — what works vs what needs weights/hardware
- [docs/architecture](./docs/architecture/README.md) — ADRs, threat model, fidelity, source policy
- [docs/licenses/model-matrix.md](./docs/licenses/model-matrix.md) — model and dictionary license posture
- [models/README.md](./models/README.md) — catalog and weight install paths
