# Manual browser gates (not automated in CI)

These flows require real YouTube pages, Chromium gesture-gated `tabCapture`, or OS
permissions that cannot be faithfully simulated with local fixtures. Do **not** mark
them green in STATUS/README until they are run on target OS builds.

| Gate | Platforms | How to run | Pass criteria |
| --- | --- | --- | --- |
| YouTube SPA caption discovery | Win / macOS / Linux | Load unpacked extension → open a watch URL with human captions | Overlay shows human provenance; seek sync within ±100ms subjectively |
| YouTube auto-captions | Win / macOS / Linux | Watch URL with ASR-only captions | Provenance labeled auto/asr; no silent capture start |
| YouTube no-captions → Transcribe CTA | Win / macOS / Linux | Watch URL with no timedtext | Empty state offers explicit “Transcribe this tab” (no fixture captions) |
| Gesture-gated tabCapture | Win / macOS / Linux | Click transcribe; grant tab audio | Offscreen AudioContext starts; cancel stops PCM; companion receives chunks when ready |
| Companion ready via native host | Win / macOS / Linux | Register host scripts; open popup | State machine reaches `ready` after bootstrap + WS handshake |
| Companion degraded / down | Win / macOS / Linux | Stop companion binary mid-session | Popup/sidepanel show degraded/down with recovery CTA |
| Page translate live host permission | Win / macOS / Linux | Grant optional_host_permissions; translate a non-YouTube page | Apply/restore round-trip; YouTube pages show unsupported guidance |
| Theater / fullscreen overlay | Win / macOS / Linux | Toggle YouTube theater + fullscreen | Caption region stays readable; focus/keyboard chords intact |

Automated substitutes (local fixtures only):

- `apps/extension/e2e/specs/captions.spec.ts`
- `apps/extension/e2e/specs/page-translate.spec.ts`
- `apps/extension/e2e/specs/companion-states.spec.ts`

Run:

```bash
pnpm --filter @language-llm/extension build
pnpm --filter @language-llm/extension-e2e test
```

**External blockers:** Chrome Web Store upload credentials; signed/notarized Tauri secrets;
installed whisper/llama weights for end-to-end ASR/MT quality (mocks never count as release quality).
