# Phase 10 — Cross-Platform (Decision Memo, Not a Design)

Date: 2026-08-14
Roadmap: [2026-08-14-ecosystem-roadmap.md](../../research/2026-08-14-ecosystem-roadmap.md)

## Status

The roadmap explicitly flags this as "not yet scoped" and recommends treating "should this become a mobile app" as its own decision point after Phases 0–3 ship. This document honors that: it is a decision memo, not a design, and deliberately contains no architecture, because committing to a mobile architecture now — before the core loop (Phases 0–3) has shipped and been used — would be exactly the kind of premature-design-for-hypothetical-future-requirements the ecosystem rules warn against.

## Why this isn't designed yet

Mobile is a genuinely separate platform effort, not a phase that reuses existing code the way Phases 1–9 do:
- The current stack is Tauri (desktop) + browser extension. Neither target compiles to iOS/Android directly.
- A mobile app would need its own capture surfaces (no browser extension equivalent on iOS Safari/Android Chrome without significant platform-specific work) and likely a different UI framework or a Tauri-mobile evaluation.
- Every other phase's "reuse" column points at existing desktop/extension code; Phase 10 would be the first phase where the honest reuse column is mostly empty.

## Decision to make later, and its inputs

When Phases 0–3 have shipped and the core loop (mine → review → see progress) has real usage:
1. Is capture (video/webpage mining) or review the more valuable mobile use case? These likely warrant different platform choices (a lightweight mobile *review-only* client is a much smaller project than full mobile mining).
2. Does Tauri's mobile target (Tauri 2 supports iOS/Android) meet the app's needs, or does mobile need a from-scratch native/React Native build?
3. What fraction of the target user base is mobile-first vs. desktop-first for this specific app's use case (language mining while watching video skews toward desktop/browser; review sessions skew toward mobile)?

## Definition of done for this memo

Captures why Phase 10 is deliberately unscoped and what questions gate scoping it, without inventing an architecture no one has validated is needed. Revisit as its own brainstorming session after Phase 3 ships.
