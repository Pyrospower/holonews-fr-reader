<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import * as Card from "$lib/components/ui/card";
  import type { CollectionEntry } from "astro:content";
  import { ChevronLeft, ChevronRight } from "lucide-svelte";

  export let issue: CollectionEntry<"issues">;

  let currentPage = 1;
  let maxPage = issue.data.images.length;

  function handlePrevPage() {
    currentPage = currentPage > 1 ? currentPage - 1 : currentPage;
  }

  function handleNextPage() {
    currentPage = currentPage < maxPage ? currentPage + 1 : currentPage;
  }
</script>

<Card.Card class="mx-auto">
  <Card.CardContent class="p-0">
    <div class="relative">
      <img
        src={issue.data.images[currentPage - 1]}
        alt={`Page ${currentPage} de ${issue.data.title}`}
        class="w-full sm:w-1/2 mx-auto h-full object-cover"
      />
    </div>
  </Card.CardContent>
</Card.Card>

<div class="flex justify-between items-center p-4">
  <Button
    variant="outline"
    size="icon"
    on:click={handlePrevPage}
    disabled={currentPage === 1}
  >
    <ChevronLeft class="w-4 h-4" />
    <span class="sr-only">Page précédente</span>
  </Button>
  <span>Page {currentPage} sur {maxPage}</span>
  <Button variant="outline" size="icon" on:click={handleNextPage}>
    <ChevronRight class="w-4 h-4" />
    <span class="sr-only">Page suivante</span>
  </Button>
</div>

<svelte:window
  on:keydown|preventDefault={(e) => {
    if (e.repeat) return;

    if (e.key === "ArrowLeft") handlePrevPage();
    if (e.key === "ArrowRight") handleNextPage();
  }}
/>
