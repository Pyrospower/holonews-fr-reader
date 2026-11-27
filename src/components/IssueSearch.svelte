<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { cn } from "$lib/utils";
  import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
  import ChevronUpIcon from "@lucide/svelte/icons/chevron-up";
  import SearchIcon from "@lucide/svelte/icons/search";
  import XIcon from "@lucide/svelte/icons/x";

  let {
    query,
    onquerychange,
    pages,
    active,
    currentPage,
    ongotopage,
    class: className,
  }: {
    query: string;
    onquerychange: (query: string) => void;
    // Sorted pages of the issue that match the query
    pages: number[];
    // Whether the query has searchable words
    active: boolean;
    currentPage: number;
    ongotopage: (page: number) => void;
    class?: string;
  } = $props();

  let input = $state<HTMLInputElement | null>(null);

  const previousPage = $derived(pages.findLast((page) => page < currentPage));
  const nextPage = $derived(pages.find((page) => page > currentPage));
  const position = $derived(pages.indexOf(currentPage) + 1);

  const status = $derived.by(() => {
    if (!active) return "";
    if (pages.length === 0) return "Aucune page trouvée";
    const found = pages.length === 1 ? "page trouvée" : "pages trouvées";
    return position > 0
      ? `${position} sur ${pages.length} ${found}`
      : `${pages.length} ${found}`;
  });

  function clear() {
    onquerychange("");
    input?.focus();
  }

  // Enter goes to the next page found, Shift+Enter to the previous one,
  // wrapping around at the ends of the issue
  function handleKeydown(e: KeyboardEvent) {
    if (e.key !== "Enter" || pages.length === 0) return;
    e.preventDefault();
    const target = e.shiftKey
      ? (previousPage ?? pages.at(-1))
      : (nextPage ?? pages[0]);
    if (target !== undefined) ongotopage(target);
  }
</script>

<search
  class={cn(
    "flex flex-wrap items-center justify-center gap-x-3 gap-y-2",
    className,
  )}
>
  <div class="relative w-full max-w-xs">
    <SearchIcon
      class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
      aria-hidden="true"
    />
    <label for="issue-search" class="sr-only">Rechercher dans ce numéro</label>
    <input
      bind:this={input}
      id="issue-search"
      type="search"
      value={query}
      oninput={(e) => onquerychange(e.currentTarget.value)}
      onkeydown={handleKeydown}
      placeholder="Rechercher dans ce numéro"
      autocomplete="off"
      enterkeyhint="search"
      class="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent py-1 pr-8 pl-8 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30 [&::-webkit-search-cancel-button]:appearance-none"
    />
    {#if query}
      <Button
        variant="ghost"
        size="icon-xs"
        onclick={clear}
        title="Effacer la recherche"
        class="absolute top-1/2 right-1 -translate-y-1/2"
      >
        <XIcon aria-hidden="true" />
        <span class="sr-only">Effacer la recherche</span>
      </Button>
    {/if}
  </div>
  <!-- Always rendered, so that the count is announced as it changes -->
  <div class="flex items-center gap-1">
    <p
      class="min-w-0 text-sm text-muted-foreground tabular-nums"
      aria-live="polite"
    >
      {status}
    </p>
    {#if active}
      <Button
        variant="outline"
        size="icon-sm"
        onclick={() => previousPage !== undefined && ongotopage(previousPage)}
        disabled={previousPage === undefined}
        title="Page trouvée précédente"
        class="ml-1"
      >
        <ChevronUpIcon aria-hidden="true" />
        <span class="sr-only">Page trouvée précédente</span>
      </Button>
      <Button
        variant="outline"
        size="icon-sm"
        onclick={() => nextPage !== undefined && ongotopage(nextPage)}
        disabled={nextPage === undefined}
        title="Page trouvée suivante"
      >
        <ChevronDownIcon aria-hidden="true" />
        <span class="sr-only">Page trouvée suivante</span>
      </Button>
    {/if}
  </div>
</search>
