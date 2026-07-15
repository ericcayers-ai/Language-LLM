# Troubleshooting

## Identifiers

| ID | Value / how to find |
| --- | --- |
| Native messaging host name | `com.languagellm.companion` |
| Extension ID (unpacked) | `chrome://extensions` → Language-LLM → copy ID (changes if path changes) |
| Extension pin (companion) | `LANGUAGE_LLM_EXTENSION_ID` or `<data_dir>/extension_id` |
| Data directory | OS data dir + `language-llm/` or `LANGUAGE_LLM_DATA_DIR` |
| Desktop app id | `com.languagellm.desktop` (Tauri `identifier`) |
| Protocol | See `@language-llm/protocol` / companion bootstrap `protocolVersion` |

Release builds should pin the store extension ID. Unpinned/unexpected Origins are rejected by hardened WS auth.

## Companion will not connect

1. Start headless: `cargo run -p language-llm-desktop -- --serve` and confirm bootstrap JSON prints a port.
2. Or open the Tauri manager and ensure the service is running.
3. Register native host with **this** extension ID (`apps/desktop/scripts/README.md`).
4. Reload the extension after re-registration.
5. Popup should show native bootstrap → WS handshake → `session.ping`.
6. If Origin rejected: pin ID via env or Overview → Pin / Repair native host.

## Models stuck on mock / “not installed”

1. Confirm files under `models/weights/<catalog-id>/`.
2. Replace `sha256:PENDING_*` in `models/catalog.json` with the real digest.
3. Run verify/install so `.installed` is written.
4. Place `whisper-cli` / `llama-cli` under `models/bin/` or set `LANGUAGE_LLM_WHISPER_CLI` / `LANGUAGE_LLM_LLAMA_CLI`.
5. Restart companion. Specialists correctly return **ModelNotInstalled** when missing (not a bug).

See [models/README.md](../models/README.md).

## Page translate injects `[lang]` prefixes

That is the **development fallback** when companion MT is unavailable and `isDevelopmentMtFallbackAllowed()` is true. Production flows must use the companion. Check companion status and host permission grant.

## No captions on YouTube

1. Fixture/demo paths only for `demo_*` video IDs — real videos must show actionable “Transcribe this tab” rather than fake captions.
2. Live timedtext depends on player session / bridge — **manual verification not claimed** in STATUS.md until recorded.
3. Do not use downloaders; captions only from on-page tracks or user-initiated capture.

## Capture / ASR silent

tabCapture needs a **user gesture**, successful `getMediaStreamId`, and offscreen PCM path. Cancel should stop AudioContext. Real OS success is a **manual gate**.

## Accessibility shortcuts

Overlay (Alt chord or overlay-focused):

| Shortcut | Action |
| --- | --- |
| Alt+S | Source layer |
| Alt+T | Translation layer |
| Alt+R | Reveal |
| Alt+M | Mine card |
| Alt+K | Mark known |
| Alt+? | Help |
| Esc | Blur overlay |

Shortcuts must not steal YouTube keys when the overlay is unfocused.

## Privacy wipe / retention

Side panel and desktop Storage view. Presets: `session`, `days7` (default), `days30`, `keep`. Wipe scopes: `all`, `transcripts`, `translations`, `lyrics`, `page-cache`, `study`, `dictionaries`. Details: [privacy.md](./privacy.md).

## Density profiles

Focus / Balanced / Expert via `ProfilePicker` (`language-llm.density-profile` in `chrome.storage.local`). Desktop manager defaults to **Balanced**.

## Logs

Desktop Diagnostics can export **redacted** logs. Never paste bootstrap/session tokens into public issues.
