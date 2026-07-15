/**
 * Shared domain types for the extension ↔ companion protocol.
 * Keep in sync with packages/protocol/rust.
 */

export type VideoId = string;
export type CueId = string;
export type JobId = string;
export type SessionToken = string;
export type RevisionId = string;

export type Provenance =
  | "human-caption"
  | "auto-caption"
  | "asr"
  | "user-edit"
  | "mt"
  | "vlm-corrected"
  | "lyrics-open-api"
  | "lyrics-import"
  | "page-translate";

export type CaptionSourceKind =
  | "human"
  | "auto"
  | "asr-live"
  | "asr-import"
  | "user-edit";

export type HardwareProfile = "lite" | "balanced" | "quality" | "workstation";

export type PowerPolicy = "battery" | "balanced" | "maximum-quality";

export type LanguageTier =
  | "verified"
  | "supported"
  | "experimental"
  | "unavailable";

export type ModelLicenseClass =
  | "commercial-default"
  | "optional"
  | "research-opt-in";

export type JobKind =
  | "asr"
  | "translate"
  | "align"
  | "vlm-review"
  | "lookup"
  | "export"
  | "page-translate"
  | "lyrics-resolve";

export type JobStatus =
  | "queued"
  | "running"
  | "paused"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface Cue {
  id: CueId;
  startMs: number;
  endMs: number;
  text: string;
  speaker?: string;
  provenance: Provenance;
}

/** Immutable source caption/ASR timeline. Derived layers never mutate this. */
export interface SourceTimeline {
  videoId: VideoId;
  cues: Cue[];
  sourceHash: string;
  immutable: true;
  captionSource?: CaptionSourceKind;
  language?: string;
}

export interface TranslationCue {
  id: CueId;
  sourceCueIds: CueId[];
  text: string;
  confidence: number;
  provisional: boolean;
  revisionId: RevisionId;
  startMs?: number;
  endMs?: number;
}

export interface NamedEntity {
  text: string;
  type: string;
  cueIds: CueId[];
  locked?: boolean;
}

export interface GlossaryEntry {
  source: string;
  target: string;
  caseSensitive?: boolean;
  locked?: boolean;
}

export interface CodeSwitchSpan {
  cueId: CueId;
  startOffset: number;
  endOffset: number;
  language: string;
}

export interface NonSpeechCue {
  cueId: CueId;
  kind: "laughter" | "music" | "applause" | "silence" | "sound-event" | "other";
  label: string;
}

/**
 * Compact local context object built for every translation job.
 * @see plan §6 Canonical context package
 */
export interface ContextPackage {
  videoId: VideoId;
  sourceCues: Cue[];
  precedingDialogue: Cue[];
  followingDialogue: Cue[];
  speakers: string[];
  namedEntities: NamedEntity[];
  terminology: GlossaryEntry[];
  recurringPhrases: string[];
  userGlossary: GlossaryEntry[];
  genre?: string;
  title?: string;
  description?: string;
  detectedDialect?: string;
  register?: string;
  unresolvedPronouns: string[];
  codeSwitchSpans: CodeSwitchSpan[];
  nonSpeechCues: NonSpeechCue[];
}

export interface JobProgress {
  jobId: JobId;
  kind: JobKind;
  status: JobStatus;
  fraction: number;
  message?: string;
  cueCount?: number;
  updatedAtMs: number;
}

export interface JobFailure {
  jobId: JobId;
  kind: JobKind;
  code: string;
  message: string;
  retryable: boolean;
}

export interface AuthHandshakeRequest {
  type: "auth.handshake.request";
  protocolVersion: string;
  extensionId: string;
  nonce: string;
  requestedAtMs: number;
}

export interface AuthHandshakeResponse {
  type: "auth.handshake.response";
  protocolVersion: string;
  sessionToken: SessionToken;
  expiresAtMs: number;
  companionBuild?: string;
  ok: true;
}

export interface AuthHandshakeFailure {
  type: "auth.handshake.failure";
  protocolVersion: string;
  code: "version-mismatch" | "origin-rejected" | "rate-limited" | "internal";
  message: string;
  ok: false;
}

export type FidelityCheckKind =
  | "missing-number"
  | "extra-number"
  | "missing-name"
  | "extra-name"
  | "url-mismatch"
  | "unit-mismatch"
  | "negation"
  | "punctuation-intent"
  | "cue-count"
  | "empty-output"
  | "script-mismatch"
  | "timing-readability"
  | "other";

export interface FidelityCheckResult {
  ok: boolean;
  checks: Array<{
    kind: FidelityCheckKind;
    passed: boolean;
    detail?: string;
    cueIds?: CueId[];
  }>;
  score: number;
}

export interface AmbiguityEvidence {
  id: string;
  cueIds: CueId[];
  reason: string;
  confidence: number;
  frameRefs?: string[];
  ocrText?: string;
  vlmAnswer?: string;
  resolved?: boolean;
}

export interface LexemeSense {
  id: string;
  glosses: string[];
  pos?: string[];
  examples?: string[];
  register?: string;
  tags?: string[];
}

export interface DictionaryEntry {
  id: string;
  lemma: string;
  language: string;
  readings?: string[];
  pronunciations?: string[];
  senses: LexemeSense[];
  frequency?: number;
  etymology?: string;
  source: string;
  license: string;
  attribution?: string;
}

export interface FsrsState {
  due: number;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  state: "new" | "learning" | "review" | "relearning";
  lastReview?: number;
}

export interface StudyCard {
  id: string;
  videoId?: VideoId;
  sourceText: string;
  translationText?: string;
  cueIds?: CueId[];
  definitionIds?: string[];
  tags: string[];
  provenance: Provenance;
  fsrs: FsrsState;
  createdAtMs: number;
  updatedAtMs: number;
}

/** Discriminated WebSocket messages exchanged over loopback. */
export type WsMessage =
  | AuthHandshakeRequest
  | AuthHandshakeResponse
  | AuthHandshakeFailure
  | {
      type: "session.ping";
      sessionToken: SessionToken;
      atMs: number;
    }
  | {
      type: "session.pong";
      sessionToken: SessionToken;
      atMs: number;
    }
  | {
      type: "job.submit";
      sessionToken: SessionToken;
      jobId: JobId;
      kind: JobKind;
      videoId: VideoId;
      payload: Record<string, unknown>;
    }
  | {
      type: "job.cancel";
      sessionToken: SessionToken;
      jobId: JobId;
    }
  | {
      type: "job.progress";
      sessionToken: SessionToken;
      progress: JobProgress;
    }
  | {
      type: "job.result";
      sessionToken: SessionToken;
      jobId: JobId;
      kind: JobKind;
      result: unknown;
    }
  | {
      type: "job.failed";
      sessionToken: SessionToken;
      failure: JobFailure;
    }
  | {
      type: "timeline.source";
      sessionToken: SessionToken;
      timeline: SourceTimeline;
    }
  | {
      type: "timeline.translation";
      sessionToken: SessionToken;
      videoId: VideoId;
      cues: TranslationCue[];
      revisionId: RevisionId;
    }
  | {
      type: "context.package";
      sessionToken: SessionToken;
      context: ContextPackage;
    }
  | {
      type: "fidelity.result";
      sessionToken: SessionToken;
      jobId: JobId;
      result: FidelityCheckResult;
    }
  | {
      type: "ambiguity.evidence";
      sessionToken: SessionToken;
      evidence: AmbiguityEvidence;
    }
  | {
      type: "lookup.request";
      sessionToken: SessionToken;
      requestId: string;
      language: string;
      surface: string;
      cueId?: CueId;
    }
  | {
      type: "lookup.response";
      sessionToken: SessionToken;
      requestId: string;
      entries: DictionaryEntry[];
    }
  | {
      type: "export.request";
      sessionToken: SessionToken;
      jobId: JobId;
      format: "srt" | "vtt" | "json" | "anki";
      videoId: VideoId;
    }
  | {
      type: "page.translate.submit";
      sessionToken: SessionToken;
      jobId: JobId;
      request: PageTranslateRequest;
    }
  | {
      type: "page.translate.result";
      sessionToken: SessionToken;
      jobId: JobId;
      results: PageTranslateSegmentResult[];
      cacheHit: boolean;
    }
  | {
      type: "page.translate.cache.clear";
      sessionToken: SessionToken;
      canonicalUrl?: string;
    }
  | {
      type: "lyrics.detect";
      sessionToken: SessionToken;
      requestId: string;
      href: string;
      title?: string;
      channel?: string;
      category?: string;
    }
  | {
      type: "lyrics.resolve";
      sessionToken: SessionToken;
      jobId: JobId;
      query: LyricsResolveQuery;
      allowNetworkOpenApi: boolean;
    }
  | {
      type: "lyrics.timeline";
      sessionToken: SessionToken;
      jobId: JobId;
      timeline: SourceTimeline;
      attribution: LyricsAttribution;
    }
  | {
      type: "lyrics.import";
      sessionToken: SessionToken;
      jobId: JobId;
      format: "lrc" | "ttml" | "plain";
      content: string;
      videoId?: VideoId;
    }
  | {
      type: "lyrics.clear-cache";
      sessionToken: SessionToken;
      videoId?: VideoId;
    }
  | {
      type: "error";
      sessionToken?: SessionToken;
      code: string;
      message: string;
      fatal?: boolean;
    };

export type PageTranslateMode = "original" | "translated" | "dual";

export interface PageSegment {
  id: string;
  path: string;
  originalText: string;
  textHash: string;
}

export interface PageTranslateRequest {
  url: string;
  canonicalUrl: string;
  sourceLang: string;
  targetLang: string;
  modelId: string;
  modelRevision: string;
  segments: PageSegment[];
  mode: PageTranslateMode;
}

export interface PageTranslateSegmentResult {
  id: string;
  translatedText: string;
  confidence: number;
  provisional: boolean;
}

export type LyricsSourceKind =
  | "page-caption"
  | "page-embedded"
  | "lrclib"
  | "user-import"
  | "asr";

export interface LyricsAttribution {
  source: LyricsSourceKind;
  provider?: string;
  url?: string;
  fetchedAtMs?: number;
  licenseNote?: string;
}

export interface LyricsResolveQuery {
  videoId?: VideoId;
  title: string;
  artist?: string;
  album?: string;
  durationMs?: number;
  treatAsSong?: boolean;
}

export interface SongDetectionResult {
  isSong: boolean;
  confidence: number;
  reasons: string[];
}

export type WsMessageType = WsMessage["type"];
