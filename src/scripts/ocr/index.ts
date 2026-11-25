// OCR pipeline: turns the pages of the issues into JSON transcriptions in
// src/data/transcriptions. Run locally with Bun, see the README (`pnpm ocr`).
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import sharp from "sharp";
import { createWorker, OEM, PSM, type Worker } from "tesseract.js";
import tesseractPackage from "tesseract.js/package.json";

import {
  TRANSCRIPTION_SCHEMA_VERSION,
  type Transcription,
} from "../../transcriptions";
import {
  buildBlocks,
  originalImageUrl,
  pageStatus,
  PIPELINE_VERSION,
  planPage,
  UPSCALE_BELOW_WIDTH,
  type OcrParagraph,
} from "./lib";
import {
  CACHE_DIR,
  loadFrameOverrides,
  loadIssues,
  readTranscription,
  transcriptionPath,
  type Issue,
} from "./project";

const LANGUAGES = ["fra", "eng"];
// tessdata_best models converted to integers by tesseract.js: the float
// models of tessdata_best can't run in tesseract.js' WebAssembly build.
const MODELS = "4.0.0_best_int";
const MODELS_URL = (lang: string) =>
  `https://cdn.jsdelivr.net/npm/@tesseract.js-data/${lang}@1.0.0/${MODELS}/${lang}.traineddata.gz`;
const MODELS_DIR = join(CACHE_DIR, "models");
const IMAGES_DIR = join(CACHE_DIR, "images");
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

const USAGE = `Utilisation :
  pnpm ocr --issue <id>              Traite toutes les pages d'un numéro
  pnpm ocr --issue <id> --page <n>   Traite une seule page (numérotée à partir de 1)
  pnpm ocr --all                     Traite tous les numéros

Options :
  --force   Régénère aussi les pages au statut « corrected » ou « unavailable »`;

const { values: args } = parseArgs({
  options: {
    issue: { type: "string" },
    page: { type: "string" },
    all: { type: "boolean", default: false },
    force: { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});

async function ensureModels() {
  mkdirSync(MODELS_DIR, { recursive: true });
  for (const lang of LANGUAGES) {
    const path = join(MODELS_DIR, `${lang}.traineddata`);
    if (existsSync(path)) continue;
    console.info(`Téléchargement du modèle ${lang} (${MODELS})...`);
    const response = await fetch(MODELS_URL(lang));
    if (!response.ok)
      throw new Error(`Modèle ${lang} : HTTP ${response.status}`);
    const data = Bun.gunzipSync(new Uint8Array(await response.arrayBuffer()));
    await Bun.write(path, data);
  }
}

async function download(url: string, path: string) {
  if (existsSync(path)) return true;
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  const type = response.headers.get("content-type") ?? "";
  if (!response.ok || !type.startsWith("image/")) return false;
  await Bun.write(path, await response.arrayBuffer());
  return true;
}

/**
 * Downloads the full-resolution image into the cache, or the URL of the site
 * (Reddit preview) when the original isn't available.
 */
async function fetchImage(url: string) {
  mkdirSync(IMAGES_DIR, { recursive: true });
  const original = originalImageUrl(url);
  if (original) {
    const path = join(IMAGES_DIR, original.split("/").at(-1)!);
    if (await download(original, path)) return { path, url: original };
    console.warn(`  Original indisponible, repli sur ${url}`);
  }
  const name = new URL(url).pathname.split("/").at(-1)!;
  const path = join(IMAGES_DIR, `preview-${name}`);
  if (await download(url, path)) return { path, url };
  throw new Error(`Impossible de télécharger ${url}`);
}

/** Extracts the frame to OCR and applies the preprocessing. */
async function prepareImage(path: string, frameOverride?: number) {
  const metadata = await sharp(path, { animated: true }).metadata();
  const frames = metadata.pages ?? 1;
  const gifFrame =
    frames > 1
      ? Math.min(frameOverride ?? Math.floor(frames / 2), frames - 1)
      : null;
  let image = sharp(path, gifFrame === null ? {} : { page: gifFrame });
  if (metadata.width < UPSCALE_BELOW_WIDTH)
    image = image.resize({ width: metadata.width * 2, kernel: "lanczos3" });
  const { data, info } = await image
    .png()
    .toBuffer({ resolveWithObject: true });
  return { buffer: data, width: info.width, height: info.height, gifFrame };
}

async function processPage(
  worker: Worker,
  issue: Issue,
  page: number,
  frameOverride?: number,
): Promise<Transcription> {
  const image = await fetchImage(issue.images[page - 1]!);
  const prepared = await prepareImage(image.path, frameOverride);
  // rotateAuto straightens slightly tilted text boxes (no effect on the
  // other pages in the POC)
  const { data } = await worker.recognize(
    prepared.buffer,
    { rotateAuto: true },
    { blocks: true, text: false },
  );

  const paragraphs: OcrParagraph[] = (data.blocks ?? []).flatMap((block) =>
    block.paragraphs.map((paragraph) => ({
      confidence: paragraph.confidence,
      bbox: paragraph.bbox,
      lines: paragraph.lines.map((line) => ({
        text: line.text,
        height: line.rowAttributes.rowHeight || line.bbox.y1 - line.bbox.y0,
        words: line.words.map(({ text, confidence, bbox }) => ({
          text,
          confidence,
          bbox,
        })),
      })),
    })),
  );
  const blocks = buildBlocks(paragraphs, prepared);
  const confidence = Math.round(data.confidence * 10) / 10;

  return {
    schemaVersion: TRANSCRIPTION_SCHEMA_VERSION,
    issueId: issue.id,
    page,
    lang: "fr",
    status: pageStatus(blocks, confidence),
    blocks,
    source: {
      engine: "tesseract.js",
      engineVersion: `${tesseractPackage.version} (Tesseract ${data.version})`,
      models: `${LANGUAGES.join("+")} ${MODELS}`,
      pipelineVersion: PIPELINE_VERSION,
      imageUrl: image.url,
      gifFrame: prepared.gifFrame,
      confidence,
    },
  };
}

async function main() {
  if (args.help || (!args.all && !args.issue)) {
    console.info(USAGE);
    process.exit(args.help ? 0 : 1);
  }

  const issues = await loadIssues();
  let selected = issues;
  if (args.issue) {
    selected = issues.filter((issue) => issue.id === args.issue);
    if (selected.length === 0) {
      console.error(`Numéro inconnu : ${args.issue}. Numéros disponibles :`);
      for (const issue of issues) console.error(`  ${issue.id}`);
      process.exit(1);
    }
  }
  const page = args.page === undefined ? undefined : Number(args.page);
  if (page !== undefined) {
    const max = selected[0]!.images.length;
    if (!args.issue || !Number.isInteger(page) || page < 1 || page > max) {
      console.error(
        `--page doit être un entier entre 1 et ${max} avec --issue`,
      );
      process.exit(1);
    }
  }

  const overrides = await loadFrameOverrides();
  await ensureModels();
  const worker = await createWorker(LANGUAGES, OEM.LSTM_ONLY, {
    langPath: MODELS_DIR,
    gzip: false,
    // Models are managed above: tesseract.js must not cache (or delete) them
    cacheMethod: "none",
  });
  await worker.setParameters({
    tessedit_pageseg_mode: PSM.AUTO,
    user_defined_dpi: "300",
  });

  const stats = { done: 0, skipped: 0, failed: 0 };
  const start = performance.now();
  for (const issue of selected) {
    console.info(`\n${issue.title} (${issue.id})`);
    const pages = page ? [page] : issue.images.map((_, index) => index + 1);
    for (const number of pages) {
      const label = `  Page ${number}/${issue.images.length}`;
      const frameOverride = overrides[`${issue.id}/${number}`];
      const plan = planPage(await readTranscription(issue.id, number), {
        force: args.force,
        frameOverride,
      });
      if (!plan.run) {
        console.info(`${label} : ignorée (${plan.reason})`);
        stats.skipped++;
        continue;
      }
      try {
        const pageStart = performance.now();
        const transcription = await processPage(
          worker,
          issue,
          number,
          frameOverride,
        );
        const path = transcriptionPath(issue.id, number);
        mkdirSync(dirname(path), { recursive: true });
        await Bun.write(path, `${JSON.stringify(transcription, null, 2)}\n`);
        const seconds = ((performance.now() - pageStart) / 1000).toFixed(1);
        console.info(
          `${label} : ${transcription.status}, confiance ${transcription.source.confidence}, ${transcription.blocks.length} blocs (${seconds} s, ${plan.reason})`,
        );
        stats.done++;
      } catch (error) {
        console.error(`${label} : échec`, error);
        stats.failed++;
      }
    }
  }
  await worker.terminate();

  const minutes = ((performance.now() - start) / 60000).toFixed(1);
  console.info(
    `\nTerminé en ${minutes} min : ${stats.done} traitée(s), ${stats.skipped} ignorée(s), ${stats.failed} échec(s).`,
  );
  if (stats.failed > 0) process.exit(1);
}

await main();
