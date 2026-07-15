import type {
  PageSegment,
  PageTranslateMode,
  PageTranslateSegmentResult,
} from "@language-llm/protocol";
import {
  RestoreTable,
  absoluteNodePath,
  buildAppliedMap,
  canonicalUrl,
  coalesceMutations,
  collectTextSegments,
  isDevelopmentMtFallbackAllowed,
  mockTranslateSegment,
  resolveDisplayText,
} from "@language-llm/page-translate";

export interface PageTranslateSubmitResponse {
  ok: true;
  results: PageTranslateSegmentResult[];
}

export interface PageTranslateSubmitError {
  ok: false;
  error: string;
}

export type PageTranslateSubmitResult =
  | PageTranslateSubmitResponse
  | PageTranslateSubmitError;

export type TranslateSegmentsFn = (
  segments: PageSegment[],
  targetLang: string,
  canonicalUrl: string,
) => Promise<PageTranslateSegmentResult[]>;

export interface PageTranslateControllerOptions {
  /** Injectable MT for tests; defaults to companion via background worker. */
  translateSegments?: TranslateSegmentsFn;
}

export interface PageTranslateController {
  setMode: (mode: PageTranslateMode) => void;
  translateNow: (targetLang: string) => Promise<void>;
  restore: () => void;
  destroy: () => void;
  getMode: () => PageTranslateMode;
  getLastError: () => string | undefined;
  /** True when the last applied batch used a labeled provisional/dev fallback. */
  lastWasProvisional: () => boolean;
  /**
   * Why the last batch was provisional:
   * - `companion-mock`: OfflineMock from companion (weights missing)
   * - `dev-fallback`: local [dev] mock when companion was unavailable
   * - `none`: committed / non-provisional
   */
  lastProvisionalSource: () => "none" | "companion-mock" | "dev-fallback";
}

/**
 * In-page website translator. Uses activeTab / optional hosts.
 * MT routes through the companion; dev-only mock fallback when companion fails.
 * MutationObserver re-applies after SPA navigations when translated.
 */
export function createPageTranslateController(
  doc: Document = document,
  options: PageTranslateControllerOptions = {},
): PageTranslateController {
  let mode: PageTranslateMode = "original";
  let restore = new RestoreTable();
  let results: PageTranslateSegmentResult[] = [];
  let targetLang = "en";
  let lastError: string | undefined;
  let observer: MutationObserver | undefined;
  let applying = false;
  let lastProvisionalSource: "none" | "companion-mock" | "dev-fallback" =
    "none";

  const translateSegments =
    options.translateSegments ?? defaultTranslateSegments;

  const applyToDom = () => {
    if (mode === "original") return;
    applying = true;
    try {
      const applied = buildAppliedMap(mode, restore, results);
      const displayByPath = new Map<string, string>();
      for (const seg of applied) {
        const entry = restore.get(seg.id);
        if (entry) displayByPath.set(entry.path, seg.displayText);
      }
      const originalsByPath = restore.originalsByPath();
      const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
      let n: Node | null;
      while ((n = walker.nextNode())) {
        const text = n as Text;
        if (!text.parentElement) continue;
        const path = absoluteNodePath(text);
        const display = displayByPath.get(path);
        if (display != null && text.textContent !== display) {
          const original = originalsByPath.get(path) ?? text.textContent ?? "";
          const resolved = resolveDisplayText(mode, original, display);
          text.textContent = resolved.text;
          if (resolved.title && text.parentElement) {
            text.parentElement.setAttribute("title", resolved.title);
            text.parentElement.setAttribute("data-llm-original", original);
          }
        }
      }
    } finally {
      applying = false;
    }
  };

  const runTranslation = async (
    segments: PageSegment[],
    lang: string,
  ): Promise<PageTranslateSegmentResult[]> => {
    const url = canonicalUrl(doc.location?.href ?? "");
    try {
      const batch = await translateSegments(segments, lang, url);
      lastProvisionalSource = batch.some((r) => r.provisional)
        ? "companion-mock"
        : "none";
      return batch;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (isDevelopmentMtFallbackAllowed()) {
        lastProvisionalSource = "dev-fallback";
        return segments.map((s) => ({
          id: s.id,
          translatedText: mockTranslateSegment(s.originalText, lang),
          confidence: 0.7,
          provisional: true,
        }));
      }
      lastProvisionalSource = "none";
      throw new Error(message);
    }
  };

  const translateNow = async (lang: string) => {
    targetLang = lang;
    lastError = undefined;
    const { segments, restore: entries } = collectTextSegments(doc.body, {
      skipCodePre: true,
    });
    restore = new RestoreTable(entries);
    try {
      results = await runTranslation(segments, targetLang);
      mode = "translated";
      applyToDom();
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      results = [];
      throw e;
    }
  };

  const restoreOriginal = () => {
    applying = true;
    try {
      const originalsByPath = restore.originalsByPath();
      const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
      let n: Node | null;
      while ((n = walker.nextNode())) {
        const text = n as Text;
        const path = absoluteNodePath(text);
        const original = originalsByPath.get(path);
        if (original != null) {
          text.textContent = original;
          text.parentElement?.removeAttribute("title");
          text.parentElement?.removeAttribute("data-llm-original");
        }
      }
      mode = "original";
    } finally {
      applying = false;
    }
  };

  const onMutations = coalesceMutations((records) => {
    if (mode === "original" || applying) return;
    const addedRoots: Element[] = [];
    for (const r of records) {
      if (r.type !== "childList") continue;
      r.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          addedRoots.push(node as Element);
        } else if (node.nodeType === Node.TEXT_NODE && node.parentElement) {
          addedRoots.push(node.parentElement);
        }
      });
    }
    if (!addedRoots.length) return;

    void (async () => {
      applying = true;
      try {
        const newSegments: PageSegment[] = [];
        for (const root of addedRoots) {
          if (
            root.closest?.("[data-llm-page-translated]") ||
            root.hasAttribute?.("data-llm-page-translated")
          ) {
            continue;
          }
          const { segments, restore: entries } = collectTextSegments(root, {
            skipCodePre: true,
          });
          for (const e of entries) restore.set(e);
          for (const s of segments) {
            if (results.some((r) => r.id === s.id)) continue;
            newSegments.push(s);
          }
          root.setAttribute?.("data-llm-page-translated", "1");
        }
        if (newSegments.length) {
          try {
            const batch = await runTranslation(newSegments, targetLang);
            results.push(...batch);
          } catch (e) {
            lastError = e instanceof Error ? e.message : String(e);
          }
        }
        applyToDom();
      } finally {
        applying = false;
      }
    })();
  });

  observer = new MutationObserver(onMutations);
  observer.observe(doc.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  return {
    setMode: (m) => {
      mode = m;
      if (m === "original") restoreOriginal();
      else applyToDom();
    },
    translateNow,
    restore: restoreOriginal,
    destroy: () => observer?.disconnect(),
    getMode: () => mode,
    getLastError: () => lastError,
    lastWasProvisional: () => lastProvisionalSource !== "none",
    lastProvisionalSource: () => lastProvisionalSource,
  };
}

export function pageCacheScope(href: string): string {
  return canonicalUrl(href);
}

async function defaultTranslateSegments(
  segments: PageSegment[],
  targetLang: string,
  canonicalUrlValue: string,
): Promise<PageTranslateSegmentResult[]> {
  const response = (await chrome.runtime.sendMessage({
    type: "page-translate.submit",
    targetLang,
    segments,
    canonicalUrl: canonicalUrlValue,
  })) as PageTranslateSubmitResult | undefined;
  if (response?.ok) return response.results;
  throw new Error(response?.error ?? "page-translate.submit failed");
}
