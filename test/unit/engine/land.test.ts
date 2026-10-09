import { describe, expect, it } from 'vitest';
import { applyAction, validateAction, type Action } from '../../../src/engine/actions';
import { tribalAlarm } from '../../../src/engine/alarm';
import { LAND } from '../../../src/engine/data/land';
import { settlementPopulation } from '../../../src/engine/data/tribes';
import type { DIFFICULTIES } from '../../../src/engine/data/yields';
import { checkInvariants } from '../../../src/engine/invariants';
import { squareStatus } from '../../../src/engine/jobs';
import { aiBuysLand, grievance, landlord, landPrice } from '../../../src/engine/land';
import { markHomelands } from '../../../src/engine/settlements';
import type { Colonist, Colony, GameState, Settlement, TribeState } from '../../../src/engine/state';
import { setTile, withColony, withUnit, world } from '../../helpers/world';

type Level = (typeof DIFFICULTIES)[number];
const ROWS = Array.from({ length: 14 }, (_, y) => (y === 0 || y === 13 ? '~'.repeat(16) : `~${'.'.repeat(14)}~`));
const village = (tribe: Settlement['tribe'], x: number, y: number, capital = false): Settlement => ({
  id: 'v', tribe, x, y, capital, population: settlementPopulation(tribe, capital).start, growth: 0, taught: false, tributePaid: false,
  alarm: {}, mission: null, scouted: [], lastBought: null, lastSold: null, haggleMemory: null,
});
const record = (extra: Partial<TribeState> = {}): TribeState => ({ alarm: {}, goodwill: {}, met: ['a', 'b'], muskets: 0, horses: 0, breeding: 0, silver: 0, peace: ['a', 'b'], landSold: 0, grudge: [], joinedCrown: false, visited: {}, stock: {}, ...extra });
const people = (n: number): Colonist[] => Array.from({ length: n }, (_, i) => ({ id: `c${i}`, profession: 'freeColonist' as const, job: { kind: 'idle' as const }, turns: 0 }));
interface Opts { difficulty?: Level; tribe?: Settlement['tribe']; capital?: boolean; record?: Partial<TribeState>; fathers?: string[]; kind?: 'human' | 'ai'; colonists?: number; gold?: number }
/** A settlement at (8,6); a colony of player a at (5,6) whose east neighbour (6,6) is two from the settlement, and (7,6) beside it. */
function land(o: Opts = {}): GameState {
  const tribe = o.tribe ?? 'aztec';
  let s = world({ rows: ROWS, difficulty: o.difficulty ?? 'discoverer', players: [{ id: 'a', fathers: o.fathers ?? [], kind: o.kind ?? 'human' }, { id: 'b' }] });
  const v = village(tribe, 8, 6, o.capital ?? false);
  s = { ...s, settlements: { v }, tribes: { [tribe]: record(o.record) }, players: s.players.map((p) => (p.id === 'a' ? { ...p, gold: o.gold ?? 1000 } : p)) };
  s = { ...s, map: markHomelands(s.map, [v]) };
  return withColony(s, { id: 'col', x: 5, y: 6, name: 'Home', colonists: people(o.colonists ?? 10) });
}
const code = (s: GameState, a: Action): string => {
  const v = validateAction(s, a);
  return v.ok ? 'ok' : v.error.code;
};
const T = (s: GameState, tribe: Settlement['tribe'] = 'aztec'): number => tribalAlarm(s, tribe, 'a');

describe('land table', () => {
  it('matches the snapshot', () => {
    expect(LAND).toMatchSnapshot();
  });
});

describe('whose land it is', () => {
  it('a tile within a settlement\'s reach is its tribe\'s to sell, once the tribe has met the power', () => {
    expect(landlord(land(), 'a', 6, 6)?.id).toBe('v');
    expect(landlord(land(), 'a', 5, 6)).toBeNull(); // the colony's own square was claimed at founding
    expect(landlord(land(), 'a', 3, 6)).toBeNull();
    expect(landlord(land({ record: { met: [] } }), 'a', 6, 6)).toBeNull();
    expect(landlord(land({ fathers: ['peterMinuit'] }), 'a', 6, 6)).toBeNull();
    expect(squareStatus(land(), land().colonies['col'] as Colony, 1, 0)).toBe('nativeLand');
  });
});

describe('the price of land', () => {
  it('follows the worked example: easiest level, a camp, beside it, four colonists, content', () => {
    const s = land({ tribe: 'sioux', colonists: 4 });
    // points 2 x 3 + 0 + 0 - 1 = 5, less (10 - 4) / 2 = 3: two points at 65, halved
    expect(landPrice(s, 'a', 7, 6)).toBe(65);
  });

  it('rises with difficulty, the tribe\'s advancement, land already sold and its anger; falls with distance', () => {
    const price = (o: Opts, x = 7): number => landPrice(land(o), 'a', x, 6);
    // Aztec (level 2), beside the city, ten colonists, content: (6 + 2 - 1) x 65 / 2
    expect(price({})).toBe(227);
    expect(price({}, 6)).toBe(195); // one step further: a point less
    expect(price({ difficulty: 'viceroy' })).toBe(Math.trunc((15 * 65) / 2));
    expect(price({ tribe: 'inca' })).toBe(260);
    expect(price({ record: { landSold: 3 } })).toBe(325);
    expect(price({ record: { alarm: { a: 30 } } })).toBe(455);
    expect(price({ record: { alarm: { a: 80 } } })).toBe(910);
    expect(price({ capital: true })).toBe(Math.trunc((7 * 65 + ((7 * 65) >> 1)) / 2));
  });

  it('is doubled on a tile with a special resource, lower for a small power, and never under one point', () => {
    const s = land();
    expect(landPrice(setTile(s, 7, 6, { resource: 'game' }), 'a', 7, 6)).toBe(455);
    expect(landPrice(land({ colonists: 2 }), 'a', 7, 6)).toBe(Math.trunc((3 * 65) / 2));
    expect(landPrice(land({ tribe: 'sioux', colonists: 1 }), 'a', 7, 6)).toBe(32);
  });

  it('is reckoned differently for a computer power, and is nothing for land that is not native', () => {
    // 12 + 2 - 0 - 1 = 13 points at 50, halved; no difficulty or anger terms beyond the base
    expect(landPrice(land({ kind: 'ai' }), 'a', 7, 6)).toBe(325);
    expect(landPrice(land({ kind: 'ai', difficulty: 'viceroy' }), 'a', 7, 6)).toBe(225);
    expect(landPrice(land(), 'a', 3, 6)).toBe(0);
    expect(landPrice(land({ fathers: ['peterMinuit'] }), 'a', 7, 6)).toBe(0);
  });
});

describe('buying and taking', () => {
  const BUY: Action = { type: 'acquireLand', x: 6, y: 6, pay: true };
  const TAKE: Action = { type: 'acquireLand', x: 6, y: 6, pay: false };

  it('buying pays the tribe, which asks more next time, and the tile is ours', () => {
    const s = land();
    const r = applyAction(s, BUY);
    expect(r.state.players[0]?.gold).toBe(1000 - 195);
    expect(r.state.tribes.aztec?.landSold).toBe(1);
    expect(r.state.map.tiles[6 * 16 + 6]?.claim).toBe('a');
    expect(r.events).toEqual([{ type: 'landAcquired', player: 'a', x: 6, y: 6, tribe: 'aztec', paid: 195 }]);
    expect(T(r.state)).toBe(0);
    expect(squareStatus(r.state, r.state.colonies['col'] as Colony, 1, 0)).toBe('free');
    expect(landPrice(r.state, 'a', 6, 5)).toBeGreaterThan(landPrice(s, 'a', 6, 5));
    expect(code(r.state, BUY)).toBe('notNativeLand');
    expect(checkInvariants(r.state)).toEqual([]);
  });

  it('taking costs nothing but the tribe\'s good will: more the nearer its settlement, double for prized land', () => {
    const r = applyAction(land({ difficulty: 'conquistador' }), TAKE);
    expect(r.state.players[0]?.gold).toBe(1000);
    expect(r.state.map.tiles[6 * 16 + 6]?.claim).toBe('a');
    expect(T(r.state)).toBe(2 * 7); // two squares off: twice (level 2 + 5)
    const amount = (s: GameState, x: number, y: number): number => grievance(s, 'a', x, y, false)?.amount ?? 0;
    const s = land({ difficulty: 'conquistador' });
    expect(amount(s, 7, 6)).toBe(21);
    expect(amount(s, 6, 6)).toBe(14);
    expect(amount(setTile(s, 7, 6, { resource: 'game' }), 7, 6)).toBe(42);
    expect(amount(land({ difficulty: 'viceroy' }), 7, 6)).toBe(27);
    expect(amount(land({ kind: 'ai', difficulty: 'viceroy' }), 7, 6)).toBe(15);
    expect(grievance(s, 'a', 3, 6, false)).toBeNull();
  });

  it('needs native land within our grasp and, to buy, the gold', () => {
    expect(code(land({ gold: 194 }), BUY)).toBe('cannotAfford');
    expect(code(land({ gold: 194 }), TAKE)).toBe('ok');
    expect(code(land(), { type: 'acquireLand', x: 3, y: 6, pay: true })).toBe('notNativeLand');
    // the far side of the city is native land but nowhere near us
    expect(code(land(), { type: 'acquireLand', x: 10, y: 6, pay: false })).toBe('outOfReach');
    expect(code(withUnit(land(), { id: 'p', type: 'pioneer', x: 10, y: 6 }), { type: 'acquireLand', x: 10, y: 6, pay: false })).toBe('ok');
  });

  it('a computer power buys when it can well afford to', () => {
    expect(aiBuysLand(land({ kind: 'ai', gold: 500 }), 'a', 7, 6)).toBe(true);
    expect(aiBuysLand(land({ kind: 'ai', gold: 480 }), 'a', 7, 6)).toBe(false);
  });
});

describe('working land that was never paid for', () => {
  it('a road or a cleared field finished on native land is resented; on bought land it is not', () => {
    const work = (s: GameState, job: 'road' | 'plow'): GameState => {
      let next = applyAction(withUnit(s, { id: 'p', type: 'pioneer', profession: 'hardyPioneer', x: 7, y: 6, tools: 100 }), { type: 'pioneerWork', unitId: 'p', job }).state;
      for (let i = 0; i < 24 && next.units['p']?.orders === job; i++) next = applyAction(next, { type: 'endTurn' }).state;
      return next;
    };
    const s = land({ difficulty: 'conquistador' });
    const road = work(s, 'road');
    expect(road.map.tiles[6 * 16 + 7]?.road).toBe(true);
    expect(T(road)).toBe(3 * (2 + 3));
    const field = work(s, 'plow');
    expect(field.map.tiles[6 * 16 + 7]?.plowed).toBe(true);
    expect(T(field)).toBe(3 * (2 + 5));
    const bought = applyAction(withUnit(s, { id: 'q', x: 7, y: 6 }), { type: 'acquireLand', x: 7, y: 6, pay: true }).state;
    expect(T(work(bought, 'plow'))).toBe(0);
    expect(T(work(land({ difficulty: 'conquistador', fathers: ['peterMinuit'] }), 'plow'))).toBe(0);
  });
});
