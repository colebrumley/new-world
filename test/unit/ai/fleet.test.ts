import { describe, expect, it } from 'vitest';
import { europeanAction, fleetPurchase, playTurn } from '../../../src/ai/european';
import type { Chances } from '../../../src/ai/missions';
import type { Action } from '../../../src/engine/actions';
import { checkInvariants } from '../../../src/engine/invariants';
import type { Rng } from '../../../src/engine/rng';
import type { Colonist, GameState, Player, Unit } from '../../../src/engine/state';
import { withColony, withUnit, world } from '../../helpers/world';

const ROWS = Array.from({ length: 12 }, (_, y) => (y < 2 || y > 9 ? '~'.repeat(24) : `${'~'.repeat(12)}....${'~'.repeat(8)}`));
const people = (n: number, p: string): Colonist[] => Array.from({ length: n }, (_, i) => ({ id: `${p}${i}`, profession: 'freeColonist' as const, job: { kind: 'idle' as const }, turns: 0 }));
const ship = (s: GameState, id: string, type: Unit['type'], x: number, y: number, owner = 'a'): GameState => withUnit(s, { id, type, profession: null, x, y, owner });
/** Computer power a with `colonies` colonies of four (each with muskets in store unless told otherwise), the given ships, and this much gold; b and the human h besides. */
const power = (gold: number, ships: Unit['type'][], colonies = 4, muskets = 50): GameState => {
  let s = world({ rows: ROWS, players: [{ id: 'a', kind: 'ai' }, { id: 'b', kind: 'ai' }, { id: 'h', kind: 'human' }] });
  s = { ...s, turn: 120, players: s.players.map((p) => (p.id === 'a' ? { ...p, gold } : p)) };
  for (let i = 0; i < colonies; i++) s = withColony(s, { id: `c${i}`, x: 12 + (i % 2) * 3, y: 2 + 2 * i, colonists: people(4, `c${i}-`), goods: { muskets }, construction: { kind: 'building', id: 'stockade' } });
  ships.forEach((t, i) => { s = ship(s, `s${i}`, t, 16, 2); });
  return s;
};
const me = (s: GameState): Player => s.players[0] as Player;
/** Throws that come up as listed, one after another (then 1s), for the ship round; `guns` for the artillery throw. */
const throws = (list: number[], guns = 2): Chances => (label) => {
  const left = [...list];
  return { int: () => (label.endsWith(':guns') ? guns : left.shift() ?? 1) } as unknown as Rng;
};
const buys = (s: GameState, chances: Chances): Action | null => fleetPurchase(s, me(s), new Set(), chances);
const order = (unit: string): Action => ({ type: 'purchaseUnit', unit } as Action);

describe('the round of buying', () => {
  // four colonies of four: 8 + 4 = 12 holds allowed; one caravel (2 holds) leaves it short of transport ((8 + 8) / 2 >= 2)
  it('a frigate on a coin toss while it has fewer than 8 warships and lags at sea, if it can pay', () => {
    expect(buys(power(5000, ['caravel']), throws([1]))).toEqual(order('frigate'));
    // the toss fails: on to the galleon (three throws in four)
    expect(buys(power(5000, ['caravel']), throws([2, 2]))).toEqual(order('galleon'));
    // it cannot pay for a frigate: the galleon again
    expect(buys(power(4999, ['caravel']), throws([1, 2]))).toEqual(order('galleon'));
    // it leads at sea outright: no frigate even on a good toss
    expect(buys(power(5000, ['caravel', 'frigate']), throws([1, 2]))).toEqual(order('galleon'));
  });

  it('then a galleon, a merchantman while its holds are under 12, a caravel while they are 2 or fewer', () => {
    expect(buys(power(3000, ['caravel']), throws([2, 3]))).toEqual(order('galleon'));
    // the galleon throw comes up 1 (one time in four): a merchantman on the next toss
    expect(buys(power(3000, ['caravel']), throws([2, 1, 1]))).toEqual(order('merchantman'));
    expect(buys(power(2999, ['caravel']), throws([2, 2, 1]))).toEqual(order('merchantman'));
    // that toss fails too: a caravel, having only 2 holds
    expect(buys(power(3000, ['caravel']), throws([2, 1, 2]))).toEqual(order('caravel'));
    // with 12 holds already there is no merchantman, and no caravel
    expect(buys(power(2500, ['galleon', 'galleon']), throws([2, 1, 1, 2]))).toBeNull();
    // too poor for anything
    expect(buys(power(999, ['caravel']), throws([1, 2, 1]))).toBeNull();
  });

  it('last a privateer, one time in four, while it has fewer than 4 warships, lags, and is not short of transport', () => {
    // a galleon and a merchantman: 10 holds, not short ((8 + 8) / 2 = 8 < 10), so the caravel does not come into it
    const fleet: Unit['type'][] = ['galleon', 'merchantman'];
    // frigate toss fails, galleon throw 1, merchantman toss fails, privateer throw 1
    expect(buys(power(2000, fleet), throws([2, 1, 2, 1]))).toEqual(order('privateer'));
    expect(buys(power(2000, fleet), throws([2, 1, 2, 2]))).toBeNull();
    expect(buys(power(1999, fleet), throws([2, 1, 2, 1]))).toBeNull();
    // short of transport: no privateer
    expect(buys(power(2000, ['merchantman', 'merchantman']), throws([2, 1, 2, 1]))).toBeNull();
  });

  it('nothing while its fleet is already too big for it, or once independence is declared', () => {
    // 14 holds against 12 allowed
    expect(buys(power(9000, ['galleon', 'galleon', 'caravel']), throws([1, 2, 1]))).toBeNull();
    expect(buys({ ...power(9000, ['caravel']), crownPlayer: 'crown' }, throws([1]))).toBeNull();
  });

  it("the human's privateers and frigate are answered before anything else", () => {
    // (b's frigate far off makes the others' navies count for something)
    const far = (s: GameState): GameState => ship(s, 'bf', 'frigate', 2, 11, 'b');
    const hunted = ship(far(power(2000, ['galleon', 'merchantman'])), 'x', 'privateer', 20, 2, 'h');
    expect(buys(hunted, throws([2, 2]))).toEqual(order('privateer'));
    // (the frigate lies off two of its four colonies: half of them beset)
    const worse = ship(power(5000, ['galleon', 'merchantman']), 'x', 'frigate', 20, 6, 'h');
    expect(buys(worse, throws([2, 2]))).toEqual(order('frigate'));
    // meaning to answer and unable to pay, it buys nothing else that turn
    const poor = ship(far(power(1500, ['caravel'])), 'x', 'privateer', 20, 2, 'h');
    expect(buys(poor, throws([2, 1, 2]))).toBeNull();
  });

  it('artillery one time in four, with none on its docks, holds over 4, transport to spare, and a colony out of muskets', () => {
    const fleet: Unit['type'][] = ['galleon', 'merchantman'];
    const quiet = throws([2, 1, 2, 2], 1); // no ship this turn; the guns throw comes up
    expect(buys(power(500, fleet, 4, 0), quiet)).toEqual(order('artillery'));
    expect(buys(power(500, fleet, 4, 0), throws([2, 1, 2, 2], 2))).toBeNull();
    expect(buys(power(499, fleet, 4, 0), quiet)).toBeNull();
    // every colony has muskets: no guns are sent for
    expect(buys(power(500, fleet, 4, 50), quiet)).toBeNull();
    // short of transport, or with 4 holds or fewer
    expect(buys(power(500, ['merchantman', 'merchantman'], 4, 0), quiet)).toBeNull();
    expect(buys(power(500, ['merchantman'], 1, 0), quiet)).toBeNull();
  });

  it('at most one ship a turn, and a ship and guns may both be bought', () => {
    const s = power(9000, ['galleon', 'merchantman'], 4, 0);
    const done = new Set<string>();
    const chances = throws([1], 1);
    expect(fleetPurchase(s, me(s), done, chances)).toEqual(order('frigate'));
    expect(fleetPurchase(s, me(s), done, chances)).toEqual(order('artillery'));
    expect(fleetPurchase(s, me(s), done, chances)).toBeNull();
  });

  it('is the first business of its turn in Europe, and a whole turn of it leaves the game sound', () => {
    const s = power(9000, ['caravel']);
    const first = europeanAction(s);
    // whichever way the throws fall this turn, a power this rich with one caravel buys a ship
    expect(first).toMatchObject({ type: 'purchaseUnit' });
    const turn = playTurn(s);
    expect(checkInvariants(turn.state)).toEqual([]);
    expect(turn.actions.filter((a) => a.type === 'purchaseUnit' && a.unit !== 'artillery')).toHaveLength(1);
  });
});
