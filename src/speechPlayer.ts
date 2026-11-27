// Reads a page's transcription aloud with the browser's Web Speech API
// (speechSynthesis), one utterance per chunk of src/speech.ts. Used by
// src/components/IssueViewer.svelte. Browser and Svelte free: the synthesis
// is injected, so the player can be tested with a fake one.

import {
  DEFAULT_SPEECH_RATE,
  pickVoice,
  speechLang,
  speechQueue,
  type SpeechChunk,
} from "./speech";
import type { TranscriptionBlock } from "./transcriptions";

export type SpeechStatus = "idle" | "playing" | "paused";

export interface SpeechState {
  status: SpeechStatus;
  // Index of the block being spoken (or where a pause stopped), null when idle
  block: number | null;
  // BCP 47 tag of the language being spoken, when no installed voice speaks
  // it: the browser's default voice is used instead
  missingVoice: string | null;
  // The last reading stopped on a synthesis error
  failed: boolean;
}

export const IDLE_SPEECH: SpeechState = {
  status: "idle",
  block: null,
  missingVoice: null,
  failed: false,
};

// What the transcription toolbar gets to control the reading
export interface SpeechControls {
  state: SpeechState;
  rate: number;
  // From the block `from`, the first one by default
  play: (from?: number) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  setRate: (rate: number) => void;
}

// What the player uses of SpeechSynthesis and SpeechSynthesisUtterance
export type Synthesis = Pick<
  SpeechSynthesis,
  | "speak"
  | "cancel"
  | "pause"
  | "resume"
  | "getVoices"
  | "speaking"
  | "pending"
  | "addEventListener"
  | "removeEventListener"
>;
export type Utterance = Pick<
  SpeechSynthesisUtterance,
  "lang" | "rate" | "voice" | "onend" | "onerror"
>;

// Chrome's network voices stop speaking after about 15 seconds of an
// utterance unless the synthesis is nudged with pause() + resume()
const KEEP_ALIVE_INTERVAL = 10_000;
// Chrome can drop an utterance spoken right after cancel()
const RESTART_DELAY = 50;

export class SpeechPlayer {
  #synth: Synthesis;
  #createUtterance: (text: string) => Utterance;
  #onchange: (state: SpeechState) => void;
  #state: SpeechState = IDLE_SPEECH;
  #voices: SpeechSynthesisVoice[] = [];
  #queue: SpeechChunk[] = [];
  #position = 0;
  #lang = "fr-FR";
  #rate = DEFAULT_SPEECH_RATE;
  // Bumped on every new utterance and on every cancel(): the events of an
  // older utterance (including the "interrupted"/"canceled" errors fired by
  // cancel()) are ignored
  #generation = 0;
  // Referenced until it ends: some browsers garbage collect an utterance
  // that is still being spoken, and never fire its end event
  #utterance: Utterance | null = null;
  #keepAlive: ReturnType<typeof setInterval> | undefined;
  #restart: ReturnType<typeof setTimeout> | undefined;

  constructor(
    synth: Synthesis,
    createUtterance: (text: string) => Utterance,
    onchange: (state: SpeechState) => void,
  ) {
    this.#synth = synth;
    this.#createUtterance = createUtterance;
    this.#onchange = onchange;
    this.#loadVoices();
    // Voices load asynchronously in some browsers
    synth.addEventListener("voiceschanged", this.#loadVoices);
  }

  get state() {
    return this.#state;
  }

  setRate(rate: number) {
    this.#rate = rate;
    // Applies at once: the current chunk starts again at the new rate
    if (this.#state.status === "playing") this.#start();
  }

  // Reads `blocks` from the block `from` (or the first one after it that has
  // something to say)
  play(
    blocks: readonly Pick<TranscriptionBlock, "text">[],
    lang: string | undefined,
    from = 0,
  ) {
    this.#queue = speechQueue(blocks);
    this.#lang = speechLang(lang);
    this.#position = this.#queue.findIndex((chunk) => chunk.block >= from);
    if (this.#position === -1) {
      this.stop();
      return;
    }
    this.#start();
  }

  // Pausing cancels the utterance and resuming speaks the current chunk
  // again: speechSynthesis.pause() does nothing on Android, and after a long
  // pause Chrome often never resumes.
  pause() {
    if (this.#state.status !== "playing") return;
    this.#cancel();
    this.#set({ status: "paused" });
  }

  resume() {
    if (this.#state.status !== "paused") return;
    this.#start();
  }

  stop() {
    this.#cancel();
    this.#queue = [];
    this.#set(IDLE_SPEECH);
  }

  destroy() {
    this.stop();
    this.#synth.removeEventListener("voiceschanged", this.#loadVoices);
  }

  #loadVoices = () => {
    this.#voices = this.#synth.getVoices();
  };

  #set(state: Partial<SpeechState>) {
    this.#state = { ...this.#state, ...state };
    this.#onchange(this.#state);
  }

  #cancel() {
    this.#generation++;
    clearTimeout(this.#restart);
    clearInterval(this.#keepAlive);
    this.#keepAlive = undefined;
    this.#utterance = null;
    this.#synth.cancel();
  }

  // Speaks the current chunk, after cancelling whatever is being spoken
  #start() {
    const busy = this.#synth.speaking || this.#synth.pending;
    this.#cancel();
    this.#set({ status: "playing", failed: false });
    // Without anything to cancel, speak at once: iOS only lets a page start
    // speaking during a user action
    if (busy) {
      this.#restart = setTimeout(() => this.#speak(), RESTART_DELAY);
    } else {
      this.#speak();
    }
  }

  #speak() {
    const chunk = this.#queue[this.#position];
    if (!chunk) {
      this.stop();
      return;
    }
    const generation = ++this.#generation;
    const utterance = this.#createUtterance(chunk.text);
    utterance.lang = this.#lang;
    utterance.rate = this.#rate;
    const voice = pickVoice(this.#voices, this.#lang);
    // Without a voice for the language, the browser reads with its default
    // voice (better than nothing, and the reader says so)
    if (voice) utterance.voice = voice;
    utterance.onend = () => {
      if (generation !== this.#generation || utterance !== this.#utterance) {
        return;
      }
      this.#position++;
      this.#speak();
    };
    utterance.onerror = (event) => {
      if (generation !== this.#generation) return;
      // Interrupted by something else than the player (another page or app
      // speaking): stop quietly
      const interrupted =
        event.error === "interrupted" || event.error === "canceled";
      this.stop();
      if (!interrupted) this.#set({ failed: true });
    };
    this.#utterance = utterance;
    this.#set({
      block: chunk.block,
      missingVoice: !voice && this.#voices.length > 0 ? this.#lang : null,
    });
    this.#synth.speak(utterance as SpeechSynthesisUtterance);
    this.#keepNetworkVoiceAlive(voice);
  }

  #keepNetworkVoiceAlive(voice: SpeechSynthesisVoice | undefined) {
    if (!voice || voice.localService || this.#keepAlive !== undefined) return;
    this.#keepAlive = setInterval(() => {
      if (this.#state.status === "playing" && this.#synth.speaking) {
        this.#synth.pause();
        this.#synth.resume();
      }
    }, KEEP_ALIVE_INTERVAL);
  }
}
