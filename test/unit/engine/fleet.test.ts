import { describe, expect, it } from 'vitest';
import { applyAction } from '../../../src/engine/actions';
import { AI_FLEET } from '../../../src/engine/data/ai';
import type { DIFFICULTIES } from '../../../src/engine/data/yields';
import { computerTreasury, fleetCensus, fleetWants, subsidy } from '../../../src/engine/fleet';
import type { Colonist, GameState, Player, Unit } from '../../../src/engine/state';
import { withColony, withUnit, world } from '../../helpers/world';

type Level = (typeof DIFFICULTIES)[number];
// open sea with a block of land (x 12..15, y 2..9)
const ROWS = Array.from({ length: 12 }, (_, y) => (y < 2 || y > 9 ? '~'.repeat(24) : `${'~'.repeat(12)}....${'~'.repeat(8)}`));
const people = (n: number, p: string): Colonist[] => Array.from({ length: n }, (_, i) => ({ id: `${p}${i}`, profession: 'freeColonist' as const, job: { kind: 'idle' as const }, turns: 0 }));
/** Computer powers a and b and a human h. */
const sea = (o: { turn?: number; difficulty?: Level; gold?: number } = {}): GameState => {
  const s = world({ rows: ROWS, difficulty: o.difficulty ?? 'conquistador', players: [{ id: 'a', kind: 'ai' }, { id: 'b', kind: 'ai' }, { id: 'h', kind: 'human' }] });
  return { ...s, turn: o.turn ?? 120, players: s.players.map((p) => (p.id === 'a' ? { ...p, gold: o.gold ?? 0 } : p)) };
};
const me = (s: GameState): Player => s.players[0] as Player;
const ship = (s: GameState, id: string, type: Unit['type'], x: number, y: number, owner = 'a'): GameState => withUnit(s, { id, type, profession: null, x, y, owner });
const col = (s: GameState, id: string, x: number, y: number, pop: number): GameState => withColony(s, { id, x, y, colonists: people(pop, `${id}-`) });
/** Two colonies of four each on the east shore, and a caravel. */
const settled = (o: Parameters<typeof sea>[0] = {}): GameState => ship(col(col(sea(o), 'north', 15, 3, 4), 'south', 15, 8, 4), 'car', 'caravel', 16, 3);
/** The same with b's frigate far off in the west: the others' navies then count for something (one privateer alone does not). */
const uneasy = (o: Parameters<typeof sea>[0] = {}): GameState => ship(settled(o), 'bf', 'frigate', 2, 2, 'b');

describe('fleet rule table', () => {
  it('matches the snapshot', () => {
    expect(AI_FLEET).toMatchSnapshot();
  });
});

describe('what a power has afloat', () => {
  it('counts colonies, colonists, ships, warships and holds, wherever the ships are', () => {
    const s = ship(ship(settled(), 'f', 'frigate', 20, 5), 'p', 'privateer', 20, 6);
    expect(fleetCensus(s, 'a')).toMatchObject({ colonies: 2, colonists: 8, ships: 3, warships: 2, holds: 2 + 4 + 2 });
    expect(fleetCensus(s, 'b')).toMatchObject({ colonies: 0, colonists: 0, ships: 0, warships: 0, holds: 0 });
  });

  it('a colony is beset by a foreign warship within 5 squares, and separately by a frigate', () => {
    const quiet = settled();
    expect(fleetCensus(quiet, 'a')).toMatchObject({ frigateBeset: { colonies: 0, colonists: 0 }, warshipBeset: { colonies: 0, colonists: 0 } });
    const rover = ship(quiet, 'x', 'privateer', 20, 3, 'h');
    expect(fleetCensus(rover, 'a')).toMatchObject({ frigateBeset: { colonies: 0, colonists: 0 }, warshipBeset: { colonies: 2, colonists: 8 } });
    const farther = ship(quiet, 'x', 'privateer', 21, 2, 'h');
    expect(fleetCensus(farther, 'a').warshipBeset).toEqual({ colonies: 0, colonists: 0 });
    const frigate = ship(quiet, 'x', 'frigate', 20, 1, 'h');
    expect(fleetCensus(frigate, 'a')).toMatchObject({ frigateBeset: { colonies: 1, colonists: 4 }, warshipBeset: { colonies: 1, colonists: 4 } });
    // a merchant ship is no threat, and our own warships do not beset us
    expect(fleetCensus(ship(quiet, 'x', 'merchantman', 17, 3, 'h'), 'a').warshipBeset.colonies).toBe(0);
    expect(fleetCensus(ship(quiet, 'x', 'frigate', 17, 3), 'a').warshipBeset.colonies).toBe(0);
  });
});

describe('what it wants', () => {
  it("a privateer to answer the human's, when foreign warships are about and it has fewer than two", () => {
    const hunted = ship(uneasy(), 'x', 'privateer', 20, 3, 'h');
    expect(fleetWants(hunted, 'a')).toMatchObject({ privateer: true, frigate: false });
    // the others' threat is their privateers + 4 x their frigates, over 4: a single privateer in all the world comes to nothing
    expect(fleetWants(ship(settled(), 'x', 'privateer', 20, 3, 'h'), 'a').privateer).toBe(false);
    // not when the privateer about is another computer power's and the human has none
    expect(fleetWants(ship(uneasy(), 'x', 'privateer', 20, 3, 'b'), 'a').privateer).toBe(false);
    // not with two of its own already
    expect(fleetWants(ship(ship(hunted, 'p1', 'privateer', 16, 8), 'p2', 'privateer', 16, 8), 'a').privateer).toBe(false);
    expect(fleetWants(ship(hunted, 'p1', 'privateer', 16, 8), 'a').privateer).toBe(true);
    // not when nothing is near its colonies
    expect(fleetWants(ship(uneasy(), 'x', 'privateer', 8, 11, 'h'), 'a').privateer).toBe(false);
  });

  it("a frigate to answer the human's, when it has none; and then no privateer", () => {
    const hunted = ship(settled(), 'x', 'frigate', 20, 5, 'h');
    expect(fleetWants(hunted, 'a')).toMatchObject({ frigate: true, privateer: false });
    expect(fleetWants(ship(hunted, 'f', 'frigate', 16, 8), 'a').frigate).toBe(false);
    // the human's frigate and privateer both about, and a frigate of its own: now the privateer is wanted
    const both = ship(ship(hunted, 'y', 'privateer', 20, 6, 'h'), 'f', 'frigate', 16, 8);
    expect(fleetWants(both, 'a')).toMatchObject({ frigate: false, privateer: true });
  });

  it('only when enough of it is beset: half its colonies or half its people, or late in the game with gold in hand', () => {
    // six colonies, one of them (with one colonist of twelve) beset by the human's privateer
    let s = sea({ turn: 90 });
    for (let i = 0; i < 6; i++) s = col(s, `c${i}`, 12 + (i % 2) * 3, 2 + i, 2);
    s = ship(ship(ship(s, 'car', 'caravel', 16, 3), 'x', 'privateer', 20, 1, 'h'), 'bf', 'frigate', 2, 11, 'b');
    const c = fleetCensus(s, 'a');
    expect(c.colonies >> 1).toBeGreaterThan(c.warshipBeset.colonies);
    expect(c.colonists >> 1).toBeGreaterThan(c.warshipBeset.colonists);
    expect(fleetWants(s, 'a').privateer).toBe(false);
    // after turn 100 with 1000 gold it answers all the same
    const late = (turn: number, gold: number): boolean => fleetWants({ ...s, turn, players: s.players.map((p) => (p.id === 'a' ? { ...p, gold } : p)) }, 'a').privateer;
    expect(late(101, 1000)).toBe(true);
    expect(late(100, 1000)).toBe(false);
    expect(late(101, 999)).toBe(false);
  });

  it('it lags at sea while it has fewer warships than the leader, or nobody leads outright', () => {
    expect(fleetWants(settled(), 'a').lag).toBe(true); // nobody has any
    const leading = ship(settled(), 'f', 'frigate', 16, 8);
    expect(fleetWants(leading, 'a').lag).toBe(false);
    expect(fleetWants(leading, 'b').lag).toBe(true);
    const level = ship(leading, 'g', 'frigate', 2, 2, 'b');
    expect(fleetWants(level, 'a').lag).toBe(true);
  });

  it('it buys only while colonists / 2 + colonies is at least its holds, and is short of transport by the stricter measure', () => {
    // 8 colonists in 2 colonies: 4 + 2 = 6 holds allowed; short while (4 + 4) / 2 = 4 >= holds
    const withHolds = (types: Unit['type'][]): GameState => types.reduce((s, t, i) => ship(s, `s${i}`, t, 16, 8), sea());
    const base = (types: Unit['type'][]): GameState => col(col(withHolds(types), 'north', 15, 3, 4), 'south', 15, 8, 4);
    expect(fleetWants(base(['caravel']), 'a')).toMatchObject({ mayBuy: true, short: true, noShips: false });
    expect(fleetWants(base(['caravel', 'caravel']), 'a')).toMatchObject({ mayBuy: true, short: true });
    expect(fleetWants(base(['galleon']), 'a')).toMatchObject({ mayBuy: true, short: false });
    expect(fleetWants(base(['galleon', 'caravel']), 'a')).toMatchObject({ mayBuy: false, short: false });
    expect(fleetWants(base([]), 'a')).toMatchObject({ mayBuy: true, noShips: true });
  });

  it('nothing once independence has been declared', () => {
    const hunted = ship(uneasy(), 'x', 'privateer', 20, 3, 'h');
    expect(fleetWants({ ...hunted, crownPlayer: 'crown' }, 'a')).toMatchObject({ privateer: false, frigate: false, lag: false, mayBuy: false });
  });
});

describe('the subsidy', () => {
  it('4 x level x ((year - 1500) / 50 + colonies): nothing on the easiest level or before turn 20', () => {
    // turn 120 is 1606: 2 + 2 colonies
    expect(subsidy(settled({ difficulty: 'conquistador' }), 'a')).toBe(4 * 2 * 4);
    expect(subsidy(settled({ difficulty: 'explorer' }), 'a')).toBe(4 * 1 * 4);
    expect(subsidy(settled({ difficulty: 'discoverer' }), 'a')).toBe(0);
    expect(subsidy(settled({ turn: 19 }), 'a')).toBe(0);
    // turn 20 is 1512: nothing for the years yet, the colonies alone
    expect(subsidy(settled({ turn: 20 }), 'a')).toBe(4 * 2 * 2);
    expect(subsidy(sea({ turn: 20 }), 'a')).toBe(0);
  });

  it('half again on the fourth level, doubled on the fifth, and doubled from 1700', () => {
    expect(subsidy(settled({ difficulty: 'governor' }), 'a')).toBe(4 * ((3 * 4 * 3) >> 1));
    expect(subsidy(settled({ difficulty: 'viceroy' }), 'a')).toBe(4 * 4 * 4 * 2);
    // turn 308 is 1700: (4 + 2) doubled
    expect(subsidy(settled({ turn: 308 }), 'a')).toBe(4 * 2 * 12);
    expect(subsidy(settled({ turn: 306 }), 'a')).toBe(4 * 2 * (3 + 2));
  });

  it('is paid at the start of a computer power\'s turn, and to nobody else', () => {
    const s = { ...settled(), current: 2 }; // the human ends the turn; a is next round the table
    const next = applyAction(s, { type: 'endTurn' }).state;
    expect(next.current).toBe(0);
    expect(me(next).gold).toBe(subsidy(next, 'a'));
    const human = settled();
    expect(computerTreasury({ ...human, players: human.players.map((p) => ({ ...p, kind: 'human' as const })) }, 'a')).toMatchObject({ players: human.players.map((p) => ({ gold: p.gold })) });
  });
});

describe('gold made up to the price', () => {
  const gold = (s: GameState): number => me(computerTreasury(s, 'a')).gold;
  const noSubsidy = { difficulty: 'discoverer' as const };

  it('of a caravel when it has no ship at all', () => {
    expect(gold(col(sea(noSubsidy), 'north', 15, 3, 4))).toBe(1000);
    expect(gold(settled(noSubsidy))).toBe(0);
    expect(gold(col(sea({ ...noSubsidy, gold: 1500 }), 'north', 15, 3, 4))).toBe(1500);
  });

  it("of a privateer or a frigate when it means to answer the human's", () => {
    expect(gold(ship(uneasy(noSubsidy), 'x', 'privateer', 20, 3, 'h'))).toBe(2000);
    expect(gold(ship(settled(noSubsidy), 'x', 'frigate', 20, 5, 'h'))).toBe(5000);
    expect(gold(ship(settled({ ...noSubsidy, gold: 7000 }), 'x', 'frigate', 20, 5, 'h'))).toBe(7000);
  });
});
