import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

export const collections = {
  issues: defineCollection({
    loader: glob({ pattern: "**/[^_]*.{md,mdx}", base: "./src/data/issues" }),
    schema: z.object({
      title: z.string(),
      date: z.coerce.date(),
      link: z.url(),
      images: z.array(z.url()),
      tags: z.array(z.string()),
    }),
  }),
};
