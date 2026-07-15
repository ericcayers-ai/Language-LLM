## Summary

<!-- Why this change exists; link issues if any -->

## Status impact

Does this change how we should label behavior in STATUS.md?

- [ ] No status change
- [ ] Implemented path added/changed
- [ ] Development fallback labeled
- [ ] Weights-required path touched
- [ ] Manual verification recorded (describe OS / Chrome)
- [ ] Deferred / external blocker documented

## Test plan

- [ ] `pnpm verify` passes locally
- [ ] Manual check (extension / companion / Tauri) if UI or IPC changed:

## Checklist

- [ ] Tests added or updated where behavior changes
- [ ] Docs / STATUS.md / CHANGELOG Unreleased updated if shipped surface changes
- [ ] No YouTube downloader or bulk stream-ripping features
- [ ] Lyrics path remains store-safe (captions / LRCLIB opt-in / import / ASR only)
- [ ] No secrets, `.env`, private signing keys, or model weight binaries in the diff
- [ ] Does not weaken Origin / extension-ID / digest / fidelity gates to pass CI
- [ ] UI uses `@language-llm/ui` primitives / density profiles where applicable
