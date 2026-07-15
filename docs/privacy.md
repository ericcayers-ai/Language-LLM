# Privacy policy (product)

**Last updated:** 2026-07-16  
**Applies to:** Language-LLM Chrome extension + local companion (desktop manager / headless service)

This is the repository privacy statement for the **local-first** product. It is not legal advice. Enterprise deployments should review [enterprise-chrome.md](./enterprise-chrome.md) and their own policy.

## Summary

- Inference, transcripts, translations, dictionaries, and study data are processed and stored **on your device** by default.
- The companion does **not** send content to Language-LLM cloud inference services (there is no remote MT/ASR backend in the product design).
- Network use is limited to: optional model/dictionary download you initiate, optional attributed LRCLIB lyrics fetch you enable, and (when configured by maintainers) signed software updates.

## What we store locally

| Data | Where | Notes |
| --- | --- | --- |
| Transcripts, translations, page-translate cache, lyrics cache | Companion SQLite (`local-store.sqlite` under the OS data dir) | Authoritative store |
| Study cards / known words / FSRS state | Companion SQLite (+ lightweight offline mirror in the extension when needed) | Synced when companion is ready |
| Dictionaries | Companion SQLite | Not Chrome sync |
| Models / weights | `models/weights/` under data or repo root | Large files; gitignored |
| UI density, session pointers, permission state | `chrome.storage.local` | Preferences only |
| Capture audio | Memory ring / temp files during ASR | Deleted after job unless user opts into retention features that keep media |

Default data directory: OS application data + `language-llm/` (override with `LANGUAGE_LLM_DATA_DIR`).

## Retention presets

Configured via side panel / desktop Storage view (`retention.set` / `retention.get`):

| Preset | Behavior |
| --- | --- |
| `session` | Treat content as ephemeral (TTL 0 for retention sweeps) |
| `days7` | **Default** — expire after 7 days |
| `days30` | Expire after 30 days |
| `keep` | No automatic expiry |

## Privacy wipe scopes

User-initiated wipe (`privacy.wipe`) supports:

`all` · `transcripts` · `translations` · `lyrics` · `page-cache` · `study` · `dictionaries`

Wipe clears companion SQLite scopes. It **does not** uninstall model weight files (use Models UI / delete `models/weights/`). It does **not** remove Chrome extension storage prefs unless you remove the extension.

## Uninstall and data removal

1. **Extension:** Remove from `chrome://extensions`. Clears extension storage for that profile. Does not delete companion SQLite or models.
2. **Native host registration:** run OS uninstall scripts under `apps/desktop/scripts/` (`uninstall-*.ps1` / `.sh`) or use manager repair/uninstall flows when shipping installers.
3. **Companion data:** delete the `language-llm` data directory (or `LANGUAGE_LLM_DATA_DIR`), including `local-store.sqlite` and `models/`.
4. **Dev binaries:** optional `cargo clean` / remove `target/` — build artifacts only.

## Permissions (extension)

Declared roughly: `storage`, `activeTab`, `offscreen`, `tabCapture`, `nativeMessaging`, `scripting`, `sidePanel`; YouTube host matches by default; optional `http(s)://*/*` for page translate. Capture requires an explicit user gesture.

## Contact / security

Security reports: [SECURITY.md](../SECURITY.md). Conduct: [CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md).
