import { LYRICS_SOURCE_PRIORITY } from "@language-llm/lyrics";

/** Lyrics policy suite — proprietary scrapers must never appear. */
export function lyricsPriorityIsStoreSafe(): boolean {
  const banned = ["genius", "musixmatch", "lyricfind"];
  return (
    !LYRICS_SOURCE_PRIORITY.some((s) =>
      banned.some((b) => String(s).includes(b)),
    ) && LYRICS_SOURCE_PRIORITY[0] === "page-caption"
  );
}
