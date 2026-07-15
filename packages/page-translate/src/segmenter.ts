import type { PageSegment } from "@language-llm/protocol";
import { fnv1a } from "./hash.js";

const SKIP_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "TEXTAREA",
  "INPUT",
  "SELECT",
  "OPTION",
  "CODE",
  "PRE",
  "SVG",
  "MATH",
  "IFRAME",
]);

export interface DomSegmentOptions {
  skipCodePre?: boolean;
  includeContentEditable?: boolean;
  minLength?: number;
}

export interface RestoreEntry {
  segmentId: string;
  originalText: string;
  path: string;
}

/**
 * Pure path builder used by tests and by the DOM walker.
 * Path form: `BODY/0.DIV/1.P/0#text`
 */
export function buildNodePath(indices: Array<{ tag: string; index: number }>): string {
  return indices.map((p) => `${p.index}.${p.tag}`).join("/");
}

/**
 * Absolute DOM path from a live node up to (but not including) documentElement.
 * Matches apply/restore walkers; always includes BODY when the node is in body.
 */
export function absoluteNodePath(node: Node): string {
  const parts: Array<{ tag: string; index: number }> = [{ tag: "ROOT", index: 0 }];
  const chain: Node[] = [];
  const stop = node.ownerDocument?.documentElement ?? null;
  let cur: Node | null = node;
  while (cur && cur !== stop) {
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
  return buildNodePath(parts);
}

export function shouldSkipElement(
  tagName: string,
  opts: DomSegmentOptions = {},
): boolean {
  const tag = tagName.toUpperCase();
  if (SKIP_TAGS.has(tag)) {
    if (
      (tag === "CODE" || tag === "PRE") &&
      opts.skipCodePre === false
    ) {
      return false;
    }
    return true;
  }
  return false;
}

export function makeSegment(
  path: string,
  originalText: string,
): PageSegment | null {
  const trimmed = originalText.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  const textHash = fnv1a(trimmed);
  return {
    id: `seg_${fnv1a(path + ":" + textHash)}`,
    path,
    originalText: trimmed,
    textHash,
  };
}

/**
 * Segment plain text blocks (no DOM) — used by unit tests and workers.
 * Splits on blank lines / sentence-ish boundaries while keeping ids stable.
 */
export function segmentPlainBlocks(
  blocks: Array<{ path: string; text: string }>,
  minLength = 1,
): PageSegment[] {
  const out: PageSegment[] = [];
  for (const block of blocks) {
    const seg = makeSegment(block.path, block.text);
    if (seg && seg.originalText.length >= minLength) out.push(seg);
  }
  return out;
}

/**
 * Walk a Document-like tree. Accepts minimal interface so jsdom/happy-dom
 * or real documents work. Returns segments + restore table.
 */
export function collectTextSegments(
  root: ParentNode,
  opts: DomSegmentOptions = {},
): { segments: PageSegment[]; restore: RestoreEntry[] } {
  const segments: PageSegment[] = [];
  const restore: RestoreEntry[] = [];
  const minLength = opts.minLength ?? 1;

  const walk = (node: Node, pathParts: Array<{ tag: string; index: number }>) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      if (shouldSkipElement(el.tagName, opts)) return;
      if (
        el.getAttribute("contenteditable") === "true" &&
        !opts.includeContentEditable
      ) {
        return;
      }
      let childIndex = 0;
      for (const child of Array.from(el.childNodes)) {
        const tag =
          child.nodeType === Node.ELEMENT_NODE
            ? (child as Element).tagName
            : "#text";
        walk(child, [...pathParts, { tag, index: childIndex }]);
        childIndex += 1;
      }
      return;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? "";
      const path =
        node.ownerDocument != null
          ? absoluteNodePath(node)
          : buildNodePath(pathParts);
      const seg = makeSegment(path, text);
      if (seg && seg.originalText.length >= minLength) {
        segments.push(seg);
        restore.push({
          segmentId: seg.id,
          originalText: text,
          path,
        });
      }
    }
  };

  walk(root as unknown as Node, [{ tag: "ROOT", index: 0 }]);
  return { segments, restore };
}

export class RestoreTable {
  private byId = new Map<string, RestoreEntry>();

  constructor(entries: RestoreEntry[] = []) {
    for (const e of entries) this.byId.set(e.segmentId, e);
  }

  set(entry: RestoreEntry): void {
    this.byId.set(entry.segmentId, entry);
  }

  get(id: string): RestoreEntry | undefined {
    return this.byId.get(id);
  }

  originals(): Map<string, string> {
    const m = new Map<string, string>();
    for (const [id, e] of this.byId) m.set(id, e.originalText);
    return m;
  }

  /** Fast path-keyed lookup for live DOM apply/restore. */
  originalsByPath(): Map<string, string> {
    const m = new Map<string, string>();
    for (const e of this.byId.values()) m.set(e.path, e.originalText);
    return m;
  }

  getByPath(path: string): RestoreEntry | undefined {
    for (const e of this.byId.values()) {
      if (e.path === path) return e;
    }
    return undefined;
  }

  clear(): void {
    this.byId.clear();
  }

  get size(): number {
    return this.byId.size;
  }
}

/** Debounce helper for MutationObserver coalescing. */
export function coalesceMutations(
  flush: (records: MutationRecord[]) => void,
  waitMs = 80,
): (records: MutationRecord[]) => void {
  let buffer: MutationRecord[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (records: MutationRecord[]) => {
    buffer.push(...records);
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      const batch = buffer;
      buffer = [];
      flush(batch);
    }, waitMs);
  };
}
