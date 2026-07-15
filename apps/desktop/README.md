# Language-LLM desktop manager

Tauri 2 app wrapping the local companion: model/privacy/jobs/diagnostics UI plus the existing loopback WebSocket and Chrome native-messaging bootstrap.

## Modes

| Mode | How | Purpose |
| --- | --- | --- |
| Manager GUI | `pnpm --filter @language-llm/desktop tauri:dev` | Tray + React shell (Balanced density default) |
| Headless serve | `cargo run -p language-llm-desktop -- --serve` | Loopback WS only (CI / extension without window) |
| Native messaging | binary `--native-messaging` or `LANGUAGE_LLM_NATIVE=1` | Chrome host bootstrap |

The `gui` Cargo feature enables Tauri. CI and default `cargo test -p language-llm-desktop` stay headless (no WebKit dependency).

## Extension pin

Release builds require a pinned extension ID:

- `LANGUAGE_LLM_EXTENSION_ID=<id>`, or
- `data_dir/extension_id` (written by Overview → Repair native host / Pin ID)

## Updates

Updater endpoints and a **public key placeholder** (`UNCONFIGURED_UPDATER_PUBLIC_KEY`) live in `src-tauri/tauri.conf.json`. Signing/notarization is **Deferred** until CI secrets exist (`TAURI_SIGNING_PRIVATE_KEY` / related). Never commit private keys. See root [STATUS.md](../../STATUS.md).

## Scripts

Native-host registration helpers remain under [`scripts/`](./scripts/README.md).
