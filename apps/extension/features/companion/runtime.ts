/**
 * Lightweight extension↔background messaging helpers shared by popup,
 * side panel, and content scripts. Keeps chrome.runtime calls testable.
 */

export type CompanionPingResult = {
  ok: boolean;
  /** WebSocket session established (not native-bootstrap-only). */
  ready: boolean;
  /** Native host responded but WS is down — clearly degraded. */
  degraded: boolean;
  port?: number;
  error?: string;
};

export type RetentionPreset = "session" | "days7" | "days30" | "keep";

export type PrivacyWipeScope =
  | "all"
  | "transcripts"
  | "translations"
  | "lyrics"
  | "page-cache"
  | "study"
  | "dictionaries";

export type RuntimeSend = (
  message: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

const defaultSend: RuntimeSend = (message) =>
  new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      resolve((response as Record<string, unknown>) ?? { ok: false });
    });
  });

/** Normalize companion.ping responses into ready / degraded / down. */
export function interpretCompanionPing(
  res: Record<string, unknown> | undefined | null,
): CompanionPingResult {
  if (!res || res.ok !== true) {
    return {
      ok: false,
      ready: false,
      degraded: false,
      ...(typeof res?.error === "string" ? { error: res.error } : {}),
    };
  }
  // Native-only bootstrap without WS is not "ready".
  if (res.ws === false || (res.bootstrap && !res.port && res.ws !== true)) {
    return {
      ok: true,
      ready: false,
      degraded: true,
      ...(typeof res.port === "number" ? { port: res.port } : {}),
    };
  }
  return {
    ok: true,
    ready: true,
    degraded: false,
    ...(typeof res.port === "number" ? { port: res.port } : {}),
  };
}

/** Upper bound on a companion.ping round trip so the UI never hangs
 *  indefinitely if the background worker or native host never responds. */
const PING_TIMEOUT_MS = 10_000;

export async function pingCompanion(
  send: RuntimeSend = defaultSend,
): Promise<CompanionPingResult> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<Record<string, unknown>>((resolve) => {
    timer = setTimeout(
      () => resolve({ ok: false, error: "Companion ping timed out" }),
      PING_TIMEOUT_MS,
    );
  });
  const res = await Promise.race([send({ type: "companion.ping" }), timeout]);
  clearTimeout(timer!);
  return interpretCompanionPing(res);
}

export async function setRetention(
  preset: RetentionPreset,
  send: RuntimeSend = defaultSend,
): Promise<{ ok: boolean; error?: string; result?: unknown }> {
  const res = await send({ type: "retention.set", preset });
  return {
    ok: res.ok === true,
    ...(typeof res.error === "string" ? { error: res.error } : {}),
    ...(res.result !== undefined ? { result: res.result } : {}),
  };
}

export async function getRetention(
  send: RuntimeSend = defaultSend,
): Promise<{ ok: boolean; preset?: RetentionPreset; error?: string }> {
  const res = await send({ type: "retention.get" });
  const result = res.result as { preset?: RetentionPreset } | undefined;
  return {
    ok: res.ok === true,
    ...(result?.preset ? { preset: result.preset } : {}),
    ...(typeof res.error === "string" ? { error: res.error } : {}),
  };
}

export async function wipePrivacy(
  scope: PrivacyWipeScope,
  send: RuntimeSend = defaultSend,
): Promise<{ ok: boolean; error?: string; result?: unknown }> {
  const res = await send({ type: "privacy.wipe", scope });
  return {
    ok: res.ok === true,
    ...(typeof res.error === "string" ? { error: res.error } : {}),
    ...(res.result !== undefined ? { result: res.result } : {}),
  };
}

export async function hydrateTimeline(
  videoId: string,
  sourceHash?: string,
  send: RuntimeSend = defaultSend,
): Promise<{
  ok: boolean;
  timeline?: unknown;
  translation?: unknown;
  error?: string;
}> {
  const res = await send({
    type: "timeline.hydrate",
    videoId,
    ...(sourceHash !== undefined ? { sourceHash } : {}),
  });
  if (res.ok !== true) {
    return {
      ok: false,
      ...(typeof res.error === "string" ? { error: res.error } : {}),
    };
  }
  const result = res.result as
    | { timeline?: unknown; translation?: unknown }
    | undefined;
  return {
    ok: true,
    ...(result?.timeline !== undefined ? { timeline: result.timeline } : {}),
    ...(result?.translation !== undefined
      ? { translation: result.translation }
      : {}),
  };
}

export async function lookupDictionary(
  surface: string,
  send: RuntimeSend = defaultSend,
): Promise<{
  ok: boolean;
  entries: Array<{
    id: string;
    dictionaryId: string;
    surface: string;
    reading?: string;
    glossaryJson?: string;
  }>;
  error?: string;
}> {
  const res = await send({ type: "dictionary.lookup", surface });
  if (res.ok !== true) {
    return {
      ok: false,
      entries: [],
      ...(typeof res.error === "string" ? { error: res.error } : {}),
    };
  }
  const result = res.result as
    | {
        entries?: Array<{
          id: string;
          dictionaryId: string;
          surface: string;
          reading?: string;
          glossaryJson?: string;
        }>;
      }
    | undefined;
  return {
    ok: true,
    entries: Array.isArray(result?.entries) ? result.entries : [],
  };
}

export async function importDictionary(
  input: {
    id: string;
    name: string;
    language: string;
    license: string;
    entries: Array<{
      id: string;
      surface: string;
      reading?: string;
      glossaryJson?: string;
    }>;
  },
  send: RuntimeSend = defaultSend,
): Promise<{ ok: boolean; imported?: number; error?: string }> {
  const res = await send({
    type: "dictionary.import",
    ...input,
  });
  if (res.ok !== true) {
    return {
      ok: false,
      ...(typeof res.error === "string" ? { error: res.error } : {}),
    };
  }
  const result = res.result as { imported?: number } | undefined;
  return {
    ok: true,
    imported:
      typeof result?.imported === "number" ? result.imported : input.entries.length,
  };
}

export async function dictionaryStats(
  send: RuntimeSend = defaultSend,
): Promise<{ ok: boolean; dictionaries?: number; entries?: number; error?: string }> {
  const res = await send({ type: "dictionary.stats" });
  if (res.ok !== true) {
    return {
      ok: false,
      ...(typeof res.error === "string" ? { error: res.error } : {}),
    };
  }
  const result = res.result as
    | { dictionaries?: number; entries?: number }
    | undefined;
  return {
    ok: true,
    ...(typeof result?.dictionaries === "number"
      ? { dictionaries: result.dictionaries }
      : {}),
    ...(typeof result?.entries === "number" ? { entries: result.entries } : {}),
  };
}

/** Map language-kit lexicon entries into companion dictionary.import rows. */
export function lexiconToCompanionEntries(
  entries: Array<{
    id: string;
    lemma: string;
    readings?: string[];
    senses: Array<{ glosses: string[] }>;
  }>,
  limit = 5_000,
): Array<{
  id: string;
  surface: string;
  reading?: string;
  glossaryJson?: string;
}> {
  return entries.slice(0, limit).map((e) => {
    const reading = e.readings?.[0];
    const glosses = e.senses.flatMap((s) => s.glosses);
    return {
      id: e.id,
      surface: e.lemma,
      ...(reading ? { reading } : {}),
      glossaryJson: JSON.stringify(glosses),
    };
  });
}

/** Format companion lookup hit for UI display. */
export function formatLookupHit(entry: {
  surface: string;
  reading?: string;
  glossaryJson?: string;
}): string {
  let gloss = "";
  if (entry.glossaryJson) {
    try {
      const parsed = JSON.parse(entry.glossaryJson) as unknown;
      if (Array.isArray(parsed)) gloss = parsed.join("; ");
      else if (typeof parsed === "string") gloss = parsed;
    } catch {
      gloss = entry.glossaryJson;
    }
  }
  const reading = entry.reading ? ` [${entry.reading}]` : "";
  return gloss
    ? `${entry.surface}${reading}: ${gloss}`
    : `${entry.surface}${reading}`;
}
