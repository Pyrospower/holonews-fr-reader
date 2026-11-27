// Pure helpers for the search in the transcriptions: the search page
// (src/components/SearchPage.svelte) and the search in an issue of the reader
// (src/components/IssueViewer.svelte), kept out of the components so they can
// be unit tested. Both use the same rules, so a page found by the search page
// is a page highlighted by the reader.

// Type-only: the runtime of ./transcriptions (zod) stays out of the client.
import type { PageTranscription } from "./transcriptions";

export const QUERY_PARAM = "q";
export const SEARCH_DATA_URL = "/search-index.json";

// A page of the search data (src/pages/search-index.json.ts). Short keys,
// the file is downloaded by the search page.
export interface SearchDocument {
  // Issue id, as in /issues/<id>
  i: string;
  // Issue title
  t: string;
  // Issue date, YYYY-MM-DD
  d: string;
  // 1-based page number
  p: number;
  // Full page text (transcriptionText)
  x: string;
}

// Range of a match in a text, in UTF-16 code units, end excluded
export interface MatchRange {
  start: number;
  end: number;
}

// A piece of text to display, highlighted or not
export interface TextSegment {
  text: string;
  match: boolean;
}

// Not decomposed by Unicode normalization
const LIGATURES: Record<string, string> = { œ: "oe", æ: "ae", ß: "ss" };
const LIGATURE_PATTERN = /[œæß]/g;
const MARKS = /\p{M}/gu;
const WORD = /[\p{L}\p{N}]+/gu;

// Case- and accent-insensitive form of a text: lowercase, without diacritics,
// ligatures and compatibility characters expanded ("Œuvre" → "oeuvre").
export function normalize(text: string) {
  return text
    .toLowerCase()
    .replace(LIGATURE_PATTERN, (char) => LIGATURES[char] ?? char)
    .normalize("NFKD")
    .toLowerCase()
    .replace(MARKS, "");
}

const charCache = new Map<string, string>();

function normalizeChar(char: string) {
  let normalized = charCache.get(char);
  if (normalized === undefined) {
    normalized = normalize(char);
    charCache.set(char, normalized);
  }
  return normalized;
}

// normalize(), plus where each code unit of the result comes from in `text`:
// the normalized unit `i` stands for text.slice(starts[i], ends[i]).
export function normalizeWithMap(text: string) {
  let normalized = "";
  const starts: number[] = [];
  const ends: number[] = [];
  let index = 0;
  // First normalized unit of the previous character
  let previous = 0;
  for (const char of text) {
    const end = index + char.length;
    const value = normalizeChar(char);
    if (value === "") {
      // A combining mark: belongs to the previous character
      for (let i = previous; i < normalized.length; i++) ends[i] = end;
    } else {
      previous = normalized.length;
      for (let i = 0; i < value.length; i++) {
        starts.push(index);
        ends.push(end);
      }
      normalized += value;
    }
    index = end;
  }
  return { normalized, starts, ends };
}

// Normalized words of a text, as indexed by the search page
export function tokenize(text: string) {
  return normalize(text).match(WORD) ?? [];
}

// French elisions ("l'", "qu'", "jusqu'"…) are not worth searching for
const ELISION = /^(?:\p{L}|\p{L}*qu)$/u;
const APOSTROPHES = /['’ʼ‘`´]/;

// Normalized words of a search query: what every matching page must contain.
// Single letters and elisions are dropped, a lone digit is kept.
export function parseQuery(query: string) {
  const normalized = normalize(query);
  const terms: string[] = [];
  for (const match of normalized.matchAll(WORD)) {
    const term = match[0];
    const next = normalized[match.index + term.length] ?? "";
    const elided = APOSTROPHES.test(next) && ELISION.test(term);
    const tooShort = term.length === 1 && !/\d/.test(term);
    if (!elided && !tooShort && !terms.includes(term)) terms.push(term);
  }
  return terms;
}

// Maximum number of typos tolerated in a query term: none for short terms,
// where a typo turns a word into another one.
export function fuzziness(term: string) {
  if (term.length >= 8) return 2;
  if (term.length >= 5) return 1;
  return 0;
}

// Levenshtein distance, or max + 1 as soon as it is known to exceed max
function editDistance(a: string, b: string, max: number) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(
        previous[j]! + 1,
        current[j - 1]! + 1,
        previous[j - 1]! + cost,
      );
      current.push(value);
      rowMin = Math.min(rowMin, value);
    }
    if (rowMin > max) return max + 1;
    previous = current;
  }
  return previous[b.length]!;
}

// Whether a normalized word of a text matches a query term: it starts with
// the term (search while typing) or is within a few typos of it. Same rules
// as the MiniSearch options of the search page (searchOptions).
export function termMatches(word: string, term: string) {
  if (word.startsWith(term)) return true;
  const max = fuzziness(term);
  return max > 0 && editDistance(word, term, max) <= max;
}

export const searchOptions = {
  prefix: true,
  fuzzy: (term: string) => fuzziness(term),
  combineWith: "AND",
  // Rank exact matches well above prefix and fuzzy ones
  weights: { prefix: 0.3, fuzzy: 0.2 },
} as const;

interface WordMatch extends MatchRange {
  // Index in `terms` of the term the word matches
  term: number;
  // Matched by a typo rather than as a prefix
  fuzzy: boolean;
}

function findWordMatches(text: string, terms: readonly string[]) {
  const matches: WordMatch[] = [];
  if (terms.length === 0) return matches;
  const { normalized, starts, ends } = normalizeWithMap(text);
  for (const match of normalized.matchAll(WORD)) {
    const word = match[0];
    let term = terms.findIndex((term) => word.startsWith(term));
    const fuzzy = term === -1;
    if (fuzzy) term = terms.findIndex((term) => termMatches(word, term));
    if (term === -1) continue;
    const first = match.index;
    const last = first + word.length - 1;
    matches.push({ start: starts[first]!, end: ends[last]!, term, fuzzy });
  }
  return matches;
}

// Ranges of the words that match one of the query terms in each text (the
// blocks of a page), in the original (not normalized) text. Words within a
// few typos of a term are left out when the term is found as such in one of
// the texts: searching "ecole" highlights "école" but not "écoulé".
export function findPageMatches(
  texts: readonly string[],
  terms: readonly string[],
): MatchRange[][] {
  const matches = texts.map((text) => findWordMatches(text, terms));
  const found = new Set(
    matches.flat().flatMap(({ term, fuzzy }) => (fuzzy ? [] : [term])),
  );
  return matches.map((ranges) =>
    ranges
      .filter(({ term, fuzzy }) => !fuzzy || !found.has(term))
      .map(({ start, end }) => ({ start, end })),
  );
}

// findPageMatches for a single text
export function findMatches(text: string, terms: readonly string[]) {
  return findPageMatches([text], terms)[0] ?? [];
}

// Whether `text` contains every query term
export function textMatches(text: string, terms: readonly string[]) {
  if (terms.length === 0) return false;
  const found = new Set(findWordMatches(text, terms).map(({ term }) => term));
  return found.size === terms.length;
}

// Whether a transcription is shown by the reader (and searchable)
export function isReadable(
  transcription: PageTranscription | undefined,
): transcription is PageTranscription {
  return (
    transcription !== undefined &&
    transcription.status !== "unavailable" &&
    transcription.blocks.some((block) => block.text.trim() !== "")
  );
}

// Same as transcriptionText (./transcriptions)
function pageText(transcription: PageTranscription) {
  return transcription.blocks.map((block) => block.text).join("\n\n");
}

// Sorted 1-based numbers of the pages of an issue that contain every query
// term, in their transcription.
export function matchingPages(
  transcriptions: Record<number, PageTranscription>,
  terms: readonly string[],
) {
  if (terms.length === 0) return [];
  return Object.entries(transcriptions)
    .filter(
      ([, transcription]) =>
        isReadable(transcription) &&
        textMatches(pageText(transcription), terms),
    )
    .map(([page]) => Number(page))
    .sort((a, b) => a - b);
}

// Splits `text` into highlighted and plain segments. `ranges` must be sorted
// and not overlap, as returned by findMatches.
export function highlightSegments(
  text: string,
  ranges: readonly MatchRange[],
): TextSegment[] {
  const segments: TextSegment[] = [];
  let index = 0;
  for (const { start, end } of ranges) {
    if (start < index || end <= start) continue;
    if (start > index) {
      segments.push({ text: text.slice(index, start), match: false });
    }
    segments.push({ text: text.slice(start, end), match: true });
    index = end;
  }
  if (index < text.length) {
    segments.push({ text: text.slice(index), match: false });
  }
  return segments;
}

// Short extract of `text` around its first match, on a single line, with the
// matches it contains highlighted. Cut at word boundaries, with an ellipsis
// where the text goes on.
export function buildExcerpt(
  text: string,
  ranges: readonly MatchRange[],
  { before = 60, after = 140 } = {},
): TextSegment[] {
  const first = ranges[0] ?? { start: 0, end: 0 };
  let start = Math.max(0, first.start - before);
  let end = Math.min(text.length, first.end + after);
  if (start > 0) {
    const space = text.slice(start, first.start).search(/\s/);
    if (space !== -1) start += space + 1;
  }
  if (end < text.length) {
    const tail = text.slice(first.end, end);
    const space = tail.search(/\s\S*$/);
    if (space !== -1) end = first.end + space;
  }
  const inside = ranges
    .filter((range) => range.start >= start && range.end <= end)
    .map((range) => ({ start: range.start - start, end: range.end - start }));
  const segments = highlightSegments(text.slice(start, end), inside).map(
    (segment) => ({ ...segment, text: segment.text.replace(/\s+/g, " ") }),
  );
  const head = segments[0];
  if (head && !head.match) head.text = head.text.trimStart();
  const tail = segments.at(-1);
  if (tail && !tail.match) tail.text = tail.text.trimEnd();
  if (start > 0) segments.unshift({ text: "… ", match: false });
  if (end < text.length) segments.push({ text: " …", match: false });
  return segments.filter((segment) => segment.text !== "");
}
