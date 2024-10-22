<script lang="ts">
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import * as Card from "$lib/components/ui/card";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import * as Select from "$lib/components/ui/select";
  import type { CollectionEntry } from "astro:content";
  import { Search } from "lucide-svelte";

  export let issues: CollectionEntry<"issues">[];

  let searchQuery = "";
  let startDate = "";
  let endDate = "";
  let tagFilter = "all";

  const minDate = issues[issues.length - 1]?.data.date
    .toISOString()
    .split("T")[0];
  const maxDate = issues[0]?.data.date.toISOString().split("T")[0];

  let filteredIssues = issues.filter((issue: CollectionEntry<"issues">) =>
    issue.data.title.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  function handleSearch() {
    filteredIssues = issues.filter((issue: CollectionEntry<"issues">) => {
      const titleMatch = issue.data.title
        .toLowerCase()
        .includes(searchQuery.toLowerCase());
      const startDateMatch = startDate
        ? issue.data.date >= new Date(startDate)
        : true;
      const endDateMatch = endDate
        ? issue.data.date <= new Date(endDate)
        : true;

      const tagMatch =
        tagFilter === "all" ? true : issue.data.tags.includes(tagFilter);

      return titleMatch && startDateMatch && endDateMatch && tagMatch;
    });
  }
</script>

<div class="mb-8">
  <h1 class="text-3xl md:text-4xl font-bold mb-4">Derniers numéros</h1>
  <search>
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
      <div
        class="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-4"
      >
        <div class="flex-1">
          <Label for="start-date">Date de début</Label>
          <Input
            id="start-date"
            type="date"
            min={minDate}
            max={maxDate}
            bind:value={startDate}
            class="w-full"
          />
        </div>
        <div class="flex-1">
          <Label for="end-date">Date de fin</Label>
          <Input
            id="end-date"
            type="date"
            min={minDate}
            max={maxDate}
            bind:value={endDate}
            class="w-full"
          />
        </div>
        <div class="flex-1">
          <Label for="tag-filter">Filtrer par tag</Label>
          <Select.Root
            onSelectedChange={(v) => {
              if (typeof v?.value === "string") {
                tagFilter = v.value;
              }
            }}
          >
            <Select.Trigger id="tag-filter">
              <Select.Value placeholder="Filtrer par tag" />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="all">Tous</Select.Item>
              {#each ["lite", "special"] as tag (tag)}
                <Select.Item value={tag}
                  >{tag.charAt(0).toUpperCase() + tag.slice(1)}</Select.Item
                >
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
      </div>
    </form>
  </search>
</div>
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
  {#if filteredIssues.length > 0}
    {#each filteredIssues as issue (issue)}
      <Card.Root>
        <Card.Header>
          <Card.Title>{issue.data.title}</Card.Title>
          <Card.Description>
            Publié le <time datetime={issue.data.date.toISOString()}>
              {issue.data.date.toLocaleDateString("fr-FR", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </time>
            {#if issue.data.tags[0]}
              <Badge variant="secondary" class="ml-2">
                {issue.data.tags[0].charAt(0).toUpperCase() +
                  issue.data.tags[0].slice(1)}
              </Badge>
            {/if}
          </Card.Description>
        </Card.Header>
        <Card.Content>
          <img
            src={issue.data.images[0]}
            alt={`Couverture de ${issue.data.title}`}
            class="w-full object-cover rounded-md mb-4"
          />
        </Card.Content>
        <Card.Footer>
          <Button href={`/issues/${issue.slug}`} variant="outline">
            Lire l'article
          </Button>
        </Card.Footer>
      </Card.Root>
    {/each}
  {:else}
    <p class="text-muted-foreground mt-8">Aucun article trouvé.</p>
  {/if}
</div>
