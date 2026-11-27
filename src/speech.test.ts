import { describe, expect, test } from "bun:test";

import {
  cleanForSpeech,
  DEFAULT_SPEECH_RATE,
  formatSpeechRate,
  MAX_CHUNK_LENGTH,
  nextSpeechRate,
  parseSpeechRate,
  pickVoice,
  SPEECH_RATES,
  speechLang,
  speechQueue,
  splitIntoChunks,
  voiceLanguageName,
} from "./speech";

describe("speech rate", () => {
  test("keeps a rate of the list and falls back to the default", () => {
    expect(parseSpeechRate("0.75")).toBe(0.75);
    expect(parseSpeechRate("1.5")).toBe(1.5);
    for (const value of [null, "", "2", "0.9", "fast", "-1", "1.25x"]) {
      expect(parseSpeechRate(value)).toBe(DEFAULT_SPEECH_RATE);
    }
  });

  test("cycles through the rates", () => {
    expect(nextSpeechRate(1)).toBe(1.25);
    expect(nextSpeechRate(SPEECH_RATES.at(-1)!)).toBe(SPEECH_RATES[0]);
    expect(nextSpeechRate(3)).toBe(SPEECH_RATES[0]);
  });

  test("formats the rate the French way", () => {
    expect(formatSpeechRate(0.75)).toBe("0,75×");
    expect(formatSpeechRate(1)).toBe("1×");
    expect(formatSpeechRate(1.5)).toBe("1,5×");
  });
});

describe("speechLang", () => {
  test("adds the usual region to a bare language", () => {
    expect(speechLang("fr")).toBe("fr-FR");
    expect(speechLang("en")).toBe("en-US");
    expect(speechLang("ja")).toBe("ja");
  });

  test("keeps a full tag, normalized", () => {
    expect(speechLang("en-GB")).toBe("en-GB");
    expect(speechLang("fr_ca")).toBe("fr-CA");
  });

  test("falls back to French", () => {
    expect(speechLang(undefined)).toBe("fr-FR");
    expect(speechLang("")).toBe("fr-FR");
    expect(speechLang("français")).toBe("fr-FR");
  });

  test("names the language of a missing voice", () => {
    expect(voiceLanguageName("fr-FR")).toBe("française");
    expect(voiceLanguageName("en-US")).toBe("anglaise");
    expect(voiceLanguageName("ja")).toBe("pour cette langue");
  });
});

describe("pickVoice", () => {
  const voice = (
    name: string,
    lang: string,
    localService = true,
    isDefault = false,
  ) => ({ name, lang, localService, default: isDefault });

  test("picks a voice of the language", () => {
    const voices = [voice("Zira", "en-US"), voice("Hortense", "fr-FR")];
    expect(pickVoice(voices, "fr-FR")?.name).toBe("Hortense");
    expect(pickVoice(voices, "en-US")?.name).toBe("Zira");
  });

  test("prefers the region, then a local voice, then the default", () => {
    expect(
      pickVoice([voice("Canada", "fr-CA"), voice("France", "fr-FR")], "fr-FR")
        ?.name,
    ).toBe("France");
    expect(
      pickVoice(
        [voice("Online", "fr-FR", false), voice("Local", "fr-FR")],
        "fr-FR",
      )?.name,
    ).toBe("Local");
    expect(
      pickVoice([voice("A", "fr-FR"), voice("B", "fr-FR", true, true)], "fr-FR")
        ?.name,
    ).toBe("B");
  });

  test("accepts another region and Android's underscores", () => {
    expect(pickVoice([voice("Canada", "fr-CA")], "fr-FR")?.name).toBe("Canada");
    expect(pickVoice([voice("Android", "fr_FR")], "fr-FR")?.name).toBe(
      "Android",
    );
  });

  test("returns nothing without a voice for the language", () => {
    expect(pickVoice([voice("Zira", "en-US")], "fr-FR")).toBeUndefined();
    expect(pickVoice([], "fr-FR")).toBeUndefined();
  });
});

describe("cleanForSpeech", () => {
  test("keeps ordinary text as is", () => {
    const text =
      "Fubuki a rencontré Chloe pour la première fois ! « C'est 12.5 % », dit-elle.";
    expect(cleanForSpeech(text)).toBe(text);
  });

  test("drops emoji and decorative symbols", () => {
    expect(cleanForSpeech("Merci ❤️ à tous ★ 💛")).toBe("Merci à tous");
    expect(cleanForSpeech("♪ Kira Kira ☆")).toBe("Kira Kira");
    expect(cleanForSpeech("( ͡° ͜ʖ ͡°)")).toBe("( ° ʖ °)");
    expect(cleanForSpeech("Il fait 25°")).toBe("Il fait 25°");
  });

  test("keeps the plus sign of La+", () => {
    expect(cleanForSpeech("[La+] Queen")).toBe("La+, Queen");
  });

  test("turns line breaks into pauses", () => {
    expect(cleanForSpeech("REPRISE\nMumei & Baelz\nQUEEN")).toBe(
      "REPRISE. Mumei & Baelz. QUEEN",
    );
    expect(cleanForSpeech("I may be a phoenix,\nbut I couldn't")).toBe(
      "I may be a phoenix, but I couldn't",
    );
  });

  test("reads list bullets, separators and brackets as pauses", () => {
    expect(
      cleanForSpeech(
        "• 25 octobre : Nouvelle tenue\n• 26 octobre : Nouvelle tenue",
      ),
    ).toBe("25 octobre : Nouvelle tenue. 26 octobre : Nouvelle tenue");
    expect(cleanForSpeech("URATTY · ARECOS · JUKE")).toBe(
      "URATTY, ARECOS, JUKE",
    );
    expect(cleanForSpeech("PLANET ZOO | Ao Oni")).toBe("PLANET ZOO, Ao Oni");
    expect(cleanForSpeech("10/17\n[Mio/Okayu] The A: 5M")).toBe(
      "10/17. Mio, Okayu, The A: 5M",
    );
  });

  test("reads hashtags and handles without their sign", () => {
    expect(cleanForSpeech("Suivez @STAR_AnimaLs_ et #MagniOpus")).toBe(
      "Suivez STAR AnimaLs et MagniOpus",
    );
  });

  test("turns full-width punctuation into ASCII", () => {
    expect(cleanForSpeech("Merci！")).toBe("Merci!");
  });

  test("returns nothing for a block of symbols", () => {
    expect(cleanForSpeech("★ ☆ ★")).toBe("");
    expect(cleanForSpeech("•\n|\n~")).toBe("");
  });
});

describe("splitIntoChunks", () => {
  test("keeps a short text whole", () => {
    expect(splitIntoChunks("Une phrase. Une autre !")).toEqual([
      "Une phrase. Une autre !",
    ]);
    expect(splitIntoChunks("  ")).toEqual([]);
  });

  test("groups whole sentences up to the limit", () => {
    const sentence = "Une phrase de vingt-neuf car.";
    const text = Array.from({ length: 10 }, () => sentence).join(" ");
    const chunks = splitIntoChunks(text, 100);
    expect(chunks).toHaveLength(4);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(100);
      expect(chunk.endsWith(".")).toBe(true);
    }
    expect(chunks.join(" ")).toBe(text);
  });

  test("does not cut inside a number or after an abbreviation-like dot", () => {
    expect(splitIntoChunks("Il a 12.5 millions de vues. Bravo.", 30)).toEqual([
      "Il a 12.5 millions de vues.",
      "Bravo.",
    ]);
  });

  test("keeps closing quotes with their sentence", () => {
    expect(splitIntoChunks("« Bonjour ! » Elle sourit.", 15)).toEqual([
      "« Bonjour ! »",
      "Elle sourit.",
    ]);
  });

  test("cuts a long sentence at commas, then at spaces", () => {
    const clauses = "un deux trois, quatre cinq six, sept huit neuf";
    expect(splitIntoChunks(clauses, 20)).toEqual([
      "un deux trois,",
      "quatre cinq six,",
      "sept huit neuf",
    ]);
    expect(splitIntoChunks("un deux trois quatre cinq six", 10)).toEqual([
      "un deux",
      "trois",
      "quatre",
      "cinq six",
    ]);
    expect(splitIntoChunks("abcdefghijkl", 5)).toEqual([
      "abcde",
      "fghij",
      "kl",
    ]);
  });

  test("loses no word of a real paragraph", () => {
    const text =
      "Fubuki a rencontré Chloe pour la première fois ! Comme pour toute autre membre d’hololive ayant rencontré Chloe pour la première fois, elle l’a sentie pour connaître son odeur. D’après Fubuki, elle l’a fait par accident sans même le vouloir. Elle sentait plutôt bon, mais les spectateurs de Fubuki n’étaient pas convaincus, et se sont demandés si l’odeur de Chloe était si forte que celle-ci aurait modifié la mémoire de Fubuki.";
    const chunks = splitIntoChunks(text);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(MAX_CHUNK_LENGTH);
    }
    expect(chunks.join(" ")).toBe(text);
  });
});

describe("speechQueue", () => {
  test("lists the chunks of each block with its index", () => {
    expect(
      speechQueue([
        { text: "Gen 1" },
        { text: "★" },
        { text: "Une phrase. Une autre." },
      ]),
    ).toEqual([
      { block: 0, text: "Gen 1" },
      { block: 2, text: "Une phrase. Une autre." },
    ]);
  });
});
