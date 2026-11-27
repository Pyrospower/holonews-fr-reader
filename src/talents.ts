// Talents mentioned in the transcriptions: the dictionary (src/data/talents.json)
// and the detection of its names in a text. Pure and dictionary-based (no
// external service), run at build time only: the talent pages
// (src/pages/talents) and the talents of each page of the reader get the
// results, never the dictionary or the matching code.

import dictionary from "./data/talents.json";
import {
  findMatches,
  normalize,
  normalizeWithMap,
  parseQuery,
  type MatchRange,
} from "./search";

export interface TalentEntry {
  // Stable, used in /talents/<slug>
  slug: string;
  // Display name, also matched like `aliases`
  name: string;
  // Other names, matched ignoring case and accents
  aliases: string[];
  // Names that are also ordinary words or names ("Reine", "Marine", "Ame"),
  // matched only with this exact case and these exact accents, or in
  // capitals ("REINE")
  casedAliases: string[];
}

export interface TalentUnit {
  // Generation or unit, as displayed
  name: string;
  talents: TalentEntry[];
}

export interface TalentBranch {
  name: string;
  units: TalentUnit[];
}

export interface TalentDictionary {
  // Phrases that contain a name but are not about the talent (song titles,
  // other people, ordinary words): "Kira Kira", "Reine des Erreurs". Matched
  // ignoring case and accents, they hide the names they contain.
  ignore: string[];
  branches: TalentBranch[];
}

// A talent with where it belongs, for display
export interface Talent {
  slug: string;
  name: string;
  branch: string;
  unit: string;
}

export interface TalentMention extends MatchRange {
  slug: string;
}

export const TALENT_DICTIONARY: TalentDictionary = dictionary;

// In dictionary order: branch, then unit, then talent
export function listTalents(source: TalentDictionary): Talent[] {
  return source.branches.flatMap((branch) =>
    branch.units.flatMap((unit) =>
      unit.talents.map(({ slug, name }) => ({
        slug,
        name,
        branch: branch.name,
        unit: unit.name,
      })),
    ),
  );
}

export const TALENTS = listTalents(TALENT_DICTIONARY);

const LETTER_OR_DIGIT = String.raw`[\p{L}\p{N}\p{M}]`;
const APOSTROPHE = "['’ʼ‘`´]";
// Between the words of a name: spaces (not line breaks, a name does not span
// two lines or blocks) and hyphens, so that "Roboco san" matches "Roboco-san"
const SEPARATOR = String.raw`(?:[^\S\n]|[-‐‑])+`;

// Regular expression source of a name, matching it as whole words: not
// inside a longer word ("Mel" in "Melfissa"), but before or after an
// apostrophe ("l'Iroha", "Ina's") or other punctuation.
function namePattern(name: string) {
  let pattern = "";
  for (const part of name.trim().split(/([\s\-‐‑]+|['’ʼ‘`´])/u)) {
    if (part === "") continue;
    if (/^[\s\-‐‑]+$/u.test(part)) pattern += SEPARATOR;
    else if (/^['’ʼ‘`´]$/u.test(part)) pattern += APOSTROPHE;
    else pattern += part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return `(?<!${LETTER_OR_DIGIT})${pattern}(?!${LETTER_OR_DIGIT})`;
}

interface NameMatcher {
  // "" for an ignored phrase
  slug: string;
  // Matched against the normalized text, or the original one when cased
  pattern: RegExp;
  cased: boolean;
}

// The names of a talent, longest first so that the full name wins over a
// part of it at the same position
function nameMatchers(talent: TalentEntry): NameMatcher[] {
  const byLength = (a: string, b: string) => b.length - a.length;
  const loose = [...new Set([talent.name, ...talent.aliases].map(normalize))];
  const matchers: NameMatcher[] = loose.sort(byLength).map((name) => ({
    slug: talent.slug,
    pattern: new RegExp(namePattern(name), "gu"),
    cased: false,
  }));
  const cased = talent.casedAliases.flatMap((name) => [
    name,
    name.toUpperCase(),
  ]);
  for (const name of [...new Set(cased)].sort(byLength)) {
    matchers.push({
      slug: talent.slug,
      pattern: new RegExp(namePattern(name), "gu"),
      cased: true,
    });
  }
  return matchers;
}

// Returns a function that finds the mentions of the talents of `source` in a
// text: sorted, non-overlapping ranges in the original text, each with the
// talent it names. Where names overlap, the leftmost then longest one wins
// ("Aki Rosenthal" is one mention, "Kimi Sora Kiseki" an ignored phrase).
export function createTalentDetector(source: TalentDictionary) {
  const matchers = [
    ...source.ignore.map((phrase) => ({
      slug: "",
      pattern: new RegExp(namePattern(normalize(phrase)), "gu"),
      cased: false,
    })),
    ...source.branches
      .flatMap((branch) => branch.units)
      .flatMap((unit) => unit.talents)
      .flatMap(nameMatchers),
  ];

  return function findTalentMentions(text: string): TalentMention[] {
    const { normalized, starts, ends } = normalizeWithMap(text);
    const found: TalentMention[] = [];
    for (const { slug, pattern, cased } of matchers) {
      for (const match of (cased ? text : normalized).matchAll(pattern)) {
        const first = match.index;
        const last = first + match[0].length - 1;
        found.push(
          cased
            ? { slug, start: first, end: last + 1 }
            : { slug, start: starts[first]!, end: ends[last]! },
        );
      }
    }
    found.sort((a, b) => a.start - b.start || b.end - a.end);
    const mentions: TalentMention[] = [];
    for (const mention of found) {
      const previous = mentions.at(-1);
      if (!previous || mention.start >= previous.end) mentions.push(mention);
    }
    return mentions.filter((mention) => mention.slug !== "");
  };
}

export const findTalentMentions = createTalentDetector(TALENT_DICTIONARY);

// Slugs of the talents mentioned in a text, in order of first mention
export function mentionedTalents(mentions: readonly TalentMention[]) {
  return [...new Set(mentions.map((mention) => mention.slug))];
}

function contains(outer: MatchRange, inner: MatchRange) {
  return outer.start <= inner.start && inner.end <= outer.end;
}

// The search (`?q=`) that best highlights a talent in the reader, among the
// ways the text names it: the one whose search highlights the fewest words
// that are not a mention of the talent ("Ina" also highlights "inattendu",
// the reader matches the start of words), then the most of its mentions.
// Returns "" when the text does not mention the talent.
export function mentionQuery(
  text: string,
  mentions: readonly TalentMention[],
  slug: string,
) {
  const own = mentions.filter((mention) => mention.slug === slug);
  const candidates = [
    ...new Set(
      own.map(({ start, end }) => text.slice(start, end).replace(/\s+/g, " ")),
    ),
  ];
  let best = "";
  let bestScore = [Infinity, -Infinity];
  for (const candidate of candidates) {
    const terms = parseQuery(candidate);
    if (terms.length === 0) continue;
    const ranges = findMatches(text, terms);
    const wrong = ranges.filter(
      (range) => !own.some((mention) => contains(mention, range)),
    ).length;
    const right = own.filter((mention) =>
      ranges.some((range) => contains(mention, range)),
    ).length;
    if (
      wrong < bestScore[0]! ||
      (wrong === bestScore[0] && right > bestScore[1]!)
    ) {
      best = candidate;
      bestScore = [wrong, right];
    }
  }
  return best;
}
