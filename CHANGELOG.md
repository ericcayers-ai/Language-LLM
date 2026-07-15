# Changelog

All notable changes to Language-LLM are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) once `1.0.0` is tagged.
Until then, entries track monorepo overhaul milestones. **Do not** read pre-1.0 notes as Chrome Web Store release notes.

## [Unreleased]

### Added

- Documentation taxonomy: implemented / development fallback / weights-required / manually verified / deferred ([STATUS.md](./STATUS.md), [README.md](./README.md))
- Community & ops docs: [SECURITY.md](./SECURITY.md), privacy, enterprise Chrome, troubleshooting, attributions, Dependabot, CODEOWNERS, release notes template
- Source timeline `developmentFallback` flag for labeled OfflineMock ASR

### Changed

- Docs no longer oversell unsigned Tauri updater, unverified YouTube/tabCapture gates, or weightless “full inference”
- Architecture index clarifies ADR contracts vs implementation maturity
- Contribution templates and repository default branch target **`main`**
- Page-translate companion path uses llama when verified weights are installed (OfflineMock only when absent)
- OfflineMock ASR uses valid `asr` provenance + honest overlay status (no fake “live ASR” claim)
- Unsupported `job.submit` kinds fail closed instead of returning mock success
- Provisional MT / page-translate / stub VLM status copy distinguishes OfflineMock vs [dev] companion-down

### Notes (product, from overhaul — software-side)

These capabilities exist in-repo; maturity labels remain in STATUS.md:

- Real companion inference paths when verified weights + CLIs present; labeled OfflineMock otherwise
- WS auth hardening, SQLite authority, FSRS-5 library + companion study sync
- UI Focus / Balanced / Expert density across extension surfaces
- Tauri 2 desktop manager UI with headless `--serve` retained
- Updater pubkey placeholder; signing secrets external

## [0.0.0] — scaffold

Initial greenfield monorepo: extension + companion scaffolding, ADRs, protocol, catalogs, and offline product paths. Not a store release.
