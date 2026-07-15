#!/usr/bin/env bash
# Remove Chrome / Chromium native messaging host for Language-LLM (macOS).
set -euo pipefail

HOST_NAME="com.languagellm.companion"
REMOVED=0

for DIR in \
  "${HOME}/Library/Application Support/Google/Chrome/NativeMessagingHosts" \
  "${HOME}/Library/Application Support/Chromium/NativeMessagingHosts"
do
  MANIFEST="$DIR/${HOST_NAME}.json"
  if [[ -f "$MANIFEST" ]]; then
    rm -f "$MANIFEST"
    echo "Removed $MANIFEST"
    REMOVED=1
  fi
done

WRAPPER="${HOME}/Library/Application Support/LanguageLLM/language-llm-native-host"
if [[ -f "$WRAPPER" ]]; then
  rm -f "$WRAPPER"
  echo "Removed $WRAPPER"
  REMOVED=1
fi

if [[ "$REMOVED" -eq 0 ]]; then
  echo "No native host manifests found to remove."
fi
