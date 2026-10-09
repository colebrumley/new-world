// Seeded PRNG (sfc32). The state is plain JSON so it can live inside GameState.
//
// `root` is fixed at creation and never advances; `fork(label)` derives a child stream from
// `root` and the label alone, so a fork is the same no matter how much the parent has been
// consumed. Callers make labels unique themselves (e.g. `mapgen`, `combat:${turn}:${unitId}`).

export interface RngState {
  readonly root: readonly [number, number, number, number];
  readonly s: readonly [number, number, number, number];
}

export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [min, max], both inclusive. */
  int(min: number, max: number): number;
  /** Uniform element of a non-empty array. */
  pick<T>(arr: readonly T[]): T;
  /** True with probability p (p <= 0 never, p >= 1 always). */
  chance(p: number): boolean;
  /** Child stream derived from the root seed and a label; does not advance this stream. */
  fork(label: string): Rng;
  /** Snapshot of the current state, safe to store and JSON-serialize. */
  state(): RngState;
}

type Words = [number, number, number, number];

// xmur3-style string hash, used only to spread seed text over four 32-bit words.
function hashWords(text: string): Words {
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  const word = (): number => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
  return [word(), word(), word(), word()];
}

function step(s: Words): number {
  const t = (((s[0] + s[1]) | 0) + s[3]) | 0;
  s[3] = (s[3] + 1) | 0;
  s[0] = s[1] ^ (s[1] >>> 9);
  s[1] = (s[2] + (s[2] << 3)) | 0;
  s[2] = (s[2] << 21) | (s[2] >>> 11);
  s[2] = (s[2] + t) | 0;
  return t >>> 0;
}

const WARMUP = 12;

function freshState(text: string): RngState {
  const root = hashWords(text);
  const s: Words = [root[0], root[1], root[2], root[3]];
  for (let i = 0; i < WARMUP; i++) step(s);
  return { root, s };
}

export function seedRng(seed: number | string): RngState {
  return freshState(`seed:${String(seed)}`);
}

export function createRng(from: RngState | number | string): Rng {
  const init = typeof from === 'object' ? from : seedRng(from);
  const root: Words = [init.root[0], init.root[1], init.root[2], init.root[3]];
  const s: Words = [init.s[0], init.s[1], init.s[2], init.s[3]];

  const next = (): number => step(s) / 4294967296;
  const int = (min: number, max: number): number => {
    if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
      throw new RangeError(`rng.int: bad range [${min}, ${max}]`);
    }
    return min + Math.floor(next() * (max - min + 1));
  };

  return {
    next,
    int,
    pick<T>(arr: readonly T[]): T {
      if (arr.length === 0) throw new RangeError('rng.pick: empty array');
      return arr[int(0, arr.length - 1)] as T;
    },
    chance(p: number): boolean {
      return next() < p;
    },
    fork(label: string): Rng {
      return createRng(freshState(`fork:${root.join(',')}:${label}`));
    },
    state(): RngState {
      return { root: [root[0], root[1], root[2], root[3]], s: [s[0], s[1], s[2], s[3]] };
    },
  };
}
