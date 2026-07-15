#!/usr/bin/env bash
# Install Chrome native messaging host for Language-LLM (macOS).
# Usage: ./register-macos.sh <extension-id> [absolute-path-to-binary]
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

HOST_DIR="${HOME}/Library/Application Support/LanguageLLM"
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

write_manifest "${HOME}/Library/Application Support/Google/Chrome/NativeMessagingHosts"
if [[ -d "${HOME}/Library/Application Support/Chromium" ]]; then
  write_manifest "${HOME}/Library/Application Support/Chromium/NativeMessagingHosts"
fi

echo "Wrapper: $WRAPPER → $ABS"
echo "Origin: chrome-extension://${EXT_ID}/"
echo "Verify: load unpacked extension → popup Companion: ok"
echo "Uninstall: $SCRIPT_DIR/uninstall-macos.sh"
