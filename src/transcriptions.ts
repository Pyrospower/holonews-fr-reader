import { z } from "astro/zod";

// Shared by the content collection (content.config.ts) and the OCR pipeline
// (src/scripts/ocr). Bump the version on any breaking change to the format.
export const TRANSCRIPTION_SCHEMA_VERSION = 1;

export const TRANSCRIPTION_STATUSES = [
  "auto",
  "corrected",
  "unavailable",
] as const;
export const BLOCK_TYPES = ["heading", "paragraph", "other"] as const;

const fraction = z.number().min(0).max(1);

export const blockSchema = z.object({
  type: z.enum(BLOCK_TYPES),
  text: z.string(),
  // Normalized to the page size (0–1). Optional so that a block added by hand
  // during a manual correction doesn't need one.
  bbox: z
    .object({ x: fraction, y: fraction, width: fraction, height: fraction })
    .optional(),
});

export const transcriptionSchema = z.object({
  schemaVersion: z.literal(TRANSCRIPTION_SCHEMA_VERSION),
  // Id of the entry in the `issues` collection
  issueId: z.string().min(1),
  // 1-based index of the page in the issue's `images` array
  page: z.number().int().positive(),
  lang: z.string().default("fr"),
  status: z.enum(TRANSCRIPTION_STATUSES),
  // In reading order. The full page text is derived from them.
  blocks: z.array(blockSchema),
  source: z.object({
    engine: z.string(),
    engineVersion: z.string(),
    models: z.string(),
    pipelineVersion: z.number().int().positive(),
    imageUrl: z.url(),
    // Frame that was OCR'd for an animated GIF page, null otherwise
    gifFrame: z.number().int().nonnegative().nullable(),
    // Page-level mean confidence reported by Tesseract (0–100)
    confidence: z.number().min(0).max(100),
  }),
});

export type Transcription = z.infer<typeof transcriptionSchema>;
export type TranscriptionStatus = Transcription["status"];
export type TranscriptionBlock = Transcription["blocks"][number];

// What the reader needs of a page's transcription, passed to the client.
export type PageTranscription = Pick<Transcription, "status" | "blocks">;

export function transcriptionText(
  transcription: Pick<Transcription, "blocks">,
) {
  return transcription.blocks.map((block) => block.text).join("\n\n");
}
