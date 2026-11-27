// Pure helpers for reading a transcription aloud with the browser's Web Speech
// API (src/speechPlayer.ts), kept out of the player so they can be unit tested.

// Type-only: the runtime of ./transcriptions (zod) stays out of the client.
import type { TranscriptionBlock } from "./transcriptions";

// Speech rates offered by the reader. The stored preference is the rate itself.
export const SPEECH_RATES = [0.75, 1, 1.25, 1.5] as const;
export const DEFAULT_SPEECH_RATE = 1;

export function parseSpeechRate(value: string | null): number {
  if (value === null || !/^\d+(?:\.\d+)?$/.test(value)) {
    return DEFAULT_SPEECH_RATE;
  }
  const rate = Number(value);
  return SPEECH_RATES.find((step) => step === rate) ?? DEFAULT_SPEECH_RATE;
}

// The rate after `rate` in SPEECH_RATES, back to the slowest after the fastest
export function nextSpeechRate(rate: number): number {
  const index = SPEECH_RATES.findIndex((step) => step === rate);
  return SPEECH_RATES[(index + 1) % SPEECH_RATES.length] ?? DEFAULT_SPEECH_RATE;
}

// "0,75×", "1×", "1,5×"
export function formatSpeechRate(rate: number) {
  return `${String(rate).replace(".", ",")}×`;
}

const REGIONS: Record<string, string> = { fr: "fr-FR", en: "en-US" };

// BCP 47 tag of a transcription's `lang`: a bare language gets its usual
// region, a tag that already has one is kept, anything else falls back to
// French, the language of the magazine.
export function speechLang(lang: string | undefined) {
  const value = lang?.trim().replace("_", "-") ?? "";
  const match = /^([a-z]{2,3})(?:-([a-z]{2}|\d{3}))?$/i.exec(value);
  if (!match?.[1]) return "fr-FR";
  const language = match[1].toLowerCase();
  if (match[2]) return `${language}-${match[2].toUpperCase()}`;
  return REGIONS[language] ?? language;
}

// Language name for the message shown when no voice speaks it
export function voiceLanguageName(tag: string) {
  const language = tag.split("-")[0];
  if (language === "fr") return "française";
  if (language === "en") return "anglaise";
  return "pour cette langue";
}

// What the player needs of a SpeechSynthesisVoice
export interface VoiceLike {
  lang: string;
  localService: boolean;
  default: boolean;
}

function splitTag(tag: string) {
  const [language = "", region = ""] = tag
    .replace("_", "-")
    .toLowerCase()
    .split("-");
  return { language, region };
}

// Best voice of `voices` for the BCP 47 `tag`, undefined if none speaks the
// language. Prefers, in order: the same region ("fr-FR" over "fr-CA"), a
// voice of the device (works offline and avoids the stalls of Chrome's
// network voices), the voice the user chose as default.
export function pickVoice<Voice extends VoiceLike>(
  voices: readonly Voice[],
  tag: string,
): Voice | undefined {
  const wanted = splitTag(tag);
  let best: Voice | undefined;
  let bestScore = -1;
  for (const voice of voices) {
    const { language, region } = splitTag(voice.lang);
    if (language !== wanted.language) continue;
    const score =
      (region === wanted.region ? 4 : 0) +
      (voice.localService ? 2 : 0) +
      (voice.default ? 1 : 0);
    if (score > bestScore) {
      best = voice;
      bestScore = score;
    }
  }
  return best;
}

// Pictograms, emoji and other decorative symbols (★, ♡, ※, →…), except the
// degree sign, plus the characters that only join or style them.
const DECORATIVE = /(?!°)[\p{Extended_Pictographic}\p{So}‍︎️]/gu;
// Combining marks left without a letter once the symbols are gone ("͡°")
const STRAY_MARKS = /(^|[^\p{L}\p{N}])\p{M}+/gu;
const SENTENCE_END = /[.!?…:;,]$/;

// Text of a block as it should be spoken: same words, without what a speech
// engine would spell out or read badly (decorations, list bullets,
// separators, hashtags), and with line breaks turned into pauses.
export function cleanForSpeech(text: string) {
  const lines = text
    // Full-width punctuation of Japanese texts ("！", "（") becomes ASCII
    .normalize("NFKC")
    .replace(DECORATIVE, " ")
    .replace(STRAY_MARKS, "$1")
    .split("\n")
    .map((line) =>
      line
        // List bullets
        .replace(/^\s*[•·*\-–—]\s+/, "")
        // "[Suisei] Template" reads "Suisei, Template"
        .replace(/\[([^\]]*)\]/g, "$1,")
        // Separators of lists on one line ("A · B | C"), "Mio/Okayu"
        .replace(/\s+[·•|]\s+|\s*\|\s*/g, ", ")
        // (no lookbehind: a syntax error in Safari before 16.4)
        .replace(/(\p{L})\/(?=\p{L})/gu, "$1, ")
        // Hashtags, handles and decorations around words
        .replace(/(^|\s)[#@](?=[\p{L}\p{N}])/gu, "$1")
        .replace(/[~〜^_*`[\]{}]+/g, " ")
        .replace(/\s+/g, " ")
        .replace(/\s+([,.])/g, "$1")
        .replace(/([,:;])(?:\s*[,:;])+/g, "$1")
        .replace(/^[\s,.:;]+|\s+$/g, ""),
    )
    .filter((line) => /[\p{L}\p{N}]/u.test(line));
  // A line break is a pause: a short one after a punctuation mark, the end
  // of a sentence otherwise (titles, list items, credits)
  return lines
    .map((line, index) =>
      index < lines.length - 1 && !SENTENCE_END.test(line) ? `${line}.` : line,
    )
    .join(" ")
    .replace(/[\s,:;]+$/, "");
}

// Some engines cut off or stall on long utterances (Chrome stops after about
// 15 seconds with its network voices), so the text is spoken in pieces of at
// most this many characters, cut at sentence boundaries when possible.
export const MAX_CHUNK_LENGTH = 200;

// End of a sentence: a period followed by a space, not one inside a number
// ("12.5"), with the closing quotes or brackets that follow it
const SENTENCE_BOUNDARY = /[.!?…]+(?:\s*[»”)\]]|["’])*\s+/gu;
const CLAUSE_BOUNDARY = /[,;:]+\s+/gu;

// `text` cut after each boundary, the boundaries (and their spaces) kept
function pieces(text: string, boundary: RegExp) {
  const parts: string[] = [];
  let start = 0;
  for (const match of text.matchAll(boundary)) {
    const end = match.index + match[0].length;
    parts.push(text.slice(start, end));
    start = end;
  }
  if (start < text.length) parts.push(text.slice(start));
  return parts;
}

// Splits a piece longer than `max` at spaces, or anywhere if a word is longer
function splitWords(text: string, max: number) {
  const parts: string[] = [];
  let rest = text.trim();
  while (rest.length > max) {
    const space = rest.lastIndexOf(" ", max);
    const cut = space > 0 ? space : max;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

// Packs consecutive pieces into chunks of at most `max` characters
function pack(parts: string[], max: number) {
  const chunks: string[] = [];
  let current = "";
  for (const part of parts) {
    if (current && (current + part).trim().length > max) {
      chunks.push(current.trim());
      current = "";
    }
    current += part;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

// Utterance-sized pieces of `text`: whole sentences, grouped while they fit
// in `max` characters. A longer sentence is cut after a comma, semicolon or
// colon, and failing that at a space.
export function splitIntoChunks(text: string, max = MAX_CHUNK_LENGTH) {
  const parts = pieces(text.trim(), SENTENCE_BOUNDARY).flatMap((sentence) => {
    if (sentence.trim().length <= max) return [sentence];
    return pieces(sentence, CLAUSE_BOUNDARY).flatMap((clause) =>
      clause.trim().length <= max
        ? [clause]
        : splitWords(clause, max).map((words) => `${words} `),
    );
  });
  return pack(parts, max);
}

export interface SpeechChunk {
  // Index of the block in the page, to mark it while it is spoken
  block: number;
  text: string;
}

// Everything to say for a page, in reading order. Blocks with nothing to say
// (only symbols) are skipped.
export function speechQueue(
  blocks: readonly Pick<TranscriptionBlock, "text">[],
): SpeechChunk[] {
  return blocks.flatMap((block, index) =>
    splitIntoChunks(cleanForSpeech(block.text)).map((text) => ({
      block: index,
      text,
    })),
  );
}
