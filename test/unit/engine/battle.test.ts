import { describe, expect, it } from 'vitest';
import { applyAction, listValidActions, validateAction, type Action, type GameEvent } from '../../../src/engine/actions';
import { previewAttack, type BattleEvent } from '../../../src/engine/battle';
import { checkInvariants } from '../../../src/engine/invariants';
import type { GameState, Goods, Unit } from '../../../src/engine/state';
import { withColony, withUnit, world } from '../../helpers/world';

type Result = { state: GameState; events: readonly GameEvent[] };
const ROWS = ['~~~~~~~~~~', '~........~', '~........~', '~........~', '~~~~~~~~~~'];
interface Opts { seed?: number; fathers?: string[]; atWar?: boolean }
const field = (o: Opts = {}): GameState => world({ rows: ROWS, seed: o.seed ?? 1, difficulty: 'viceroy', players: [{ id: 'a', fathers: o.fathers ?? [], atWar: o.atWar ?? false }, { id: 'b', kind: 'ai' }] });
/** Our unit at (3,2) and theirs at (4,2). */
const facing = (mine: Partial<Parameters<typeof withUnit>[1]>, theirs: Partial<Parameters<typeof withUnit>[1]>, o: Opts = {}): GameState =>
  withUnit(withUnit(field(o), { id: 'me', type: 'soldier', x: 3, y: 2, ...mine }), { id: 'foe', owner: 'b', type: 'soldier', x: 4, y: 2, ...theirs });
const ATTACK: Action = { type: 'attack', unitId: 'me', dx: 1, dy: 0 };
const event = <K extends BattleEvent['type']>(r: Result, type: K, unitId?: string): Extract<BattleEvent, { type: K }> | undefined =>
  r.events.find((e) => e.type === type && (unitId === undefined || (e as { unitId?: string }).unitId === unitId)) as Extract<BattleEvent, { type: K }> | undefined;
function fight(make: (seed: number) => GameState, attackerWins: boolean): Result {
  for (let seed = 0; seed < 400; seed++) {
    const r = applyAction(make(seed), ATTACK);
    if (event(r, 'battle')?.attackerWon === attackerWins) return r;
  }
  throw new Error('no such result');
}
const code = (s: GameState, a: Action): string => {
  const v = validateAction(s, a);
  return v.ok ? 'ok' : v.error.code;
};

describe('attacking another power\'s unit in the open', () => {
  it('is fought at the strengths the analysis shows, begins a war, and uses up a move', () => {
    const s = facing({}, {});
    const preview = previewAttack(s, s.units['me']!, 1, 0)!;
    expect([preview.odds.attack, preview.odds.defense, preview.defender.id]).toEqual([24, 16, 'foe']);
    const r = applyAction(s, ATTACK);
    expect(event(r, 'battle')).toMatchObject({ attackerId: 'me', defenderId: 'foe', x: 4, y: 2, attack: 24, defense: 16 });
    expect(event(r, 'warBegan')).toEqual({ type: 'warBegan', by: 'a', on: 'b' });
    expect(r.state.players[0]?.stance['b']).toBe('war');
    expect(r.state.players[1]?.stance['a']).toBe('war');
    expect(checkInvariants(r.state)).toEqual([]);
    // a second attack does not declare war again
    const again = applyAction(withUnit(r.state, { id: 'me2', type: 'soldier', x: 3, y: 3 }), { type: 'attack', unitId: 'me2', dx: 1, dy: -1 });
    expect(again.events.some((e) => e.type === 'warBegan')).toBe(false);
  });

  it('a mounted unit keeps what is left of its move after the fight; the winner stays where it stood', () => {
    const r = fight((seed) => facing({ type: 'dragoon' }, {}, { seed }), true);
    expect(r.state.units['me']).toMatchObject({ x: 3, y: 2, movesLeft: 9 });
  });

  it('beaten soldiers are stripped: dragoon to soldier to colonist', () => {
    const d = fight((seed) => facing({ type: 'artillery', profession: null }, { type: 'dragoon', orders: 'fortified' }, { seed }), true);
    expect(d.state.units['foe']).toMatchObject({ type: 'soldier', owner: 'b' });
    expect(event(d, 'unitLost', 'foe')).toMatchObject({ fate: 'demoted', became: 'soldier', lost: { horses: 50 } });
    const s = fight((seed) => facing({}, {}, { seed }), true);
    expect(s.state.units['foe']).toMatchObject({ type: 'colonist', owner: 'b', profession: 'freeColonist' });
    expect(event(s, 'unitLost', 'foe')?.lost).toEqual({ muskets: 50 });
    // and when the attacker loses, the same happens to him
    const lost = fight((seed) => facing({}, { type: 'dragoon', profession: 'veteranSoldier', orders: 'fortified' }, { seed }), false);
    expect(lost.state.units['me']).toMatchObject({ type: 'colonist', owner: 'a' });
    expect(lost.state.units['foe']?.type).toBe('dragoon');
  });

  it('colonists, wagon trains and treasure are captured, cargo and all; a veteran prisoner forgets soldiering', () => {
    const c = fight((seed) => facing({}, { type: 'colonist', profession: 'expertFarmer' }, { seed }), true);
    expect(c.state.units['foe']).toMatchObject({ owner: 'a', type: 'colonist', profession: 'expertFarmer', x: 4, y: 2 });
    expect(event(c, 'unitLost', 'foe')).toMatchObject({ fate: 'captured', captor: 'a', lost: {} });
    const v = fight((seed) => facing({}, { type: 'colonist', profession: 'veteranSoldier' }, { seed }), true);
    expect(v.state.units['foe']).toMatchObject({ owner: 'a', profession: 'freeColonist' });
    const cargo: Goods = { furs: 100 };
    const w = fight((seed) => facing({}, { type: 'wagonTrain', profession: null, cargo }, { seed }), true);
    expect(w.state.units['foe']).toMatchObject({ owner: 'a', type: 'wagonTrain', cargo });
    const t = fight((seed) => {
      const s = facing({}, { type: 'treasure', profession: null }, { seed });
      return { ...s, units: { ...s.units, foe: { ...(s.units['foe'] as Unit), treasure: 3000 } } };
    }, true);
    expect(t.state.units['foe']).toMatchObject({ owner: 'a', treasure: 3000 });
    expect(checkInvariants(t.state)).toEqual([]);
  });

  it('a scout cannot take prisoners\' place: scouts, pioneers and missionaries are destroyed', () => {
    for (const type of ['scout', 'pioneer', 'missionary'] as const) {
      const r = fight((seed) => facing({}, { type }, { seed }), true);
      expect(r.state.units['foe'], type).toBeUndefined();
      expect(event(r, 'unitLost', 'foe')?.fate).toBe('destroyed');
    }
  });

  it('artillery is damaged by a first defeat and destroyed by a second', () => {
    const first = fight((seed) => facing({ type: 'dragoon' }, { type: 'artillery', profession: null }, { seed }), true);
    expect(first.state.units['foe']?.type).toBe('damagedArtillery');
    expect(event(first, 'unitLost', 'foe')?.fate).toBe('damaged');
    const second = fight((seed) => facing({ type: 'dragoon' }, { type: 'damagedArtillery', profession: null }, { seed }), true);
    expect(second.state.units['foe']).toBeUndefined();
  });

  it('a soldier who was a Jesuit goes back to his calling', () => {
    const r = fight((seed) => facing({}, { profession: 'jesuitMissionary' }, { seed }), true);
    expect(r.state.units['foe']).toMatchObject({ type: 'missionary', profession: 'jesuitMissionary' });
  });

  it('the winner on either side may be promoted; with Washington always', () => {
    const won = fight((seed) => facing({}, {}, { seed, fathers: ['georgeWashington'] }), true);
    expect(won.state.units['me']?.profession).toBe('veteranSoldier');
    // defending counts too: let the other power attack on its own turn
    let held: Result | null = null;
    for (let seed = 0; seed < 200 && !held; seed++) {
      const theirTurn = applyAction(facing({}, {}, { seed, fathers: ['georgeWashington'] }), { type: 'endTurn' }).state;
      const r = applyAction(theirTurn, { type: 'attack', unitId: 'foe', dx: -1, dy: 0 });
      if (event(r, 'battle')?.attackerWon === false) held = r;
    }
    expect(held!.state.units['me']?.profession).toBe('veteranSoldier');
    expect(event(held!, 'unitPromoted')).toEqual({ type: 'unitPromoted', unitId: 'me', profession: 'veteranSoldier' });
  });

  it('after the Declaration a rebel veteran who wins joins the Continental line', () => {
    const r = fight((seed) => facing({ profession: 'veteranSoldier' }, {}, { seed, atWar: true, fathers: ['georgeWashington'] }), true);
    expect(r.state.units['me']).toMatchObject({ type: 'continentalArmy', profession: 'veteranSoldier' });
    expect(event(r, 'unitPromoted')).toEqual({ type: 'unitPromoted', unitId: 'me', profession: 'veteranSoldier', became: 'continentalArmy' });
    const horse = fight((seed) => facing({ type: 'dragoon', profession: 'veteranSoldier' }, {}, { seed, atWar: true, fathers: ['georgeWashington'] }), true);
    expect(horse.state.units['me']?.type).toBe('continentalCavalry');
    const peace = fight((seed) => facing({ profession: 'veteranSoldier' }, {}, { seed, fathers: ['georgeWashington'] }), true);
    expect(peace.state.units['me']?.type).toBe('soldier');
  });

  it('Continental and royal troops are worn down a step at a time', () => {
    const cav = fight((seed) => facing({ type: 'artillery', profession: null }, { type: 'continentalCavalry', profession: 'veteranSoldier' }, { seed }), true);
    expect(cav.state.units['foe']?.type).toBe('continentalArmy');
    const army = fight((seed) => facing({ type: 'artillery', profession: null }, { type: 'continentalArmy', profession: 'veteranSoldier' }, { seed }), true);
    expect(army.state.units['foe']?.type).toBe('colonist');
    const horse = fight((seed) => facing({ type: 'artillery', profession: null }, { type: 'cavalry', profession: null }, { seed }), true);
    expect(horse.state.units['foe']?.type).toBe('regular');
    const foot = fight((seed) => facing({ type: 'artillery', profession: null }, { type: 'regular', profession: null }, { seed }), true);
    expect(foot.state.units['foe']).toBeUndefined();
  });

  it('the best defender of a stack takes the blow', () => {
    const s = withUnit(facing({}, { type: 'colonist' }), { id: 'guard', owner: 'b', type: 'soldier', profession: 'veteranSoldier', x: 4, y: 2 });
    expect(event(applyAction(s, ATTACK), 'battle')?.defenderId).toBe('guard');
  });

  it('needs an armed land unit, a foe beside it in the open, and moves left', () => {
    expect(code(facing({}, {}), ATTACK)).toBe('ok');
    expect(code(facing({ type: 'colonist' }, {}), ATTACK)).toBe('cannotAttack');
    expect(code(facing({ movesLeft: 0 }, {}), ATTACK)).toBe('noMovesLeft');
    expect(code(facing({}, {}), { ...ATTACK, dx: -1 })).toBe('noTarget');
    expect(code(facing({}, { owner: 'a' }), ATTACK)).toBe('noTarget');
    const town = withColony(facing({}, {}), { id: 'col', owner: 'b', x: 4, y: 2, name: 'Theirs' });
    expect(code(town, ATTACK)).toBe('ok'); // a colony is stormed rather than fought in the open (see assault.test.ts)
    expect(listValidActions(facing({}, {})).some((a) => a.type === 'attack')).toBe(true);
    expect(previewAttack(facing({}, {}), facing({}, {}).units['me']!, -1, 0)).toBeNull();
  });
});
