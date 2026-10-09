import { describe, expect, it } from 'vitest';
import { applyAction, validateAction, type Action, type GameEvent } from '../../../src/engine/actions';
import { tribalAlarm } from '../../../src/engine/alarm';
import { combatOdds, earnsPromotion } from '../../../src/engine/combat';
import { chooseFather, creditBells, drawCandidates, fatherArrives, fatherCost, fatherEra, mayTradeAbroad, type CongressEvent } from '../../../src/engine/congress';
import { availableItems } from '../../../src/engine/construction';
import { CONGRESS } from '../../../src/engine/data/congress';
import { FATHER_CATEGORIES, FATHER_IDS, FATHERS, type FatherId } from '../../../src/engine/data/fathers';
import { settlementPopulation } from '../../../src/engine/data/tribes';
import { DIFFICULTIES } from '../../../src/engine/data/yields';
import { colonyProduction } from '../../../src/engine/economy';
import { drawImmigrant } from '../../../src/engine/immigration';
import { landPrice } from '../../../src/engine/land';
import { solPercent } from '../../../src/engine/liberty';
import { forcedConvertOdds, isExpertMissionary } from '../../../src/engine/missions';
import { shipStrength } from '../../../src/engine/naval';
import { treasureFound } from '../../../src/engine/native-war';
import { createRng } from '../../../src/engine/rng';
import { kingsWar, royalTransportCut } from '../../../src/engine/royal';
import { explorerSkill } from '../../../src/engine/rumors';
import { markHomelands } from '../../../src/engine/settlements';
import type { Colonist, Colony, GameState, Player, Settlement, TribeState, Unit } from '../../../src/engine/state';
import { isExploredBy } from '../../../src/engine/tile';
import { setTile, withColony, withUnit, world } from '../../helpers/world';

type Level = (typeof DIFFICULTIES)[number];
const ROWS = Array.from({ length: 14 }, (_, y) => (y === 0 || y === 13 ? '~'.repeat(18) : `~${'.'.repeat(16)}~`));
const people = (n: number, p = 'c'): Colonist[] => Array.from({ length: n }, (_, i) => ({ id: `${p}${i}`, profession: 'freeColonist' as const, job: { kind: 'idle' as const }, turns: 0 }));
const village = (tribe: Settlement['tribe'], x: number, y: number, extra: Partial<Settlement> = {}): Settlement => ({
  id: 'v', tribe, x, y, capital: false, population: settlementPopulation(tribe, false).start, growth: 0, taught: false, tributePaid: false,
  alarm: {}, mission: null, scouted: [], lastBought: null, lastSold: null, haggleMemory: null, ...extra,
});
const record = (extra: Partial<TribeState> = {}): TribeState => ({ alarm: {}, goodwill: {}, met: ['a'], muskets: 0, horses: 0, breeding: 0, silver: 0, peace: ['a'], landSold: 0, grudge: [], joinedCrown: false, visited: {}, stock: {}, ...extra });
interface Opts { fathers?: string[]; difficulty?: Level; kind?: 'human' | 'ai'; turn?: number; seed?: number; nation?: 'england' | 'spain' }
const base = (o: Opts = {}): GameState => ({
  ...world({ rows: ROWS, seed: o.seed ?? 1, difficulty: o.difficulty ?? 'conquistador', players: [{ id: 'a', fathers: o.fathers ?? [], kind: o.kind ?? 'human', nation: o.nation ?? 'england' }, { id: 'b', kind: 'ai' }] }),
  turn: o.turn ?? 0,
});
const me = (s: GameState): Player => s.players[0] as Player;
const patch = (s: GameState, change: Partial<Player>): GameState => ({ ...s, players: s.players.map((p) => (p.id === 'a' ? { ...p, ...change } : p)) });
const credit = (s: GameState, bells: number): { state: GameState; events: CongressEvent[] } => {
  const events: CongressEvent[] = [];
  return { state: creditBells(s, 'a', bells, events), events };
};
const seat = (s: GameState, father: FatherId): GameState => {
  const seated = patch(s, { fathers: [...me(s).fathers, father] });
  return fatherArrives(seated, 'a', father, createRng(1), []);
};
const code = (s: GameState, a: Action): string => {
  const v = validateAction(s, a);
  return v.ok ? 'ok' : v.error.code;
};

describe('congress table', () => {
  it('matches the snapshot', () => {
    expect(CONGRESS).toMatchSnapshot();
  });
});

describe('what a Founding Father costs', () => {
  it('rises with each one seated and with difficulty; the first is half price', () => {
    const cost = (difficulty: Level, n: number, kind: 'human' | 'ai' = 'human', turn = 0): number =>
      fatherCost(patch(base({ difficulty, kind, turn }), { fathers: FATHER_IDS.slice(0, n) }), 'a');
    expect([0, 1, 2, 3].map((n) => cost('viceroy', n))).toEqual([56, 225, 337, 449]);
    expect([0, 1, 2, 3].map((n) => cost('discoverer', n))).toEqual([24, 97, 145, 193]);
    expect(DIFFICULTIES.map((d) => cost(d, 1))).toEqual([97, 129, 161, 193, 225]);
    // a computer power's price falls with difficulty instead
    expect(DIFFICULTIES.map((d) => cost(d, 1, 'ai'))).toEqual([225, 209, 193, 177, 161]);
  });

  it('grows by half at 1600, 1650, 1700 and 1750', () => {
    const at = (turn: number): number => fatherCost(patch(base({ difficulty: 'discoverer', turn }), { fathers: ['adamSmith'] }), 'a');
    // base 48 -> 72 -> 108 -> 162 -> 243
    expect([0, 108, 208, 308, 408].map(at)).toEqual([97, 145, 217, 325, 487]);
  });

  it('knows the era for the offer weights', () => {
    expect([0, 107, 108, 307, 308].map((turn) => fatherEra(base({ turn })))).toEqual([0, 0, 1, 1, 2]);
  });
});

describe('candidates', () => {
  it('one from each field, drawn by the era\'s weights, never one already seated or with no weight', () => {
    const seen: Record<string, number> = {};
    for (let seed = 0; seed < 600; seed++) {
      const drawn = drawCandidates(base({ fathers: ['henryHudson'] }), 'a', createRng(seed));
      expect(Object.keys(drawn).sort()).toEqual([...FATHER_CATEGORIES].sort());
      for (const category of FATHER_CATEGORIES) {
        const id = drawn[category]!;
        expect(FATHERS[id].category).toBe(category);
        seen[id] = (seen[id] ?? 0) + 1;
      }
    }
    expect(seen['henryHudson']).toBeUndefined(); // seated
    expect(seen['jakobFugger']).toBeUndefined(); // no weight before 1600
    expect(seen['georgeWashington']).toBeUndefined();
    // trade before 1600: Smith 2, Minuit 9, Stuyvesant 2, de Witt 2
    expect(seen['peterMinuit']! / 600).toBeCloseTo(9 / 15, 1);
    expect(seen['adamSmith']! / 600).toBeCloseTo(2 / 15, 1);
    const late = drawCandidates(base({ turn: 320 }), 'a', createRng(3));
    expect(late.trade).not.toBe('peterMinuit'); // weight 0 after 1700
  });

  it('a field with nobody left offers nobody', () => {
    const military = FATHER_IDS.filter((id) => FATHERS[id].category === 'military');
    const drawn = drawCandidates(base({ fathers: [...military], turn: 320 }), 'a', createRng(1));
    expect(drawn.military).toBeUndefined();
    expect(Object.keys(drawn)).toHaveLength(4);
  });
});

describe('the Congress at work', () => {
  it('asks a human whom to work toward as soon as bells are rung, and waits for the answer', () => {
    const r = credit(base(), 5);
    expect(me(r.state)).toMatchObject({ fatherBells: 5, candidate: null });
    expect(me(r.state).fatherOffer).toHaveLength(5);
    expect(r.events).toEqual([{ type: 'congressConvened', player: 'a', offer: me(r.state).fatherOffer }]);
    // more bells do not ask again
    const more = credit(r.state, 5);
    expect(more.events).toEqual([]);
    expect(me(more.state).fatherBells).toBe(10);
    expect(me(more.state).fatherOffer).toEqual(me(r.state).fatherOffer);
  });

  it('seats the chosen candidate when his price is reached; the surplus is lost and the next choice is put', () => {
    const offered = credit(base(), 5).state;
    const pick = me(offered).fatherOffer[1] as FatherId;
    expect(code(offered, { type: 'chooseFather', father: 'georgeWashington' })).toBe('notOffered');
    const chosen = applyAction(offered, { type: 'chooseFather', father: pick });
    expect(me(chosen.state)).toMatchObject({ candidate: pick, fatherOffer: [], fatherBells: 5 });
    expect(chosen.events).toEqual([{ type: 'candidateChosen', player: 'a', father: pick }]);
    // conquistador: the first costs (80 + 1) / 2 = 40
    const short = credit(chosen.state, 34);
    expect(me(short.state).fathers).toEqual([]);
    const paid = credit(short.state, 9);
    expect(me(paid.state).fathers).toEqual([pick]);
    expect(me(paid.state)).toMatchObject({ fatherBells: 0, candidate: null });
    expect(paid.events[0]).toEqual({ type: 'fatherJoined', player: 'a', father: pick, count: 1 });
    expect(paid.events.at(-1)).toMatchObject({ type: 'congressConvened' });
    expect(me(paid.state).fatherOffer).not.toContain(pick);
  });

  it('a candidate named when the bells are already there joins at once', () => {
    const rich = patch(credit(base(), 0).state, { fatherBells: 500 });
    const events: CongressEvent[] = [];
    const s = chooseFather(rich, 'a', me(rich).fatherOffer[0] as FatherId, events);
    expect(me(s).fathers).toHaveLength(1);
    expect(events.map((e) => e.type)).toEqual(['candidateChosen', 'fatherJoined', 'congressConvened']);
  });

  it('left unanswered, the first name offered is taken at the end of the turn', () => {
    const offered = credit(base(), 5).state;
    const ended = applyAction(offered, { type: 'endTurn' }).state;
    expect(me(ended).candidate).toBe(me(offered).fatherOffer[0]);
  });

  it('a computer power chooses for itself and gathers fathers as its bells allow', () => {
    let s = base({ kind: 'ai' });
    const seen: GameEvent[] = [];
    for (let i = 0; i < 12; i++) {
      const events: CongressEvent[] = [];
      s = creditBells(s, 'a', 100, events);
      seen.push(...events);
    }
    expect(me(s).fathers.length).toBeGreaterThanOrEqual(3);
    expect(me(s).fatherOffer).toEqual([]);
    expect(seen.some((e) => e.type === 'candidateChosen')).toBe(true);
    expect(new Set(me(s).fathers).size).toBe(me(s).fathers.length);
  });

  it('colonies\' bells reach the Congress each turn, and nothing is done once independence is declared', () => {
    const town = withColony(base(), { id: 'col', x: 4, y: 4, name: 'Home', buildings: ['townHall'], colonists: [{ id: 's', profession: 'elderStatesman', job: { kind: 'work', trade: 'statesman' }, turns: 0 }], goods: { food: 100 } });
    const after = applyAction(applyAction(town, { type: 'endTurn' }).state, { type: 'endTurn' }).state;
    expect(me(after).fatherBells).toBeGreaterThan(0);
    expect(me(after).fatherBells).toBe(me(after).bells);
    const declared = patch(base(), { atWar: true });
    expect(credit(declared, 50).state).toBe(declared);
  });

  it('with all twenty-five seated the Congress has no more to do', () => {
    const full = patch(base(), { fathers: [...FATHER_IDS] });
    const r = credit(full, 99999);
    expect(r.events).toEqual([]);
    expect(me(r.state).fathers).toHaveLength(25);
  });
});

describe('each Founding Father changes something', () => {
  const town = (o: Opts = {}, extra: Partial<Parameters<typeof withColony>[1]> = {}): GameState =>
    withColony(base(o), { id: 'col', x: 4, y: 4, name: 'Home', colonists: people(8), buildings: ['townHall', 'weaversHouse', 'weaversShop', 'armory', 'magazine', 'docks'], ...extra });
  const col = (s: GameState): Colony => s.colonies['col'] as Colony;
  const buildable = (s: GameState): string[] => availableItems(s, col(s)).filter((i) => i.kind === 'building').map((i) => (i as { id: string }).id);

  it('Adam Smith: factories and the Arsenal can be built', () => {
    expect(buildable(town())).not.toContain('textileMill');
    expect(buildable(town())).not.toContain('arsenal');
    expect(buildable(town({ fathers: ['adamSmith'] }))).toContain('textileMill');
    expect(buildable(town({ fathers: ['adamSmith'] }))).toContain('arsenal');
  });

  it('Jakob Fugger: every boycott is lifted when he joins', () => {
    expect(me(seat(patch(base(), { boycotts: ['rum', 'tools'] }), 'jakobFugger')).boycotts).toEqual([]);
  });

  it('Peter Minuit: native land costs nothing', () => {
    const land = (fathers: string[]): number => {
      let s = base({ fathers });
      const v = village('aztec', 8, 6);
      s = { ...s, settlements: { v }, tribes: { aztec: record() }, map: markHomelands(s.map, [v]) };
      return landPrice(withColony(s, { id: 'col', x: 5, y: 6, name: 'Home', colonists: people(10) }), 'a', 7, 6);
    };
    expect(land([])).toBeGreaterThan(0);
    expect(land(['peterMinuit'])).toBe(0);
  });

  it('Peter Stuyvesant: the Custom House can be built', () => {
    expect(buildable(town())).not.toContain('customHouse');
    expect(buildable(town({ fathers: ['peterStuyvesant'] }))).toContain('customHouse');
  });

  it('Jan de Witt: trade in foreign colonies is allowed', () => {
    expect(mayTradeAbroad(base(), 'a')).toBe(false);
    expect(mayTradeAbroad(base({ fathers: ['janDeWitt'] }), 'a')).toBe(true);
  });

  it('Ferdinand Magellan: ships are nimbler', () => {
    const fleet = (fathers: string[]): number => {
      const s = withUnit(setTile(base({ fathers }), 2, 2, { base: 'ocean' }), { id: 'ship', type: 'caravel', profession: null, x: 2, y: 2 });
      return applyAction(applyAction(s, { type: 'endTurn' }).state, { type: 'endTurn' }).state.units['ship']!.movesLeft;
    };
    expect(fleet(['ferdinandMagellan'])).toBe(fleet([]) + 3);
  });

  it('Francisco Coronado: every colony and the country around it is revealed, now and when new ones are founded', () => {
    const dark = (s: GameState): GameState => ({ ...s, map: { ...s.map, tiles: s.map.tiles.map((t) => ({ ...t, explored: 0 })) } });
    const s = dark(withColony(base(), { id: 'theirs', owner: 'b', x: 12, y: 8, name: 'Theirs' }));
    const seen = (state: GameState, x: number, y: number): boolean => isExploredBy(state.map.tiles[y * 18 + x]!, 0);
    expect(seen(s, 12, 8)).toBe(false);
    const after = seat(s, 'franciscoCoronado');
    expect(seen(after, 12, 8)).toBe(true);
    expect(seen(after, 7, 3)).toBe(true);
    expect(seen(after, 6, 8)).toBe(false);
    // a colony founded later by someone else
    const founder = withUnit(applyAction(after, { type: 'endTurn' }).state, { id: 'u', owner: 'b', x: 3, y: 10 });
    const founded = applyAction(founder, { type: 'foundColony', unitId: 'u', name: 'New' }).state;
    expect(seen(founded, 3, 10)).toBe(true);
  });

  it('Hernando de Soto: scouts are better at rumors', () => {
    const skill = (fathers: string[]): number => {
      const s = withUnit(base({ fathers }), { id: 'u', type: 'scout', x: 3, y: 3 });
      return explorerSkill(s, s.units['u']!).skill;
    };
    expect(skill(['hernandoDeSoto'])).toBe(skill([]) + 1);
  });

  it('Henry Hudson: trappers bring in twice the furs', () => {
    const furs = (fathers: string[]): number => {
      let s = setTile(base({ fathers }), 5, 4, { forest: true });
      s = withColony(s, { id: 'col', x: 4, y: 4, name: 'Home', colonists: [{ id: 't', profession: 'expertFurTrapper', job: { kind: 'field', dx: 1, dy: 0, good: 'furs' }, turns: 0 }] });
      return colonyProduction(s, s.colonies['col'] as Colony).produced.furs;
    };
    expect(furs(['henryHudson'])).toBe(2 * furs([]));
    expect(furs([])).toBeGreaterThan(0);
  });

  it('La Salle: colonies of three or more get a Stockade', () => {
    let s = withColony(base(), { id: 'big', x: 4, y: 4, name: 'Big', colonists: people(3) });
    s = withColony(s, { id: 'small', x: 9, y: 9, name: 'Small', colonists: people(2, 's') });
    const after = seat(s, 'laSalle');
    expect(after.colonies['big']?.buildings).toContain('stockade');
    expect(after.colonies['small']?.buildings).not.toContain('stockade');
    const grown = applyAction(withUnit(after, { id: 'u', x: 9, y: 9 }), { type: 'joinColony', unitId: 'u' }).state;
    expect(grown.colonies['small']?.buildings).toContain('stockade');
  });

  it('Hernan Cortes: settlements always yield treasure, and the Crown carries it for the tax alone', () => {
    const camp = village('sioux', 8, 6);
    const finds = (fathers: string[]): number => {
      const s = base({ fathers });
      const rng = createRng(4);
      let n = 0;
      for (let i = 0; i < 200; i++) if (treasureFound(s, camp, me(s), rng) > 0) n++;
      return n;
    };
    expect(finds(['hernanCortes'])).toBe(200);
    expect(finds([])).toBeLessThan(80);
    expect(royalTransportCut(patch(base({ fathers: ['hernanCortes'] }), { taxRate: 10 }), 'a')).toBe(10);
    expect(royalTransportCut(patch(base(), { taxRate: 10 }), 'a')).toBe(60);
  });

  it('George Washington: every eligible victor is promoted', () => {
    const soldier = { type: 'soldier', profession: 'freeColonist', owner: 'a', orders: 'none', x: 3, y: 3, movesLeft: 3 } as const;
    const rate = (fathers: string[]): number => {
      const s = base({ fathers });
      const rng = createRng(2);
      let n = 0;
      for (let i = 0; i < 300; i++) if (earnsPromotion(s, soldier, 24, 16, rng)) n++;
      return n;
    };
    expect(rate(['georgeWashington'])).toBe(300);
    expect(rate([])).toBeLessThan(200);
  });

  it('Paul Revere: an undefended colony arms a colonist from its muskets', () => {
    const defense = (theirFathers: string[]): number => {
      let s = world({ rows: ROWS, difficulty: 'viceroy', players: [{ id: 'a' }, { id: 'b', kind: 'ai', fathers: theirFathers }] });
      s = withColony(s, { id: 'town', owner: 'b', x: 6, y: 4, name: 'Theirs', colonists: people(2), goods: { muskets: 50 } });
      s = withColony(s, { id: 'other', owner: 'b', x: 12, y: 9, name: 'Other', colonists: people(5, 'o') });
      s = withUnit(s, { id: 'u', type: 'soldier', x: 5, y: 4 });
      const r = applyAction(s, { type: 'attack', unitId: 'u', dx: 1, dy: 0 });
      return (r.events.find((e) => e.type === 'battle') as { defense: number }).defense;
    };
    expect(defense(['paulRevere'])).toBeGreaterThan(defense([]));
  });

  it('Francis Drake: privateers fight half again as well', () => {
    const strength = (fathers: string[]): number => {
      const s = withUnit(setTile(base({ fathers }), 2, 2, { base: 'ocean' }), { id: 'p', type: 'privateer', profession: null, x: 2, y: 2 });
      return shipStrength(s, s.units['p']!, 'attack');
    };
    expect(strength(['francisDrake'])).toBe(strength([]) * 1.5);
  });

  it('John Paul Jones: a Frigate sails from Europe', () => {
    const after = seat(patch(base(), { entry: [16, 6] }), 'johnPaulJones');
    const frigate = Object.values(after.units).find((u) => u.type === 'frigate') as Unit;
    expect(frigate).toMatchObject({ owner: 'a', voyage: { phase: 'toNewWorld' } });
  });

  it('Thomas Jefferson and Thomas Paine: more liberty bells', () => {
    const bells = (fathers: string[], taxRate = 0): number => {
      const s = patch(town({ fathers }, { colonists: [{ id: 's', profession: 'elderStatesman', job: { kind: 'work', trade: 'statesman' }, turns: 0 }] }), { taxRate });
      return colonyProduction(s, col(s)).produced.bells;
    };
    expect(bells(['thomasJefferson'])).toBe(Math.floor(bells([]) * 1.5));
    expect(bells(['thomasPaine'], 50)).toBe(Math.floor(bells([], 50) * 1.5));
    expect(bells(['thomasPaine'], 0)).toBe(bells([], 0));
  });

  it('Pocahontas: all tension is forgotten when she joins, and grows half as fast afterwards', () => {
    let s = base();
    s = { ...s, settlements: { v: village('sioux', 8, 6, { alarm: { a: 200, b: 90 } }) }, tribes: { sioux: record({ alarm: { a: 80, b: 60 } }) } };
    const after = seat(s, 'pocahontas');
    expect(tribalAlarm(after, 'sioux', 'a')).toBe(0);
    expect(tribalAlarm(after, 'sioux', 'b')).toBe(60);
    expect(after.settlements['v']?.alarm).toEqual({ a: 0, b: 90 });
    const soldier = withUnit(after, { id: 'u', type: 'soldier', x: 7, y: 6 });
    const attacked = applyAction(soldier, { type: 'attack', unitId: 'u', dx: 1, dy: 0 }).state;
    expect(tribalAlarm(attacked, 'sioux', 'a')).toBe(7); // (5 + 2) x 2, halved
  });

  it('Simon Bolivar: twenty points more Sons of Liberty in every colony', () => {
    const sol = (fathers: string[]): number => {
      const s = town({ fathers }, { sol: { n: 2, d: 8 } });
      return solPercent(s, col(s));
    };
    expect(sol(['simonBolivar'])).toBe(sol([]) + 20);
  });

  it('Benjamin Franklin: the King\'s wars no longer reach the colonies', () => {
    const wars = (fathers: string[]): number => {
      let n = 0;
      for (let seed = 0; seed < 300; seed++) {
        const s = { ...patch(base({ fathers, seed }), { stance: { b: 'peace' } }), turn: 300 };
        const events: GameEvent[] = [];
        kingsWar(s, 'a', events as never[]);
        if (events.length > 0) n++;
      }
      return n;
    };
    expect(wars([])).toBeGreaterThan(5);
    expect(wars(['benjaminFranklin'])).toBe(0);
  });

  it('William Brewster: no more criminals or servants, in the pool or to come', () => {
    const after = seat(patch(base({ difficulty: 'viceroy' }), { pool: ['pettyCriminal', 'indenturedServant', 'masterWeaver'] }), 'williamBrewster');
    expect(me(after).pool).toEqual(['freeColonist', 'freeColonist', 'masterWeaver']);
    const rng = createRng(1);
    for (let i = 0; i < 400; i++) expect(['pettyCriminal', 'indenturedServant']).not.toContain(drawImmigrant(rng, me(after), 'viceroy', [], false));
  });

  it('William Penn: preachers make half again as many crosses', () => {
    const crosses = (fathers: string[]): number => {
      const s = town({ fathers }, { buildings: ['townHall', 'church'], colonists: [{ id: 'p', profession: 'firebrandPreacher', job: { kind: 'work', trade: 'preacher' }, turns: 0 }] });
      return colonyProduction(s, col(s)).produced.crosses;
    };
    expect(crosses(['williamPenn'])).toBeGreaterThan(crosses([]));
  });

  it('Jean de Brebeuf: every mission works as a Jesuit one, standing or new', () => {
    const s = { ...base(), settlements: { v: village('sioux', 8, 6, { mission: { owner: 'a', expert: false } }) }, tribes: { sioux: record() } };
    expect(seat(s, 'jeanDeBrebeuf').settlements['v']?.mission).toEqual({ owner: 'a', expert: true });
    const priest = (fathers: string[]): boolean => {
      const t = withUnit(base({ fathers }), { id: 'm', type: 'missionary', x: 3, y: 3 });
      return isExpertMissionary(t, t.units['m']!);
    };
    expect([priest([]), priest(['jeanDeBrebeuf'])]).toEqual([false, true]);
  });

  it('Juan de Sepulveda and Bartolome de las Casas: more, and fewer, converts by force', () => {
    const odds = (fathers: string[]): number => {
      const s = base({ fathers });
      return forcedConvertOdds(s, village('sioux', 8, 6, { mission: { owner: 'a', expert: false } }), 'a');
    };
    expect([odds([]), odds(['juanDeSepulveda']), odds(['bartolomeDeLasCasas'])]).toEqual([4, 8, 0]);
  });

  it('Bartolome de las Casas: every convert becomes a free colonist when he joins', () => {
    let s = withColony(base(), { id: 'col', x: 4, y: 4, name: 'Home', colonists: [{ id: 'c', profession: 'indianConvert', job: { kind: 'idle' }, turns: 0 }] });
    s = withUnit(s, { id: 'u', profession: 'indianConvert', x: 6, y: 6 });
    const after = seat(s, 'bartolomeDeLasCasas');
    expect(after.colonies['col']?.colonists[0]?.profession).toBe('freeColonist');
    expect(after.units['u']?.profession).toBe('freeColonist');
  });

  it('the fight odds are untouched by any father but Drake and Revere', () => {
    const everyone = FATHER_IDS.filter((id) => id !== 'francisDrake' && id !== 'paulRevere');
    const attacker = { type: 'soldier', profession: 'freeColonist', owner: 'a', orders: 'none', x: 3, y: 3, movesLeft: 3 } as const;
    const defender = { ...attacker, owner: 'b', x: 4, y: 3 } as const;
    expect(combatOdds(base({ fathers: [...everyone] }), attacker, defender)).toEqual(combatOdds(base(), attacker, defender));
  });
});
