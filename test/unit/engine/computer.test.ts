import { describe, expect, it } from 'vitest';
import { computerColonies, landWork } from '../../../src/engine/computer';
import { AI_UPKEEP } from '../../../src/engine/data/ai';
import { checkInvariants } from '../../../src/engine/invariants';
import type { Colonist, Colony, GameState, Job } from '../../../src/engine/state';
import { tileAt } from '../../../src/engine/state';
import { withColony, withUnit, world } from '../../helpers/world';

// plains all round the colony at (3, 3), with one forest to its north-east
const ROWS = ['~~~~~~~', '~.....~', '~...f.~', '~.....~', '~.....~', '~.....~', '~~~~~~~'];
const man = (id: string, profession: Colonist['profession'] = 'freeColonist', job: Job = { kind: 'idle' }): Colonist => ({ id, profession, job, turns: 0 });
const field = (dx: number, dy: number, good: 'food' | 'lumber' | 'ore' = 'food'): Job => ({ kind: 'field', dx, dy, good });
interface Spec { colonists?: Colonist[]; goods?: Colony['goods']; buildings?: string[]; waited?: number; gold?: number; turn?: number; kind?: 'ai' | 'human'; taxRate?: number }
function town(o: Spec = {}): GameState {
  const s = world({ rows: ROWS, players: [{ id: 'a', kind: o.kind ?? 'ai', taxRate: o.taxRate ?? 0 }, { id: 'b' }] });
  const priced: GameState = { ...s, turn: o.turn ?? 11, players: s.players.map((p) => (p.id === 'a' ? { ...p, gold: o.gold ?? 1000 } : p)) };
  return withColony(priced, { id: 'col', x: 3, y: 3, colonists: o.colonists ?? [man('m')], goods: o.goods ?? {}, buildings: o.buildings ?? ['townHall'], ...(o.waited === undefined ? {} : { waited: o.waited }) });
}
const col = (s: GameState): Colony => s.colonies['col'] as Colony;
const gold = (s: GameState): number => s.players[0]?.gold ?? 0;
type Happened = NonNullable<Parameters<typeof computerColonies>[2]>;
const run = (s: GameState): { state: GameState; events: Happened } => {
  const events: Happened = [];
  const state = computerColonies(s, 'a', events);
  expect(checkInvariants(state)).toEqual([]);
  return { state, events };
};

describe('upkeep rule table', () => {
  it('matches the snapshot', () => {
    expect(AI_UPKEEP).toMatchSnapshot();
  });
});

describe('the upkeep of a computer power\'s colony', () => {
  it('is not for a human player', () => {
    const s = town({ kind: 'human' });
    expect(computerColonies(s, 'a')).toBe(s);
  });

  it('twenty tools bought at their price level each while it has under twenty and ground to improve', () => {
    const before = town({ gold: 1000 });
    const { state, events } = run(before);
    const each = (gold(before) - gold(state)) / 20;
    expect(col(state).goods.tools).toBe(20);
    expect(each).toBeGreaterThan(0);
    expect(events).toEqual([{ type: 'colonySupplied', colonyId: 'col', player: 'a', good: 'tools', amount: 20, cost: 20 * each }]);
    // not with twenty in store, and not without the gold
    expect(run(town({ goods: { tools: 20 }, waited: 0 })).events).toEqual([]);
    expect(run(town({ gold: 0 })).events).toEqual([]);
  });

  it('a square a colonist works is improved first: the plow for his crop, for twenty tools, once the colony has waited long enough', () => {
    const farming = town({ colonists: [man('m', 'freeColonist', field(1, 0))], goods: { tools: 20 }, waited: 0 });
    expect(landWork(farming, col(farming))).toMatchObject({ dx: 1, dy: 0, job: 'plow' });
    const wait = landWork(farming, col(farming))!.wait;
    // not yet
    expect(tileAt(run(farming).state.map, 4, 3)?.plowed).toBe(false);
    const ready = town({ colonists: [man('m', 'freeColonist', field(1, 0))], goods: { tools: 20 }, waited: wait - 1 });
    const improved = run(ready);
    const done = improved.state;
    expect(improved.events).toEqual([{ type: 'tileImproved', x: 4, y: 3, improvement: 'plowed', unitId: 'col' }]);
    expect(tileAt(done.map, 4, 3)?.plowed).toBe(true);
    expect(col(done).goods.tools ?? 0).toBe(0);
    expect(col(done).waited).toBe(0);
    // never on a turn divisible by seven
    expect(tileAt(run({ ...ready, turn: 14 }).state.map, 4, 3)?.plowed).toBe(false);
  });

  it('a road where he fells or mines; forest is cleared only when farmland is short', () => {
    const felling = town({ colonists: [man('m', 'freeColonist', field(1, -1, 'lumber'))], goods: { tools: 20 } });
    expect(landWork(felling, col(felling))).toMatchObject({ dx: 1, dy: -1, job: 'road' });
  });

  it('a servant or criminal at the carpenter\'s bench becomes a free colonist', () => {
    const s = town({ colonists: [man('s', 'indenturedServant', { kind: 'work', trade: 'carpenter' }), man('c', 'pettyCriminal'), man('x', 'expertFarmer', { kind: 'work', trade: 'carpenter' })], buildings: ['townHall', 'carpentersShop'], goods: { tools: 20 }, waited: 0 });
    expect(col(run(s).state).colonists.map((k) => k.profession)).toEqual(['freeColonist', 'pettyCriminal', 'expertFarmer']);
  });

  it('a school turns one colonist into an expert of the trade he works, after four turns\' wait', () => {
    const s = (waited: number): GameState => town({ colonists: [man('m', 'freeColonist', field(1, 0))], buildings: ['townHall', 'schoolhouse'], goods: { tools: 20 }, gold: 0, waited, turn: 14 });
    expect(col(run(s(2)).state).colonists[0]?.profession).toBe('freeColonist');
    const taught = col(run(s(3)).state);
    expect(taught.colonists[0]?.profession).toBe('expertFarmer');
    expect(taught.waited).toBe(0);
  });

  it('short of food, its last unskilled colonist is trained to farm for the fee, while taxes are no more than 25', () => {
    const hungry = (extra: Spec = {}): GameState => town({ colonists: [man('m1'), man('m2'), man('m3')], goods: { tools: 20 }, gold: 5000, waited: 0, ...extra });
    const { state } = run(hungry());
    expect(col(state).colonists.map((k) => k.profession)).toEqual(['freeColonist', 'freeColonist', 'expertFarmer']);
    expect(gold(state)).toBeLessThan(5000);
    expect(col(run(hungry({ taxRate: 26 })).state).colonists.some((k) => k.profession === 'expertFarmer')).toBe(false);
    expect(col(run(hungry({ gold: 10 })).state).colonists.some((k) => k.profession === 'expertFarmer')).toBe(false);
    // one is enough
    const again = run(state).state;
    expect(col(again).colonists.filter((k) => k.profession === 'expertFarmer')).toHaveLength(1);
  });

  it('from turn 40 a colony with a ship or wagon in it has its horses made up to two for ten gold', () => {
    const s = (turn: number, wagon = true): GameState => {
      const t = town({ goods: { tools: 20 }, waited: 0, turn, gold: 100 });
      return wagon ? withUnit(t, { id: 'w', type: 'wagonTrain', profession: null, x: 3, y: 3 }) : t;
    };
    expect(col(run(s(39)).state).goods.horses ?? 0).toBe(0);
    expect(col(run(s(41, false)).state).goods.horses ?? 0).toBe(0);
    const { state, events } = run(s(41));
    expect(col(state).goods.horses).toBe(2);
    expect(gold(state)).toBe(90);
    expect(events).toEqual([{ type: 'colonySupplied', colonyId: 'col', player: 'a', good: 'horses', amount: 2, cost: 10 }]);
  });
});
