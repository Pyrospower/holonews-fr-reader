<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import * as Card from "$lib/components/ui/card";
  import type { CollectionEntry } from "astro:content";
  import ChevronLeftIcon from "@lucide/svelte/icons/chevron-left";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";

  let { issue }: { issue: CollectionEntry<"issues"> } = $props();

  let currentPage = $state(1);
  const maxPage = $derived(issue.data.images.length);

  function handlePrevPage() {
    currentPage = currentPage > 1 ? currentPage - 1 : currentPage;
  }

  function handleNextPage() {
    currentPage = currentPage < maxPage ? currentPage + 1 : currentPage;
  }
</script>

<Card.Root class="mx-auto py-0">
  <Card.Content class="p-0">
    <img
      src={issue.data.images[currentPage - 1]}
      alt={`Page ${currentPage} de ${issue.data.title}`}
      class="block w-full sm:w-1/2 mx-auto object-cover"
    />
  </Card.Content>
</Card.Root>

<div class="flex justify-between items-center p-4">
  <Button
    variant="outline"
    size="icon"
    onclick={handlePrevPage}
    disabled={currentPage === 1}
  >
    <ChevronLeftIcon class="w-4 h-4" />
    <span class="sr-only">Page précédente</span>
  </Button>
  <span>Page {currentPage} sur {maxPage}</span>
  <Button
    variant="outline"
    size="icon"
    onclick={handleNextPage}
    disabled={currentPage === maxPage}
  >
    <ChevronRightIcon class="w-4 h-4" />
    <span class="sr-only">Page suivante</span>
  </Button>
</div>

<Card.Root>
  <Card.Content class="p-4">
    <h3 class="text-lg font-semibold mb-2">Navigation rapide</h3>
    <div class="flex flex-wrap space-x-2 gap-y-4">
      {#each issue.data.images as image, index}
        <button
          onclick={() => (currentPage = index + 1)}
          class={`relative w-16 h-16 shrink-0 overflow-hidden rounded cursor-pointer ${currentPage === index + 1 ? "ring-2 ring-primary" : ""}`}
        >
          <img
            src={image}
            alt={`Page ${index + 1}`}
            class="w-full h-full object-cover"
            decoding="async"
            loading="lazy"
          />
          <span
            class="absolute bottom-0 right-0 bg-background text-foreground text-xs px-1 rounded-tl"
          >
            {index + 1}
          </span>
        </button>
      {/each}
    </div>
  </Card.Content>
</Card.Root>

<svelte:window
  onkeydown={(e) => {
    if (e.repeat) return;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      handlePrevPage();
    }
    if (e.key === "ArrowRight") {
      e.preventDefault();
      handleNextPage();
    }
  }}
/>
