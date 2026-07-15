#!/usr/bin/env bash
# Install Chrome/Chromium native messaging host for Language-LLM (Linux).
# Usage: ./register-linux.sh <extension-id> [absolute-path-to-binary]
set -euo pipefail

HOST_NAME="com.languagellm.companion"
EXT_ID="${1:?extension id required (from chrome://extensions)}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

if [[ -n "${2:-}" ]]; then
  BIN="$2"
else
  if [[ -x "$REPO_ROOT/target/release/language-llm-desktop" ]]; then
    BIN="$REPO_ROOT/target/release/language-llm-desktop"
  elif [[ -x "$REPO_ROOT/target/debug/language-llm-desktop" ]]; then
    BIN="$REPO_ROOT/target/debug/language-llm-desktop"
  else
    echo "error: binary not found. Build: cargo build -p language-llm-desktop --release" >&2
    exit 1
  fi
fi

ABS="$(cd "$(dirname "$BIN")" && pwd)/$(basename "$BIN")"
if [[ ! -f "$ABS" ]]; then
  echo "error: binary not found: $ABS" >&2
  exit 1
fi
chmod +x "$ABS"

HOST_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/language-llm"
mkdir -p "$HOST_DIR"
WRAPPER="$HOST_DIR/language-llm-native-host"
cat > "$WRAPPER" <<EOF
#!/usr/bin/env bash
set -euo pipefail
export LANGUAGE_LLM_NATIVE=1
exec "${ABS}" --native-messaging "\$@"
EOF
chmod +x "$WRAPPER"

write_manifest() {
  local dir="$1"
  mkdir -p "$dir"
  local manifest="$dir/${HOST_NAME}.json"
  cat > "$manifest" <<EOF
{
  "name": "${HOST_NAME}",
  "description": "Language-LLM local companion bootstrap",
  "path": "${WRAPPER}",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://${EXT_ID}/"]
}
EOF
  echo "Wrote $manifest"
}

write_manifest "${HOME}/.config/google-chrome/NativeMessagingHosts"
if [[ -d "${HOME}/.config/chromium" ]] || [[ "${INSTALL_CHROMIUM:-0}" == "1" ]]; then
  write_manifest "${HOME}/.config/chromium/NativeMessagingHosts"
fi
if [[ -d "${HOME}/.config/microsoft-edge" ]]; then
  write_manifest "${HOME}/.config/microsoft-edge/NativeMessagingHosts"
fi

echo "Wrapper: $WRAPPER → $ABS"
echo "Origin: chrome-extension://${EXT_ID}/"
echo "Verify: load unpacked extension → popup Companion: ok"
echo "Uninstall: $SCRIPT_DIR/uninstall-linux.sh"
