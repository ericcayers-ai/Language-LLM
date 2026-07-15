/**
 * Unified local lexicon entry schema shared by all dictionary adapters.
 */
export interface LexiconPronunciation {
  value: string;
  system?: string;
  audioRef?: string;
}

export interface LexiconSense {
  id: string;
  glosses: string[];
  pos?: string[];
  examples?: string[];
  register?: string;
  tags?: string[];
  inflection?: string;
  pitchOrTone?: string;
}

export interface LexiconEntry {
  id: string;
  lemma: string;
  language: string;
  readings?: string[];
  pronunciations?: LexiconPronunciation[];
  senses: LexiconSense[];
  frequency?: number;
  etymology?: string;
  source: string;
  license: string;
  attribution?: string;
  raw?: Record<string, unknown>;
}

export function emptySense(id: string, gloss: string): LexiconSense {
  return { id, glosses: [gloss] };
}
