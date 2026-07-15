import type { LexiconEntry } from "../lexicon.js";

/**
 * Parse JMdict-style XML entity line fragments commonly found in exports.
 * Example:
 *   <entry><ent_seq>1000000</ent_seq><k_ele><keb>日本</keb></k_ele><r_ele><reb>にほん</reb></r_ele><sense><pos>&n;</pos><gloss>Japan</gloss></sense></entry>
 */
export function parseJmdictEntryXml(fragment: string): LexiconEntry | null {
  const seq = matchTag(fragment, "ent_seq");
  const keb = matchAllTags(fragment, "keb");
  const reb = matchAllTags(fragment, "reb");
  const glosses = matchAllTags(fragment, "gloss");
  const posRaw = matchAllTags(fragment, "pos").map(stripJmdictEntity);

  if (!seq || (keb.length === 0 && reb.length === 0) || glosses.length === 0) {
    return null;
  }

  const lemma = keb[0] ?? reb[0]!;
  return {
    id: `jmdict:${seq}`,
    lemma,
    language: "ja",
    ...(reb.length > 0 ? { readings: reb } : {}),
    senses: [
      {
        id: `${seq}:0`,
        glosses,
        ...(posRaw.length > 0 ? { pos: posRaw } : {}),
      },
    ],
    source: "jmdict",
    license: "CC BY-SA 4.0 / EDRDG",
    attribution: "JMdict / EDRDG",
    raw: { keb, reb, ent_seq: seq },
  };
}

/**
 * Parse an EDICT2/JMdict text-line style used in simplified dumps:
 *   食べる [たべる] /(v1)/to eat/to live on (food)/
 */
export function parseJmdictTextLine(line: string): LexiconEntry | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  const m = /^(.+?)\s+(?:\[(.+?)\]\s+)?\/(.+)\/\s*$/.exec(trimmed);
  if (!m) return null;

  const lemma = m[1]!.trim();
  const reading = m[2]?.trim();
  const rest = m[3]!;
  const parts = rest.split("/").map((p) => p.trim()).filter(Boolean);
  const pos: string[] = [];
  const glosses: string[] = [];
  for (const part of parts) {
    if (/^\([^)]+\)$/.test(part) || /^&\w+;$/.test(part)) {
      pos.push(stripJmdictEntity(part.replace(/[()]/g, "")));
    } else {
      glosses.push(part);
    }
  }
  if (glosses.length === 0) return null;

  return {
    id: `jmdict-text:${lemma}:${reading ?? ""}`,
    lemma,
    language: "ja",
    ...(reading ? { readings: [reading] } : {}),
    senses: [
      {
        id: "0",
        glosses,
        ...(pos.length > 0 ? { pos } : {}),
      },
    ],
    source: "jmdict",
    license: "CC BY-SA 4.0 / EDRDG",
    attribution: "JMdict / EDRDG",
  };
}

function matchTag(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}>([^<]*)</${tag}>`);
  return re.exec(xml)?.[1] ?? null;
}

function matchAllTags(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}>([^<]*)</${tag}>`, "g");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    if (m[1]) out.push(m[1]);
  }
  return out;
}

function stripJmdictEntity(value: string): string {
  return value.replace(/^&/, "").replace(/;$/, "");
}
