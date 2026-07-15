export type { LexiconEntry, LexiconPronunciation, LexiconSense } from "./lexicon.js";
export { emptySense } from "./lexicon.js";

export { parseKaikkiLine, parseKaikkiJsonl } from "./adapters/kaikki.js";
export { parseJmdictEntryXml, parseJmdictTextLine } from "./adapters/jmdict.js";
export { parseCcedictLine, parseCcedictText } from "./adapters/ccedict.js";
export {
  detectDictionaryFormat,
  importDictionaryText,
  lookupLemma,
  parseJmdictXmlDump,
  parseJmdictTextDump,
} from "./adapters/import.js";
export type {
  DictionaryFormat,
  DictionaryImportResult,
} from "./adapters/import.js";

export {
  segmentGraphemes,
  graphemeLength,
  sliceGraphemes,
  highlightGraphemeRange,
  findGraphemeSpan,
  splitHighlightSurfaces,
} from "./graphemes.js";
export type { GraphemeSpan, GraphemeSlice } from "./graphemes.js";

export { segmentWords, wordLikeTokens } from "./tokenizer.js";
export type { TokenSpan } from "./tokenizer.js";

export {
  attachFurigana,
  toRubyPairs,
  isKana,
  isKanji,
} from "./kits/japanese.js";
export type { FuriganaAnnotation } from "./kits/japanese.js";

export {
  numberedToToneMarked,
  attachPinyin,
} from "./kits/chinese.js";
export type { PinyinAnnotation } from "./kits/chinese.js";

export {
  romanizeHangulSyllable,
  romanizeHangulText,
  attachHangulRomanization,
  isHangulSyllable,
} from "./kits/korean.js";
export type { HangulAnnotation } from "./kits/korean.js";
