import { describe, expect, test } from "bun:test";

import {
  buildBlocks,
  cleanLine,
  joinLines,
  mergeSplitParagraphs,
  orderBlocks,
  originalImageUrl,
  pageStatus,
  PIPELINE_VERSION,
  planPage,
  splitOnGutters,
  type Box,
  type OcrParagraph,
  type OcrWord,
} from "./lib";

describe("originalImageUrl", () => {
  test("derives the original of a Reddit preview", () => {
    expect(
      originalImageUrl(
        "https://preview.redd.it/4gafg71007891.png?width=640&crop=smart&auto=webp&s=55e9dec36ffe6e76e1f8dbe0ede59d01f38a868e",
      ),
    ).toBe("https://i.redd.it/4gafg71007891.png");
  });

  test("keeps an i.redd.it URL", () => {
    expect(originalImageUrl("https://i.redd.it/q8n0df2007891.gif")).toBe(
      "https://i.redd.it/q8n0df2007891.gif",
    );
  });

  test("returns null for other hosts and invalid URLs", () => {
    expect(originalImageUrl("https://example.com/image.png")).toBeNull();
    expect(originalImageUrl("https://preview.redd.it/a/b.png")).toBeNull();
    expect(originalImageUrl("not a url")).toBeNull();
  });
});

describe("cleanLine", () => {
  test("turns a lone bar before a lowercase word into an I", () => {
    expect(cleanLine("Answer: | wasn't interested")).toBe(
      "Answer: I wasn't interested",
    );
    expect(cleanLine("If | need to stay awake | listen")).toBe(
      "If I need to stay awake I listen",
    );
  });

  test("removes bars at the edges", () => {
    expect(cleanLine("| Vous voulez nous aider ? |")).toBe(
      "Vous voulez nous aider ?",
    );
  });
});

describe("joinLines", () => {
  test("merges lines with a space", () => {
    expect(joinLines(["Flare a fêté son", "anniversaire le 19 juin."])).toBe(
      "Flare a fêté son anniversaire le 19 juin.",
    );
  });

  test("rejoins a word split by a hyphen at the end of a line", () => {
    expect(joinLines(["l'audience et vice-", "versa. La première"])).toBe(
      "l'audience et vice-versa. La première",
    );
    expect(joinLines(["« Zenryoku-", "Jumping ! »"])).toBe(
      "« Zenryoku-Jumping ! »",
    );
  });

  test("keeps a dash separated by a space", () => {
    expect(joinLines(["Pour le Cinderella Switch -", "new act-"])).toBe(
      "Pour le Cinderella Switch - new act-",
    );
  });

  test("puts list items on their own line", () => {
    expect(
      joinLines([
        "e Un tapis",
        "« Une figurine en acrylique",
        "+ Un coussin Zabuton",
      ]),
    ).toBe("• Un tapis\n• Une figurine en acrylique\n• Un coussin Zabuton");
  });

  test("doesn't take an opening quote for a bullet", () => {
    expect(joinLines(["« PUPPY LOVE !! » avec Pekora."])).toBe(
      "« PUPPY LOVE !! » avec Pekora.",
    );
    expect(joinLines(["« Kami-sama wa Ereki", "shusendo » qui"])).toBe(
      "« Kami-sama wa Ereki shusendo » qui",
    );
  });
});

const block = (name: string, x: number, y: number, width = 0.4) => ({
  name,
  bbox: { x, y, width, height: 0.1 },
});
const names = (blocks: { name: string }[]) => blocks.map((b) => b.name);

describe("orderBlocks", () => {
  test("keeps Tesseract's order on a single-column page", () => {
    const blocks = [
      block("a", 0.1, 0.5, 0.8),
      block("b", 0.1, 0.2, 0.8),
      block("c", 0.1, 0.8, 0.8),
    ];
    expect(names(orderBlocks(blocks))).toEqual(["a", "b", "c"]);
  });

  test("reads two columns one after the other", () => {
    const blocks = [
      block("right-top", 0.55, 0.1),
      block("left-top", 0.05, 0.1),
      block("left-bottom", 0.05, 0.5),
      block("right-bottom", 0.55, 0.5),
    ];
    expect(names(orderBlocks(blocks))).toEqual([
      "left-top",
      "left-bottom",
      "right-top",
      "right-bottom",
    ]);
  });

  test("splits the page into bands at blocks spanning the columns", () => {
    const blocks = [
      block("left-2", 0.05, 0.6),
      block("right-1", 0.55, 0.2),
      block("title", 0.05, 0.02, 0.9),
      block("full-width", 0.05, 0.4, 0.9),
      block("left-1", 0.05, 0.2),
      block("right-2", 0.55, 0.6),
    ];
    expect(names(orderBlocks(blocks))).toEqual([
      "title",
      "left-1",
      "right-1",
      "full-width",
      "left-2",
      "right-2",
    ]);
  });

  test("handles three columns", () => {
    const blocks = [
      block("c", 0.7, 0.1, 0.25),
      block("a", 0.05, 0.3, 0.25),
      block("b", 0.38, 0.2, 0.25),
    ];
    expect(names(orderBlocks(blocks))).toEqual(["a", "b", "c"]);
  });
});

describe("mergeSplitParagraphs", () => {
  const paragraph = (text: string, bbox: Box) => ({
    type: "paragraph" as const,
    text,
    bbox,
    lineHeight: 0.015,
  });

  test("merges a paragraph split before an opening quote", () => {
    const merged = mergeSplitParagraphs([
      paragraph("a été suivie d'un duo sur", {
        x: 0.07,
        y: 0.44,
        width: 0.41,
        height: 0.09,
      }),
      paragraph("« PUPPY LOVE !! » avec Pekora.", {
        x: 0.07,
        y: 0.54,
        width: 0.4,
        height: 0.08,
      }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.text).toBe(
      "a été suivie d'un duo sur « PUPPY LOVE !! » avec Pekora.",
    );
    expect(merged[0]!.bbox.height).toBeCloseTo(0.18);
  });

  test("keeps paragraphs that end a sentence or are far apart", () => {
    const first = paragraph("Fin de la phrase.", {
      x: 0.07,
      y: 0.1,
      width: 0.4,
      height: 0.05,
    });
    const next = paragraph("« Citation » suivante", {
      x: 0.07,
      y: 0.16,
      width: 0.4,
      height: 0.05,
    });
    const far = paragraph("suite lointaine", {
      x: 0.07,
      y: 0.5,
      width: 0.4,
      height: 0.05,
    });
    expect(mergeSplitParagraphs([first, next])).toHaveLength(2);
    expect(
      mergeSplitParagraphs([{ ...first, text: "Sans point" }, far]),
    ).toHaveLength(2);
  });
});

const word = (text: string, x0: number, x1: number, y0: number): OcrWord => ({
  text,
  confidence: 90,
  bbox: { x0, x1, y0, y1: y0 + 30 },
});

describe("splitOnGutters", () => {
  test("separates two columns read as single lines", () => {
    const paragraph: OcrParagraph = {
      confidence: 90,
      bbox: { x0: 0, y0: 0, x1: 1500, y1: 70 },
      lines: [
        {
          text: "Des vêtements Au cas",
          height: 30,
          words: [
            word("Des", 100, 160, 0),
            word("vêtements", 170, 400, 0),
            word("Au", 850, 890, 0),
            word("cas", 900, 960, 0),
          ],
        },
        {
          text: "affiliés les Blu-Ray",
          height: 30,
          words: [
            word("affiliés", 100, 250, 40),
            word("les", 860, 920, 40),
            word("Blu-Ray", 930, 1100, 40),
          ],
        },
      ],
    };
    const columns = splitOnGutters(paragraph);
    expect(columns.map((c) => c.lines.map((l) => l.text))).toEqual([
      ["Des vêtements", "affiliés"],
      ["Au cas", "les Blu-Ray"],
    ]);
    expect(columns[1]!.bbox).toEqual({ x0: 850, y0: 0, x1: 1100, y1: 70 });
  });

  test("doesn't cut where a line crosses the gap", () => {
    const paragraph: OcrParagraph = {
      confidence: 90,
      bbox: { x0: 0, y0: 0, x1: 1000, y1: 70 },
      lines: [
        {
          text: "Titre date",
          height: 30,
          words: [word("Titre", 100, 200, 0), word("date", 800, 900, 0)],
        },
        {
          text: "une longue phrase",
          height: 30,
          words: [
            word("une", 100, 160, 40),
            word("longue", 170, 600, 40),
            word("phrase", 610, 900, 40),
          ],
        },
      ],
    };
    expect(splitOnGutters(paragraph)).toEqual([paragraph]);
  });
});

describe("buildBlocks", () => {
  const paragraph = (
    confidence: number,
    text: string,
    y: number,
    height: number,
  ): OcrParagraph => ({
    confidence,
    bbox: { x0: 100, y0: y, x1: 900, y1: y + height },
    lines: [{ text, height }],
  });

  test("drops junk, infers types and normalizes boxes", () => {
    const blocks = buildBlocks(
      [
        paragraph(95, "Un grand titre", 0, 90),
        paragraph(93, "Un paragraphe de texte.", 200, 40),
        paragraph(94, "Un autre paragraphe.", 300, 40),
        paragraph(40, "ZE >>» T0 RFF", 400, 40),
        paragraph(92, "~ |", 500, 40),
        paragraph(90, "petite légende", 600, 20),
      ],
      { width: 1000, height: 1000 },
    );
    expect(blocks.map((b) => [b.type, b.text])).toEqual([
      ["heading", "Un grand titre"],
      ["paragraph", "Un paragraphe de texte."],
      ["paragraph", "Un autre paragraphe."],
      ["other", "petite légende"],
    ]);
    expect(blocks[1]!.bbox).toEqual({
      x: 0.1,
      y: 0.2,
      width: 0.8,
      height: 0.04,
    });
  });
});

describe("pageStatus", () => {
  const text = (value: string) => [{ type: "paragraph" as const, text: value }];

  test("marks a page without enough text as unavailable", () => {
    expect(pageStatus(text("Let's play"), 90)).toBe("unavailable");
    expect(pageStatus(text("x".repeat(500)), 50)).toBe("unavailable");
    expect(pageStatus(text("x".repeat(500)), 90)).toBe("auto");
  });
});

describe("planPage", () => {
  const existing = (
    status: "auto" | "corrected" | "unavailable",
    gifFrame: number | null = null,
    pipelineVersion = PIPELINE_VERSION,
  ) => ({ status, source: { pipelineVersion, gifFrame } });

  test("processes new pages", () => {
    expect(planPage(null, { force: false }).run).toBe(true);
  });

  test("never overwrites corrected or unavailable pages without --force", () => {
    expect(planPage(existing("corrected"), { force: false }).run).toBe(false);
    expect(planPage(existing("unavailable"), { force: false }).run).toBe(false);
    expect(
      planPage(existing("corrected", 10), { force: false, frameOverride: 0 })
        .run,
    ).toBe(false);
    expect(planPage(existing("corrected"), { force: true }).run).toBe(true);
  });

  test("skips auto pages that are up to date", () => {
    expect(planPage(existing("auto", 89), { force: false }).run).toBe(false);
    expect(
      planPage(existing("auto", 89), { force: false, frameOverride: 89 }).run,
    ).toBe(false);
  });

  test("redoes auto pages when the frame or the pipeline changed", () => {
    expect(
      planPage(existing("auto", 89), { force: false, frameOverride: 0 }).run,
    ).toBe(true);
    expect(
      planPage(existing("auto", null, PIPELINE_VERSION - 1), { force: false })
        .run,
    ).toBe(true);
  });
});
