import { describe, expect, it } from 'vitest';
import { PLACEMENT } from '../../../src/engine/data/placement';
import { checkInvariants } from '../../../src/engine/invariants';
import { placeIdle, suggestPlacement } from '../../../src/engine/placement';
import type { Colonist, Colony, GameState } from '../../../src/engine/state';
import { setTile, withBids, withColony, world } from '../../helpers/world';

// Colony at (3,2): plains east and west, forest north-west, grassland (tobacco) north-east, hills south, sea far west.
// x: 0123456
const ROWS = [
  '~~~~~~~',
  '~~f.g.~',
  '~~...~~',
  '~~.h..~',
  '~~~~~~~',
];
const HOUSES = ['townHall', 'carpentersShop', 'blacksmithsHouse', 'tobacconistsHouse', 'weaversHouse', 'rumDistillersHouse', 'furTradersHouse'];
const farmer = (id: string, dx: number, dy: number): Colonist => ({ id, profession: 'freeColonist', job: { kind: 'field', dx, dy, good: 'food' }, turns: 0 });
const idle = (id: string, profession: Colonist['profession'] = 'freeColonist'): Colonist => ({ id, profession, job: { kind: 'idle' }, turns: 0 });
// fixed prices so the choice of work does not depend on the opening market draw
const BIDS = { sugar: 5, tobacco: 4, cotton: 3, furs: 5, lumber: 1, ore: 5, silver: 19 } as const;
const town = (colonists: Colonist[], extra: Partial<Colony> = {}): GameState =>
  withColony(withBids(world({ rows: ROWS }), BIDS), { id: 'col', x: 3, y: 2, colonists, buildings: HOUSES, goods: { food: 20 }, ...extra });
const col = (s: GameState): Colony => s.colonies['col'] as Colony;
const suggest = (s: GameState, profession: Colonist['profession'] = 'freeColonist') => suggestPlacement(s, col(s), profession);

describe('suggestPlacement', () => {
  it('feeds the colony first: a hungry colony sends the newcomer to the best food square', () => {
    expect(PLACEMENT).toMatchSnapshot();
    // three idlers eat 6, the colony square makes 3: hungry
    const s = town([idle('a'), idle('b'), idle('c')]);
    const job = suggest(s);
    expect(job).toMatchObject({ kind: 'field', good: 'food' });
    // plains (5 food) rather than grassland (3) or forest (3)
    expect([[1, 0], [-1, 0], [0, -1], [1, 1], [-1, 1]]).toContainEqual(job.kind === 'field' ? [job.dx, job.dy] : []);
  });

  it('prefers the nearer of two equal food squares, and wheat over plain plains', () => {
    const s = town([idle('a'), idle('b'), idle('c')]);
    const first = suggest(s);
    expect(first.kind === 'field' && Math.abs(first.dx) + Math.abs(first.dy)).toBe(1); // orthogonal beats diagonal
    const wheat = setTile(s, 4, 3, { resource: 'wheat' }); // a diagonal square
    expect(suggest(wheat)).toEqual({ kind: 'field', dx: 1, dy: 1, good: 'food' });
  });

  it('once fed, takes the most valuable work by yield and price', () => {
    // one farmer feeds himself and the newcomer with room to spare
    const s = town([farmer('a', 1, 0)], { goods: { food: 20, lumber: 30 } });
    // 4 ore on the hills (5 gold each) beats 3 tobacco on the grassland (4 each)
    expect(suggest(s)).toEqual({ kind: 'field', dx: 0, dy: 1, good: 'ore' });
    // without the hills, 3 furs from the forest (5 each) beat 3 tobacco (4 each)
    const flat = setTile(s, 3, 3, { relief: 'flat' });
    expect(suggest(flat)).toEqual({ kind: 'field', dx: -1, dy: -1, good: 'furs' });
    // and with the forest cleared, tobacco beats more food
    expect(suggest(setTile(flat, 2, 1, { forest: false }))).toEqual({ kind: 'field', dx: 1, dy: -1, good: 'tobacco' });
  });

  it('does not pile up what the warehouse cannot keep', () => {
    const s = setTile(town([farmer('a', 1, 0)], { goods: { food: 20, lumber: 30, ore: 100 } }), 4, 1, { base: 'plains' });
    // the warehouse is full of ore, so the hills lose their appeal and the forest's furs win
    expect(suggest(s)).toEqual({ kind: 'field', dx: -1, dy: -1, good: 'furs' });
  });

  it('with three people, a project and enough food, the first spare hand becomes a carpenter', () => {
    const fed = [farmer('a', 1, 0), farmer('b', -1, 0)];
    const building = town(fed, { construction: { kind: 'building', id: 'stable' } });
    expect(suggest(building)).toEqual({ kind: 'work', trade: 'carpenter' });
    expect(suggest(town(fed))).not.toEqual({ kind: 'work', trade: 'carpenter' }); // nothing to build
    expect(suggest(town([farmer('a', 1, 0)], { construction: { kind: 'building', id: 'stable' } }))).not.toEqual({ kind: 'work', trade: 'carpenter' }); // only two people
    const taken = town([...fed, { id: 'c', profession: 'freeColonist', job: { kind: 'work', trade: 'carpenter' }, turns: 0 }], { construction: { kind: 'building', id: 'stable' } });
    expect(suggest(taken)).not.toEqual({ kind: 'work', trade: 'carpenter' }); // one is enough
    const hungry = town([idle('a'), idle('b')], { construction: { kind: 'building', id: 'stable' } });
    expect(suggest(hungry)).toMatchObject({ kind: 'field', good: 'food' });
  });

  it('an expert leans toward his own trade', () => {
    const s = town([farmer('a', 1, 0), farmer('b', -1, 0)], { goods: { food: 20, lumber: 30 } });
    expect(suggest(s, 'expertOreMiner')).toEqual({ kind: 'field', dx: 0, dy: 1, good: 'ore' });
    // lumber fetches little, so even a lumberjack is sent to cut it only while the colony has none
    const bare = town([farmer('a', 1, 0), farmer('b', -1, 0)]);
    expect(suggest(bare, 'expertLumberjack')).toEqual({ kind: 'field', dx: -1, dy: -1, good: 'lumber' });
    expect(suggest(s, 'masterTobaccoPlanter')).toEqual({ kind: 'field', dx: 1, dy: -1, good: 'tobacco' });
  });

  it('fishes only where there are Docks', () => {
    const coast = ['~~~~~', '~~a~~', '~~a~~', '~~~~~'];
    const dry = withColony(world({ rows: coast }), { id: 'col', x: 2, y: 2, colonists: [idle('a')], buildings: HOUSES });
    expect(suggest(dry, 'expertFisherman')).toEqual({ kind: 'work', trade: 'carpenter' });
    const docks = withColony(world({ rows: coast }), { id: 'col', x: 2, y: 2, colonists: [idle('a')], buildings: [...HOUSES, 'docks'] });
    expect(suggest(docks, 'expertFisherman')).toMatchObject({ kind: 'field', good: 'fish' });
  });

  it('never suggests a square that is taken, native-owned or foreign-held, and falls back to idle with no workshop', () => {
    const rows = ['~~~~~', '~~.~~', '~~a~~', '~~~~~'];
    const one = withColony(world({ rows }), { id: 'col', x: 2, y: 2, colonists: [farmer('a', 0, -1)], buildings: [] });
    expect(suggest(one)).toEqual({ kind: 'idle' });
    const native = setTile(withColony(world({ rows }), { id: 'col', x: 2, y: 2, colonists: [idle('a')], buildings: [] }), 2, 1, { homeland: 'sioux' });
    expect(suggest(native)).toEqual({ kind: 'idle' });
  });
});

describe('placeIdle', () => {
  it('puts every idle colonist to work on a different square and leaves the rest alone', () => {
    const s = town([farmer('a', 1, 0), idle('b'), idle('c'), idle('d')]);
    const placed = placeIdle(s, 'col');
    expect(checkInvariants(placed)).toEqual([]);
    const jobs = col(placed).colonists.map((c) => c.job);
    expect(jobs[0]).toEqual({ kind: 'field', dx: 1, dy: 0, good: 'food' });
    expect(jobs.filter((j) => j.kind === 'idle')).toHaveLength(0);
    const squares = jobs.filter((j) => j.kind === 'field').map((j) => (j.kind === 'field' ? `${j.dx},${j.dy}` : ''));
    expect(new Set(squares).size).toBe(squares.length);
    expect(placeIdle(s, 'nope')).toBe(s);
  });
});
