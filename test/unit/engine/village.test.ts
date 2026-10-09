import { describe, expect, it } from 'vitest';
import { applyAction, listValidActions, validateAction, type Action, type GameEvent } from '../../../src/engine/actions';
import { tribalAlarm } from '../../../src/engine/alarm';
import { settlementPopulation } from '../../../src/engine/data/tribes';
import { VILLAGE, VILLAGE_ACTION_NAMES, VILLAGE_ACTIONS } from '../../../src/engine/data/village';
import type { DIFFICULTIES } from '../../../src/engine/data/yields';
import { checkInvariants } from '../../../src/engine/invariants';
import type { Colonist, GameState, Settlement, TribeState, Unit } from '../../../src/engine/state';
import { isExploredBy } from '../../../src/engine/tile';
import { contactAt, settlementMood, shipRefusal, tribeMight, villageActions, type VillageEvent } from '../../../src/engine/village';
import { setTile, withColony, withUnit, world } from '../../helpers/world';

type Level = (typeof DIFFICULTIES)[number];
const ROWS = Array.from({ length: 16 }, (_, y) => (y === 0 || y === 15 ? '~'.repeat(18) : `~${'.'.repeat(16)}~`));
const village = (id: string, tribe: Settlement['tribe'], x: number, y: number, extra: Partial<Settlement> = {}): Settlement => ({
  id, tribe, x, y, capital: false, population: settlementPopulation(tribe, false).start, growth: 0, taught: false, tributePaid: false,
  alarm: {}, mission: null, scouted: [], lastBought: null, lastSold: null, haggleMemory: null, ...extra,
});
const record = (extra: Partial<TribeState> = {}): TribeState => ({ alarm: {}, goodwill: {}, met: ['a', 'b'], muskets: 0, horses: 0, breeding: 0, silver: 0, peace: ['a', 'b'], landSold: 0, grudge: [], joinedCrown: false, visited: {}, stock: {}, ...extra });
interface Opts { seed?: number; difficulty?: Level; tribe?: Settlement['tribe']; record?: Partial<TribeState>; village?: Partial<Settlement>; fathers?: string[]; nation?: 'england' | 'spain'; kind?: 'human' | 'ai' }
function land(o: Opts = {}): GameState {
  const tribe = o.tribe ?? 'cherokee';
  const s = world({ rows: ROWS, seed: o.seed ?? 1, difficulty: o.difficulty ?? 'conquistador', players: [{ id: 'a', nation: o.nation ?? 'england', fathers: o.fathers ?? [], kind: o.kind ?? 'human' }, { id: 'b', nation: 'france' }] });
  return { ...s, settlements: { v: village('v', tribe, 8, 8, o.village) }, tribes: { [tribe]: record(o.record) } };
}
const unit = (s: GameState, type: Unit['type'], extra: Partial<Unit> = {}): GameState => withUnit(s, { id: 'u', type, x: 7, y: 8, profession: 'freeColonist', ...extra });
type Result = { state: GameState; events: readonly GameEvent[] };
const acts = (s: GameState): string[] => villageActions(s, s.units['u']!, s.settlements['v']!);
const code = (s: GameState, a: Action): string => {
  const v = validateAction(s, a);
  return v.ok ? 'ok' : v.error.code;
};
const visit = (s: GameState, action: Action & { type: 'enterSettlement' }): Result => applyAction(s, action);
const speak = (s: GameState): Result => visit(s, { type: 'enterSettlement', unitId: 'u', settlementId: 'v', action: 'speakWithChief' });
const demand = (s: GameState): Result => visit(s, { type: 'enterSettlement', unitId: 'u', settlementId: 'v', action: 'demandTribute' });
type Chief = Extract<VillageEvent, { type: 'chiefSpoke' }>;
type Tribute = Extract<VillageEvent, { type: 'tributeDemanded' }>;
const chief = (r: Result): Chief => r.events.find((e) => e.type === 'chiefSpoke') as Chief;
const tribute = (r: Result): Tribute => r.events.find((e) => e.type === 'tributeDemanded') as Tribute;
function tally<T extends string>(n: number, run: (seed: number) => T): Record<string, number> {
  const seen: Record<string, number> = {};
  for (let seed = 0; seed < n; seed++) {
    const k = run(seed);
    seen[k] = (seen[k] ?? 0) + 1;
  }
  return seen;
}

describe('village tables', () => {
  it('match the snapshot and name the nine actions of the rules file', () => {
    expect({ VILLAGE, VILLAGE_ACTIONS, VILLAGE_ACTION_NAMES }).toMatchSnapshot();
    expect(Object.values(VILLAGE_ACTION_NAMES)).toHaveLength(9);
  });
});

describe('first contact', () => {
  const strangers = (kind: 'human' | 'ai' = 'human'): GameState => land({ kind, record: { met: [], peace: [], alarm: { a: 33 } } });

  it('a land unit stepping beside a settlement meets its tribe, which proposes a treaty', () => {
    const s = withUnit(withUnit(strangers(), { id: 'u', x: 6, y: 8 }), { id: 'w', x: 4, y: 8 });
    const far = applyAction(s, { type: 'moveUnit', unitId: 'w', dx: 1, dy: 0 });
    expect(far.events.some((e) => e.type === 'tribeMet')).toBe(false);
    const near = applyAction(far.state, { type: 'moveUnit', unitId: 'u', dx: 1, dy: 0 });
    expect(near.events.filter((e) => e.type === 'tribeMet' || e.type === 'treatyOffered')).toEqual([
      { type: 'tribeMet', tribe: 'cherokee', player: 'a' },
      { type: 'treatyOffered', tribe: 'cherokee', player: 'a', settlements: 1 },
    ]);
    expect(near.state.tribes.cherokee).toMatchObject({ met: ['a'], peace: [] });
    expect(tribalAlarm(near.state, 'cherokee', 'a')).toBe(20);
    expect(near.state.players[0]?.pendingTreaties).toEqual(['cherokee']);
    expect(checkInvariants(near.state)).toEqual([]);
  });

  it('accepting brings peace; refusing means war', () => {
    const met = contactAt(strangers(), 'a', 7, 8, []);
    const yes = applyAction(met, { type: 'answerTreaty', tribe: 'cherokee', accept: true });
    expect(yes.state.tribes.cherokee?.peace).toEqual(['a']);
    expect(yes.state.players[0]?.pendingTreaties).toEqual([]);
    const no = applyAction(met, { type: 'answerTreaty', tribe: 'cherokee', accept: false });
    expect(no.state.tribes.cherokee?.peace).toEqual([]);
    expect(tribalAlarm(no.state, 'cherokee', 'a')).toBe(100);
    expect(code(yes.state, { type: 'answerTreaty', tribe: 'cherokee', accept: true })).toBe('noTreatyPending');
    expect(listValidActions(met).filter((a) => a.type === 'answerTreaty')).toHaveLength(2);
  });

  it('an unanswered treaty counts as accepted; a computer power accepts at once', () => {
    const met = contactAt(strangers(), 'a', 7, 8, []);
    const ended = applyAction(met, { type: 'endTurn' });
    expect(ended.state.tribes.cherokee?.peace).toEqual(['a']);
    const events: VillageEvent[] = [];
    const ai = contactAt(strangers('ai'), 'a', 7, 8, events);
    expect(ai.tribes.cherokee?.peace).toEqual(['a']);
    expect(ai.players[0]?.pendingTreaties).toEqual([]);
    expect(events.map((e) => e.type)).toEqual(['tribeMet', 'treatyOffered', 'treatyAnswered']);
  });

  it('founding a colony beside a settlement also makes contact; ships do not', () => {
    const s = withUnit(strangers(), { id: 'u', x: 7, y: 8 });
    const founded = applyAction(s, { type: 'foundColony', unitId: 'u', name: 'X' });
    expect(founded.state.tribes.cherokee?.met).toEqual(['a']);
    let sea = strangers();
    for (let x = 1; x <= 7; x++) sea = setTile(sea, x, 7, { base: 'ocean' });
    const sailed = applyAction(withUnit(sea, { id: 'sh', type: 'caravel', profession: null, x: 6, y: 7 }), { type: 'moveUnit', unitId: 'sh', dx: 1, dy: 0 });
    expect(sailed.state.units['sh']).toMatchObject({ x: 7, y: 7 });
    expect(sailed.state.tribes.cherokee?.met).toEqual([]);
  });
});

describe('what a unit may do at a settlement', () => {
  it('depends on the kind of unit', () => {
    expect(acts(unit(land(), 'colonist'))).toEqual(['liveAmong']);
    expect(acts(unit(land(), 'pioneer'))).toEqual(['liveAmong']);
    expect(acts(unit(land(), 'colonist', { profession: 'indianConvert' }))).toEqual([]);
    expect(acts(unit(land(), 'scout'))).toEqual(['speakWithChief', 'demandTribute', 'attack']);
    expect(acts(unit(land(), 'soldier'))).toEqual(['demandTribute', 'attack']);
    expect(acts(unit(land(), 'artillery', { profession: null }))).toEqual(['demandTribute', 'attack']);
    expect(acts(unit(land(), 'wagonTrain', { profession: null }))).toEqual(['trade']);
    expect(acts(unit(land(), 'missionary'))).toEqual(['establishMission', 'incite']);
    expect(acts(unit(land({ village: { mission: { owner: 'b', expert: false } } }), 'missionary'))).toEqual(['denounce', 'incite']);
    expect(acts(unit(land({ village: { mission: { owner: 'a', expert: false } } }), 'missionary'))).toEqual(['incite']);
  });

  it('without a treaty only trade, the chief and attack remain', () => {
    const war = { record: { peace: [] } };
    expect(acts(unit(land(war), 'colonist'))).toEqual([]);
    expect(acts(unit(land(war), 'missionary'))).toEqual([]);
    expect(acts(unit(land(war), 'soldier'))).toEqual(['attack']);
    expect(acts(unit(land(war), 'scout'))).toEqual(['speakWithChief', 'attack']);
  });

  it('a hostile tribe is entered at one\'s peril rather than traded with', () => {
    expect(acts(unit(land({ record: { alarm: { a: 74 } } }), 'wagonTrain', { profession: null }))).toEqual(['trade']);
    expect(acts(unit(land({ record: { alarm: { a: 75 } } }), 'wagonTrain', { profession: null }))).toEqual(['enterHostile']);
  });

  it('ships are turned away by strangers, by an angry tribe, and by an uneasy settlement', () => {
    const ship = (o: Opts): GameState => unit(land(o), 'caravel', { profession: null });
    expect(acts(ship({}))).toEqual(['trade']);
    expect(shipRefusal(land({ record: { met: [] } }), land().settlements['v']!, 'a')).toMatchObject({ ok: false, code: 'shipsUnknown' });
    expect(acts(ship({ record: { met: [] } }))).toEqual([]);
    expect(acts(ship({ record: { alarm: { a: 75 } } }))).toEqual([]);
    expect(acts(ship({ village: { alarm: { a: 64 } } }))).toEqual([]);
    expect(acts(ship({ village: { alarm: { a: 63 } } }))).toEqual(['trade']);
  });

  it('the settlement\'s mood follows the tribe, or the settlement\'s own anger', () => {
    const mood = (o: Opts): string => {
      const s = land(o);
      return settlementMood(s, s.settlements['v']!, 'a');
    };
    expect(mood({})).toBe('happy');
    expect(mood({ record: { alarm: { a: 25 } } })).toBe('wary');
    expect(mood({ village: { alarm: { a: 128 } } })).toBe('wary');
    expect(mood({ record: { alarm: { a: 50 } } })).toBe('sullen');
    expect(mood({ record: { alarm: { a: 75 } } })).toBe('war');
  });

  it('needs the unit beside the settlement with moves left, and refuses what the unit cannot do', () => {
    const s = unit(land(), 'scout');
    const go: Action = { type: 'enterSettlement', unitId: 'u', settlementId: 'v', action: 'speakWithChief' };
    expect(code(s, go)).toBe('ok');
    expect(code(s, { ...go, settlementId: 'nowhere' })).toBe('noSuchSettlement');
    expect(code(unit(land(), 'scout', { x: 5 }), go)).toBe('notAdjacent');
    expect(code(unit(land(), 'scout', { movesLeft: 0 }), go)).toBe('noMovesLeft');
    expect(code(unit(land(), 'colonist'), go)).toBe('notAllowed');
    expect(code(unit(land(), 'colonist'), { ...go, action: 'liveAmong' })).toBe('ok');
    expect(listValidActions(s).filter((a) => a.type === 'enterSettlement').map((a) => (a as { action: string }).action)).toEqual(['speakWithChief', 'demandTribute', 'attack']);
  });
});

describe('speaking with the chief', () => {
  it('a content tribe never harms the scout and gives each favour about a third of the time', () => {
    const seen = tally(900, (seed) => chief(speak(unit(land({ seed }), 'scout'))).outcome);
    expect(seen['killed']).toBeUndefined();
    expect(seen['nothing'] ?? 0).toBeLessThan(30); // only a throw of zero bores a chief with no grievance
    for (const favour of ['promotion', 'tales', 'gift']) expect(seen[favour]! / 900).toBeCloseTo(1 / 3, 1);
  });

  it('promotes a scout, shows the country, or gives gold, and uses up the scout\'s turn', () => {
    const find = (want: string, o: Opts = {}): Result => {
      for (let seed = 0; seed < 200; seed++) {
        const r = speak(unit(land({ ...o, seed }), 'scout'));
        if (chief(r).outcome === want) return r;
      }
      throw new Error(`no ${want}`);
    };
    const promoted = find('promotion');
    expect(promoted.state.units['u']).toMatchObject({ profession: 'seasonedScout', movesLeft: 0 });
    expect(promoted.state.settlements['v']?.scouted).toEqual(['a']);
    expect(chief(promoted).wants).toHaveLength(3);
    const gift = find('gift');
    const gold = chief(gift).gold;
    expect(gift.state.players[0]?.gold).toBe(gold);
    // three throws of 1..8, times 1..6, times 4, times (tech + 1 = 2)
    expect(gold % 8).toBe(0);
    expect(gold).toBeGreaterThanOrEqual(3 * 8);
    expect(gold).toBeLessThanOrEqual(24 * 6 * 8);
    const fogged = { ...land(), map: { ...land().map, tiles: land().map.tiles.map((t) => ({ ...t, explored: 0 })) } };
    for (let seed = 0; seed < 200; seed++) {
      const r = speak(unit({ ...fogged, rng: land({ seed }).rng }, 'scout'));
      if (chief(r).outcome !== 'tales') continue;
      const at = (x: number, y: number): boolean => isExploredBy(r.state.map.tiles[y * 18 + x]!, 0);
      expect(at(13, 14)).toBe(true);
      expect(at(1, 2)).toBe(true);
      expect(at(14, 8)).toBe(false);
      return;
    }
    throw new Error('no tales');
  });

  it('a seasoned scout is never "promoted", and a settlement gives its favour only once', () => {
    const seen = tally(300, (seed) => chief(speak(unit(land({ seed }), 'scout', { profession: 'seasonedScout' }))).outcome);
    expect(seen['promotion']).toBeUndefined();
    expect(seen['tales']! / 300).toBeCloseTo(2 / 3, 1);
    const again = tally(100, (seed) => chief(speak(unit(land({ seed, village: { scouted: ['b'] } }), 'scout'))).outcome);
    expect(again).toEqual({ nothing: 100 });
  });

  it('an uneasy tribe sometimes kills the scout, a hostile one always; the seasoned fare better', () => {
    const deaths = (o: Opts, seasoned = false): number =>
      (tally(1500, (seed) => chief(speak(unit(land({ ...o, seed }), 'scout', seasoned ? { profession: 'seasonedScout' } : {}))).outcome)['killed'] ?? 0) / 1500;
    expect(deaths({ record: { alarm: { a: 24 } } })).toBe(0);
    expect(deaths({ record: { alarm: { a: 60 } } })).toBeCloseTo(16 / 101, 1);
    expect(deaths({ record: { alarm: { a: 60 } } }, true)).toBeCloseTo(16 / 141, 1);
    expect(deaths({ record: { alarm: { a: 75 } } })).toBe(1);
    const dead = speak(unit(land({ record: { alarm: { a: 80 } } }), 'scout'));
    expect(dead.state.units['u']).toBeUndefined();
    expect(checkInvariants(dead.state)).toEqual([]);
  });

  it('the Arawak kill scouts whatever their mood, more often on harder levels', () => {
    const deaths = (difficulty: Level): number => (tally(1800, (seed) => chief(speak(unit(land({ tribe: 'arawak', difficulty, seed }), 'scout'))).outcome)['killed'] ?? 0) / 1800;
    expect(deaths('discoverer')).toBeCloseTo(1 / 9, 1);
    expect(deaths('viceroy')).toBeCloseTo(1 / 5, 1);
  });

  it('with Coronado no scout is ever killed', () => {
    const seen = tally(60, (seed) => chief(speak(unit(land({ seed, fathers: ['franciscoCoronado'], record: { alarm: { a: 90 } } }), 'scout'))).outcome);
    expect(seen).toEqual({ nothing: 60 });
  });
});

describe('demanding tribute', () => {
  const people = (n: number): Colonist[] => Array.from({ length: n }, (_, i) => ({ id: `c${i}`, profession: 'freeColonist' as const, job: { kind: 'idle' as const }, turns: 0 }));
  const armed = (o: Opts = {}, soldiers = 6): GameState => {
    let s = unit(land(o), 'soldier');
    s = withColony(s, { id: 'col', x: 3, y: 3, name: 'Fort', colonists: people(2) });
    for (let i = 0; i < soldiers; i++) s = withUnit(s, { id: `g${i}`, type: 'artillery', profession: null, x: 3, y: 3 });
    return s;
  };

  it('a tribe with one settlement counts for little', () => {
    expect(tribeMight(land(), 'cherokee')).toBe(1);
  });

  it('a strong power usually gets goods sent to its nearest colony, once per settlement, and angers the tribe doubly', () => {
    const seen = tally(300, (seed) => tribute(demand(armed({ seed }))).outcome);
    expect(seen['paid']! / 300).toBeGreaterThan(0.8);
    expect(seen['laughed']).toBeUndefined();
    let paid: Result | null = null;
    for (let seed = 0; seed < 50 && !paid; seed++) {
      const r = demand(armed({ seed }));
      if (tribute(r).outcome === 'paid') paid = r;
    }
    const t = tribute(paid!);
    expect(t).toMatchObject({ good: 'food', colonyId: 'col' });
    expect(t.amount).toBeGreaterThanOrEqual(10);
    expect(t.amount).toBeLessThanOrEqual(100);
    expect(paid!.state.colonies['col']?.goods.food).toBe(t.amount);
    expect(paid!.state.settlements['v']?.tributePaid).toBe(true);
    expect(tribalAlarm(paid!.state, 'cherokee', 'a')).toBe(2 * 3);
    expect(paid!.state.units['u']?.movesLeft).toBe(0);
    expect(checkInvariants(paid!.state)).toEqual([]);
    const again = tally(60, (seed) => tribute(demand(armed({ seed, village: { tributePaid: true } }))).outcome);
    expect(again['paid']).toBeUndefined();
    expect(again['poor']).toBeGreaterThan(40);
  });

  it('pleading poverty costs no goodwill; a weak power is laughed at and resented', () => {
    const poor = demand(armed({ village: { tributePaid: true } }));
    if (tribute(poor).outcome === 'poor') expect(tribalAlarm(poor.state, 'cherokee', 'a')).toBe(0);
    const weak = (seed: number): GameState => {
      const s = land({ seed, record: { alarm: { a: 40 } } });
      return withColony(withUnit(s, { id: 'u', type: 'scout', x: 7, y: 8 }), { id: 'col', x: 3, y: 3, name: 'Fort' });
    };
    const seen = tally(200, (seed) => tribute(demand(weak(seed))).outcome);
    expect(seen['laughed']).toBeGreaterThan(150);
    const r = demand(weak(1));
    expect(tribalAlarm(r.state, 'cherokee', 'a')).toBe(40 + (tribute(r).outcome === 'poor' ? 0 : 3));
  });

  it('a hostile tribe always laughs, and no colony means no tribute', () => {
    expect(tally(40, (seed) => tribute(demand(armed({ seed, record: { alarm: { a: 80 } } }))).outcome)).toEqual({ laughed: 40 });
    const homeless = (seed: number): GameState => {
      let s = unit(land({ seed }), 'soldier');
      for (let i = 0; i < 6; i++) s = withUnit(s, { id: `g${i}`, type: 'artillery', profession: null, x: 3, y: 3 });
      return s;
    };
    expect(tally(60, (seed) => tribute(demand(homeless(seed))).outcome)['paid']).toBeUndefined();
  });

  it('refusal comes from a sullen tribe facing a stronger power that fails its throw', () => {
    const seen = tally(400, (seed) => tribute(demand(armed({ seed, record: { alarm: { a: 60 } } }, 3))).outcome);
    expect(seen['refused']).toBeGreaterThan(0);
    expect(seen['poor']).toBeUndefined();
  });
});
