# Model catalog and weights policy

Local install, digests, and OfflineMock behavior. Attribution notices: [docs/licenses/ATTRIBUTIONS.md](../docs/licenses/ATTRIBUTIONS.md). Maturity labels: [STATUS.md](../STATUS.md).

## Catalog

[`catalog.json`](./catalog.json) is the **signed-ready** source of truth for model identity, task, license class, hardware minimum, backend, and download hints. Live Ed25519 catalog signature verification in production release ops is still **Deferred** — SHA-256 per-pack digests + `.installed` markers are the **Implemented** integrity gate today.

- `commercialDefault: true` packs may be offered without a research license screen.
- `licenseClass: "research-opt-in"` packs (Tower+, NLLB-200, SeamlessM4T, XCOMET, Whale) require an explicit user acknowledgment and are never default-selected.
- `sha256Placeholder` / `sha256:PENDING_*` values must be replaced with **real** digests before production `.installed` markers; unsigned pending digests refuse verified install.

## Install paths (companion model manager)

```
<repo-or-data-root>/
  models/catalog.json
  models/bin/                     # optional whisper-cli / llama-cli binaries
  models/weights/<model-id>/      # weight files written here
  models/weights/<model-id>/.installed  # created only after SHA-256 matches catalog
```

- Dev: companion prefers the **repo root** if `models/catalog.json` is present.
- Packaged: use `LANGUAGE_LLM_DATA_DIR` (defaults under the OS app data dir) and place `models/` beneath it.
- `inference_router::ModelManager::install_bytes` verifies digests; pending `sha256:PENDING_*` placeholders refuse “verified” markers until real hashes are filled in.
- If Whisper / commercial MT weights are absent, routers return `InferenceMode::OfflineMock` (structured stubs — no remote inference).
- Specialist ASR (FireRedASR2S, Qwen3-ASR, Parakeet 0.6B v3, Canary-1B v2, …) returns `RouterError::ModelNotInstalled` when selected but missing — never silent success.

## Drop-in weights (whisper.cpp / llama.cpp)

1. Build or download `whisper-cli` / `llama-cli` and place under `models/bin/` (or set `LANGUAGE_LLM_WHISPER_CLI` / `LANGUAGE_LLM_LLAMA_CLI` to absolute paths).
2. Place a `.gguf` (or pack) under `models/weights/<catalog-model-id>/`.
3. Compute SHA-256 of the weight file and set the catalog digest to `sha256:<hex>` (no `PENDING_` prefix).
4. Run companion model install/verify so `.installed` is written only on match.
5. Restart the companion. `WhisperCppBackend` / `LlamaCppBackend` build real argv (`-m`, `-f` / `-p`) when CLI + weights exist.
6. Integration tests use fake `.cmd` / shell CLIs that echo success so CI stays green without GPUs — those do **not** count as weights-verified product gates.

### Verified digest checklist

```text
# Example (PowerShell): (Get-FileHash model.gguf -Algorithm SHA256).Hash.ToLower()
# Example (Unix): shasum -a 256 model.gguf
# Then: catalog entry sha256Placeholder → "sha256:<lowercase-hex>"
# Confirm: models/weights/<id>/.installed exists after verify
```

Until digests are real, expect **Development fallback** (`OfflineMock`) for commercial Whisper/MT paths and **ModelNotInstalled** for specialists.

## Critical language facts (do not regress)

| Model | Fact |
| --- | --- |
| Parakeet-TDT **0.6B v3** | **25 European languages** |
| Parakeet-TDT **1.1B** | **English-only** |
| Canary-Qwen 2.5B | **English-only** |
| Whale | Research paper only — **no official deployable weights** |

## Weights download policy

1. Weights live under `models/weights/` (gitignored). Never commit `.gguf`, `.onnx`, `.safetensors`, or similar binaries.
2. Network access is allowed only for **explicit** first-time model/dictionary download and signed updates.
3. After download, verify SHA-256 against the catalog entry before enabling the model in the router.
4. Playback and inference must work fully offline once packs are local.
5. Optional NeMo/Python CUDA packs are allowlisted workers, not the cross-platform default path.
6. Catalog rollback is a first-class ops control: pin `catalogVersion` and refuse newer unsigned catalogs.
