import type { StudyCard } from "@language-llm/protocol";
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
}

export interface StudySessionStore {
  load(): Promise<StudySessionSnapshot>;
  save(snapshot: StudySessionSnapshot): Promise<void>;
}

const STORAGE_KEY = "language-llm.study";

/** chrome.storage.local backed store (extension). */
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
      };
    },
    async save(snapshot) {
      await storage.set({ [STORAGE_KEY]: snapshot });
    },
  };
}

/** In-memory store for unit tests. */
export function createMemoryStudyStore(
  initial: StudySessionSnapshot = { cards: [], knownWords: [] },
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

  constructor(private readonly store: StudySessionStore) {}

  async hydrate(): Promise<void> {
    const snap = await this.store.load();
    this.cards = snap.cards;
    this.tracker = createKnownWordTracker(snap.knownWords);
  }

  private async persist(): Promise<void> {
    await this.store.save({
      cards: this.cards,
      knownWords: [...this.tracker.known],
    });
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
  }): Promise<StudyCard> {
    const id = `mine:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
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
    for (const token of tokenizeSurfaces(input.sourceText)) {
      noteEncounter(this.tracker, token);
    }
    this.cards.push(card);
    await this.persist();
    return card;
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
