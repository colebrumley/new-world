import { describe, expect, it } from 'vitest';
import type { Settlement } from '../../../src/engine/state';
import { sidebarModel } from '../../../src/ui/sidebar';
import { setTile, withColony, world } from '../../helpers/world';

const village: Settlement = { id: 'v', tribe: 'sioux', x: 3, y: 1, capital: false, population: 3, growth: 0, taught: false, tributePaid: false, alarm: {}, mission: null, scouted: [], lastBought: null, lastSold: null, haggleMemory: null };

describe('sidebarModel features', () => {
  it('lists a colony first, then the ground features, then whose land it is', () => {
    let s = world({ rows: ['.....', '.....', '.....'] });
    s = setTile(s, 1, 1, { river: 'major', road: true, plowed: true, resource: 'wheat', rumor: true, homeland: 'sioux' });
    s = withColony(s, { id: 'col', name: 'Jamestown', x: 1, y: 1 });
    const model = sidebarModel(s, null, { x: 1, y: 1 });
    expect(model.terrain).toBe('Plains');
    expect(model.features).toEqual(['Jamestown (1)', 'Major River', 'Road', 'Plowed', 'Wheat', 'Lost City Rumor', 'Sioux land']);
  });

  it('puts a settlement first and leaves out whose land it is', () => {
    let s = world({ rows: ['.....', '.....', '.....'] });
    s = setTile(s, 3, 1, { river: 'minor', homeland: 'sioux' });
    s = { ...s, settlements: { v: village } };
    expect(sidebarModel(s, null, { x: 3, y: 1 }).features).toEqual(['Sioux Camp', 'Minor River']);
  });

  it('says Unexplored and lists nothing on a square the viewer has not seen', () => {
    const s = setTile(world({ rows: ['...'] }), 1, 0, { explored: 0, resource: 'wheat' });
    const model = sidebarModel(s, null, { x: 1, y: 0 });
    expect(model.terrain).toBe('Unexplored');
    expect(model.features).toEqual([]);
    expect(sidebarModel(s, null, { x: 1, y: 0 }, true).features).toEqual(['Wheat']);
  });
});
