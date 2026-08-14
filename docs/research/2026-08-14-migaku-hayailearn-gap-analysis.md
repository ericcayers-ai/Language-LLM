# Gap Analysis: Language-LLM vs. Migaku & HayaiLearn

Date: 2026-08-14

## What this app already has

Mapped via the project's graphify knowledge graph (`.graphify/graph.json`), not assumed:

- **SRS**: FSRS scheduler (`packages/learning/src/fsrs.ts` — `reviewFsrs()`, `createInitialFsrs()`, `constrainingStability()`, `clampDifficulty()`), known-word tracker, AnkiConnect export (`addNotesViaAnkiConnect()`, `cardsToCsv()`)
- **Dictionaries**: JMdict, CC-CEDICT, and kaikki.org adapters (`packages/language-kits/src/adapters/{jmdict,import,kaikki}.ts`), dictionary import/lookup/stats over the companion WS protocol
- **Language tooling**: furigana attachment + ruby annotation (`attachFurigana`, `toRubyPairs`), pinyin with tone marks (`attachPinyin`, `numberedToToneMarked`), Hangul romanization (`attachHangulRomanization`) — Japanese/Chinese/Korean kits exist as first-class modules
- **Subtitle/caption capture**: YouTube player-response scraping, json3/srv3/vtt timedtext parsers, source routing between caption formats, Netflix support (per recent commit), caption overlay UI with provenance labels
- **Page translation**: DOM segmenter + applier with caching, toolbar UI, roundtrip tests — works on arbitrary web pages, not just video
- **ASR**: local Whisper-backed ASR router with backend discovery, specialist model selection, offline mock fallback
- **MT**: MT routing with fidelity checks (chrF, edit distance, number/URL preservation), VLM ambiguity gate for visual disambiguation of MT output
- **Lyrics**: LRC-based karaoke sync, LRCLib resolution, song detection
- **Local-first model infra**: model catalog/manager, hardware detection (RAM, disk estimates), license validation, offline-capable — this is architecturally deeper than either competitor, which are cloud-API-dependent
- **Desktop companion**: Tauri app with WS server, job registry for async captures, privacy wipe, storage/hardware/models/updates views
- **Density/theming, accessibility**: dedicated `DensityProvider`, accessibility benchmark suite

This is a stronger technical foundation than either Migaku or HayaiLearn in one specific way: **local/offline AI inference** (ASR, MT) — neither competitor does this; both are cloud-API products.

## Where Migaku and HayaiLearn are ahead

| Area | Migaku | HayaiLearn | This app |
|---|---|---|---|
| One-click mining → flashcard (screenshot+audio+sentence auto-captured) | Yes | Yes (video-linked) | No dedicated card-creator UI found |
| Built-in SRS review UI (not just scheduler) | Yes ("Migaku Memory") | Yes (video-replay review) | FSRS engine exists; no review UI surfaced in graph |
| Card templates / cloze generation | Yes (Anki cloze helper, custom templates) | Basic | Not found |
| Ebook/PDF/text reader | Yes (alpha, epub/html/txt/rtf) | No | Not found |
| TTS read-along | Yes | N/A | Not found |
| Comprehension/"i+1" scoring per content | Yes | Difficulty 1–10 rating | Not found |
| Immersion stats dashboard (streaks, known-word count) | Partial | Yes (XP per skill, streaks) | Known-word tracker exists; no dashboard UI found |
| OCR (books, games) / Clipboard interactive text | Yes | No | Not found |
| Local video file / podcast mining | Yes (Local Player, beta) | Roadmap only | Not confirmed |
| AI roleplay/shadowing with pronunciation grading | No | Yes | Not found |
| Multi-site subtitle support (Disney+, Viki, iQIYI, Bilibili) | Yes | YouTube + Netflix only | YouTube + Netflix confirmed |

## Recommended priority order (highest leverage first)

1. **Card-creator + review UI** — the FSRS engine and dictionary lookups already exist; the missing piece is the UI loop that turns a caption click into a saved card with screenshot+audio+sentence, plus a review screen. This is the single biggest gap and the core of both competitors' value prop.
2. **Stats dashboard** — known-word tracker already exists server-side; surfacing streaks/known-words/immersion time as a view is comparatively cheap and high visibility.
3. **Reader (text/epub) with the same lookup/mining pipeline** — page-translate segmenter infrastructure is reusable; extending it to imported text/epub content is a natural next step and is a real gap for both competitors (HayaiLearn has none, Migaku's is alpha).
4. **Cloze card templates + richer Anki export** — AnkiConnect export exists; template/cloze customization is additive.
5. **TTS read-along** — needs a TTS backend decision (local model vs. none); lower priority since neither text mining nor review UI exist yet to attach it to.
6. **OCR/Clipboard interactive text** and **local video/podcast mining** — larger scope, treat as later phases once the core mining/review loop ships.
7. **AI roleplay/shadowing** — distinctive HayaiLearn feature but high effort (speech grading) and orthogonal to the core mining loop; good candidate for a dedicated future spec.

## Explicit non-recommendations

- Don't chase multi-site subtitle parity (Disney+/Viki/iQIYI/Bilibili) before the mining/review loop exists — it multiplies surface area for a workflow that doesn't have an endpoint yet.
- Don't build a second SRS engine — FSRS is already implemented and is the more modern algorithm (Migaku's own scheduler is undocumented/unconfirmed, HayaiLearn's is proprietary/unknown); extend what's here.
