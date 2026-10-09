// Sound out (R-1003): plays the synthesized cues and the ambient music through WebAudio. The
// context is made on the first sound after a key or click, as browsers require; where there is
// no WebAudio the game is simply silent.
import { ambientPhrase, CUES, type CueId, type Tone } from '../ui/audio-cues';
import type { Options } from '../ui/options';

interface AudioWindow {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
}

export interface AudioPlayer {
  /** Sound these cues, as the options allow. */
  play(cues: readonly CueId[], options: Options): void;
  /** Start or stop the ambient music to match the options. */
  setMusic(options: Options): void;
  /** For tests and the options screen: what has been asked for so far. */
  readonly played: readonly CueId[];
  readonly musicOn: boolean;
}

export function createAudioPlayer(): AudioPlayer {
  let context: AudioContext | null = null;
  let musicTimer: ReturnType<typeof setTimeout> | null = null;
  let phrase = 1;
  const played: CueId[] = [];

  const ready = (): AudioContext | null => {
    if (context) return context;
    const w = window as unknown as AudioWindow;
    const Make = w.AudioContext ?? w.webkitAudioContext;
    if (!Make) return null;
    try {
      context = new Make();
    } catch {
      context = null;
    }
    return context;
  };

  const sound = (ctx: AudioContext, tones: readonly Tone[], when: number): void => {
    for (const t of tones) {
      const gain = ctx.createGain();
      const start = when + t.at;
      // a quick attack and a decay over the length of the tone
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(t.gain, start + Math.min(0.02, t.duration / 4));
      gain.gain.exponentialRampToValueAtTime(0.0001, start + t.duration);
      gain.connect(ctx.destination);
      if (t.frequency === 0) {
        const frames = Math.max(1, Math.floor(ctx.sampleRate * t.duration));
        const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        noise.connect(gain);
        noise.start(start);
      } else {
        const osc = ctx.createOscillator();
        osc.type = t.wave;
        osc.frequency.setValueAtTime(t.frequency, start);
        osc.connect(gain);
        osc.start(start);
        osc.stop(start + t.duration + 0.05);
      }
    }
  };

  const nextPhrase = (): void => {
    const ctx = ready();
    if (!ctx) return;
    const made = ambientPhrase(phrase++);
    sound(ctx, made.tones, ctx.currentTime + 0.05);
    // a breath between phrases
    musicTimer = setTimeout(nextPhrase, (made.length + 1.2) * 1000);
  };

  return {
    play(cues, options) {
      const wanted = cues.filter((id) => options[CUES[id].category]);
      if (wanted.length === 0) return;
      played.push(...wanted);
      const ctx = ready();
      if (!ctx) return;
      if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
      let when = ctx.currentTime + 0.01;
      for (const id of wanted) {
        sound(ctx, CUES[id].tones, when);
        when += 0.12; // let them overlap a little rather than queue up
      }
    },
    setMusic(options) {
      if (options.backgroundMusic && musicTimer === null) nextPhrase();
      else if (!options.backgroundMusic && musicTimer !== null) {
        clearTimeout(musicTimer);
        musicTimer = null;
      }
    },
    get played() {
      return played;
    },
    get musicOn() {
      return musicTimer !== null;
    },
  };
}
