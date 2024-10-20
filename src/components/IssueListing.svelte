<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import * as Card from "$lib/components/ui/card";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import type { CollectionEntry } from "astro:content";
  import { Search } from "lucide-svelte";

  export let issues: CollectionEntry<"issues">[];

  let searchQuery = "";
  let startDate = "";
  let endDate = "";

  let filteredIssues = issues.filter((issue: CollectionEntry<"issues">) =>
    issue.data.title.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  function handleSearch() {
    console.log(
      `Searching for ${searchQuery} between ${startDate} and ${endDate}...`,
    );
  }
</script>

<div class="mb-8">
  <h1 class="text-3xl md:text-4xl font-bold mb-4">Derniers numéros</h1>
  <form on:submit|preventDefault={handleSearch} class="space-y-4">
    <div class="flex flex-row space-x-2">
      <Input
        type="search"
        placeholder="Chercher un article..."
        bind:value={searchQuery}
        class="flex-grow"
      />
      <Button type="submit" size="icon">
        <Search class="w-4 h-4" />
        <span class="sr-only">Chercher</span>
      </Button>
    </div>
    <div class="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-4">
      <div class="flex-1">
        <Label for="start-date">Date de début</Label>
        <Input
          id="start-date"
          type="date"
          bind:value={startDate}
          class="w-full"
        />
      </div>
      <div class="flex-1">
        <Label for="end-date">Date de fin</Label>
        <Input id="end-date" type="date" bind:value={endDate} class="w-full" />
      </div>
    </div>
  </form>
</div>
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
  {#if filteredIssues.length > 0}
    {#each filteredIssues as issue (issue)}
      <Card.Root>
        <Card.Header>
          <Card.Title>{issue.data.title}</Card.Title>
          <Card.Description>
            Publié le {issue.data.date.toLocaleDateString("fr-FR", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </Card.Description>
        </Card.Header>
        <Card.Content>
          <img
            src={issue.data.images[0]}
            alt={`Première page de ${issue.data.title}`}
            class="w-full object-cover rounded-md mb-4"
          />
        </Card.Content>
        <Card.Footer>
          <Button variant="outline">Lire</Button>
        </Card.Footer>
      </Card.Root>
    {/each}
  {:else}
    <p class="text-muted-foreground mt-8">Aucun article trouvé.</p>
  {/if}
</div>
