# ADR-004: Store-safe song lyrics

- Status: Accepted
- Date: 2026-07-16

## Context

Users want reliable karaoke-synced lyrics on YouTube Music / song videos. Scraping proprietary lyric sites (Genius, Musixmatch, etc.) fails Chrome Web Store review and copyright norms.

## Decision

Compliant priority only:

1. Page captions / embedded lyrics already in the session
2. Open APIs such as LRCLIB with mandatory attribution and clearable local cache (user-initiated or explicit auto-fetch preference)
3. User LRC / TTML / plain import
4. User-initiated local ASR last

Karaoke highlighting reuses shared cue/overlay/transcript primitives. Never fabricate word-level timing. Forbidden: proprietary scrapers, BotGuard circumvention, Premium download claims.

## Consequences

- `@language-llm/lyrics` owns parsers, detection heuristics, LRCLIB client contract, karaoke clock helpers.
- Protocol messages: `lyrics.detect|resolve|import|timeline|clear-cache`.
- Attribution metadata retained beside cached lyrics documents.
