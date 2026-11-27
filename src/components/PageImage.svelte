<script lang="ts">
  import type { TranscriptionBlock } from "$lib/transcriptions";
  import { cn } from "$lib/utils";
  import ImageOffIcon from "@lucide/svelte/icons/image-off";

  let {
    src,
    alt,
    class: className,
    highlight,
  }: {
    src: string;
    alt: string;
    class?: string;
    // Development aid: area of a transcription block outlined on the image
    highlight?: TranscriptionBlock["bbox"];
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
