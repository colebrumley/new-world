import { describe, expect, it } from 'vitest';
import { applyAction, listValidActions, validateAction, type Action, type GameEvent } from '../../../src/engine/actions';
import { tribalAlarm } from '../../../src/engine/alarm';
import { braveTypeFor, placeBraves } from '../../../src/engine/braves';
import { NATIVE_WAR, RAID_SPARES, TREASURE } from '../../../src/engine/data/native-war';
import { settlementPopulation } from '../../../src/engine/data/tribes';
import type { DIFFICULTIES } from '../../../src/engine/data/yields';
import { createGame } from '../../../src/engine/game';
import { checkInvariants } from '../../../src/engine/invariants';
import { braveAttacks, braveVisits, raidOutcome, reparation, treasureFound, type NativeWarEvent } from '../../../src/engine/native-war';
import { createRng } from '../../../src/engine/rng';
import type { Colonist, Colony, GameState, Goods, Player, Settlement, TribeState, Unit } from '../../../src/engine/state';
import { withColony, withUnit, world } from '../../helpers/world';

type Level = (typeof DIFFICULTIES)[number];
type Result = { state: GameState; events: readonly GameEvent[] };
const ROWS = Array.from({ length: 14 }, (_, y) => (y === 0 || y === 13 ? '~'.repeat(16) : `~${'.'.repeat(14)}~`));
const village = (id: string, tribe: Settlement['tribe'], x: number, y: number, extra: Partial<Settlement> = {}): Settlement => ({
  id, tribe, x, y, capital: false, population: settlementPopulation(tribe, false).start, growth: 0, taught: false, tributePaid: false,
  alarm: {}, mission: null, scouted: [], lastBought: null, lastSold: null, haggleMemory: null, ...extra,
});
const record = (extra: Partial<TribeState> = {}): TribeState => ({ alarm: {}, goodwill: {}, met: ['a', 'b'], muskets: 0, horses: 0, breeding: 0, silver: 0, peace: ['a', 'b'], landSold: 0, grudge: [], joinedCrown: false, visited: {}, stock: {}, ...extra });
const braveUnit = (id: string, tribe: string, type: Unit['type'], x: number, y: number): Unit => ({
  id, owner: `tribe:${tribe}`, type, profession: null, x, y, movesLeft: 3, orders: 'none', destination: null, aboard: null, cargo: {}, tools: 0, workTurns: 0, route: null, repair: 0, treasure: 0, voyage: null,
});
const people = (n: number): Colonist[] => Array.from({ length: n }, (_, i) => ({ id: `c${i}`, profession: 'freeColonist' as const, job: { kind: 'idle' as const }, turns: 0 }));
interface Opts { seed?: number; difficulty?: Level; tribe?: Settlement['tribe']; record?: Partial<TribeState>; village?: Partial<Settlement>; fathers?: string[]; nation?: 'england' | 'spain'; kind?: 'human' | 'ai'; brave?: Unit['type'] | null; others?: Settlement[]; turn?: number }
/** A settlement at (8,6) with its brave standing at (8,9); player a is English and human unless told otherwise. */
function land(o: Opts = {}): GameState {
  const tribe = o.tribe ?? 'cherokee';
  const s = world({ rows: ROWS, seed: o.seed ?? 1, difficulty: o.difficulty ?? 'viceroy', players: [{ id: 'a', nation: o.nation ?? 'england', fathers: o.fathers ?? [], kind: o.kind ?? 'human' }, { id: 'b', kind: 'ai' }] });
  const settlements: Record<string, Settlement> = { v: village('v', tribe, 8, 6, o.village) };
  for (const other of o.others ?? []) settlements[other.id] = other;
  const units: Record<string, Unit> = o.brave === null ? {} : { 'brave-v': braveUnit('brave-v', tribe, o.brave ?? 'brave', 8, 9) };
  return { ...s, turn: o.turn ?? 200, units, settlements, tribes: { [tribe]: record(o.record) } };
}
const soldier = (s: GameState, x = 7, y = 6, extra: Partial<Parameters<typeof withUnit>[1]> = {}): GameState => withUnit(s, { id: 'u', type: 'soldier', x, y, ...extra });
const code = (s: GameState, a: Action): string => {
  const v = validateAction(s, a);
  return v.ok ? 'ok' : v.error.code;
};
const event = <K extends NativeWarEvent['type']>(r: { events: readonly GameEvent[] }, type: K): Extract<NativeWarEvent, { type: K }> | undefined =>
  r.events.find((e) => e.type === type) as Extract<NativeWarEvent, { type: K }> | undefined;
const T = (s: GameState, who = 'a', tribe: Settlement['tribe'] = 'cherokee'): number => tribalAlarm(s, tribe, who);
const player = (s: GameState, id = 'a'): Player => s.players.find((p) => p.id === id) as Player;
/** Try seeds until the fight goes the wanted way. */
function fight(make: (seed: number) => GameState, action: Action, attackerWins: boolean): Result {
  for (let seed = 0; seed < 300; seed++) {
    const r = applyAction(make(seed), action);
    if (event(r, 'battle')?.attackerWon === attackerWins) return r;
  }
  throw new Error('no such result in 300 seeds');
}
const ATTACK_VILLAGE: Action = { type: 'attack', unitId: 'u', dx: 1, dy: 0 };

describe('native war tables', () => {
  it('match the snapshot', () => {
    expect({ NATIVE_WAR, RAID_SPARES, TREASURE }).toMatchSnapshot();
  });
});

describe('braves', () => {
  it('every settlement in a new game has one band out, on land within two squares, owned by its tribe', () => {
    const s = createGame({ seed: 3, scenario: 'america', players: [{ id: 'h', name: 'H', kind: 'human' }] });
    const villages = Object.values(s.settlements);
    const braves = Object.values(s.units).filter((u) => u.owner.startsWith('tribe:'));
    expect(braves).toHaveLength(villages.length);
    for (const v of villages) {
      const b = s.units[`brave-${v.id}`]!;
      expect(b).toMatchObject({ type: 'brave', owner: `tribe:${v.tribe}` });
      expect(Math.max(Math.abs(b.x - v.x), Math.abs(b.y - v.y))).toBeLessThanOrEqual(2);
    }
    expect(checkInvariants(s)).toEqual([]);
    expect(placeBraves(land({ brave: null }), createRng(1)).units['brave-v']).toBeDefined();
  });

  it('are armed when the tribe has muskets and mounted when it has the horses', () => {
    expect(braveTypeFor(record(), 50)).toBe('brave');
    expect(braveTypeFor(record({ muskets: 1 }), 50)).toBe('armedBrave');
    expect(braveTypeFor(record({ breeding: 50 }), 50)).toBe('mountedBrave');
    expect(braveTypeFor(record({ muskets: 1, breeding: 25 }), 25)).toBe('mountedWarrior');
  });
});

describe('attacking a brave in the open', () => {
  const beside = (o: Opts = {}): GameState => soldier(land(o), 7, 9);
  const AT: Action = { type: 'attack', unitId: 'u', dx: 1, dy: 0 };

  it('angers the tribe by 5 plus the difficulty level, win or lose, and costs the attacker a move', () => {
    const r = applyAction(beside({ difficulty: 'conquistador' }), AT);
    expect(T(r.state)).toBe(7);
    expect(event(r, 'battle')).toMatchObject({ attackerId: 'u', defenderId: 'brave-v', x: 8, y: 9 });
    expect(r.state.units['u']?.movesLeft ?? 0).toBe(0);
    expect(checkInvariants(r.state)).toEqual([]);
    expect(T(applyAction(beside({ kind: 'ai' }), AT).state)).toBe(5);
  });

  it('a win destroys the brave; half the time its arms go home', () => {
    const won = fight((seed) => beside({ seed }), AT, true);
    expect(won.state.units['brave-v']).toBeUndefined();
    expect(event(won, 'unitLost')).toMatchObject({ unitId: 'brave-v', fate: 'destroyed' });
    let kept = 0;
    let wins = 0;
    for (let seed = 0; seed < 400; seed++) {
      const r = applyAction(beside({ seed, brave: 'mountedWarrior' }), AT);
      if (!event(r, 'battle')?.attackerWon) continue;
      wins++;
      const tribe = r.state.tribes.cherokee!;
      if (tribe.muskets === 1) {
        kept++;
        expect(tribe.breeding).toBe(25);
      } else expect(tribe).toMatchObject({ muskets: 0, breeding: 0 });
    }
    expect(kept / wins).toBeCloseTo(0.5, 1);
  });

  it('a loss demotes the soldier to a colonist; a scout or pioneer is simply lost', () => {
    const lost = fight((seed) => beside({ seed, brave: 'mountedWarrior' }), AT, false);
    expect(lost.state.units['u']).toMatchObject({ type: 'colonist', profession: 'freeColonist' });
    expect(event(lost, 'unitLost')).toMatchObject({ unitId: 'u', fate: 'demoted', became: 'colonist', lost: { muskets: 50 } });
    expect(lost.state.units['brave-v']?.type).toBe('mountedWarrior'); // a defending brave takes nothing
    const scout = fight((seed) => withUnit(land({ seed, brave: 'mountedWarrior' }), { id: 'u', type: 'scout', x: 7, y: 9 }), AT, false);
    expect(scout.state.units['u']).toBeUndefined();
    expect(event(scout, 'unitLost')).toMatchObject({ fate: 'destroyed', lost: { horses: 50 } });
    const dragoon = fight((seed) => withUnit(land({ seed, brave: 'mountedWarrior' }), { id: 'u', type: 'dragoon', x: 7, y: 9 }), AT, false);
    expect(dragoon.state.units['u']?.type).toBe('soldier');
    const gun = fight((seed) => withUnit(land({ seed, brave: 'mountedWarrior' }), { id: 'u', type: 'artillery', profession: null, x: 7, y: 9 }), AT, false);
    expect(gun.state.units['u']?.type).toBe('damagedArtillery');
    expect(event(gun, 'unitLost')?.fate).toBe('damaged');
  });

  it('a winning soldier may be promoted; with Washington always', () => {
    const won = fight((seed) => beside({ seed, fathers: ['georgeWashington'] }), AT, true);
    expect(won.state.units['u']?.profession).toBe('veteranSoldier');
    expect(event(won, 'unitPromoted')).toEqual({ type: 'unitPromoted', unitId: 'u', profession: 'veteranSoldier' });
  });

  it('needs an armed land unit beside natives, with moves left', () => {
    expect(code(beside(), AT)).toBe('ok');
    expect(code(beside(), { ...AT, dx: -1 })).toBe('noTarget');
    expect(code(withUnit(land(), { id: 'u', x: 7, y: 9 }), AT)).toBe('cannotAttack');
    expect(code(soldier(land(), 7, 9, { movesLeft: 0 }), AT)).toBe('noMovesLeft');
    expect(listValidActions(beside()).some((a) => a.type === 'attack' && a.dx === 1 && a.dy === 0)).toBe(true);
    // and a brave cannot simply be walked into
    expect(code(beside(), { type: 'moveUnit', unitId: 'u', dx: 1, dy: 0 })).toBe('occupied');
  });
});

describe('attacking a settlement', () => {
  it('doubles the anger (six times for a capital) and turns the settlement hostile at once', () => {
    const r = applyAction(soldier(land({ difficulty: 'conquistador' })), ATTACK_VILLAGE);
    expect(T(r.state)).toBe(14);
    expect(r.state.settlements['v']?.alarm['a']).toBe(256);
    const capital = applyAction(soldier(land({ difficulty: 'conquistador', village: { capital: true, population: 7 } })), ATTACK_VILLAGE);
    expect(T(capital.state)).toBe(42);
    // the menu's "Attack Village" is the same thing
    const menu = applyAction(soldier(land({ difficulty: 'conquistador' })), { type: 'enterSettlement', unitId: 'u', settlementId: 'v', action: 'attack' });
    expect(menu.state.settlements['v']?.alarm['a']).toBe(256);
  });

  it('each win costs it one of its people; the last destroys it', () => {
    const won = fight((seed) => soldier(land({ seed })), ATTACK_VILLAGE, true);
    expect(won.state.settlements['v']?.population).toBe(4);
    expect(event(won, 'settlementDamaged')).toEqual({ type: 'settlementDamaged', settlementId: 'v', population: 4 });
    expect(won.state.units['u']).toMatchObject({ x: 7, y: 6 }); // the victor does not move in

    const last = fight((seed) => soldier(land({ seed, village: { population: 1 }, others: [village('w', 'cherokee', 3, 3, { alarm: { a: 200 } })] })), ATTACK_VILLAGE, true);
    expect(last.state.settlements['v']).toBeUndefined();
    expect(last.state.units['brave-v']).toBeUndefined();
    expect(event(last, 'settlementDestroyed')).toMatchObject({ settlementId: 'v', tribe: 'cherokee', by: 'a', capital: false });
    expect(player(last.state).villagesBurned).toBe(1);
    expect(last.state.tribes.cherokee?.grudge).toEqual(['a']);
    expect(last.state.map.tiles[6 * 16 + 8]?.homeland).toBeNull();
    expect(event(last, 'tribeExtinct')).toBeUndefined();
    expect(checkInvariants(last.state)).toEqual([]);
  });

  it('destroying the last settlement ends the tribe; destroying the capital cows it', () => {
    const extinct = fight((seed) => soldier(land({ seed, village: { population: 1 } })), ATTACK_VILLAGE, true);
    expect(event(extinct, 'tribeExtinct')).toEqual({ type: 'tribeExtinct', tribe: 'cherokee' });
    const cowed = fight((seed) => soldier(land({
      seed, record: { alarm: { a: 60 } }, village: { population: 1, capital: true }, others: [village('w', 'cherokee', 3, 3, { alarm: { a: 200 } })],
    })), ATTACK_VILLAGE, true);
    expect(T(cowed.state)).toBe(15);
    expect(cowed.state.settlements['w']?.alarm['a']).toBe(0);
    expect(event(cowed, 'tribeCowed')).toEqual({ type: 'tribeCowed', tribe: 'cherokee', player: 'a' });
  });

  it('the stand-in defenders are armed and mounted as the tribe is', () => {
    const defense = (r: Partial<TribeState>): number => event(applyAction(soldier(land({ record: r })), ATTACK_VILLAGE), 'battle')!.defense;
    // brave 8 +50% = 12, halved against a soldier = 6; armed 16 +50% = 24; mounted warriors 24 +50% = 36
    expect(defense({})).toBe(6);
    expect(defense({ muskets: 1 })).toBe(24);
    expect(defense({ muskets: 1, breeding: 25 })).toBe(36);
  });

  it('with the attacker\'s mission there, a convert may follow the victor', () => {
    let converts = 0;
    let wins = 0;
    for (let seed = 0; seed < 500; seed++) {
      const r = applyAction(soldier(land({ seed, village: { mission: { owner: 'a', expert: false } } })), ATTACK_VILLAGE);
      if (!event(r, 'battle')?.attackerWon) continue;
      wins++;
      const convert = Object.values(r.state.units).find((u) => u.profession === 'indianConvert');
      if (convert) {
        converts++;
        expect(convert).toMatchObject({ owner: 'a', x: 7, y: 6 });
      }
    }
    expect(converts / wins).toBeCloseTo(4 / 13, 1);
  });
});

describe('treasure', () => {
  const found = (tribe: Settlement['tribe'], capital: boolean, o: Opts = {}): number[] => {
    const s = land({ tribe, ...o });
    const rng = createRng(o.seed ?? 5);
    return Array.from({ length: 600 }, () => treasureFound(s, village('v', tribe, 8, 6, { capital }), player(s), rng));
  };
  const range = (xs: number[]): [number, number] => [Math.min(...xs), Math.max(...xs)];

  it('camps seldom have any, villages one time in three, capitals always', () => {
    const camps = found('sioux', false);
    expect(camps.filter((g) => g > 0).length / 600).toBeCloseTo(1 / 7, 1);
    expect(range(camps.filter((g) => g > 0))).toEqual([200, 400]);
    const villages = found('cherokee', false);
    expect(villages.filter((g) => g > 0).length / 600).toBeCloseTo(1 / 3, 1);
    expect(range(villages.filter((g) => g > 0))).toEqual([300, 800]);
    expect(range(found('cherokee', true))).toEqual([600, 1600]);
    expect(found('sioux', false, { nation: 'spain' }).filter((g) => g > 0).length / 600).toBeCloseTo(1 / 4, 1);
  });

  it('cities always pay: Aztec in thousands, Inca by sixteen hundreds', () => {
    expect(range(found('aztec', false))).toEqual([2000, 6000]);
    expect(range(found('aztec', true))).toEqual([4000, 10000]);
    expect(range(found('inca', false))).toEqual([3200, 9600]);
    expect(range(found('inca', true))).toEqual([5000, 15000]);
  });

  it('Cortes always finds some and more of it; Spain finds more in the cities', () => {
    expect(range(found('sioux', false, { fathers: ['hernanCortes'] }))).toEqual([300, 600]);
    expect(range(found('aztec', false, { fathers: ['hernanCortes'] }))).toEqual([8000, 12000]);
    expect(range(found('aztec', false, { nation: 'spain' }))).toEqual([5000, 9000]);
    expect(range(found('inca', false, { fathers: ['hernanCortes'], nation: 'spain' }))).toEqual([6200, 18600]);
  });

  it('is left as a treasure train on the ruins, the victor\'s to carry home', () => {
    const r = fight((seed) => soldier(land({ seed, tribe: 'aztec', village: { population: 1 } })), ATTACK_VILLAGE, true);
    const e = event(r, 'settlementDestroyed')!;
    expect(e.treasure).toBeGreaterThanOrEqual(2000);
    expect(r.state.units[e.treasureUnitId!]).toMatchObject({ type: 'treasure', owner: 'a', x: 8, y: 6, treasure: e.treasure });
    expect(checkInvariants(r.state)).toEqual([]);
  });
});

describe('a brave attacks a unit in the open', () => {
  const run = (s: GameState, x: number, y: number): { state: GameState; events: NativeWarEvent[] } => {
    const events: NativeWarEvent[] = [];
    return { state: braveAttacks(s, 'brave-v', x, y, events), events };
  };
  const until = (make: (seed: number) => GameState, x: number, y: number, braveWins: boolean): { state: GameState; events: NativeWarEvent[] } => {
    for (let seed = 0; seed < 400; seed++) {
      const r = run(make(seed), x, y);
      if (r.events.find((e) => e.type === 'battle' && e.attackerWon === braveWins)) return r;
    }
    throw new Error('no such result');
  };

  it('a winning brave takes muskets from soldiers and horses from riders, and the tribe is somewhat appeased', () => {
    const won = until((seed) => soldier(land({ seed, record: { alarm: { a: 40 } }, village: { alarm: { a: 150 } } }), 8, 10), 8, 10, true);
    expect(won.state.units['u']?.type).toBe('colonist');
    expect(won.state.units['brave-v']).toMatchObject({ type: 'armedBrave', movesLeft: 0 });
    expect(won.events).toContainEqual({ type: 'braveArmed', unitId: 'brave-v', became: 'armedBrave' });
    expect(T(won.state)).toBe(40 - 5 + 2); // viceroy: -5 + 4/2
    expect(won.state.settlements['v']?.alarm['a']).toBe(0);
    const rider = until((seed) => withUnit(land({ seed }), { id: 'u', type: 'scout', x: 8, y: 10 }), 8, 10, true);
    expect(rider.state.units['brave-v']?.type).toBe('mountedBrave');
    expect(rider.state.tribes.cherokee?.horses).toBe(1);
    expect(rider.state.units['u']).toBeUndefined();
  });

  it('a colonist or wagon caught by braves is lost with its load', () => {
    const r = until((seed) => withUnit(land({ seed }), { id: 'u', type: 'wagonTrain', profession: null, x: 8, y: 10, cargo: { furs: 80 } }), 8, 10, true);
    expect(r.state.units['u']).toBeUndefined();
    expect(r.events.find((e) => e.type === 'unitLost' && e.unitId === 'u')).toMatchObject({ fate: 'destroyed', lost: { furs: 80 } });
  });

  it('a brave that loses is destroyed, and a winning defender may be promoted', () => {
    const r = until((seed) => soldier(land({ seed, fathers: ['georgeWashington'] }), 8, 10), 8, 10, false);
    expect(r.state.units['brave-v']).toBeUndefined();
    expect(r.state.units['u']?.profession).toBe('veteranSoldier');
  });
});

describe('a brave attacks a colony', () => {
  const town = (o: Opts & { pop?: number; goods?: Goods; buildings?: string[]; gold?: number; second?: boolean } = {}): GameState => {
    let s = withColony(land(o), { id: 'col', x: 8, y: 10, name: 'Home', colonists: people(o.pop ?? 3), goods: o.goods ?? {}, buildings: o.buildings ?? [] });
    // a second colony, so that this one is not the power's last (which natives can never take)
    if (o.second !== false) s = withColony(s, { id: 'far', x: 2, y: 2, name: 'Far', colonists: people(8).map((c) => ({ ...c, id: `f${c.id}` })) });
    return { ...s, players: s.players.map((p) => (p.id === 'a' ? { ...p, gold: o.gold ?? 0 } : p)) };
  };
  const run = (s: GameState): { state: GameState; events: NativeWarEvent[] } => {
    const events: NativeWarEvent[] = [];
    return { state: braveAttacks(s, 'brave-v', 8, 10, events), events };
  };
  const until = (make: (seed: number) => GameState, want: (r: { state: GameState; events: NativeWarEvent[] }) => boolean): { state: GameState; events: NativeWarEvent[] } => {
    for (let seed = 0; seed < 600; seed++) {
      const r = run(make(seed));
      if (want(r)) return r;
    }
    throw new Error('no such result');
  };
  const raidOf = (r: { events: NativeWarEvent[] }): Extract<NativeWarEvent, { type: 'colonyRaided' }> | undefined => r.events.find((e) => e.type === 'colonyRaided') as Extract<NativeWarEvent, { type: 'colonyRaided' }> | undefined;

  it('an undefended colony of one is burned to the ground with everything in it', () => {
    const r = until((seed) => withUnit(town({ seed, pop: 1, goods: { horses: 30, furs: 50 } }), { id: 'wagon', type: 'wagonTrain', profession: null, x: 8, y: 10, cargo: { ore: 40 } }),
      (x) => x.events.some((e) => e.type === 'colonyBurned'));
    expect(r.state.colonies['col']).toBeUndefined();
    expect(r.state.units['wagon']).toBeUndefined();
    expect(r.events.find((e) => e.type === 'colonyBurned')).toMatchObject({ colonyId: 'col', owner: 'a', tribe: 'cherokee', lost: { horses: 30, furs: 50, ore: 40 } });
    expect(r.state.tribes.cherokee).toMatchObject({ horses: 1, muskets: 0 });
    expect(r.state.units['brave-v']).toBeDefined();
    expect(checkInvariants(r.state)).toEqual([]);
  });

  it('a power\'s last colony never falls', () => {
    for (let seed = 0; seed < 60; seed++) {
      const r = run(town({ seed, pop: 1, second: false }));
      expect(r.state.colonies['col']).toBeDefined();
      expect(r.events.find((e) => e.type === 'battle')).toMatchObject({ attack: 0, attackerWon: false });
    }
  });

  it('a larger colony is raided instead, and the raiders go home', () => {
    const r = until((seed) => town({ seed, goods: { furs: 100, cloth: 60 }, record: { alarm: { a: 80 } } }), (x) => raidOf(x)?.outcome === 'goods');
    const raid = raidOf(r)!;
    const stock = raid.good === 'furs' ? 100 : 60;
    expect(raid.amount).toBeGreaterThanOrEqual(10);
    expect(raid.amount).toBeLessThanOrEqual(stock / 2);
    expect(r.state.colonies['col']?.goods[raid.good!]).toBe(stock - raid.amount);
    expect(r.state.units['brave-v']).toBeUndefined();
    expect(T(r.state)).toBe(80 - 10 + 4 - 4); // beat the colony (viceroy +4), then the goods
    expect(r.state.colonies['col']?.colonists).toHaveLength(3); // nobody is killed in a raid
  });

  it('raiders may burn a building (never the fort or the basic workshops) or take gold', () => {
    const burned = until((seed) => town({ seed, buildings: ['townHall', 'carpentersShop', 'docks', 'drydock', 'stable'] }), (x) => raidOf(x)?.outcome === 'building');
    const b = raidOf(burned)!.building!;
    expect(['drydock', 'stable']).toContain(b);
    expect(burned.state.colonies['col']?.buildings).not.toContain(b);
    expect(burned.state.colonies['col']?.buildings).toContain('docks');
    // a chain that loses its only building puts its workers out of a job; the others stay at theirs
    const trades = ['preacher', 'gunsmith', 'statesman'] as const;
    const staffed = (seed: number): GameState => {
      const s = town({ seed, buildings: ['townHall', 'carpentersShop', 'church', 'armory'] });
      const c = s.colonies['col']!;
      return { ...s, colonies: { ...s.colonies, col: { ...c, colonists: c.colonists.map((p, i) => ({ ...p, job: { kind: 'work' as const, trade: trades[i]! } })) } } };
    };
    const emptied = until(staffed, (x) => raidOf(x)?.outcome === 'building');
    const lost = raidOf(emptied)!.building!;
    expect(['church', 'armory']).toContain(lost);
    expect(emptied.state.colonies['col']?.colonists.map((c) => c.job)).toEqual([
      lost === 'church' ? { kind: 'idle' } : { kind: 'work', trade: 'preacher' },
      lost === 'armory' ? { kind: 'idle' } : { kind: 'work', trade: 'gunsmith' },
      { kind: 'work', trade: 'statesman' },
    ]);
    const robbed = until((seed) => town({ seed, gold: 5000 }), (x) => raidOf(x)?.outcome === 'gold');
    const taken = raidOf(robbed)!.amount;
    expect(taken).toBeGreaterThanOrEqual(50);
    expect(taken).toBeLessThanOrEqual(Math.trunc((5000 * 3) / 12) + 10);
    expect(player(robbed.state).gold).toBe(5000 - taken);
  });

  it('stolen horses and muskets go to the tribe', () => {
    const r = until((seed) => town({ seed, goods: { horses: 60 } }), (x) => raidOf(x)?.outcome === 'goods');
    expect(r.state.tribes.cherokee).toMatchObject({ horses: 1, breeding: 25 });
    const m = until((seed) => town({ seed, goods: { muskets: 100 } }), (x) => raidOf(x)?.outcome === 'goods');
    expect([1, 2]).toContain(m.state.tribes.cherokee?.muskets);
  });

  it('fortifications blunt raids', () => {
    const nothing = (buildings: string[], difficulty: Level = 'conquistador'): number => {
      const s = town({ buildings, difficulty, goods: { furs: 100 }, gold: 1000 });
      const rng = createRng(9);
      let n = 0;
      for (let i = 0; i < 2600; i++) if (raidOutcome(s, s.colonies['col'] as Colony, rng) === 'nothing') n++;
      return n / 2600;
    };
    expect(nothing([])).toBeGreaterThanOrEqual(2 / 13 - 0.04);
    expect(nothing(['stockade'])).toBeGreaterThan(nothing([]) + 0.2);
    expect(nothing(['stockade', 'fort'])).toBeGreaterThan(nothing(['stockade']));
    expect(nothing(['stockade', 'fort', 'fortress'])).toBeGreaterThan(0.95);
    expect(nothing([], 'viceroy')).toBeLessThan(nothing([], 'discoverer'));
  });

  it('a defender under arms fights for the colony, and a drafted colonist takes up muskets with Revere', () => {
    const guarded = run(withUnit(town(), { id: 'g', type: 'soldier', x: 8, y: 10, orders: 'fortified' }));
    expect(guarded.events.find((e) => e.type === 'battle')).toMatchObject({ defenderId: 'g' });
    const plain = run(town({ goods: { muskets: 50 } })).events.find((e) => e.type === 'battle') as Extract<NativeWarEvent, { type: 'battle' }>;
    const revere = run(town({ goods: { muskets: 50 }, fathers: ['paulRevere'] })).events.find((e) => e.type === 'battle') as Extract<NativeWarEvent, { type: 'battle' }>;
    expect(revere.defense).toBeGreaterThan(plain.defense);
  });
});

describe('a brave calls at a colony', () => {
  const town = (o: Opts & { goods?: Goods } = {}): GameState =>
    withColony(land(o), { id: 'col', x: 8, y: 10, name: 'Home', colonists: people(3), goods: o.goods ?? { food: 40 } });
  const call = (s: GameState): { state: GameState; events: NativeWarEvent[] } => {
    const events: NativeWarEvent[] = [];
    return { state: braveVisits(s, 'brave-v', 'col', events), events };
  };
  const kinds = (make: (seed: number) => GameState, n = 300): Record<string, number> => {
    const seen: Record<string, number> = {};
    for (let seed = 0; seed < n; seed++) for (const e of call(make(seed)).events) seen[e.type] = (seen[e.type] ?? 0) + 1;
    return seen;
  };

  it('a contented tribe comes in friendship and brings a gift', () => {
    const seen = kinds((seed) => town({ seed }));
    expect(seen['nativeVisit']).toBe(300);
    expect(seen['nativeGift']).toBe(300);
    expect(seen['nativeDemand']).toBeUndefined();
    const r = call(town({ goods: { food: 10 } }));
    expect(r.events.find((e) => e.type === 'nativeGift')).toEqual({ type: 'nativeGift', colonyId: 'col', settlementId: 'v', good: 'food', amount: 65 });
    expect(r.state.colonies['col']?.goods.food).toBe(75);
    expect(r.state.tribes.cherokee?.visited).toEqual({ a: 2 });
    const goods = call(town({ goods: { food: 60 } })).events.find((e) => e.type === 'nativeGift') as Extract<NativeWarEvent, { type: 'nativeGift' }>;
    expect(goods.good).not.toBe('food');
    expect(goods.amount).toBeGreaterThanOrEqual(2);
  });

  it('from a mission settlement the visit may bring a convert instead', () => {
    let converts = 0;
    for (let seed = 0; seed < 600; seed++) {
      const r = call(town({ seed, village: { mission: { owner: 'a', expert: false } } }));
      if (r.events.some((e) => e.type === 'convertJoined')) {
        converts++;
        expect(r.events.some((e) => e.type === 'nativeGift')).toBe(false);
      }
    }
    expect(converts / 600).toBeCloseTo(3 / 16, 1);
  });

  it('a hostile tribe does not call; a sullen one comes only to scowl', () => {
    const war = town({ record: { alarm: { a: 80 } } });
    expect(call(war).state).toBe(war);
    const sullen = call(town({ record: { alarm: { a: 60 } }, village: { alarm: { a: 40 } } }));
    expect(sullen.events).toEqual([{ type: 'nativeVisit', colonyId: 'col', settlementId: 'v', friendly: false }]);
    expect(sullen.state.settlements['v']?.alarm['a']).toBe(0);
  });

  it('an uneasy settlement makes a demand, which a human answers on its turn', () => {
    const uneasy = (seed: number): GameState => town({ seed, record: { alarm: { a: 45 } }, village: { alarm: { a: 120 } }, goods: { food: 40, furs: 90, muskets: 30 } });
    const seen = kinds(uneasy);
    expect(seen['nativeDemand']).toBeGreaterThan(40);
    expect(seen['nativeVisit']).toBeGreaterThan(40);
    let asked: { state: GameState; events: NativeWarEvent[] } | null = null;
    for (let seed = 0; seed < 100 && !asked; seed++) {
      const r = call(uneasy(seed));
      if (r.events.some((e) => e.type === 'nativeDemand')) asked = r;
    }
    const demand = player(asked!.state).demands[0]!;
    expect(demand).toMatchObject({ kind: 'demand', settlementId: 'v', colonyId: 'col' });
    expect(asked!.state.tribes.cherokee?.visited).toEqual({ a: 1 });
    expect(listValidActions(asked!.state).filter((a) => a.type === 'answerDemand')).toHaveLength(2);

    const given = applyAction(asked!.state, { type: 'answerDemand', index: 0, give: true });
    expect(given.state.colonies['col']?.goods[demand.good] ?? 0).toBe((asked!.state.colonies['col']?.goods[demand.good] ?? 0) - demand.amount);
    expect(given.state.settlements['v']?.alarm['a']).toBe(0);
    expect(T(given.state)).toBeLessThan(45);
    expect(player(given.state).demands).toEqual([]);

    const refused = applyAction(asked!.state, { type: 'answerDemand', index: 0, give: false });
    expect(refused.state.settlements['v']?.alarm['a']).toBe(120 + 128);
    expect(refused.state.colonies['col']?.goods).toEqual(asked!.state.colonies['col']?.goods);
    expect(code(refused.state, { type: 'answerDemand', index: 0, give: true })).toBe('noDemand');

    // left unanswered, the goods are handed over when the turn ends
    const ended = applyAction(asked!.state, { type: 'endTurn' });
    expect(ended.events.find((e) => e.type === 'demandAnswered')).toMatchObject({ given: true });
  });

  it('they ask for what is worth most to them, and muskets or horses handed over arm the brave', () => {
    const s = town({ goods: { food: 40, muskets: 100 } });
    expect(reparation(s, s.colonies['col'] as Colony, 'cherokee', createRng(2))?.good).toBe('muskets');
    const withDemand: GameState = { ...s, players: s.players.map((p) => (p.id === 'a' ? { ...p, demands: [{ kind: 'demand', settlementId: 'v', colonyId: 'col', good: 'muskets', amount: 100 }] } : p)) };
    const armed = applyAction(withDemand, { type: 'answerDemand', index: 0, give: true });
    expect(armed.state.units['brave-v']?.type).toBe('armedBrave');
    const horses: GameState = { ...town({ goods: { horses: 50 } }), players: s.players.map((p) => (p.id === 'a' ? { ...p, demands: [{ kind: 'demand', settlementId: 'v', colonyId: 'col', good: 'horses', amount: 50 }] } : p)) };
    const mounted = applyAction(horses, { type: 'answerDemand', index: 0, give: true });
    expect(mounted.state.units['brave-v']?.type).toBe('mountedBrave');
    expect(mounted.state.tribes.cherokee?.horses).toBe(1);
  });

  it('a hungry settlement begs for half the colony\'s food; feeding it soothes the tribe', () => {
    // hills all around: nothing grows, so they want food badly
    const hungry = (seed: number): GameState => {
      const s = town({ seed, record: { alarm: { a: 30 } }, village: { alarm: { a: 60 } }, goods: { food: 120 } });
      const tiles = s.map.tiles.map((t, i) => {
        const x = i % 16;
        const y = Math.floor(i / 16);
        return Math.abs(x - 8) <= 2 && Math.abs(y - 6) <= 2 ? { ...t, relief: 'hills' as const } : t;
      });
      return { ...s, map: { ...s.map, tiles } };
    };
    let begged: { state: GameState; events: NativeWarEvent[] } | null = null;
    for (let seed = 0; seed < 100 && !begged; seed++) {
      const r = call(hungry(seed));
      if (r.events.some((e) => e.type === 'nativeDemand' && e.demand.kind === 'beg')) begged = r;
    }
    expect(player(begged!.state).demands[0]).toEqual({ kind: 'beg', settlementId: 'v', colonyId: 'col', good: 'food', amount: 60 });
    const fed = applyAction(begged!.state, { type: 'answerDemand', index: 0, give: true });
    expect(fed.state.colonies['col']?.goods.food).toBe(60);
    expect(T(fed.state)).toBe(25);
    expect(fed.state.settlements['v']?.alarm['a']).toBe(0);
    const spurned = applyAction(begged!.state, { type: 'answerDemand', index: 0, give: false });
    expect(spurned.state.settlements['v']?.alarm['a']).toBe(90);
    expect(T(spurned.state)).toBe(30);
  });

  it('a computer power answers at once', () => {
    let seen = 0;
    for (let seed = 0; seed < 200; seed++) {
      const r = call(town({ seed, kind: 'ai', record: { alarm: { a: 45 } }, village: { alarm: { a: 120 } }, goods: { food: 40, furs: 90 } }));
      if (!r.events.some((e) => e.type === 'nativeDemand')) continue;
      seen++;
      expect(r.events.find((e) => e.type === 'demandAnswered')).toMatchObject({ given: true });
      expect(player(r.state).demands).toEqual([]);
    }
    expect(seen).toBeGreaterThan(20);
  });
});
