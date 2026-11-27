// Lists the state of the transcriptions (`pnpm ocr:status`)
import { parseArgs } from "node:util";

import type { Transcription } from "../../transcriptions";
import { loadIssues, readTranscription } from "./project";

const { values: args } = parseArgs({
  options: { limit: { type: "string", default: "15" } },
});

type Row = {
  issue: string;
  pages: number;
  auto: number;
  corrected: number;
  unavailable: number;
  missing: number;
  // Lowest confidence among the pages still in `auto` status
  minConfidence: number | null;
};

const issues = await loadIssues();
const rows: Row[] = [];
const autoPages: { issue: string; page: number; confidence: number }[] = [];

for (const issue of issues) {
  const transcriptions = await Promise.all(
    issue.images.map((_, index) => readTranscription(issue.id, index + 1)),
  );
  const done = transcriptions.filter((t): t is Transcription => t !== null);
  const auto = done.filter((t) => t.status === "auto");
  for (const t of auto)
    autoPages.push({
      issue: issue.id,
      page: t.page,
      confidence: t.source.confidence,
    });
  rows.push({
    issue: issue.id,
    pages: issue.images.length,
    auto: auto.length,
    corrected: done.filter((t) => t.status === "corrected").length,
    unavailable: done.filter((t) => t.status === "unavailable").length,
    missing: issue.images.length - done.length,
    minConfidence: auto.length
      ? Math.min(...auto.map((t) => t.source.confidence))
      : null,
  });
}

// Least confident issues first, issues without any auto page last
rows.sort(
  (a, b) =>
    (a.minConfidence ?? Infinity) - (b.minConfidence ?? Infinity) ||
    a.issue.localeCompare(b.issue),
);

const headers = [
  "Numéro",
  "Pages",
  "auto",
  "corrected",
  "unavailable",
  "manquantes",
  "confiance min.",
];
const table = rows.map((row) => [
  row.issue,
  String(row.pages),
  String(row.auto),
  String(row.corrected),
  String(row.unavailable),
  String(row.missing),
  row.minConfidence === null ? "-" : String(row.minConfidence),
]);
const widths = headers.map((header, column) =>
  Math.max(header.length, ...table.map((cells) => cells[column]!.length)),
);
const format = (cells: string[]) =>
  cells
    .map((cell, column) =>
      column === 0
        ? cell.padEnd(widths[column]!)
        : cell.padStart(widths[column]!),
    )
    .join("  ");

console.info(format(headers));
console.info(widths.map((width) => "-".repeat(width)).join("  "));
for (const cells of table) console.info(format(cells));

const total = (
  key: "pages" | "auto" | "corrected" | "unavailable" | "missing",
) => rows.reduce((sum, row) => sum + row[key], 0);
console.info(
  `\nTotal : ${total("pages")} pages, ${total("auto")} auto, ${total("corrected")} corrected, ${total("unavailable")} unavailable, ${total("missing")} manquantes`,
);

const limit = Number(args.limit);
if (autoPages.length > 0 && limit > 0) {
  console.info(`\nPages « auto » les moins fiables (à relire en priorité) :`);
  autoPages
    .sort((a, b) => a.confidence - b.confidence)
    .slice(0, limit)
    .forEach(({ issue, page, confidence }) =>
      console.info(
        `  ${String(confidence).padStart(5)}  ${issue} page ${page}`,
      ),
    );
}
