<script lang="ts">
  import type { TranscriptionBlock } from "$lib/transcriptions";
  import { cn } from "$lib/utils";
  import ImageOffIcon from "@lucide/svelte/icons/image-off";

  let {
    src,
    alt,
    class: className,
    highlight,
    matches = [],
    speaking,
  }: {
    src: string;
    alt: string;
    class?: string;
    // Development aid: area of a transcription block outlined on the image
    highlight?: TranscriptionBlock["bbox"];
    // Areas of the transcription blocks that contain a search match
    matches?: NonNullable<TranscriptionBlock["bbox"]>[];
    // Area of the transcription block being read aloud
    speaking?: TranscriptionBlock["bbox"];
  } = $props();

  // Keyed by URL so that changing page clears the error
  let failedSrc = $state<string | null>(null);
  const failed = $derived(failedSrc === src);
</script>

<div class={cn("relative mx-auto", className)}>
  {#if failed}
    <div
      class="flex aspect-[3/4] w-full flex-col items-center justify-center gap-3 bg-muted p-6 text-center text-muted-foreground"
    >
      <ImageOffIcon class="size-8" aria-hidden="true" />
      <p>L'image de cette page n'a pas pu être chargée.</p>
      <a
        href={src}
        target="_blank"
        rel="noopener noreferrer"
        class="text-sm text-foreground underline underline-offset-4"
      >
        Ouvrir l'image dans un nouvel onglet
      </a>
    </div>
  {:else}
    <img
      {src}
      {alt}
      class="block w-full object-cover"
      onerror={() => (failedSrc = src)}
    />
    {#each matches as match, index (index)}
      <div
        class="pointer-events-none absolute rounded-sm bg-yellow-300/20 outline-2 outline-offset-2 outline-yellow-500 dark:outline-yellow-400"
        style:left="{match.x * 100}%"
        style:top="{match.y * 100}%"
        style:width="{match.width * 100}%"
        style:height="{match.height * 100}%"
      ></div>
    {/each}
    {#if speaking}
      <!-- Outside the outline of a search match on the same block -->
      <div
        class="pointer-events-none absolute rounded-sm bg-sky-400/15 outline-2 outline-offset-4 outline-sky-600 transition-[left,top,width,height] duration-200 motion-reduce:transition-none dark:outline-sky-400"
        style:left="{speaking.x * 100}%"
        style:top="{speaking.y * 100}%"
        style:width="{speaking.width * 100}%"
        style:height="{speaking.height * 100}%"
      ></div>
    {/if}
    {#if highlight}
      <div
        class="pointer-events-none absolute rounded-sm bg-red-500/10 outline-2 outline-red-500"
        style:left="{highlight.x * 100}%"
        style:top="{highlight.y * 100}%"
        style:width="{highlight.width * 100}%"
        style:height="{highlight.height * 100}%"
      ></div>
    {/if}
  {/if}
</div>
