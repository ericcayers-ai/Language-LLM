# ADR-003: In-place website translation

- Status: Accepted
- Date: 2026-07-16

## Context

Users want Google Translate–like webpage translation. Remote MT APIs would violate the local-only product contract. DOM rewriting must preserve layout/interactivity and remain Chrome Web Store safe (minimal host permissions).

## Decision

1. Ship `@language-llm/page-translate` for safe text-node segmentation, restore tables, URL+model cache keys, and Original / Translated / Dual modes.
2. Reuse the same local MT router (Hy-MT2 / MADLAD / Qwen3.5 review) as video translation via protocol job kind `page-translate`.
3. Prefer `activeTab` + explicit “Translate this page”; use `optional_host_permissions` only for always-on sites the user opts into.
4. Page text never leaves the device for MT. Network is only for model/dictionary install and signed updates.
5. Dictionary / word-inspector / learning suite operate on page tokens through shared language-kits offsets.

## Consequences

- Extension gains a runtime-registered page-translate content script.
- Companion stores page translation cache clearable per URL or globally.
- Privacy policy and in-product copy must disclose on-device page-text processing.
