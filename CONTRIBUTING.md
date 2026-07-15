# Contributing to Language-LLM

Thanks for helping. Keep changes focused, local-first, and store-safe.

## Code of conduct

Participate under [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).

## Prerequisites

- Node.js ≥ 20, pnpm 9 (`corepack enable`)
- Rust stable via `rustup`

```bash
pnpm install
pnpm verify   # required green path: JS tests + typecheck + cargo test --workspace
```

## Project layout

| Path | Role |
| --- | --- |
| `apps/extension` | Chrome MV3 extension (WXT) |
| `apps/desktop` | Rust/Tauri companion (WS + native messaging) |
| `packages/*` | Shared TS libraries |
| `crates/*` | Shared Rust crates |
| `docs/` | ADRs, threat model, licenses |
| `models/` | Catalog only — weights are never committed |

Match existing naming (`language-llm` / `@language-llm/*`), TypeScript and Rust style already in the tree, and keep diffs small.

## Pull requests

1. Branch from `master` (or the default branch).
2. Implement with tests where behavior changes.
3. Run `pnpm verify` locally before opening a PR.
4. Fill the PR template (summary, test plan, legal checklist).
5. Prefer one concern per PR.

## Legal constraints (non-negotiable)

Do **not** add:

- YouTube (or other) downloaders / bulk media scrapers
- Automatic offline ripping of streams without user-initiated, store-policy-safe capture
- Proprietary lyric-site scrapers (Genius-style, etc.)

Lyrics must stay store-safe: on-page captions, attributed LRCLIB (opt-in network), user LRC/TTML import, or user-initiated ASR — nothing else.

Model weights and dictionaries keep upstream licenses; do not relicense them as MIT. See `docs/licenses/model-matrix.md` and `models/README.md`.

## Docs

Update [STATUS.md](./STATUS.md) when you change what is shipped vs deferred. Prefer ADRs under `docs/architecture` for lasting design decisions.
