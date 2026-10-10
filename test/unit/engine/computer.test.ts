import { describe, expect, it } from 'vitest';
import { computerColonies, groundWanted, landWork } from '../../../src/engine/computer';
import { AI_UPKEEP } from '../../../src/engine/data/ai';
import { checkInvariants } from '../../../src/engine/invariants';
import type { Colonist, Colony, GameState, Job } from '../../../src/engine/state';
import { tileAt } from '../../../src/engine/state';
import { setTile, withColony, withUnit, world } from '../../helpers/world';

// plains all round the colony at (3, 3), with one forest to its north-east
const ROWS = ['~~~~~~~', '~.....~', '~...f.~', '~.....~', '~.....~', '~.....~', '~~~~~~~'];
const man = (id: string, profession: Colonist['profession'] = 'freeColonist', job: Job = { kind: 'idle' }): Colonist => ({ id, profession, job, turns: 0 });
const field = (dx: number, dy: number, good: 'food' | 'lumber' | 'ore' | 'cotton' = 'food'): Job => ({ kind: 'field', dx, dy, good });
interface Spec { colonists?: Colonist[]; goods?: Colony['goods']; buildings?: string[]; waited?: number; gold?: number; turn?: number; kind?: 'ai' | 'human'; taxRate?: number }
function town(o: Spec = {}): GameState {
  const s = world({ rows: ROWS, players: [{ id: 'a', kind: o.kind ?? 'ai', taxRate: o.taxRate ?? 0 }, { id: 'b' }] });
  const priced: GameState = { ...s, turn: o.turn ?? 11, players: s.players.map((p) => (p.id === 'a' ? { ...p, gold: o.gold ?? 1000 } : p)) };
  return withColony(priced, { id: 'col', x: 3, y: 3, colonists: o.colonists ?? [man('m')], goods: o.goods ?? {}, buildings: o.buildings ?? ['townHall'], ...(o.waited === undefined ? {} : { waited: o.waited }) });
}
const col = (s: GameState): Colony => s.colonies['col'] as Colony;
const gold = (s: GameState): number => s.players[0]?.gold ?? 0;
type Happened = NonNullable<Parameters<typeof computerColonies>[2]>;
const run = (s: GameState): { state: GameState; events: Happened } => {
  const events: Happened = [];
  const state = computerColonies(s, 'a', events);
  expect(checkInvariants(state)).toEqual([]);
  return { state, events };
};

describe('upkeep rule table', () => {
  it('matches the snapshot', () => {
    expect(AI_UPKEEP).toMatchSnapshot();
  });
});

describe('the upkeep of a computer power\'s colony', () => {
  it('is not for a human player', () => {
    const s = town({ kind: 'human' });
    expect(computerColonies(s, 'a')).toBe(s);
  });

  it('twenty tools bought at their price level each while it has under twenty and a worked square to improve (or on every tenth turn)', () => {
    const farming = [man('m', 'freeColonist', field(1, 0))];
    const before = town({ gold: 1000, colonists: farming });
    const { state, events } = run(before);
    const each = (gold(before) - gold(state)) / 20;
    expect(col(state).goods.tools).toBe(20);
    expect(each).toBeGreaterThan(0);
    expect(events).toEqual([{ type: 'colonySupplied', colonyId: 'col', player: 'a', good: 'tools', amount: 20, cost: 20 * each }]);
    // not with twenty in store, and not without the gold
    expect(run(town({ goods: { tools: 20 }, waited: 0, colonists: farming })).events).toEqual([]);
    expect(run(town({ gold: 0, colonists: farming })).events).toEqual([]);
    // with nobody working unimproved ground: only on a turn divisible by ten
    expect(run(town({ gold: 1000 })).events).toEqual([]);
    expect(run(town({ gold: 1000, turn: 20 })).events).toHaveLength(1);
  });

  it('a square a colonist works is improved first: the plow for his crop, for twenty tools, once the colony has waited long enough', () => {
    const farming = town({ colonists: [man('m', 'freeColonist', field(1, 0))], goods: { tools: 20 }, waited: 0 });
    expect(landWork(farming, col(farming))).toMatchObject({ dx: 1, dy: 0, job: 'plow' });
    const wait = landWork(farming, col(farming))!.wait;
    // not yet
    expect(tileAt(run(farming).state.map, 4, 3)?.plowed).toBe(false);
    const ready = town({ colonists: [man('m', 'freeColonist', field(1, 0))], goods: { tools: 20 }, waited: wait - 1 });
    const improved = run(ready);
    const done = improved.state;
    expect(improved.events).toEqual([{ type: 'tileImproved', x: 4, y: 3, improvement: 'plowed', unitId: 'col' }]);
    expect(tileAt(done.map, 4, 3)?.plowed).toBe(true);
    expect(col(done).goods.tools ?? 0).toBe(0);
    expect(col(done).waited).toBe(0);
    // never on a turn divisible by seven
    expect(tileAt(run({ ...ready, turn: 14 }).state.map, 4, 3)?.plowed).toBe(false);
  });

  it('a road where he fells or mines; forest is cleared only when farmland is short', () => {
    const felling = town({ colonists: [man('m', 'freeColonist', field(1, -1, 'lumber'))], goods: { tools: 20 } });
    expect(landWork(felling, col(felling))).toMatchObject({ dx: 1, dy: -1, job: 'road' });
  });

  it('a servant or criminal at the carpenter\'s bench becomes a free colonist', () => {
    const s = town({ colonists: [man('s', 'indenturedServant', { kind: 'work', trade: 'carpenter' }), man('c', 'pettyCriminal'), man('x', 'expertFarmer', { kind: 'work', trade: 'carpenter' })], buildings: ['townHall', 'carpentersShop'], goods: { tools: 20 }, waited: 0 });
    expect(col(run(s).state).colonists.map((k) => k.profession)).toEqual(['freeColonist', 'pettyCriminal', 'expertFarmer']);
  });

  it('a school turns one colonist into an expert of the trade he works, after four turns\' wait', () => {
    const s = (waited: number): GameState => town({ colonists: [man('m', 'freeColonist', field(1, 0))], buildings: ['townHall', 'schoolhouse'], goods: { tools: 20 }, gold: 0, waited, turn: 14 });
    expect(col(run(s(2)).state).colonists[0]?.profession).toBe('freeColonist');
    const taught = col(run(s(3)).state);
    expect(taught.colonists[0]?.profession).toBe('expertFarmer');
    expect(taught.waited).toBe(0);
  });

  it('short of food, its last unskilled colonist is trained to farm, while taxes are no more than 25 and the treasury holds a farmer\'s training price', () => {
    const six = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'].map((id) => man(id));
    const hungry = (extra: Spec = {}): GameState => town({ colonists: six, goods: { tools: 20 }, gold: 5000, waited: 0, ...extra });
    const { state } = run(hungry());
    expect(col(state).colonists.map((k) => k.profession)).toEqual([...Array<string>(5).fill('freeColonist'), 'expertFarmer']);
    // the fee is the price of the trade sixth in the list of trades (the lumberjack's 700), and the tax rate goes up by one
    expect(gold(state)).toBe(5000 - 700);
    expect(state.players[0]?.taxRate).toBe(1);
    // the third in a colony of three stands where a trade with no price does, and a gold piece comes back
    const three = run(hungry({ colonists: six.slice(0, 3) })).state;
    expect(col(three).colonists[2]?.profession).toBe('expertFarmer');
    expect(gold(three)).toBe(5001);
    expect(col(run(hungry({ taxRate: 26 })).state).colonists.some((k) => k.profession === 'expertFarmer')).toBe(false);
    expect(col(run(hungry({ gold: 1099 })).state).colonists.some((k) => k.profession === 'expertFarmer')).toBe(false);
    // one is enough
    const again = run(state).state;
    expect(col(again).colonists.filter((k) => k.profession === 'expertFarmer')).toHaveLength(1);
  });

  it('from turn 40 a colony with a ship or wagon in it has its horses made up to two for ten gold', () => {
    const s = (turn: number, wagon = true): GameState => {
      const t = town({ goods: { tools: 20 }, waited: 0, turn, gold: 100 });
      return wagon ? withUnit(t, { id: 'w', type: 'wagonTrain', profession: null, x: 3, y: 3 }) : t;
    };
    expect(col(run(s(39)).state).goods.horses ?? 0).toBe(0);
    expect(col(run(s(41, false)).state).goods.horses ?? 0).toBe(0);
    const { state, events } = run(s(41));
    expect(col(state).goods.horses).toBe(2);
    expect(gold(state)).toBe(90);
    expect(events).toEqual([{ type: 'colonySupplied', colonyId: 'col', player: 'a', good: 'horses', amount: 2, cost: 10 }]);
  });

  it('with its defence seen to and 200 muskets, a lot of fifty goes to the power\'s reserve; late in the game the reserve is levelled', () => {
    const s = town({ goods: { tools: 20, muskets: 200 }, waited: 0 });
    const { state, events } = run(s);
    expect(col(state).goods.muskets).toBe(150);
    expect(state.players[0]?.reserve).toEqual({ muskets: 1, horses: 0 });
    expect(events).toContainEqual({ type: 'reserveStocked', colonyId: 'col', player: 'a', good: 'muskets', amount: 50 });
    // not with 199, and not from a colony still short of defenders (three people want one)
    expect(run(town({ goods: { tools: 20, muskets: 199 }, waited: 0 })).state.players[0]?.reserve).toBeUndefined();
    expect(run(town({ colonists: [man('a1'), man('a2'), man('a3')], goods: { tools: 20, muskets: 200, food: 100 }, waited: 0, gold: 0 })).state.players[0]?.reserve).toBeUndefined();
    // after turn 80: four lots and no horses become two lots and a hundred horses (to within one lot of each other)
    const late = town({ goods: { tools: 20 }, waited: 0, turn: 81 });
    const levelled = run({ ...late, players: late.players.map((p) => (p.id === 'a' ? { ...p, reserve: { muskets: 4, horses: 0 } } : p)) });
    expect(levelled.state.players[0]?.reserve).toEqual({ muskets: 2, horses: 100 });
  });

  it('the square improved is the one worth most: a resource before plain ground, a worked square counting double; never beside a human\'s unit', () => {
    const farming = [man('m', 'freeColonist', field(1, 0))];
    const s = town({ colonists: farming, goods: { tools: 20 } });
    // the worked plains square (4 doubled) beats the rest
    expect(landWork(s, col(s))).toMatchObject({ dx: 1, dy: 0, job: 'plow', wait: 3 + 2 });
    // a silver deposit next door is worth 12, more than the worked plains square's 8
    const rich = setTile(s, 2, 2, { resource: 'silverDeposit' });
    expect(landWork(rich, col(rich))).toMatchObject({ dx: -1, dy: -1 });
    // a human's soldier beside the chosen square: nothing is done
    const watched = withUnit(s, { id: 'h', owner: 'b', type: 'soldier', x: 5, y: 3 });
    expect(landWork(watched, col(watched))).toBeNull();
    // with nobody working unimproved ground there is no work at all
    expect(groundWanted(town({}), col(town({})))).toEqual({ work: false, clear: false });
  });

  it('every seventh turn the tools go on a stretch of road toward a sister colony instead', () => {
    const pair = (waited: number): GameState => withColony(town({ goods: { tools: 20 }, waited, turn: 14 }), { id: 'sister', x: 3, y: 5, founded: 0 });
    // the colony is at (3, 3) and its sister at (3, 5): the square between them, once it has waited the work's 3 + 2 turns
    expect(tileAt(run(pair(3)).state.map, 3, 4)?.road).toBe(false);
    const done = run(pair(4));
    expect(tileAt(done.state.map, 3, 4)?.road).toBe(true);
    expect(done.events).toContainEqual({ type: 'tileImproved', x: 3, y: 4, improvement: 'road', unitId: 'col' });
    expect(col(done.state).goods.tools ?? 0).toBe(0);
    // a colony alone has nowhere to build toward
    expect(run(town({ goods: { tools: 20 }, waited: 9, turn: 14 })).events).toEqual([]);
  });

  it('a school in a colony whose second-level workshop has stuff to work and no master teaches the trade that stands at that workshop\'s place in the list', () => {
    // a weaver's shop with cotton coming in and no master weaver: the sixth chain, and the sixth trade is the lumberjack's
    const s = town({ colonists: [man('grower', 'freeColonist', field(1, 0, 'cotton')), ...Array.from({ length: 9 }, (_, i) => man(`x${i}`))], buildings: ['townHall', 'schoolhouse', 'weaversHouse', 'weaversShop'], goods: { tools: 20, food: 100 }, gold: 0, waited: 3, turn: 14 });
    const taught = col(run(s).state).colonists.map((k) => k.profession).filter((p) => p !== 'freeColonist');
    expect(taught).toEqual(['expertLumberjack']);
  });
});
