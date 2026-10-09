import { describe, expect, it } from 'vitest';
import { applyAction } from '../../../../src/engine/actions';
import { FATHER_CATEGORIES, FATHER_ERAS, FATHER_IDS, FATHERS } from '../../../../src/engine/data/fathers';
import type { Unit } from '../../../../src/engine/state';
import { isExploredBy } from '../../../../src/engine/tile';
import { withUnit, world } from '../../../helpers/world';

describe('Founding Fathers table', () => {
  it('matches the snapshot: exactly 25, five to a category', () => {
    expect(FATHERS).toMatchSnapshot();
    expect(FATHER_IDS).toHaveLength(25);
    expect(Object.keys(FATHERS)).toEqual([...FATHER_IDS]);
    for (const category of FATHER_CATEGORIES) expect(FATHER_IDS.filter((id) => FATHERS[id].category === category), category).toHaveLength(5);
    expect(FATHER_ERAS).toEqual([1600, 1700]);
  });

  it('carries the era weights of the original table', () => {
    const w = (id: keyof typeof FATHERS): readonly number[] => FATHERS[id].weights;
    expect(w('adamSmith')).toEqual([2, 8, 6]);
    expect(w('jakobFugger')).toEqual([0, 5, 8]);
    expect(w('peterMinuit')).toEqual([9, 1, 0]);
    expect(w('peterStuyvesant')).toEqual([2, 4, 8]);
    expect(w('janDeWitt')).toEqual([2, 6, 10]);
    expect(w('ferdinandMagellan')).toEqual([2, 10, 10]);
    expect(w('franciscoCoronado')).toEqual([3, 5, 7]);
    expect(w('hernandoDeSoto')).toEqual([5, 10, 5]);
    expect(w('henryHudson')).toEqual([10, 1, 0]);
    expect(w('laSalle')).toEqual([7, 5, 3]);
    expect(w('hernanCortes')).toEqual([6, 5, 1]);
    expect(w('georgeWashington')).toEqual([0, 4, 10]);
    expect(w('paulRevere')).toEqual([10, 2, 1]);
    expect(w('francisDrake')).toEqual([4, 8, 6]);
    expect(w('johnPaulJones')).toEqual([0, 6, 7]);
    expect(w('thomasJefferson')).toEqual([4, 5, 6]);
    expect(w('pocahontas')).toEqual([7, 5, 3]);
    expect(w('thomasPaine')).toEqual([1, 2, 8]);
    expect(w('simonBolivar')).toEqual([0, 4, 6]);
    expect(w('benjaminFranklin')).toEqual([5, 5, 5]);
    expect(w('williamBrewster')).toEqual([7, 4, 1]);
    expect(w('williamPenn')).toEqual([8, 5, 2]);
    expect(w('jeanDeBrebeuf')).toEqual([6, 6, 1]);
    expect(w('juanDeSepulveda')).toEqual([3, 8, 3]);
    expect(w('bartolomeDeLasCasas')).toEqual([0, 5, 10]);
  });
});

describe('fathers that change movement and sight', () => {
  const rows = ['~~~~~~~~~~', '~........~', '~........~', '~........~', '~........~', '~........~', '~~~~~~~~~~'];
  const fog = (fathers: string[]) => {
    const s = withUnit(world({ rows, players: [{ id: 'a', fathers }, { id: 'b' }] }), { id: 'u', x: 3, y: 3 });
    return { ...s, map: { ...s.map, tiles: s.map.tiles.map((t) => ({ ...t, explored: 0 })) } };
  };

  it('de Soto lets every unit see one square farther', () => {
    const plain = applyAction(fog([]), { type: 'moveUnit', unitId: 'u', dx: 1, dy: 0 }).state;
    const soto = applyAction(fog(['hernandoDeSoto']), { type: 'moveUnit', unitId: 'u', dx: 1, dy: 0 }).state;
    expect(plain.map.tiles.filter((t) => isExploredBy(t, 0))).toHaveLength(9);
    expect(soto.map.tiles.filter((t) => isExploredBy(t, 0))).toHaveLength(25);
  });

  it('Magellan gives ships, and only ships, one more move each turn', () => {
    const fleet = (fathers: string[]) => {
      let s = world({ rows: ['~~~~~~~~~~', '~~~~~~~~~~', '~........~', '~~~~~~~~~~'], players: [{ id: 'a', fathers }, { id: 'b' }] });
      s = withUnit(withUnit(s, { id: 'ship', type: 'caravel', x: 2, y: 1 }), { id: 'c', x: 2, y: 2 });
      return applyAction(applyAction(s, { type: 'endTurn' }).state, { type: 'endTurn' }).state;
    };
    expect((fleet([]).units['ship'] as Unit).movesLeft).toBe(12);
    expect((fleet(['ferdinandMagellan']).units['ship'] as Unit).movesLeft).toBe(15);
    expect((fleet(['ferdinandMagellan']).units['c'] as Unit).movesLeft).toBe(3);
  });
});
