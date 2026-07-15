import type { FsrsState, StudyCard } from "@language-llm/protocol";

export type ListeningMode =
  | "subtitles-on"
  | "translation-on-demand"
  | "blur-until-reveal"
  | "pause-after-cue"
  | "hide-known-words"
  | "audio-only";

/**
 * FSRS-5 default weights (open-spaced-repetition reference).
 * Used for local scheduling; companion may persist resulting FsrsState blobs.
 */
export const FSRS_DEFAULT_WEIGHTS: readonly number[] = [
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575,
  0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655,
  0.6621,
];

const DECAY = -0.5;
const FACTOR = 19 / 81;
const MS_PER_DAY = 86_400_000;

export type FsrsRating = 1 | 2 | 3 | 4;

export function createInitialFsrs(now = Date.now()): FsrsState {
  return {
    due: now,
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    reps: 0,
    lapses: 0,
    state: "new",
  };
}

function clampDifficulty(d: number): number {
  return Math.min(10, Math.max(1, d));
}

function constrainingStability(s: number): number {
  return Math.max(0.1, s);
}

function initStability(w: readonly number[], rating: FsrsRating): number {
  return constrainingStability(w[rating - 1]!);
}

function initDifficulty(w: readonly number[], rating: FsrsRating): number {
  return clampDifficulty(w[4]! - Math.exp((rating - 1) * w[5]!) + 1);
}

function nextDifficulty(
  w: readonly number[],
  d: number,
  rating: FsrsRating,
): number {
  const next = d - w[6]! * (rating - 3);
  const meanReversion = w[7]! * initDifficulty(w, 3) + (1 - w[7]!) * next;
  return clampDifficulty(meanReversion);
}

function nextStabilitySuccess(
  w: readonly number[],
  d: number,
  s: number,
  r: number,
  rating: FsrsRating,
): number {
  const hardPenalty = rating === 2 ? w[15]! : 1;
  const easyBonus = rating === 4 ? w[16]! : 1;
  return constrainingStability(
    s *
      (Math.exp(w[8]!) *
        (11 - d) *
        Math.pow(s, -w[9]!) *
        (Math.exp((1 - r) * w[10]!) - 1) *
        hardPenalty *
        easyBonus +
        1),
  );
}

function nextStabilityFail(
  w: readonly number[],
  d: number,
  s: number,
  r: number,
): number {
  return constrainingStability(
    w[11]! *
      Math.pow(d, -w[12]!) *
      (Math.pow(s + 1, w[13]!) - 1) *
      Math.exp((1 - r) * w[14]!),
  );
}

/** Retrievability after `elapsedDays` given stability S (FSRS-5). */
export function retrievability(stability: number, elapsedDays: number): number {
  if (stability <= 0) return 0;
  return Math.pow(1 + (FACTOR * elapsedDays) / stability, DECAY);
}

function nextIntervalDays(stability: number, requestRetention = 0.9): number {
  const raw =
    (stability / FACTOR) * (Math.pow(requestRetention, 1 / DECAY) - 1);
  return Math.max(1, Math.round(raw));
}

/**
 * FSRS-5 review scheduler against reference weights.
 * Rating: 1=Again, 2=Hard, 3=Good, 4=Easy.
 */
export function reviewFsrs(
  state: FsrsState,
  rating: FsrsRating,
  now = Date.now(),
  weights: readonly number[] = FSRS_DEFAULT_WEIGHTS,
  requestRetention = 0.9,
): FsrsState {
  const w = weights.length >= 19 ? weights : FSRS_DEFAULT_WEIGHTS;
  const last = state.lastReview ?? now;
  const elapsedDays =
    state.state === "new"
      ? 0
      : Math.max(0, (now - last) / MS_PER_DAY);

  const next: FsrsState = { ...state };
  next.reps += 1;
  next.lastReview = now;
  next.elapsedDays = elapsedDays;

  if (state.state === "new") {
    next.difficulty = initDifficulty(w, rating);
    next.stability = initStability(w, rating);
    if (rating === 1) {
      next.lapses += 1;
      next.state = "relearning";
      next.scheduledDays = 0;
      next.due = now + 10 * 60 * 1000;
      return next;
    }
    next.state = "review";
    next.scheduledDays = nextIntervalDays(next.stability, requestRetention);
    next.due = now + next.scheduledDays * MS_PER_DAY;
    return next;
  }

  const r = retrievability(state.stability, elapsedDays);
  next.difficulty = nextDifficulty(w, state.difficulty || 5, rating);

  if (rating === 1) {
    next.lapses += 1;
    next.stability = nextStabilityFail(
      w,
      next.difficulty,
      Math.max(0.1, state.stability),
      r,
    );
    next.state = "relearning";
    next.scheduledDays = 0;
    next.due = now + 10 * 60 * 1000;
    return next;
  }

  next.stability = nextStabilitySuccess(
    w,
    next.difficulty,
    Math.max(0.1, state.stability),
    r,
    rating,
  );
  next.state = "review";
  next.scheduledDays = nextIntervalDays(next.stability, requestRetention);
  next.due = now + next.scheduledDays * MS_PER_DAY;
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

const ANKI_CONNECT_DEFAULT = "http://127.0.0.1:8765";

/**
 * Opt-in AnkiConnect probe. Call only after explicit user permission;
 * discloses localhost contact. Returns false on network failure.
 */
export async function testAnkiConnect(
  endpoint = ANKI_CONNECT_DEFAULT,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; version?: number; error?: string }> {
  try {
    const res = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ankiConnectRequest("version")),
    });
    if (!res.ok) {
      return { ok: false, error: `http-${res.status}` };
    }
    const body = (await res.json()) as { result?: number; error?: string };
    if (body.error) return { ok: false, error: body.error };
    return { ok: true, ...(body.result !== undefined ? { version: body.result } : {}) };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Add notes via AnkiConnect when enabled; otherwise caller should fall back to CSV/JSON.
 */
export async function addNotesViaAnkiConnect(
  cards: StudyCard[],
  options: {
    endpoint?: string;
    deckName?: string;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<{ ok: boolean; noteIds?: number[]; error?: string }> {
  const endpoint = options.endpoint ?? ANKI_CONNECT_DEFAULT;
  const fetchImpl = options.fetchImpl ?? fetch;
  const notes = toAnkiConnectNotes(cards, options.deckName).map((n) => ({
    deckName: n.deckName,
    modelName: n.modelName,
    fields: n.fields,
    tags: n.tags,
  }));
  try {
    const res = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ankiConnectRequest("addNotes", { notes })),
    });
    if (!res.ok) return { ok: false, error: `http-${res.status}` };
    const body = (await res.json()) as {
      result?: Array<number | null>;
      error?: string;
    };
    if (body.error) return { ok: false, error: body.error };
    const noteIds = (body.result ?? []).filter(
      (id): id is number => typeof id === "number",
    );
    return { ok: true, noteIds };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
