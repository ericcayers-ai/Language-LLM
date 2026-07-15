# Model evaluation results

Store reproducible on-device benchmark artifacts here:

- scores (WER / chrF / sync-drift / latency)
- peak memory and thermal notes
- license + model revision
- test corpus fingerprint
- hardware fingerprint (CPU/GPU/RAM/OS)

Do not commit large media fixtures or raw model weights. Prefer compact JSON summary files named `{modelId}__{hardwareFingerprint}__{corpusId}.json`.
