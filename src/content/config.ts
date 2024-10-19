import { defineCollection, z } from "astro:content";

export const collections = {
  issues: defineCollection({
    type: "content",
    schema: z.object({
      title: z.string(),
      date: z.date(),
      link: z.string().url(),
      thumbnail: z.string().url(),
      images: z.array(
        z.object({
          url: z.string(),
        }),
      ),
      tags: z.array(z.string()),
    }),
  }),
};
