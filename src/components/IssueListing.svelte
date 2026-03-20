<script lang="ts">
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import * as Card from "$lib/components/ui/card";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import * as Select from "$lib/components/ui/select";
  import type { CollectionEntry } from "astro:content";
  import SearchIcon from "@lucide/svelte/icons/search";

  let { issues }: { issues: CollectionEntry<"issues">[] } = $props();

  let searchQuery = $state("");
  let startDate = $state("");
  let endDate = $state("");
  let tagFilter = $state<string>("");

  const minDate = $derived(
    issues[issues.length - 1]?.data.date.toISOString().split("T")[0],
  );
  const maxDate = $derived(
    issues[0]?.data.date.toISOString().split("T")[0],
  );

  const tagLabels: Record<string, string> = {
    all: "Tous",
    lite: "Lite",
    special: "Special",
  };

  let filteredIssues = $derived(
    issues.filter((issue: CollectionEntry<"issues">) => {
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
        !tagFilter || tagFilter === "all"
          ? true
          : issue.data.tags.includes(tagFilter);

      return titleMatch && startDateMatch && endDateMatch && tagMatch;
    }),
  );
</script>

<div class="mb-8">
  <h1 class="text-3xl md:text-4xl font-bold mb-4">Derniers numéros</h1>
  <search>
    <form
      onsubmit={(e) => e.preventDefault()}
      class="space-y-4"
    >
      <div class="flex flex-row space-x-2">
        <Input
          type="search"
          placeholder="Chercher un article..."
          bind:value={searchQuery}
          class="grow"
        />
        <Button type="submit" size="icon">
          <SearchIcon class="w-4 h-4" />
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
          <Select.Root type="single" bind:value={tagFilter}>
            <Select.Trigger id="tag-filter" class="w-full">
              {tagFilter ? tagLabels[tagFilter] ?? tagFilter : "Filtrer par tag"}
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="all" label="Tous" />
              {#each ["lite", "special"] as tag (tag)}
                <Select.Item
                  value={tag}
                  label={tag.charAt(0).toUpperCase() + tag.slice(1)}
                />
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
          <Button href={`/issues/${issue.id}`} variant="outline">
            Lire l'article
          </Button>
        </Card.Footer>
      </Card.Root>
    {/each}
  {:else}
    <p class="text-muted-foreground mt-8">Aucun article trouvé.</p>
  {/if}
</div>
