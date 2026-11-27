<script lang="ts">
  import HighlightedText from "$lib/components/HighlightedText.svelte";
  import { Button } from "$lib/components/ui/button";
  import { TEXT_SIZES } from "$lib/reader";
  import { highlightSegments, type MatchRange } from "$lib/search";
  import { transcriptionText, type PageTranscription } from "$lib/transcriptions";
  import { cn } from "$lib/utils";
  import AArrowDownIcon from "@lucide/svelte/icons/a-arrow-down";
  import AArrowUpIcon from "@lucide/svelte/icons/a-arrow-up";
  import CheckIcon from "@lucide/svelte/icons/check";
  import CopyIcon from "@lucide/svelte/icons/copy";
  import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";
  import { onDestroy, tick } from "svelte";

  let {
    page,
    transcription,
    issueHasTranscriptions,
    textSize,
    ontextsizechange,
    variant,
    onshoworiginal,
    onblockhover,
    matches,
    class: className,
  }: {
    page: number;
    transcription: PageTranscription | undefined;
    issueHasTranscriptions: boolean;
    textSize: number;
    ontextsizechange: (size: number) => void;
    // "mixed": next to the image, the text scrolls inside the panel.
    // "text": alone, in a narrow reading column.
    variant: "mixed" | "text";
    onshoworiginal?: () => void;
    // Development aid, see IssueViewer.svelte
    onblockhover?: (index: number | null) => void;
    // Search matches to highlight, per block (same order as the blocks)
    matches?: MatchRange[][] | undefined;
    class?: string;
  } = $props();

  const readable = $derived(
    transcription !== undefined &&
      transcription.status !== "unavailable" &&
      transcription.blocks.length > 0,
  );

  let copyState = $state<"idle" | "copied" | "failed">("idle");
  let copyTimeout: ReturnType<typeof setTimeout> | undefined;

  function setCopyState(state: typeof copyState) {
    clearTimeout(copyTimeout);
    copyState = state;
    if (state !== "idle") {
      copyTimeout = setTimeout(() => (copyState = "idle"), 2000);
    }
  }

  // The feedback belongs to the page it was given for
  $effect.pre(() => {
    void page;
    setCopyState("idle");
  });

  onDestroy(() => clearTimeout(copyTimeout));

  // navigator.clipboard only exists in secure contexts (not on a LAN address
  // during development, for instance)
  function copyWithSelection(text: string) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    try {
      return document.execCommand("copy");
    } finally {
      textarea.remove();
    }
  }

  async function copy() {
    if (!transcription || !readable) return;
    const text = transcriptionText(transcription);
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      } else if (!copyWithSelection(text)) {
        throw new Error("Copy command refused");
      }
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  // Reading column of the Texte mode, shared by the toolbar and the text
  const column = $derived(variant === "text" && "mx-auto w-full max-w-xl");

  const copyLabel = $derived(
    {
      idle: "Copier le texte",
      copied: "Texte copié",
      failed: "Échec de la copie",
    }[copyState],
  );
</script>

<section
  aria-label="Transcription de la page"
  class={cn("flex flex-col", className)}
>
  <div class="border-b px-4 py-2 sm:px-6">
    <div
      class={cn("flex flex-wrap items-center gap-x-4 gap-y-2", column)}
    >
      <Button
        variant="outline"
        size="sm"
        onclick={copy}
        disabled={!readable}
      >
        {#if copyState === "copied"}
          <CheckIcon aria-hidden="true" />
        {:else}
          <CopyIcon aria-hidden="true" />
        {/if}
        {copyLabel}
      </Button>
      <span class="sr-only" aria-live="polite">
        {copyState === "idle" ? "" : copyLabel}
      </span>
      <div role="group" aria-label="Taille du texte" class="flex gap-1">
        <Button
          variant="outline"
          size="icon-sm"
          onclick={() => ontextsizechange(textSize - 1)}
          disabled={textSize === 0}
          title="Réduire le texte"
        >
          <AArrowDownIcon aria-hidden="true" />
          <span class="sr-only">Réduire le texte</span>
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          onclick={() => ontextsizechange(textSize + 1)}
          disabled={textSize === TEXT_SIZES.length - 1}
          title="Agrandir le texte"
        >
          <AArrowUpIcon aria-hidden="true" />
          <span class="sr-only">Agrandir le texte</span>
        </Button>
      </div>
      {#if readable && transcription?.status === "auto"}
        <p class="flex items-center gap-1.5 text-xs text-muted-foreground">
          <TriangleAlertIcon class="size-3.5 shrink-0" aria-hidden="true" />
          Transcription automatique, peut contenir des erreurs
        </p>
      {/if}
    </div>
  </div>

  <div
    class={cn(
      "min-h-0 flex-1 px-4 py-5 sm:px-6",
      variant === "mixed" && "overflow-y-auto",
    )}
    {@attach (node) => {
      // Start each page at the top of its text
      void page;
      node.scrollTop = 0;
    }}
    {@attach (node) => {
      // Next to the image, bring the first search match into view
      if (variant !== "mixed" || !matches?.some((ranges) => ranges.length)) {
        return;
      }
      void page;
      void tick().then(() => {
        const mark = node.querySelector("mark");
        if (!mark) return;
        const top =
          mark.getBoundingClientRect().top - node.getBoundingClientRect().top;
        if (top > node.clientHeight * 0.75) {
          node.scrollTop += top - node.clientHeight / 3;
        }
      });
    }}
  >
    {#if readable && transcription}
      <div
        lang="fr"
        class={cn(
          "space-y-[0.9em] leading-relaxed select-text",
          column,
        )}
        style:font-size="{TEXT_SIZES[textSize]}rem"
      >
        {#each transcription.blocks as block, index (index)}
          {@const hoverable = onblockhover !== undefined && !!block.bbox}
          {@const hover = hoverable
            ? {
                onmouseenter: () => onblockhover?.(index),
                onmouseleave: () => onblockhover?.(null),
              }
            : {}}
          {@const hoverClass =
            hoverable && "-mx-1 rounded px-1 hover:bg-red-500/10"}
          {@const ranges = matches?.[index] ?? []}
          {#if block.type === "heading"}
            <h3
              {...hover}
              class={cn(
                "pt-[0.4em] text-[1.3em] leading-snug font-bold whitespace-pre-line first:pt-0",
                hoverClass,
              )}
            >{#if ranges.length}<HighlightedText
                  segments={highlightSegments(block.text, ranges)}
                />{:else}{block.text}{/if}</h3>
          {:else}
            <p
              {...hover}
              class={cn(
                "whitespace-pre-line",
                block.type === "other" &&
                  "text-[0.875em] leading-normal text-muted-foreground",
                hoverClass,
              )}
            >{#if ranges.length}<HighlightedText
                  segments={highlightSegments(block.text, ranges)}
                />{:else}{block.text}{/if}</p>
          {/if}
        {/each}
      </div>
    {:else}
      <div
        class={cn(
          "flex flex-col items-center gap-3 py-8 text-center text-muted-foreground",
          column,
        )}
      >
        <p>
          {#if !issueHasTranscriptions}
            Ce numéro n'a pas encore de transcription.
          {:else}
            Cette page n'a pas de transcription.
          {/if}
        </p>
        {#if onshoworiginal}
          <Button
            variant="outline"
            class="text-foreground"
            onclick={onshoworiginal}
          >
            Afficher l'image de la page
          </Button>
        {/if}
      </div>
    {/if}
  </div>
</section>
