import { describe, expect, it } from 'vitest';
import { applyAction, listValidActions, validateAction, type Action, type GameEvent } from '../../../src/engine/actions';
import { INDEPENDENCE } from '../../../src/engine/data/independence';
import { crownTurn, declareIndependence, interventionBells, interventionForce, landingNeed, musterContinentals, warBells, type IndependenceEvent } from '../../../src/engine/independence';
import { checkInvariants } from '../../../src/engine/invariants';
import { rebelSentiment } from '../../../src/engine/liberty';
import { OFF_MAP, type Colonist, type Colony, type GameState, type Player, type Unit } from '../../../src/engine/state';
import { withColony, withUnit, world } from '../../helpers/world';

// an island with sea all round and the sea lane at its eastern edge
const ROWS = ['~~~~~~~~~~~~', '~~~~~~~~~~ss', '~~......~~ss', '~~......~~ss', '~~......~~ss', '~~......~~ss', '~~~~~~~~~~ss', '~~~~~~~~~~~~'];
const people = (n: number, p = 'c'): Colonist[] => Array.from({ length: n }, (_, i) => ({ id: `${p}${i}`, profession: 'freeColonist' as const, job: { kind: 'idle' as const }, turns: 0 }));
const me = (s: GameState): Player => s.players[0] as Player;
const patch = (s: GameState, change: Partial<Player>, id = 'a'): GameState => ({ ...s, players: s.players.map((p) => (p.id === id ? { ...p, ...change } : p)) });
const code = (s: GameState, a: Action): string => {
  const v = validateAction(s, a);
  return v.ok ? 'ok' : v.error.code;
};
const of = <T extends GameEvent['type']>(events: readonly GameEvent[], type: T): Extract<GameEvent, { type: T }>[] => events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);

/** A rebel power with one colony of `pop` at `sol` per cent, and three rivals (or none). */
function colonies(sol = 60, pop = 4, rivals = true, difficulty: GameState['difficulty'] = 'conquistador'): GameState {
  const players = rivals
    ? [{ id: 'a' }, { id: 'b', kind: 'ai' as const }, { id: 'c', kind: 'ai' as const }, { id: 'd', kind: 'ai' as const }]
    : [{ id: 'a' }];
  let s = world({ rows: ROWS, players, difficulty });
  s = withColony(s, { id: 'home', x: 2, y: 3, name: 'Home', colonists: people(pop), sol: { n: sol * (pop + 1), d: 100 * (pop + 1) }, buildings: ['townHall'] });
  if (rivals) {
    // b is the smallest, d the largest
    s = withColony(s, { id: 'cb', owner: 'b', x: 7, y: 2, name: 'B', colonists: people(1, 'b') });
    s = withColony(s, { id: 'cc', owner: 'c', x: 7, y: 5, name: 'C', colonists: people(3, 'x') });
    s = withColony(s, { id: 'cd', owner: 'd', x: 5, y: 5, name: 'D', colonists: people(6, 'y') });
    s = withUnit(s, { id: 'cs', owner: 'c', type: 'soldier', x: 7, y: 5 });
    s = withUnit(s, { id: 'ds', owner: 'd', type: 'frigate', profession: null, x: 5, y: 6 });
  }
  return s;
}
const declare = (s: GameState): { state: GameState; events: readonly GameEvent[] } => applyAction(s, { type: 'declareIndependence' });
/** The act alone, without the turn that follows it. */
const proclaim = (s: GameState): GameState => declareIndependence(s, 'a', []);

describe('independence table', () => {
  it('matches the snapshot', () => {
    expect(INDEPENDENCE).toMatchSnapshot();
  });
});

describe('declaring', () => {
  it('needs half the colonists behind it, and can be done only once', () => {
    expect(rebelSentiment(colonies(49), 'a')).toBe(49);
    expect(code(colonies(49), { type: 'declareIndependence' })).toBe('tooTory');
    expect(code(colonies(50), { type: 'declareIndependence' })).toBe('ok');
    expect(listValidActions(colonies(50))).toContainEqual({ type: 'declareIndependence' });
    expect(listValidActions(colonies(49))).not.toContainEqual({ type: 'declareIndependence' });
    const after = declare(colonies(60)).state;
    expect(code(after, { type: 'declareIndependence' })).toBe('alreadyDeclared');
  });

  it('settles the succession, sends the other powers home and makes the absorbed power the Crown', () => {
    const { state, events } = declare(colonies(60));
    // b was the smallest: it is absorbed by c, and its place is the Crown's
    expect(of(events, 'succession')[0]).toMatchObject({ loser: 'b', heir: 'c' });
    expect(state.crownPlayer).toBe('b');
    expect(of(events, 'independenceDeclared')[0]).toEqual({ type: 'independenceDeclared', player: 'a', crown: 'b', friend: 'c', sentiment: 60 });
    expect(me(state)).toMatchObject({ atWar: true, stance: { b: 'war', c: 'peace', d: 'peace' } });
    expect(me(state).revolution).toMatchObject({ declaredTurn: 0, sentiment: 60, friend: 'c', patron: 'd', mustered: true, intervened: false });
    expect(state.players.filter((p) => p.withdrawn).map((p) => p.id)).toEqual(['b', 'c', 'd']);
    expect(of(events, 'powerWithdrew')).toEqual([{ type: 'powerWithdrew', player: 'c', units: 1, lost: { muskets: 50 } }, { type: 'powerWithdrew', player: 'd', units: 1, lost: {} }]);
    // their units are gone, their colonies stand empty of purpose
    expect(Object.values(state.units).filter((u) => u.owner === 'c' || u.owner === 'd')).toEqual([]);
    expect(Object.values(state.colonies).map((c) => c.owner).sort()).toEqual(['a', 'c', 'c', 'd']);
    expect(checkInvariants(state)).toEqual([]);
  });

  it('ends the turn, and the turn comes straight back to the rebels', () => {
    const before = withUnit(colonies(60), { id: 'u', x: 4, y: 3 });
    const { state, events } = declare(before);
    expect(state.current).toBe(0);
    expect(state.turn).toBe(1);
    expect(of(events, 'playerTurnStarted').map((e) => e.player)).toEqual(['a']);
    expect(state.units['u']?.movesLeft).toBeGreaterThan(0); // a fresh turn
  });

  it('with no other power in the game the Crown gets a place of its own', () => {
    const { state } = declare(colonies(60, 4, false));
    expect(state.crownPlayer).toBe('crown');
    expect(state.players.map((p) => [p.id, p.withdrawn])).toEqual([['a', false], ['crown', true]]);
    expect(me(state).revolution).toMatchObject({ friend: null, patron: null });
    expect(me(state).stance).toEqual({ crown: 'war' });
    expect(checkInvariants(state)).toEqual([]);
    // and the game goes on, turn after turn
    const next = applyAction(state, { type: 'endTurn' }).state;
    expect(next.turn).toBe(2);
    expect(next.current).toBe(0);
  });

  it('whatever lies in Europe or on the ocean is seized; what is in the New World is not', () => {
    const away = (s: GameState, id: string, phase: 'inEurope' | 'toEurope' | 'toNewWorld'): GameState => ({ ...s, units: { ...s.units, [id]: { ...(s.units[id] as Unit), x: OFF_MAP, y: OFF_MAP, voyage: { phase, turnsLeft: 1, origin: [10, 3] } } } });
    let s = colonies(60);
    s = away(withUnit(s, { id: 'docked', type: 'galleon', profession: null, x: 0, y: 0, cargo: { muskets: 100 } }), 'docked', 'inEurope');
    s = away(withUnit(s, { id: 'sailing', type: 'caravel', profession: null, x: 0, y: 0 }), 'sailing', 'toNewWorld');
    s = away(withUnit(s, { id: 'waiting', type: 'soldier', x: 0, y: 0 }), 'waiting', 'inEurope');
    s = withUnit(s, { id: 'here', type: 'caravel', profession: null, x: 9, y: 5 });
    const { state, events } = declare(s);
    expect(Object.keys(state.units).filter((id) => ['docked', 'sailing', 'waiting', 'here'].includes(id))).toEqual(['here']);
    expect(of(events, 'unitsSeized')[0]).toEqual({ type: 'unitsSeized', player: 'a', ships: ['galleon', 'caravel'], others: 1, lost: { muskets: 150 } });
  });

  it('closes Europe, and forbids new colonies', () => {
    let s = withUnit(colonies(60), { id: 'ship', type: 'caravel', profession: null, x: 10, y: 3 });
    s = withUnit(s, { id: 'settler', x: 5, y: 2 });
    const sail: Action = { type: 'moveUnit', unitId: 'ship', dx: 1, dy: 0, sail: true };
    expect(code(s, sail)).toBe('ok');
    const { state } = declare(patch(s, { gold: 5000 }));
    expect(code(state, sail)).toBe('europeClosed');
    expect(code(state, { type: 'recruit', slot: 0 })).toBe('europeClosed');
    expect(code(state, { type: 'purchaseUnit', unit: 'artillery' })).toBe('europeClosed');
    expect(code(state, { type: 'foundColony', unitId: 'settler' })).toBe('atWarNoFounding');
  });
});

describe('the Continental Army', () => {
  const garrison = (sol: number, pop: number): GameState => {
    let s = colonies(sol, pop);
    for (let i = 0; i < 4; i++) s = withUnit(s, { id: `v${i}`, type: i === 3 ? 'dragoon' : 'soldier', profession: 'veteranSoldier', x: 2, y: 3 });
    return withUnit(s, { id: 'green', type: 'soldier', x: 2, y: 3 });
  };
  const types = (s: GameState): string[] => ['v0', 'v1', 'v2', 'v3', 'green'].map((id) => s.units[id]?.type ?? '-');

  it('musters as the rebels\' next turn begins: veterans in a colony take Continental colours', () => {
    // 8 colonists at 100%: floor(8 x 50 / 50) = 8, but no more than half the colony
    const events: IndependenceEvent[] = [];
    const formed = musterContinentals(proclaim(garrison(100, 8)), 'a', events);
    expect(types(formed)).toEqual(['continentalArmy', 'continentalArmy', 'continentalArmy', 'continentalCavalry', 'soldier']);
    expect(events).toEqual([{ type: 'continentalsMustered', player: 'a', colonyId: 'home', unitIds: ['v0', 'v1', 'v2', 'v3'] }]);
    // in play it happens by itself when the next turn opens
    const played = declare(garrison(100, 8));
    expect(of(played.events, 'continentalsMustered')).toHaveLength(1);
    expect(types(played.state).filter((t) => t.startsWith('continental')).length).toBeGreaterThanOrEqual(3);
    expect(me(played.state).revolution?.mustered).toBe(true);
  });

  it('in numbers that follow the membership, at least one, and none below half', () => {
    // 8 colonists at 75%: floor(8 x 25 / 50) = 4, capped at 4; at 60%: floor(8 x 10 / 50) = 1
    const mustered = (sol: number, pop: number): number => types(musterContinentals(proclaim(garrison(sol, pop)), 'a', [])).filter((t) => t.startsWith('continental')).length;
    expect(mustered(75, 8)).toBe(4);
    expect(mustered(60, 8)).toBe(1);
    expect(mustered(50, 8)).toBe(1);
    expect(mustered(88, 4)).toBe(2);
    expect(mustered(49, 8)).toBe(0);
    // a second colony that is mostly Tory gives nobody, though the nation as a whole declared
    let s = garrison(100, 8);
    s = withColony(s, { id: 'tory', x: 4, y: 5, name: 'Tory', colonists: people(2, 't'), sol: { n: 0, d: 300 } });
    s = withUnit(s, { id: 'tv', type: 'soldier', profession: 'veteranSoldier', x: 4, y: 5 });
    expect(declare(s).state.units['tv']?.type).toBe('soldier');
  });

  it('only once', () => {
    const state = musterContinentals(proclaim(garrison(100, 8)), 'a', []);
    const again = withUnit(state, { id: 'late', type: 'soldier', profession: 'veteranSoldier', x: 2, y: 3 });
    const events: IndependenceEvent[] = [];
    expect(musterContinentals(again, 'a', events)).toBe(again);
    expect(events).toEqual([]);
  });
});

describe('foreign intervention', () => {
  it('takes a number of bells that rises with the difficulty', () => {
    expect((['discoverer', 'explorer', 'conquistador', 'governor', 'viceroy'] as const).map((d) => interventionBells(colonies(60, 4, true, d)))).toEqual([2000, 3500, 5000, 6500, 8000]);
  });

  it('a small friend sends the standing force for the level', () => {
    const force = (d: GameState['difficulty']): number[] => {
      const f = interventionForce(colonies(60, 4, false, d), null);
      return [f.infantry, f.cavalry, f.artillery, f.ships];
    };
    expect(force('discoverer')).toEqual([4, 2, 3, 3]);
    expect(force('explorer')).toEqual([4, 1, 2, 2]);
    expect(force('conquistador')).toEqual([3, 1, 2, 2]);
    expect(force('governor')).toEqual([3, 1, 2, 2]);
    expect(force('viceroy')).toEqual([2, 1, 2, 2]);
  });

  it('a larger friend sends more', () => {
    let s = colonies(60);
    s = withColony(s, { id: 'big', owner: 'c', x: 5, y: 2, name: 'Big', colonists: people(40, 'z') });
    for (let i = 0; i < 3; i++) s = withUnit(s, { id: `p${i}`, owner: 'c', type: 'privateer', profession: null, x: 8, y: 2 });
    const f = interventionForce(s, 'c');
    expect(f.ships).toBe(4); // (1 + 3 + 3 + 1) / 2
    expect(f.infantry).toBe(5); // (8 - 2 + 4 + 1) / 2
    // its soldier in the field (c's own colony does not count as the field) adds to the horse
    expect(f.cavalry).toBe(1);
    const afield = withUnit(withUnit(s, { id: 'f1', owner: 'c', type: 'dragoon', x: 6, y: 3 }), { id: 'f2', owner: 'c', type: 'dragoon', x: 6, y: 3 });
    expect(interventionForce(afield, 'c').cavalry).toBe(3); // strength 2 x 3 x 8 = 48, so (1 + 1 + 3 + 1) / 2
  });

  it('the rebels are told what it will take with the first bells rung after the Declaration', () => {
    const s = proclaim(colonies(100, 4));
    const events: IndependenceEvent[] = [];
    const rung = warBells(s, 'a', 7, events);
    expect(events).toEqual([{ type: 'interventionConsidered', player: 'a', friend: 'c', bells: 5000 }]);
    expect(me(rung).revolution).toMatchObject({ bells: 7, considered: true, intervened: false });
    const again = warBells(rung, 'a', 5, events);
    expect(events).toHaveLength(1);
    expect(me(again).revolution?.bells).toBe(12);
    expect(warBells(again, 'a', 0, events)).toBe(again);
  });

  it('in play the bells of the colonies go to that count and no longer to the Congress', () => {
    let s = colonies(100, 4);
    s = { ...s, colonies: { ...s.colonies, home: { ...(s.colonies['home'] as Colony), colonists: people(4).map((c, i): Colonist => (i === 0 ? { ...c, job: { kind: 'work', trade: 'statesman' } } : c)) } } };
    const fathers = me(s).fatherBells;
    const { state, events } = declare(s);
    expect(of(events, 'interventionConsidered')).toHaveLength(1);
    expect(me(state).revolution?.bells).toBeGreaterThan(0);
    expect(me(state).fatherBells).toBe(fathers);
  });

  it('when the count is reached the friend comes in, and the count starts again', () => {
    const s = proclaim(colonies(100, 4));
    const events: IndependenceEvent[] = [];
    const nearly = warBells(s, 'a', 4999, events);
    expect(me(nearly).revolution?.intervened).toBe(false);
    const there = warBells(nearly, 'a', 3, events);
    expect(events.at(-1)).toEqual({ type: 'interventionBegan', player: 'a', friend: 'c' });
    expect(me(there).revolution).toMatchObject({ intervened: true, bells: 0 });
    // afterwards it is only a tally
    const later = warBells(there, 'a', 9000, events);
    expect(me(later).revolution).toMatchObject({ intervened: true, bells: 9000 });
    expect(events.filter((e) => e.type === 'interventionBegan')).toHaveLength(1);
    // with nobody left to be a friend, no number of bells brings anyone
    const alone = warBells(proclaim(colonies(100, 4, false)), 'a', 99999, events);
    expect(me(alone).revolution?.intervened).toBe(false);
  });
});

describe('the Expeditionary Force', () => {
  const crownUnits = (s: GameState): Unit[] => Object.values(s.units).filter((u) => u.owner === s.crownPlayer);
  const count = (s: GameState, type: Unit['type']): number => crownUnits(s).filter((u) => u.type === type).length;

  it('lands beside a port in the turn of the Declaration: a Man-of-War offshore and three to six units on the beach', () => {
    const before = colonies(60);
    const { state, events } = declare(before);
    const wave = of(events, 'refLanded')[0]!;
    expect(wave).toMatchObject({ player: 'a', colonyId: 'home', last: false });
    expect(wave.unitIds.length).toBeGreaterThanOrEqual(3);
    expect(wave.unitIds.length).toBeLessThanOrEqual(6);
    const ship = state.units[wave.shipId] as Unit;
    expect(ship).toMatchObject({ type: 'manOWar', owner: 'b' });
    for (const id of wave.unitIds) {
      const u = state.units[id] as Unit;
      expect(Math.max(Math.abs(u.x - 2), Math.abs(u.y - 3))).toBe(1); // beside the colony
      expect(Math.max(Math.abs(u.x - ship.x), Math.abs(u.y - ship.y))).toBe(1); // and beside the ship
      expect(u.movesLeft).toBe(0);
    }
    // what landed came out of the force in being
    const was = me(before).ref;
    const now = me(state).ref;
    expect(was.regulars - now.regulars).toBe(count(state, 'regular'));
    expect(was.cavalry - now.cavalry).toBe(count(state, 'cavalry'));
    expect(was.artillery - now.artillery).toBe(count(state, 'artillery'));
    expect(now.ships).toBe(was.ships - 1);
    expect(count(state, 'cavalry')).toBeLessThanOrEqual(2);
    expect(count(state, 'artillery')).toBeLessThanOrEqual(2);
    expect(checkInvariants(state)).toEqual([]);
  });

  it('keeps coming: each ship goes home for more, until the force is spent', () => {
    const start = me(colonies(60)).ref;
    let s = proclaim(colonies(60));
    let waves = 0;
    let sawLast = false;
    for (let i = 0; i < 80 && !sawLast; i++) {
      const events: GameEvent[] = [];
      s = crownTurn(s, 'a', events);
      for (const wave of of(events, 'refLanded')) {
        waves++;
        sawLast = wave.last;
      }
      expect(checkInvariants(s)).toEqual([]);
    }
    expect(sawLast).toBe(true);
    expect(waves).toBeGreaterThan(8);
    expect(me(s).ref).toEqual({ regulars: 0, cavalry: 0, artillery: 0, ships: 0 });
    // everything but a last handful came ashore
    expect(count(s, 'regular') + count(s, 'cavalry') + count(s, 'artillery')).toBeGreaterThan(start.regulars + start.cavalry + start.artillery - INDEPENDENCE.lastWaveBelow);
  });

  it('with no ship to hand one is fitted out, and nothing lands that turn', () => {
    const s = patch(declare(colonies(60)).state, { ref: { regulars: 10, cavalry: 0, artillery: 0, ships: 0 } });
    const none = { ...s, units: Object.fromEntries(Object.entries(s.units).filter(([, u]) => u.type !== 'manOWar')) };
    const events: IndependenceEvent[] = [];
    const next = crownTurn(none, 'a', events);
    expect(events).toEqual([]);
    expect(me(next).ref.ships).toBe(1);
    expect(of(crownTurnEvents(next), 'refLanded')).toHaveLength(1);
  });

  it('a stronger garrison and better works call for more', () => {
    const s = colonies(60);
    const bare = landingNeed(s, s.colonies['home'] as Colony, 'b');
    expect(bare).toBe(1);
    let held = withUnit(s, { id: 'g1', type: 'soldier', profession: 'veteranSoldier', x: 2, y: 3 });
    held = withUnit(held, { id: 'g2', type: 'artillery', profession: null, x: 2, y: 3 });
    const home = { ...(held.colonies['home'] as Colony), goods: { muskets: 250 } };
    // 1 + 3 for the muskets + 1 (veteran soldier: 2 x 8 x 1.5 = 24 >> 4) + 2 (artillery: 5 x 8 = 40 >> 4)
    expect(landingNeed(held, home, 'b')).toBe(7);
    expect(landingNeed(held, { ...home, buildings: ['stockade', 'fort'] }, 'b')).toBe(10);
    expect(landingNeed(held, { ...home, buildings: ['stockade', 'fort', 'fortress'] }, 'b')).toBe(14);
    // the King's men already at the gate are counted off
    expect(landingNeed(withUnit(held, { id: 'r', owner: 'b', type: 'regular', profession: null, x: 3, y: 3 }), home, 'b')).toBe(6);
  });

  it('a rebel ship lying where the Man-of-War anchors is lost, and so is anyone on the beach', () => {
    let s = colonies(60);
    for (const [x, y] of [[1, 2], [1, 3], [1, 4], [2, 1], [3, 1]] as const) s = withUnit(s, { id: `ship${x}${y}`, type: 'caravel', profession: null, x, y, cargo: { furs: 10 } });
    for (const [x, y] of [[2, 2], [3, 2], [3, 3], [3, 4], [2, 4]] as const) s = withUnit(s, { id: `man${x}${y}`, x, y });
    const { state, events } = declare(s);
    const wave = of(events, 'refLanded')[0]!;
    const ship = state.units[wave.shipId] as Unit;
    expect(of(events, 'shipSunk').map((e) => e.unitId)).toEqual([`ship${ship.x}${ship.y}`]);
    const overrun = of(events, 'unitOverrun').map((e) => e.unitId);
    expect(overrun.length).toBeGreaterThan(0);
    for (const id of overrun) expect(state.units[id]).toBeUndefined();
    for (const id of wave.unitIds) expect(Object.values(state.units).filter((u) => u.x === state.units[id]!.x && u.y === state.units[id]!.y).every((u) => u.owner === 'b')).toBe(true);
  });

  it('a power with no port is left alone by the fleet', () => {
    let s = world({ rows: ROWS, players: [{ id: 'a' }] });
    s = withColony(s, { id: 'home', x: 4, y: 3, name: 'Inland', colonists: people(4), sol: { n: 400, d: 500 } });
    const { state, events } = declare(s);
    expect(of(events, 'refLanded')).toEqual([]);
    expect(Object.values(state.units).filter((u) => u.owner === 'crown')).toEqual([]);
  });
});

/** The events of one more Crown move. */
function crownTurnEvents(state: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  crownTurn(state, 'a', events);
  return events;
}

describe('Tory uprisings', () => {
  /** A war in which the fleet has nothing more to send. */
  const spent = (sol: number, pop: number, seed = 1): GameState => {
    const s = proclaim(colonies(sol, pop, false));
    return patch({ ...s, seed }, { ref: { regulars: 0, cavalry: 0, artillery: 0, ships: 0 } });
  };
  const rising = (s: GameState): { state: GameState; events: readonly GameEvent[] } => {
    // the roll is against the difficulty; try turns until it comes up
    let state = s;
    for (let i = 0; i < 20; i++) {
      const events: GameEvent[] = [];
      state = crownTurn(state, 'a', events);
      if (events.length > 0) return { state, events };
    }
    return { state, events: [] };
  };

  it('arm loyal colonists outside a colony where the rebels are weak, once', () => {
    // 6 colonists at 50%: floor(2 x 6 x 50 / 100) + 2 + 1 = 9 rise
    const { state, events } = rising(spent(50, 6));
    const up = of(events, 'toryUprising')[0]!;
    expect(up).toMatchObject({ player: 'a', colonyId: 'home' });
    expect(up.unitIds).toHaveLength(9);
    for (const id of up.unitIds) {
      const u = state.units[id] as Unit;
      expect(u.owner).toBe('crown');
      expect(['soldier', 'dragoon']).toContain(u.type);
      expect(Math.max(Math.abs(u.x - 2), Math.abs(u.y - 3))).toBe(1);
    }
    expect(me(state).revolution?.uprisings).toEqual(['home']);
    expect(rising(state).events).toEqual([]);
    expect(checkInvariants(state)).toEqual([]);
  });

  it('a garrison keeps them down', () => {
    let s = spent(50, 2); // 2 + 3 = 5 would rise
    expect(of(rising(s).events, 'toryUprising')[0]?.unitIds).toHaveLength(5);
    s = withUnit(withUnit(s, { id: 'g1', type: 'artillery', profession: null, x: 2, y: 3 }), { id: 'g2', type: 'artillery', profession: null, x: 2, y: 3 });
    expect(rising(s).events).toEqual([]); // 5 - 10 defence
  });

  it('not while the King\'s men stand at the gate, nor while the fleet still has men to land', () => {
    const s = spent(50, 6);
    expect(rising(withUnit(s, { id: 'r', owner: 'crown', type: 'regular', profession: null, x: 3, y: 3 })).events).toEqual([]);
    const more = crownTurnEvents(patch(s, { ref: { regulars: 5, cavalry: 0, artillery: 0, ships: 1 } }));
    expect(of(more, 'toryUprising')).toEqual([]);
  });
});
