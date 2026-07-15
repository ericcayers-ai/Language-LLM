import type {
  AuthHandshakeFailure,
  AuthHandshakeRequest,
  AuthHandshakeResponse,
  AmbiguityEvidence,
  ContextPackage,
  Cue,
  DictionaryEntry,
  FidelityCheckResult,
  JobFailure,
  JobId,
  JobKind,
  JobProgress,
  RevisionId,
  SessionToken,
  SourceTimeline,
  TranslationCue,
  VideoId,
  WsMessage,
  WsMessageType,
} from "./types.js";
import { PROTOCOL_VERSION } from "./version.js";

export function createAuthHandshakeRequest(input: {
  extensionId: string;
  nonce: string;
  requestedAtMs?: number;
}): AuthHandshakeRequest {
  return {
    type: "auth.handshake.request",
    protocolVersion: PROTOCOL_VERSION,
    extensionId: input.extensionId,
    nonce: input.nonce,
    requestedAtMs: input.requestedAtMs ?? Date.now(),
  };
}

export function createAuthHandshakeResponse(input: {
  sessionToken: SessionToken;
  expiresAtMs: number;
  companionBuild?: string;
}): AuthHandshakeResponse {
  return {
    type: "auth.handshake.response",
    protocolVersion: PROTOCOL_VERSION,
    sessionToken: input.sessionToken,
    expiresAtMs: input.expiresAtMs,
    ...(input.companionBuild !== undefined
      ? { companionBuild: input.companionBuild }
      : {}),
    ok: true,
  };
}

export function createAuthHandshakeFailure(input: {
  code: AuthHandshakeFailure["code"];
  message: string;
}): AuthHandshakeFailure {
  return {
    type: "auth.handshake.failure",
    protocolVersion: PROTOCOL_VERSION,
    code: input.code,
    message: input.message,
    ok: false,
  };
}

export function createJobSubmit(input: {
  sessionToken: SessionToken;
  jobId: JobId;
  kind: JobKind;
  videoId: VideoId;
  payload?: Record<string, unknown>;
}): Extract<WsMessage, { type: "job.submit" }> {
  return {
    type: "job.submit",
    sessionToken: input.sessionToken,
    jobId: input.jobId,
    kind: input.kind,
    videoId: input.videoId,
    payload: input.payload ?? {},
  };
}

export function createJobProgress(
  sessionToken: SessionToken,
  progress: JobProgress,
): Extract<WsMessage, { type: "job.progress" }> {
  return { type: "job.progress", sessionToken, progress };
}

export function createJobFailed(
  sessionToken: SessionToken,
  failure: JobFailure,
): Extract<WsMessage, { type: "job.failed" }> {
  return { type: "job.failed", sessionToken, failure };
}

export function createTimelineSource(
  sessionToken: SessionToken,
  timeline: SourceTimeline,
): Extract<WsMessage, { type: "timeline.source" }> {
  return { type: "timeline.source", sessionToken, timeline };
}

export function createTimelineTranslation(input: {
  sessionToken: SessionToken;
  videoId: VideoId;
  cues: TranslationCue[];
  revisionId: RevisionId;
}): Extract<WsMessage, { type: "timeline.translation" }> {
  return {
    type: "timeline.translation",
    sessionToken: input.sessionToken,
    videoId: input.videoId,
    cues: input.cues,
    revisionId: input.revisionId,
  };
}

export function createContextPackageMessage(
  sessionToken: SessionToken,
  context: ContextPackage,
): Extract<WsMessage, { type: "context.package" }> {
  return { type: "context.package", sessionToken, context };
}

export function createFidelityResult(
  sessionToken: SessionToken,
  jobId: JobId,
  result: FidelityCheckResult,
): Extract<WsMessage, { type: "fidelity.result" }> {
  return { type: "fidelity.result", sessionToken, jobId, result };
}

export function createAmbiguityEvidence(
  sessionToken: SessionToken,
  evidence: AmbiguityEvidence,
): Extract<WsMessage, { type: "ambiguity.evidence" }> {
  return { type: "ambiguity.evidence", sessionToken, evidence };
}

export function createLookupResponse(
  sessionToken: SessionToken,
  requestId: string,
  entries: DictionaryEntry[],
): Extract<WsMessage, { type: "lookup.response" }> {
  return { type: "lookup.response", sessionToken, requestId, entries };
}

export function createPageTranslateSubmit(input: {
  sessionToken: SessionToken;
  jobId: JobId;
  request: import("./types.js").PageTranslateRequest;
}): Extract<WsMessage, { type: "page.translate.submit" }> {
  return {
    type: "page.translate.submit",
    sessionToken: input.sessionToken,
    jobId: input.jobId,
    request: input.request,
  };
}

export function createPageTranslateResult(input: {
  sessionToken: SessionToken;
  jobId: JobId;
  results: import("./types.js").PageTranslateSegmentResult[];
  cacheHit?: boolean;
}): Extract<WsMessage, { type: "page.translate.result" }> {
  return {
    type: "page.translate.result",
    sessionToken: input.sessionToken,
    jobId: input.jobId,
    results: input.results,
    cacheHit: input.cacheHit ?? false,
  };
}

export function createLyricsDetect(input: {
  sessionToken: SessionToken;
  requestId: string;
  href: string;
  title?: string;
  channel?: string;
  category?: string;
}): Extract<WsMessage, { type: "lyrics.detect" }> {
  return {
    type: "lyrics.detect",
    sessionToken: input.sessionToken,
    requestId: input.requestId,
    href: input.href,
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.channel !== undefined ? { channel: input.channel } : {}),
    ...(input.category !== undefined ? { category: input.category } : {}),
  };
}

export function createLyricsTimeline(input: {
  sessionToken: SessionToken;
  jobId: JobId;
  timeline: SourceTimeline;
  attribution: import("./types.js").LyricsAttribution;
}): Extract<WsMessage, { type: "lyrics.timeline" }> {
  return {
    type: "lyrics.timeline",
    sessionToken: input.sessionToken,
    jobId: input.jobId,
    timeline: input.timeline,
    attribution: input.attribution,
  };
}

export function isWsMessage(value: unknown): value is WsMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof (value as { type: unknown }).type === "string"
  );
}

export function isWsMessageType<T extends WsMessageType>(
  message: WsMessage,
  type: T,
): message is Extract<WsMessage, { type: T }> {
  return message.type === type;
}

export function isAuthHandshakeRequest(
  value: unknown,
): value is AuthHandshakeRequest {
  return isWsMessage(value) && value.type === "auth.handshake.request";
}

export function isAuthHandshakeResponse(
  value: unknown,
): value is AuthHandshakeResponse {
  return (
    isWsMessage(value) &&
    value.type === "auth.handshake.response" &&
    "ok" in value &&
    value.ok === true
  );
}

export function isAuthHandshakeFailure(
  value: unknown,
): value is AuthHandshakeFailure {
  return (
    isWsMessage(value) &&
    value.type === "auth.handshake.failure" &&
    "ok" in value &&
    value.ok === false
  );
}

export function emptyContextPackage(
  videoId: VideoId,
  sourceCues: Cue[] = [],
): ContextPackage {
  return {
    videoId,
    sourceCues,
    precedingDialogue: [],
    followingDialogue: [],
    speakers: [],
    namedEntities: [],
    terminology: [],
    recurringPhrases: [],
    userGlossary: [],
    unresolvedPronouns: [],
    codeSwitchSpans: [],
    nonSpeechCues: [],
  };
}
