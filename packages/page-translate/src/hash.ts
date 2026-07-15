/** Stable FNV-1a 32-bit hash for cache keys (browser + node). */
export function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function segmentCacheKey(input: {
  canonicalUrl: string;
  modelId: string;
  modelRevision: string;
  sourceLang: string;
  targetLang: string;
  textHash: string;
}): string {
  return [
    input.canonicalUrl,
    input.modelId,
    input.modelRevision,
    input.sourceLang,
    input.targetLang,
    input.textHash,
  ].join("|");
}

export function canonicalUrl(href: string): string {
  try {
    const u = new URL(href);
    u.hash = "";
    // Drop common tracking params
    for (const key of [...u.searchParams.keys()]) {
      if (
        key.startsWith("utm_") ||
        key === "fbclid" ||
        key === "gclid" ||
        key === "si"
      ) {
        u.searchParams.delete(key);
      }
    }
    return u.toString();
  } catch {
    return href;
  }
}
