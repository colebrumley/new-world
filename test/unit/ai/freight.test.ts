import { describe, expect, it } from 'vitest';
import { awaitingPassage, europeBound, europeShip, freightWorth, loadChoice, mayLoad, pickupFor, pickups } from '../../../src/ai/freight';
import { applyAction } from '../../../src/engine/actions';
import { AI_FREIGHT } from '../../../src/engine/data/ai';
import { checkInvariants } from '../../../src/engine/invariants';
import { priceLevel } from '../../../src/engine/market';
import { OFF_MAP, type Colonist, type Colony, type GameState, type Player, type Unit } from '../../../src/engine/state';
import { policy } from '../../helpers/policy';
import { withColony, withUnit, world } from '../../helpers/world';

// a west shore with the sea lane at the far left; an island to the east
const ROWS = Array.from({ length: 9 }, (_, y) => (y === 0 || y === 8 ? 's' + '~'.repeat(19) : `s~~${'.'.repeat(10)}~~~...~`));
const people = (n: number, p: string): Colonist[] => Array.from({ length: n }, (_, i) => ({ id: `${p}${i}`, profession: 'freeColonist' as const, job: { kind: 'idle' as const }, turns: 0 }));
const base = (turn = 20): GameState => ({ ...world({ rows: ROWS, players: [{ id: 'a', kind: 'ai', nation: 'france' }, { id: 'b', kind: 'ai', nation: 'spain' }] }), turn });
const me = (s: GameState): Player => s.players[0] as Player;
const c = (s: GameState, id: string): Colony => s.colonies[id] as Colony;
const u = (s: GameState, id: string): Unit => s.units[id] as Unit;
/** Everything a colony might ask for is in store, so that nothing is wanted from Europe. */
const STOCKED = { muskets: 100, horses: 50, tools: 20 };
const col = (s: GameState, id: string, y: number, goods: Colony['goods'] = {}, pop = 1): GameState =>
  withColony(s, { id, x: 3, y, colonists: people(pop, `${id}-`), goods: { ...STOCKED, ...goods }, construction: { kind: 'building', id: 'stockade' } });
const ship = (s: GameState, x: number, y: number, type: Unit['type'] = 'caravel', cargo: Unit['cargo'] = {}, id = 'ship'): GameState => withUnit(s, { id, type, profession: null, x, y, cargo });
const reachable = (): boolean => true;

describe('freight rule table', () => {
  it('matches the snapshot', () => {
    expect(AI_FREIGHT).toMatchSnapshot();
  });
});

describe('what a ship loads in one of her ports', () => {
  it('never lumber, food or trade goods; tools and muskets only from a colony that makes them', () => {
    const s = col(base(), 'home', 4, { lumber: 90, food: 90, tradeGoods: 90, tools: 90, muskets: 90 });
    for (const good of ['lumber', 'food', 'tradeGoods', 'tools', 'muskets'] as const) expect(freightWorth(s, c(s, 'home'), good)).toBe(0);
    expect(loadChoice(s, c(s, 'home'))).toBeNull();
  });

  it('the good whose stock x price level is highest, a hundred at most; a full warehouse counts twice', () => {
    const s = col(base(), 'home', 4, { sugar: 60, furs: 40, cloth: 100 });
    const level = (good: 'sugar' | 'furs' | 'cloth'): number => priceLevel(s, 'a', good);
    expect(freightWorth(s, c(s, 'home'), 'sugar')).toBe(60 * level('sugar'));
    expect(freightWorth(s, c(s, 'home'), 'cloth')).toBe(200 * level('cloth'));
    expect(loadChoice(s, c(s, 'home'))).toEqual({ good: 'cloth', amount: 100 });
    // even a little is taken when it is all there is
    const little = col(base(), 'home', 4, { furs: 3 });
    expect(loadChoice(little, c(little, 'home'))).toEqual({ good: 'furs', amount: 3 });
  });

  it('horses only when the colony is within twenty-three of full of them', () => {
    const horses = (n: number): number => { const s = col(base(), 'home', 4, { horses: n }); return freightWorth(s, c(s, 'home'), 'horses'); };
    expect(horses(77)).toBe(0);
    expect(horses(78)).toBeGreaterThan(0);
  });

  it('never a man-of-war; a privateer only while its ports are beset; a frigate only while the fleet is short of holds', () => {
    const of = (type: Unit['type'], extra: (s: GameState) => GameState = (s) => s): boolean => { const s = extra(ship(col(base(), 'home', 4), 2, 4, type)); return mayLoad(s, me(s), u(s, 'ship')); };
    expect(of('caravel')).toBe(true);
    expect(of('manOWar')).toBe(false);
    expect(of('privateer')).toBe(false);
    // a frigate alone has two holds less three: under four, so she carries
    expect(of('frigate')).toBe(true);
    // with two galleons besides, the fleet has holds enough
    expect(of('frigate', (s) => ship(ship(s, 1, 1, 'galleon', {}, 'g1'), 1, 2, 'galleon', {}, 'g2'))).toBe(false);
  });

  it('in port she unloads, loads a hold at a time, and a whole turn leaves the game sound', () => {
    let s = ship(col(base(), 'home', 4, { sugar: 60, furs: 40 }), 3, 4, 'caravel', { coats: 100 });
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      const action = policy(s);
      seen.push(action.type + ('good' in action ? `:${action.good}` : ''));
      if (action.type === 'endTurn') break;
      s = applyAction(s, action).state;
      expect(checkInvariants(s)).toEqual([]);
    }
    expect(seen[0]).toBe('unloadCargo:coats');
  });
});

describe('where an empty ship goes', () => {
  it('a port is worth a call for a good at 75 or more, or for a pioneer waiting where there is no ground left to improve', () => {
    const quiet = col(col(base(), 'home', 2, { sugar: 74 }), 'second', 6, { furs: 20 });
    expect(pickups(quiet, me(quiet))).toEqual([]);
    const ready = col(col(base(), 'home', 2, { sugar: 75 }), 'second', 6, { furs: 20 });
    expect(pickups(ready, me(ready)).map((p) => p.colony.id)).toEqual(['home']);
    expect(pickups(ready, me(ready))[0]?.value).toBe(75 * priceLevel(ready, 'a', 'sugar'));
  });

  it('the most value for the distance, never the port she lies in', () => {
    const s = ship(col(col(base(), 'north', 1, { sugar: 100 }), 'south', 7, { sugar: 80 }), 2, 6);
    // north is five squares off: value / 2; south one square: value / 1
    expect(pickupFor(s, me(s), u(s, 'ship'), reachable)?.id).toBe('south');
    const lying = ship(s, 3, 7);
    expect(pickupFor(lying, me(lying), u(lying, 'ship'), reachable)?.id).toBe('north');
    const none = ship(col(base(), 'north', 1), 2, 6);
    expect(pickupFor(none, me(none), u(none, 'ship'), reachable)).toBeNull();
  });

  it('troops beyond the garrison wait for passage only where the land is settled and quiet; pioneers anywhere', () => {
    const s = withUnit(withUnit(col(base(), 'home', 4, {}, 3), { id: 'p', type: 'pioneer', x: 3, y: 4 }), { id: 'g', type: 'artillery', profession: null, x: 3, y: 4 });
    expect(awaitingPassage(s, me(s), c(s, 'home')).map((x) => x.id)).toEqual(['p']);
  });

  it('the Europe ship is the first merchantman of a power with two merchantmen or galleons, else the first of two caravels', () => {
    const one = ship(base(), 1, 1);
    expect(europeShip(one, me(one))).toBeNull();
    const two = ship(one, 1, 2, 'caravel', {}, 'other');
    expect(europeShip(two, me(two))).toBe('other');
    const big = ship(ship(two, 1, 3, 'galleon', {}, 'g'), 1, 4, 'merchantman', {}, 'm');
    expect(europeShip(big, me(big))).toBe('m');
  });

  it('she makes for Europe with two holds of produce or a full ship, or empty while more wait on the docks than ships are bound there', () => {
    const bound = (s: GameState, nothing = false): boolean => europeBound(s, me(s), u(s, 'ship'), nothing);
    expect(bound(ship(base(), 2, 4, 'merchantman', { sugar: 100 }))).toBe(false);
    expect(bound(ship(base(), 2, 4, 'merchantman', { sugar: 100, furs: 20 }))).toBe(true);
    expect(bound(ship(base(), 2, 4))).toBe(false);
    const docks = (s: GameState): GameState => {
      const t = withUnit(s, { id: 'w', x: 0, y: 0, orders: 'sentry' });
      return { ...t, units: { ...t.units, w: { ...u(t, 'w'), x: OFF_MAP, y: OFF_MAP, voyage: { phase: 'inEurope', turnsLeft: 0, origin: [0, 4] } } } };
    };
    expect(bound(docks(ship(base(), 2, 4)))).toBe(true);
    // one hold of produce does not keep her from them
    expect(bound(docks(ship(base(), 2, 4, 'merchantman', { sugar: 100 })))).toBe(true);
    // with nothing to fetch: only the Europe ship, or on her turn in thirty-two
    const pair = ship(ship(base(), 2, 4), 2, 5, 'caravel', {}, 'zz');
    expect(bound(pair, true)).toBe(true);
    expect(bound(pair, false)).toBe(false);
  });

  it('a small ship in a port beset by a foreign frigate lies there until she has waited ten turns less her holds', () => {
    // furs in the warehouse that she would otherwise load
    const beset = (waited: number): GameState => {
      const s = ship(col(base(), 'home', 4, { furs: 100 }), 3, 4);
      return { ...s, units: { ...s.units, ship: { ...u(s, 'ship'), blockaded: waited } } };
    };
    // a caravel has two holds: she waits while eight is more than the turns she has lain there
    expect(policy(beset(7))).toEqual({ type: 'endTurn' });
    expect(policy(beset(8))).toMatchObject({ type: 'loadCargo', good: 'furs' });
    expect(policy(beset(0))).toMatchObject({ type: 'loadCargo', good: 'furs' });
  });
});
