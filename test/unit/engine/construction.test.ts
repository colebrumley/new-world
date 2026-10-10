import { describe, expect, it } from 'vitest';
import { applyAction, validateAction, type Action } from '../../../src/engine/actions';
import { availableItems, buyQuote, firstProject, isPortColony, itemCost } from '../../../src/engine/construction';
import { BUILDABLE_UNITS, CONSTRUCTION } from '../../../src/engine/data/construction';
import { STARTING_BUILDINGS } from '../../../src/engine/data/colony';
import { checkInvariants } from '../../../src/engine/invariants';
import type { BuildItem, Colonist, Colony, GameState } from '../../../src/engine/state';
import { withColony, withUnit, world } from '../../helpers/world';

// x: 0123456789
const ROWS = [
  '~~~~~~~~~~',
  '~~...f...~',
  '~~...f...~',
  '~~...f...~',
  '~~~~~~~~~~',
];
const START = [...STARTING_BUILDINGS] as string[];
const crowd = (n: number, job: Colonist['job'] = { kind: 'idle' }): Colonist[] =>
  Array.from({ length: n }, (_, i) => ({ id: `x${i}`, profession: 'freeColonist' as const, job , turns: 0 }));
const B = (id: string): BuildItem => ({ kind: 'building', id } as BuildItem);
const U = (unit: string): BuildItem => ({ kind: 'unit', unit } as BuildItem);

interface TownSpec { pop?: number; buildings?: string[]; x?: number; hammers?: number; construction?: BuildItem | null; goods?: Colony['goods']; fathers?: string[]; gold?: number; ai?: boolean; colonists?: Colonist[] }
function town(spec: TownSpec = {}): GameState {
  const s = world({ rows: ROWS, players: [{ id: 'a', fathers: spec.fathers ?? [], kind: spec.ai ? 'ai' : 'human' }, { id: 'b' }] });
  const withGold = { ...s, players: s.players.map((p) => (p.id === 'a' ? { ...p, gold: spec.gold ?? 0 } : p)) };
  return withColony(withGold, {
    id: 'col', x: spec.x ?? 2, y: 2, colonists: spec.colonists ?? crowd(spec.pop ?? 1), buildings: spec.buildings ?? START,
    hammers: spec.hammers ?? 0, construction: spec.construction ?? null, goods: spec.goods ?? {},
  });
}
const col = (s: GameState): Colony => s.colonies['col'] as Colony;
const names = (s: GameState): string[] => availableItems(s, col(s)).map((i) => (i.kind === 'building' ? i.id : i.unit));
const code = (s: GameState, a: Action): string => {
  const v = validateAction(s, a);
  return v.ok ? 'ok' : v.error.code;
};
/** End a's turn and b's, so a's colonies get one turn. */
const round = (s: GameState) => {
  const first = applyAction(s, { type: 'endTurn' });
  const second = applyAction(first.state, { type: 'endTurn' });
  expect(checkInvariants(second.state)).toEqual([]);
  return { state: second.state, events: [...first.events, ...second.events] };
};

describe('what a colony may build', () => {
  it('a new one-colonist port colony is offered the first level of each chain it qualifies for, and a wagon train', () => {
    expect(names(town())).toEqual([
      'armory', 'docks', 'warehouse', 'stable', 'printingPress', 'weaversShop', 'tobacconistsShop', 'rumDistillery',
      'furTradingPost', 'blacksmithsShop', 'wagonTrain',
    ]);
    expect({ CONSTRUCTION, BUILDABLE_UNITS }).toMatchSnapshot();
  });

  it('enforces minimum population', () => {
    expect(names(town({ pop: 2 }))).not.toContain('stockade');
    expect(names(town({ pop: 3 }))).toEqual(expect.arrayContaining(['stockade', 'lumberMill', 'church']));
    expect(names(town({ pop: 3 }))).not.toContain('schoolhouse');
    expect(names(town({ pop: 4 }))).toContain('schoolhouse');
    expect(names(town({ pop: 3, buildings: [...START, 'stockade'] }))).toContain('fort'); // NAMES: Fort needs 3
    expect(names(town({ pop: 7, buildings: [...START, 'stockade', 'fort'] }))).not.toContain('fortress');
    expect(names(town({ pop: 8, buildings: [...START, 'stockade', 'fort'] }))).toContain('fortress');
  });

  it('needs the previous level of the chain, and never offers what is already built', () => {
    expect(names(town({ pop: 8 }))).not.toContain('college');
    expect(names(town({ pop: 8, buildings: [...START, 'schoolhouse'] }))).toContain('college');
    expect(names(town({ pop: 10, buildings: [...START, 'schoolhouse'] }))).not.toContain('university');
    expect(names(town({ pop: 8 }))).not.toContain('magazine');
    expect(names(town({ buildings: [...START, 'warehouse'] }))).toContain('warehouseExpansion');
    const both = names(town({ buildings: [...START, 'warehouse', 'warehouseExpansion'] }));
    expect(both).not.toContain('warehouse');
    expect(both).not.toContain('warehouseExpansion'); // only one expansion
    expect(names(town())).not.toContain('townHall');
  });

  it('factories and the Arsenal need Adam Smith; the Custom House needs Stuyvesant', () => {
    const shops = [...START, 'weaversShop', 'tobacconistsShop', 'rumDistillery', 'furTradingPost', 'blacksmithsShop', 'armory', 'magazine'];
    const without = names(town({ pop: 8, buildings: shops }));
    for (const f of ['textileMill', 'cigarFactory', 'rumFactory', 'furFactory', 'ironWorks', 'arsenal', 'customHouse']) expect(without).not.toContain(f);
    const smith = names(town({ pop: 8, buildings: shops, fathers: ['adamSmith'] }));
    for (const f of ['textileMill', 'cigarFactory', 'rumFactory', 'furFactory', 'ironWorks', 'arsenal']) expect(smith).toContain(f);
    expect(names(town({ pop: 6, buildings: shops, fathers: ['adamSmith'] }))).toEqual(expect.arrayContaining(['furFactory']));
    expect(names(town({ pop: 6, buildings: shops, fathers: ['adamSmith'] }))).not.toContain('textileMill');
    expect(names(town({ fathers: ['peterStuyvesant'] }))).toContain('customHouse');
  });

  it('Docks need water alongside; Drydock and Shipyard need the open sea', () => {
    expect(isPortColony(town(), { x: 2, y: 2 })).toBe(true);
    const inland = town({ x: 4, pop: 8, buildings: [...START, 'docks'] });
    expect(names(town({ x: 4 }))).not.toContain('docks');
    expect(names(inland)).not.toContain('drydock');
    expect(names(town({ pop: 4, buildings: [...START, 'docks'] }))).toContain('drydock');
    expect(names(town({ pop: 8, buildings: [...START, 'docks', 'drydock'] }))).toContain('shipyard');
  });

  it('never offers the unused Town Hall levels or the Capitol', () => {
    const all = names(town({ pop: 32, fathers: ['adamSmith', 'peterStuyvesant'] }));
    for (const id of ['townHall2', 'townHall3', 'capitol', 'capitolExpansion']) expect(all).not.toContain(id);
  });

  it('units: artillery needs an Armory, ships a Shipyard, wagon trains fewer wagons than colonies', () => {
    expect(names(town())).not.toContain('artillery');
    expect(names(town({ buildings: [...START, 'armory'] }))).toContain('artillery');
    expect(names(town())).not.toContain('caravel');
    const yard = names(town({ buildings: [...START, 'docks', 'drydock', 'shipyard'] }));
    expect(yard).toEqual(expect.arrayContaining(['caravel', 'merchantman', 'galleon', 'privateer', 'frigate']));
    expect(yard).not.toContain('manOWar');
    expect(names(withUnit(town(), { id: 'w', type: 'wagonTrain', x: 5, y: 2 }))).not.toContain('wagonTrain');
    expect(itemCost(U('wagonTrain'))).toEqual({ hammers: 40, tools: 0 });
    expect(itemCost(U('frigate'))).toEqual({ hammers: 512, tools: 200 });
    expect(itemCost(B('fort'))).toEqual({ hammers: 120, tools: 100 });
  });

  it('always lists the project under way, even if it could not be started now', () => {
    const s = town({ pop: 1, construction: B('schoolhouse') });
    expect(names(s)).toContain('schoolhouse');
    expect(code(s, { type: 'setConstruction', colonyId: 'col', item: B('schoolhouse') })).toBe('ok');
    expect(code(s, { type: 'setConstruction', colonyId: 'col', item: B('college') })).toBe('notAvailable');
    expect(code(s, { type: 'setConstruction', colonyId: 'col', item: null })).toBe('ok');
    expect(code(s, { type: 'setConstruction', colonyId: 'nope', item: null })).toBe('noColonyHere');
  });
});

describe('the first project', () => {
  it('is Docks for a port colony and a Warehouse inland', () => {
    const s = world({ rows: ROWS });
    expect(firstProject(s, { x: 2, y: 2 })).toEqual(B('docks'));
    expect(firstProject(s, { x: 4, y: 2 })).toEqual(B('warehouse'));
    const founded = applyAction(withUnit(s, { id: 'u1', x: 4, y: 2 }), { type: 'foundColony', unitId: 'u1' }).state;
    expect(Object.values(founded.colonies)[0]?.construction).toEqual(B('warehouse'));
  });
});

describe('building', () => {
  const carpenters = (n: number, profession: Colonist['profession'] = 'masterCarpenter'): Colonist[] =>
    Array.from({ length: n }, (_, i) => ({ id: `c${i}`, profession, job: { kind: 'work', trade: 'carpenter' } as const, turns: 0 }));

  it('finishes exactly when the hammers reach the cost, then empties the hammer store', () => {
    // a Master Carpenter makes 6 a turn; an Armory costs 52
    let s = town({ colonists: carpenters(1), construction: B('armory'), hammers: 40, goods: { lumber: 100 } });
    let r = round(s);
    expect([col(r.state).hammers, col(r.state).buildings.includes('armory')]).toEqual([46, false]);
    r = round(r.state);
    expect(col(r.state).buildings).toContain('armory');
    expect(col(r.state).hammers).toBe(0); // 52 reached exactly; nothing carries over in any case
    expect(r.events).toContainEqual({ type: 'buildingCompleted', colonyId: 'col', building: 'armory', tools: 0 });
    s = town({ colonists: carpenters(3), construction: B('armory'), hammers: 50, goods: { lumber: 100 } });
    expect(col(round(s).state).hammers).toBe(0); // 68 - no surplus kept
  });

  it('needs the tools as well, uses them up, and waits with a notice when they are short', () => {
    const s = town({ colonists: carpenters(1), construction: B('printingPress'), hammers: 60, goods: { tools: 15, lumber: 50 } });
    const waiting = round(s);
    expect(col(waiting.state).buildings).not.toContain('printingPress');
    expect(waiting.events).toContainEqual({ type: 'needTools', colonyId: 'col', item: B('printingPress'), missing: 5 });
    expect(col(waiting.state).goods.tools).toBe(15);
    const stocked = { ...waiting.state, colonies: { col: { ...col(waiting.state), goods: { tools: 25 } } } };
    const done = round(stocked);
    expect(col(done.state).buildings).toContain('printingPress');
    expect(col(done.state).goods.tools).toBe(5);
    expect(done.events).toContainEqual({ type: 'buildingCompleted', colonyId: 'col', building: 'printingPress', tools: 20 });
  });

  it('an AI colony is simply given the tools it lacks', () => {
    const s = town({ ai: true, construction: B('printingPress'), hammers: 60, goods: { tools: 5 } });
    const r = applyAction(applyAction(s, { type: 'endTurn' }).state, { type: 'endTurn' });
    expect(col(r.state).buildings).toContain('printingPress');
    expect(col(r.state).goods.tools ?? 0).toBe(0);
  });

  it('keeps hammers when the project is changed, and the project stays selected once built', () => {
    let s = town({ construction: B('armory'), hammers: 45 });
    s = applyAction(s, { type: 'setConstruction', colonyId: 'col', item: B('stable') }).state;
    expect(col(s).hammers).toBe(45);
    s = applyAction(s, { type: 'setConstruction', colonyId: 'col', item: B('armory') }).state;
    const built = round({ ...s, colonies: { col: { ...col(s), hammers: 52 } } });
    expect(col(built.state).construction).toEqual(B('armory'));
    // left alone, hammers pile up again and the colony is told it already has one
    const again = round({ ...built.state, colonies: { col: { ...col(built.state), hammers: 52 } } });
    expect(again.events).toContainEqual({ type: 'alreadyHave', colonyId: 'col', building: 'armory' });
    expect(col(again.state).hammers).toBe(52);
  });

  it('builds units on the colony square: a wagon train, artillery, a ship', () => {
    const wagon = round(town({ construction: U('wagonTrain'), hammers: 40 }));
    const built = wagon.events.find((e) => e.type === 'unitBuilt');
    expect(built).toMatchObject({ unitType: 'wagonTrain', tools: 0 });
    const unit = Object.values(wagon.state.units).find((u) => u.type === 'wagonTrain');
    expect(unit).toMatchObject({ x: 2, y: 2, owner: 'a', profession: null, movesLeft: 6 });
    expect(col(wagon.state).hammers).toBe(0);
    const guns = round(town({ buildings: [...START, 'armory'], construction: U('artillery'), hammers: 192, goods: { tools: 40 } }));
    expect(Object.values(guns.state.units).some((u) => u.type === 'artillery')).toBe(true);
    expect(col(guns.state).goods.tools ?? 0).toBe(0);
    const ship = round(town({ buildings: [...START, 'docks', 'drydock', 'shipyard'], construction: U('caravel'), hammers: 128, goods: { tools: 40 } }));
    expect(Object.values(ship.state.units).some((u) => u.type === 'caravel')).toBe(true);
  });

  it('will not finish a wagon train once the power has as many wagons as colonies; the hammers are kept', () => {
    const s = withUnit(town({ construction: U('wagonTrain'), hammers: 40 }), { id: 'w', type: 'wagonTrain', x: 5, y: 2 });
    const r = round(s);
    expect(r.events).toContainEqual({ type: 'noMoreWagons', colonyId: 'col' });
    expect(Object.values(r.state.units).filter((u) => u.type === 'wagonTrain')).toHaveLength(1);
    expect(col(r.state).hammers).toBe(40);
  });
});

describe('buying a project', () => {
  it('costs 13 gold per missing hammer plus (tools price + 4) per missing tool, doubled with no hammers down', () => {
    // Europe asks 2 for a tool at the start of the game
    expect(buyQuote(town({ construction: B('armory'), hammers: 12 }), col(town({ construction: B('armory'), hammers: 12 })))).toEqual({ hammersLeft: 40, toolsLeft: 0, price: 520 });
    const press = town({ construction: B('printingPress'), hammers: 2, goods: { tools: 5 } });
    expect(buyQuote(press, col(press))).toEqual({ hammersLeft: 50, toolsLeft: 15, price: 50 * 13 + 15 * 6 });
    const cold = town({ construction: B('printingPress') });
    expect(buyQuote(cold, col(cold))?.price).toBe((52 * 13 + 20 * 6) * 2);
    const onlyTools = town({ construction: B('printingPress'), hammers: 52 });
    expect(buyQuote(onlyTools, col(onlyTools))).toEqual({ hammersLeft: 0, toolsLeft: 20, price: 120 });
  });

  it('takes the gold, fills the hammer store and buys in the tools; the building appears at the end of the turn', () => {
    const s = town({ construction: B('printingPress'), hammers: 2, goods: { tools: 5 }, gold: 1000 });
    const r = applyAction(s, { type: 'buyConstruction', colonyId: 'col' });
    expect(r.state.players[0]?.gold).toBe(1000 - 740);
    expect(col(r.state)).toMatchObject({ hammers: 52, goods: { tools: 20 } });
    expect(col(r.state).buildings).not.toContain('printingPress');
    expect(r.events).toEqual([{ type: 'constructionBought', colonyId: 'col', price: 740, tools: 15 }]);
    expect(col(round(r.state).state).buildings).toContain('printingPress');
  });

  it('is refused without the gold, with nothing selected, with nothing left to pay, or for a building already there', () => {
    expect(code(town({ construction: B('armory'), gold: 100 }), { type: 'buyConstruction', colonyId: 'col' })).toBe('cannotAfford');
    expect(code(town({ gold: 9999 }), { type: 'buyConstruction', colonyId: 'col' })).toBe('nothingToBuy');
    expect(code(town({ construction: B('armory'), hammers: 52, gold: 9999 }), { type: 'buyConstruction', colonyId: 'col' })).toBe('nothingToBuy');
    expect(code(town({ construction: B('armory'), buildings: [...START, 'armory'], gold: 9999 }), { type: 'buyConstruction', colonyId: 'col' })).toBe('nothingToBuy');
    expect(code(town({ construction: B('armory'), gold: 1352 }), { type: 'buyConstruction', colonyId: 'col' })).toBe('ok');
  });
});
