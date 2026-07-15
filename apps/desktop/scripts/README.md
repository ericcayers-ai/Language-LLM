# Native messaging host registration

Host name: `com.languagellm.companion`

The companion speaks Chrome [native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging) (length-prefixed JSON on stdin/stdout) for **bootstrap only**. Streaming jobs use the loopback WebSocket returned by bootstrap.

Installers write:

1. A **wrapper script** with an absolute path that launches the binary with `--native-messaging` (Chrome does not pass argv/env via the JSON manifest).
2. A **native host manifest** whose `path` is that wrapper and `allowed_origins` lists your extension id.
3. OS registration so Chrome finds the manifest (Windows registry / macOS+Linux well-known dirs).

## End-to-end verify

```bash
# 1. Build companion
cargo build -p language-llm-desktop --release

# 2. Build / run extension
pnpm --filter @language-llm/extension dev
# chrome://extensions → Load unpacked → apps/extension/.output/chrome-mv3-dev
# Copy the extension ID

# 3. Register native host (pick your OS)
powershell -File apps/desktop/scripts/register-windows.ps1 -ExtensionId <id>
# ./apps/desktop/scripts/register-macos.sh <id>
# ./apps/desktop/scripts/register-linux.sh <id>

# 4. Open the extension popup → Companion should report ok
#    (native bootstrap → WS handshake → session.ping)
```

Reload the extension after re-registering if the id changed.

## Windows

```powershell
cargo build -p language-llm-desktop --release
powershell -File apps/desktop/scripts/register-windows.ps1 -ExtensionId <id>
# Optional: -Browser Edge|Chromium -BinaryPath C:\path\to\language-llm-desktop.exe
```

Registers:

- Manifest + wrapper under `%LOCALAPPDATA%\LanguageLLM\`
- `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.languagellm.companion` → manifest path

Uninstall:

```powershell
powershell -File apps/desktop/scripts/uninstall-windows.ps1
```

## macOS

```bash
chmod +x apps/desktop/scripts/register-macos.sh apps/desktop/scripts/uninstall-macos.sh
./apps/desktop/scripts/register-macos.sh <extension-id>
```

Writes:

- Wrapper: `~/Library/Application Support/LanguageLLM/language-llm-native-host`
- Manifest: `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.languagellm.companion.json`

```bash
./apps/desktop/scripts/uninstall-macos.sh
```

## Linux

```bash
chmod +x apps/desktop/scripts/register-linux.sh apps/desktop/scripts/uninstall-linux.sh
./apps/desktop/scripts/register-linux.sh <extension-id>
```

Writes:

- Wrapper: `${XDG_DATA_HOME:-~/.local/share}/language-llm/language-llm-native-host`
- Manifest: `~/.config/google-chrome/NativeMessagingHosts/com.languagellm.companion.json`
  (also Chromium / Edge dirs when those configs exist)

```bash
./apps/desktop/scripts/uninstall-linux.sh
```

## Manifest template

See `native-host.json`. `path` **must** be absolute. Prefer the generated wrapper so native mode is always enabled.

## Quick smoke (no Chrome)

```bash
cargo test -p language-llm-desktop --test ws_smoke
cargo run -p language-llm-desktop
# prints bootstrap JSON; leave running while testing the extension without native host
```

## Security

- `allowed_origins` must list only your extension id (`chrome-extension://…/`).
- Bootstrap returns loopback port + short-lived token; reject non-extension origins.
- Inference stays local; native messaging is bootstrap-only.
