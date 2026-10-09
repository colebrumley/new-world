import { describe, expect, it } from 'vitest';
import { applyAction, type GameEvent } from '../../../src/engine/actions';
import { NATIVE_AI } from '../../../src/engine/data/native-ai';
import { settlementPopulation } from '../../../src/engine/data/tribes';
import { checkInvariants } from '../../../src/engine/invariants';
import { bravesTurn, braveTurn, type NativeAiEvent } from '../../../src/engine/native-ai';
import { createRng } from '../../../src/engine/rng';
import type { Colonist, GameState, Settlement, TribeState, Unit } from '../../../src/engine/state';
import { withColony, withUnit, world } from '../../helpers/world';

const ROWS = Array.from({ length: 20 }, (_, y) => (y === 0 || y === 19 ? '~'.repeat(24) : `~${'.'.repeat(22)}~`));
const village = (id: string, tribe: Settlement['tribe'], x: number, y: number, extra: Partial<Settlement> = {}): Settlement => ({
  id, tribe, x, y, capital: false, population: settlementPopulation(tribe, false).start, growth: 0, taught: false, tributePaid: false,
  alarm: {}, mission: null, scouted: [], lastBought: null, lastSold: null, haggleMemory: null, ...extra,
});
const record = (extra: Partial<TribeState> = {}): TribeState => ({ alarm: {}, goodwill: {}, met: ['a', 'b'], muskets: 0, horses: 0, breeding: 0, silver: 0, peace: ['a', 'b'], landSold: 0, grudge: [], joinedCrown: false, visited: {}, stock: {}, ...extra });
const braveUnit = (id: string, tribe: string, type: Unit['type'], x: number, y: number): Unit => ({
  id, owner: `tribe:${tribe}`, type, profession: null, x, y, movesLeft: 0, orders: 'none', destination: null, aboard: null, cargo: {}, tools: 0, workTurns: 0, route: null, repair: 0, treasure: 0, voyage: null,
});
const AROUND = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]] as const;
/** Colonists farming the squares around their colony, so that nobody starves during a long test. */
const people = (n: number, p = 'c'): Colonist[] => Array.from({ length: n }, (_, i) => ({ id: `${p}${i}`, profession: 'freeColonist' as const, job: { kind: 'field' as const, dx: AROUND[i]![0], dy: AROUND[i]![1], good: 'food' as const }, turns: 0 }));
interface Opts { seed?: number; tribe?: Settlement['tribe']; record?: Partial<TribeState>; village?: Partial<Settlement>; brave?: Unit['type']; at?: [number, number] }
/** A settlement at (10,10) with its brave beside it. */
function land(o: Opts = {}): GameState {
  const tribe = o.tribe ?? 'cherokee';
  const s = world({ rows: ROWS, seed: o.seed ?? 1, players: [{ id: 'a' }, { id: 'b', kind: 'ai' }] });
  const [bx, by] = o.at ?? [10, 11];
  return { ...s, turn: 0, units: { 'brave-v': braveUnit('brave-v', tribe, o.brave ?? 'brave', bx, by) }, settlements: { v: village('v', tribe, 10, 10, o.village) }, tribes: { [tribe]: record(o.record) } };
}
const far = (u: Unit | undefined, x: number, y: number): number => (u ? Math.max(Math.abs(u.x - x), Math.abs(u.y - y)) : -1);
const round = (s: GameState): { state: GameState; events: GameEvent[] } => {
  const first = applyAction(s, { type: 'endTurn' });
  const second = applyAction(first.state, { type: 'endTurn' });
  return { state: second.state, events: [...first.events, ...second.events] };
};

describe('native AI table', () => {
  it('matches the snapshot', () => {
    expect(NATIVE_AI).toMatchSnapshot();
  });
});

describe('braves at peace', () => {
  it('wander but stay near home; the nomads range further', () => {
    for (const [tribe, roam] of [['cherokee', 3], ['sioux', 4]] as const) {
      let s = land({ tribe });
      let widest = 0;
      const seen = new Set<string>();
      for (let turn = 0; turn < 60; turn++) {
        s = round(s).state;
        const b = s.units['brave-v'];
        widest = Math.max(widest, far(b, 10, 10));
        seen.add(`${b?.x},${b?.y}`);
        expect(checkInvariants(s)).toEqual([]);
      }
      expect(widest).toBeLessThanOrEqual(roam);
      expect(widest).toBeGreaterThanOrEqual(2);
      expect(seen.size).toBeGreaterThan(8);
    }
  });

  it('never step into water, mountains, colonies, other settlements or onto another unit', () => {
    let s = land({ at: [10, 11] });
    s = { ...s, settlements: { ...s.settlements, w: village('w', 'cherokee', 12, 12) }, units: { ...s.units, 'brave-w': braveUnit('brave-w', 'cherokee', 'brave', 12, 11) } };
    s = withColony(s, { id: 'col', owner: 'b', x: 8, y: 10, name: 'C' });
    s = withUnit(s, { id: 'guard', owner: 'b', type: 'soldier', x: 9, y: 11 });
    for (let turn = 0; turn < 40; turn++) {
      s = round(s).state;
      const braves = Object.values(s.units).filter((u) => u.owner.startsWith('tribe:'));
      for (const b of braves) {
        expect([b.x, b.y]).not.toEqual([8, 10]);
        expect(Object.values(s.units).filter((u) => u.x === b.x && u.y === b.y)).toHaveLength(1);
        const home = b.id === 'brave-v' ? [10, 10] : [12, 12];
        const other = b.id === 'brave-v' ? [12, 12] : [10, 10];
        expect([b.x, b.y]).not.toEqual(other);
        // a colony close by may draw a brave a little beyond its usual range
        expect(far(b, home[0]!, home[1]!)).toBeLessThanOrEqual(5);
      }
    }
  });

  it('call on a colony they come alongside, bringing gifts when content', () => {
    const s = withColony(land({ at: [10, 12] }), { id: 'col', x: 10, y: 13, name: 'Home', colonists: people(3), goods: { food: 10 } });
    // a brave beside a colony calls only now and then (about one turn in eight): find a turn on which it does
    let events: NativeAiEvent[] = [];
    let after = s;
    let calls = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const tried: NativeAiEvent[] = [];
      const result = braveTurn(s, 'brave-v', createRng(seed), tried);
      if (!tried.some((e) => e.type === 'nativeVisit')) continue;
      if (calls++ === 0) {
        events = tried;
        after = result;
      }
    }
    expect(calls).toBeGreaterThan(10);
    expect(calls).toBeLessThan(45);
    expect(events.some((e) => e.type === 'nativeVisit' && e.friendly)).toBe(true);
    expect(events.some((e) => e.type === 'nativeGift')).toBe(true);
    expect(after.colonies['col']?.goods.food).toBe(75);
    expect(after.units['brave-v']?.movesLeft).toBe(0);
    expect(after.rng).toEqual(s.rng); // the caller keeps the random stream
  });

  it('meeting a power for the first time brings the treaty offer', () => {
    const strangers = withUnit(land({ record: { met: [], peace: [] }, at: [10, 12] }), { id: 'u', x: 10, y: 13 });
    const events: NativeAiEvent[] = [];
    const after = braveTurn(strangers, 'brave-v', createRng(1), events);
    expect(events.filter((e) => e.type === 'tribeMet' || e.type === 'treatyOffered').map((e) => e.type)).toEqual(['tribeMet', 'treatyOffered']);
    expect(after.players[0]?.pendingTreaties).toEqual(['cherokee']);
  });

  it('take up the tribe\'s muskets and horses when at home', () => {
    const s = land({ at: [10, 10], record: { muskets: 2, breeding: 60 } });
    const after = braveTurn(s, 'brave-v', createRng(2), []);
    expect(after.units['brave-v']?.type).toBe('mountedWarrior');
    expect(after.tribes.cherokee?.breeding).toBe(10);
    const plain = braveTurn(land({ at: [10, 11], record: { muskets: 2 } }), 'brave-v', createRng(2), []);
    expect(['brave', 'armedBrave']).toContain(plain.units['brave-v']?.type);
  });
});

describe('braves at war', () => {
  const war = (o: Opts = {}): GameState => land({ ...o, record: { alarm: { a: 100 }, ...o.record } });

  it('make for the nearest enemy and attack when they reach it', () => {
    let s = withUnit(war(), { id: 'u', type: 'soldier', x: 15, y: 11, orders: 'fortified' });
    const before = far(s.units['brave-v'], 15, 11);
    const events: NativeAiEvent[] = [];
    s = braveTurn(s, 'brave-v', createRng(1), events);
    expect(far(s.units['brave-v'], 15, 11)).toBeLessThan(before);
    let fought = events.some((e) => e.type === 'battle');
    for (let turn = 0; turn < 8 && !fought; turn++) {
      s = braveTurn(s, 'brave-v', createRng(turn + 2), events);
      fought = events.some((e) => e.type === 'battle');
    }
    expect(fought).toBe(true);
    expect(events.find((e) => e.type === 'battle')).toMatchObject({ attackerId: 'brave-v', x: 15, y: 11 });
  });

  it('leave powers they have no quarrel with alone', () => {
    let s = withUnit(war(), { id: 'theirs', owner: 'b', type: 'soldier', x: 11, y: 12 });
    const events: GameEvent[] = [];
    for (let turn = 0; turn < 20; turn++) {
      const r = round(s);
      s = r.state;
      events.push(...r.events);
    }
    expect(events.some((e) => e.type === 'battle')).toBe(false);
    expect(s.units['theirs']).toBeDefined();
  });

  it('a hostile settlement sends its brave even when the tribe as a whole is calm', () => {
    const s = withUnit(land({ village: { alarm: { a: 200 } } }), { id: 'u', type: 'soldier', x: 11, y: 12 });
    const events: NativeAiEvent[] = [];
    braveTurn(s, 'brave-v', createRng(4), events);
    expect(events.some((e) => e.type === 'battle')).toBe(true);
  });

  it('raid colonies; over many turns a tribe at war keeps coming', () => {
    let s = withColony(war(), { id: 'col', x: 13, y: 10, name: 'Home', colonists: people(4), goods: { furs: 100, cloth: 100, food: 100 } });
    s = withColony(s, { id: 'far', x: 3, y: 3, name: 'Far', colonists: people(8, 'f') });
    const counts: Record<string, number> = {};
    for (let turn = 0; turn < 60; turn++) {
      // the settlement stays angry: the colonists keep provoking it
      s = { ...s, tribes: { cherokee: { ...s.tribes.cherokee!, alarm: { a: 100 } } } };
      const r = round(s);
      s = r.state;
      for (const e of r.events) counts[e.type] = (counts[e.type] ?? 0) + 1;
      expect(checkInvariants(s)).toEqual([]);
    }
    expect(counts['battle']).toBeGreaterThan(3);
    expect(counts['colonyRaided']).toBeGreaterThan(1);
    expect(counts['braveRaised']).toBeGreaterThan(1);
    expect(s.colonies['col']?.colonists.length).toBeGreaterThanOrEqual(4); // raids kill nobody
  });
});

describe('the tribe\'s turn', () => {
  it('herds breed up to a cap set by the tribe\'s numbers', () => {
    const s = land({ record: { horses: 3, breeding: 10 } });
    expect(bravesTurn(s, []).tribes.cherokee?.breeding).toBe(13);
    const full = land({ record: { horses: 3, breeding: 59 } });
    expect(bravesTurn(full, []).tribes.cherokee?.breeding).toBe(60); // 2 x (5 people + 25)
    expect(bravesTurn(land({ record: { horses: 0, breeding: 10 } }), []).tribes.cherokee?.breeding).toBe(10);
  });

  it('is deterministic, and does nothing where there are no natives', () => {
    const s = land();
    expect(bravesTurn(s, [])).toEqual(bravesTurn(s, []));
    const empty = world({ rows: ROWS });
    expect(bravesTurn(empty, [])).toBe(empty);
  });

  it('after the Declaration a tribe with a grudge may side with the Crown, burning the rebels\' missions', () => {
    let joined = 0;
    for (let seed = 0; seed < 200; seed++) {
      const base = land({ seed, record: { grudge: ['a'] }, village: { mission: { owner: 'a', expert: false } } });
      const s = { ...base, players: base.players.map((p) => (p.id === 'a' ? { ...p, atWar: true } : p)) };
      const events: NativeAiEvent[] = [];
      const after = bravesTurn(s, events);
      if (!events.some((e) => e.type === 'tribeJoinedCrown')) continue;
      joined++;
      expect(after.tribes.cherokee).toMatchObject({ joinedCrown: true, alarm: { a: 100 } });
      expect(after.settlements['v']?.mission).toBeNull();
      expect(bravesTurn(after, []).tribes.cherokee?.joinedCrown).toBe(true);
    }
    // conquistador: one chance in 2 x (5 - 2) + 1
    expect(joined / 200).toBeCloseTo(1 / 7, 1);
    const peace = land({ record: { grudge: ['a'] } });
    const quiet: NativeAiEvent[] = [];
    bravesTurn(peace, quiet);
    expect(quiet.some((e) => e.type === 'tribeJoinedCrown')).toBe(false);
  });
});
