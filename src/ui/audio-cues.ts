// Sound cues (R-1003): which short sounds a batch of game events calls for, and what each sound
// is. Everything is synthesized from these numbers in the browser; no recording is shipped.
import type { GameEvent } from '../engine/actions';
import { NATIVES } from '../engine/data/tribes';
import type { GameState, PlayerId } from '../engine/state';

export const CUE_IDS = ['move', 'combat', 'buildComplete', 'immigrant', 'newTurn', 'drums'] as const;
export type CueId = (typeof CUE_IDS)[number];
/** The three sound switches: ambient music, short musical flourishes for events, plain effects. */
export type SoundCategory = 'backgroundMusic' | 'eventMusic' | 'soundEffects';

export interface Tone {
  /** Hz. A tone with frequency 0 is a burst of noise. */
  readonly frequency: number;
  /** Seconds from the start of the cue. */
  readonly at: number;
  readonly duration: number;
  readonly wave: 'sine' | 'square' | 'triangle' | 'sawtooth';
  /** 0..1 */
  readonly gain: number;
}

export interface CueDef {
  readonly category: Exclude<SoundCategory, 'backgroundMusic'>;
  readonly tones: readonly Tone[];
}

const tone = (frequency: number, at: number, duration: number, wave: Tone['wave'] = 'triangle', gain = 0.2): Tone => ({ frequency, at, duration, wave, gain });

export const CUES = {
  // a soft footfall
  move: { category: 'soundEffects', tones: [tone(0, 0, 0.05, 'sine', 0.08), tone(140, 0, 0.06, 'sine', 0.12)] },
  // a volley: a crack of noise over a falling thud
  combat: { category: 'soundEffects', tones: [tone(0, 0, 0.18, 'square', 0.3), tone(110, 0.02, 0.2, 'sawtooth', 0.2), tone(70, 0.12, 0.3, 'sine', 0.25)] },
  // three hammer strokes and a rising fourth
  buildComplete: { category: 'eventMusic', tones: [tone(392, 0, 0.09, 'square', 0.12), tone(392, 0.14, 0.09, 'square', 0.12), tone(392, 0.28, 0.09, 'square', 0.12), tone(523.25, 0.42, 0.35)] },
  // a ship's bell, struck twice
  immigrant: { category: 'eventMusic', tones: [tone(880, 0, 0.5, 'sine', 0.18), tone(1318.5, 0, 0.5, 'sine', 0.06), tone(880, 0.3, 0.6, 'sine', 0.18), tone(1318.5, 0.3, 0.6, 'sine', 0.06)] },
  // a short rising figure
  newTurn: { category: 'soundEffects', tones: [tone(293.66, 0, 0.12), tone(369.99, 0.1, 0.12), tone(440, 0.2, 0.22)] },
  // low drums in a slow pattern
  drums: { category: 'eventMusic', tones: [tone(82, 0, 0.22, 'sine', 0.35), tone(82, 0.3, 0.22, 'sine', 0.3), tone(62, 0.6, 0.3, 'sine', 0.35), tone(82, 1.05, 0.22, 'sine', 0.3), tone(62, 1.35, 0.4, 'sine', 0.35)] },
} as const satisfies Record<CueId, CueDef>;

/**
 * The cues a batch of events calls for, most telling first and each at most once. `state` is the
 * state after the events; only what concerns `playerId` is sounded.
 */
export function cuesFor(events: readonly GameEvent[], state: GameState, playerId: PlayerId): CueId[] {
  const wanted = new Set<CueId>();
  const mine = (unitId: string): boolean => state.units[unitId]?.owner === playerId;
  const myColony = (colonyId: string): boolean => state.colonies[colonyId]?.owner === playerId;
  for (const e of events) {
    switch (e.type) {
      case 'unitMoved':
      case 'unitLanded':
      case 'unitBoarded':
        if (mine(e.unitId)) wanted.add('move');
        break;
      case 'battle':
        // our fight, whoever began it: one of the two is ours, or was until it lost
        if (mine(e.attackerId) || (e.defenderId !== null && mine(e.defenderId)) || events.some((x) => x.type === 'unitLost' && x.owner === playerId)) wanted.add('combat');
        break;
      case 'colonyRaided':
      case 'colonyCaptured':
        if (e.type === 'colonyRaided' ? myColony(e.colonyId) : e.from === playerId || e.to === playerId) wanted.add('combat');
        break;
      case 'buildingCompleted':
      case 'unitBuilt':
        if (myColony(e.colonyId)) wanted.add('buildComplete');
        break;
      case 'immigrantArrived':
        if (e.player === playerId) wanted.add('immigrant');
        break;
      case 'playerTurnStarted':
        if (e.player === playerId) wanted.add('newTurn');
        break;
      case 'attitudeChanged':
        // a people's mood toward us has reached the pitch of war
        if (e.player === playerId && e.to >= NATIVES.alarmLevels.length && e.from < e.to) wanted.add('drums');
        break;
      case 'colonyBurned':
        if (e.owner === playerId) wanted.add('drums');
        break;
      case 'tribeJoinedCrown':
        if (e.against === playerId) wanted.add('drums');
        break;
      default:
        break;
    }
  }
  const ORDER: readonly CueId[] = ['drums', 'combat', 'buildComplete', 'immigrant', 'newTurn', 'move'];
  return ORDER.filter((id) => wanted.has(id));
}

/** How long a cue lasts, in seconds. */
export function cueLength(id: CueId): number {
  return Math.max(...CUES[id].tones.map((t) => t.at + t.duration));
}

// --- ambient music -------------------------------------------------------------------------------

/** D dorian over two octaves: the mode of a good many old dance tunes. */
const SCALE = [146.83, 164.81, 174.61, 196, 220, 246.94, 261.63, 293.66, 329.63, 349.23, 392, 440] as const;

/**
 * A phrase of period-flavoured melody over a drone, made up from a seed: stepwise motion with
 * the odd leap, long notes on the strong beats, ending on the home note. Returns the tones for
 * one phrase and its length in seconds; the player strings phrases together.
 */
export function ambientPhrase(seed: number, beat = 0.42): { tones: Tone[]; length: number } {
  let s = (seed >>> 0) || 1;
  const next = (n: number): number => {
    // xorshift32
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s % n;
  };
  const tones: Tone[] = [];
  let degree = 7; // start on the upper home note
  let at = 0;
  const beats = 16;
  for (let i = 0; i < beats;) {
    const long = i % 4 === 0 && next(3) > 0;
    const span = long ? 2 : 1;
    const step = next(8);
    degree += step < 3 ? -1 : step < 6 ? 1 : step === 6 ? -2 : 3;
    degree = Math.max(2, Math.min(SCALE.length - 1, degree));
    if (i + span >= beats) degree = 7;
    tones.push(tone(SCALE[degree] as number, at, span * beat * 0.92, 'triangle', 0.09));
    at += span * beat;
    i += span;
  }
  // the drone: home note and its fifth, under the whole phrase
  tones.push(tone(73.42, 0, at, 'sine', 0.05), tone(110, 0, at, 'sine', 0.035));
  return { tones, length: at };
}
