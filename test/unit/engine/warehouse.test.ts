import { describe, expect, it } from 'vitest';
import { applyAction } from '../../../src/engine/actions';
import { colonyTurn, type EconomyEvent } from '../../../src/engine/economy';
import { checkInvariants } from '../../../src/engine/invariants';
import { warehouseCapacity } from '../../../src/engine/pioneer';
import type { Colonist, Colony, GameState, Goods } from '../../../src/engine/state';
import { withColony, withUnit, world } from '../../helpers/world';

const ROWS = ['~~~~~~', '~~~~~~', '~~a.~~', '~~~~~~'];
const weaver = (id: string, profession: Colonist['profession'] = 'masterWeaver'): Colonist => ({ id, profession, job: { kind: 'work', trade: 'weaver' }, turns: 0 });
const town = (goods: Goods, buildings: string[] = [], colonists: Colonist[] = [{ id: 'i', profession: 'freeColonist', job: { kind: 'idle' }, turns: 0 }]): GameState =>
  withColony(world({ rows: ROWS }), { id: 'col', x: 2, y: 2, colonists, goods: { food: 100, ...goods }, buildings });
const col = (s: GameState): Colony => s.colonies['col'] as Colony;
const turn = (s: GameState): { state: GameState; events: EconomyEvent[] } => {
  const events: EconomyEvent[] = [];
  const state = colonyTurn(s, 'col', events);
  expect(checkInvariants(state)).toEqual([]);
  return { state, events };
};
const spoiled = (events: EconomyEvent[]) => events.find((e) => e.type === 'goodsSpoiled');
const ready = (events: EconomyEvent[]) => events.filter((e) => e.type === 'cargoReady');

describe('capacity', () => {
  it('is 100 per good, 200 with a Warehouse, 300 with the Expansion', () => {
    expect(warehouseCapacity(col(town({})))).toBe(100);
    expect(warehouseCapacity(col(town({}, ['warehouse'])))).toBe(200);
    expect(warehouseCapacity(col(town({}, ['warehouse', 'warehouseExpansion'])))).toBe(300);
  });
});

describe('spoilage at the end of the turn', () => {
  it('cuts every good but food back to capacity, horses and lumber included', () => {
    const { state, events } = turn(town({ furs: 150, horses: 130, lumber: 240, tools: 100, food: 400 }));
    expect(col(state).goods).toMatchObject({ furs: 100, horses: 100, lumber: 100, tools: 100 });
    expect(col(state).goods.food).toBe(198); // 400 - 2 eaten - 200 for the newborn: food is never trimmed
    expect(spoiled(events)).toMatchObject({ lost: { furs: 50, horses: 30, lumber: 140 }, reported: { furs: 50, horses: 30, lumber: 140 }, canExpand: true });
  });

  it('respects the larger limits and says when no bigger warehouse can be built', () => {
    const one = turn(town({ furs: 250 }, ['warehouse']));
    expect(col(one.state).goods.furs).toBe(200);
    expect(spoiled(one.events)).toMatchObject({ canExpand: true });
    const two = turn(town({ furs: 350 }, ['warehouse', 'warehouseExpansion']));
    expect(col(two.state).goods.furs).toBe(300);
    expect(spoiled(two.events)).toMatchObject({ lost: { furs: 50 }, canExpand: false });
    expect(spoiled(turn(town({ furs: 100, rum: 99 })).events)).toBeUndefined();
  });

  it("removes this turn's own overproduction quietly and reports only older excess", () => {
    // a Master Weaver makes 6 cloth; the store was at 98
    const quiet = turn(town({ cloth: 98, cotton: 50 }, ['weaversHouse'], [weaver('w')]));
    expect(col(quiet.state).goods.cloth).toBe(100);
    expect(spoiled(quiet.events)).toMatchObject({ lost: { cloth: 4 }, reported: {} });
    // store already 20 over (unloaded cargo) and 6 more made: 6 go quietly, 20 are reported
    const loud = turn(town({ cloth: 120, cotton: 50 }, ['weaversHouse'], [weaver('w')]));
    expect(col(loud.state).goods.cloth).toBe(100);
    expect(spoiled(loud.events)).toMatchObject({ lost: { cloth: 26 }, reported: { cloth: 20 } });
  });

  it('lets a single unit of old excess be', () => {
    const { state, events } = turn(town({ furs: 101 }));
    expect(col(state).goods.furs).toBe(101);
    expect(spoiled(events)).toBeUndefined();
    expect(col(turn(town({ furs: 102 })).state).goods.furs).toBe(100);
  });

  it('happens after construction, so tools for a building are used before the trim', () => {
    const s = withColony(world({ rows: ROWS }), {
      id: 'col', x: 2, y: 2, goods: { food: 100, tools: 115 }, buildings: [], hammers: 60,
      construction: { kind: 'building', id: 'printingPress' },
    });
    const { state, events } = turn(s);
    expect(col(state).buildings).toContain('printingPress');
    expect(col(state).goods.tools).toBe(95);
    expect(spoiled(events)).toBeUndefined();
  });
});

describe('cargo ready', () => {
  it('is announced when a good passes a full hundred during the turn', () => {
    const made = turn(town({ cloth: 96, cotton: 50 }, ['weaversHouse'], [weaver('w')]));
    expect(ready(made.events)).toEqual([{ type: 'cargoReady', colonyId: 'col', good: 'cloth', amount: 100, full: true, canExpand: true }]);
    const bigger = turn(town({ cloth: 96, cotton: 50 }, ['weaversHouse', 'warehouse'], [weaver('w')]));
    expect(ready(bigger.events)).toEqual([{ type: 'cargoReady', colonyId: 'col', good: 'cloth', amount: 102, full: false, canExpand: true }]);
    const second = turn(town({ cloth: 196, cotton: 50 }, ['weaversHouse', 'warehouse'], [weaver('w')]));
    expect(ready(second.events)).toMatchObject([{ good: 'cloth', amount: 200, full: true }]);
  });

  it('is not repeated while the store sits at the limit, and never for food', () => {
    expect(ready(turn(town({ cloth: 100, cotton: 50 }, ['weaversHouse'], [weaver('w')])).events)).toEqual([]);
    expect(ready(turn(town({ cloth: 50, cotton: 50 }, ['weaversHouse'], [weaver('w')])).events)).toEqual([]);
    const farm = withColony(world({ rows: ROWS }), {
      id: 'col', x: 2, y: 2, goods: { food: 98 }, buildings: [],
      colonists: [{ id: 'f', profession: 'freeColonist', job: { kind: 'field', dx: 1, dy: 0, good: 'food' }, turns: 0 }],
    });
    expect(ready(turn(farm).events)).toEqual([]);
  });
});

describe('unloading into a full warehouse', () => {
  it('is allowed, with a warning that the excess will not keep', () => {
    let s = town({ furs: 80 });
    s = withUnit(s, { id: 'ship', type: 'caravel', x: 2, y: 2, cargo: { furs: 60, food: 100 } });
    const r = applyAction(s, { type: 'unloadCargo', unitId: 'ship', good: 'furs', amount: 60 });
    expect(col(r.state).goods.furs).toBe(140);
    expect(r.events).toContainEqual({ type: 'warehouseFull', colonyId: 'col', good: 'furs', amount: 140, capacity: 100 });
    const food = applyAction(s, { type: 'unloadCargo', unitId: 'ship', good: 'food', amount: 100 });
    expect(food.events.map((e) => e.type)).toEqual(['cargoMoved']);
    const fits = applyAction(s, { type: 'unloadCargo', unitId: 'ship', good: 'furs', amount: 20 });
    expect(fits.events.map((e) => e.type)).toEqual(['cargoMoved']);
  });
});
