import { isReadable, type SearchDocument } from "$lib/search";
import { transcriptionText } from "$lib/transcriptions";
import type { APIRoute } from "astro";
import { getCollection } from "astro:content";

// Search data of the search page (src/components/SearchPage.svelte), built
// once at build time: the text of every transcribed page. The browser builds
// the index itself, a serialized index would be several times larger.
export const GET: APIRoute = async () => {
  const issues = new Map(
    (await getCollection("issues")).map((entry) => [entry.id, entry.data]),
  );
  const documents: SearchDocument[] = [];
  for (const { data } of await getCollection("transcriptions")) {
    const issue = issues.get(data.issueId);
    if (!issue || !isReadable(data)) continue;
    const text = transcriptionText(data).trim();
    if (text === "") continue;
    documents.push({
      i: data.issueId,
      t: issue.title,
      d: issue.date.toISOString().slice(0, 10),
      p: data.page,
      x: text,
    });
  }
  // Most recent issues first, pages in order: the order of equal results
  documents.sort(
    (a, b) => b.d.localeCompare(a.d) || a.i.localeCompare(b.i) || a.p - b.p,
  );
  return new Response(JSON.stringify(documents), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
};
