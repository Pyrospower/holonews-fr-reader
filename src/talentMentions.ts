// The talents mentioned on every transcribed page, computed once per build
// and shared by the talent pages (src/pages/talents) and the reader
// (src/pages/issues/[...id].astro).

import { getCollection, type CollectionEntry } from "astro:content";

import { buildExcerpt, isReadable, type TextSegment } from "./search";
import {
  findTalentMentions,
  mentionedTalents,
  mentionQuery,
  TALENTS,
  type Talent,
} from "./talents";
import { transcriptionText, type Transcription } from "./transcriptions";

// A page that mentions a talent
export interface PageMention {
  page: number;
  // Around the first mention, the mentions highlighted
  excerpt: TextSegment[];
  // Search (?q=) that highlights the talent in the reader
  query: string;
}

export interface IssueMentions {
  issue: CollectionEntry<"issues">;
  pages: PageMention[];
}

export interface TalentMentions {
  talent: Talent;
  // Oldest issue first, pages in order
  issues: IssueMentions[];
  pageCount: number;
}

// A talent as linked under a page of the reader
export interface TalentLink {
  slug: string;
  name: string;
}

export interface MentionIndex {
  // Talents mentioned at least once, in dictionary order
  talents: TalentMentions[];
  // Issue id → 1-based page number → talents, in order of first mention
  pages: Map<string, Record<number, TalentLink[]>>;
}

let index: Promise<MentionIndex> | undefined;

export function getMentionIndex() {
  index ??= buildMentionIndex();
  return index;
}

async function buildMentionIndex(): Promise<MentionIndex> {
  const issues = (await getCollection("issues")).sort(
    (a, b) =>
      a.data.date.getTime() - b.data.date.getTime() || a.id.localeCompare(b.id),
  );
  const transcriptionsByIssue = new Map<string, Transcription[]>();
  for (const { data } of await getCollection("transcriptions")) {
    const list = transcriptionsByIssue.get(data.issueId) ?? [];
    list.push(data);
    transcriptionsByIssue.set(data.issueId, list);
  }
  for (const list of transcriptionsByIssue.values()) {
    list.sort((a, b) => a.page - b.page);
  }
  const talents = new Map(TALENTS.map((talent) => [talent.slug, talent]));
  const byTalent = new Map<string, Map<string, IssueMentions>>();
  const pages = new Map<string, Record<number, TalentLink[]>>();

  for (const issue of issues) {
    const issuePages: Record<number, TalentLink[]> = {};
    for (const transcription of transcriptionsByIssue.get(issue.id) ?? []) {
      if (!isReadable(transcription)) continue;
      const text = transcriptionText(transcription);
      const mentions = findTalentMentions(text);
      const links: TalentLink[] = [];
      for (const slug of mentionedTalents(mentions)) {
        const talent = talents.get(slug);
        if (!talent) continue;
        links.push({ slug, name: talent.name });
        const ranges = mentions.filter((mention) => mention.slug === slug);
        const issuesOfTalent = byTalent.get(slug) ?? new Map();
        byTalent.set(slug, issuesOfTalent);
        const entry = issuesOfTalent.get(issue.id) ?? { issue, pages: [] };
        issuesOfTalent.set(issue.id, entry);
        entry.pages.push({
          page: transcription.page,
          excerpt: buildExcerpt(text, ranges),
          query: mentionQuery(text, mentions, slug),
        });
      }
      if (links.length > 0) issuePages[transcription.page] = links;
    }
    pages.set(issue.id, issuePages);
  }

  return {
    talents: TALENTS.flatMap((talent) => {
      const issuesOfTalent = [...(byTalent.get(talent.slug)?.values() ?? [])];
      const pageCount = issuesOfTalent.reduce(
        (count, { pages }) => count + pages.length,
        0,
      );
      return pageCount > 0
        ? [{ talent, issues: issuesOfTalent, pageCount }]
        : [];
    }),
    pages,
  };
}
