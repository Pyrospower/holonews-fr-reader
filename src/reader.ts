// Pure helpers for the issue reader (src/components/IssueViewer.svelte), kept
// out of the components so they can be unit tested.

export const READING_MODES = ["original", "mixed", "text"] as const;
export type ReadingMode = (typeof READING_MODES)[number];
export const DEFAULT_READING_MODE: ReadingMode = "original";

// Font sizes of the transcription text, in rem. The stored preference is an
// index in this list.
export const TEXT_SIZES = [0.875, 1, 1.125, 1.25, 1.5] as const;
export const DEFAULT_TEXT_SIZE = 1;

// Shared by every issue. Also read by the inline script of
// src/pages/issues/[...id].astro, before hydration.
export const STORAGE_KEYS = {
  mode: "holonews-reader:mode",
  textSize: "holonews-reader:text-size",
} as const;

export const PAGE_PARAM = "page";

// Returns the 1-based page number in `value` if it is a valid page of an issue
// of `pageCount` pages, null otherwise (missing, not an integer, out of range).
export function parsePageParam(value: string | null, pageCount: number) {
  if (value === null || !/^\d+$/.test(value)) return null;
  const page = Number(value);
  return page >= 1 && page <= pageCount ? page : null;
}

export function parseReadingMode(value: string | null): ReadingMode {
  return READING_MODES.find((mode) => mode === value) ?? DEFAULT_READING_MODE;
}

export function parseTextSize(value: string | null) {
  if (value === null || !/^\d+$/.test(value)) return DEFAULT_TEXT_SIZE;
  const index = Number(value);
  return index < TEXT_SIZES.length ? index : DEFAULT_TEXT_SIZE;
}

type StorageLike = Pick<Storage, "getItem" | "setItem">;

// localStorage can be missing or throw (private browsing, blocked cookies,
// quota): the reader must keep working with the defaults.
function getStorage(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function readPreference(
  key: string,
  storage: StorageLike | null = getStorage(),
) {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writePreference(
  key: string,
  value: string,
  storage: StorageLike | null = getStorage(),
) {
  try {
    storage?.setItem(key, value);
  } catch {
    // Not persisted, the preference still applies to the current page.
  }
}

// Whether an arrow key pressed on `target` belongs to the element (text
// field, select, editable content) rather than to the page navigation.
export function isEditableTarget(target: EventTarget | null) {
  if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement)) {
    return false;
  }
  return (
    target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
  );
}
