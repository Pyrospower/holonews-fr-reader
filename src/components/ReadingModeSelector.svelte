<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import type { ReadingMode } from "$lib/reader";
  import Columns2Icon from "@lucide/svelte/icons/columns-2";
  import FileTextIcon from "@lucide/svelte/icons/file-text";
  import ImageIcon from "@lucide/svelte/icons/image";

  let {
    mode,
    onchange,
  }: { mode: ReadingMode; onchange: (mode: ReadingMode) => void } = $props();

  const options = [
    { value: "original", label: "Original", icon: ImageIcon },
    { value: "mixed", label: "Mixte", icon: Columns2Icon },
    { value: "text", label: "Texte", icon: FileTextIcon },
  ] as const;
</script>

<div role="group" aria-label="Mode de lecture" class="inline-flex">
  {#each options as option (option.value)}
    <Button
      variant={mode === option.value ? "default" : "outline"}
      aria-pressed={mode === option.value}
      onclick={() => onchange(option.value)}
      class="rounded-none not-first:-ml-px first:rounded-l-lg last:rounded-r-lg"
    >
      <option.icon aria-hidden="true" />
      {option.label}
    </Button>
  {/each}
</div>
