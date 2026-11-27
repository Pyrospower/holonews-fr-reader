import { describe, expect, test } from "bun:test";

import { findMatches, parseQuery } from "./search";
import {
  createTalentDetector,
  findTalentMentions,
  mentionedTalents,
  mentionQuery,
  TALENT_DICTIONARY,
  TALENTS,
  type TalentDictionary,
  type TalentEntry,
} from "./talents";

function talent(
  slug: string,
  name: string,
  aliases: string[] = [],
  casedAliases: string[] = [],
): TalentEntry {
  return { slug, name, aliases, casedAliases };
}

const dictionary: TalentDictionary = {
  ignore: ["Kira Kira", "Reine des Erreurs"],
  branches: [
    {
      name: "hololive",
      units: [
        {
          name: "Test",
          talents: [
            talent("pekora", "Usada Pekora", ["Pekora"]),
            talent("ina", "Ninomae Ina'nis", ["Ina'nis"], ["Ina"]),
            talent("iroha", "Kazama Iroha", ["Iroha"]),
            talent("la", "La+ Darknesss", ["La+", "Laplus"]),
            talent("reine", "Pavolia Reine", [], ["Reine"]),
            talent("ame", "Watson Amelia", ["Amelia"], ["Ame"]),
            talent("noel", "Shirogane Noel", [], ["Noel"]),
            talent("kira", "Kagami Kira", [], ["Kira"]),
            talent("aki", "Aki Rosenthal", ["Akirose"], ["Aki"]),
            talent("roboco", "Roboco", ["Roboco san"]),
            talent("bae", "Hakos Baelz", ["Baelz"], ["Bae"]),
          ],
        },
      ],
    },
  ],
};

const detect = createTalentDetector(dictionary);

// The talents found in a text, with the text that names them
function found(text: string) {
  return detect(text).map(({ slug, start, end }) => [
    slug,
    text.slice(start, end),
  ]);
}

describe("findTalentMentions", () => {
  test("ignores case and accents of ordinary names", () => {
    expect(found("Pékora, PEKORA et usada pekora")).toEqual([
      ["pekora", "Pékora"],
      ["pekora", "PEKORA"],
      ["pekora", "usada pekora"],
    ]);
  });

  test("handles apostrophes, elisions and possessives", () => {
    expect(found("l'Iroha, d’Ina, Ina's stream, Ninomae Ina’nis")).toEqual([
      ["iroha", "Iroha"],
      ["ina", "Ina"],
      ["ina", "Ina"],
      ["ina", "Ninomae Ina’nis"],
    ]);
  });

  test("does not match inside other words", () => {
    expect(found("inattendu, Inazuma, Akirosenthal, Kirameki, Lamy")).toEqual(
      [],
    );
  });

  test("matches names with symbols as whole words", () => {
    expect(found("La+ et Laplus, mais pas la mer ni Lamy")).toEqual([
      ["la", "La+"],
      ["la", "Laplus"],
    ]);
  });

  test("matches cased names with their exact case, accents or in capitals", () => {
    expect(found("Reine a vu la reine")).toEqual([["reine", "Reine"]]);
    expect(found("ANNIVERSAIRE DE REINE")).toEqual([["reine", "REINE"]]);
    // "âme" (soul) is not Ame, "Noël" (Christmas) is not Noel
    expect(found("Ame a perdu son âme, Âme, à Noël avec Noel")).toEqual([
      ["ame", "Ame"],
      ["noel", "Noel"],
    ]);
  });

  test("prefers the longest name at a position", () => {
    expect(found("Aki Rosenthal et Akirose")).toEqual([
      ["aki", "Aki Rosenthal"],
      ["aki", "Akirose"],
    ]);
    expect(found("Roboco-san et Roboco san")).toEqual([
      ["roboco", "Roboco-san"],
      ["roboco", "Roboco san"],
    ]);
  });

  test("does not match a name across lines", () => {
    expect(found("Usada\nPekora")).toEqual([["pekora", "Pekora"]]);
  });

  test("skips ignored phrases", () => {
    expect(found("Aqua chante « Kira Kira », avec Kira")).toEqual([
      ["kira", "Kira"],
    ]);
    expect(found("Sana, la « Reine des Erreurs », et Reine")).toEqual([
      ["reine", "Reine"],
    ]);
  });

  test("finds several talents in the order of the text", () => {
    const mentions = detect("Kiara & Reine, puis Pekora et Reine");
    expect(mentionedTalents(mentions)).toEqual(["reine", "pekora"]);
  });
});

describe("mentionQuery", () => {
  test("picks the name the page uses", () => {
    const text = "Ninomae Ina'nis est là. Ina a dessiné.";
    const mentions = detect(text);
    const query = mentionQuery(text, mentions, "ina");
    expect(query).toBe("Ninomae Ina'nis");
    expect(
      mentionQuery("Ina a dessiné.", detect("Ina a dessiné."), "ina"),
    ).toBe("Ina");
  });

  test("avoids names that also highlight other words", () => {
    // "Bae" would also highlight "Baerats", the reader matches prefixes
    const text = "Bae a remercié les Baerats. Baelz est ravie.";
    const query = mentionQuery(text, detect(text), "bae");
    expect(query).toBe("Baelz");
  });

  test("gives a query that highlights La+ and not the article la", () => {
    const text = "La+ a joué à la marelle.";
    const query = mentionQuery(text, detect(text), "la");
    expect(query).toBe("La+");
    const ranges = findMatches(text, parseQuery(query));
    expect(ranges.map(({ start, end }) => text.slice(start, end))).toEqual([
      "La+",
    ]);
  });

  test("returns an empty query for a talent not on the page", () => {
    expect(mentionQuery("Pekora", detect("Pekora"), "ina")).toBe("");
  });
});

describe("the dictionary", () => {
  test("has unique slugs in URL form", () => {
    const slugs = TALENTS.map((talent) => talent.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  test("gives each name to a single talent", () => {
    const owners = new Map<string, string>();
    for (const { units } of TALENT_DICTIONARY.branches) {
      for (const { talents } of units) {
        for (const entry of talents) {
          const names = [entry.name, ...entry.aliases, ...entry.casedAliases];
          for (const name of names) {
            const key = name.toLowerCase();
            expect(owners.get(key) ?? entry.slug).toBe(entry.slug);
            owners.set(key, entry.slug);
          }
        }
      }
    }
  });

  test("detects the real names it lists", () => {
    const text =
      "Haachama, Shishiron, Pekora, l'Iroha, Ina, Gura, Ame, Kronii, Robocosan et La+";
    expect(mentionedTalents(findTalentMentions(text))).toEqual([
      "akai-haato",
      "shishiro-botan",
      "usada-pekora",
      "kazama-iroha",
      "ninomae-inanis",
      "gawr-gura",
      "watson-amelia",
      "ouro-kronii",
      "roboco",
      "la-darknesss",
    ]);
  });

  test("does not mistake ordinary words for talents", () => {
    const text =
      "lui aussi, une reine, la marine, son âme, à Noël, une polka, du chocolat, sur Kira Kira";
    expect(findTalentMentions(text)).toEqual([]);
  });
});
