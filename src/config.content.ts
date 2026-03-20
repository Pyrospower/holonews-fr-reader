import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

export const collections = {
  issues: defineCollection({
    loader: glob({ pattern: "**/[^_]*.md", base: "./src/data/issues" }),
    schema: z.object({
      title: z.string(),
      date: z.string().datetime({ offset: true }).pipe(z.coerce.date()),
      link: z.string().url(),
      images: z.array(z.string().url()),
      tags: z.array(z.string()),
    }),
  }),
};
