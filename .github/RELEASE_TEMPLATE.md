## Language-LLM $TAG

<!--
Use this template when drafting GitHub Release notes.
Honesty rules: never claim weights-verified, store-signed, or manually verified YouTube/tabCapture unless those gates were run and recorded in STATUS.md.
-->

### Highlights

-

### Status labels for this release

| Area | Label (implemented / development fallback / weights-required / manually verified / deferred) |
| --- | --- |
| Companion WS + SQLite | |
| Extension UI (density profiles) | |
| Desktop Tauri manager | |
| Model digests / OfflineMock | |
| Updater / code signing | |
| CWS package | |

### Artifacts

- [ ] Extension zip (unsigned / store) —
- [ ] Desktop installers —
- [ ] Checksums —
- [ ] Updater `latest.json` (only if pubkey configured)

### Verification

```text
pnpm verify
# optional: cargo test -p language-llm-desktop --test ws_smoke
```

Manual gates run: (none / list OS + Chrome versions)

### Breaking changes / migration

-

### Known blockers / deferred

- Link to STATUS.md blockers table
