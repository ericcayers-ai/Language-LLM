# Third-party attributions and notices

Application source is MIT ([LICENSE](../../LICENSE)). This file summarizes **notice text operators and About screens should surface**. Upstream licenses are authoritative; re-check revisions pinned in `models/catalog.json` before GA.

Full governance matrix: [model-matrix.md](./model-matrix.md).

## Models (examples of required notices)

| Pack | Notice expectation |
| --- | --- |
| OpenAI Whisper (via whisper.cpp) | Retain MIT copyright / license notices for weights and whisper.cpp |
| Hy-MT2 (Hunyuan MT-2) | Follow Tencent/Hunyuan model-card attribution and redistribution terms; pin SPDX/URL in catalog |
| MADLAD-400 | Apache-2.0 NOTICE / copyright |
| Qwen3.* / Qwen3-ASR | Qwen attribution + license text for the pinned revision |
| NVIDIA Parakeet / Canary | NVIDIA open-model / NGC terms + model-card attribution |
| FireRedASR2S / Moonshine / Gemma | Upstream card + ToU acceptance before download where required |
| Research packs (Tower+, NLLB-200, SeamlessM4T, XCOMET) | Explicit non-commercial / research warning — never default |

Weights are **not** redistributed by this git repository. Digests in catalog must be real SHA-256 values before `.installed` markers in production.

## Dictionaries and lexical data

| Resource | Attribution / share-alike |
| --- | --- |
| JMdict / JMnedict / KANJIDIC2 | EDRDG licence — required attribution in UI About and exports |
| CC-CEDICT | CC BY-SA 4.0 — attribution + share-alike for adaptations |
| Kaikki / Wiktextract / Wiktionary extracts | CC BY-SA — display/export attribution and share-alike notices |
| User Yomitan / StarDict / EPWING imports | User responsibility; preserve embedded license metadata when present |

Dictionary rows live in companion SQLite. Do not upload imports to remote services.

## Fonts / UI

Bundled interface fonts (Atkinson Hyperlegible, IBM Plex Mono, Noto where packaged) retain their SIL OFL / upstream licenses — keep license files with binary distributions.

## LRCLIB

Optional network lyrics fetch must remain **user-enabled**, attributed to LRCLIB / contributing sources per their terms, and never replaced by proprietary lyric-site scrapers.

## How to display

- Extension / desktop **Licenses** or About view should link this file + `model-matrix.md`.
- Mined cards and dictionary exports should carry applicable BY-SA / EDRDG strings.
- CI must reject release bundles that ship default packs without approved license metadata.
