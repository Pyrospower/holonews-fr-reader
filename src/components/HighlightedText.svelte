<script lang="ts">
  import type { TextSegment } from "$lib/search";

  // Text with the search matches in <mark>. Rendered without any whitespace
  // of its own, so that it can sit in a whitespace-pre-line element.
  let { segments }: { segments: TextSegment[] } = $props();
</script>

{#each segments as segment, index (index)}{#if segment.match}<mark
      class="rounded-[0.2em] bg-yellow-200 text-foreground [box-decoration-break:clone] dark:bg-yellow-400/35"
      >{segment.text}</mark
    >{:else}{segment.text}{/if}{/each}
