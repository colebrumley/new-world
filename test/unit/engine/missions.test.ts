import { describe, expect, it } from 'vitest';
import { applyAction, listValidActions, validateAction, type Action, type GameEvent } from '../../../src/engine/actions';
import { tribalAlarm } from '../../../src/engine/alarm';
import { MISSIONS } from '../../../src/engine/data/missions';
import { settlementPopulation } from '../../../src/engine/data/tribes';
import { checkInvariants } from '../../../src/engine/invariants';
import {
  convertsDrift, forcedConvert, forcedConvertOdds, freeConverts, heresyWeights, incitePrice, missionAlarmChange, visitConvert, type MissionEvent,
} from '../../../src/engine/missions';
import { createRng } from '../../../src/engine/rng';
import type { Colonist, GameState, Settlement, TribeState, Unit } from '../../../src/engine/state';
import { withColony, withUnit, world } from '../../helpers/world';

const ROWS = Array.from({ length: 16 }, (_, y) => (y === 0 || y === 15 ? '~'.repeat(18) : `~${'.'.repeat(16)}~`));
const village = (id: string, tribe: Settlement['tribe'], x: number, y: number, extra: Partial<Settlement> = {}): Settlement => ({
  id, tribe, x, y, capital: false, population: settlementPopulation(tribe, false).start, growth: 0, taught: false, tributePaid: false,
  alarm: {}, mission: null, scouted: [], lastBought: null, lastSold: null, haggleMemory: null, ...extra,
});
const record = (extra: Partial<TribeState> = {}): TribeState => ({ alarm: {}, goodwill: {}, met: ['a', 'b'], muskets: 0, horses: 0, breeding: 0, silver: 0, peace: ['a', 'b'], landSold: 0, grudge: [], joinedCrown: false, visited: {}, stock: {}, ...extra });
interface Opts { seed?: number; record?: Partial<TribeState>; village?: Partial<Settlement>; fathers?: string[]; nation?: 'england' | 'spain' | 'france'; others?: Settlement[]; gold?: number; tribe?: Settlement['tribe'] }
function land(o: Opts = {}): GameState {
  const tribe = o.tribe ?? 'cherokee';
  const s = world({ rows: ROWS, seed: o.seed ?? 1, players: [{ id: 'a', nation: o.nation ?? 'england', fathers: o.fathers ?? [] }, { id: 'b', nation: 'netherlands' }] });
  const settlements: Record<string, Settlement> = { v: village('v', tribe, 8, 8, o.village) };
  for (const other of o.others ?? []) settlements[other.id] = other;
  return { ...s, settlements, tribes: { [tribe]: record(o.record) }, players: s.players.map((p) => (p.id === 'a' ? { ...p, gold: o.gold ?? 0 } : p)) };
}
const priest = (s: GameState, profession: Unit['profession'] = 'freeColonist'): GameState => withUnit(s, { id: 'm', type: 'missionary', profession, x: 7, y: 8 });
const go = (s: GameState, action: 'establishMission' | 'denounce' | 'incite', target?: string): { state: GameState; events: readonly GameEvent[] } =>
  applyAction(s, { type: 'enterSettlement', unitId: 'm', settlementId: 'v', action, ...(target ? { target } : {}) });
const code = (s: GameState, a: Action): string => {
  const v = validateAction(s, a);
  return v.ok ? 'ok' : v.error.code;
};
const T = (s: GameState, who = 'a', tribe: Settlement['tribe'] = 'cherokee'): number => tribalAlarm(s, tribe, who);
const mine = (id: string, x: number, expert = false): Settlement => village(id, 'cherokee', x, 3, { mission: { owner: 'a', expert } });

describe('mission tables', () => {
  it('match the snapshot', () => {
    expect(MISSIONS).toMatchSnapshot();
  });
});

describe('founding a mission', () => {
  it('always succeeds, uses up the missionary, and is welcomed most by a contented tribe', () => {
    const r = go(priest(land({ record: { alarm: { a: 24 } } })), 'establishMission');
    expect(r.state.units['m']).toBeUndefined();
    expect(r.state.settlements['v']?.mission).toEqual({ owner: 'a', expert: false });
    expect(T(r.state)).toBe(0);
    expect(r.events[0]).toEqual({ type: 'missionFounded', settlementId: 'v', player: 'a', expert: false, alarm: -25 });
    expect(checkInvariants(r.state)).toEqual([]);
    const change = (alarm: number): number => missionAlarmChange(land({ record: { alarm: { a: alarm } } }), land().settlements['v']!, 'a');
    expect([0, 30, 60, 90].map(change)).toEqual([-25, -15, -10, -5]);
  });

  it('each mission already held in the tribe adds 8, so the fourth is resented', () => {
    const having = (n: number, o: Opts = {}): number => {
      const s = land({ ...o, others: Array.from({ length: n }, (_, i) => mine(`o${i}`, 2 + 3 * i)) });
      return missionAlarmChange(s, s.settlements['v']!, 'a');
    };
    expect([0, 1, 2, 3, 4].map((n) => having(n))).toEqual([-25, -17, -9, -1, 7]);
    expect(having(4, { fathers: ['juanDeSepulveda'] })).toBe(39);
    expect(having(4, { fathers: ['bartolomeDeLasCasas'] })).toBe(-9);
    expect(having(4, { nation: 'france' })).toBe(-9);
    expect(having(4, { nation: 'france', fathers: ['pocahontas'] })).toBe(-17);
  });

  it('a capital takes it harder either way', () => {
    const at = (n: number): number => {
      const s = land({ village: { capital: true }, others: Array.from({ length: n }, (_, i) => mine(`o${i}`, 2 + 3 * i)) });
      return missionAlarmChange(s, s.settlements['v']!, 'a');
    };
    expect(at(0)).toBe(-33);
    expect(at(4)).toBe(15);
  });

  it('a Jesuit founds an expert mission, and so does anyone once Brebeuf has joined', () => {
    expect(go(priest(land(), 'jesuitMissionary'), 'establishMission').state.settlements['v']?.mission?.expert).toBe(true);
    expect(go(priest(land({ fathers: ['jeanDeBrebeuf'] })), 'establishMission').state.settlements['v']?.mission?.expert).toBe(true);
  });

  it('is not offered where a mission already stands, nor without a treaty', () => {
    const act: Action = { type: 'enterSettlement', unitId: 'm', settlementId: 'v', action: 'establishMission' };
    expect(code(priest(land({ village: { mission: { owner: 'b', expert: false } } })), act)).toBe('notAllowed');
    expect(code(priest(land({ record: { peace: [] } })), act)).toBe('notAllowed');
    expect(code(priest(land()), act)).toBe('ok');
  });
});

describe('denouncing heresy', () => {
  const rival = (o: Opts = {}): GameState => priest(land({ ...o, village: { mission: { owner: 'b', expert: false }, ...o.village } }));

  it('weighs the incumbent by its missions and standing against the challenger\'s standing', () => {
    const s = rival({ record: { alarm: { a: 40, b: 10 } } });
    // incumbent: population 5 for the one mission, plus its alarm 10; challenger: half of 40
    expect(heresyWeights(s, s.settlements['v']!, 'a')).toEqual({ incumbent: 15, challenger: 20 });
    const capital = rival({ record: { alarm: { a: 40, b: 10 } }, village: { capital: true, population: 7 } });
    expect(heresyWeights(capital, capital.settlements['v']!, 'a')).toEqual({ incumbent: 7 * 2 + 160, challenger: 0 });
  });

  it('the denouncer is used up either way; winning takes the mission over and shifts the tribe\'s regard', () => {
    let won = 0;
    for (let seed = 0; seed < 700; seed++) {
      const s = rival({ seed, record: { alarm: { a: 40, b: 10 } } });
      const r = go(s, 'denounce');
      expect(r.state.units['m']).toBeUndefined();
      const e = r.events.find((x) => x.type === 'heresyDenounced') as Extract<MissionEvent, { type: 'heresyDenounced' }>;
      expect(e).toMatchObject({ player: 'a', incumbent: 'b' });
      if (e.success) {
        won++;
        expect(r.state.settlements['v']?.mission).toEqual({ owner: 'a', expert: false });
        expect(T(r.state)).toBe(39); // weight 20 is level 0: one point
        expect(T(r.state, 'b')).toBe(11);
      } else {
        expect(r.state.settlements['v']?.mission).toEqual({ owner: 'b', expert: false });
        expect(T(r.state)).toBe(41);
        expect(T(r.state, 'b')).toBe(9);
      }
    }
    expect(won / 700).toBeCloseTo(15 / 35, 1);
  });

  it('an expert incumbent doubles the challenger\'s weight and stake', () => {
    let won = 0;
    for (let seed = 0; seed < 500; seed++) {
      const r = go(rival({ seed, record: { alarm: { a: 40, b: 10 } }, village: { mission: { owner: 'b', expert: true } } }), 'denounce');
      const e = r.events.find((x) => x.type === 'heresyDenounced') as Extract<MissionEvent, { type: 'heresyDenounced' }>;
      if (e.success) won++;
      // weights 20 (5 x 2 + 10) and 40; level of 40 is 1, so the stake is (1 + 1) x 2
      expect(T(r.state)).toBe(e.success ? 36 : 44);
    }
    expect(won / 500).toBeCloseTo(20 / 60, 1);
  });

  it('is only offered against another power\'s mission', () => {
    const act: Action = { type: 'enterSettlement', unitId: 'm', settlementId: 'v', action: 'denounce' };
    expect(code(rival(), act)).toBe('ok');
    expect(code(priest(land()), act)).toBe('notAllowed');
    expect(code(priest(land({ village: { mission: { owner: 'a', expert: false } } })), act)).toBe('notAllowed');
  });
});

describe('inciting a tribe', () => {
  it('is priced by the tribe\'s strength and its feeling toward the payer, with discounts', () => {
    const price = (o: Opts, profession: Unit['profession'] = 'freeColonist'): number => {
      const s = priest(land(o), profession);
      return incitePrice(s, s.units['m']!, s.settlements['v']!);
    };
    // one settlement: 6 x 1 + 0 = 6; x (0 + 75) = 450 -> the minimum
    expect(price({})).toBe(500);
    const big = { others: Array.from({ length: 4 }, (_, i) => village(`o${i}`, 'cherokee', 2 + 3 * i, 3)), record: { muskets: 3, horses: 2, alarm: { a: 25 } } };
    // five settlements, 3 muskets, 2 herds: (30 + 0 + 6 + 4) x 100
    expect(price(big)).toBe(4000);
    expect(price({ ...big, nation: 'france' })).toBe(2666);
    expect(price(big, 'jesuitMissionary')).toBe(2500);
    expect(price({ ...big, village: { capital: true } })).toBe(3500);
    expect(price({ ...big, others: [...big.others, mine('m1', 14), mine('m2', 14, true)].map((v, i) => ({ ...v, y: i < 4 ? 3 : 5 + i })) })).toBe((42 + 6 + 4) * 100 - 250 - 1000);
  });

  it('takes the gold, leaves the missionary, and sets the tribe on the target', () => {
    const s = priest(land({ gold: 900 }));
    expect(code(s, { type: 'enterSettlement', unitId: 'm', settlementId: 'v', action: 'incite' })).toBe('noTarget');
    const r = go(s, 'incite', 'b');
    expect(r.state.players[0]?.gold).toBe(400);
    expect(r.state.units['m']).toMatchObject({ movesLeft: 0 });
    expect(T(r.state, 'b')).toBe(100);
    expect(r.events[0]).toEqual({ type: 'tribeIncited', tribe: 'cherokee', player: 'a', target: 'b', price: 500 });
    expect(listValidActions(s).some((a) => a.type === 'enterSettlement' && a.action === 'incite' && a.target === 'b')).toBe(true);
  });

  it('needs the gold, a target the tribe knows, and one it is not already fighting', () => {
    const act: Action = { type: 'enterSettlement', unitId: 'm', settlementId: 'v', action: 'incite', target: 'b' };
    expect(code(priest(land({ gold: 499 })), act)).toBe('cannotAfford');
    expect(code(priest(land({ gold: 900, record: { met: ['a'] } })), act)).toBe('notAllowed');
    expect(code(priest(land({ gold: 900, record: { alarm: { b: 75 } } })), act)).toBe('notAllowed');
    expect(code(priest(land({ gold: 900 })), { ...act, target: 'a' })).toBe('noTarget');
  });
});

describe('converts', () => {
  const people: Colonist[] = [{ id: 'c1', profession: 'indianConvert', job: { kind: 'idle' }, turns: 0 }, { id: 'c2', profession: 'expertFarmer', job: { kind: 'idle' }, turns: 0 }];
  const missionLand = (o: Opts = {}, expert = false): GameState => land({ ...o, village: { mission: { owner: 'a', expert } } });
  const rate = (run: (seed: number) => GameState, n = 1600): number => {
    let got = 0;
    for (let seed = 0; seed < n; seed++) if (Object.values(run(seed).units).some((u) => u.profession === 'indianConvert')) got++;
    return got / n;
  };

  it('a friendly visit from a mission settlement brings one (tech + 2) times in 16, twice as often from an expert mission', () => {
    const visit = (o: Opts, expert = false) => (seed: number): GameState => {
      const s = missionLand(o, expert);
      return visitConvert(s, s.settlements['v']!, 'a', 3, 3, createRng(seed), []);
    };
    expect(rate(visit({}))).toBeCloseTo(3 / 16, 1);
    expect(rate(visit({}, true))).toBeCloseTo(6 / 16, 1);
    expect(rate(visit({ tribe: 'inca' }))).toBeCloseTo(5 / 16, 1);
    const none = land();
    expect(visitConvert(none, none.settlements['v']!, 'a', 3, 3, createRng(1), [])).toBe(none);
    const theirs = land({ village: { mission: { owner: 'b', expert: true } } });
    expect(visitConvert(theirs, theirs.settlements['v']!, 'a', 3, 3, createRng(1), [])).toBe(theirs);
  });

  it('the convert is a colonist unit of ours standing where the visit was paid', () => {
    for (let seed = 0; seed < 40; seed++) {
      const s = missionLand();
      const events: MissionEvent[] = [];
      const r = visitConvert(s, s.settlements['v']!, 'a', 3, 3, createRng(seed), events);
      if (events.length === 0) continue;
      const convert = Object.values(r.units)[0]!;
      expect(convert).toMatchObject({ owner: 'a', type: 'colonist', profession: 'indianConvert', x: 3, y: 3 });
      expect(events[0]).toEqual({ type: 'convertJoined', settlementId: 'v', player: 'a', unitId: convert.id, forced: false });
      expect(checkInvariants(r)).toEqual([]);
      return;
    }
    throw new Error('no convert in 40 seeds');
  });

  it('victory over a settlement holding one\'s mission may bring one too, likelier for Spain and with Sepulveda', () => {
    const odds = (o: Opts, expert = false): number => {
      const s = missionLand(o, expert);
      return forcedConvertOdds(s, s.settlements['v']!, 'a');
    };
    expect(odds({})).toBe(4);
    expect(odds({}, true)).toBe(8);
    expect(odds({ nation: 'spain' })).toBe(8);
    expect(odds({ nation: 'spain', fathers: ['juanDeSepulveda'] }, true)).toBe(16);
    expect(odds({ fathers: ['bartolomeDeLasCasas'] })).toBe(0);
    expect(forcedConvertOdds(land(), land().settlements['v']!, 'a')).toBe(0);
    const win = (o: Opts) => (seed: number): GameState => {
      const s = missionLand(o);
      return forcedConvert(s, s.settlements['v']!, 'a', 7, 8, createRng(seed), []);
    };
    expect(rate(win({}))).toBeCloseTo(4 / 13, 1);
    expect(rate(win({ nation: 'spain', fathers: ['juanDeSepulveda'] }), 200)).toBeGreaterThan(0.6);
  });

  it('a convert left outside a colony goes home after eight turns', () => {
    let s = withUnit(land(), { id: 'cv', profession: 'indianConvert', x: 3, y: 3 });
    const events: MissionEvent[] = [];
    for (let i = 0; i < 7; i++) s = convertsDrift(s, 'a', events);
    expect(s.units['cv']?.workTurns).toBe(7);
    expect(events).toEqual([]);
    s = convertsDrift(s, 'a', events);
    expect(s.units['cv']).toBeUndefined();
    expect(events).toEqual([{ type: 'convertLeft', unitId: 'cv', player: 'a' }]);
    // it runs with the turn
    let live = withUnit(land(), { id: 'cv', profession: 'indianConvert', x: 3, y: 3 });
    for (let i = 0; i < 16 && live.units['cv']; i++) live = applyAction(live, { type: 'endTurn' }).state;
    expect(live.units['cv']).toBeUndefined();
    expect(live.turn).toBe(8);
  });

  it('las Casas makes free colonists of every convert, in a colony or out', () => {
    let s = withColony(land(), { id: 'col', x: 3, y: 3, name: 'C', colonists: people });
    s = withUnit(s, { id: 'cv', profession: 'indianConvert', x: 4, y: 4 });
    s = { ...s, units: { ...s.units, cv: { ...s.units['cv']!, workTurns: 5 } } };
    s = withUnit(s, { id: 'theirs', owner: 'b', profession: 'indianConvert', x: 5, y: 5 });
    const freed = freeConverts(s, 'a');
    expect(freed.units['cv']).toMatchObject({ profession: 'freeColonist', workTurns: 0 });
    expect(freed.units['theirs']?.profession).toBe('indianConvert');
    expect(freed.colonies['col']?.colonists.map((c) => c.profession)).toEqual(['freeColonist', 'expertFarmer']);
  });
});
