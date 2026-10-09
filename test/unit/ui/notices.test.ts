import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../../../src/engine/actions';
import type { GameState } from '../../../src/engine/state';
import { cargoNotices, colonyNotices, movementNotices } from '../../../src/ui/notices';
import { DEFAULT_OPTIONS, type Options } from '../../../src/ui/options';
import { setTile, withColony, withUnit, world } from '../../helpers/world';

const ROWS = ['~~~~~~~~~~', '~........~', '~........~', '~........~', '~~~~~~~~~~'];
const base = (): GameState => {
  let s = world({ rows: ROWS, players: [{ id: 'a' }, { id: 'b', kind: 'ai', nation: 'france' }] });
  s = withColony(s, { id: 'james', x: 2, y: 2, name: 'Jamestown', goods: { furs: 120, food: 300, cloth: 99 } });
  return withColony(s, { id: 'theirs', owner: 'b', x: 7, y: 2, name: 'Quebec', goods: { furs: 500 } });
};
const off = (...keys: (keyof Options)[]): Options => ({ ...DEFAULT_OPTIONS, ...Object.fromEntries(keys.map((k) => [k, false])) });

const EVENTS: GameEvent[] = [
  { type: 'colonistTaught', colonyId: 'james', teacherId: 't', studentId: 's', from: 'freeColonist', to: 'expertFarmer' },
  { type: 'foodLow', colonyId: 'james', turnsLeft: 2 },
  { type: 'ranOutOf', colonyId: 'james', good: 'ore' },
  { type: 'needTools', colonyId: 'james', item: { kind: 'building', id: 'stockade' }, missing: 30 },
  { type: 'toriesObstruct', colonyId: 'james' },
  { type: 'membershipChanged', colonyId: 'james', percent: 40, rising: true },
  { type: 'rebelMajority', colonyId: 'james', percent: 52 },
  { type: 'buildingCompleted', colonyId: 'james', building: 'stockade', tools: 0 },
  { type: 'colonistStarved', colonyId: 'james', colonistId: 'x' },
  { type: 'foodLow', colonyId: 'theirs', turnsLeft: 1 },
];

describe('colony notices', () => {
  it('one line for each thing the player wants to hear about, for their own colonies only', () => {
    expect(colonyNotices(EVENTS, base(), 'a', DEFAULT_OPTIONS)).toEqual([
      'Jamestown: a colonist has been taught and is now an Expert Farmer.',
      'Jamestown: food will run out in 2 turns.',
      'Jamestown: work has stopped for want of ore.',
      'Jamestown: the Stockade needs 30 more tools.',
      'Jamestown: Tory feeling is slowing every worker in the colony.',
      'Jamestown: Sons of Liberty membership has risen to 40%.',
      'Jamestown: half the colony now stands with the Sons of Liberty (52%). Production rises.',
      'Jamestown has completed its Stockade.',
      'Jamestown: a colonist has starved.',
    ]);
  });

  it('each report option silences its own kind and no other', () => {
    const lines = (options: Options): string[] => colonyNotices(EVENTS, base(), 'a', options);
    const all = lines(DEFAULT_OPTIONS);
    const cases: [keyof Options, RegExp][] = [['reportTrained', /taught/], ['reportFood', /food will run out/], ['reportRawMaterials', /want of ore/], ['reportTools', /more tools/], ['reportInefficient', /Tory feeling/], ['reportSonsOfLiberty', /membership has risen/], ['reportRebelMajority', /half the colony/]];
    for (const [key, pattern] of cases) expect(lines(off(key)), key).toEqual(all.filter((l) => !pattern.test(l)));
    // a death and a finished building are always told
    const silent = lines(off('reportTrained', 'reportFood', 'reportRawMaterials', 'reportTools', 'reportInefficient', 'reportNewCargo', 'reportSonsOfLiberty', 'reportRebelMajority'));
    expect(silent).toEqual(['Jamestown has completed its Stockade.', 'Jamestown: a colonist has starved.']);
  });
});

describe('new cargo', () => {
  it('is announced when a colony first has a full load of something to ship', () => {
    const before = base();
    const after = { ...before, colonies: { ...before.colonies, james: { ...before.colonies['james']!, goods: { furs: 130, food: 400, cloth: 104, rum: 100 } } } };
    expect(cargoNotices(before, after, 'a', DEFAULT_OPTIONS)).toEqual(['Jamestown: 104 cloth is ready to be shipped.', 'Jamestown: 100 rum is ready to be shipped.']);
    expect(cargoNotices(before, after, 'a', off('reportNewCargo'))).toEqual([]);
    expect(cargoNotices(before, before, 'a', DEFAULT_OPTIONS)).toEqual([]);
  });
});

describe('moves seen', () => {
  const seen = (): { before: GameState; after: GameState } => {
    let before = withUnit(base(), { id: 'ours', type: 'soldier', x: 4, y: 2 });
    before = withUnit(before, { id: 'ship', owner: 'b', type: 'caravel', profession: null, x: 0, y: 3 });
    before = withUnit(before, { id: 'brave', owner: 'tribe:sioux', type: 'brave', profession: null, x: 6, y: 3 });
    before = withUnit(before, { id: 'far', owner: 'b', type: 'soldier', x: 8, y: 3 });
    const move = (s: GameState, id: string, x: number, y: number): GameState => ({ ...s, units: { ...s.units, [id]: { ...s.units[id]!, x, y } } });
    let after = move(move(move(before, 'ship', 3, 4), 'brave', 5, 3), 'far', 8, 1);
    after = withUnit(after, { id: 'new', owner: 'b', type: 'scout', x: 3, y: 1 });
    return { before, after };
  };

  it('foreign and native units that moved near us are noted', () => {
    const { before, after } = seen();
    expect(movementNotices(before, after, 'a', DEFAULT_OPTIONS)).toEqual([
      'A French Caravel has moved to (3, 4).',
      'Sioux braves have moved to (5, 3).',
      'A French Scout has appeared at (3, 1).',
    ]);
  });

  it('each kind only if asked for, never what lies in the dark, and a crowd is summed up', () => {
    const { before, after } = seen();
    expect(movementNotices(before, after, 'a', off('showIndianMoves')).join(' ')).not.toContain('Sioux');
    expect(movementNotices(before, after, 'a', off('showForeignMoves'))).toEqual(['Sioux braves have moved to (5, 3).']);
    expect(movementNotices(before, setTile(after, 5, 3, { explored: 0 }), 'a', DEFAULT_OPTIONS).join(' ')).not.toContain('Sioux');
    expect(movementNotices(before, after, 'a', DEFAULT_OPTIONS, 1)).toEqual(['A French Caravel has moved to (3, 4).', '2 more foreign or native units were seen on the move.']);
    expect(movementNotices(before, before, 'a', DEFAULT_OPTIONS)).toEqual([]);
  });
});
