import type { PageTranslateMode } from "@language-llm/protocol";
import {
  RestoreTable,
  buildAppliedMap,
  canonicalUrl,
  coalesceMutations,
  collectTextSegments,
  mockTranslateSegment,
  resolveDisplayText,
} from "@language-llm/page-translate";

export interface PageTranslateController {
  setMode: (mode: PageTranslateMode) => void;
  translateNow: (targetLang: string) => Promise<void>;
  restore: () => void;
  destroy: () => void;
  getMode: () => PageTranslateMode;
}

/**
 * In-page website translator. Uses activeTab / optional hosts.
 * All MT is local (mock until companion models are installed).
 * MutationObserver re-applies after SPA navigations when translated.
 */
export function createPageTranslateController(
  doc: Document = document,
): PageTranslateController {
  let mode: PageTranslateMode = "original";
  let restore = new RestoreTable();
  let results: Array<{
    id: string;
    translatedText: string;
    confidence: number;
    provisional: boolean;
  }> = [];
  let targetLang = "en";
  let observer: MutationObserver | undefined;
  let applying = false;

  const applyToDom = () => {
    if (mode === "original") return;
    applying = true;
    try {
      const applied = buildAppliedMap(mode, restore, results);
      const byPath = new Map<string, string>();
      for (const seg of applied) {
        const entry = restore.get(seg.id);
        if (entry) byPath.set(entry.path, seg.displayText);
      }
      const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
      let n: Node | null;
      while ((n = walker.nextNode())) {
        const text = n as Text;
        if (!text.parentElement) continue;
        const path = pathForTextNode(text);
        const display = byPath.get(path);
        if (display != null && text.textContent !== display) {
          const entry = [...restore.originals().entries()].find(
            ([id]) => restore.get(id)?.path === path,
          );
          const original = entry?.[1] ?? text.textContent ?? "";
          const resolved = resolveDisplayText(
            mode,
            original,
            display,
          );
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

  const translateNow = async (lang: string) => {
    targetLang = lang;
    const { segments, restore: entries } = collectTextSegments(doc.body, {
      skipCodePre: true,
    });
    restore = new RestoreTable(entries);
    results = segments.map((s) => ({
      id: s.id,
      translatedText: mockTranslateSegment(s.originalText, targetLang),
      confidence: 0.7,
      provisional: true,
    }));
    mode = "translated";
    applyToDom();
  };

  const restoreOriginal = () => {
    applying = true;
    try {
      const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
      let n: Node | null;
      while ((n = walker.nextNode())) {
        const text = n as Text;
        const path = pathForTextNode(text);
        for (const [id, original] of restore.originals()) {
          if (restore.get(id)?.path === path) {
            text.textContent = original;
            text.parentElement?.removeAttribute("title");
            text.parentElement?.removeAttribute("data-llm-original");
            break;
          }
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

    applying = true;
    try {
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
          const translatedText = mockTranslateSegment(
            s.originalText,
            targetLang,
          );
          results.push({
            id: s.id,
            translatedText,
            confidence: 0.7,
            provisional: true,
          });
        }
        root.setAttribute?.("data-llm-page-translated", "1");
      }
      applyToDom();
    } finally {
      applying = false;
    }
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
  };
}

export function pageCacheScope(href: string): string {
  return canonicalUrl(href);
}

/** Stable path matching packages/page-translate segmenter shape. */
function pathForTextNode(node: Text): string {
  const parts: Array<{ tag: string; index: number }> = [{ tag: "ROOT", index: 0 }];
  const chain: Node[] = [];
  let cur: Node | null = node;
  while (cur && cur !== document.documentElement) {
    chain.push(cur);
    cur = cur.parentNode;
  }
  chain.reverse();
  for (const c of chain) {
    const parent = c.parentNode;
    if (!parent) continue;
    const index = Array.prototype.indexOf.call(parent.childNodes, c);
    const tag =
      c.nodeType === Node.ELEMENT_NODE
        ? (c as Element).tagName
        : "#text";
    parts.push({ tag, index });
  }
  return parts.map((p) => `${p.index}.${p.tag}`).join("/");
}
