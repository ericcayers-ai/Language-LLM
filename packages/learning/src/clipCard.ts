import type { StudyCard } from "@language-llm/protocol";

const BASE_HEADER = "source,translation,tags,due";
const CLIP_HEADER = `${BASE_HEADER},videoClipStartMs,videoClipEndMs`;

export interface ClippedCard extends StudyCard {
  videoClipStartMs?: number;
  videoClipEndMs?: number;
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function validateClipWindow(c: ClippedCard): void {
  const start = c.videoClipStartMs;
  const end = c.videoClipEndMs;
  if (start == null && end == null) return;
  if (start == null || end == null) {
    throw new Error("videoClipStartMs and videoClipEndMs must both be set");
  }
  if (end <= start) {
    throw new Error(
      `videoClipEndMs (${end}) must be greater than videoClipStartMs (${start})`,
    );
  }
}

/**
 * CSV export with optional clip-anchor columns.
 * When any card has clip timestamps, the header gains `videoClipStartMs,videoClipEndMs`;
 * rows without clips leave those columns blank.
 *
 * For pure legacy CSV without clip support, use `cardsToCsv` from `./fsrs.js`.
 */
export function cardsToCsvWithClips(cards: ClippedCard[]): string {
  for (const c of cards) validateClipWindow(c);

  const hasAnyClip = cards.some(
    (c) => c.videoClipStartMs != null || c.videoClipEndMs != null,
  );

  if (!hasAnyClip) {
    return cards
      .map((c) =>
        [
          csvEscape(c.sourceText),
          csvEscape(c.translationText ?? ""),
          csvEscape(c.tags.join(" ")),
          String(c.fsrs.due),
        ].join(","),
      )
      .join("\n");
  }

  const header = CLIP_HEADER;
  const rows = cards.map((c) => {
    const base = [
      csvEscape(c.sourceText),
      csvEscape(c.translationText ?? ""),
      csvEscape(c.tags.join(" ")),
      String(c.fsrs.due),
    ];
    base.push(c.videoClipStartMs != null ? String(c.videoClipStartMs) : "");
    base.push(c.videoClipEndMs != null ? String(c.videoClipEndMs) : "");
    return base.join(",");
  });
  return [header, ...rows].join("\n");
}

/**
 * Parse a CSV produced by either `cardsToCsv` or `cardsToCsvWithClips`.
 * Returns full `StudyCard` objects with FSRS state; clip fields are optional.
 */
export function parseClipCsv(csv: string): StudyCard[] {
  const lines = csv.split("\n").filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const header = lines[0]!.split(",");
  const hasClip =
    header.includes("videoClipStartMs") && header.includes("videoClipEndMs");
  const idxSource = header.indexOf("source");
  const idxTranslation = header.indexOf("translation");
  const idxTags = header.indexOf("tags");
  const idxDue = header.indexOf("due");
  const idxStart = hasClip ? header.indexOf("videoClipStartMs") : -1;
  const idxEnd = hasClip ? header.indexOf("videoClipEndMs") : -1;
  if (idxSource < 0 || idxDue < 0 || idxTags < 0) {
    throw new Error("csv missing required columns: source, tags, due");
  }

  const out: StudyCard[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i]!.split(",");
    if (cells.length < Math.max(idxSource, idxDue, idxTags) + 1) continue;
    const due = Number(cells[idxDue]);
    if (!Number.isFinite(due)) continue;
    const clipStart =
      hasClip && idxStart >= 0 && cells[idxStart]
        ? Number(cells[idxStart])
        : undefined;
    const clipEnd =
      hasClip && idxEnd >= 0 && cells[idxEnd]
        ? Number(cells[idxEnd])
        : undefined;
    out.push({
      id: `clip:${i}:${(cells[idxSource] ?? "").slice(0, 8)}`,
      sourceText: cells[idxSource] ?? "",
      ...(idxTranslation >= 0 && cells[idxTranslation]
        ? { translationText: cells[idxTranslation] }
        : {}),
      tags: cells[idxTags] ? cells[idxTags].split(" ").filter(Boolean) : [],
      provenance: "user-edit",
      fsrs: {
        due,
        stability: 0,
        difficulty: 0,
        elapsedDays: 0,
        scheduledDays: 0,
        reps: 0,
        lapses: 0,
        state: "new",
      },
      createdAtMs: due,
      updatedAtMs: due,
      ...(clipStart != null && Number.isFinite(clipStart)
        ? { videoClipStartMs: clipStart }
        : {}),
      ...(clipEnd != null && Number.isFinite(clipEnd)
        ? { videoClipEndMs: clipEnd }
        : {}),
    });
  }
  return out;
}
