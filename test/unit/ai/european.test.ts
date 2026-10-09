import { describe, expect, it } from 'vitest';
import {coloniesWanted, playTurn, siteScore } from '../../../src/ai/european';
import { applyAction, validateAction } from '../../../src/engine/actions';
import { AI_PLAN } from '../../../src/engine/data/ai';
import { DEFAULT_WORLD } from '../../../src/engine/data/mapgen';
import { NATION_IDS } from '../../../src/engine/data/nations';
import { createGame } from '../../../src/engine/game';
import { checkInvariants } from '../../../src/engine/invariants';
import { OFF_MAP, type Colonist, type GameState, type Player, type Unit } from '../../../src/engine/state';
import { replay } from '../../../src/engine/save';
import { policy } from '../../helpers/policy';
import { setTile, withColony, withUnit, world } from '../../helpers/world';

// a coast: sea on the left, land on the right, the sea lane at the far left edge
const ROWS = ['sss~~~~~~~~~~~', 'sss~~~........', 'sss~~~........', 'sss~~~........', 'sss~~~........', 'sss~~~........', 'sss~~~........', 'sss~~~~~~~~~~~'];
const people = (n: number, p = 'c'): Colonist[] => Array.from({ length: n }, (_, i) => ({ id: `${p}${i}`, profession: 'freeColonist' as const, job: { kind: 'idle' as const }, turns: 0 }));
const base = (nation: 'england' | 'france' = 'france', turn = 0): GameState => ({
  ...world({ rows: ROWS, players: [{ id: 'a', kind: 'ai', nation }, { id: 'b', kind: 'ai', nation: 'spain' }] }),
  turn,
});
const me = (s: GameState): Player => s.players[0] as Player;
const patch = (s: GameState, change: Partial<Player>): GameState => ({ ...s, players: s.players.map((p) => (p.id === 'a' ? { ...p, ...change } : p)) });
const inEurope = (s: GameState, id: string): GameState => ({ ...s, units: { ...s.units, [id]: { ...(s.units[id] as Unit), x: OFF_MAP, y: OFF_MAP, voyage: { phase: 'inEurope', turnsLeft: 0, origin: [1, 3] } } } });

describe('AI plan table', () => {
  it('matches the snapshot', () => {
    expect(AI_PLAN).toMatchSnapshot();
  });
});

describe('what a computer power wants', () => {
  it('more colonies as the years pass, and more for an expansionist leader', () => {
    expect(coloniesWanted(base('france', 0), me(base('france')))).toBe(5);
    expect(coloniesWanted(base('england', 0), me(base('england')))).toBe(3);
    expect(coloniesWanted(base('england', 100), me(base('england')))).toBe(5);
    expect(coloniesWanted(base('france', 400), me(base('france')))).toBe(8);
  });

  it('a site on the coast with land to work, away from other colonies and from native settlements', () => {
    const s = base();
    expect(siteScore(s, 6, 3)).toBeGreaterThan(0); // on the shore
    expect(siteScore(s, 9, 3)).toBe(0); // no port
    expect(siteScore(s, 3, 3)).toBe(0); // the sea
    expect(siteScore(setTile(s, 6, 3, { relief: 'hills' }), 6, 3)).toBe(0);
    const crowded = withColony(s, { id: 'col', owner: 'b', x: 6, y: 5, name: 'Theirs' });
    expect(siteScore(crowded, 6, 3)).toBe(0); // too close
    expect(siteScore(crowded, 6, 2)).toBeGreaterThan(0);
  });
});

describe('what it does next', () => {
  it('a settler standing on a good site founds a colony there', () => {
    const s = withUnit(base(), { id: 'u', x: 6, y: 3 });
    expect(policy(s)).toEqual({ type: 'foundColony', unitId: 'u' });
  });

  it('a settler inland walks to a site', () => {
    const s = withUnit(base(), { id: 'u', x: 10, y: 3 });
    const action = policy(s);
    expect(action).toMatchObject({ type: 'goTo', unitId: 'u' });
    const goal = action as { x: number; y: number };
    expect(siteScore(s, goal.x, goal.y)).toBeGreaterThan(0);
  });

  it('a ship with settlers makes for a berth beside a site, and they go ashore when it gets there', () => {
    let s = withUnit(base(), { id: 'ship', type: 'caravel', profession: null, x: 2, y: 3 });
    s = withUnit(s, { id: 'u', x: 2, y: 3, aboard: 'ship' });
    expect(policy(s)).toMatchObject({ type: 'goTo', unitId: 'ship' });
    const arrived = { ...s, units: { ...s.units, ship: { ...s.units['ship']!, x: 5, y: 3 }, u: { ...s.units['u']!, x: 5, y: 3 } } };
    expect(policy(arrived)).toMatchObject({ type: 'moveUnit', unitId: 'u', dx: 1 });
  });

  it('a missionary alone aboard is carried to a colony, not to a fresh site, and walks ashore there', () => {
    let s: GameState = { ...withColony(base(), { id: 'col', x: 6, y: 3, name: 'C', colonists: people(1), construction: { kind: 'building', id: 'stockade' } }), turn: 120 };
    s = withUnit(s, { id: 'ship', type: 'caravel', profession: null, x: 3, y: 6 });
    s = withUnit(s, { id: 'm', type: 'missionary', x: 3, y: 6, aboard: 'ship' });
    expect(policy(s)).toEqual({ type: 'goTo', unitId: 'ship', x: 6, y: 3 });
    const inPort = { ...s, units: { ...s.units, ship: { ...s.units['ship']!, x: 6, y: 3 }, m: { ...s.units['m']!, x: 6, y: 3 } } };
    const ashore = policy(inPort);
    expect(ashore).toMatchObject({ type: 'moveUnit', unitId: 'm' });
    expect(applyAction(inPort, ashore).state.units['m']).toMatchObject({ type: 'missionary', aboard: null });
  });

  it('once it has colonies enough, newcomers swell the ones it has', () => {
    let s = base('england');
    [[6, 1], [6, 4], [9, 6]].forEach(([x, y], i) => {
      s = withColony(s, { id: `c${i}`, x: x!, y: y!, name: `C${i}`, colonists: people(1, `p${i}`), construction: { kind: 'building', id: 'stockade' } });
    });
    s = withUnit(s, { id: 'u', x: 6, y: 1 });
    expect(policy(s)).toEqual({ type: 'joinColony', unitId: 'u' });
    const afield = withUnit(s, { id: 'u', x: 11, y: 2 });
    expect(policy(afield)).toMatchObject({ type: 'goTo', unitId: 'u' });
  });

  it('soldiers guard its colonies once it has a foothold', () => {
    let s = base();
    [[6, 1], [6, 4]].forEach(([x, y], i) => {
      s = withColony(s, { id: `c${i}`, x: x!, y: y!, name: `C${i}`, colonists: people(1, `p${i}`), construction: { kind: 'building', id: 'stockade' } });
    });
    const inside = withUnit(s, { id: 'g', type: 'soldier', x: 6, y: 1 });
    expect(policy(inside)).toEqual({ type: 'setOrders', unitId: 'g', orders: 'fortify' });
    const outside = withUnit(s, { id: 'g', type: 'soldier', x: 10, y: 5 });
    expect(policy(outside)).toMatchObject({ type: 'goTo', unitId: 'g' });
  });

  it('attacks only an enemy it is at war with, and only at scaled odds of twelve', () => {
    const facing = (theirs: Unit['type'], stance: 'war' | 'peace'): GameState => {
      let s = withColony(base(), { id: 'c0', x: 6, y: 1, name: 'C0', colonists: people(1), construction: { kind: 'building', id: 'stockade' } });
      s = withColony(s, { id: 'c1', x: 6, y: 5, name: 'C1', colonists: people(1, 'q'), construction: { kind: 'building', id: 'stockade' } });
      s = withUnit(withUnit(s, { id: 'g', type: 'dragoon', profession: 'veteranSoldier', x: 10, y: 3 }), { id: 'foe', owner: 'b', type: theirs, profession: theirs === 'artillery' ? null : 'freeColonist', x: 11, y: 3 });
      return patch(s, { stance: { b: stance } });
    };
    expect(policy(facing('colonist', 'war'))).toEqual({ type: 'attack', unitId: 'g', dx: 1, dy: 0 });
    expect(policy(facing('colonist', 'peace')).type).not.toBe('attack');
    const strong = facing('soldier', 'war');
    const dug = { ...strong, units: { ...strong.units, foe: { ...strong.units['foe']!, orders: 'fortified' as const, profession: 'veteranSoldier' as const } } };
    expect(policy(setTile(dug, 11, 3, { relief: 'hills' })).type).not.toBe('attack');
  });

  it('in Europe it sells its cargo, pays a passage when it can, and sails when someone is waiting', () => {
    let s = withUnit(base(), { id: 'ship', type: 'caravel', profession: null, x: 0, y: 0, cargo: { furs: 100 } });
    s = inEurope(s, 'ship');
    expect(policy(s)).toEqual({ type: 'sellGoods', unitId: 'ship', good: 'furs', amount: 100 });
    const empty = { ...s, units: { ...s.units, ship: { ...s.units['ship']!, cargo: {} } } };
    expect(policy(empty)).toEqual({ type: 'endTurn' }); // nobody to carry, nothing to pay with
    const rich = patch(empty, { gold: 5000, pool: ['pettyCriminal', 'expertFarmer', 'freeColonist'] });
    expect(policy(rich)).toEqual({ type: 'recruit', slot: 1 });
    const waiting = inEurope(withUnit(empty, { id: 'w', x: 0, y: 0, orders: 'sentry' }), 'w');
    expect(policy(waiting)).toEqual({ type: 'sailFromEurope', unitId: 'ship' });
  });

  it('an idle ship in the New World heads for the sea lane and then for Europe', () => {
    const s = patch(withUnit(base(), { id: 'ship', type: 'caravel', profession: null, x: 4, y: 3 }), { entry: [2, 3] });
    expect(policy(s)).toEqual({ type: 'goTo', unitId: 'ship', x: 2, y: 3 });
    const onLane = { ...s, units: { ...s.units, ship: { ...s.units['ship']!, x: 1, y: 3 } } };
    const sail = policy(onLane);
    expect(sail).toMatchObject({ type: 'moveUnit', unitId: 'ship', sail: true });
    expect(applyAction(onLane, sail).state.units['ship']?.voyage).toMatchObject({ phase: 'toEurope' });
  });

  it('ends the turn when there is nothing to do, and for nobody', () => {
    expect(policy(base())).toEqual({ type: 'endTurn' });
    expect(policy({ ...base(), over: { reason: 'retired', turn: 0, player: 'a' } })).toEqual({ type: 'endTurn' });
  });
});

describe('keeping house and keeping guard', () => {
  const village = (alarm: number): GameState['settlements'][string] => ({ id: 'v', tribe: 'sioux', x: 11, y: 5, capital: false, population: 2, growth: 0, taught: false, tributePaid: false, alarm: { a: alarm }, mission: null, scouted: [], lastBought: null, lastSold: null, haggleMemory: null });
  const settled = (pop: number, extra: Partial<Parameters<typeof withColony>[1]> = {}): GameState =>
    withColony(base(), { id: 'col', x: 6, y: 3, name: 'C', colonists: people(pop), buildings: ['townHall'], construction: { kind: 'building', id: 'stockade' }, goods: { food: 100 }, ...extra });

  it('arms a colonist on the docks while it has fewer soldiers than colonies', () => {
    let s = withUnit(settled(1), { id: 'ship', type: 'caravel', profession: null, x: 0, y: 0 });
    s = inEurope(withUnit(inEurope(s, 'ship'), { id: 'w', x: 0, y: 0 }), 'w');
    s = patch(s, { gold: 250 }); // enough for muskets, not for another passage
    expect(policy(s)).toEqual({ type: 'equipInEurope', unitId: 'w', role: 'soldier' });
    const guarded = withUnit(s, { id: 'g', type: 'soldier', x: 6, y: 3, orders: 'fortified' });
    expect(policy(guarded)).toEqual({ type: 'sailFromEurope', unitId: 'ship' });
    // a hostile people calls for more
    expect(policy({ ...guarded, turn: 120, settlements: { v: village(0) }, tribes: { sioux: { ...guarded.tribes.sioux!, alarm: { a: 80 } } } })).toEqual({ type: 'equipInEurope', unitId: 'w', role: 'soldier' });
  });

  it('a soldier brought into port goes ashore as a soldier and is not put to work', () => {
    let s = settled(1);
    s = withColony(s, { id: 'c2', x: 6, y: 6, name: 'D', colonists: people(1, 'q'), construction: { kind: 'building', id: 'stockade' } });
    s = withUnit(s, { id: 'ship', type: 'caravel', profession: null, x: 6, y: 3 });
    s = withUnit(s, { id: 'g', type: 'soldier', x: 6, y: 3, aboard: 'ship' });
    const step = policy(s);
    expect(step).toMatchObject({ type: 'moveUnit', unitId: 'g' });
    expect(applyAction(s, step).state.units['g']).toMatchObject({ type: 'soldier', aboard: null });
  });

  it('a spare soldier marches on the settlement of a people that has turned on us; a lone guard stays', () => {
    let s = settled(1);
    s = withColony(s, { id: 'c2', x: 6, y: 6, name: 'D', colonists: people(1, 'q'), construction: { kind: 'building', id: 'stockade' } });
    s = { ...s, turn: 120, settlements: { v: village(0) }, tribes: { sioux: { ...s.tribes.sioux!, alarm: { a: 80 } } } }; // after 1600: no wagon train is thought of
    const lone = withUnit(s, { id: 'g1', type: 'soldier', x: 6, y: 3 });
    expect(policy(lone)).toEqual({ type: 'setOrders', unitId: 'g1', orders: 'fortify' });
    const guarded = withUnit(s, { id: 'g0', type: 'soldier', x: 6, y: 6, orders: 'fortified' });
    const two = withUnit(withUnit(guarded, { id: 'g1', type: 'soldier', x: 6, y: 3, orders: 'fortified' }), { id: 'g2', type: 'soldier', x: 6, y: 3 });
    // (with the other colony unguarded, its defence would come first)
    expect(policy(withUnit(withUnit(s, { id: 'g1', type: 'soldier', x: 6, y: 3, orders: 'fortified' }), { id: 'g2', type: 'soldier', x: 6, y: 3 }))).toEqual({ type: 'goTo', unitId: 'g2', x: 6, y: 6 });
    const march = policy(two) as { type: string; unitId: string; x: number; y: number };
    expect(march.type).toBe('goTo');
    expect(Math.max(Math.abs(march.x - 11), Math.abs(march.y - 5))).toBe(1); // a square beside the settlement
    // with the people calm again nobody marches
    expect(policy({ ...two, tribes: { sioux: { ...two.tribes.sioux!, alarm: { a: 20 } } } }).type).not.toBe('goTo');
  });
});

describe('reprisal and footholds', () => {
  const village = (alarm: number): GameState['settlements'][string] => ({ id: 'v', tribe: 'sioux', x: 11, y: 5, capital: false, population: 2, growth: 0, taught: false, tributePaid: false, alarm: { a: alarm }, mission: null, scouted: [], lastBought: null, lastSold: null, haggleMemory: null });
  /** Two colonies, two soldiers in the first, and the Sioux at the given tribal alarm, for the given nation. */
  // (after 1600 by default, so that no colony thinks of building a wagon train for them)
  const guarded = (nation: 'england' | 'spain' | 'netherlands', tribal: number, turn = 120): GameState => {
    let s: GameState = { ...world({ rows: ROWS, players: [{ id: 'a', kind: 'ai', nation }, { id: 'b', kind: 'ai', nation: 'france' }] }), turn };
    s = withColony(s, { id: 'col', x: 6, y: 3, name: 'C', colonists: people(1), construction: { kind: 'building', id: 'stockade' } });
    s = withColony(s, { id: 'c2', x: 6, y: 6, name: 'D', colonists: people(1, 'q'), construction: { kind: 'building', id: 'stockade' } });
    s = withUnit(withUnit(s, { id: 'g1', type: 'soldier', x: 6, y: 3, orders: 'fortified' }), { id: 'g2', type: 'soldier', x: 6, y: 3 });
    s = withUnit(s, { id: 'g0', type: 'soldier', x: 6, y: 6, orders: 'fortified' }); // the second colony has its guard
    return { ...s, settlements: { v: village(0) }, tribes: { sioux: { ...s.tribes.sioux!, alarm: { a: tribal } } } };
  };
  const marches = (s: GameState): boolean => policy(s).type === 'goTo';

  it('a spare soldier marches on a people only once its alarm reaches 75, whatever the leader\'s temperament', () => {
    // tribal alarm 30 is "restless", 55 "angry", 80 "at war"
    for (const nation of ['spain', 'england', 'netherlands'] as const) {
      expect([30, 55, 74, 75, 80].map((alarm) => marches(guarded(nation, alarm)))).toEqual([false, false, false, true, true]);
    }
    // unprovoked conquest is no longer part of the policy, however late the year
    expect(marches(guarded('spain', 0, 300))).toBe(false);
  });

  it('a power still without a colony after some turns founds one where its settlers stand, if the ground allows', () => {
    // far inland: no port, so not a site it would choose
    const inland = (turn: number): GameState => ({ ...withUnit(base(), { id: 'u', x: 10, y: 3, movesLeft: 0 }), turn });
    expect(siteScore(inland(0), 10, 3)).toBe(0);
    expect(policy(inland(AI_PLAN.firstColonyAnywhereFrom - 1)).type).not.toBe('foundColony');
    expect(policy(inland(AI_PLAN.firstColonyAnywhereFrom))).toEqual({ type: 'foundColony', unitId: 'u' });
    // with a colony already it keeps looking for a proper site
    const settled = withColony(inland(AI_PLAN.firstColonyAnywhereFrom), { id: 'col', x: 6, y: 6, name: 'C', colonists: people(1), construction: { kind: 'building', id: 'stockade' } });
    expect(policy(settled).type).not.toBe('foundColony');
  });

  it('a ship does not wait beside a landing square somebody else is standing on', () => {
    let s = withUnit(base(), { id: 'ship', type: 'caravel', profession: null, x: 5, y: 3 });
    s = withUnit(s, { id: 'u', x: 5, y: 3, aboard: 'ship' });
    expect(policy(s)).toMatchObject({ type: 'moveUnit', unitId: 'u' }); // ashore at once
    // every square of the shore beside her is taken
    for (const y of [2, 3, 4]) s = withUnit(s, { id: `x${y}`, owner: 'b', type: 'soldier', x: 6, y });
    const next = policy(s);
    expect(next).toMatchObject({ type: 'goTo', unitId: 'ship' }); // she sails for another place
  });
});

describe('playing a turn', () => {
  it('always hands the turn on, every action it took being a valid one', () => {
    let s = withUnit(base(), { id: 'ship', type: 'caravel', profession: null, x: 2, y: 3 });
    s = withUnit(withUnit(s, { id: 'u', x: 2, y: 3, aboard: 'ship' }), { id: 'v', type: 'soldier', x: 2, y: 3, aboard: 'ship' });
    let state = s;
    for (let i = 0; i < 30; i++) {
      const before = state;
      const turn = playTurn(state);
      expect(turn.state.current).not.toBe(before.current);
      expect(turn.actions.at(-1)).toEqual({ type: 'endTurn' });
      let check = before;
      for (const action of turn.actions) {
        expect(validateAction(check, action).ok, JSON.stringify(action)).toBe(true);
        check = applyAction(check, action).state;
      }
      expect(check).toEqual(turn.state);
      expect(checkInvariants(turn.state)).toEqual([]);
      state = turn.state;
    }
    // within a few turns the party has landed and founded its colonies
    expect(Object.values(state.colonies).filter((c) => c.owner === 'a').length).toBeGreaterThanOrEqual(2);
  });

  it('a march that is blocked is stepped around rather than repeated', () => {
    // the only way to the site lies through a square a foreign unit holds
    let s = withUnit(base(), { id: 'u', x: 10, y: 3 });
    for (const [x, y] of [[9, 2], [9, 3], [9, 4]] as const) s = withUnit(s, { id: `b${y}`, owner: 'b', type: 'soldier', x, y });
    const turn = playTurn(patch(s, { stance: { b: 'peace' } }));
    expect(turn.actions.length).toBeLessThan(8);
    expect(turn.actions.at(-1)).toEqual({ type: 'endTurn' });
  });

  it('four powers play a generated world for twenty turns without a hitch, and the log replays', () => {
    const options = { seed: 21, world: DEFAULT_WORLD, players: NATION_IDS.map((nation) => ({ id: nation, name: nation, kind: 'ai' as const, nation })) };
    let state = createGame(options);
    const log = [];
    while (state.turn < 20) {
      const turn = playTurn(state);
      log.push(...turn.actions);
      state = turn.state;
      expect(checkInvariants(state)).toEqual([]);
    }
    expect(Object.keys(state.colonies).length).toBeGreaterThanOrEqual(4);
    expect(replay(options, log)).toEqual(state);
  });
});
