import { z } from "zod";
import { PROTOCOL_VERSION } from "./version.js";

export const provenanceSchema = z.enum([
  "human-caption",
  "auto-caption",
  "asr",
  "user-edit",
  "mt",
  "vlm-corrected",
  "lyrics-open-api",
  "lyrics-import",
  "page-translate",
]);

export const jobKindSchema = z.enum([
  "asr",
  "translate",
  "align",
  "vlm-review",
  "lookup",
  "export",
  "page-translate",
  "lyrics-resolve",
]);

export const jobStatusSchema = z.enum([
  "queued",
  "running",
  "paused",
  "succeeded",
  "failed",
  "cancelled",
]);

export const cueSchema = z
  .object({
    id: z.string().min(1),
    startMs: z.number().nonnegative(),
    endMs: z.number().nonnegative(),
    text: z.string(),
    speaker: z.string().optional(),
    provenance: provenanceSchema,
  })
  .refine((c) => c.endMs > c.startMs, {
    message: "endMs must be greater than startMs",
  });

export const authHandshakeRequestSchema = z.object({
  type: z.literal("auth.handshake.request"),
  protocolVersion: z.string().min(1),
  extensionId: z.string().min(1),
  nonce: z.string().min(16),
  requestedAtMs: z.number().int().nonnegative(),
});

export const authHandshakeResponseSchema = z.object({
  type: z.literal("auth.handshake.response"),
  protocolVersion: z.string().min(1),
  sessionToken: z.string().min(32),
  expiresAtMs: z.number().int().positive(),
  companionBuild: z.string().optional(),
  ok: z.literal(true),
});

export const authHandshakeFailureSchema = z.object({
  type: z.literal("auth.handshake.failure"),
  protocolVersion: z.string().min(1),
  code: z.enum([
    "version-mismatch",
    "origin-rejected",
    "rate-limited",
    "internal",
  ]),
  message: z.string(),
  ok: z.literal(false),
});

export const jobProgressSchema = z.object({
  jobId: z.string().min(1),
  kind: jobKindSchema,
  status: jobStatusSchema,
  fraction: z.number().min(0).max(1),
  message: z.string().optional(),
  cueCount: z.number().int().nonnegative().optional(),
  updatedAtMs: z.number().int().nonnegative(),
});

export const jobSubmitSchema = z.object({
  type: z.literal("job.submit"),
  sessionToken: z.string().min(32),
  jobId: z.string().min(1),
  kind: jobKindSchema,
  videoId: z.string().min(1),
  payload: z.record(z.unknown()),
});

export const sourceTimelineSchema = z.object({
  videoId: z.string().min(1),
  cues: z.array(cueSchema),
  sourceHash: z.string().min(1),
  immutable: z.literal(true),
  captionSource: z
    .enum(["human", "auto", "asr-live", "asr-import", "user-edit"])
    .optional(),
  language: z.string().optional(),
  developmentFallback: z.boolean().optional(),
});

export const timelineSourceMessageSchema = z.object({
  type: z.literal("timeline.source"),
  sessionToken: z.string().min(32),
  timeline: sourceTimelineSchema,
});

export const translationCueSchema = z.object({
  id: z.string().min(1),
  sourceCueIds: z.array(z.string().min(1)).min(1),
  text: z.string(),
  confidence: z.number().min(0).max(1),
  provisional: z.boolean(),
  revisionId: z.string().min(1),
  startMs: z.number().nonnegative().optional(),
  endMs: z.number().nonnegative().optional(),
});

export const retentionPresetSchema = z.enum([
  "session",
  "days7",
  "days30",
  "keep",
]);

export const privacyWipeScopeSchema = z.enum([
  "all",
  "transcripts",
  "translations",
  "lyrics",
  "page-cache",
  "study",
  "dictionaries",
]);

export const criticalWsMessageSchema = z.discriminatedUnion("type", [
  authHandshakeRequestSchema,
  authHandshakeResponseSchema,
  authHandshakeFailureSchema,
  jobSubmitSchema,
  timelineSourceMessageSchema,
  z.object({
    type: z.literal("privacy.wipe"),
    sessionToken: z.string().min(32),
    scope: privacyWipeScopeSchema,
  }),
  z.object({
    type: z.literal("retention.set"),
    sessionToken: z.string().min(32),
    preset: retentionPresetSchema,
  }),
  z.object({
    type: z.literal("timeline.hydrate"),
    sessionToken: z.string().min(32),
    videoId: z.string().min(1),
    sourceHash: z.string().optional(),
  }),
  z.object({
    type: z.literal("study.sync"),
    sessionToken: z.string().min(32),
    op: z.enum(["put", "get", "list", "delete"]),
    kind: z.string().optional(),
    id: z.string().optional(),
    payload: z.record(z.unknown()).optional(),
  }),
  z.object({
    type: z.literal("dictionary.lookup"),
    sessionToken: z.string().min(32),
    surface: z.string().min(1),
  }),
  z.object({
    type: z.literal("job.progress"),
    sessionToken: z.string().min(32),
    progress: jobProgressSchema,
  }),
  z.object({
    type: z.literal("error"),
    sessionToken: z.string().min(32).optional(),
    code: z.string().min(1),
    message: z.string(),
    fatal: z.boolean().optional(),
  }),
]);

export function parseCriticalWsMessage(input: unknown) {
  return criticalWsMessageSchema.safeParse(input);
}

export function assertProtocolVersion(version: string): void {
  authHandshakeRequestSchema.shape.protocolVersion.parse(version);
  if (version.split(".")[0] !== PROTOCOL_VERSION.split(".")[0]) {
    throw new Error(
      `Incompatible protocol major: got ${version}, expected ${PROTOCOL_VERSION}`,
    );
  }
}
