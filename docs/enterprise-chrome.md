# Enterprise Chrome deployment

Guidance for managed Chromium / Google Chrome deployments of Language-LLM. This is **engineering documentation**, not a commitment that a Chrome Web Store SKU or signed MSI is already published — see [`STATUS.md`](../STATUS.md).

## Components

1. **Extension** (MV3) — captions, page translate, learning UI, nativeMessaging client  
2. **Companion** — loopback WebSocket + SQLite + models (`language-llm-desktop`, optionally Tauri manager)  
3. **Native messaging host** — `com.languagellm.companion` registered for the pinned extension ID

Streaming inference does **not** go through native messaging (1 MB cap). NM is bootstrap-only.

## Recommended rollout

1. Build or obtain a **stable extension ID** (prefer Chrome Web Store ID when published; unpacked IDs change with path).
2. Pin that ID in companion release config: `LANGUAGE_LLM_EXTENSION_ID` or `extension_id` under the managed data dir.
3. Install companion binary to a machine-wide or user path; register native host manifests with `allowed_origins: ["chrome-extension://<id>/"]`.
4. Deploy extension via Chrome enterprise policies:
   - [ExtensionInstallForcelist](https://chromeenterprise.google/policies/#ExtensionInstallForcelist) (store ID + update URL), or
   - ExtensionInstallSources + self-hosted CRX for controlled rings (validate store policy first).
5. Pre-stage model packs under the companion data dir **or** allow user-initiated download with license acceptance.
6. Block research-opt-in packs via policy/docs if commercial redistribution rules forbid them.

## Native host paths (reference)

Scripts generate wrappers + manifests — see `apps/desktop/scripts/README.md`.

| OS | Typical registration |
| --- | --- |
| Windows | `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.languagellm.companion` |
| macOS | `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.languagellm.companion.json` |
| Linux | `~/.config/google-chrome/NativeMessagingHosts/com.languagellm.companion.json` |

For machine-wide installs, prefer Chrome enterprise native messaging host directory / HKLM equivalents and an absolute-path wrapper.

## Data residency & wipe

- Default DB: per-user OS data dir `language-llm/local-store.sqlite`
- Retention presets and wipe scopes: [privacy.md](./privacy.md)
- Models are large; plan disk budgets separately from profile wipe

## Security checklist

- [ ] Extension ID pinned; unexpected Origins rejected  
- [ ] No broad permissive CORS on companion  
- [ ] Model digests real (no `PENDING_*` in production catalogs)  
- [ ] Updater signing configured before auto-update (currently placeholder)  
- [ ] LRCLIB fetch remains opt-in  
- [ ] AnkiConnect remains opt-in localhost only  
- [ ] No YouTube downloader / lyric scraper features in the package  

## Verification commands

```bash
pnpm verify
cargo test -p language-llm-desktop --test ws_smoke
# Plus manual: force-install extension → popup Companion ok → one caption + one page-translate smoke
```

Record manual YouTube / tabCapture results per OS in STATUS.md — do not treat unit tests as those gates.
