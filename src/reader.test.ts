import { describe, expect, test } from "bun:test";

import {
  DEFAULT_TEXT_SIZE,
  parsePageParam,
  parseReadingMode,
  parseTextSize,
  readPreference,
  TEXT_SIZES,
  writePreference,
} from "./reader";

describe("parsePageParam", () => {
  test("accepts a page of the issue", () => {
    expect(parsePageParam("1", 20)).toBe(1);
    expect(parsePageParam("7", 20)).toBe(7);
    expect(parsePageParam("20", 20)).toBe(20);
    expect(parsePageParam("07", 20)).toBe(7);
  });

  test("rejects missing, malformed and out-of-range values", () => {
    for (const value of [
      null,
      "",
      "abc",
      "0",
      "21",
      "999",
      "-1",
      "2.5",
      "1e1",
      " 3",
    ]) {
      expect(parsePageParam(value, 20)).toBeNull();
    }
  });
});

describe("parseReadingMode", () => {
  test("keeps a known mode and falls back to original", () => {
    expect(parseReadingMode("mixed")).toBe("mixed");
    expect(parseReadingMode("text")).toBe("text");
    expect(parseReadingMode(null)).toBe("original");
    expect(parseReadingMode("Texte")).toBe("original");
  });
});

describe("parseTextSize", () => {
  test("keeps a valid index and falls back to the default", () => {
    expect(parseTextSize("0")).toBe(0);
    expect(parseTextSize(String(TEXT_SIZES.length - 1))).toBe(
      TEXT_SIZES.length - 1,
    );
    expect(parseTextSize(String(TEXT_SIZES.length))).toBe(DEFAULT_TEXT_SIZE);
    expect(parseTextSize("-1")).toBe(DEFAULT_TEXT_SIZE);
    expect(parseTextSize(null)).toBe(DEFAULT_TEXT_SIZE);
  });
});

describe("preferences storage", () => {
  const throwing = {
    getItem: () => {
      throw new Error("SecurityError");
    },
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
  };

  test("reads and writes through the storage", () => {
    const map = new Map<string, string>();
    const storage = {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => void map.set(key, value),
    };
    writePreference("key", "text", storage);
    expect(readPreference("key", storage)).toBe("text");
  });

  test("survives a missing or throwing storage", () => {
    expect(readPreference("key", null)).toBeNull();
    expect(readPreference("key", throwing)).toBeNull();
    expect(() => writePreference("key", "text", throwing)).not.toThrow();
    expect(() => writePreference("key", "text", null)).not.toThrow();
  });
});
