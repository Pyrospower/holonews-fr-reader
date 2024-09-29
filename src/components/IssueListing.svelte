<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import * as Card from "$lib/components/ui/card";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Search } from "lucide-svelte";

  let searchQuery = "";
  let startDate = "";
  let endDate = "";

  // TODO: Use content collections
  const articles: Array<Record<string, any>> = [];
  let filteredArticles = articles.filter((article) =>
    article.title.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  function handleSearch() {
    console.log(
      `Searching for ${searchQuery} between ${startDate} and ${endDate}...`,
    );
  }
</script>

<div class="mb-8">
  <h1 class="text-4xl font-bold mb-4">Latest Issues</h1>
  <form on:submit|preventDefault={handleSearch} class="space-y-4">
    <div class="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
      <Input
        type="search"
        placeholder="Search articles..."
        bind:value={searchQuery}
        class="flex-grow"
      />
      <Button type="submit" size="icon">
        <Search class="w-4 h-4" />
        <span class="sr-only">Search</span>
      </Button>
    </div>
    <div class="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-4">
      <div class="flex-1">
        <Label for="start-date">Start Date</Label>
        <Input
          id="start-date"
          type="date"
          bind:value={startDate}
          class="w-full"
        />
      </div>
      <div class="flex-1">
        <Label for="end-date">End Date</Label>
        <Input id="end-date" type="date" bind:value={endDate} class="w-full" />
      </div>
    </div>
  </form>
</div>
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
  {#if filteredArticles.length > 0}
    {#each filteredArticles as article (article)}
      <Card.Root>
        <Card.Header>
          <Card.Title>{article.title}</Card.Title>
          <Card.Description>
            {article.date.toISOString().split("T")[0]} - {article.description}
          </Card.Description>
        </Card.Header>
        <Card.Content>
          <img
            src="https://placehold.co/200x400/png"
            alt={`First page of ${article.title}`}
            class="w-full h-48 object-cover rounded-md mb-4"
          />
          <p>{article.description}</p>
        </Card.Content>
        <Card.Footer>
          <Button variant="outline">Read More</Button>
        </Card.Footer>
      </Card.Root>
    {/each}
  {:else}
    <p class="text-muted-foreground mt-8">No articles found.</p>
  {/if}
</div>
