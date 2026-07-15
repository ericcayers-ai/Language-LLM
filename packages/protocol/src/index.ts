export { PROTOCOL_VERSION } from "./version.js";
export type { ProtocolVersion } from "./version.js";

export type * from "./types.js";

export {
  createAuthHandshakeRequest,
  createAuthHandshakeResponse,
  createAuthHandshakeFailure,
  createJobSubmit,
  createJobProgress,
  createJobFailed,
  createTimelineSource,
  createTimelineTranslation,
  createContextPackageMessage,
  createFidelityResult,
  createAmbiguityEvidence,
  createLookupResponse,
  createPageTranslateSubmit,
  createPageTranslateResult,
  createLyricsDetect,
  createLyricsTimeline,
  createPrivacyWipe,
  createRetentionSet,
  createTimelineHydrate,
  createStudySync,
  createDictionaryLookup,
  isWsMessage,
  isWsMessageType,
  isAuthHandshakeRequest,
  isAuthHandshakeResponse,
  isAuthHandshakeFailure,
  emptyContextPackage,
} from "./messages.js";

export {
  randomHex,
  createSessionToken,
  createNonce,
  validateHandshakeRequest,
  isSessionToken,
  isHandshakeResponseValid,
} from "./auth.js";
export type {
  HandshakeValidationOk,
  HandshakeValidationErr,
} from "./auth.js";

export {
  cueDurationMs,
  charactersPerSecond,
  cuesOverlap,
  overlapMs,
  clampCueTiming,
  mergeAdjacentCues,
  cuesAtTime,
  shiftCue,
  meanSyncDriftMs,
} from "./cue-math.js";

export {
  parseSemver,
  versionsCompatible,
  checkVersionSkew,
  isClientAhead,
} from "./compatibility.js";
export type { VersionParts, VersionSkew } from "./compatibility.js";

export {
  provenanceSchema,
  jobKindSchema,
  jobStatusSchema,
  cueSchema,
  authHandshakeRequestSchema,
  authHandshakeResponseSchema,
  authHandshakeFailureSchema,
  jobProgressSchema,
  jobSubmitSchema,
  sourceTimelineSchema,
  timelineSourceMessageSchema,
  translationCueSchema,
  retentionPresetSchema,
  privacyWipeScopeSchema,
  criticalWsMessageSchema,
  parseCriticalWsMessage,
  assertProtocolVersion,
} from "./schemas.js";
