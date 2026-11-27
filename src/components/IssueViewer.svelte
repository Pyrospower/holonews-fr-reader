<script lang="ts">
  import PageImage from "$lib/components/PageImage.svelte";
  import IssueSearch from "$lib/components/IssueSearch.svelte";
  import ReadingModeSelector from "$lib/components/ReadingModeSelector.svelte";
  import TranscriptionPanel from "$lib/components/TranscriptionPanel.svelte";
  import { Button } from "$lib/components/ui/button";
  import * as Card from "$lib/components/ui/card";
  import {
    DEFAULT_READING_MODE,
    DEFAULT_TEXT_SIZE,
    isEditableTarget,
    PAGE_PARAM,
    parsePageParam,
    parseReadingMode,
    parseTextSize,
    readPreference,
    STORAGE_KEYS,
    TEXT_SIZES,
    writePreference,
    type ReadingMode,
  } from "$lib/reader";
  import {
    findPageMatches,
    matchingPages,
    parseQuery,
    QUERY_PARAM,
  } from "$lib/search";
  import type { PageTranscription } from "$lib/transcriptions";
  import type { CollectionEntry } from "astro:content";
  import ChevronLeftIcon from "@lucide/svelte/icons/chevron-left";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import { onDestroy, onMount, tick } from "svelte";

  let {
    issue,
    transcriptions,
  }: {
    issue: CollectionEntry<"issues">;
    // Keyed by 1-based page number. Pages without a transcription are missing.
    transcriptions: Record<number, PageTranscription>;
  } = $props();

  // Development aid: in Mixte, hovering a text block outlines its bbox on the
  // image. Statically false in production builds, so the code is dropped.
  const DEV = import.meta.env.DEV;

  // The page is prerendered with the defaults. The URL and the stored
  // preferences are only read once mounted, to keep hydration consistent.
  let currentPage = $state(1);
  let mode = $state<ReadingMode>(DEFAULT_READING_MODE);
  let textSize = $state(DEFAULT_TEXT_SIZE);
  // In Texte, page whose image was asked for because it has no transcription
  let imageShownFor = $state<number | null>(null);
  let hoveredBlock = $state<number | null>(null);
  // Search in the issue, mirrored in ?q=
  let query = $state("");

  const maxPage = $derived(issue.data.images.length);
  const currentImage = $derived(issue.data.images[currentPage - 1] ?? "");
  const currentAlt = $derived(`Page ${currentPage} de ${issue.data.title}`);
  const transcription = $derived(transcriptions[currentPage]);
  const issueHasTranscriptions = $derived(
    Object.keys(transcriptions).length > 0,
  );
  const terms = $derived(parseQuery(query));
  const foundPages = $derived(matchingPages(transcriptions, terms));
  // Matches of the current page, per block, when it is a found page
  const pageMatches = $derived(
    transcription && foundPages.includes(currentPage)
      ? findPageMatches(
          transcription.blocks.map((block) => block.text),
          terms,
        )
      : undefined,
  );
  const matchedAreas = $derived(
    transcription?.blocks.flatMap((block, index) =>
      block.bbox && pageMatches?.[index]?.length ? [block.bbox] : [],
    ) ?? [],
  );
  const highlight = $derived(
    DEV && hoveredBlock !== null
      ? transcription?.blocks[hoveredBlock]?.bbox
      : undefined,
  );

  let queryUrlTimeout: ReturnType<typeof setTimeout> | undefined;

  function syncUrl() {
    clearTimeout(queryUrlTimeout);
    const url = new URL(window.location.href);
    url.searchParams.set(PAGE_PARAM, String(currentPage));
    const trimmed = query.trim();
    if (trimmed) {
      url.searchParams.set(QUERY_PARAM, trimmed);
    } else {
      url.searchParams.delete(QUERY_PARAM);
    }
    // Replace rather than push: one history entry per issue, not per page
    window.history.replaceState(window.history.state, "", url);
  }

  function goToPage(page: number) {
    if (page < 1 || page > maxPage || page === currentPage) return;
    currentPage = page;
    hoveredBlock = null;
    syncUrl();
  }

  function handlePrevPage() {
    goToPage(currentPage - 1);
  }

  function handleNextPage() {
    goToPage(currentPage + 1);
  }

  function setQuery(value: string) {
    query = value;
    // While typing, update the URL once the input pauses (browsers throttle
    // history updates). Clearing applies at once.
    clearTimeout(queryUrlTimeout);
    if (value.trim()) {
      queryUrlTimeout = setTimeout(syncUrl, 300);
    } else {
      syncUrl();
    }
  }

  onDestroy(() => clearTimeout(queryUrlTimeout));

  function setMode(value: ReadingMode) {
    mode = value;
    imageShownFor = null;
    hoveredBlock = null;
    writePreference(STORAGE_KEYS.mode, value);
  }

  function setTextSize(value: number) {
    textSize = Math.min(Math.max(value, 0), TEXT_SIZES.length - 1);
    writePreference(STORAGE_KEYS.textSize, String(textSize));
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.repeat || e.defaultPrevented) return;
    // Leave modified arrows (text selection, browser shortcuts) and arrows
    // typed in a field to the browser
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (isEditableTarget(e.target)) return;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      handlePrevPage();
    }
    if (e.key === "ArrowRight") {
      e.preventDefault();
      handleNextPage();
    }
  }

  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    const param = params.get(PAGE_PARAM);
    query = params.get(QUERY_PARAM) ?? "";
    if (param !== null) {
      currentPage = parsePageParam(param, maxPage) ?? 1;
      // Normalizes an invalid value to the page actually shown
      syncUrl();
    } else if (foundPages[0] !== undefined) {
      // A search without a page starts on the first page found
      currentPage = foundPages[0];
      syncUrl();
    }
    mode = parseReadingMode(readPreference(STORAGE_KEYS.mode));
    textSize = parseTextSize(readPreference(STORAGE_KEYS.textSize));

    // Shows the viewer, hidden before hydration when the restored state
    // differs from the prerendered one (see src/pages/issues/[...id].astro)
    void tick().then(() =>
      document.documentElement.classList.remove("reader-pending"),
    );
  });
</script>

{#snippet originalPage()}
  <Card.Root class="mx-auto py-0">
    <Card.Content class="p-0">
      <PageImage
        src={currentImage}
        alt={currentAlt}
        class="w-full sm:w-1/2"
        matches={matchedAreas}
      />
    </Card.Content>
  </Card.Root>
{/snippet}

<div data-reader>
  <div class="mb-4 flex justify-center">
    <ReadingModeSelector {mode} onchange={setMode} />
  </div>

  {#if issueHasTranscriptions}
    <IssueSearch
      {query}
      onquerychange={setQuery}
      pages={foundPages}
      active={terms.length > 0}
      {currentPage}
      ongotopage={goToPage}
      class="mb-4"
    />
  {/if}

  {#if mode === "original"}
    {@render originalPage()}
  {:else if mode === "mixed"}
    <Card.Root class="py-0">
      <Card.Content class="grid p-0 md:grid-cols-2">
        <PageImage
          src={currentImage}
          alt={currentAlt}
          class="w-full"
          {highlight}
          matches={matchedAreas}
        />
        <!-- On desktop, the text column takes the height of the image and
             scrolls on its own -->
        <div class="relative border-t md:min-h-96 md:border-t-0 md:border-l">
          <TranscriptionPanel
            page={currentPage}
            {transcription}
            {issueHasTranscriptions}
            {textSize}
            ontextsizechange={setTextSize}
            variant="mixed"
            onblockhover={DEV ? (index) => (hoveredBlock = index) : undefined}
            matches={pageMatches}
            class="md:absolute md:inset-0"
          />
        </div>
      </Card.Content>
    </Card.Root>
  {:else if imageShownFor === currentPage}
    <p class="mb-2 text-center text-sm text-muted-foreground">
      Cette page n'a pas de transcription, voici son image.
    </p>
    {@render originalPage()}
  {:else}
    <Card.Root class="py-0">
      <Card.Content class="p-0">
        <TranscriptionPanel
          page={currentPage}
          {transcription}
          {issueHasTranscriptions}
          {textSize}
          ontextsizechange={setTextSize}
          variant="text"
          matches={pageMatches}
          onshoworiginal={() => (imageShownFor = currentPage)}
        />
      </Card.Content>
    </Card.Root>
  {/if}

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
            onclick={() => goToPage(index + 1)}
            aria-current={currentPage === index + 1 ? "page" : undefined}
            class={`relative w-16 h-16 shrink-0 overflow-hidden rounded cursor-pointer ${currentPage === index + 1 ? "ring-2 ring-primary" : ""}`}
          >
            {#if foundPages.includes(index + 1)}
              <span
                class="absolute top-1 left-1 size-2.5 rounded-full bg-yellow-400 ring-2 ring-background"
                aria-hidden="true"
              ></span>
              <span class="sr-only">Contient la recherche :</span>
            {/if}
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
</div>

<svelte:window onkeydown={handleKeydown} />
