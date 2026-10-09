import { describe, expect, it } from 'vitest';

import { mayIncite, missionaryAction, missionaryDue, missionTarget, ordain, powerRank, villageEntry, villageVisit, type Chances } from '../../../src/ai/missions';
import { applyAction, type Action } from '../../../src/engine/actions';
import { AI_MISSIONS } from '../../../src/engine/data/ai';
import { settlementPopulation } from '../../../src/engine/data/tribes';
import { checkInvariants } from '../../../src/engine/invariants';
import type { Rng } from '../../../src/engine/rng';
import { OFF_MAP, type GameState, type Player, type Settlement, type TribeState, type Unit } from '../../../src/engine/state';
import { policy } from '../../helpers/policy';
import { withColony, withUnit, world } from '../../helpers/world';

// a mainland (x 1..10) and an island (x 13..14)
const ROWS = Array.from({ length: 9 }, (_, y) => (y === 0 || y === 8 ? '~'.repeat(16) : `~${'.'.repeat(10)}~~..~`));
const village = (id: string, x: number, y: number, extra: Partial<Settlement> = {}): Settlement => ({
  id, tribe: 'cherokee', x, y, capital: false, population: settlementPopulation('cherokee', false).start, growth: 0, taught: false, tributePaid: false,
  alarm: {}, mission: null, scouted: [], lastBought: null, lastSold: null, haggleMemory: null, ...extra,
});
const tribe = (extra: Partial<TribeState> = {}): TribeState => ({ alarm: {}, goodwill: {}, met: ['a', 'b', 'h'], muskets: 0, horses: 0, breeding: 0, silver: 0, peace: ['a', 'b', 'h'], landSold: 0, grudge: [], joinedCrown: false, visited: {}, stock: {}, ...extra });
interface Opts { villages?: Settlement[]; tribe?: Partial<TribeState>; turn?: number; gold?: number }
/** Computer powers a and b and a human h; a's colony at (2, 4) and a village at (8, 4). The human starts richer than a. */
function land(o: Opts = {}): GameState {
  const s = world({ rows: ROWS, players: [{ id: 'a', kind: 'ai' }, { id: 'b', kind: 'ai' }, { id: 'h', kind: 'human' }] });
  const villages = o.villages ?? [village('v', 8, 4)];
  const based: GameState = {
    ...s, turn: o.turn ?? 120, settlements: Object.fromEntries(villages.map((v) => [v.id, v])), tribes: { cherokee: tribe(o.tribe) },
    players: s.players.map((p) => (p.id === 'a' ? { ...p, gold: o.gold ?? 0 } : p.id === 'h' ? { ...p, gold: 100_000 } : p)),
  };
  return withColony(based, { id: 'col', x: 2, y: 4, buildings: ['townHall', 'carpentersShop'], construction: { kind: 'building', id: 'stockade' } });
}
const me = (s: GameState): Player => s.players[0] as Player;
const u = (s: GameState, id = 'm'): Unit => s.units[id] as Unit;
const missionary = (s: GameState, x: number, y: number, extra: Partial<Unit> = {}): GameState => {
  const placed = withUnit(s, { id: 'm', type: 'missionary', x, y });
  return { ...placed, units: { ...placed.units, m: { ...(placed.units['m'] as Unit), ...extra } } };
};
const onDocks = (s: GameState, id: string, profession: Unit['profession'] = 'freeColonist'): GameState => {
  const placed = withUnit(s, { id, x: 0, y: 0, profession });
  return { ...placed, units: { ...placed.units, [id]: { ...(placed.units[id] as Unit), x: OFF_MAP, y: OFF_MAP, orders: 'sentry', voyage: { phase: 'inEurope', turnsLeft: 0, origin: [1, 4] } } } };
};
/** Chances that always come up `n`. */
const always = (n: number): Chances => () => ({ int: () => n }) as unknown as Rng;
const enter = (action: string, extra: object = {}): object => ({ type: 'enterSettlement', unitId: 'm', settlementId: 'v', action, ...extra });
const act = (s: GameState, a: Action | null): GameState => {
  if (!a) throw new Error('no action');
  const next = applyAction(s, a).state;
  expect(checkInvariants(next)).toEqual([]);
  return next;
};

describe('mission rule table', () => {
  it('matches the snapshot', () => {
    expect(AI_MISSIONS).toMatchSnapshot();
  });
});

describe('when a missionary is made', () => {
  const waiting = (turn: number, profession: Unit['profession'] = 'freeColonist'): GameState => onDocks(land({ turn }), 'w', profession);
  const due = (s: GameState, chances: Chances = always(1)): boolean => missionaryDue(s, me(s), u(s, 'w'), chances);

  it('on a turn after 50 that is divisible by 7', () => {
    expect(due(waiting(49))).toBe(false);
    expect(due(waiting(50))).toBe(false);
    expect(due(waiting(55))).toBe(false);
    expect(due(waiting(56))).toBe(true);
    expect(due(waiting(57))).toBe(false);
    expect(ordain(waiting(56), me(waiting(56)))).toEqual({ type: 'equipInEurope', unitId: 'w', role: 'missionary' });
    // made on the docks without a ship in port, and it is the whole of the business in Europe that turn
    // (turn 119: after 1600, so that the colony is not first set to building a wagon train)
    const guarded = withUnit(waiting(119), { id: 'g', type: 'artillery', profession: null, x: 2, y: 4, orders: 'fortified' });
    expect(policy(guarded)).toEqual({ type: 'equipInEurope', unitId: 'w', role: 'missionary' });
    expect(act(guarded, policy(guarded)).units['w']).toMatchObject({ type: 'missionary' });
  });

  it('from turn 200 on only one time in four', () => {
    expect(due(waiting(196), always(4))).toBe(true);
    expect(due(waiting(203), always(1))).toBe(true);
    for (const n of [2, 3, 4]) expect(due(waiting(203), always(n))).toBe(false);
  });

  it('a skilled colonist only one time in eight; servants and criminals count as unskilled, converts never go', () => {
    expect(due(waiting(56, 'expertFarmer'), always(1))).toBe(true);
    for (const n of [2, 5, 8]) expect(due(waiting(56, 'expertFarmer'), always(n))).toBe(false);
    expect(due(waiting(56, 'indenturedServant'), always(8))).toBe(true);
    expect(due(waiting(56, 'pettyCriminal'), always(8))).toBe(true);
    expect(due(waiting(56, 'indianConvert'), always(1))).toBe(false);
    // the unskilled are looked at first
    const both = onDocks(onDocks(land({ turn: 56 }), 'a1', 'expertFarmer'), 'z9');
    expect(ordain(both, me(both), always(1))).toMatchObject({ unitId: 'z9' });
  });

  it('one missionary to a power at a time', () => {
    const has = missionary(waiting(56), 5, 5);
    expect(due(has)).toBe(false);
    expect(ordain(has, me(has))).toBeNull();
    // somebody else's is no concern
    const theirs = withUnit(waiting(56), { id: 'x', owner: 'b', type: 'missionary', x: 5, y: 5 });
    expect(due(theirs)).toBe(true);
  });
});

describe('where a missionary goes', () => {
  it("to the settlement with the highest tribal alarm toward its own power x 8 / (distance + 1)", () => {
    const near = village('near', 5, 4);
    const far = village('far', 9, 4);
    // alarm 40 for both (one tribe): 320 / 3 = 106 against 320 / 7 = 45
    expect(missionTarget(missionary(land({ villages: [far, near], tribe: { alarm: { a: 40 } } }), 3, 4), u(missionary(land(), 3, 4)))?.id).toBe('near');
    // an angrier tribe farther off wins: sioux 90 x 8 / 7 = 102 against cherokee 10 x 8 / 3 = 26
    const s = missionary(land({ villages: [near, { ...far, tribe: 'sioux' }], tribe: { alarm: { a: 10 } } }), 3, 4);
    const two = { ...s, tribes: { ...s.tribes, sioux: tribe({ alarm: { a: 90 } }) } };
    expect(missionTarget(two, u(two))?.id).toBe('far');
  });

  it('half again for a capital', () => {
    // 40 x 8 / 5 = 64 against 40 x 8 / 7 = 45, half again 67
    const near = village('near', 7, 4);
    const cap = village('cap', 9, 4, { capital: true });
    const s = missionary(land({ villages: [near, cap], tribe: { alarm: { a: 40 } } }), 3, 4);
    expect(missionTarget(s, u(s))?.id).toBe('cap');
    const plain = missionary(land({ villages: [near, { ...cap, capital: false }], tribe: { alarm: { a: 40 } } }), 3, 4);
    expect(missionTarget(plain, u(plain))?.id).toBe('near');
  });

  it('a calm people is still preached to, the first listed keeping a tie; another landmass is out of reach', () => {
    const s = missionary(land({ villages: [village('one', 9, 4), village('two', 5, 4)] }), 3, 4);
    expect(missionTarget(s, u(s))?.id).toBe('one');
    const isle = missionary(land({ villages: [village('isle', 13, 4)] }), 3, 4);
    expect(missionTarget(isle, u(isle))).toBeNull();
  });

  it('skips a settlement that already holds its own mission, unless there is inciting to be done and 2500 gold to do it with', () => {
    const ours = village('ours', 5, 4, { mission: { owner: 'a', expert: false } });
    const other = village('other', 9, 4, { mission: { owner: 'b', expert: false } });
    const s = missionary(land({ villages: [ours, other], tribe: { alarm: { a: 40 } } }), 3, 4);
    expect(missionTarget(s, u(s))?.id).toBe('other');
    const rich = missionary(land({ villages: [ours, other], tribe: { alarm: { a: 40 } }, gold: 2500 }), 3, 4);
    expect(missionTarget(rich, u(rich))?.id).toBe('ours');
    const short = missionary(land({ villages: [ours, other], tribe: { alarm: { a: 40 } }, gold: 2499 }), 3, 4);
    expect(missionTarget(short, u(short))?.id).toBe('other');
  });

  it('with nowhere to go it walks to a colony and becomes a colonist again', () => {
    const all = [village('ours', 8, 4, { mission: { owner: 'a', expert: false } })];
    const afield = missionary(land({ villages: all }), 5, 4);
    expect(missionaryAction(afield, u(afield))).toEqual({ type: 'goTo', unitId: 'm', x: 2, y: 4 });
    const home = missionary(land({ villages: all }), 2, 4);
    expect(missionaryAction(home, u(home))).toEqual({ type: 'equip', unitId: 'm', role: 'colonist' });
    expect(u(act(home, missionaryAction(home, u(home)))).type).toBe('colonist');
  });

  it('walks to a square beside its settlement and goes in when it gets there', () => {
    const s = missionary(land(), 3, 4);
    expect(missionaryAction(s, u(s))).toMatchObject({ type: 'goTo', unitId: 'm', x: 7 });
    expect(policy(s)).toMatchObject({ type: 'goTo', unitId: 'm', x: 7 });
    const there = missionary(land(), 7, 4);
    expect(missionaryAction(there, u(there))).toEqual(enter('establishMission'));
    const founded = act(there, missionaryAction(there, u(there)));
    expect(founded.settlements['v']?.mission).toEqual({ owner: 'a', expert: false });
    expect(founded.units['m']).toBeUndefined();
    const spent = missionary(land(), 7, 4, { movesLeft: 0 });
    expect(missionaryAction(spent, u(spent))).toBeNull();
  });
});

describe('what a missionary does on entering', () => {
  const at = (o: Opts & { mission?: Settlement['mission'] } = {}): GameState => missionary(land({ ...o, villages: [village('v', 8, 4, { mission: o.mission ?? null })] }), 7, 4);
  const entry = (s: GameState, chances: Chances = always(5)): Action | null => villageEntry(s, u(s), s.settlements['v'] as Settlement, chances);

  it('founds a mission where there is none, denounces a rival, and does nothing at its own', () => {
    expect(entry(at())).toEqual(enter('establishMission'));
    expect(entry(at({ mission: { owner: 'b', expert: false } }))).toEqual(enter('denounce'));
    expect(entry(at({ mission: { owner: 'a', expert: false } }))).toBeNull();
    const denounced = act(at({ mission: { owner: 'b', expert: false } }), entry(at({ mission: { owner: 'b', expert: false } })));
    expect(denounced.units['m']).toBeUndefined();
  });

  it('incites the tribe against the human instead when it ranks below him and has 1500 gold', () => {
    const rich = at({ gold: 90_000 });
    expect(powerRank(rich, 'a')).toBeLessThan(powerRank(rich, 'h'));
    // always where a mission already stands
    expect(entry(at({ gold: 60_000, mission: { owner: 'b', expert: false } }), always(5))).toEqual(enter('incite', { target: 'h' }));
    expect(entry(at({ gold: 60_000, mission: { owner: 'a', expert: false } }), always(5))).toEqual(enter('incite', { target: 'h' }));
    // four times in five elsewhere
    for (const n of [1, 2, 3, 4]) expect(entry(at({ gold: 60_000 }), always(n))).toEqual(enter('incite', { target: 'h' }));
    expect(entry(at({ gold: 60_000 }), always(5))).toEqual(enter('establishMission'));
    const incited = act(at({ gold: 60_000 }), entry(at({ gold: 60_000 }), always(1)));
    expect(incited.tribes.cherokee?.alarm['h']).toBeGreaterThanOrEqual(75);
    expect(incited.units['m']).toBeDefined();
  });

  it('not with under 1500 gold, when the tribe has not met him or is already hostile to him, or when it does not rank below him', () => {
    const s = at({ gold: 1499 });
    expect(mayIncite(s, 'a', s.settlements['v'] as Settlement, AI_MISSIONS.inciteGold)).toBeNull();
    expect(mayIncite(at({ gold: 1500 }), 'a', s.settlements['v'] as Settlement, AI_MISSIONS.inciteGold)).toBe('h');
    expect(entry(s, always(1))).toEqual(enter('establishMission'));
    expect(entry(at({ gold: 60_000, tribe: { met: ['a', 'b'] } }), always(1))).toEqual(enter('establishMission'));
    expect(entry(at({ gold: 60_000, tribe: { alarm: { h: 75 } } }), always(1))).toEqual(enter('establishMission'));
    expect(entry(at({ gold: 60_000, tribe: { alarm: { h: 74 } } }), always(1))).toEqual(enter('incite', { target: 'h' }));
    // richer than the human: it ranks above him
    const above = at({ gold: 200_000 });
    expect(powerRank(above, 'a')).toBeGreaterThan(powerRank(above, 'h'));
    expect(entry(above, always(1))).toEqual(enter('establishMission'));
    // gold enough for the rule but not for the tribe's price: the mission is founded instead
    const dear = at({ gold: 1500, tribe: { alarm: { a: 60 }, muskets: 20, horses: 20 } });
    expect(entry(dear, always(1))).toEqual(enter('establishMission'));
  });

  it('rank is gold / 100 + 2 x colonies + colonists + land strength', () => {
    const s = withUnit(withUnit(land({ gold: 1234 }), { id: 'g', type: 'soldier', x: 2, y: 4 }), { id: 'f', type: 'frigate', profession: null, x: 0, y: 4 });
    // 12 + 2 x 1 + 1 colonist + a soldier's attack of 2; the frigate does not count
    expect(powerRank(s, 'a')).toBe(12 + 2 + 1 + 2);
  });
});

describe('what its other units do on entering', () => {
  const beside = (type: Unit['type'], profession: Unit['profession'] | undefined = undefined, o: Opts = {}): GameState =>
    withUnit(land(o), { id: 'm', type, x: 7, y: 4, ...(profession === undefined ? {} : { profession }) });
  const entry = (s: GameState): Action | null => villageEntry(s, u(s), s.settlements['v'] as Settlement);

  it('a wagon trades, a scout speaks with the chief, soldiers, dragoons and artillery attack', () => {
    expect(entry(beside('wagonTrain', null))).toEqual(enter('trade'));
    expect(entry(beside('scout'))).toEqual(enter('speakWithChief'));
    expect(entry(beside('soldier'))).toEqual(enter('attack'));
    expect(entry(beside('dragoon'))).toEqual(enter('attack'));
    expect(entry(beside('artillery', null))).toEqual(enter('attack'));
  });

  it('a free colonist or servant lives among the natives while the tribe is below 75; nobody else does anything, and tribute is never demanded', () => {
    expect(entry(beside('colonist'))).toEqual(enter('liveAmong'));
    expect(entry(beside('colonist', 'indenturedServant'))).toEqual(enter('liveAmong'));
    expect(entry(beside('colonist', 'freeColonist', { tribe: { alarm: { a: 74 } } }))).toEqual(enter('liveAmong'));
    expect(entry(beside('colonist', 'freeColonist', { tribe: { alarm: { a: 75 } } }))).toBeNull();
    expect(entry(beside('colonist', 'expertFarmer'))).toBeNull();
    expect(entry(beside('colonist', 'pettyCriminal'))).toBeNull();
    expect(entry(beside('pioneer'))).toBeNull();
    expect(entry(beside('treasure', null))).toBeNull();
    expect(entry(beside('caravel', null))).toBeNull();
    for (const type of ['soldier', 'dragoon', 'scout', 'colonist', 'missionary', 'wagonTrain'] as const) {
      expect(entry(beside(type, type === 'wagonTrain' ? null : undefined))).not.toMatchObject({ action: 'demandTribute' });
    }
  });

  it('a colonist passing a friendly settlement steps in to learn, a scout to speak with the chief', () => {
    const settler = beside('colonist');
    expect(villageVisit(settler, u(settler))).toEqual(enter('liveAmong'));
    expect(policy(settler)).toEqual(enter('liveAmong'));
    expect(act(settler, villageVisit(settler, u(settler))).settlements['v']?.taught).toBe(true);
    // not where someone has been taught already, the tribe is wary, or the settlement itself is uneasy
    const taught = withUnit(land({ villages: [village('v', 8, 4, { taught: true })] }), { id: 'm', x: 7, y: 4 });
    expect(villageVisit(taught, u(taught))).toBeNull();
    const wary = beside('colonist', 'freeColonist', { tribe: { alarm: { a: 25 } } });
    expect(villageVisit(wary, u(wary))).toBeNull();
    const uneasy = withUnit(land({ villages: [village('v', 8, 4, { alarm: { a: 64 } })] }), { id: 'm', x: 7, y: 4 });
    expect(villageVisit(uneasy, u(uneasy))).toBeNull();
    const scout = beside('scout');
    expect(villageVisit(scout, u(scout))).toEqual(enter('speakWithChief'));
    const seen = withUnit(land({ villages: [village('v', 8, 4, { scouted: ['a'] })] }), { id: 'm', type: 'scout', x: 7, y: 4 });
    expect(villageVisit(seen, u(seen))).toBeNull();
    // two squares off is not passing
    const off = withUnit(land(), { id: 'm', x: 6, y: 4 });
    expect(villageVisit(off, u(off))).toBeNull();
  });
});
