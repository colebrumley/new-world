import { describe, expect, it } from 'vitest';
import { applyAction, validateAction, type Action } from '../../../src/engine/actions';
import { totalGoods } from '../../../src/engine/cargo';
import { TRADE_ROUTES } from '../../../src/engine/data/trade-routes';
import { checkInvariants } from '../../../src/engine/invariants';
import type { Colony, GameState, RouteStop, Unit } from '../../../src/engine/state';
import { defaultRouteName } from '../../../src/engine/trade-routes';
import { withColony, withUnit, world } from '../../helpers/world';

// Two colonies on one island joined by a road (two wagon turns apart at road speed: 6 squares),
// a third on the far shore reachable only by sea.
// x: 0123456789012
const ROWS = [
  '~~~~~~~~~~~~~',
  '~a======a~~a~',
  '~~~~~~~~~~~~~',
];
const idle = { id: 'i', profession: 'freeColonist', job: { kind: 'idle' }, turns: 0 } as const;
function base(): GameState {
  let s = world({ rows: ROWS });
  // colonies on ice with nobody working: nothing is produced, so only the carriers move goods (food is stocked so nobody starves)
  s = withColony(s, { id: 'west', x: 1, y: 1, name: 'Westport', goods: { food: 190, furs: 150, ore: 30 }, colonists: [{ ...idle, id: 'w1' }], buildings: ['warehouse'] });
  s = withColony(s, { id: 'east', x: 8, y: 1, name: 'Eastham', goods: { food: 190, tools: 80 }, colonists: [{ ...idle, id: 'e1' }], buildings: ['warehouse'] });
  s = withColony(s, { id: 'isle', x: 11, y: 1, name: 'Isle', goods: { food: 190 }, colonists: [{ ...idle, id: 'x1' }], buildings: [] });
  return s;
}
const u = (s: GameState, id: string): Unit => s.units[id] as Unit;
const col = (s: GameState, id: string): Colony => s.colonies[id] as Colony;
const code = (s: GameState, a: Action): string => {
  const v = validateAction(s, a);
  return v.ok ? 'ok' : v.error.code;
};
const act = (s: GameState, a: Action): GameState => {
  const next = applyAction(s, a).state;
  expect(checkInvariants(next)).toEqual([]);
  return next;
};
const round = (s: GameState): GameState => act(act(s, { type: 'endTurn' }), { type: 'endTurn' });
const LOOP: RouteStop[] = [
  { colonyId: 'west', unload: ['tools'], load: ['furs'] },
  { colonyId: 'east', unload: ['furs'], load: ['tools'] },
];
const routeId = (s: GameState): string => Object.keys(s.tradeRoutes)[0] as string;

describe('defining routes', () => {
  it('creates a route with a default name from its first stop', () => {
    expect(TRADE_ROUTES).toMatchSnapshot();
    const r = applyAction(base(), { type: 'createTradeRoute', kind: 'land', stops: LOOP });
    const route = Object.values(r.state.tradeRoutes)[0]!;
    expect(route).toMatchObject({ owner: 'a', name: 'Westport Run', kind: 'land', stops: LOOP });
    expect(r.events).toEqual([{ type: 'tradeRouteChanged', routeId: route.id, change: 'created' }]);
    const second = act(r.state, { type: 'createTradeRoute', kind: 'land', stops: LOOP });
    expect(Object.values(second.tradeRoutes).map((x) => x.name)).toEqual(['Westport Run', 'Westport Ferry']);
    const three = [...LOOP, { colonyId: 'isle', unload: [], load: [] }];
    expect(defaultRouteName(base(), 'a', three)).toBe('Westport Triangle');
    expect(Object.values(act(base(), { type: 'createTradeRoute', kind: 'sea', stops: LOOP, name: ' Fur Line ' }).tradeRoutes)[0]?.name).toBe('Fur Line');
  });

  it('allows up to 4 stops and 6 cargoes each way, and 12 routes', () => {
    const stop = (colonyId: string, n: number): RouteStop => ({ colonyId, unload: ['food', 'sugar', 'tobacco', 'cotton', 'furs', 'lumber', 'ore'].slice(0, n) as RouteStop['unload'], load: [] });
    const s = base();
    expect(code(s, { type: 'createTradeRoute', kind: 'land', stops: [stop('west', 6), stop('east', 6), stop('west', 1), stop('east', 1)] })).toBe('ok');
    expect(code(s, { type: 'createTradeRoute', kind: 'land', stops: [stop('west', 7)] })).toBe('badRoute');
    expect(code(s, { type: 'createTradeRoute', kind: 'land', stops: Array.from({ length: 5 }, () => stop('west', 1)) })).toBe('badRoute');
    expect(code(s, { type: 'createTradeRoute', kind: 'land', stops: [] })).toBe('badRoute');
    expect(code(s, { type: 'createTradeRoute', kind: 'land', stops: [{ colonyId: 'nowhere', unload: [], load: [] }] })).toBe('badRoute');
    expect(code(s, { type: 'createTradeRoute', kind: 'land', stops: [{ colonyId: 'west', unload: ['furs', 'furs'], load: [] }] })).toBe('badRoute');
    expect(code(s, { type: 'createTradeRoute', kind: 'air' as 'land', stops: LOOP })).toBe('badRoute');
    expect(code(s, { type: 'createTradeRoute', kind: 'land', stops: LOOP, name: '' })).toBe('badRoute');
    expect(code(withColony(s, { ...col(s, 'east'), owner: 'b' }), { type: 'createTradeRoute', kind: 'land', stops: LOOP })).toBe('badRoute');
    let full = s;
    for (let i = 0; i < 12; i++) full = act(full, { type: 'createTradeRoute', kind: 'land', stops: LOOP });
    expect(code(full, { type: 'createTradeRoute', kind: 'land', stops: LOOP })).toBe('tooManyRoutes');
  });

  it('edits and deletes; deleting releases the carriers on it', () => {
    let s = act(base(), { type: 'createTradeRoute', kind: 'land', stops: LOOP });
    const id = routeId(s);
    s = act(s, { type: 'editTradeRoute', routeId: id, stops: [LOOP[1]!], name: 'Back Road' });
    expect(s.tradeRoutes[id]).toMatchObject({ name: 'Back Road', stops: [LOOP[1]] });
    expect(code(s, { type: 'editTradeRoute', routeId: id, stops: [] })).toBe('badRoute');
    expect(code(s, { type: 'editTradeRoute', routeId: 'nope', stops: LOOP })).toBe('noSuchRoute');
    s = withUnit(s, { id: 'w', type: 'wagonTrain', x: 4, y: 1 });
    s = act(s, { type: 'assignTradeRoute', unitId: 'w', routeId: id });
    expect(u(s, 'w').orders).toBe('trade');
    s = act(s, { type: 'deleteTradeRoute', routeId: id });
    expect(s.tradeRoutes).toEqual({});
    expect(u(s, 'w')).toMatchObject({ orders: 'none', route: null });
    expect(code(s, { type: 'deleteTradeRoute', routeId: id })).toBe('noSuchRoute');
  });
});

describe('assigning carriers', () => {
  const s = act(act(base(), { type: 'createTradeRoute', kind: 'land', stops: LOOP }), { type: 'createTradeRoute', kind: 'sea', stops: [{ colonyId: 'east', unload: [], load: [] }, { colonyId: 'isle', unload: [], load: [] }] });
  const [land, sea] = Object.keys(s.tradeRoutes) as [string, string];
  const fleet = withUnit(withUnit(withUnit(s, { id: 'w', type: 'wagonTrain', x: 1, y: 1 }), { id: 'ship', type: 'caravel', x: 9, y: 1 }), { id: 'c', x: 1, y: 1 });

  it('wagon trains run land routes and ships sea routes; nothing else runs any', () => {
    expect(code(fleet, { type: 'assignTradeRoute', unitId: 'w', routeId: land })).toBe('ok');
    expect(code(fleet, { type: 'assignTradeRoute', unitId: 'w', routeId: sea })).toBe('wrongKindOfRoute');
    expect(code(fleet, { type: 'assignTradeRoute', unitId: 'ship', routeId: sea })).toBe('ok');
    expect(code(fleet, { type: 'assignTradeRoute', unitId: 'ship', routeId: land })).toBe('wrongKindOfRoute');
    expect(code(fleet, { type: 'assignTradeRoute', unitId: 'c', routeId: land })).toBe('notCarrier');
    expect(code(fleet, { type: 'assignTradeRoute', unitId: 'w', routeId: 'nope' })).toBe('noSuchRoute');
    expect(code(fleet, { type: 'assignTradeRoute', unitId: 'w', routeId: land, stop: 2 })).toBe('badRoute');
    expect(code(fleet, { type: 'assignTradeRoute', unitId: 'w', routeId: land, stop: 1 })).toBe('ok');
  });

  it('new orders take a carrier off its route', () => {
    const on = act(fleet, { type: 'assignTradeRoute', unitId: 'w', routeId: land, stop: 1 });
    expect(u(on, 'w')).toMatchObject({ orders: 'trade', route: { routeId: land } });
    expect(u(act(on, { type: 'setOrders', unitId: 'w', orders: 'none' }), 'w')).toMatchObject({ orders: 'none', route: null });
    expect(u(act(on, { type: 'setOrders', unitId: 'w', orders: 'sentry' }), 'w').route).toBeNull();
  });
});

describe('running a route', () => {
  it('a wagon train shuttles goods round a two-stop loop until told otherwise', () => {
    let s = act(base(), { type: 'createTradeRoute', kind: 'land', stops: LOOP });
    const before = totalGoods(s);
    s = withUnit(s, { id: 'w', type: 'wagonTrain', x: 1, y: 1 });
    const r = applyAction(s, { type: 'assignTradeRoute', unitId: 'w', routeId: routeId(s) });
    // standing in Westport: nothing to unload, takes both holds of furs, then sets out east along the road
    expect(r.events).toContainEqual({ type: 'routeTraded', unitId: 'w', colonyId: 'west', unloaded: {}, loaded: { furs: 150 } });
    s = r.state;
    expect(u(s, 'w').cargo).toEqual({ furs: 150 });
    expect(col(s, 'west').goods.furs).toBeUndefined();
    expect(u(s, 'w').x).toBeGreaterThan(1);
    expect(u(s, 'w').orders).toBe('trade');

    let turns = 0;
    while (u(s, 'w').x !== 8 && turns < 10) {
      s = round(s);
      turns++;
    }
    // arrived: furs ashore, tools aboard; entering the colony ended its turn there
    expect(col(s, 'east').goods).toMatchObject({ furs: 150 });
    expect(col(s, 'east').goods.tools).toBeUndefined();
    expect(u(s, 'w').cargo).toEqual({ tools: 80 });
    expect(u(s, 'w').route?.stop).toBe(0);

    turns = 0;
    while (u(s, 'w').x !== 1 && turns < 10) {
      s = round(s);
      turns++;
    }
    expect(col(s, 'west').goods).toMatchObject({ tools: 80 });
    expect(u(s, 'w').cargo).toEqual({}); // no furs left to fetch
    expect(u(s, 'w').orders).toBe('trade');
    // nothing was made or lost on the way, apart from what the idle colonists ate
    const after = totalGoods(s);
    expect({ ...after, food: 0 }).toEqual({ ...before, food: 0 });
  });

  it('loads only what fits and leaves the rest for the next trip', () => {
    let s = act(base(), { type: 'createTradeRoute', kind: 'land', stops: [{ colonyId: 'west', unload: [], load: ['furs', 'ore'] }, { colonyId: 'east', unload: ['furs', 'ore'], load: [] }] });
    s = withUnit(s, { id: 'w', type: 'wagonTrain', x: 1, y: 1 });
    s = act(s, { type: 'assignTradeRoute', unitId: 'w', routeId: routeId(s) });
    expect(u(s, 'w').cargo).toEqual({ furs: 150 }); // two holds: 100 + 50; ore does not fit
    expect(col(s, 'west').goods.ore).toBe(30);
  });

  it('a ship runs a sea route between two ports', () => {
    let s = act(base(), { type: 'createTradeRoute', kind: 'sea', stops: [{ colonyId: 'east', unload: [], load: ['tools'] }, { colonyId: 'isle', unload: ['tools'], load: [] }] });
    s = withUnit(s, { id: 'ship', type: 'caravel', x: 8, y: 1 });
    s = act(s, { type: 'assignTradeRoute', unitId: 'ship', routeId: routeId(s) });
    for (let i = 0; i < 4 && (col(s, 'isle').goods.tools ?? 0) === 0; i++) s = round(s);
    expect(col(s, 'isle').goods.tools).toBe(80);
    expect(u(s, 'ship').orders).toBe('trade');
  });

  it('skips a stop whose colony is lost and stands down when none is left', () => {
    let s = act(base(), { type: 'createTradeRoute', kind: 'land', stops: LOOP });
    s = withUnit(s, { id: 'w', type: 'wagonTrain', x: 4, y: 1 });
    s = act(s, { type: 'assignTradeRoute', unitId: 'w', routeId: routeId(s), stop: 1 });
    const { east: _lost, ...rest } = s.colonies;
    s = round({ ...s, colonies: rest });
    expect(u(s, 'w').route?.stop).toBe(0);
    const gone = applyAction(applyAction({ ...s, colonies: { isle: s.colonies['isle']! } }, { type: 'endTurn' }).state, { type: 'endTurn' });
    expect(u(gone.state, 'w')).toMatchObject({ orders: 'none', route: null });
    expect(gone.events).toContainEqual({ type: 'routeEnded', unitId: 'w' });
  });
});
