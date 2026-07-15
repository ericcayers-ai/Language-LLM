import type { FsrsState, StudyCard } from "@language-llm/protocol";

export type ListeningMode =
  | "subtitles-on"
  | "translation-on-demand"
  | "blur-until-reveal"
  | "pause-after-cue"
  | "hide-known-words"
  | "audio-only";

export function createInitialFsrs(now = Date.now()): FsrsState {
  return {
    due: now,
    stability: 0,
    difficulty: 5,
    elapsedDays: 0,
    scheduledDays: 0,
    reps: 0,
    lapses: 0,
    state: "new",
  };
}

/**
 * Minimal local FSRS-inspired scheduler stub.
 * TODO(weights): replace interval math with full FSRS-5 once review UI ships numbers from paper.
 */
export function reviewFsrs(
  state: FsrsState,
  rating: 1 | 2 | 3 | 4,
  now = Date.now(),
): FsrsState {
  const next = { ...state };
  next.reps += 1;
  next.lastReview = now;
  if (rating === 1) {
    next.lapses += 1;
    next.state = "relearning";
    next.scheduledDays = 0;
    next.due = now + 10 * 60 * 1000;
    next.stability = Math.max(0.1, next.stability * 0.5);
    return next;
  }
  const ease = rating === 2 ? 1 : rating === 3 ? 2.5 : 4;
  next.stability = Math.max(0.5, next.stability * ease + 0.5);
  next.scheduledDays = Math.max(1, Math.round(next.stability));
  next.due = now + next.scheduledDays * 24 * 60 * 60 * 1000;
  next.state = "review";
  next.difficulty = Math.min(
    10,
    Math.max(1, next.difficulty + (rating === 2 ? 0.2 : rating === 4 ? -0.2 : 0)),
  );
  return next;
}

export function createStudyCard(input: {
  id: string;
  sourceText: string;
  translationText?: string;
  videoId?: string;
  tags?: string[];
  provenance?: StudyCard["provenance"];
}): StudyCard {
  const now = Date.now();
  return {
    id: input.id,
    ...(input.videoId !== undefined ? { videoId: input.videoId } : {}),
    sourceText: input.sourceText,
    ...(input.translationText !== undefined
      ? { translationText: input.translationText }
      : {}),
    tags: input.tags ?? [],
    provenance: input.provenance ?? "user-edit",
    fsrs: createInitialFsrs(now),
    createdAtMs: now,
    updatedAtMs: now,
  };
}

export interface KnownWordTracker {
  known: Set<string>;
  encounters: Map<string, number>;
}

export function createKnownWordTracker(
  known: string[] = [],
): KnownWordTracker {
  return {
    known: new Set(known.map((w) => w.toLowerCase())),
    encounters: new Map(),
  };
}

export function noteEncounter(
  tracker: KnownWordTracker,
  surface: string,
): void {
  const key = surface.toLowerCase();
  tracker.encounters.set(key, (tracker.encounters.get(key) ?? 0) + 1);
}

export function markKnown(tracker: KnownWordTracker, surface: string): void {
  tracker.known.add(surface.toLowerCase());
}

export function isKnown(tracker: KnownWordTracker, surface: string): boolean {
  return tracker.known.has(surface.toLowerCase());
}

/** CSV export for Anki/CSV workflows without requiring AnkiConnect. */
export function cardsToCsv(cards: StudyCard[]): string {
  const header = "source,translation,tags,due";
  const rows = cards.map((c) =>
    [
      csvEscape(c.sourceText),
      csvEscape(c.translationText ?? ""),
      csvEscape(c.tags.join(" ")),
      String(c.fsrs.due),
    ].join(","),
  );
  return [header, ...rows].join("\n");
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export interface AnkiConnectNote {
  deckName: string;
  modelName: string;
  fields: { Front: string; Back: string };
  tags: string[];
}

export function toAnkiConnectNotes(
  cards: StudyCard[],
  deckName = "Language-LLM",
): AnkiConnectNote[] {
  return cards.map((c) => ({
    deckName,
    modelName: "Basic",
    fields: {
      Front: c.sourceText,
      Back: c.translationText ?? "",
    },
    tags: c.tags,
  }));
}

/** Optional AnkiConnect handshake payload — never called unless user enables. */
export function ankiConnectRequest(
  action: string,
  params: Record<string, unknown> = {},
): { action: string; version: 6; params: Record<string, unknown> } {
  return { action, version: 6, params };
}
