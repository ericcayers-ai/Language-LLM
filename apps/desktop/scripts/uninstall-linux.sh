#!/usr/bin/env bash
# Remove Chrome / Chromium / Edge native messaging host for Language-LLM (Linux).
set -euo pipefail

HOST_NAME="com.languagellm.companion"
REMOVED=0

for DIR in \
  "${HOME}/.config/google-chrome/NativeMessagingHosts" \
  "${HOME}/.config/chromium/NativeMessagingHosts" \
  "${HOME}/.config/microsoft-edge/NativeMessagingHosts"
do
  MANIFEST="$DIR/${HOST_NAME}.json"
  if [[ -f "$MANIFEST" ]]; then
    rm -f "$MANIFEST"
    echo "Removed $MANIFEST"
    REMOVED=1
  fi
done

WRAPPER="${XDG_DATA_HOME:-$HOME/.local/share}/language-llm/language-llm-native-host"
if [[ -f "$WRAPPER" ]]; then
  rm -f "$WRAPPER"
  echo "Removed $WRAPPER"
  REMOVED=1
fi

if [[ "$REMOVED" -eq 0 ]]; then
  echo "No native host manifests found to remove."
fi
