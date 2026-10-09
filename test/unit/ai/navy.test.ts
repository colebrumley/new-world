import { describe, expect, it } from 'vitest';
import { europeanAction } from '../../../src/ai/european';
import { baseLoad, blockadeSquare, chooseStation, firmPeace, mayEngage, navalAttackChoice, navalOrders, navalStations, privateersCarry, warshipAction, type Station } from '../../../src/ai/navy';
import { applyAction } from '../../../src/engine/actions';
import { AI_NAVY } from '../../../src/engine/data/ai';
import { checkInvariants } from '../../../src/engine/invariants';
import { OFF_MAP, type Colonist, type Dealing, type GameState, type Player, type Unit } from '../../../src/engine/state';
import { withColony, withUnit, world } from '../../helpers/world';

// open sea with a block of land in the middle (x 12..15, y 2..9) and a lake inside it at (14, 5)
const ROWS = Array.from({ length: 12 }, (_, y) => (y < 2 || y > 9 ? '~'.repeat(24) : y === 5 ? `${'~'.repeat(12)}..~.${'~'.repeat(8)}` : `${'~'.repeat(12)}....${'~'.repeat(8)}`));
const people = (n: number, p: string): Colonist[] => Array.from({ length: n }, (_, i) => ({ id: `${p}${i}`, profession: 'freeColonist' as const, job: { kind: 'idle' as const }, turns: 0 }));
const DEALING: Dealing = { grudge: false, piracy: false, intent: false, truce: 0, lastTalk: -1, kingsWarUntil: 0 };
type Stance = Partial<Record<string, 'peace' | 'war'>>;
/** Computer powers a and b and a human h. */
const sea = (stance: Stance = {}, intent: readonly string[] = []): GameState => {
  const s = world({ rows: ROWS, players: [{ id: 'a', kind: 'ai' }, { id: 'b', kind: 'ai' }, { id: 'h', kind: 'human' }] });
  const dealings = Object.fromEntries(intent.map((id) => [id, { ...DEALING, intent: true }]));
  return { ...s, turn: 120, players: s.players.map((p) => (p.id === 'a' ? { ...p, stance: stance as Player['stance'], dealings } : p)) };
};
const me = (s: GameState): Player => s.players[0] as Player;
const ship = (s: GameState, id: string, type: Unit['type'], x: number, y: number, owner = 'a'): GameState => withUnit(s, { id, type, profession: null, x, y, owner });
const u = (s: GameState, id: string): Unit => s.units[id] as Unit;
/** b's port colony on the west shore, with the given population. */
const theirPort = (s: GameState, pop = 1, owner = 'b'): GameState => withColony(s, { id: 'theirs', owner, x: 12, y: 5, colonists: people(pop, 't') });
const ourPort = (s: GameState): GameState => withColony(s, { id: 'ours', x: 15, y: 5, colonists: people(2, 'o'), construction: { kind: 'building', id: 'stockade' } });
const places = (stations: readonly Station[]): string[] => stations.map((st) => `${st.why} ${st.x},${st.y} p${st.priority}`);

describe('naval rule table', () => {
  it('matches the snapshot', () => {
    expect(AI_NAVY).toMatchSnapshot();
  });
});

describe('the stations a power lists', () => {
  it('priority 3 at every ship it can see of a power it is at war with', () => {
    const seen = ship(ship(sea({ b: 'war' }), 'mine', 'frigate', 4, 4), 'foe', 'merchantman', 6, 4, 'b');
    expect(places(navalStations(seen, me(seen)))).toEqual(['enemyShip 6,4 p3']);
    // out of sight (a frigate sees two squares), or at peace, there is none
    const unseen = ship(ship(sea({ b: 'war' }), 'mine', 'frigate', 4, 4), 'foe', 'merchantman', 7, 4, 'b');
    expect(navalStations(unseen, me(unseen))).toEqual([]);
    const peace = ship(ship(sea({ b: 'peace' }), 'mine', 'frigate', 4, 4), 'foe', 'merchantman', 6, 4, 'b');
    expect(navalStations(peace, me(peace))).toEqual([]);
    // seen from a colony as well
    const fromShore = ship(ourPort(sea({ b: 'war' })), 'foe', 'merchantman', 17, 5, 'b');
    expect(places(navalStations(fromShore, me(fromShore)))).toContain('enemyShip 17,5 p3');
  });

  it('and at every foreign privateer it can see, whatever the treaty', () => {
    const s = ship(ship(sea({ b: 'peace' }), 'mine', 'frigate', 4, 4), 'rover', 'privateer', 6, 4, 'b');
    expect(places(navalStations(s, me(s)))).toEqual(['enemyShip 6,4 p3']);
  });

  it('2 to 4 by population on the open sea two squares off each port colony of a power not at firm peace', () => {
    // no contact yet does not count as peace
    expect(places(navalStations(theirPort(sea()), me(sea())))).toEqual(['blockade 10,5 p2']);
    expect(places(navalStations(theirPort(sea(), 3), me(sea())))).toEqual(['blockade 10,5 p2']);
    expect(places(navalStations(theirPort(sea(), 4), me(sea())))).toEqual(['blockade 10,5 p3']);
    expect(places(navalStations(theirPort(sea(), 11), me(sea())))).toEqual(['blockade 10,5 p3']);
    expect(places(navalStations(theirPort(sea(), 12), me(sea())))).toEqual(['blockade 10,5 p4']);
    expect(places(navalStations(theirPort(sea({ b: 'war' })), me(sea({ b: 'war' }))))).toEqual(['blockade 10,5 p2']);
    // a treaty it means to keep: nothing; one it means to break: a station
    expect(navalStations(theirPort(sea({ b: 'peace' })), me(sea({ b: 'peace' })))).toEqual([]);
    expect(firmPeace(sea({ b: 'peace' }), me(sea({ b: 'peace' })), 'b')).toBe(true);
    const false_ = sea({ b: 'peace' }, ['b']);
    expect(firmPeace(false_, me(false_), 'b')).toBe(false);
    expect(places(navalStations(theirPort(false_), me(false_)))).toEqual(['blockade 10,5 p2']);
  });

  it('the blockade square is the one with most open sea beside it that touches the colony; a colony off the open sea has none', () => {
    expect(blockadeSquare(sea(), { x: 12, y: 5 })).toEqual([10, 5]);
    // on the lake only: no port, no station
    const inland = withColony(sea(), { id: 'theirs', owner: 'b', x: 13, y: 4 });
    expect(blockadeSquare(inland, { x: 13, y: 5 })).toBeNull();
    expect(navalStations(inland, me(inland))).toEqual([]);
  });

  it('5 at its own ports with a foreign armed ship within 5 squares, 8 if it is a frigate', () => {
    const near = ship(ourPort(sea({ b: 'peace' })), 'p', 'privateer', 20, 5, 'b');
    expect(places(navalStations(near, me(near)))).toContain('homePort 15,5 p5');
    const frigate = ship(ourPort(sea({ b: 'peace' })), 'f', 'frigate', 20, 5, 'b');
    expect(places(navalStations(frigate, me(frigate)))).toEqual(['homePort 15,5 p8']);
    const farOff = ship(ourPort(sea({ b: 'peace' })), 'f', 'frigate', 21, 5, 'b');
    expect(navalStations(farOff, me(farOff))).toEqual([]);
    const trader = ship(ourPort(sea({ b: 'peace' })), 'm', 'merchantman', 17, 5, 'b');
    expect(navalStations(trader, me(trader))).toEqual([]);
  });

  it('the most pressing come first', () => {
    let s = theirPort(ourPort(sea({ b: 'war' })), 12);
    s = ship(ship(s, 'f', 'frigate', 18, 5, 'b'), 'mine', 'frigate', 16, 5);
    expect(places(navalStations(s, me(s)))).toEqual(['homePort 15,5 p8', 'blockade 10,5 p4', 'enemyShip 18,5 p3']);
  });

  it("after the Declaration only the human's ships are sought", () => {
    let s = ship(ship(ship(sea({ b: 'war', h: 'war' }), 'mine', 'frigate', 4, 4), 'foe', 'merchantman', 6, 4, 'b'), 'his', 'merchantman', 4, 6, 'h');
    expect(navalStations(s, me(s))).toHaveLength(2);
    s = { ...s, crownPlayer: 'crown' };
    expect(places(navalStations(s, me(s)))).toEqual(['enemyShip 4,6 p3']);
  });
});

describe('which station a ship takes', () => {
  const at = (x: number, priority: number): Station => ({ x, y: 0, priority, why: 'blockade' });

  it('the lowest load x distance / (priority + 1)', () => {
    // 3 x 8 / 3 = 8 against 3 x 12 / 5 = 7: the farther, weightier one
    expect(chooseStation([at(8, 2), at(12, 4)], [3, 3], 3, 0, 0)).toBe(1);
    // with a ship already sent there its load is 4: 4 x 12 / 5 = 9
    expect(chooseStation([at(8, 2), at(12, 4)], [3, 4], 3, 0, 0)).toBe(0);
    // a tie keeps the one listed first
    expect(chooseStation([at(6, 2), at(6, 2)], [3, 3], 3, 0, 0)).toBe(0);
    expect(chooseStation([], [], 3, 0, 0)).toBe(-1);
  });

  it('within about 11, 19, 34 and 47 squares at priority 2, 3, 4 and 5', () => {
    const reach = (priority: number): number => {
      let d = 0;
      while (chooseStation([at(d + 1, priority)], [3], 3, 0, 0) === 0) d++;
      return d;
    };
    expect([2, 3, 4, 5].map(reach)).toEqual([11, 19, 34, 47]);
  });

  it('load starts at the land units / 8, never under 3 nor over 99', () => {
    let s = sea();
    expect(baseLoad(s, me(s))).toBe(3);
    for (let i = 0; i < 40; i++) s = withUnit(s, { id: `l${i}`, x: 13, y: 3 });
    expect(baseLoad(s, me(s))).toBe(5);
    // ships do not count
    expect(baseLoad(ship(s, 'f', 'frigate', 4, 4), me(s))).toBe(5);
  });

  it('each ship sent adds one to the load, so a second looks elsewhere when it is no worse', () => {
    // two rival ports six squares either side of two frigates lying together
    let s = withColony(sea(), { id: 'north', owner: 'b', x: 12, y: 2 });
    s = withColony(s, { id: 'south', owner: 'b', x: 12, y: 9 });
    const stations = navalStations(s, me(s));
    expect(stations).toHaveLength(2);
    s = ship(ship(s, 'f1', 'frigate', 6, 5), 'f2', 'frigate', 6, 5);
    const orders = navalOrders(s, me(s));
    const i = chooseStation(stations, [3, 3], 3, 6, 5);
    expect(orders['f1']).toEqual(stations[i]);
    const j = chooseStation(stations, i === 0 ? [4, 3] : [3, 4], 3, 6, 5);
    expect(orders['f2']).toEqual(stations[j]);
    const first = stations[0] as Station;
    // a ship already under way to a station is counted there before the others choose
    const under = { ...s, units: { ...s.units, f2: { ...u(s, 'f2'), orders: 'goto' as const, destination: [first.x, first.y] as const } } };
    expect(navalOrders(under, me(under))['f1']).toEqual(stations[chooseStation(stations, [4, 3], 3, 6, 5)]);
  });
});

describe('fighting at sea', () => {
  const facing = (mine: Unit['type'], theirs: Unit['type'], stance: Stance, owner = 'b'): GameState => ship(ship(sea(stance), 'mine', mine, 4, 4), 'foe', theirs, 5, 4, owner);
  const attacks = (s: GameState): boolean => navalAttackChoice(s, u(s, 'mine'), me(s)) !== null;

  it('a ship attacks an adjacent enemy ship at any odds', () => {
    const s = facing('privateer', 'manOWar', { b: 'war' });
    expect(navalAttackChoice(s, u(s, 'mine'), me(s))).toEqual({ type: 'attack', unitId: 'mine', dx: 1, dy: 0 });
    expect(europeanAction(s)).toEqual({ type: 'attack', unitId: 'mine', dx: 1, dy: 0 });
    expect(checkInvariants(applyAction(s, europeanAction(s)).state)).toEqual([]);
  });

  it('a peace treaty stops that, unless the attacker or the target is a privateer', () => {
    expect(attacks(facing('frigate', 'merchantman', { b: 'war' }))).toBe(true);
    expect(attacks(facing('frigate', 'merchantman', { b: 'peace' }))).toBe(false);
    expect(attacks(facing('frigate', 'frigate', { b: 'peace' }))).toBe(false);
    expect(attacks(facing('privateer', 'merchantman', { b: 'peace' }))).toBe(true);
    expect(attacks(facing('frigate', 'privateer', { b: 'peace' }))).toBe(true);
    expect(attacks(facing('manOWar', 'privateer', { b: 'peace' }))).toBe(true);
    // a power not yet met is no enemy of a ship of the line, but fair game for a privateer
    expect(attacks(facing('frigate', 'merchantman', {}))).toBe(false);
    expect(attacks(facing('privateer', 'merchantman', {}))).toBe(true);
    const s = facing('frigate', 'privateer', { b: 'peace' });
    expect(mayEngage(s, me(s), u(s, 'mine'), u(s, 'foe'))).toBe(true);
  });

  it('only with a whole move in hand; never by a transport; never against the land or a colony', () => {
    const tired = facing('frigate', 'merchantman', { b: 'war' });
    const spent = { ...tired, units: { ...tired.units, mine: { ...u(tired, 'mine'), movesLeft: 2 } } };
    expect(attacks(spent)).toBe(false);
    expect(attacks(facing('merchantman', 'merchantman', { b: 'war' }))).toBe(false);
    // an enemy ship lying in its colony, and soldiers on the shore, are left alone
    let ashore = theirPort(ship(sea({ b: 'war' }), 'mine', 'frigate', 11, 5));
    ashore = withUnit(ship(ashore, 'foe', 'merchantman', 12, 5, 'b'), { id: 'guard', owner: 'b', type: 'soldier', x: 12, y: 4 });
    expect(attacks(ashore)).toBe(false);
  });

  it("after the Declaration only the human's units are attacked", () => {
    const declared = (s: GameState): GameState => ({ ...s, crownPlayer: 'crown' });
    expect(attacks(declared(facing('frigate', 'merchantman', { b: 'war' })))).toBe(false);
    expect(attacks(declared(facing('privateer', 'merchantman', { b: 'peace' })))).toBe(false);
    expect(attacks(declared(facing('frigate', 'merchantman', { h: 'war' }, 'h')))).toBe(true);
    expect(attacks(declared(facing('privateer', 'merchantman', { h: 'peace' }, 'h')))).toBe(true);
  });
});

describe('what a warship does', () => {
  it('goes to its station and holds there', () => {
    const s = ship(theirPort(sea()), 'p', 'privateer', 4, 5);
    expect(warshipAction(s, u(s, 'p'), me(s))).toEqual({ type: 'goTo', unitId: 'p', x: 10, y: 5 });
    expect(europeanAction(s)).toEqual({ type: 'goTo', unitId: 'p', x: 10, y: 5 });
    const there = ship(theirPort(sea()), 'p', 'privateer', 10, 5);
    expect(warshipAction(there, u(there, 'p'), me(there))).toBeNull();
    expect(europeanAction(there)).toEqual({ type: 'endTurn' });
  });

  it('nothing sends a privateer after the shipping of a power at firm peace', () => {
    // their merchantman in plain sight, their port near by: no station, so the privateer makes for home
    let s = ship(ship(theirPort(ourPort(sea({ b: 'peace' }))), 'p', 'privateer', 8, 5), 'trader', 'merchantman', 10, 5, 'b');
    expect(navalStations(s, me(s))).toEqual([]);
    expect(warshipAction(s, u(s, 'p'), me(s))).toEqual({ type: 'goTo', unitId: 'p', x: 15, y: 5 });
    // but one that comes alongside is fair game
    s = ship(s, 'trader', 'merchantman', 9, 5, 'b');
    expect(warshipAction(s, u(s, 'p'), me(s))).toEqual({ type: 'attack', unitId: 'p', dx: 1, dy: 0 });
  });

  it('with no station a privateer or man-of-war lies in its nearest port; a frigate is free for other work', () => {
    const idle = ship(ourPort(sea({ b: 'peace' })), 'p', 'manOWar', 18, 5);
    expect(warshipAction(idle, u(idle, 'p'), me(idle))).toEqual({ type: 'goTo', unitId: 'p', x: 15, y: 5 });
    const home = ship(ourPort(sea({ b: 'peace' })), 'p', 'privateer', 15, 5);
    expect(warshipAction(home, u(home, 'p'), me(home))).toBeNull();
    const frigate = ship(ourPort(sea({ b: 'peace' })), 'p', 'frigate', 18, 5);
    expect(warshipAction(frigate, u(frigate, 'p'), me(frigate))).toBeUndefined();
    // and so is any warship with people aboard
    const laden = withUnit(ship(theirPort(sea()), 'p', 'frigate', 4, 5), { id: 'rider', x: 4, y: 5, aboard: 'p' });
    expect(warshipAction(laden, u(laden, 'p'), me(laden))).toBeUndefined();
  });

  it('a privateer carries for its power only while its ports are beset by frigates', () => {
    const quiet = ourPort(sea({ b: 'peace' }));
    expect(privateersCarry(quiet, me(quiet))).toBe(false);
    // one port of two people with a frigate off it is not enough
    const one = ship(quiet, 'f', 'frigate', 18, 5, 'b');
    expect(privateersCarry(one, me(one))).toBe(false);
    // a second beset port is, and so is a beset port of more than six
    const two = withColony(one, { id: 'second', x: 15, y: 8, colonists: people(1, 's') });
    expect(privateersCarry(two, me(two))).toBe(true);
    const big = withColony(ship(sea({ b: 'peace' }), 'f', 'frigate', 18, 5, 'b'), { id: 'ours', x: 15, y: 5, colonists: people(7, 'o') });
    expect(privateersCarry(big, me(big))).toBe(true);
    const pressed = ship(big, 'p', 'privateer', 15, 5);
    expect(warshipAction(pressed, u(pressed, 'p'), me(pressed))).toBeUndefined();
  });
});

describe('getting a privateer', () => {
  const inEurope = (s: GameState, id: string): GameState => ({ ...s, units: { ...s.units, [id]: { ...u(s, id), x: OFF_MAP, y: OFF_MAP, voyage: { phase: 'inEurope', turnsLeft: 0, origin: [1, 5] } } } });
  const established = (colonies: number, gold: number): GameState => {
    let s = sea({ b: 'peace', h: 'peace' });
    for (let i = 0; i < colonies; i++) {
      s = withColony(s, { id: `c${i}`, x: 15, y: 2 + 2 * i, colonists: people(1, `c${i}-`), construction: { kind: 'building', id: 'stockade' } });
      s = withUnit(s, { id: `g${i}`, type: 'soldier', x: 15, y: 2 + 2 * i, orders: 'fortified' });
    }
    s = inEurope(ship(s, 'carrier', 'merchantman', 0, 0), 'carrier');
    return { ...s, players: s.players.map((p) => (p.id === 'a' ? { ...p, gold, pool: [] } : p)) };
  };

  it('a power with four colonies and none buys one when it can keep its reserve, and sends it straight out', () => {
    const rich = established(4, 2000 + AI_NAVY.privateerReserve);
    expect(europeanAction(rich)).toEqual({ type: 'purchaseUnit', unit: 'privateer' });
    expect(europeanAction(established(4, 2000 + AI_NAVY.privateerReserve - 1))).not.toMatchObject({ type: 'purchaseUnit' });
    expect(europeanAction(established(3, 9000))).not.toMatchObject({ type: 'purchaseUnit', unit: 'privateer' });
    const bought = applyAction(rich, europeanAction(rich)).state;
    const privateer = Object.values(bought.units).find((v) => v.type === 'privateer') as Unit;
    expect(europeanAction(bought)).toEqual({ type: 'sailFromEurope', unitId: privateer.id });
  });
});
