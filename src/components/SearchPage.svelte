<script lang="ts">
  import HighlightedText from "$lib/components/HighlightedText.svelte";
  import { Button } from "$lib/components/ui/button";
  import { PAGE_PARAM } from "$lib/reader";
  import {
    buildExcerpt,
    findMatches,
    parseQuery,
    QUERY_PARAM,
    SEARCH_DATA_URL,
    searchOptions,
    tokenize,
    type SearchDocument,
  } from "$lib/search";
  import LoaderCircleIcon from "@lucide/svelte/icons/loader-circle";
  import SearchIcon from "@lucide/svelte/icons/search";
  import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";
  import XIcon from "@lucide/svelte/icons/x";
  import MiniSearch from "minisearch";
  import { onDestroy, onMount, tick } from "svelte";

  // Results shown at once, then on each "show more"
  const BATCH_SIZE = 20;

  type IndexedDocument = { id: number; x: string };

  let status = $state<"loading" | "ready" | "error">("loading");
  let documents = $state.raw<SearchDocument[]>([]);
  let index = $state.raw<MiniSearch<IndexedDocument> | null>(null);
  let query = $state("");
  let shown = $state(BATCH_SIZE);
  let input = $state<HTMLInputElement | null>(null);
  let list = $state<HTMLOListElement | null>(null);

  const terms = $derived(parseQuery(query));
  const results = $derived(
    index && terms.length > 0 ? index.search(terms.join(" ")) : [],
  );
  const issueCount = $derived(
    new Set(documents.map((document) => document.i)).size,
  );
  const resultIssueCount = $derived(
    new Set(results.map((result) => documents[result.id]?.i)).size,
  );

  const plural = (count: number, word: string) =>
    `${count} ${word}${count > 1 ? "s" : ""}`;

  const summary = $derived.by(() => {
    if (status !== "ready" || terms.length === 0) return "";
    if (results.length === 0) return "Aucune page trouvée";
    return `${plural(results.length, "page")} ${results.length > 1 ? "trouvées" : "trouvée"} dans ${plural(resultIssueCount, "numéro")}`;
  });

  async function load() {
    status = "loading";
    try {
      const response = await fetch(SEARCH_DATA_URL);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as SearchDocument[];
      const miniSearch = new MiniSearch<IndexedDocument>({
        fields: ["x"],
        tokenize,
        // The terms are already normalized by tokenize and parseQuery
        processTerm: (term) => term,
        searchOptions: { ...searchOptions, tokenize: parseQuery },
      });
      // In chunks, to keep the page responsive while indexing
      await miniSearch.addAllAsync(
        data.map((document, id) => ({ id, x: document.x })),
        { chunkSize: 100 },
      );
      documents = data;
      index = miniSearch;
      status = "ready";
    } catch {
      status = "error";
    }
  }

  let urlTimeout: ReturnType<typeof setTimeout> | undefined;

  function syncUrl() {
    const url = new URL(window.location.href);
    const trimmed = query.trim();
    if (trimmed) {
      url.searchParams.set(QUERY_PARAM, trimmed);
    } else {
      url.searchParams.delete(QUERY_PARAM);
    }
    window.history.replaceState(window.history.state, "", url);
  }

  function setQuery(value: string) {
    query = value;
    shown = BATCH_SIZE;
    // Browsers throttle history updates: wait for a pause in the typing
    clearTimeout(urlTimeout);
    urlTimeout = setTimeout(syncUrl, 300);
  }

  function clear() {
    setQuery("");
    input?.focus();
  }

  async function showMore() {
    const first = shown;
    shown += BATCH_SIZE;
    // Keyboard users continue from the first new result
    await tick();
    list?.querySelectorAll("a")[first]?.focus();
  }

  function readerUrl(document: SearchDocument) {
    const params = new URLSearchParams({
      [PAGE_PARAM]: String(document.p),
      [QUERY_PARAM]: query.trim(),
    });
    return `/issues/${document.i}?${params}`;
  }

  function formatDate(date: string) {
    return new Date(`${date}T00:00:00Z`).toLocaleDateString("fr-FR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    });
  }

  onMount(() => {
    query = new URLSearchParams(window.location.search).get(QUERY_PARAM) ?? "";
    input?.focus();
    void load();
  });

  onDestroy(() => clearTimeout(urlTimeout));
</script>

<search class="mb-6">
  <form onsubmit={(e) => e.preventDefault()} class="relative">
    <SearchIcon
      class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      aria-hidden="true"
    />
    <label for="search-query" class="sr-only">
      Rechercher dans les transcriptions
    </label>
    <input
      bind:this={input}
      id="search-query"
      type="search"
      value={query}
      oninput={(e) => setQuery(e.currentTarget.value)}
      placeholder="Un nom, un mot, une phrase…"
      autocomplete="off"
      enterkeyhint="search"
      aria-describedby="search-status"
      class="h-10 w-full min-w-0 rounded-lg border border-input bg-transparent py-1 pr-10 pl-9 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 [&::-webkit-search-cancel-button]:appearance-none"
    />
    {#if query}
      <Button
        variant="ghost"
        size="icon-sm"
        onclick={clear}
        title="Effacer la recherche"
        class="absolute top-1/2 right-1.5 -translate-y-1/2"
      >
        <XIcon aria-hidden="true" />
        <span class="sr-only">Effacer la recherche</span>
      </Button>
    {/if}
  </form>

  <div
    id="search-status"
    class="mt-3 min-h-5 text-sm text-muted-foreground"
    aria-live="polite"
  >
    {#if status === "loading"}
      <p class="flex items-center gap-2">
        <LoaderCircleIcon
          class="size-4 shrink-0 motion-safe:animate-spin"
          aria-hidden="true"
        />
        Chargement des transcriptions…
      </p>
    {:else if status === "error"}
      <!-- The retry button lives outside of the live region -->
      <p class="flex items-center gap-2 text-destructive dark:text-red-400">
        <TriangleAlertIcon class="size-4 shrink-0" aria-hidden="true" />
        Les transcriptions n'ont pas pu être chargées.
      </p>
    {:else if summary}
      <p class="font-medium text-foreground">{summary}</p>
    {:else if query.trim()}
      <p>Tapez au moins un mot de deux lettres.</p>
    {:else}
      <p>
        Cherchez dans le texte des {plural(documents.length, "page")} transcrites
        de {plural(issueCount, "numéro")}. Les accents et les majuscules sont
        ignorés.
      </p>
    {/if}
  </div>
  {#if status === "error"}
    <Button variant="outline" onclick={load} class="mt-3">Réessayer</Button>
  {/if}
</search>

{#if status === "ready" && terms.length > 0}
  {#if results.length === 0}
    <div class="rounded-xl border border-dashed px-6 py-10 text-center">
      <p class="font-medium">
        Aucune page ne contient «&nbsp;{query.trim()}&nbsp;».
      </p>
      <p class="mt-1 text-sm text-muted-foreground">
        Vérifiez l'orthographe ou essayez avec moins de mots.
      </p>
    </div>
  {:else}
    <ol bind:this={list} class="space-y-3">
      {#each results.slice(0, shown) as result (result.id)}
        {@const document = documents[result.id]}
        {#if document}
          <li>
            <a
              href={readerUrl(document)}
              class="group block rounded-xl bg-card px-4 py-3 text-card-foreground ring-1 ring-foreground/10 transition-colors outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span
                class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5"
              >
                <span class="font-medium group-hover:underline">
                  {document.t}
                </span>
                <span class="text-sm text-muted-foreground">
                  Page {document.p} ·
                  <time datetime={document.d}>{formatDate(document.d)}</time>
                </span>
              </span>
              <span class="mt-1.5 block text-sm leading-relaxed text-muted-foreground">
                <HighlightedText
                  segments={buildExcerpt(
                    document.x,
                    findMatches(document.x, terms),
                  )}
                />
              </span>
            </a>
          </li>
        {/if}
      {/each}
    </ol>
    {#if results.length > shown}
      <div class="mt-6 flex justify-center">
        <Button variant="outline" onclick={showMore}>
          Afficher plus de résultats ({results.length - shown} restants)
        </Button>
      </div>
    {/if}
  {/if}
{/if}
