import { describe, expect, it } from 'vitest';
import { applyAction } from '../../../src/engine/actions';
import {
  adjustTribalAlarm, alarmSource, attitude, isHostile, meetTribe, militaryPresence, nativesTurn, settlementTurn, tribalAlarm, type AlarmEvent,
} from '../../../src/engine/alarm';
import { ALARM, BUILDING_ALARM, MISSION_ALARM } from '../../../src/engine/data/alarm';
import { settlementPopulation } from '../../../src/engine/data/tribes';
import type { DIFFICULTIES } from '../../../src/engine/data/yields';
import { checkInvariants } from '../../../src/engine/invariants';
import { createRng } from '../../../src/engine/rng';
import type { Colonist, GameState, Settlement, TribeState, Unit } from '../../../src/engine/state';
import { withColony, withUnit, world } from '../../helpers/world';

type Level = (typeof DIFFICULTIES)[number];
const ROWS = Array.from({ length: 14 }, (_, y) => (y === 0 || y === 13 ? '~'.repeat(16) : `~${'.'.repeat(14)}~`));
const people = (n: number): Colonist[] => Array.from({ length: n }, (_, i) => ({ id: `c${i}`, profession: 'freeColonist' as const, job: { kind: 'idle' as const }, turns: 0 }));
const village = (id: string, tribe: Settlement['tribe'], x: number, y: number, extra: Partial<Settlement> = {}): Settlement => ({
  id, tribe, x, y, capital: false, population: settlementPopulation(tribe, false).start, growth: 0, taught: false, tributePaid: false,
  alarm: {}, mission: null, scouted: [], lastBought: null, lastSold: null, haggleMemory: null, ...extra,
});
const record = (extra: Partial<TribeState> = {}): TribeState => ({ alarm: {}, goodwill: {}, met: ['a', 'b'], muskets: 0, horses: 0, breeding: 0, silver: 0, peace: [], landSold: 0, grudge: [], joinedCrown: false, visited: {}, stock: {}, ...extra });

function land(opts: { difficulty?: Level; nation?: 'england' | 'france'; fathers?: string[]; kind?: 'human' | 'ai'; tribe?: Partial<TribeState>; village?: Partial<Settlement> } = {}): GameState {
  const s = world({ rows: ROWS, difficulty: opts.difficulty ?? 'conquistador', players: [{ id: 'a', nation: opts.nation ?? 'england', fathers: opts.fathers ?? [], kind: opts.kind ?? 'human' }, { id: 'b', nation: 'spain' }] });
  // the settlement's brave is out hunting, far from everything these tests measure
  const brave: Unit = { id: 'brave-v', owner: 'tribe:cherokee', type: 'brave', profession: null, x: 1, y: 12, movesLeft: 0, orders: 'none', destination: null, aboard: null, cargo: {}, tools: 0, workTurns: 0, route: null, repair: 0, treasure: 0, voyage: null };
  return { ...s, units: { 'brave-v': brave }, settlements: { v: village('v', 'cherokee', 7, 7, opts.village) }, tribes: { cherokee: record(opts.tribe) } };
}
const adjust = (s: GameState, delta: number, seed = 1): { state: GameState; events: AlarmEvent[] } => {
  const events: AlarmEvent[] = [];
  return { state: adjustTribalAlarm(s, 'cherokee', 'a', delta, createRng(seed), events), events };
};
const colony = (s: GameState, x: number, y: number, pop: number, buildings: string[] = [], owner = 'a'): GameState =>
  withColony(s, { id: `col${x}-${y}`, owner, x, y, name: `C${x}${y}`, colonists: people(pop).map((c) => ({ ...c, id: `${x}-${y}-${c.id}` })), buildings });
const T = (s: GameState): number => tribalAlarm(s, 'cherokee', 'a');
const S = (s: GameState, id = 'v'): number => s.settlements[id]?.alarm['a'] ?? 0;
const G = (s: GameState): number => s.tribes.cherokee?.goodwill['a'] ?? 0;

describe('alarm tables', () => {
  it('match the snapshot', () => {
    expect({ ALARM, BUILDING_ALARM, MISSION_ALARM }).toMatchSnapshot();
  });
});

describe('tribal alarm', () => {
  it('moves within 0..100 and reports a change of attitude level', () => {
    const up = adjust(land({ tribe: { alarm: { a: 20 } } }), 10);
    expect(T(up.state)).toBe(30);
    expect(up.events).toEqual([{ type: 'attitudeChanged', tribe: 'cherokee', player: 'a', from: 0, to: 1 }]);
    expect(adjust(land({ tribe: { alarm: { a: 30 } } }), 5).events).toEqual([]);
    expect(T(adjust(land({ tribe: { alarm: { a: 95 } } }), 40).state)).toBe(100);
    expect(T(adjust(land({ tribe: { alarm: { a: 5 } } }), -40).state)).toBe(0);
    expect(attitude(adjust(land({ tribe: { alarm: { a: 70 } } }), 5).state, 'cherokee', 'a')).toBe(3);
  });

  it('rises half as fast for the French, and half again with Pocahontas; falls are never softened', () => {
    expect(T(adjust(land({ nation: 'france' }), 9).state)).toBe(4);
    expect(T(adjust(land({ fathers: ['pocahontas'] }), 9).state)).toBe(4);
    expect(T(adjust(land({ nation: 'france', fathers: ['pocahontas'] }), 9).state)).toBe(2);
    expect(T(adjust(land({ nation: 'france', fathers: ['pocahontas'] }), 1).state)).toBe(0);
    expect(T(adjust(land({ nation: 'france', tribe: { alarm: { a: 50 } } }), -9).state)).toBe(41);
  });

  it('a fall across a step of five calms every settlement of the tribe', () => {
    const hot = land({ tribe: { alarm: { a: 31 } }, village: { alarm: { a: 300, b: 300 } } });
    expect(S(adjust(hot, -1).state)).toBe(300); // 31 -> 30: same step
    const cooled = adjust(hot, -2).state; // 31 -> 29
    expect(S(cooled)).toBe(32);
    expect(cooled.settlements['v']?.alarm['b']).toBe(300);
    const angry = land({ tribe: { alarm: { a: 81 } }, village: { alarm: { a: 300 } } });
    expect(S(adjust(angry, -2).state)).toBe(96);
    expect(S(adjust(land({ tribe: { alarm: { a: 31 } }, village: { alarm: { a: 10 } } }), -2).state)).toBe(10);
  });

  it('at full alarm a tribe may burn that power\'s missions, more readily on harder levels', () => {
    const run = (difficulty: Level): number => {
      let burned = 0;
      for (let seed = 0; seed < 1100; seed++) {
        const s = land({ difficulty, tribe: { alarm: { a: 99 } }, village: { mission: { owner: 'a', expert: false } } });
        const r = adjust(s, 5, seed);
        if (r.state.settlements['v']?.mission === null) {
          burned++;
          expect(r.events.at(-1)).toEqual({ type: 'missionsBurned', tribe: 'cherokee', player: 'a', settlements: ['v'] });
        }
      }
      return burned / 1100;
    };
    expect(run('discoverer')).toBeCloseTo(2 / 11, 1);
    expect(run('viceroy')).toBeCloseTo(6 / 11, 1);
    const theirs = land({ tribe: { alarm: { a: 99 } }, village: { mission: { owner: 'b', expert: false } } });
    for (let seed = 0; seed < 50; seed++) expect(adjust(theirs, 5, seed).state.settlements['v']?.mission).not.toBeNull();
  });

  it('first contact caps what the tribe had heard at 20', () => {
    const events: AlarmEvent[] = [];
    const strangers = land({ tribe: { met: [], alarm: { a: 44, b: 9 } } });
    const met = meetTribe(strangers, 'cherokee', 'a', events);
    expect(T(met)).toBe(20);
    expect(met.tribes.cherokee?.met).toEqual(['a']);
    expect(events).toEqual([{ type: 'tribeMet', tribe: 'cherokee', player: 'a' }]);
    expect(meetTribe(met, 'cherokee', 'a', events)).toBe(met);
    expect(tribalAlarm(meetTribe(strangers, 'cherokee', 'b', []), 'cherokee', 'b')).toBe(9);
  });
});

describe('what alarms a settlement', () => {
  it('a small new colony next door does not', () => {
    expect(alarmSource(colony(land({ difficulty: 'discoverer' }), 8, 7, 1, ['a', 'b', 'c', 'd', 'e', 'f', 'g']), land().settlements['v']!)).toBeNull();
  });

  it('a colony counts by its people (doubly past six), its buildings and its distance', () => {
    const v = land().settlements['v']!;
    // 8 colonists, 8 buildings, adjacent, middle level: ((2*2 + min(4,1) + 6 + 2) * 2 - 1 - 1) / 5 = 24 / 5
    expect(alarmSource(colony(land(), 8, 7, 8, Array(8).fill('x')), v)).toEqual({ owner: 'a', amount: 4 });
    // the same colony four squares off: (26 - 4 - 1) / 8
    expect(alarmSource(colony(land(), 11, 7, 8, Array(8).fill('x')), v)).toEqual({ owner: 'a', amount: 2 });
    // sixteen buildings add (16 - 8) >> 2 = 2: (15 * 2 - 2) / 5
    expect(alarmSource(colony(land(), 8, 7, 8, Array(16).fill('x')), v)?.amount).toBe(5);
    // beyond six squares nothing
    expect(alarmSource(colony(land(), 14, 7, 8, Array(16).fill('x')), v)).toBeNull();
  });

  it('weighs a human\'s buildings by difficulty and adds the difficulty level itself', () => {
    const amount = (difficulty: Level, kind: 'human' | 'ai' = 'human'): number =>
      alarmSource(colony(land({ difficulty, kind }), 8, 7, 8, Array(16).fill('x')), land().settlements['v']!)?.amount ?? 0;
    // discoverer: B = 8, weight 0 + 0: (11 * 2 - 2) / 5 = 4; viceroy: B = 32, weight 4 + 6: (21 * 2 - 2) / 5 = 8
    expect(amount('discoverer')).toBe(4);
    expect(amount('viceroy')).toBe(8);
    // a computer power: no level, buildings at face value: (11 + 2) * 2 - 2 = 24 / 5
    expect(amount('viceroy', 'ai')).toBe(4);
  });

  it('counts soldiers nearby, less inside a colony and at the edge', () => {
    const v = land().settlements['v']!;
    let s = withUnit(land(), { id: 's1', type: 'soldier', x: 8, y: 7 }); // 2
    s = withUnit(s, { id: 'd1', type: 'dragoon', x: 9, y: 7 }); // 3, outer ring -> 1
    s = withUnit(s, { id: 'c1', type: 'colonist', x: 6, y: 7 }); // not military
    s = withUnit(s, { id: 'far', type: 'artillery', profession: null, x: 10, y: 7 }); // out of range
    s = withUnit(s, { id: 'corner', type: 'artillery', profession: null, x: 9, y: 9 }); // the corners are not counted
    s = withUnit(s, { id: 'theirs', owner: 'b', type: 'artillery', profession: null, x: 7, y: 6 }); // 7
    expect(militaryPresence(s, v)).toEqual({ a: 3, b: 7 });
    const garrisoned = withUnit(colony(land(), 8, 7, 1), { id: 'g', type: 'artillery', profession: null, x: 8, y: 7 });
    expect(militaryPresence(garrisoned, v)).toEqual({ a: 3 });
    // soldiers only count toward a colony's weight
    expect(alarmSource(s, v)).toBeNull();
    const armed = withUnit(colony(land(), 8, 7, 8, Array(8).fill('x')), { id: 'g', type: 'artillery', profession: null, x: 8, y: 7 });
    expect(alarmSource(armed, v)).toEqual({ owner: 'a', amount: 7 });
  });

  it('is halved for the French and with Pocahontas, and only the worst colony counts', () => {
    const v = land().settlements['v']!;
    expect(alarmSource(colony(land({ nation: 'france' }), 8, 7, 8, Array(8).fill('x')), v)?.amount).toBe(2);
    expect(alarmSource(colony(land({ fathers: ['pocahontas'] }), 8, 7, 8, Array(8).fill('x')), v)?.amount).toBe(2);
    const two = colony(colony(land(), 11, 7, 8, Array(8).fill('x')), 7, 9, 10, Array(8).fill('x'), 'b');
    expect(alarmSource(two, v)?.owner).toBe('b');
  });

  it('a mission changes it: a rival\'s makes things worse, one\'s own better', () => {
    const at = (mission: Settlement['mission']): number => {
      const s = colony(land({ village: { mission } }), 8, 7, 8, Array(16).fill('x'));
      return alarmSource(s, s.settlements['v']!)?.amount ?? 0;
    };
    expect(at(null)).toBe(5);
    expect(at({ owner: 'b', expert: false })).toBe(7);
    expect(at({ owner: 'b', expert: true })).toBe(10);
    expect(at({ owner: 'a', expert: false })).toBe(3);
    expect(at({ owner: 'a', expert: true })).toBe(2);
  });
});

describe('a settlement\'s turn', () => {
  const turn = (s: GameState, seed = 1): { state: GameState; events: AlarmEvent[] } => {
    const events: AlarmEvent[] = [];
    return { state: settlementTurn(s, 'v', createRng(seed), events), events };
  };
  const pressed = (opts: Parameters<typeof land>[0] = {}): GameState => colony(land({ tribe: { met: [] }, ...opts }), 8, 7, 8, Array(16).fill('x'));

  it('a pressing colony raises the settlement\'s alarm and spends the tribe\'s goodwill', () => {
    const r = turn(pressed({ tribe: { met: [], alarm: { a: 23 } } }));
    expect(S(r.state)).toBe(5 + Math.trunc(23 / 5));
    expect(G(r.state)).toBe(-5);
    expect(T(r.state)).toBe(23);
  });

  it('every eight points of lost goodwill is a point of tribal alarm', () => {
    const r = turn(pressed({ tribe: { met: [], alarm: { a: 23 }, goodwill: { a: -6 } } }));
    expect(T(r.state)).toBe(24);
    expect(G(r.state)).toBe(-3);
    const twice = turn(pressed({ tribe: { met: [], alarm: { a: 24 }, goodwill: { a: -11 } } }));
    expect(T(twice.state)).toBe(26);
    expect(twice.events).toEqual([{ type: 'attitudeChanged', tribe: 'cherokee', player: 'a', from: 0, to: 1 }]);
  });

  it('a capital feels it doubly', () => {
    const r = turn(pressed({ tribe: { met: [] }, village: { capital: true, population: 7 } }));
    expect(S(r.state)).toBe(10);
    expect(G(r.state)).toBe(-10 + 8);
    expect(T(r.state)).toBe(1);
  });

  it('a mission earns goodwill and takes the edge off the settlement', () => {
    const quiet = (mission: Settlement['mission'], fathers: string[] = [], capital = false): GameState =>
      turn(land({ fathers, tribe: { met: [] }, village: { mission, alarm: { a: 40 }, capital, population: 5 } })).state;
    expect([G(quiet({ owner: 'a', expert: false })), S(quiet({ owner: 'a', expert: false }))]).toEqual([1, 37]);
    expect([G(quiet({ owner: 'a', expert: true })), S(quiet({ owner: 'a', expert: true }))]).toEqual([4, 28]);
    expect(G(quiet({ owner: 'a', expert: true }, [], true))).toBe(0); // 8 banked: one point of alarm repaid
    expect(G(quiet({ owner: 'a', expert: false }, ['bartolomeDeLasCasas']))).toBe(2);
    expect(G(quiet({ owner: 'a', expert: true }, ['juanDeSepulveda']))).toBe(2);
    expect(S(turn(land({ tribe: { met: [] }, village: { mission: { owner: 'a', expert: true }, alarm: { a: 5 } } })).state)).toBe(0);
  });

  it('with its own mission there, a colony\'s pressure on the settlement is halved again', () => {
    const r = turn(pressed({ tribe: { met: [] }, village: { mission: { owner: 'a', expert: false } } }));
    // source 5 x 3/4 = 3; rise 3 >> 1 = 1; mission then calms by 3
    expect(G(r.state)).toBe(-3 + 1);
    expect(S(r.state)).toBe(0);
  });

  it('tempers cool with time, much faster when hot, and not at all once independence is declared', () => {
    const cooling = (alarm: number, atWar = false): number => {
      let total = 0;
      for (let seed = 0; seed < 600; seed++) {
        const s = land({ tribe: { alarm: { a: alarm }, met: ['a'] } });
        const state = atWar ? { ...s, players: s.players.map((p) => (p.id === 'a' ? { ...p, atWar: true } : p)) } : s;
        const r = turn(state, seed).state;
        total += (alarm - T(r)) * 8 + G(r);
      }
      return total / 600;
    };
    expect(cooling(10)).toBeCloseTo(1 / 13, 1);
    expect(cooling(30)).toBeCloseTo(2 / 12, 1);
    expect(cooling(60)).toBeCloseTo(5 / 9, 1);
    expect(cooling(90)).toBeCloseTo(10 / 4, 0);
    expect(cooling(90, true)).toBe(0);
    // strangers are not thought about at all
    expect(G(turn(land({ tribe: { alarm: { a: 90 }, met: [] } })).state)).toBe(0);
  });

  it('a settlement below its size grows a person whenever its counter reaches twenty', () => {
    let s = land({ village: { population: 3 } });
    const sizes: number[] = [];
    for (let i = 0; i < 16; i++) {
      s = turn(s, i).state;
      sizes.push(s.settlements['v']!.population);
    }
    expect(sizes.slice(0, 7)).toEqual([3, 3, 3, 3, 3, 3, 4]);
    expect(sizes.at(-1)).toBe(5);
    expect(turn(land()).state.settlements['v']).toMatchObject({ population: 5, growth: 0 });
    const capital = land({ village: { capital: true, population: 7, growth: 19 } });
    expect(turn(capital).state.settlements['v']?.population).toBe(7);
  });

  it('a settlement that has lost its brave raises another before it grows, armed and mounted as the tribe can afford', () => {
    const lone = (tribe: Partial<TribeState>): GameState => ({ ...land({ tribe, village: { population: 3, growth: 18 } }), units: {} });
    const r = turn(lone({}));
    expect(r.state.units['brave-v']).toMatchObject({ type: 'brave', owner: 'tribe:cherokee', x: 7, y: 7 });
    expect(r.state.settlements['v']).toMatchObject({ population: 3, growth: 0 });
    expect(r.events).toContainEqual({ type: 'braveRaised', settlementId: 'v', unitId: 'brave-v' });
    const armed = turn(lone({ muskets: 2, breeding: 60 })).state;
    expect(armed.units['brave-v']?.type).toBe('mountedWarrior');
    expect(armed.tribes.cherokee?.breeding).toBe(10);
    expect([1, 2]).toContain(armed.tribes.cherokee?.muskets);
    expect(turn(lone({ breeding: 50 })).state.units['brave-v']?.type).toBe('mountedBrave');
    expect(turn(lone({ muskets: 1, breeding: 49 })).state.units['brave-v']?.type).toBe('armedBrave');
  });
});

describe('the natives\' part of the turn', () => {
  it('runs every settlement once per round and keeps the state sound', () => {
    let s = colony(land({ tribe: { met: ['a'] } }), 8, 7, 8, Array(16).fill('x'));
    s = { ...s, settlements: { ...s.settlements, w: village('w', 'cherokee', 3, 3) } };
    const events: AlarmEvent[] = [];
    const after = nativesTurn(s, events);
    expect(S(after)).toBeGreaterThan(0);
    expect(after.rng).not.toEqual(s.rng);
    const round = applyAction(applyAction(s, { type: 'endTurn' }).state, { type: 'endTurn' }).state;
    expect(S(round)).toBeGreaterThan(0);
    expect(checkInvariants(round)).toEqual([]);
    expect(isHostile({ ...s.settlements['v']!, alarm: { a: 128 } }, 'a')).toBe(true);
    expect(isHostile({ ...s.settlements['v']!, alarm: { a: 127 } }, 'a')).toBe(false);
    const empty = world({ rows: ROWS });
    expect(nativesTurn(empty, [])).toBe(empty);
  });
});
