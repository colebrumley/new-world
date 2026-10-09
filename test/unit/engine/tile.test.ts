import { describe, expect, it } from 'vitest';
import { hasForest, isExploredBy, isLand, isWater, makeTile, markExplored, OCEAN_TILE, terrainDef, terrainOf } from '../../../src/engine/tile';

describe('tile model', () => {
  it('has every field and survives JSON', () => {
    expect(Object.keys(OCEAN_TILE).sort()).toEqual(
      ['base', 'claim', 'explored', 'forest', 'homeland', 'plowed', 'relief', 'resource', 'river', 'road', 'rumor'].sort(),
    );
    const t = makeTile({ base: 'plains', forest: true, river: 'major', resource: 'game', homeland: 'aztec', claim: 'p0', explored: 5 });
    expect(JSON.parse(JSON.stringify(t))).toEqual(t);
  });

  it('resolves the governing terrain row: relief, then forest, then base', () => {
    expect(terrainOf(makeTile({ base: 'plains' }))).toBe('plains');
    expect(terrainOf(makeTile({ base: 'plains', forest: true }))).toBe('mixed');
    expect(terrainOf(makeTile({ base: 'swamp', forest: true }))).toBe('rain');
    expect(terrainOf(makeTile({ base: 'plains', forest: true, relief: 'hills' }))).toBe('hills');
    expect(terrainOf(makeTile({ base: 'tundra', relief: 'mountains' }))).toBe('mountains');
    expect(terrainOf(makeTile({ base: 'arctic', forest: true }))).toBe('arctic');
    expect(terrainOf(makeTile({ base: 'seaLane' }))).toBe('seaLane');
    expect(terrainDef(makeTile({ base: 'grassland', forest: true })).name).toBe('Conifer Forest');
  });

  it('classifies water, land and forest', () => {
    expect(isWater(makeTile())).toBe(true);
    expect(isWater(makeTile({ base: 'seaLane' }))).toBe(true);
    expect(isLand(makeTile({ base: 'arctic' }))).toBe(true);
    expect(hasForest(makeTile({ base: 'prairie', forest: true }))).toBe(true);
    expect(hasForest(makeTile({ base: 'prairie', forest: true, relief: 'hills' }))).toBe(false);
    expect(hasForest(makeTile({ base: 'ocean', forest: true }))).toBe(false);
  });

  it('tracks exploration per player index', () => {
    const t = makeTile({ base: 'plains' });
    expect(isExploredBy(t, 0)).toBe(false);
    const seen = markExplored(markExplored(t, 2), 0);
    expect(seen.explored).toBe(5);
    expect(isExploredBy(seen, 0)).toBe(true);
    expect(isExploredBy(seen, 1)).toBe(false);
    expect(isExploredBy(seen, 2)).toBe(true);
    expect(markExplored(seen, 2)).toBe(seen);
    expect(t.explored).toBe(0);
  });
});
