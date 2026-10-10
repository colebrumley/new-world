import { describe, expect, it } from 'vitest';
import { makeTile } from '../../../src/engine/tile';
import { groundFeatures, tileTip } from '../../../src/ui/tile-tooltip';
import { setTile, world } from '../../helpers/world';

const land = () => world({ rows: ['.....', '.....', '.....'] });

describe('tileTip', () => {
  it('names the terrain row that governs the square', () => {
    let s = land();
    s = setTile(s, 1, 1, { forest: true });
    s = setTile(s, 2, 1, { base: 'grassland', forest: true, relief: 'hills' });
    s = setTile(s, 3, 1, { base: 'grassland' });
    expect(tileTip(s, 1, 1)?.title).toBe('Mixed Forest');
    expect(tileTip(s, 2, 1)?.title).toBe('Hills');
    expect(tileTip(s, 3, 1)?.title).toBe('Grassland');
  });

  it('says what each resource does, from the bonus table', () => {
    const effect = (patch: Parameters<typeof setTile>[3]) => tileTip(setTile(land(), 1, 1, patch), 1, 1)?.features[0];
    expect(effect({ resource: 'wheat' })).toBe('Wheat: +2 Food');
    expect(effect({ base: 'tundra', resource: 'minerals' })).toBe('Minerals: +3 Ore, +1 Silver');
    expect(effect({ base: 'prairie', resource: 'primeCotton' })).toBe('Prime Cotton: doubles Cotton');
    expect(effect({ relief: 'mountains', resource: 'depletedMine' })).toBe('Depleted Mine: nothing left to dig');
    expect(effect({ base: 'ocean', resource: 'fishery' })).toBe('Fishery: +3 Fish');
  });

  it('lists the features in order: resource, river, road, plowed, rumor', () => {
    const s = setTile(land(), 1, 1, { resource: 'wheat', river: 'major', road: true, plowed: true, rumor: true });
    expect(tileTip(s, 1, 1)?.features).toEqual(['Wheat: +2 Food', 'Major River', 'Road', 'Plowed', 'Lost City Rumor']);
    expect(tileTip(setTile(land(), 1, 1, { river: 'minor' }), 1, 1)?.features).toEqual(['Minor River']);
    expect(tileTip(land(), 1, 1)?.features).toEqual([]);
  });

  it('gives what a free colonist brings in', () => {
    expect(tileTip(land(), 1, 1)?.yields).toBe('5 Food, 2 Cotton, 1 Ore');
    const timber = setTile(land(), 1, 1, { base: 'grassland', forest: true, resource: 'primeTimber' });
    expect(tileTip(timber, 1, 1)?.yields).toBe('2 Food, 1 Tobacco, 2 Furs, 10 Lumber');
    const openSea = world({ rows: ['~~~', '~~~', '~~~'] });
    expect(tileTip(openSea, 1, 1)?.yields).toBe('1 Fish');
    const coast = world({ rows: ['...', '.~.', '~~~'] });
    expect(tileTip(coast, 1, 1)?.yields).toBe('4 Fish');
    expect(tileTip(world({ rows: ['a'] }), 0, 0)?.yields).toBe('');
  });

  it('gives the move cost and the defence bonus', () => {
    expect(tileTip(land(), 1, 1)?.ground).toBe('Move 1 · Defence none');
    expect(tileTip(setTile(land(), 1, 1, { forest: true }), 1, 1)?.ground).toBe('Move 2 · Defence +50%');
    expect(tileTip(setTile(land(), 1, 1, { relief: 'hills' }), 1, 1)?.ground).toBe('Move 2 · Defence +100%');
  });

  it('is null off the map and on a square the viewer has not explored, unless all is revealed', () => {
    const s = setTile(land(), 1, 1, { explored: 0b10 });
    expect(tileTip(s, -1, 0)).toBeNull();
    expect(tileTip(s, 5, 0)).toBeNull();
    expect(tileTip(s, 1, 1)).toBeNull();
    expect(tileTip(s, 1, 1, true)?.title).toBe('Plains');
  });
});

describe('groundFeatures', () => {
  it('lists river, road, plowed, resource and rumor in the sidebar order', () => {
    expect(groundFeatures(makeTile({ base: 'plains', resource: 'wheat', river: 'minor', road: true, plowed: true, rumor: true })))
      .toEqual(['Minor River', 'Road', 'Plowed', 'Wheat', 'Lost City Rumor']);
    expect(groundFeatures(makeTile({ base: 'plains' }))).toEqual([]);
  });
});
