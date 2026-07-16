# Changelog

All notable changes to Language-LLM are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) once `1.0.0` is tagged.
Until then, entries track monorepo overhaul milestones. **Do not** read pre-1.0 notes as Chrome Web Store release notes.

## [Unreleased]

### Fixed

-

## [0.1.0] — 2026-07-17

First tagged milestone after the product overhaul (re-released 2026-07-17 after gap audit). Software paths ship with honest OfflineMock / weights-required labeling; not a Chrome Web Store or signed-desktop GA.

### Added

- Documentation taxonomy: implemented / development fallback / weights-required / manually verified / deferred ([STATUS.md](./STATUS.md), [README.md](./README.md))
- Community & ops docs: [SECURITY.md](./SECURITY.md), privacy, enterprise Chrome, troubleshooting, attributions, Dependabot, CODEOWNERS, release notes template
- Source timeline `developmentFallback` flag for labeled OfflineMock ASR
- Cross-platform CI quality matrix (ubuntu / windows / macos) plus unsigned headless companion artifacts and optional Tauri GUI check
- Protected `release.yml` workflow (unsigned dry-run by default; optional `tag` input attaches normalized unsigned assets to the GitHub Release; signing/CWS secrets external)

### Changed

- Docs no longer oversell unsigned Tauri updater, unverified YouTube/tabCapture gates, or weightless “full inference”
- Architecture index clarifies ADR contracts vs implementation maturity
- Contribution templates and repository default branch target **`main`**
- Page-translate companion path uses llama when verified weights are installed (OfflineMock only when absent)
- OfflineMock ASR uses valid `asr` provenance + honest overlay status (no fake “live ASR” claim)
- Unsupported `job.submit` kinds fail closed instead of returning mock success
- Provisional MT / page-translate / stub VLM status copy distinguishes OfflineMock vs [dev] companion-down
- Workspace / extension package versions aligned to `0.1.0` so release zip names match the tag

### Fixed

- CI `pnpm install --frozen-lockfile` failure: lockfile still listed `@language-llm/ui` under `benchmarks` after that dependency was removed from `benchmarks/package.json`
- Unix CI compile of `inference-router` fake-CLI tests: missing `std::io::Write` for shell stub writer (Windows path was fine; switched unix stub to `fs::write`)
- Clippy `-D warnings` on Linux/macOS: unused `Command` import (Linux) and needless `return` in native-host repair branches
- OfflineMock ASR timelines no longer set `captionSource: "asr-live"` (stub path sets `developmentFallback` only; live whisper keeps `asr-live`)
- Extension overlay no longer labels OfflineMock ASR cues with an invalid/`asr` provenance chip; stub path clears the live-ASR label
- `release.yml` previously uploaded Actions artifacts only and never attached GitHub Release assets — publish step now normalizes and uploads when `tag` is provided

### Notes (product, from overhaul — software-side)

These capabilities exist in-repo; maturity labels remain in STATUS.md:

- Real companion inference paths when verified weights + CLIs present; labeled OfflineMock otherwise
- WS auth hardening, SQLite authority, FSRS-5 library + companion study sync
- UI Focus / Balanced / Expert density across extension surfaces
- Tauri 2 desktop manager UI with headless `--serve` retained
- Updater pubkey placeholder; signing secrets external

## [0.0.0] — scaffold

Initial greenfield monorepo: extension + companion scaffolding, ADRs, protocol, catalogs, and offline product paths. Not a store release.
