import { describe, expect, it } from 'vitest';
import {
  assaultReady, colonyThreat, defendersShort, defendersWanted, garrisons, invadeRequests, invasionBeach, invasionFor, invasionRefusal, isFull, isQuiet, landAttackChoice,
  landingStep, landmassSize, landOrders, landRequests, mayAttack, scaledOdds, worthTaking, type LandRequest,
} from '../../../src/ai/campaign';

import { applyAction } from '../../../src/engine/actions';
import { analyseAttack } from '../../../src/engine/analysis';
import { AI_CAMPAIGN } from '../../../src/engine/data/ai';
import { settlementPopulation } from '../../../src/engine/data/tribes';
import { checkInvariants } from '../../../src/engine/invariants';
import { landmassAt } from '../../../src/engine/regions';
import type { Colonist, Colony, Dealing, GameState, Player, Settlement, Unit } from '../../../src/engine/state';
import { isWater } from '../../../src/engine/tile';
import { policy } from '../../helpers/policy';
import { withColony, withUnit, world } from '../../helpers/world';

// a mainland (x 1..10, y 1..7: 70 squares) and an island (x 14..17: 28 squares)
const ROWS = Array.from({ length: 9 }, (_, y) => (y === 0 || y === 8 ? '~'.repeat(20) : `~${'.'.repeat(10)}~~~....~~`));
const people = (n: number, p: string): Colonist[] => Array.from({ length: n }, (_, i) => ({ id: `${p}${i}`, profession: 'freeColonist' as const, job: { kind: 'idle' as const }, turns: 0 }));
const DEALING: Dealing = { grudge: false, piracy: false, intent: false, truce: 0, lastTalk: -1, kingsWarUntil: 0 };
type Stance = Partial<Record<string, 'peace' | 'war'>>;
/** Computer powers a and b and a human h, at turn 120 unless said otherwise. */
const base = (stance: Stance = {}, turn = 120, intent: readonly string[] = []): GameState => {
  const s = world({ rows: ROWS, players: [{ id: 'a', kind: 'ai' }, { id: 'b', kind: 'ai' }, { id: 'h', kind: 'human' }] });
  const dealings = Object.fromEntries(intent.map((id) => [id, { ...DEALING, intent: true }]));
  return { ...s, turn, tribes: { sioux: { ...s.tribes.sioux!, alarm: {} } }, players: s.players.map((p) => (p.id === 'a' ? { ...p, stance: stance as Player['stance'], dealings } : p)) };
};
const me = (s: GameState): Player => s.players[0] as Player;
const u = (s: GameState, id: string): Unit => s.units[id] as Unit;
// (a colony of three wants one defender)
const col = (s: GameState, id: string, x: number, y: number, owner = 'a', pop = 3): GameState =>
  withColony(s, { id, owner, x, y, colonists: people(pop, `${id}-`), construction: { kind: 'building', id: 'stockade' } });
const troop = (s: GameState, id: string, x: number, y: number, type: Unit['type'] = 'soldier', owner = 'a', extra: Partial<Unit> = {}): GameState => {
  const placed = withUnit(s, { id, type, owner, x, y, ...(type === 'artillery' ? { profession: null } : {}) });
  return { ...placed, units: { ...placed.units, [id]: { ...(placed.units[id] as Unit), ...extra } } };
};
const village = (x: number, y: number, extra: Partial<Settlement> = {}): Settlement => ({
  id: 'v', tribe: 'sioux', x, y, capital: false, population: settlementPopulation('sioux', false).start, growth: 0, taught: false, tributePaid: false,
  alarm: {}, mission: null, scouted: [], lastBought: null, lastSold: null, haggleMemory: null, ...extra,
});
const withVillage = (s: GameState, v: Settlement, alarm: number): GameState => ({ ...s, settlements: { v }, tribes: { sioux: { ...s.tribes.sioux!, alarm: { a: alarm } } } });
const list = (rs: readonly LandRequest[]): string[] => rs.map((r) => `${r.kind} ${r.x},${r.y} p${r.priority}`);
/** Our colony at (2, 4) with its guard (a gun, which no colony takes in to work), and theirs of seven at (9, 4), on the mainland. */
const neighbours = (stance: Stance = {}, turn = 121, intent: readonly string[] = []): GameState =>
  col(troop(col(base(stance, turn, intent), 'home', 2, 4), 'guard', 2, 4, 'artillery', 'a', { orders: 'fortified' }), 'theirs', 9, 4, 'b', 7);

/** A second colony of ours with its guard: with two colonies a power's soldiers stand guard and campaign instead of settling. */
const established = (s: GameState): GameState => troop(col(s, 'second', 2, 7), 'guard2', 2, 7, 'artillery', 'a', { orders: 'fortified' });

describe('campaign rule table', () => {
  it('matches the snapshot', () => {
    expect(AI_CAMPAIGN).toMatchSnapshot();
  });
});

describe('what a power wants done on land', () => {
  it('attack any foreign colony on a landmass where it has a unit or colony: priority 3 at firm peace, 5 otherwise', () => {
    expect(list(landRequests(neighbours(), me(neighbours())))).toEqual(['attack 9,4 p5']);
    expect(list(landRequests(neighbours({ b: 'war' }), me(neighbours({ b: 'war' }))))).toContain('attack 9,4 p5');
    expect(list(landRequests(neighbours({ b: 'peace' }), me(neighbours({ b: 'peace' }))))).toEqual(['attack 9,4 p3']);
    const false_ = neighbours({ b: 'peace' }, 121, ['b']);
    expect(list(landRequests(false_, me(false_)))).toEqual(['attack 9,4 p5']);
    // a colony across the water is nothing to its troops until one of its people stands there
    const island = col(troop(col(base(), 'home', 2, 4), 'guard', 2, 4), 'theirs', 15, 4, 'b', 7);
    expect(landRequests(island, me(island))).toEqual([]);
    const ashore = withUnit(island, { id: 'scout', x: 16, y: 6 });
    expect(list(landRequests(ashore, me(ashore)))).toEqual(['attack 15,4 p5']);
  });

  it('only when its population and the units on its square exceed 6 - turn / 50', () => {
    const sized = (pop: number, turn: number, units = 0): boolean => {
      let s = col(base({}, turn), 'theirs', 9, 4, 'b', pop);
      for (let i = 0; i < units; i++) s = troop(s, `d${i}`, 9, 4, 'soldier', 'b');
      return worthTaking(s, s.colonies['theirs'] as Colony);
    };
    expect([6, 7].map((pop) => sized(pop, 0))).toEqual([false, true]);
    expect(sized(5, 0, 2)).toBe(true);
    expect([4, 5].map((pop) => sized(pop, 100))).toEqual([false, true]);
    expect([1, 2].map((pop) => sized(pop, 250))).toEqual([false, true]);
    const small = col(troop(col(base({}, 121), 'home', 2, 4), 'guard', 2, 4), 'theirs', 9, 4, 'b', 4);
    expect(landRequests(small, me(small))).toEqual([]);
  });

  it('on three turns in four', () => {
    // theirs is the second colony in the list: it rests when 1 + turn is divisible by 4
    const asked = [116, 117, 118, 119].map((turn) => landRequests(neighbours({}, turn), me(neighbours())).length > 0);
    expect(asked).toEqual([true, true, true, false]);
  });

  it('attack native settlements whose tribe is at 75 alarm or more: priority 4 where a mission stands, 2 where none does', () => {
    const calm = withVillage(troop(col(base(), 'home', 2, 4), 'guard', 2, 4), village(8, 4), 74);
    expect(landRequests(calm, me(calm))).toEqual([]);
    const hostile = withVillage(calm, village(8, 4), 75);
    expect(list(landRequests(hostile, me(hostile)))).toEqual(['attack 8,4 p2']);
    const mission = withVillage(calm, village(8, 4, { mission: { owner: 'b', expert: false } }), 90);
    expect(list(landRequests(mission, me(mission)))).toEqual(['attack 8,4 p4']);
    const overseas = withVillage(calm, village(15, 4), 90);
    expect(landRequests(overseas, me(overseas))).toEqual([]);
  });

  it('defend its own colonies that are short of defenders: priority = the defenders it is short of + 2', () => {
    const bare = col(base(), 'home', 2, 4);
    expect(list(landRequests(bare, me(bare)))).toEqual(['defend 2,4 p3']);
    expect(landRequests(troop(bare, 'g', 2, 4), me(bare))).toEqual([]);
    // a big colony is short of more than one, and is asked for accordingly
    const big = col(base(), 'home', 2, 4, 'a', 14);
    expect(defendersShort(big, big.colonies['home'] as Colony)).toBe(6);
    expect(list(landRequests(big, me(big)))).toEqual(['defend 2,4 p8']);
    // being at war makes no difference to what a colony wants
    const war = col(base({ b: 'war' }), 'home', 2, 4);
    expect(list(landRequests(war, me(war)))).toEqual(['defend 2,4 p3']);
  });

  it('defenders wanted: half its people less one, or an eighth of the threat, never over half its people', () => {
    const wanted = (s: GameState): number => defendersWanted(s, s.colonies['home'] as Colony);
    const town = (pop: number): GameState => col(base(), 'home', 2, 4, 'a', pop);
    expect([1, 2, 3, 4, 5, 8, 14].map((pop) => wanted(town(pop)))).toEqual([0, 0, 1, 1, 2, 3, 6]);
    // colonist-type units standing in it count as its people
    expect(wanted(withUnit(withUnit(town(1), { id: 'c', x: 2, y: 4 }), { id: 'd', x: 2, y: 4 }))).toBe(1);
    // one more after the Declaration
    expect(wanted({ ...town(3), crownPlayer: 'crown' })).toBe(2);
    // a threat next door calls for one even from a colony of two, but never from a man alone
    const beside = (pop: number): GameState => troop(town(pop), 'foe', 3, 4, 'soldier', 'b');
    expect(wanted(beside(2))).toBe(1);
    expect(wanted(beside(1))).toBe(0);
  });

  it('the threat: attack values of foreign land units within five squares, falling off with distance', () => {
    const threat = (s: GameState): { total: number; adjacent: boolean } => colonyThreat(s, s.colonies['home'] as Colony);
    const town = col(base(), 'home', 2, 4, 'a', 8);
    expect(threat(town)).toEqual({ total: 0, adjacent: false });
    // a dragoon (attack 3) two squares off: 3 x 6 / 8 = 2; a colonist is no threat; beyond five squares nothing counts
    expect(threat(troop(town, 'foe', 4, 4, 'dragoon', 'b'))).toEqual({ total: 2, adjacent: false });
    expect(threat(troop(town, 'foe', 3, 4, 'colonist', 'b')).total).toBe(0);
    expect(threat(troop(town, 'foe', 8, 4, 'dragoon', 'b')).total).toBe(0);
    // the human's count half again: artillery (attack 7) next door, 10 x 7 / 8 = 8 against 7 x 7 / 8 = 6
    expect(threat(troop(town, 'foe', 3, 4, 'artillery', 'b'))).toEqual({ total: 6, adjacent: true });
    expect(threat(troop(town, 'foe', 3, 4, 'artillery', 'h'))).toEqual({ total: 8, adjacent: true });
    // braves count only when their people have turned on us and their own village too (an unarmed brave's 1 falls away to nothing)
    const braves = (tribal: number, local: number): GameState => {
      const v = withVillage(town, village(6, 4, { alarm: { a: local } }), tribal);
      return withUnit(v, { id: 'brave-v', owner: 'tribe:sioux', type: 'mountedWarrior', profession: null, x: 3, y: 4 });
    };
    expect(threat(braves(30, 130)).total).toBeGreaterThan(0);
    expect(threat(braves(20, 130)).total).toBe(0);
    expect(threat(braves(30, 100)).total).toBe(0);
  });

  it('the most pressing first; after the Declaration only the human is campaigned against', () => {
    let s = col(col(col(base({}, 121), 'home', 2, 4), 'theirs', 9, 4, 'b', 7), 'his', 9, 7, 'h', 7);
    expect(list(landRequests(s, me(s)))).toEqual(['attack 9,4 p5', 'attack 9,7 p5', 'defend 2,4 p3']);
    // (and every colony wants one defender more)
    s = { ...s, crownPlayer: 'crown' };
    expect(list(landRequests(s, me(s)))).toEqual(['attack 9,7 p5', 'defend 2,4 p4']);
  });
});

describe('which troops answer', () => {
  it('a colony keeps as garrison the troops it wants: artillery before soldiers before dragoons', () => {
    const s = troop(troop(troop(col(base(), 'home', 2, 4), 'd', 2, 4, 'dragoon'), 's', 2, 4), 'z', 2, 4, 'artillery');
    // a colony of three with two more colonist-type units in it wants two
    expect([...garrisons(s, me(s))]).toEqual(['z', 's']);
    // a colony of fourteen keeps them all, in the same order
    const big = troop(troop(troop(col(base(), 'home', 2, 4, 'a', 14), 'd', 2, 4, 'dragoon'), 's', 2, 4), 'z', 2, 4, 'artillery');
    expect([...garrisons(big, me(big))]).toEqual(['z', 's', 'd']);
    // troops outside a colony are nobody's garrison
    expect([...garrisons(troop(col(base(), 'home', 2, 4), 's', 3, 4), me(s))]).toEqual([]);
  });

  it('every spare troop in reach goes to an attack; a call to defend fills up', () => {
    let s = neighbours({ b: 'war' });
    s = troop(troop(s, 's1', 3, 4), 's2', 3, 5);
    const orders = landOrders(s, me(s));
    expect(orders['guard']).toBeUndefined();
    expect(orders['s1']).toMatchObject({ kind: 'attack', x: 9, y: 4 });
    expect(orders['s2']).toMatchObject({ kind: 'attack', x: 9, y: 4 });
    // two unguarded colonies side by side: the second soldier goes to the one the first left
    let bare = col(col(base(), 'north', 2, 2), 'south', 2, 6);
    bare = troop(troop(bare, 's1', 5, 4), 's2', 5, 4);
    const posts = landOrders(bare, me(bare));
    expect(posts['s1']?.kind).toBe('defend');
    expect(posts['s2']?.kind).toBe('defend');
    expect(posts['s1']).not.toEqual(posts['s2']);
  });

  it('only on its own landmass and within what the priority is worth', () => {
    const island = col(troop(troop(col(base(), 'home', 2, 4), 'guard', 2, 4), 'spare', 3, 4), 'far', 15, 4);
    // the colony on the island wants a defender, but he cannot walk there
    expect(list(landRequests(island, me(island)))).toEqual(['defend 15,4 p3']);
    expect(landOrders(island, me(island))['spare']).toBeUndefined();
  });

  it('one or two men alone do not go campaigning', () => {
    // a single soldier ashore on the island beside their colony: no company, no orders
    const alone = troop(col(col(base({ b: 'war' }), 'home', 2, 4), 'theirs', 15, 4, 'b', 7), 's1', 16, 6);
    expect(landOrders(alone, me(alone))['s1']).toBeUndefined();
    // two, with no colony of ours there: still not
    const pair = troop(alone, 's2', 16, 6);
    expect(landOrders(pair, me(pair))['s1']).toBeUndefined();
    // three are a company
    const three = troop(pair, 's3', 16, 6);
    expect(landOrders(three, me(three))['s1']).toMatchObject({ kind: 'attack' });
    // artillery goes regardless
    const gun = troop(col(col(base({ b: 'war' }), 'home', 2, 4), 'theirs', 15, 4, 'b', 7), 'z', 16, 6, 'artillery');
    expect(landOrders(gun, me(gun))['z']).toMatchObject({ kind: 'attack' });
  });

  it('a spare soldier marches beside the colony it is to attack and waits there; one sent to defend marches in', () => {
    const s = troop(established(neighbours({ b: 'peace' })), 'spare', 3, 4);
    const march = policy(s) as { type: string; unitId: string; x: number; y: number };
    expect(march).toMatchObject({ type: 'goTo', unitId: 'spare' });
    expect(Math.max(Math.abs(march.x - 9), Math.abs(march.y - 4))).toBe(1);
    // beside it, at peace: nothing more
    const there = troop(troop(established(neighbours({ b: 'peace' })), 'spare', 8, 4), 'mate', 8, 4);
    expect(policy(there)).toEqual({ type: 'endTurn' });
    const bare = troop(troop(col(col(base(), 'home', 2, 4), 'second', 2, 7), 'guard', 2, 4, 'soldier', 'a', { orders: 'fortified' }), 'spare', 6, 4);
    expect(policy(bare)).toEqual({ type: 'goTo', unitId: 'spare', x: 2, y: 7 });
  });
});

describe('when a landing is planned', () => {
  /** Their two colonies on the island (seven on its west shore, and one), ours none there; our colony on the mainland. */
  const overseas = (stance: Stance = {}, turn = 160, pops: readonly [number, number] = [7, 1], owner = 'b'): GameState =>
    col(col(col(base(stance, turn), 'home', 2, 4), 'theirs', 14, 4, owner, pops[0]), 'other', 16, 7, owner, pops[1]);
  const why = (s: GameState): string | null => invasionRefusal(s, me(s), s.colonies['theirs'] as Colony);

  it('beside a colony of a power not at firm peace that has more colonies than us on the landmass and eight colonists there', () => {
    expect(why(overseas())).toBeNull();
    expect(why(overseas({ b: 'war' }))).toBeNull();
    expect(why(overseas({ b: 'peace' }))).toBe('firmPeace');
    // as many colonies of ours there as of theirs: no
    const matched = col(col(overseas(), 'ours1', 14, 1), 'ours2', 17, 1);
    expect(why(matched)).toBe('notOutnumbered');
    // seven colonists on the island: no; an eighth afoot there makes it
    expect(why(overseas({}, 160, [6, 1]))).toBe('tooFew');
    expect(why(withUnit(overseas({}, 160, [6, 1]), { id: 'walker', owner: 'b', x: 16, y: 2 }))).toBeNull();
    // the colony itself must pass the size test (at turn 160 more than 3)
    expect(why(overseas({}, 160, [3, 5]))).toBe('tooSmall');
    expect(why(overseas({}, 160, [4, 4]))).toBeNull();
    // natives are never invaded: only colonies are looked at, and never our own
    expect(invasionRefusal(overseas(), me(overseas()), overseas().colonies['home'] as Colony)).toBe('own');
    const declared = { ...overseas(), crownPlayer: 'crown' };
    expect(why(declared)).toBe('spared');
  });

  it('the beach is open sea within three squares that touches the landmass, the farther and the more land beside it the better', () => {
    const s = overseas();
    const beach = invasionBeach(s, { x: 14, y: 4 }, 'a') as readonly [number, number];
    const land = landmassAt(s.map, 14, 4);
    const score = (x: number, y: number): number => {
      const tile = s.map.tiles[y * s.map.width + x];
      if (!tile || !isWater(tile) || Math.max(Math.abs(x - 14), Math.abs(y - 4)) > 3) return -1;
      let beside = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && landmassAt(s.map, x + dx, y + dy) === land) beside++;
      return beside < 1 ? -1 : 2 * (Math.abs(x - 14) + Math.abs(y - 4) + beside);
    };
    expect(score(beach[0], beach[1])).toBeGreaterThan(0);
    for (let y = 0; y < s.map.height; y++) for (let x = 0; x < s.map.width; x++) expect(score(x, y)).toBeLessThanOrEqual(score(beach[0], beach[1]));
    // somebody else lying there spoils it; our own ship does not
    const taken = withUnit(s, { id: 'x', owner: 'b', type: 'caravel', profession: null, x: beach[0], y: beach[1] });
    expect(invasionBeach(taken, { x: 14, y: 4 }, 'a')).toBeNull();
    expect(why(taken)).toBe('noBeach');
    const ours = withUnit(s, { id: 'x', type: 'caravel', profession: null, x: beach[0], y: beach[1] });
    expect(invasionBeach(ours, { x: 14, y: 4 }, 'a')).toEqual(beach);
    // a colony more than three squares from the open sea has none
    expect(invasionBeach(s, { x: 5, y: 4 }, 'a')).toBeNull();
  });

  it('priority 3, +1 against the human (more where he has the landmass to himself), +1 at war, -1 on a crowded landmass, doubled before turn 150', () => {
    const p = (s: GameState): number | undefined => invadeRequests(s, me(s)).find((r) => r.colonyId === 'theirs')?.priority;
    // the island has 28 squares: two colonies are 32 sixteenths, so it is crowded
    expect(landmassSize(overseas(), landmassAt(overseas().map, 15, 4))).toBe(28);
    expect(p(overseas())).toBe(2);
    expect(p(overseas({ b: 'war' }))).toBe(3);
    // against the human one more, and one more again where a landmass of 16 squares or more is all his (two more from 64)
    expect(p(overseas({}, 160, [7, 1], 'h'))).toBe(4);
    expect(p(overseas({ h: 'war' }, 160, [7, 1], 'h'))).toBe(5);
    expect(p(overseas({ b: 'war' }, 149))).toBe(6);
    // on the roomy mainland (70 squares) four colonies are not a crowd: 64 sixteenths
    let main = col(col(base({}, 160), 'theirs', 9, 4, 'b', 7), 'other', 9, 7, 'b', 1);
    expect(p(main)).toBe(3);
    main = col(col(col(main, 'c3', 9, 1, 'b', 1), 'c4', 6, 7, 'b', 1), 'c5', 6, 1, 'b', 1);
    expect(p(main)).toBe(2);
  });

  it('a full ship carrying soldiers takes it, sails to the beach and lands them on a free square beside it', () => {
    let s = col(overseas({ b: 'war' }), 'second', 2, 7);
    s = troop(troop(s, 'g1', 2, 4, 'soldier', 'a', { orders: 'fortified' }), 'g3', 2, 7, 'soldier', 'a', { orders: 'fortified' });
    const beach = invadeRequests(s, me(s))[0]!;
    s = withUnit(s, { id: 'ship', type: 'caravel', profession: null, x: 12, y: 2 });
    s = withUnit(withUnit(s, { id: 'r1', type: 'soldier', x: 12, y: 2, aboard: 'ship' }), { id: 'r2', type: 'soldier', x: 12, y: 2, aboard: 'ship' });
    expect(isFull(s, u(s, 'ship'))).toBe(true);
    expect(invasionFor(s, me(s), 12, 2)).toEqual(beach);
    expect(policy(s)).toEqual({ type: 'goTo', unitId: 'ship', x: beach.x, y: beach.y });
    // off the beach
    const there = { ...s, units: { ...s.units, ship: { ...u(s, 'ship'), x: beach.x, y: beach.y }, r1: { ...u(s, 'r1'), x: beach.x, y: beach.y }, r2: { ...u(s, 'r2'), x: beach.x, y: beach.y } } };
    const step = landingStep(there, u(there, 'r1'), u(there, 'ship'), me(there));
    expect(step).toMatchObject({ type: 'moveUnit', unitId: 'r1' });
    expect(policy(there)).toEqual(step);
    const landed = applyAction(there, policy(there)).state;
    expect(checkInvariants(landed)).toEqual([]);
    expect(landmassAt(landed.map, u(landed, 'r1').x, u(landed, 'r1').y)).toBe(beach.land);
    expect(u(landed, 'r1').aboard).toBeNull();
    // the next man takes another square: the first is no longer free
    const second = landingStep(landed, u(landed, 'r2'), u(landed, 'ship'), me(landed)) as { dx: number; dy: number };
    expect([beach.x + second.dx, beach.y + second.dy]).not.toEqual([u(landed, 'r1').x, u(landed, 'r1').y]);
  });

  it('passengers count toward a ship being full; a ship that is not full, or carries no soldier, makes no landing', () => {
    let s = overseas({ b: 'war' });
    s = withUnit(s, { id: 'ship', type: 'caravel', profession: null, x: 12, y: 2 });
    expect(isFull(s, u(s, 'ship'))).toBe(false);
    const one = withUnit(s, { id: 'r1', type: 'soldier', x: 12, y: 2, aboard: 'ship' });
    expect(isFull(one, u(one, 'ship'))).toBe(false);
    expect(isFull(one, u(one, 'ship'), 1)).toBe(true);
    const mixed = withUnit(one, { id: 'r2', x: 12, y: 2, aboard: 'ship' });
    expect(isFull(mixed, u(mixed, 'ship'))).toBe(true);
    // a settler off the beach does not go ashore with the troops
    const beach = invadeRequests(mixed, me(mixed))[0]!;
    const there = { ...mixed, units: { ...mixed.units, ship: { ...u(mixed, 'ship'), x: beach.x, y: beach.y }, r1: { ...u(mixed, 'r1'), x: beach.x, y: beach.y }, r2: { ...u(mixed, 'r2'), x: beach.x, y: beach.y } } };
    expect(landingStep(there, u(there, 'r2'), u(there, 'ship'), me(there))).toBeNull();
    expect(landingStep(there, u(there, 'r1'), u(there, 'ship'), me(there))).not.toBeNull();
    // and nobody lands from a ship that is not at a beach
    expect(landingStep(mixed, u(mixed, 'r1'), u(mixed, 'ship'), me(mixed))).toBeNull();
  });

  it('troops with nothing to do in a quiet region board a transport in port for it', () => {
    // our small island colony: 28 squares, 20 x (1 + 1) = 40: well settled, and nobody at odds with us there
    let s = col(col(col(base({ b: 'war' }, 160), 'home', 14, 4), 'theirs', 9, 4, 'b', 7), 'other', 9, 7, 'b', 1);
    s = col(s, 'second', 17, 6);
    // (guns throughout: colonist-type units would raise what the colony wants for itself)
    for (const [id, x, y] of [['g1', 14, 4], ['g3', 17, 6]] as const) s = troop(s, id, x, y, 'artillery', 'a', { orders: 'fortified' });
    expect(isQuiet(s, me(s), landmassAt(s.map, 14, 4))).toBe(true);
    expect(isQuiet(s, me(s), landmassAt(s.map, 9, 4))).toBe(false);
    s = withUnit(troop(troop(s, 's1', 14, 4, 'artillery'), 's2', 14, 4, 'artillery'), { id: 'ship', type: 'caravel', profession: null, x: 14, y: 4 });
    expect(policy(s)).toEqual({ type: 'setOrders', unitId: 's1', orders: 'sentry' });
    let next = applyAction(s, policy(s)).state;
    expect(policy(next)).toEqual({ type: 'setOrders', unitId: 's2', orders: 'sentry' });
    next = applyAction(next, policy(next)).state;
    // the ship counts them as aboard and sails for the beach, and they go with her
    const sail = policy(next);
    expect(sail).toMatchObject({ type: 'goTo', unitId: 'ship' });
    const gone = applyAction(next, sail).state;
    expect(u(gone, 's1').aboard).toBe('ship');
    expect(u(gone, 's2').aboard).toBe('ship');
    // one spare man does not fill her, so nobody boards
    const short = { ...s, units: Object.fromEntries(Object.entries(s.units).filter(([id]) => id !== 's2')) };
    expect(policy(short)).not.toMatchObject({ type: 'setOrders', orders: 'sentry' });
  });
});

describe('fighting on land', () => {
  /** Our soldier at (5, 4) facing one of theirs at (6, 4), with our colony behind. */
  const facing = (theirs: Unit['type'], stance: Stance, mine: Unit['type'] = 'soldier', extra: Partial<Unit> = {}): GameState =>
    troop(troop(col(troop(base(stance), 'guard', 2, 4, 'soldier', 'a', { orders: 'fortified' }), 'home', 2, 4), 'mine', 5, 4, mine, 'a', extra), 'foe', 6, 4, theirs, 'b');
  const attacks = (s: GameState): boolean => landAttackChoice(s, u(s, 'mine'), me(s)) !== null;

  it('scaled odds are 8 x attack / (defence + 1), threefold against a colony and twofold against a settlement', () => {
    const open = facing('colonist', { b: 'war' });
    const a = analyseAttack(open, u(open, 'mine'), 1, 0)!;
    expect(scaledOdds(open, u(open, 'mine'), 1, 0)).toBe(Math.trunc((8 * a.attacker.strength) / (a.defender.strength + 1)));
    const town = troop(col(base({ b: 'war' }), 'theirs', 6, 4, 'b', 2), 'mine', 5, 4);
    const t = analyseAttack(town, u(town, 'mine'), 1, 0)!;
    expect(scaledOdds(town, u(town, 'mine'), 1, 0)).toBe(3 * Math.trunc((8 * t.attacker.strength) / (t.defender.strength + 1)));
    const camp = troop(col(withVillage(base(), village(6, 4), 90), 'home', 2, 4), 'mine', 5, 4);
    const v = analyseAttack(camp, u(camp, 'mine'), 1, 0)!;
    expect(scaledOdds(camp, u(camp, 'mine'), 1, 0)).toBe(2 * Math.trunc((8 * v.attacker.strength) / (v.defender.strength + 1)));
    // nothing there: no odds
    expect(scaledOdds(open, u(open, 'mine'), -1, 0)).toBe(0);
  });

  it('an attack needs scaled odds of 12', () => {
    // whatever stands opposite, the attack is made exactly when the odds reach twelve
    const seen = new Set<boolean>();
    for (const theirs of ['colonist', 'soldier', 'dragoon', 'artillery', 'scout'] as const) {
      for (const mine of ['soldier', 'dragoon'] as const) {
        const s = facing(theirs, { b: 'war' }, mine);
        const due = scaledOdds(s, u(s, 'mine'), 1, 0) >= 12;
        expect(attacks(s), `${mine} on ${theirs}`).toBe(due);
        seen.add(due);
      }
    }
    expect([...seen].sort()).toEqual([false, true]);
    // soldier on soldier in the open: 8 x 3 / 3 = 8
    const even = established(facing('soldier', { b: 'war' }));
    expect(scaledOdds(even, u(even, 'mine'), 1, 0)).toBe(8);
    expect(policy(even).type).not.toBe('attack');
    const sure = established(facing('colonist', { b: 'war' }));
    expect(policy(sure)).toEqual({ type: 'attack', unitId: 'mine', dx: 1, dy: 0 });
  });

  it('Europeans only at war; after the Declaration only the human', () => {
    expect(attacks(facing('colonist', { b: 'peace' }))).toBe(false);
    expect(attacks(facing('colonist', {}))).toBe(false);
    expect(mayAttack(facing('colonist', { b: 'war' }), me(base({ b: 'war' })), 6, 4)).toBe(true);
    const declared = { ...facing('colonist', { b: 'war' }), crownPlayer: 'crown' };
    expect(attacks(declared)).toBe(false);
  });

  it('natives only at 75 alarm, and only where the power has a colony on that landmass', () => {
    const beside = (alarm: number, home = true): GameState => {
      const s = withVillage(troop(base(), 'mine', 5, 4), village(6, 4), alarm);
      return home ? col(s, 'home', 2, 4) : col(s, 'home', 15, 4);
    };
    expect(mayAttack(beside(75), me(beside(75)), 6, 4)).toBe(true);
    expect(mayAttack(beside(74), me(beside(74)), 6, 4)).toBe(false);
    expect(mayAttack(beside(90, false), me(beside(90, false)), 6, 4)).toBe(false);
    expect(attacks(beside(74))).toBe(false);
  });

  it('only with a whole move in hand, and never from aboard ship', () => {
    expect(attacks(facing('colonist', { b: 'war' }, 'soldier', { movesLeft: 2 }))).toBe(false);
    const afloat = withUnit(facing('colonist', { b: 'war' }, 'soldier', { aboard: 'ship' }), { id: 'ship', type: 'caravel', profession: null, x: 5, y: 4 });
    expect(attacks(afloat)).toBe(false);
    // colonists and scouts do not attack at all
    expect(attacks(facing('colonist', { b: 'war' }, 'colonist'))).toBe(false);
  });

  it('artillery is kept for colonies and settlements', () => {
    const gun = facing('colonist', { b: 'war' }, 'artillery');
    expect(scaledOdds(gun, u(gun, 'mine'), 1, 0)).toBe(0);
    expect(attacks(gun)).toBe(false);
    const town = troop(col(base({ b: 'war' }), 'theirs', 6, 4, 'b', 2), 'mine', 5, 4, 'artillery');
    expect(scaledOdds(town, u(town, 'mine'), 1, 0)).toBeGreaterThanOrEqual(12);
    expect(attacks(town)).toBe(true);
  });

  it("soldiers and dragoons assault a colony only when the friendly attack strength next to it exceeds the garrison's; a lone unit waits", () => {
    // their colony with one soldier in it (attack 2)
    const town = troop(col(col(troop(base({ b: 'war' }), 'guard', 2, 4, 'soldier', 'a', { orders: 'fortified' }), 'home', 2, 4), 'theirs', 6, 4, 'b', 5), 'def', 6, 4, 'soldier', 'b');
    const lone = troop(town, 'mine', 5, 4, 'dragoon');
    // a dragoon (3) against a soldier (2) out-totals him
    expect(assaultReady(lone, me(lone), { x: 6, y: 4 })).toBe(true);
    const soldier = troop(town, 'mine', 5, 4);
    // a soldier (2) against a soldier (2) does not, whatever the odds
    expect(assaultReady(soldier, me(soldier), { x: 6, y: 4 })).toBe(false);
    expect(attacks(soldier)).toBe(false);
    expect(policy(established(soldier))).toEqual({ type: 'endTurn' });
    // a second man alongside makes four against two
    const two = troop(soldier, 'mate', 5, 5);
    expect(assaultReady(two, me(two), { x: 6, y: 4 })).toBe(true);
    // an undefended colony needs no massing
    const open = troop(col(base({ b: 'war' }), 'theirs', 6, 4, 'b', 2), 'mine', 5, 4);
    expect(assaultReady(open, me(open), { x: 6, y: 4 })).toBe(true);
    expect(attacks(open)).toBe(true);
  });
});
