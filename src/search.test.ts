import { describe, expect, test } from "bun:test";
import MiniSearch from "minisearch";

import {
  buildExcerpt,
  findMatches,
  findPageMatches,
  highlightSegments,
  matchingPages,
  normalize,
  normalizeWithMap,
  parseQuery,
  searchOptions,
  termMatches,
  textMatches,
  tokenize,
  type MatchRange,
  type TextSegment,
} from "./search";
import type { PageTranscription } from "./transcriptions";

// The matched pieces of text, in order
function matchedText(text: string, ranges: MatchRange[]) {
  return ranges.map(({ start, end }) => text.slice(start, end));
}

function render(segments: TextSegment[]) {
  return segments
    .map(({ text, match }) => (match ? `[${text}]` : text))
    .join("");
}

describe("normalize", () => {
  test("ignores case and accents", () => {
    expect(normalize("École")).toBe("ecole");
    expect(normalize("PÉKORA")).toBe("pekora");
    expect(normalize("Noël à l'hôtel")).toBe("noel a l'hotel");
  });

  test("expands ligatures and compatibility characters", () => {
    expect(normalize("Œuvre")).toBe("oeuvre");
    expect(normalize("cœur")).toBe("coeur");
    expect(normalize("ex æquo")).toBe("ex aequo");
    expect(normalize("ﬁn")).toBe("fin");
  });

  test("handles decomposed accents", () => {
    expect(normalize("école")).toBe("ecole");
  });
});

describe("normalizeWithMap", () => {
  test("gives the same text as normalize", () => {
    for (const text of ["Œuvre d'Élise", "été ﬁn", "İstanbul"]) {
      expect(normalizeWithMap(text).normalized).toBe(normalize(text));
    }
  });

  test("maps each normalized unit back to its source", () => {
    const { normalized, starts, ends } = normalizeWithMap("cœur");
    expect(normalized).toBe("coeur");
    expect(starts).toEqual([0, 1, 1, 2, 3]);
    expect(ends).toEqual([1, 2, 2, 3, 4]);
  });

  test("attaches combining marks to the previous character", () => {
    const { starts, ends } = normalizeWithMap("ét");
    expect(starts).toEqual([0, 2]);
    expect(ends).toEqual([2, 3]);
  });
});

describe("tokenize", () => {
  test("splits on punctuation, apostrophes and hyphens", () => {
    expect(tokenize("L’École de Hoshimachi-Suisei, 3D !")).toEqual([
      "l",
      "ecole",
      "de",
      "hoshimachi",
      "suisei",
      "3d",
    ]);
  });

  test("keeps a trailing plus sign", () => {
    expect(tokenize("La+ et Laplus, la+1")).toEqual([
      "la+",
      "et",
      "laplus",
      "la",
      "1",
    ]);
  });
});

describe("parseQuery", () => {
  test("normalizes and deduplicates the words", () => {
    expect(parseQuery("  Pékora  PEKORA concert ")).toEqual([
      "pekora",
      "concert",
    ]);
  });

  test("drops elisions and single letters but keeps digits", () => {
    expect(parseQuery("l'école")).toEqual(["ecole"]);
    expect(parseQuery("jusqu’à l’aube")).toEqual(["aube"]);
    expect(parseQuery("qu'elle")).toEqual(["elle"]);
    expect(parseQuery("a b 3")).toEqual(["3"]);
    expect(parseQuery("aujourd'hui")).toEqual(["aujourd", "hui"]);
  });

  test("does not mistake La+ for the article la", () => {
    expect(parseQuery("La+")).toEqual(["la+"]);
    const text = "La+ a vu la mer avec Lamy.";
    expect(matchedText(text, findMatches(text, parseQuery("La+")))).toEqual([
      "La+",
    ]);
  });

  test("returns nothing for an empty or punctuation-only query", () => {
    expect(parseQuery("")).toEqual([]);
    expect(parseQuery(" ?! … ")).toEqual([]);
  });
});

describe("termMatches", () => {
  test("matches prefixes", () => {
    expect(termMatches("pekora", "pek")).toBe(true);
    expect(termMatches("pekora", "pekora")).toBe(true);
    expect(termMatches("pekora", "kora")).toBe(false);
  });

  test("tolerates small typos in long enough terms", () => {
    expect(termMatches("concert", "concrt")).toBe(true);
    expect(termMatches("anniversaire", "aniversare")).toBe(true);
    expect(termMatches("concert", "cnocrt")).toBe(false);
    // No typo tolerance under 5 letters: "mars" is not "mais"
    expect(termMatches("mais", "mars")).toBe(false);
  });
});

describe("findMatches", () => {
  test("finds the words in the original text", () => {
    const text = "L'École de Pékora, l'ECOLE !";
    const ranges = findMatches(text, parseQuery("ecole"));
    expect(matchedText(text, ranges)).toEqual(["École", "ECOLE"]);
  });

  test("highlights whole words, ligatures included", () => {
    const text = "Une œuvre et des Œuvres";
    expect(matchedText(text, findMatches(text, ["oeuvre"]))).toEqual([
      "œuvre",
      "Œuvres",
    ]);
    expect(matchedText(text, findMatches(text, ["oeu"]))).toEqual([
      "œuvre",
      "Œuvres",
    ]);
  });

  test("keeps decomposed accents inside the match", () => {
    const text = "Une école.";
    expect(matchedText(text, findMatches(text, ["ecole"]))).toEqual(["école"]);
  });

  test("does not match across apostrophes", () => {
    const text = "Aujourd’hui, l’hôtel d’Élise";
    expect(matchedText(text, findMatches(text, ["hotel", "elise"]))).toEqual([
      "hôtel",
      "Élise",
    ]);
  });

  test("highlights typos only when the term is not found as such", () => {
    const text = "L'école s'est écoulée";
    expect(matchedText(text, findMatches(text, ["ecole"]))).toEqual(["école"]);
    const typo = "Le temps s'est écoulé";
    expect(matchedText(typo, findMatches(typo, ["ecole"]))).toEqual(["écoulé"]);
  });

  test("finds nothing without terms", () => {
    expect(findMatches("Pékora", [])).toEqual([]);
  });
});

describe("findPageMatches", () => {
  test("drops typos when a block of the page has the term", () => {
    expect(
      findPageMatches(["Une école", "Il s'est écoulé", "Rien"], ["ecole"]),
    ).toEqual([[{ start: 4, end: 9 }], [], []]);
    expect(findPageMatches(["Il s'est écoulé", "Rien"], ["ecole"])).toEqual([
      [{ start: 9, end: 15 }],
      [],
    ]);
  });
});

describe("textMatches", () => {
  test("requires every term", () => {
    const text = "Pékora a fêté son anniversaire";
    expect(textMatches(text, ["pekora", "anniv"])).toBe(true);
    expect(textMatches(text, ["pekora", "concert"])).toBe(false);
    expect(textMatches(text, [])).toBe(false);
  });
});

describe("matchingPages", () => {
  const page = (
    text: string,
    status: PageTranscription["status"] = "corrected",
  ): PageTranscription => ({
    status,
    blocks: [{ type: "paragraph", text }],
    lang: "fr",
  });

  test("lists the readable pages that contain every term, in order", () => {
    const transcriptions = {
      12: page("Pékora et Marine en concert"),
      2: page("Un concert de Pékora"),
      3: page("Pékora seule"),
      5: page("Pékora en concert", "unavailable"),
      7: page("Le concert de pekora", "auto"),
    };
    expect(matchingPages(transcriptions, parseQuery("pékora concert"))).toEqual(
      [2, 7, 12],
    );
    expect(matchingPages(transcriptions, [])).toEqual([]);
  });
});

describe("highlightSegments", () => {
  test("alternates plain and highlighted text", () => {
    const text = "Une École, une école";
    expect(render(highlightSegments(text, findMatches(text, ["ecole"])))).toBe(
      "Une [École], une [école]",
    );
    expect(highlightSegments("abc", [])).toEqual([
      { text: "abc", match: false },
    ]);
    expect(highlightSegments("", [])).toEqual([]);
  });
});

describe("buildExcerpt", () => {
  const words = Array.from({ length: 80 }, (_, i) => `mot${i}`);

  test("cuts around the first match at word boundaries", () => {
    const text = [...words.slice(0, 40), "Pékora", ...words.slice(40)].join(
      " ",
    );
    const excerpt = render(buildExcerpt(text, findMatches(text, ["pekora"])));
    expect(excerpt.startsWith("… mot")).toBe(true);
    expect(excerpt.endsWith(" …")).toBe(true);
    expect(excerpt).toContain("[Pékora]");
    for (const word of excerpt
      .replace(/[…[\]]/g, "")
      .trim()
      .split(" ")) {
      expect(word === "Pékora" || words.includes(word)).toBe(true);
    }
  });

  test("puts the text on one line and keeps short texts whole", () => {
    const text = "PÉKORA\n\nLe  concert\nde Pékora";
    expect(render(buildExcerpt(text, findMatches(text, ["pekora"])))).toBe(
      "[PÉKORA] Le concert de [Pékora]",
    );
  });

  test("starts the text when there is no match", () => {
    const text = words.join(" ");
    const excerpt = render(buildExcerpt(text, []));
    expect(excerpt.startsWith("mot0 mot1")).toBe(true);
    expect(excerpt.endsWith(" …")).toBe(true);
  });
});

describe("MiniSearch options", () => {
  const documents = [
    "L'École de Pékora",
    "Le concert de Suisei",
    "Pékora en concert pour son anniversaire",
    "Pekoland",
    "Une œuvre",
  ];
  const index = new MiniSearch<{ id: number; x: string }>({
    fields: ["x"],
    tokenize,
    processTerm: (term) => term,
    searchOptions: { ...searchOptions, tokenize: parseQuery },
  });
  index.addAll(documents.map((x, id) => ({ id, x })));
  const search = (query: string) => index.search(query).map(({ id }) => id);

  test("finds the same pages as textMatches", () => {
    for (const query of [
      "ecole",
      "pekora",
      "pek",
      "concert pekora",
      "concrt",
      "OEUVRE",
      "xyzzy",
    ]) {
      const terms = parseQuery(query);
      const expected = documents
        .map((text, id) => (textMatches(text, terms) ? id : -1))
        .filter((id) => id !== -1);
      expect(search(query).sort()).toEqual(expected);
    }
  });

  test("ranks exact matches before prefix and fuzzy ones", () => {
    const ranked = new MiniSearch<{ id: number; x: string }>({
      fields: ["x"],
      tokenize,
      processTerm: (term) => term,
      searchOptions: { ...searchOptions, tokenize: parseQuery },
    });
    ranked.addAll(
      [
        "Un concerto",
        "Le concerf",
        "Le grand concert de fin d'année de toute la troupe, en direct",
      ].map((x, id) => ({ id, x })),
    );
    expect(ranked.search("concert").map(({ id }) => id)).toEqual([2, 0, 1]);
  });
});
