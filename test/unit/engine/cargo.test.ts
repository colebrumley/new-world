import { describe, expect, it } from 'vitest';
import { applyAction, listValidActions, validateAction, type Action } from '../../../src/engine/actions';
import { addGoods, equipmentOf, holdsForGoods, holdsFree, pioneerKit, roomFor, spendTools, totalGoods } from '../../../src/engine/cargo';
import { COLONIST_ROLES, ROLE_GOODS } from '../../../src/engine/data/equipment';
import { GOOD_IDS, GOOD_NAMES, HOLD_CAPACITY, NOT_AUTO_LOADED, START_BID } from '../../../src/engine/data/goods';
import { checkInvariants } from '../../../src/engine/invariants';
import type { Colony, GameState, Goods, Unit } from '../../../src/engine/state';
import { deepFreeze } from '../../helpers/freeze';
import { withBids, withColony, withUnit, world } from '../../helpers/world';

const ROWS = ['~~~~~~~', '~~...~~', '~~...~~', '~~...~~', '~~~~~~~'];
const u = (s: GameState, id: string): Unit => s.units[id] as Unit;
const col = (s: GameState): Colony => s.colonies['col'] as Colony;
const code = (s: GameState, a: Action): string => {
  const v = validateAction(s, a);
  return v.ok ? 'ok' : v.error.code;
};
const act = (s: GameState, a: Action): GameState => {
  const before = totalGoods(s);
  const next = applyAction(deepFreeze(s), a).state;
  expect(totalGoods(next)).toEqual(before); // goods are never created or destroyed here
  expect(checkInvariants(next)).toEqual([]);
  return next;
};

/** A coastal colony at (2,2) with the given warehouse and buildings, and a caravel in port. */
function port(goods: Goods = {}, buildings: string[] = []): GameState {
  const s = withColony(world({ rows: ROWS }), { id: 'col', x: 2, y: 2, goods, buildings });
  return withUnit(s, { id: 'ship', type: 'caravel', x: 2, y: 2 });
}

describe('goods table', () => {
  it('lists the 16 cargo types in the original order with names and opening bids', () => {
    expect({ GOOD_IDS, GOOD_NAMES, START_BID, HOLD_CAPACITY, NOT_AUTO_LOADED, ROLE_GOODS }).toMatchSnapshot();
    expect(GOOD_IDS).toHaveLength(16);
    for (const g of GOOD_IDS) expect(START_BID[g][0]).toBeLessThanOrEqual(START_BID[g][1]);
  });
});

describe('holds', () => {
  it('each started hundred of a good fills one hold', () => {
    expect(holdsForGoods({})).toBe(0);
    expect(holdsForGoods({ furs: 1 })).toBe(1);
    expect(holdsForGoods({ furs: 100 })).toBe(1);
    expect(holdsForGoods({ furs: 101 })).toBe(2);
    expect(holdsForGoods({ furs: 50, rum: 50 })).toBe(2);
  });

  it('goods and passengers share the holds', () => {
    let s = port();
    expect(holdsFree(s, u(s, 'ship'))).toBe(2);
    s = withUnit(s, { id: 'c', x: 2, y: 2, aboard: 'ship' });
    expect(holdsFree(s, u(s, 'ship'))).toBe(1);
    expect(roomFor(s, u(s, 'ship'), 'furs')).toBe(100);
    s = withUnit(s, { id: 'ship', type: 'caravel', x: 2, y: 2, cargo: { furs: 30 } });
    expect(holdsFree(s, u(s, 'ship'))).toBe(0);
    expect(roomFor(s, u(s, 'ship'), 'furs')).toBe(70);
    expect(roomFor(s, u(s, 'ship'), 'rum')).toBe(0);
  });

  it('addGoods drops empty entries and refuses to go negative', () => {
    expect(addGoods({ furs: 20 }, 'furs', -20)).toEqual({});
    expect(addGoods({}, 'rum', 5)).toEqual({ rum: 5 });
    expect(() => addGoods({ furs: 1 }, 'furs', -2)).toThrow(RangeError);
  });
});

describe('loading and unloading', () => {
  it('moves goods between the warehouse and a carrier, whole or in part', () => {
    let s = port({ furs: 250, tools: 40 });
    s = act(s, { type: 'loadCargo', unitId: 'ship', good: 'furs', amount: 100 });
    s = act(s, { type: 'loadCargo', unitId: 'ship', good: 'furs', amount: 30 });
    expect(u(s, 'ship').cargo).toEqual({ furs: 130 });
    expect(col(s).goods).toEqual({ furs: 120, tools: 40 });
    expect(code(s, { type: 'loadCargo', unitId: 'ship', good: 'tools', amount: 40 })).toBe('noRoom');
    expect(code(s, { type: 'loadCargo', unitId: 'ship', good: 'furs', amount: 71 })).toBe('noRoom');
    s = act(s, { type: 'loadCargo', unitId: 'ship', good: 'furs', amount: 70 });
    s = act(s, { type: 'unloadCargo', unitId: 'ship', good: 'furs', amount: 55 });
    expect(u(s, 'ship').cargo).toEqual({ furs: 145 });
    s = act(s, { type: 'unloadCargo', unitId: 'ship', good: 'furs', amount: 145 });
    expect(u(s, 'ship').cargo).toEqual({});
    expect(col(s).goods).toEqual({ furs: 250, tools: 40 });
  });

  it('rejects bad amounts, shortages, non-carriers and carriers outside a colony', () => {
    const s = withUnit(port({ furs: 50 }), { id: 'c', x: 2, y: 2 });
    expect(code(s, { type: 'loadCargo', unitId: 'ship', good: 'furs', amount: 51 })).toBe('notEnough');
    expect(code(s, { type: 'loadCargo', unitId: 'ship', good: 'furs', amount: 0 })).toBe('badAmount');
    expect(code(s, { type: 'loadCargo', unitId: 'ship', good: 'furs', amount: 1.5 })).toBe('badAmount');
    expect(code(s, { type: 'loadCargo', unitId: 'ship', good: 'hammers' as 'furs', amount: 1 })).toBe('badAmount');
    expect(code(s, { type: 'unloadCargo', unitId: 'ship', good: 'furs', amount: 1 })).toBe('notEnough');
    expect(code(s, { type: 'loadCargo', unitId: 'c', good: 'furs', amount: 10 })).toBe('notCarrier');
    const atSea = withUnit(s, { id: 'ship', type: 'caravel', x: 1, y: 2, cargo: { furs: 10 } });
    expect(code(atSea, { type: 'unloadCargo', unitId: 'ship', good: 'furs', amount: 10 })).toBe('notInColony');
    const foreign = withColony(s, { id: 'col', x: 2, y: 2, owner: 'b', goods: { furs: 50 } });
    expect(code(foreign, { type: 'loadCargo', unitId: 'ship', good: 'furs', amount: 10 })).toBe('notInColony');
  });

  it('a wagon train carries goods too', () => {
    let s = withUnit(port({ ore: 300 }), { id: 'wagon', type: 'wagonTrain', x: 2, y: 2 });
    s = act(s, { type: 'loadCargo', unitId: 'wagon', good: 'ore', amount: 200 });
    expect(u(s, 'wagon').cargo).toEqual({ ore: 200 });
    expect(code(s, { type: 'loadCargo', unitId: 'wagon', good: 'ore', amount: 1 })).toBe('noRoom');
  });

  it('transfers between two carriers in the same colony', () => {
    let s = withUnit(port(), { id: 'wagon', type: 'wagonTrain', x: 2, y: 2, cargo: { cloth: 150 } });
    s = act(s, { type: 'transferCargo', unitId: 'wagon', toId: 'ship', good: 'cloth', amount: 120 });
    expect([u(s, 'wagon').cargo, u(s, 'ship').cargo]).toEqual([{ cloth: 30 }, { cloth: 120 }]);
    expect(code(s, { type: 'transferCargo', unitId: 'wagon', toId: 'ship', good: 'cloth', amount: 31 })).toBe('notEnough');
    expect(code(s, { type: 'transferCargo', unitId: 'ship', toId: 'ship', good: 'cloth', amount: 1 })).toBe('notSameColony');
    const away = withUnit(s, { id: 'wagon', type: 'wagonTrain', x: 3, y: 2, cargo: { cloth: 30 } });
    expect(code(away, { type: 'transferCargo', unitId: 'wagon', toId: 'ship', good: 'cloth', amount: 1 })).toBe('notInColony');
    const full = withUnit(s, { id: 'ship', type: 'caravel', x: 2, y: 2, cargo: { cloth: 120, rum: 1 } });
    expect(code(full, { type: 'transferCargo', unitId: 'wagon', toId: 'ship', good: 'cloth', amount: 30 })).toBe('ok');
    expect(code(full, { type: 'transferCargo', unitId: 'wagon', toId: 'ship', good: 'cloth', amount: 30 + 51 })).toBe('notEnough');
  });

  it('"load most valuable" takes one hold of the dearest good and never horses, tools or muskets', () => {
    let s = withBids(port({ horses: 100, tools: 100, muskets: 100, food: 100, cloth: 40, furs: 100, silver: 10 }), { food: 2, cloth: 12, furs: 5, silver: 20 });
    s = act(s, { type: 'loadMostValuable', unitId: 'ship' }); // furs 100 x 5 beats cloth 40 x 12 and silver 10 x 20
    expect(u(s, 'ship').cargo).toEqual({ furs: 100 });
    s = act(s, { type: 'loadMostValuable', unitId: 'ship' });
    expect(u(s, 'ship').cargo).toEqual({ furs: 100, cloth: 40 });
    expect(code(s, { type: 'loadMostValuable', unitId: 'ship' })).toBe('nothingToLoad'); // holds full
    const onlyKit = port({ horses: 100, tools: 100, muskets: 100 });
    expect(code(onlyKit, { type: 'loadMostValuable', unitId: 'ship' })).toBe('nothingToLoad');
    expect(code(withUnit(onlyKit, { id: 'c', x: 2, y: 2 }), { type: 'loadMostValuable', unitId: 'c' })).toBe('notCarrier');
  });
});

describe('treasure and wagons as cargo', () => {
  const shore = (ship: 'caravel' | 'galleon' | 'manOWar' | 'merchantman'): GameState =>
    withUnit(withUnit(world({ rows: ROWS }), { id: 'ship', type: ship, x: 1, y: 2 }), { id: 't', type: 'treasure', x: 2, y: 2 });

  it('a treasure train needs six free holds: Galleon or Man-O-War', () => {
    expect(code(shore('caravel'), { type: 'moveUnit', unitId: 't', dx: -1, dy: 0 })).toBe('shipFull');
    expect(code(shore('merchantman'), { type: 'moveUnit', unitId: 't', dx: -1, dy: 0 })).toBe('shipFull');
    expect(code(shore('galleon'), { type: 'moveUnit', unitId: 't', dx: -1, dy: 0 })).toBe('ok');
    expect(code(shore('manOWar'), { type: 'moveUnit', unitId: 't', dx: -1, dy: 0 })).toBe('ok');
    const partly = withUnit(shore('galleon'), { id: 'ship', type: 'galleon', x: 1, y: 2, cargo: { rum: 1 } });
    expect(code(partly, { type: 'moveUnit', unitId: 't', dx: -1, dy: 0 })).toBe('shipFull');
  });

  it('wagon trains and ships are never carried, and wagons never carry units', () => {
    const s = withUnit(withUnit(world({ rows: ROWS }), { id: 'ship', type: 'galleon', x: 1, y: 2 }), { id: 'w', type: 'wagonTrain', x: 2, y: 2 });
    expect(code(s, { type: 'moveUnit', unitId: 'w', dx: -1, dy: 0 })).toBe('shipFull');
    const land = withUnit(withUnit(world({ rows: ROWS }), { id: 'w', type: 'wagonTrain', x: 3, y: 2 }), { id: 'c', x: 2, y: 2, orders: 'sentry' });
    const moved = applyAction(land, { type: 'moveUnit', unitId: 'c', dx: 1, dy: 0 }).state;
    expect(u(moved, 'c')).toMatchObject({ x: 3, y: 2, aboard: null });
  });
});

describe('equipping', () => {
  const stocked = (goods: Goods, buildings: string[] = []): GameState => withUnit(port(goods, buildings), { id: 'c', x: 2, y: 2 });

  it('50 muskets make a soldier; 50 horses more make a dragoon; 50 horses alone make a scout', () => {
    let s = stocked({ muskets: 60, horses: 120 });
    s = act(s, { type: 'equip', unitId: 'c', role: 'soldier' });
    expect(u(s, 'c').type).toBe('soldier');
    expect(col(s).goods).toEqual({ muskets: 10, horses: 120 });
    s = act(s, { type: 'equip', unitId: 'c', role: 'dragoon' });
    expect(col(s).goods).toEqual({ muskets: 10, horses: 70 });
    s = act(s, { type: 'equip', unitId: 'c', role: 'scout' }); // muskets go back, horses stay with the rider
    expect(u(s, 'c').type).toBe('scout');
    expect(col(s).goods).toEqual({ muskets: 60, horses: 70 });
    s = act(s, { type: 'equip', unitId: 'c', role: 'colonist' });
    expect(u(s, 'c').type).toBe('colonist');
    expect(col(s).goods).toEqual({ muskets: 60, horses: 120 });
    expect(u(s, 'c').profession).toBe('freeColonist');
  });

  it('reports what is missing', () => {
    expect(code(stocked({ muskets: 49 }), { type: 'equip', unitId: 'c', role: 'soldier' })).toBe('notEnough');
    expect(code(stocked({ muskets: 50, horses: 49 }), { type: 'equip', unitId: 'c', role: 'dragoon' })).toBe('notEnough');
    expect(code(stocked({ muskets: 50 }), { type: 'equip', unitId: 'c', role: 'scout' })).toBe('notEnough');
    expect(code(stocked({ tools: 19 }), { type: 'equip', unitId: 'c', role: 'pioneer' })).toBe('notEnough');
    expect(code(stocked({}), { type: 'equip', unitId: 'c', role: 'colonist' })).toBe('cannotEquip');
    expect(code(stocked({ muskets: 50 }), { type: 'equip', unitId: 'ship', role: 'soldier' })).toBe('cannotEquip');
    const outside = withUnit(stocked({ muskets: 50 }), { id: 'c', x: 3, y: 2 });
    expect(code(outside, { type: 'equip', unitId: 'c', role: 'soldier' })).toBe('notInColony');
  });

  it('a pioneer takes tools in lots of 20, up to 100, and hands back what is left', () => {
    expect([19, 20, 39, 45, 100, 250].map(pioneerKit)).toEqual([0, 20, 20, 40, 100, 100]);
    let s = stocked({ tools: 70 });
    s = act(s, { type: 'equip', unitId: 'c', role: 'pioneer' });
    expect(u(s, 'c')).toMatchObject({ type: 'pioneer', tools: 60 });
    expect(col(s).goods).toEqual({ tools: 10 });
    expect(equipmentOf(u(s, 'c'))).toEqual({ tools: 60 });
    s = act(s, { type: 'equip', unitId: 'c', role: 'colonist' });
    expect(u(s, 'c')).toMatchObject({ type: 'colonist', tools: 0 });
    expect(col(s).goods).toEqual({ tools: 70 });
    const rich = act(stocked({ tools: 500 }), { type: 'equip', unitId: 'c', role: 'pioneer' });
    expect(u(rich, 'c').tools).toBe(100);
  });

  it('a missionary needs a church or cathedral', () => {
    expect(code(stocked({}), { type: 'equip', unitId: 'c', role: 'missionary' })).toBe('needsChurch');
    for (const building of ['church', 'cathedral']) {
      const s = act(stocked({}, [building]), { type: 'equip', unitId: 'c', role: 'missionary' });
      expect(u(s, 'c').type).toBe('missionary');
      expect(u(act(s, { type: 'equip', unitId: 'c', role: 'colonist' }), 'c').type).toBe('colonist');
    }
  });

  it('every role can be reached from every other and back without gaining or losing goods', () => {
    let s = stocked({ muskets: 50, horses: 50, tools: 100 }, ['church']);
    const start = totalGoods(s);
    for (const from of COLONIST_ROLES) {
      for (const to of COLONIST_ROLES) {
        if (from === to) continue;
        if (u(s, 'c').type !== from) s = act(s, { type: 'equip', unitId: 'c', role: from });
        s = act(s, { type: 'equip', unitId: 'c', role: to });
        expect(u(s, 'c').type).toBe(to);
      }
    }
    expect(totalGoods(s)).toEqual(start);
  });

  it('keeps the skill and caps movement to the new role', () => {
    let s = withUnit(port({ horses: 50 }), { id: 'v', x: 2, y: 2, type: 'scout', profession: 'seasonedScout' });
    expect(u(s, 'v').movesLeft).toBe(12);
    s = act(s, { type: 'equip', unitId: 'v', role: 'colonist' });
    expect(u(s, 'v')).toMatchObject({ type: 'colonist', profession: 'seasonedScout', movesLeft: 3 });
    expect(col(s).goods).toEqual({ horses: 100 });
  });
});

describe('pioneer tools', () => {
  it('each job uses 20; a pioneer left with fewer than 20 reverts to a colonist', () => {
    const p = u(withUnit(world({ rows: ROWS }), { id: 'p', type: 'pioneer', x: 2, y: 2, tools: 60 }), 'p');
    const a = spendTools(p);
    expect([a.unit.type, a.unit.tools, a.reverted]).toEqual(['pioneer', 40, false]);
    const b = spendTools(spendTools(a.unit).unit);
    expect([b.unit.type, b.unit.tools, b.reverted]).toEqual(['colonist', 0, true]);
    const odd = spendTools({ ...p, tools: 35 });
    expect([odd.unit.type, odd.unit.tools, odd.reverted]).toEqual(['colonist', 0, true]);
    // 100 tools are five jobs
    let unit = { ...p, tools: 100 };
    let jobs = 0;
    while (unit.type === 'pioneer') {
      unit = spendTools(unit).unit;
      jobs++;
    }
    expect(jobs).toBe(5);
  });
});

describe('totals and offered actions', () => {
  it('totalGoods counts warehouses, holds and kit in use', () => {
    let s = port({ muskets: 100, horses: 10 });
    s = withUnit(s, { id: 'ship', type: 'caravel', x: 2, y: 2, cargo: { muskets: 20 } });
    s = withUnit(s, { id: 'd', type: 'dragoon', x: 2, y: 2 });
    s = withUnit(s, { id: 'p', type: 'pioneer', x: 2, y: 2, tools: 80 });
    const total = totalGoods(s);
    expect([total.muskets, total.horses, total.tools, total.food]).toEqual([170, 60, 80, 0]);
  });

  it('listValidActions offers only valid cargo and equipment actions in a colony', () => {
    const s = withUnit(port({ muskets: 50, furs: 130 }), { id: 'c', x: 2, y: 2 });
    const offered = listValidActions(s);
    for (const a of offered) expect(validateAction(s, a).ok).toBe(true);
    const kinds = offered.map((a) => a.type);
    expect(kinds).toContain('equip');
    expect(kinds).toContain('loadCargo');
    expect(kinds).toContain('loadMostValuable');
    expect(offered.filter((a) => a.type === 'equip')).toEqual([{ type: 'equip', unitId: 'c', role: 'soldier' }]);
  });
});
