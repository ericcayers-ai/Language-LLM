# Security Policy

## Supported versions

This project is pre-1.0 and under active overhaul. Security fixes target the default branch **`main`**. There is no long-term LTS claim yet.

## What is in scope

- Chrome extension (MV3) surfaces and messaging
- Local companion WebSocket / native-messaging bootstrap
- Model catalog integrity (SHA-256 digests, install markers)
- Local storage / privacy wipe behavior
- Supply-chain issues in published release artifacts (when signing is configured)

## What is out of scope / known residual risk

- Compromised OS / local admin malware inspecting process memory (accepted in the threat model)
- Unverified live YouTube adapters (brittle; fail visibly)
- Unsigned or placeholder updater keys in development builds — do not treat unconfigured updater pubkey as production security

See [docs/architecture/threat-model.md](./docs/architecture/threat-model.md) and [STATUS.md](./STATUS.md).

## Reporting a vulnerability

Please **do not** open a public GitHub issue for exploitable vulnerabilities that could harm users.

1. Prefer GitHub [private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing/privately-reporting-a-security-vulnerability) on this repository when enabled.
2. Otherwise email the repository owner (`ericcayers-ai` on GitHub) with:
   - Affected component (extension / companion / protocol / install scripts)
   - Reproduction steps
   - Impact assessment
   - Whether a PoC is attached (keep PoCs minimal; no weaponized malware)

We aim to acknowledge within **7 days** and share a remediation plan when practical. Please allow time for a fix before public disclosure.

## Hardening expectations for contributors

- Never commit private signing keys, `.env` secrets, session tokens, or model weight binaries
- Do not weaken Origin / extension-ID checks, CORS lockdown, digest gates, or fidelity blocks to “get green”
- Treat caption/ASR/dictionary text as untrusted quoted data for prompts
- Redact tokens from logs and bug reports

## Safe Harbor

Good-faith research that follows this policy and avoids privacy violations, social engineering, and destruction of data is appreciated.
