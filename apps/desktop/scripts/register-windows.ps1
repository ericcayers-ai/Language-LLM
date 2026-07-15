param(
  [Parameter(Mandatory = $true)][string]$ExtensionId,
  [string]$BinaryPath = "",
  [ValidateSet("Chrome", "Edge", "Chromium")][string]$Browser = "Chrome"
)

$ErrorActionPreference = "Stop"
$HostName = "com.languagellm.companion"
$manifestDir = Join-Path $env:LOCALAPPDATA "LanguageLLM"
New-Item -ItemType Directory -Force -Path $manifestDir | Out-Null

if (-not $BinaryPath) {
  $release = Join-Path $PSScriptRoot "..\..\..\target\release\language-llm-desktop.exe"
  $debug = Join-Path $PSScriptRoot "..\..\..\target\debug\language-llm-desktop.exe"
  if (Test-Path $release) {
    $BinaryPath = (Resolve-Path $release).Path
  } elseif (Test-Path $debug) {
    $BinaryPath = (Resolve-Path $debug).Path
  } else {
    throw "language-llm-desktop.exe not found. Build with: cargo build -p language-llm-desktop --release"
  }
} else {
  $BinaryPath = (Resolve-Path $BinaryPath).Path
}

$BinaryPath = [System.IO.Path]::GetFullPath($BinaryPath)
if (-not (Test-Path $BinaryPath)) {
  throw "Binary not found: $BinaryPath"
}

# Chrome `path` must be absolute. Use a cmd wrapper so --native-messaging is set
# (the browser does not pass argv or env from the JSON manifest).
$wrapperPath = Join-Path $manifestDir "language-llm-native-host.cmd"
$wrapper = @"
@echo off
set LANGUAGE_LLM_NATIVE=1
"$BinaryPath" --native-messaging
"@
Set-Content -Path $wrapperPath -Value $wrapper -Encoding ASCII

$manifestPath = Join-Path $manifestDir "$HostName.json"
$manifest = @{
  name = $HostName
  description = "Language-LLM local companion bootstrap"
  path = $wrapperPath
  type = "stdio"
  allowed_origins = @("chrome-extension://$ExtensionId/")
}
$manifest | ConvertTo-Json -Depth 5 | Set-Content -Path $manifestPath -Encoding UTF8

$regRoots = @{
  Chrome = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$HostName"
  Edge = "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$HostName"
  Chromium = "HKCU:\Software\Chromium\NativeMessagingHosts\$HostName"
}
$regPath = $regRoots[$Browser]
New-Item -Path $regPath -Force | Out-Null
Set-ItemProperty -Path $regPath -Name "(default)" -Value $manifestPath

Write-Host "Registered native messaging host"
Write-Host "  Browser : $Browser"
Write-Host "  Manifest: $manifestPath"
Write-Host "  Wrapper : $wrapperPath"
Write-Host "  Binary  : $BinaryPath"
Write-Host "  Origin  : chrome-extension://$ExtensionId/"
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. chrome://extensions → Load unpacked → apps/extension/.output/chrome-mv3-dev"
Write-Host "  2. Copy the extension ID into this script if you re-register"
Write-Host "  3. Open the popup → Companion should report ok (native + WS handshake)"
Write-Host "Uninstall: powershell -File uninstall-windows.ps1 -Browser $Browser"
