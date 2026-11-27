// Paths and data access shared by the OCR scripts
import { existsSync, readdirSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { slug } from "github-slugger";

import { transcriptionSchema, type Transcription } from "../../transcriptions";

export const ROOT = resolve(import.meta.dir, "../../..");
export const ISSUES_DIR = join(ROOT, "src/data/issues");
export const TRANSCRIPTIONS_DIR = join(ROOT, "src/data/transcriptions");
export const CACHE_DIR = join(ROOT, ".cache/ocr");
export const FRAME_OVERRIDES_FILE = join(
  import.meta.dir,
  "frameOverrides.json",
);

export type Issue = { id: string; title: string; images: string[] };

/**
 * Same id as the one Astro's glob loader gives to the entries of the
 * `issues` collection: the file name without extension, slugified with
 * github-slugger (e.g. "holonews_fr_ver._13.06_-_19.06.mdx" →
 * "holonews_fr_ver_1306_-_1906").
 */
export function issueIdFromFileName(fileName: string) {
  return slug(basename(fileName, extname(fileName)));
}

export async function loadIssues(): Promise<Issue[]> {
  const files = readdirSync(ISSUES_DIR).filter(
    (file) => /\.mdx?$/.test(file) && !file.startsWith("_"),
  );
  const issues = await Promise.all(
    files.map(async (file) => {
      const content = await Bun.file(join(ISSUES_DIR, file)).text();
      const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1];
      if (!frontmatter) throw new Error(`Frontmatter introuvable : ${file}`);
      const data = Bun.YAML.parse(frontmatter) as {
        title: string;
        images: string[];
      };
      return {
        id: issueIdFromFileName(file),
        title: data.title,
        images: data.images,
      };
    }),
  );
  return issues.sort((a, b) => a.id.localeCompare(b.id));
}

export function transcriptionPath(issueId: string, page: number) {
  return join(TRANSCRIPTIONS_DIR, issueId, `${page}.json`);
}

export async function readTranscription(
  issueId: string,
  page: number,
): Promise<Transcription | null> {
  const path = transcriptionPath(issueId, page);
  if (!existsSync(path)) return null;
  return transcriptionSchema.parse(await Bun.file(path).json());
}

/** GIF frame to use instead of the middle one, keyed by "<issue-id>/<page>". */
export async function loadFrameOverrides(): Promise<Record<string, number>> {
  if (!existsSync(FRAME_OVERRIDES_FILE)) return {};
  return (await Bun.file(FRAME_OVERRIDES_FILE).json()) as Record<
    string,
    number
  >;
}
