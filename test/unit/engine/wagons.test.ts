import { describe, expect, it } from 'vitest';
import { wagonHomes } from '../../../src/engine/wagons';
import type { GameState } from '../../../src/engine/state';
import { withColony, withUnit, world } from '../../helpers/world';

// a mainland and an island
const ROWS = Array.from({ length: 7 }, (_, y) => (y === 0 || y === 6 ? '~'.repeat(16) : `~${'.'.repeat(10)}~~..~`));
const base = (): GameState => withColony(withColony(world({ rows: ROWS }), { id: 'west', x: 2, y: 3 }), { id: 'east', x: 9, y: 3 });
const wagon = (s: GameState, id: string, x: number, y: number, owner = 'a'): GameState => withUnit(s, { id, type: 'wagonTrain', profession: null, x, y, owner });

describe('which colony a wagon train serves', () => {
  it('the one it stands in, otherwise the nearest on its landmass that no other wagon has', () => {
    expect(wagonHomes(wagon(base(), 'w1', 2, 3), 'a')).toEqual({ w1: 'west' });
    expect(wagonHomes(wagon(base(), 'w1', 7, 2), 'a')).toEqual({ w1: 'east' });
    // the earlier wagon has first call on the colony both are nearest to
    const two = wagon(wagon(base(), 'w1', 7, 2), 'w2', 8, 4);
    expect(wagonHomes(two, 'a')).toEqual({ w1: 'east', w2: 'west' });
    // but a wagon standing in a colony keeps it whatever its number
    const inside = wagon(wagon(base(), 'w1', 8, 3), 'w2', 9, 3);
    expect(wagonHomes(inside, 'a')).toEqual({ w1: 'west', w2: 'east' });
  });

  it('none for a wagon with no colony of its own on its landmass; other powers do not count', () => {
    expect(wagonHomes(wagon(base(), 'w1', 13, 3), 'a')).toEqual({});
    const theirs = withColony(world({ rows: ROWS }), { id: 'c', x: 2, y: 3, owner: 'b' });
    expect(wagonHomes(wagon(theirs, 'w1', 3, 3), 'a')).toEqual({});
    expect(wagonHomes(wagon(base(), 'w1', 3, 3, 'b'), 'a')).toEqual({});
  });
});
