import { defineCollection, z } from "astro:content";

export const collections = {
  issues: defineCollection({
    type: "content",
    schema: z.object({
      title: z.string(),
      date: z.string().datetime({ offset: true }).pipe(z.coerce.date()),
      link: z.string().url(),
      images: z.array(z.string().url()),
      tags: z.array(z.string()),
    }),
  }),
};
