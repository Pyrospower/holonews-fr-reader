// @ts-check
import mdx from "@astrojs/mdx";
import svelte from "@astrojs/svelte";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
  integrations: [svelte(), mdx()],
  image: {
    domains: ["i.redd.it", "preview.redd.it"],
  },
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      noExternal: ["@lucide/svelte", "bits-ui"],
    },
  },
});
