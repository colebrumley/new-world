import { describe, expect, it } from 'vitest';
import { createRng, seedRng, type RngState } from '../../../src/engine/rng';

const u32 = (x: number): number => Math.floor(x * 2 ** 32);

describe('rng', () => {
  it('produces a fixed known sequence for a known seed', () => {
    const r = createRng(1994);
    expect(Array.from({ length: 6 }, () => u32(r.next()))).toEqual([
      3725624623, 2127476611, 2613558190, 2391218944, 3931717777, 3337701617,
    ]);
    const q = createRng('viceroy');
    expect(Array.from({ length: 8 }, () => q.int(1, 6))).toEqual([5, 3, 1, 1, 3, 4, 2, 4]);
    expect(u32(createRng(1994).fork('mapgen').next())).toBe(886629094);
  });

  it('different seeds diverge, same seed repeats', () => {
    const seq = (seed: number): number[] => {
      const r = createRng(seed);
      return Array.from({ length: 20 }, () => r.next());
    };
    expect(seq(7)).toEqual(seq(7));
    expect(seq(7)).not.toEqual(seq(8));
  });

  it('next() stays in [0, 1) and int() covers its inclusive range uniformly enough', () => {
    const r = createRng(42);
    const counts = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 6000; i++) {
      const x = r.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      const d = r.int(1, 6);
      counts[d - 1] = (counts[d - 1] ?? 0) + 1;
    }
    for (const c of counts) expect(c).toBeGreaterThan(850);
    expect(r.int(3, 3)).toBe(3);
    expect(() => r.int(2, 1)).toThrow(RangeError);
    expect(() => r.int(0.5, 2)).toThrow(RangeError);
  });

  it('pick and chance', () => {
    const r = createRng(5);
    const items = ['a', 'b', 'c'] as const;
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) seen.add(r.pick(items));
    expect([...seen].sort()).toEqual(['a', 'b', 'c']);
    expect(() => r.pick([])).toThrow(RangeError);
    expect(r.chance(0)).toBe(false);
    expect(r.chance(1)).toBe(true);
    let hits = 0;
    for (let i = 0; i < 4000; i++) if (r.chance(0.25)) hits++;
    expect(hits).toBeGreaterThan(850);
    expect(hits).toBeLessThan(1150);
  });

  it('fork is independent of consumption order on the parent', () => {
    const a = createRng(99);
    const b = createRng(99);
    for (let i = 0; i < 37; i++) b.next();
    const fa = a.fork('combat');
    const fb = b.fork('combat');
    expect(Array.from({ length: 10 }, () => fa.next())).toEqual(Array.from({ length: 10 }, () => fb.next()));
    // forking does not advance the parent
    const c = createRng(99);
    c.fork('x');
    expect(c.next()).toBe(createRng(99).next());
    // labels and seeds separate streams; grandchildren are stable too
    expect(createRng(99).fork('a').next()).not.toBe(createRng(99).fork('b').next());
    expect(createRng(99).fork('a').next()).not.toBe(createRng(100).fork('a').next());
    expect(a.fork('a').fork('b').next()).toBe(b.fork('a').fork('b').next());
  });

  it('state round-trips through JSON', () => {
    const r = createRng(2024);
    for (let i = 0; i < 11; i++) r.next();
    const saved = JSON.parse(JSON.stringify(r.state())) as RngState;
    expect(saved).toEqual(r.state());
    const resumed = createRng(saved);
    expect(Array.from({ length: 10 }, () => resumed.next())).toEqual(Array.from({ length: 10 }, () => r.next()));
    expect(resumed.fork('k').next()).toBe(r.fork('k').next());
    expect(seedRng(2024)).toEqual(createRng(2024).state());
  });
});
