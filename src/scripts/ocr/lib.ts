// Pure logic of the OCR pipeline (no I/O), covered by lib.test.ts.
// Thresholds come from the POC measurements described in the README.
import type {
  TranscriptionBlock,
  TranscriptionStatus,
} from "../../transcriptions";

// Bump when the output of the pipeline changes, so that pages still in
// `auto` status are regenerated on the next run.
export const PIPELINE_VERSION = 1;

// Paragraphs below this Tesseract confidence are dropped: in the POC, 13 of
// the 16 junk paragraphs (artwork, Japanese text) were below 70, while every
// real paragraph worth keeping was at 78 or more.
export const MIN_BLOCK_CONFIDENCE = 70;

// A page is marked `unavailable` when what remains is too short or when
// Tesseract's overall confidence is too low. In the POC, the pages with the
// least text that were still worth reading kept 84 letters, and the lowest
// confidence of a readable page was 72 (a page of schedule screenshots).
export const MIN_PAGE_LETTERS = 40;
export const MIN_PAGE_CONFIDENCE = 70;

// Images narrower than this (the 900 px GIFs) are upscaled 2× before OCR:
// at native size, Tesseract merged lines across the two columns.
export const UPSCALE_BELOW_WIDTH = 1200;

// Line height relative to the page median used to infer the block type
export const HEADING_RATIO = 1.4;
export const SMALL_TEXT_RATIO = 0.7;

// Blocks wider than this fraction of the page span several columns
export const WIDE_BLOCK_RATIO = 0.55;

export type Box = { x: number; y: number; width: number; height: number };

type PixelBox = { x0: number; y0: number; x1: number; y1: number };
export type OcrWord = { text: string; confidence: number; bbox: PixelBox };
export type OcrLine = { text: string; height: number; words?: OcrWord[] };
export type OcrParagraph = {
  confidence: number;
  bbox: PixelBox;
  lines: OcrLine[];
};

// A horizontal gap wider than this many line heights inside a line is a
// gutter between two columns that Tesseract read as a single line
export const GUTTER_RATIO = 2.5;

/**
 * Full-resolution URL of a Reddit image. `preview.redd.it` links are resized
 * (640 px) and the original lives on `i.redd.it` under the same name.
 */
export function originalImageUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.hostname !== "i.redd.it" && parsed.hostname !== "preview.redd.it")
    return null;
  if (!/^\/[\w-]+\.\w+$/.test(parsed.pathname)) return null;
  return `https://i.redd.it${parsed.pathname}`;
}

// Glyphs Tesseract outputs for list bullets
const BULLET = /^[•·*+●▪■◦¢©®°eo]\s+(?=[\p{Lu}\p{N}])/u;
const QUOTE_BULLET = /^«\s+(?=[\p{Lu}\p{N}])/u;

/** Normalizes a line and removes the usual OCR noise at its edges. */
export function cleanLine(line: string) {
  return (
    line
      .replace(/\s+/g, " ")
      .trim()
      // A lone "|" followed by a lowercase word is a misread "I" (English pages)
      .replace(/(^|\s)\|(?=\s+\p{Ll})/gu, "$1I")
      // Remaining bars at the edges come from rules and image borders
      .replace(/^(?:\|\s*)+/, "")
      .replace(/(?:\s*\|)+$/, "")
      .trim()
  );
}

/**
 * Merges the lines of a paragraph into a single text. A word split by a
 * hyphen at the end of a line is rejoined; the hyphen is kept because in
 * these magazines line-final hyphens belong to compound words ("vice-versa",
 * "outre-mer"), not to typographic hyphenation. List items start on a new
 * line with a "•".
 */
export function joinLines(lines: string[]) {
  const cleaned = lines.map(cleanLine).filter((line) => line.length > 0);
  let text = "";
  cleaned.forEach((line, index) => {
    const next = cleaned[index + 1] ?? "";
    let item: string | null = null;
    if (BULLET.test(line)) item = line.replace(BULLET, "");
    // "«" is only a bullet when no closing quote follows
    else if (
      QUOTE_BULLET.test(line) &&
      !line.includes("»") &&
      !next.includes("»")
    )
      item = line.replace(QUOTE_BULLET, "");

    if (item !== null) text += `${text ? "\n" : ""}• ${item}`;
    else text = appendText(text, line);
  });
  return text;
}

/** Appends a line to a text, rejoining a word split by a hyphen. */
function appendText(text: string, line: string) {
  if (!text) return line;
  if (/\p{L}-$/u.test(text)) return text + line;
  return `${text} ${line}`;
}

/** Whether a text contains at least something that looks like a word. */
export function hasWords(text: string) {
  if (/\p{L}{3,}/u.test(text)) return true;
  return (text.match(/\p{L}{2,}/gu) ?? []).length >= 2;
}

export function countLetters(text: string) {
  return (text.match(/\p{L}/gu) ?? []).length;
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

export function blockType(
  lineHeight: number,
  pageLineHeight: number,
): TranscriptionBlock["type"] {
  if (pageLineHeight <= 0) return "paragraph";
  const ratio = lineHeight / pageLineHeight;
  if (ratio >= HEADING_RATIO) return "heading";
  if (ratio <= SMALL_TEXT_RATIO) return "other";
  return "paragraph";
}

/** Merges overlapping [start, end] intervals. */
function mergeIntervals(intervals: [number, number][]) {
  const merged: [number, number][] = [];
  for (const [start, end] of [...intervals].sort((a, b) => a[0] - b[0])) {
    const last = merged.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

/**
 * Reading order. Tesseract's order is kept for single-column pages. On
 * multi-column pages, blocks are read column by column (left to right, top
 * to bottom), and blocks spanning several columns (titles, full-width
 * paragraphs) split the page into bands that are read one after the other.
 */
export function orderBlocks<T extends { bbox: Box }>(blocks: T[]): T[] {
  const isWide = (block: T) => block.bbox.width > WIDE_BLOCK_RATIO;
  const narrow = blocks.filter((block) => !isWide(block));
  const columns = mergeIntervals(
    narrow.map(({ bbox }) => [bbox.x, bbox.x + bbox.width]),
  );
  if (columns.length < 2) return [...blocks];

  const centerY = ({ bbox }: T) => bbox.y + bbox.height / 2;
  const column = ({ bbox }: T) => {
    const center = bbox.x + bbox.width / 2;
    const index = columns.findIndex(([, end]) => center <= end);
    return index === -1 ? columns.length - 1 : index;
  };
  const byColumns = (band: T[]) =>
    band.sort((a, b) => column(a) - column(b) || a.bbox.y - b.bbox.y);

  const ordered: T[] = [];
  let remaining = narrow;
  const wide = blocks.filter(isWide).sort((a, b) => a.bbox.y - b.bbox.y);
  for (const separator of wide) {
    const limit = centerY(separator);
    ordered.push(...byColumns(remaining.filter((b) => centerY(b) < limit)));
    ordered.push(separator);
    remaining = remaining.filter((b) => centerY(b) >= limit);
  }
  ordered.push(...byColumns(remaining));
  return ordered;
}

/**
 * When columns are close together, Tesseract may read lines straight across
 * the gutter and interleave two columns in one paragraph. Such a paragraph
 * is cut at every gutter, i.e. a position where all the lines that have
 * words on both sides show a gap wider than GUTTER_RATIO line heights.
 */
export function splitOnGutters(paragraph: OcrParagraph): OcrParagraph[] {
  const lines = paragraph.lines.filter((line) => line.words?.length);
  if (lines.length !== paragraph.lines.length) return [paragraph];

  const candidates = lines.flatMap((line) => {
    const words = line.words!;
    return words.slice(1).flatMap((word, index) => {
      const previous = words[index]!;
      return word.bbox.x0 - previous.bbox.x1 > line.height * GUTTER_RATIO
        ? [(previous.bbox.x1 + word.bbox.x0) / 2]
        : [];
    });
  });
  const isGutter = (cut: number) =>
    lines.every((line) => {
      const words = line.words!;
      if (words.some((w) => w.bbox.x0 < cut && w.bbox.x1 > cut)) return false;
      const left = words.filter((w) => w.bbox.x1 <= cut).at(-1);
      const right = words.find((w) => w.bbox.x0 >= cut);
      return (
        !left ||
        !right ||
        right.bbox.x0 - left.bbox.x1 > line.height * GUTTER_RATIO
      );
    });
  const lineHeight = median(lines.map((line) => line.height));
  const cuts: number[] = [];
  for (const cut of candidates.filter(isGutter).sort((a, b) => a - b))
    if (cut - (cuts.at(-1) ?? -Infinity) > lineHeight * GUTTER_RATIO)
      cuts.push(cut);
  if (cuts.length === 0) return [paragraph];

  const bounds = [-Infinity, ...cuts, Infinity];
  return bounds.slice(1).flatMap((end, index) => {
    const start = bounds[index]!;
    const columnLines = lines
      .map((line) => {
        const words = line.words!.filter(
          (w) =>
            (w.bbox.x0 + w.bbox.x1) / 2 > start &&
            (w.bbox.x0 + w.bbox.x1) / 2 < end,
        );
        return {
          text: words.map((w) => w.text).join(" "),
          height: line.height,
          words,
        };
      })
      .filter((line) => line.words.length > 0);
    const words = columnLines.flatMap((line) => line.words);
    if (words.length === 0) return [];
    return [
      {
        confidence:
          words.reduce((sum, w) => sum + w.confidence, 0) / words.length,
        bbox: {
          x0: Math.min(...words.map((w) => w.bbox.x0)),
          y0: Math.min(...words.map((w) => w.bbox.y0)),
          x1: Math.max(...words.map((w) => w.bbox.x1)),
          y1: Math.max(...words.map((w) => w.bbox.y1)),
        },
        lines: columnLines,
      },
    ];
  });
}

type LayoutBlock = TranscriptionBlock & { bbox: Box; lineHeight: number };

/**
 * Tesseract sometimes starts a new paragraph in the middle of a sentence,
 * typically on a line starting with "«". Consecutive paragraphs of the same
 * column are merged back when the first one doesn't end a sentence, the
 * second one starts in lowercase or with an opening quote/parenthesis, and
 * they are less than a line and a half apart.
 */
export function mergeSplitParagraphs<T extends LayoutBlock>(blocks: T[]): T[] {
  const merged: T[] = [];
  for (const block of blocks) {
    const previous = merged.at(-1);
    const gap = previous
      ? block.bbox.y - (previous.bbox.y + previous.bbox.height)
      : -1;
    if (
      previous &&
      previous.type === "paragraph" &&
      block.type === "paragraph" &&
      !/[.!?…:]$/.test(previous.text) &&
      /^[\p{Ll}«"(]/u.test(block.text) &&
      gap >= 0 &&
      gap < previous.lineHeight * 1.5 &&
      Math.abs(block.bbox.x - previous.bbox.x) < 0.05
    ) {
      const right = Math.max(
        previous.bbox.x + previous.bbox.width,
        block.bbox.x + block.bbox.width,
      );
      const x = Math.min(previous.bbox.x, block.bbox.x);
      merged[merged.length - 1] = {
        ...previous,
        text: appendText(previous.text, block.text),
        bbox: {
          x,
          y: previous.bbox.y,
          width: right - x,
          height: block.bbox.y + block.bbox.height - previous.bbox.y,
        },
      };
    } else merged.push(block);
  }
  return merged;
}

const round = (value: number) => Math.round(value * 10000) / 10000;
const clamp = (value: number) => Math.min(1, Math.max(0, value));

/**
 * Turns Tesseract's paragraphs into transcription blocks: filters the junk,
 * cleans the text, infers the type and sorts them in reading order.
 */
export function buildBlocks(
  paragraphs: OcrParagraph[],
  size: { width: number; height: number },
): TranscriptionBlock[] {
  const kept = paragraphs
    .flatMap(splitOnGutters)
    .map((paragraph) => ({
      paragraph,
      text: joinLines(paragraph.lines.map((line) => line.text)),
    }))
    .filter(
      ({ paragraph, text }) =>
        paragraph.confidence >= MIN_BLOCK_CONFIDENCE && hasWords(text),
    );

  const pageLineHeight = median(
    kept.flatMap(({ paragraph }) => paragraph.lines.map((l) => l.height)),
  );

  const blocks = kept.map(({ paragraph, text }): LayoutBlock => {
    const { x0, y0, x1, y1 } = paragraph.bbox;
    const lineHeight = median(paragraph.lines.map((l) => l.height));
    return {
      type: blockType(lineHeight, pageLineHeight),
      text,
      bbox: {
        x: x0 / size.width,
        y: y0 / size.height,
        width: (x1 - x0) / size.width,
        height: (y1 - y0) / size.height,
      },
      lineHeight: lineHeight / size.height,
    };
  });

  return mergeSplitParagraphs(orderBlocks(blocks)).map(
    ({ type, text, bbox }) => ({
      type,
      text,
      bbox: {
        x: round(clamp(bbox.x)),
        y: round(clamp(bbox.y)),
        width: round(clamp(bbox.width)),
        height: round(clamp(bbox.height)),
      },
    }),
  );
}

export function pageStatus(
  blocks: TranscriptionBlock[],
  confidence: number,
): TranscriptionStatus {
  const letters = blocks.reduce((sum, b) => sum + countLetters(b.text), 0);
  return letters < MIN_PAGE_LETTERS || confidence < MIN_PAGE_CONFIDENCE
    ? "unavailable"
    : "auto";
}

export type ExistingPage = {
  status: TranscriptionStatus;
  source: { pipelineVersion: number; gifFrame: number | null };
};

/**
 * Decides whether a page must be (re)generated. Pages corrected by hand or
 * marked unavailable are never overwritten without `force`.
 */
export function planPage(
  existing: ExistingPage | null,
  options: { force: boolean; frameOverride?: number | undefined },
): { run: boolean; reason: string } {
  if (!existing) return { run: true, reason: "nouvelle page" };
  if (options.force) return { run: true, reason: "--force" };
  if (existing.status !== "auto")
    return { run: false, reason: `statut « ${existing.status} » protégé` };
  if (existing.source.pipelineVersion < PIPELINE_VERSION)
    return { run: true, reason: "pipeline mis à jour" };
  if (
    options.frameOverride !== undefined &&
    options.frameOverride !== existing.source.gifFrame
  )
    return { run: true, reason: "frame GIF modifiée" };
  return { run: false, reason: "déjà à jour" };
}
