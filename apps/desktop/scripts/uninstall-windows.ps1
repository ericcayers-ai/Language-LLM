param(
  [ValidateSet("Chrome", "Edge", "Chromium")][string]$Browser = "Chrome"
)

$ErrorActionPreference = "Stop"
$HostName = "com.languagellm.companion"

$regRoots = @{
  Chrome = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$HostName"
  Edge = "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$HostName"
  Chromium = "HKCU:\Software\Chromium\NativeMessagingHosts\$HostName"
}
$regPath = $regRoots[$Browser]

if (Test-Path $regPath) {
  Remove-Item -Path $regPath -Recurse -Force
  Write-Host "Removed registry key $regPath"
} else {
  Write-Host "No registry key at $regPath"
}

$manifestDir = Join-Path $env:LOCALAPPDATA "LanguageLLM"
foreach ($name in @("$HostName.json", "language-llm-native-host.cmd")) {
  $p = Join-Path $manifestDir $name
  if (Test-Path $p) {
    Remove-Item -Path $p -Force
    Write-Host "Removed $p"
  }
}
