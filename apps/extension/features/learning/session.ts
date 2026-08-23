import type { PerWordStatus, StudyCard, WordStatus } from "@language-llm/protocol";
import {
  cardsToCsv,
  createKnownWordTracker,
  createStudyCard,
  isKnown,
  markKnown,
  noteEncounter,
  reviewFsrs,
  type KnownWordTracker,
} from "@language-llm/learning";

export interface StudySessionSnapshot {
  cards: StudyCard[];
  knownWords: string[];
  wordStatus: PerWordStatus[];
}

export interface StudySessionStore {
  load(): Promise<StudySessionSnapshot>;
  save(snapshot: StudySessionSnapshot): Promise<void>;
}

const STORAGE_KEY = "language-llm.study";

/** chrome.storage.local offline cache (prefs + conflict-safe mirror). */
export function createChromeStudyStore(
  storage: {
    get: (keys: string | string[]) => Promise<Record<string, unknown>>;
    set: (items: Record<string, unknown>) => Promise<void>;
  } = {
    get: (keys) =>
      new Promise((resolve) => {
        chrome.storage.local.get(keys, (result) =>
          resolve(result as Record<string, unknown>),
        );
      }),
    set: (items) =>
      new Promise((resolve, reject) => {
        chrome.storage.local.set(items, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve();
        });
      }),
  },
): StudySessionStore {
  return {
    async load() {
      const raw = await storage.get(STORAGE_KEY);
      const data = raw[STORAGE_KEY] as StudySessionSnapshot | undefined;
      return {
        cards: Array.isArray(data?.cards) ? data.cards : [],
        knownWords: Array.isArray(data?.knownWords) ? data.knownWords : [],
        wordStatus: Array.isArray(data?.wordStatus) ? data.wordStatus : [],
      };
    },
    async save(snapshot) {
      await storage.set({ [STORAGE_KEY]: snapshot });
    },
  };
}

/**
 * Companion SQLite is the study authority when connected.
 * Falls back to the provided offline store on failure (conflict-safe merge on next hydrate).
 */
export function createCompanionStudyStore(
  offline: StudySessionStore = createChromeStudyStore(),
  send: (
    message: Record<string, unknown>,
  ) => Promise<{ ok: boolean; result?: unknown; error?: string }> = (message) =>
    new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        resolve(
          (response as { ok: boolean; result?: unknown; error?: string }) ?? {
            ok: false,
            error: "no-response",
          },
        );
      });
    }),
): StudySessionStore {
  return {
    async load() {
      try {
        const res = await send({
          type: "study.sync",
          op: "list",
          kind: "study-session",
        });
        if (res.ok && res.result) {
          const payload = extractStudyPayload(res.result);
          if (payload) {
            await offline.save(payload);
            return payload;
          }
        }
      } catch {
        // fall through to offline
      }
      return offline.load();
    },
    async save(snapshot) {
      await offline.save(snapshot);
      try {
        await send({
          type: "study.sync",
          op: "put",
          kind: "study-session",
          id: "session",
          payload: snapshot as unknown as Record<string, unknown>,
        });
      } catch {
        // Offline mirror already saved; companion catches up on next connect.
      }
    },
  };
}

function extractStudyPayload(result: unknown): StudySessionSnapshot | null {
  if (typeof result !== "object" || result === null) return null;
  const root = result as Record<string, unknown>;
  // Unwrap study.sync.result WS envelope when present.
  const inner =
    root.type === "study.sync.result" && typeof root.result === "object"
      ? (root.result as Record<string, unknown>)
      : root;

  if (inner.payload && typeof inner.payload === "object") {
    const payload = inner.payload as StudySessionSnapshot;
    if (Array.isArray(payload.cards)) {
      return {
        cards: payload.cards,
        knownWords: Array.isArray(payload.knownWords)
          ? payload.knownWords
          : [],
        wordStatus: Array.isArray(payload.wordStatus)
          ? payload.wordStatus
          : [],
      };
    }
  }

  const items = inner.items;
  if (Array.isArray(items)) {
    for (const item of items) {
      if (typeof item !== "object" || item === null) continue;
      const row = item as {
        id?: string;
        payload?: StudySessionSnapshot | string;
        payload_json?: string;
        payloadJson?: string;
      };
      if (row.id && row.id !== "session") continue;
      if (row.payload && typeof row.payload === "object") {
        const payload = row.payload as StudySessionSnapshot;
        if (Array.isArray(payload.cards)) {
          return {
            cards: payload.cards,
            knownWords: Array.isArray(payload.knownWords)
              ? payload.knownWords
              : [],
            wordStatus: Array.isArray(payload.wordStatus)
              ? payload.wordStatus
              : [],
          };
        }
      }
      const raw =
        typeof row.payload === "string"
          ? row.payload
          : (row.payload_json ?? row.payloadJson);
      if (typeof raw === "string") {
        try {
          const parsed = JSON.parse(raw) as StudySessionSnapshot;
          if (Array.isArray(parsed.cards)) {
            return {
              cards: parsed.cards,
              knownWords: Array.isArray(parsed.knownWords)
                ? parsed.knownWords
                : [],
              wordStatus: Array.isArray(parsed.wordStatus)
                ? parsed.wordStatus
                : [],
            };
          }
        } catch {
          /* continue */
        }
      }
    }
  }
  return null;
}

/** In-memory store for unit tests. */
export function createMemoryStudyStore(
  initial: StudySessionSnapshot = { cards: [], knownWords: [], wordStatus: [] },
): StudySessionStore {
  let snap = structuredClone(initial);
  return {
    async load() {
      return structuredClone(snap);
    },
    async save(next) {
      snap = structuredClone(next);
    },
  };
}

export class StudySession {
  private cards: StudyCard[] = [];
  private tracker: KnownWordTracker = createKnownWordTracker();
  private wordStatus: Map<string, PerWordStatus> = new Map();

  constructor(private readonly store: StudySessionStore) {}

  async hydrate(): Promise<void> {
    const snap = await this.store.load();
    this.cards = snap.cards;
    this.tracker = createKnownWordTracker(snap.knownWords);
    this.wordStatus = new Map(
      (snap.wordStatus ?? []).map((w) => [w.surface.toLowerCase(), w]),
    );
  }

  private async persist(): Promise<void> {
    await this.store.save({
      cards: this.cards,
      knownWords: [...this.tracker.known],
      wordStatus: [...this.wordStatus.values()],
    });
  }

  private bumpWordStatus(surface: string, now: number): PerWordStatus {
    const key = surface.toLowerCase();
    const prev = this.wordStatus.get(key);
    const status: WordStatus = prev?.status ?? "unknown";
    const next: PerWordStatus = {
      surface,
      status,
      encounters: (prev?.encounters ?? 0) + 1,
      updatedAtMs: now,
    };
    this.wordStatus.set(key, next);
    return next;
  }

  listWordStatus(): PerWordStatus[] {
    return [...this.wordStatus.values()];
  }

  listCards(): StudyCard[] {
    return [...this.cards];
  }

  dueCards(now = Date.now()): StudyCard[] {
    return this.cards.filter((c) => c.fsrs.due <= now);
  }

  /**
   * One-action sentence mining from the active cue.
   */
  async mineSentence(input: {
    sourceText: string;
    translationText?: string;
    videoId?: string;
    tags?: string[];
    videoClipStartMs?: number;
    videoClipEndMs?: number;
  }): Promise<StudyCard> {
    const id = `mine:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();
    const card = createStudyCard({
      id,
      sourceText: input.sourceText,
      ...(input.translationText !== undefined
        ? { translationText: input.translationText }
        : {}),
      ...(input.videoId !== undefined ? { videoId: input.videoId } : {}),
      tags: input.tags ?? ["mined"],
      provenance: "user-edit",
    });
    const perWord: PerWordStatus[] = [];
    for (const token of tokenizeSurfaces(input.sourceText)) {
      noteEncounter(this.tracker, token);
      perWord.push(this.bumpWordStatus(token, now));
    }
    this.cards.push({
      ...card,
      ...(input.videoClipStartMs !== undefined
        ? { videoClipStartMs: input.videoClipStartMs }
        : {}),
      ...(input.videoClipEndMs !== undefined
        ? { videoClipEndMs: input.videoClipEndMs }
        : {}),
      ...(perWord.length > 0 ? { perWord } : {}),
    });
    await this.persist();
    return this.cards[this.cards.length - 1]!;
  }

  async review(cardId: string, rating: 1 | 2 | 3 | 4, now = Date.now()): Promise<StudyCard | null> {
    const idx = this.cards.findIndex((c) => c.id === cardId);
    if (idx < 0) return null;
    const card = this.cards[idx]!;
    const next: StudyCard = {
      ...card,
      fsrs: reviewFsrs(card.fsrs, rating, now),
      updatedAtMs: now,
    };
    this.cards[idx] = next;
    await this.persist();
    return next;
  }

  async markSurfaceKnown(surface: string): Promise<void> {
    markKnown(this.tracker, surface);
    const now = Date.now();
    const key = surface.toLowerCase();
    const prev = this.wordStatus.get(key);
    this.wordStatus.set(key, {
      surface,
      status: "known",
      encounters: prev?.encounters ?? 0,
      updatedAtMs: now,
    });
    await this.persist();
  }

  isSurfaceKnown(surface: string): boolean {
    return isKnown(this.tracker, surface);
  }

  exportCsv(): string {
    return cardsToCsv(this.cards);
  }
}

function tokenizeSurfaces(text: string): string[] {
  return text
    .split(/[\s\p{P}]+/u)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}
