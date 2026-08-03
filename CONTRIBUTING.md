# Contributing to Language-LLM

Thanks for helping. Keep changes focused, local-first, and store-safe.

## Code of conduct

Participate under [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md). Security issues: [SECURITY.md](./SECURITY.md) (not public bug trackers for exploitable vulns).

## Prerequisites

- Node.js ≥ 20
- Rust stable via `rustup` (optional — needed for the desktop companion)

```bash
pnpm setup    # installs deps, activates pinned pnpm, builds the companion if Rust is present
pnpm dev      # companion + extension watch build, for local iteration
pnpm verify   # required green path before a PR — see scripts/verify.mjs
```

## Default branch

Prefer **`main`**. Open PRs against `main`.

## Project layout

| Path | Role |
| --- | --- |
| `apps/extension` | Chrome MV3 extension (WXT) — popup, overlay, side panel, page-translate |
| `apps/desktop` | Tauri 2 manager + Rust companion (WS + native messaging + `--serve`) |
| `packages/*` | Shared TS libraries (`ui`, `protocol`, `learning`, …) |
| `crates/*` | Shared Rust crates |
| `docs/` | ADRs, privacy, enterprise, troubleshooting, licenses |
| `models/` | Catalog only — weights are never committed |

Match existing naming (`language-llm` / `@language-llm/*`), TypeScript and Rust style already in the tree, and keep diffs small.

## UI architecture

Production UI primitives, tokens, and density profiles (**Focus / Balanced / Expert**) live in `@language-llm/ui`. Prefer those components over new inline styles in extension or desktop surfaces.

## Pull requests

1. Branch from `main` (or the current default branch).
2. Implement with tests where behavior changes.
3. Run `pnpm verify` locally before opening a PR.
4. Fill the PR template (summary, test plan, legal checklist, honesty checklist).
5. Prefer one concern per PR.
6. Update [STATUS.md](./STATUS.md) if you change what is implemented vs fallback vs deferred.

### Honesty checklist (required mindset)

- Do not document OfflineMock / `[lang]` prefixes as production quality.
- Do not claim YouTube SPA or tabCapture **manually verified** without recording the gate.
- Do not claim updater/signing/notarization without configured secrets and pubkey.
- Do not treat FSRS unit tests as independent certification beyond “implements FSRS-5 weights + scheduling math.”

## Legal constraints (non-negotiable)

Do **not** add:

- YouTube (or other) downloaders / bulk media scrapers
- Automatic offline ripping of streams without user-initiated, store-policy-safe capture
- Proprietary lyric-site scrapers (Genius-style, etc.)

Lyrics must stay store-safe: on-page captions, attributed LRCLIB (opt-in network), user LRC/TTML import, or user-initiated ASR — nothing else.

Model weights and dictionaries keep upstream licenses; do not relicense them as MIT. See `docs/licenses/model-matrix.md`, `docs/licenses/ATTRIBUTIONS.md`, and `models/README.md`.

## Docs

Update [STATUS.md](./STATUS.md) and [CHANGELOG.md](./CHANGELOG.md) (`Unreleased`) when shipped surfaces change. Prefer ADRs under `docs/architecture` for lasting design decisions.
