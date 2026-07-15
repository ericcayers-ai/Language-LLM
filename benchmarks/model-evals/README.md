# Model / hardware evaluation artifacts

Store reproducible on-device benchmark artifacts here.

## Classification (mandatory)

Every artifact JSON **must** include:

```json
{
  "classification": "on-device | mock | fixture-metric-smoke | synthetic-harness",
  "countsTowardReleaseQuality": false,
  "modelId": "...",
  "hardwareFingerprint": "...",
  "corpusId": "...",
  "scores": {}
}
```

| classification | countsTowardReleaseQuality | Meaning |
| --- | --- | --- |
| `on-device` | **true only when true** | Real weights + real corpus on named hardware; human/pair notes optional but preferred |
| `fixture-metric-smoke` | **false** | Synthetic strings exercising WER/chrF plumbing (see `benchmarks/suites/*`) |
| `synthetic-harness` | **false** | Deterministic offline-mock / OfflineMock adapter output |
| `mock` | **false** | Explicit development stubs — never ship as “Verified” language evidence |

**Rule:** mocks and fixture-metric-smoke **never** count toward release quality or Verified language tiers.

## File naming

Prefer `{modelId}__{hardwareFingerprint}__{corpusId}.json`.

Do not commit large media fixtures or raw model weights.

## Checked-in examples

- `examples/fixture-metric-smoke.sample.json` — documents the smoke class only
- Real `on-device` results are added by humans/CI with weights installed
