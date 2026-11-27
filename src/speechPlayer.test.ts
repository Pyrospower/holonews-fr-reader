import { describe, expect, test } from "bun:test";

import {
  SpeechPlayer,
  type SpeechState,
  type Synthesis,
  type Utterance,
} from "./speechPlayer";

interface FakeUtterance extends Utterance {
  text: string;
}

// In-memory speechSynthesis: records what is spoken, and lets the test end
// utterances or make them fail. cancel() fires "interrupted" like Chrome.
function setup(voices: Partial<SpeechSynthesisVoice>[] = []) {
  const spoken: FakeUtterance[] = [];
  let current: FakeUtterance | null = null;
  const listeners = new Set<() => void>();
  const synth = {
    speaking: false,
    pending: false,
    speak(utterance: FakeUtterance) {
      spoken.push(utterance);
      current = utterance;
      synth.speaking = true;
    },
    cancel() {
      const interrupted = current;
      current = null;
      synth.speaking = false;
      interrupted?.onerror?.call(
        interrupted as SpeechSynthesisUtterance,
        { error: "interrupted" } as SpeechSynthesisErrorEvent,
      );
    },
    pause() {},
    resume() {},
    getVoices: () => voices as SpeechSynthesisVoice[],
    addEventListener: (_: string, listener: () => void) =>
      listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) =>
      listeners.delete(listener),
  };
  const states: SpeechState[] = [];
  const player = new SpeechPlayer(
    synth as unknown as Synthesis,
    (text) =>
      ({
        text,
        lang: "",
        rate: 1,
        voice: null,
        onend: null,
        onerror: null,
      }) as FakeUtterance,
    (state) => states.push(state),
  );
  const end = () => {
    const utterance = current;
    current = null;
    synth.speaking = false;
    utterance?.onend?.call(
      utterance as SpeechSynthesisUtterance,
      {} as SpeechSynthesisEvent,
    );
  };
  const fail = (error: string) => {
    const utterance = current;
    current = null;
    synth.speaking = false;
    utterance?.onerror?.call(
      utterance as SpeechSynthesisUtterance,
      { error } as SpeechSynthesisErrorEvent,
    );
  };
  const loadVoices = (list: Partial<SpeechSynthesisVoice>[]) => {
    voices = list;
    for (const listener of listeners) listener();
  };
  return { player, synth, spoken, states, end, fail, loadVoices, listeners };
}

const blocks = [
  { text: "Titre" },
  { text: "★" },
  { text: "Première phrase. Deuxième phrase." },
  { text: "Fin" },
];

describe("SpeechPlayer", () => {
  test("reads the blocks in order, one utterance per chunk", () => {
    const { player, spoken, end } = setup();
    player.play(blocks, "fr");
    expect(player.state).toMatchObject({ status: "playing", block: 0 });
    end();
    expect(player.state.block).toBe(2);
    end();
    end();
    expect(spoken.map((utterance) => utterance.text)).toEqual([
      "Titre",
      "Première phrase. Deuxième phrase.",
      "Fin",
    ]);
    expect(spoken[0]?.lang).toBe("fr-FR");
    expect(player.state).toMatchObject({ status: "idle", block: null });
  });

  test("starts from a block", () => {
    const { player, spoken } = setup();
    player.play(blocks, "en", 1);
    expect(player.state.block).toBe(2);
    expect(spoken[0]?.lang).toBe("en-US");
  });

  test("ignores the interrupted errors of its own cancel()", () => {
    const { player, spoken, end } = setup();
    player.play(blocks, "fr");
    player.pause();
    expect(player.state).toMatchObject({
      status: "paused",
      block: 0,
      failed: false,
    });
    player.resume();
    expect(player.state.status).toBe("playing");
    // The chunk that was paused is spoken again
    expect(spoken.map((utterance) => utterance.text)).toEqual([
      "Titre",
      "Titre",
    ]);
    end();
    expect(player.state.block).toBe(2);
  });

  test("stops on cancel by something else, and reports real errors", () => {
    const { player, fail } = setup();
    player.play(blocks, "fr");
    fail("interrupted");
    expect(player.state).toMatchObject({ status: "idle", failed: false });
    player.play(blocks, "fr");
    fail("synthesis-failed");
    expect(player.state).toMatchObject({ status: "idle", failed: true });
    player.play(blocks, "fr");
    expect(player.state.failed).toBe(false);
  });

  test("stops and drops the queue", () => {
    const { player, spoken, end } = setup();
    player.play(blocks, "fr");
    player.stop();
    expect(player.state).toMatchObject({ status: "idle", block: null });
    end();
    expect(spoken).toHaveLength(1);
  });

  test("applies a new rate to the current chunk", async () => {
    const { player, spoken } = setup();
    player.setRate(1.5);
    player.play(blocks, "fr");
    expect(spoken[0]?.rate).toBe(1.5);
    player.setRate(0.75);
    // Restarted after a short delay, as something was being spoken
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(spoken.map((utterance) => [utterance.text, utterance.rate])).toEqual(
      [
        ["Titre", 1.5],
        ["Titre", 0.75],
      ],
    );
  });

  test("uses a voice of the language once the voices are loaded", () => {
    const { player, spoken, end, loadVoices } = setup();
    player.play(blocks, "fr");
    expect(spoken[0]?.voice).toBeNull();
    expect(player.state.missingVoice).toBeNull();
    const hortense = { name: "Hortense", lang: "fr-FR", localService: true };
    loadVoices([{ name: "Zira", lang: "en-US", localService: true }, hortense]);
    end();
    expect(spoken[1]?.voice).toBe(hortense as SpeechSynthesisVoice);
  });

  test("reads with the default voice when none speaks the language", () => {
    const { player, spoken } = setup([
      { name: "Zira", lang: "en-US", localService: true },
    ]);
    player.play(blocks, "fr");
    expect(spoken[0]?.voice).toBeNull();
    expect(spoken[0]?.lang).toBe("fr-FR");
    expect(player.state.missingVoice).toBe("fr-FR");
  });

  test("does nothing for a page without anything to say", () => {
    const { player, spoken } = setup();
    player.play([{ text: "★" }], "fr");
    expect(player.state.status).toBe("idle");
    expect(spoken).toHaveLength(0);
  });

  test("stops listening to the voices once destroyed", () => {
    const { player, listeners } = setup();
    expect(listeners.size).toBe(1);
    player.destroy();
    expect(listeners.size).toBe(0);
  });
});
