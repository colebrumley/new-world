import { describe, expect, it } from 'vitest';
import type { Colonist, GameState, Player, Settlement } from '../../../src/engine/state';
import { OFF_MAP } from '../../../src/engine/state';
import { HINT_COUNT, nextHint, type HintContext } from '../../../src/ui/hints';
import { setTile, withColony, withUnit, world } from '../../helpers/world';

const ROWS = ['~~~~~~~~~~', '~~.......~', '~~.......~', '~~.......~', '~~~~~~~~~~'];
const patch = (s: GameState, change: Partial<Player>): GameState => ({ ...s, players: s.players.map((p) => (p.id === 'a' ? { ...p, ...change } : p)) });
const folk = (...jobs: Colonist['profession'][]): Colonist[] => jobs.map((profession, i) => ({ id: `p${i}`, profession, job: { kind: 'idle' as const }, turns: 0 }));
const base = (): GameState => world({ rows: ROWS, players: [{ id: 'a' }] });
const settled = (extra: Parameters<typeof withColony>[1] | object = {}): GameState => withColony(base(), { id: 'col', x: 2, y: 2, name: 'Jamestown', ...extra });
const ids = (s: GameState, context: HintContext, limit = 25): number[] => {
  const seen = new Set<number>();
  for (let i = 0; i < limit; i++) {
    const hint = nextHint(s, 'a', context, seen);
    if (!hint) break;
    seen.add(hint.id);
  }
  return [...seen];
};
const first = (s: GameState, context: HintContext): number | null => nextHint(s, 'a', context, new Set())?.id ?? null;
const village: Settlement = { id: 'v', tribe: 'sioux', x: 6, y: 2, capital: false, population: 3, growth: 0, taught: false, tributePaid: false, alarm: {}, mission: null, scouted: [], lastBought: null, lastSold: null, haggleMemory: null };

describe('tutorial hints', () => {
  it('at the start: the ship at sea, then land alongside', () => {
    let s = withUnit(base(), { id: 'ship', type: 'caravel', profession: null, x: 0, y: 2 });
    s = withUnit(s, { id: 'rider', type: 'soldier', x: 0, y: 2, aboard: 'ship' });
    expect(first(s, { where: 'map', activeUnitId: 'ship' })).toBe(1);
    const near = { ...s, units: { ...s.units, ship: { ...s.units['ship']!, x: 1, y: 2 } } };
    expect(ids(near, { where: 'map', activeUnitId: 'ship' })).toEqual([1, 2]);
    expect(nextHint(near, 'a', { where: 'map', activeUnitId: 'ship' }, new Set([1]))?.text).toContain('Make landfall');
  });

  it('ashore: what pioneers and soldiers are for, and where to build', () => {
    const pioneer = withUnit(base(), { id: 'u', type: 'pioneer', x: 2, y: 2 });
    expect(ids(pioneer, { where: 'map', activeUnitId: 'u' })).toEqual([13, 3, 9, 10]);
    const soldier = withUnit(base(), { id: 'u', type: 'soldier', x: 2, y: 2 });
    expect(ids(soldier, { where: 'map', activeUnitId: 'u' })).toEqual([14, 3]);
    // inland there is nothing to say about a site... it is still a legal one
    expect(nextHint(pioneer, 'a', { where: 'map', activeUnitId: 'u' }, new Set([13]))?.text).toContain('Press B');
  });

  it('a pioneer is told about roads and plowing where they would help', () => {
    const s = withUnit(settled(), { id: 'u', type: 'pioneer', x: 4, y: 2 });
    const seen = new Set([13]);
    expect(nextHint(s, 'a', { where: 'map', activeUnitId: 'u' }, seen)?.id).toBe(9);
    seen.add(9);
    expect(nextHint(s, 'a', { where: 'map', activeUnitId: 'u' }, seen)?.text).toContain('plow');
    const forest = setTile(s, 4, 2, { forest: true });
    expect(nextHint(forest, 'a', { where: 'map', activeUnitId: 'u' }, seen)?.text).toContain('clear this forest');
    const done = setTile(s, 4, 2, { road: true, plowed: true });
    expect(nextHint(done, 'a', { where: 'map', activeUnitId: 'u' }, seen)).toBeNull();
  });

  it('in the colony: jobs first, then food if it is short, then a ship in port', () => {
    const s = settled({ colonists: folk('freeColonist', 'freeColonist', 'freeColonist') });
    expect(first(s, { where: 'colony', colonyId: 'col' })).toBe(4);
    const hungry = ids(s, { where: 'colony', colonyId: 'col' });
    expect(hungry.slice(0, 2)).toEqual([4, 16]); // three idle mouths and nobody farming
    const docked = withUnit(s, { id: 'ship', type: 'caravel', profession: null, x: 2, y: 2 });
    expect(ids(docked, { where: 'colony', colonyId: 'col' })).toContain(12);
  });

  it('a growing colony is advised to build a Stockade, once it has three colonists and none', () => {
    const three = settled({ colonists: folk('freeColonist', 'freeColonist', 'freeColonist') });
    expect(ids(three, { where: 'map' })).toContain(7);
    expect(ids(settled({ colonists: folk('freeColonist', 'freeColonist') }), { where: 'map' })).not.toContain(7);
    expect(ids(settled({ colonists: folk('freeColonist', 'freeColonist', 'freeColonist'), buildings: ['stockade'] }), { where: 'map' })).not.toContain(7);
  });

  it('cargo to ship, people on the docks, colonists at the gate, a settlement that teaches, converts', () => {
    const cargo = settled({ goods: { furs: 100, food: 300 } });
    expect(nextHint(cargo, 'a', { where: 'map' }, new Set())?.text).toContain('100 furs');
    expect(ids(settled({ goods: { furs: 99 } }), { where: 'map' })).not.toContain(6);

    let docks = withUnit(settled(), { id: 'ship', type: 'caravel', profession: null, x: 0, y: 2 });
    docks = withUnit(docks, { id: 'w', x: 0, y: 0 });
    docks = { ...docks, units: { ...docks.units, w: { ...docks.units['w']!, x: OFF_MAP, y: OFF_MAP, voyage: { phase: 'inEurope', turnsLeft: 0, origin: [0, 2] } } } };
    expect(ids(docks, { where: 'map' })).toContain(5);
    expect(ids(patch(docks, { atWar: true }), { where: 'map' })).not.toContain(5);

    const gate = withUnit(settled(), { id: 'new', x: 2, y: 2 });
    expect(nextHint(gate, 'a', { where: 'map' }, new Set())?.text).toContain('gates of Jamestown');

    const school = withUnit({ ...settled(), settlements: { v: village } }, { id: 'u', x: 5, y: 2 });
    expect(ids(school, { where: 'map', activeUnitId: 'u' })).toContain(8);
    const expert = withUnit({ ...settled(), settlements: { v: village } }, { id: 'u', profession: 'expertFarmer', x: 5, y: 2 });
    expect(ids(expert, { where: 'map', activeUnitId: 'u' })).not.toContain(8);

    expect(ids(withUnit(settled(), { id: 'c', profession: 'indianConvert', x: 4, y: 2 }), { where: 'map' })).toContain(19);
  });

  it('a ship is explained once there is a colony to sail for', () => {
    const s = withUnit(settled(), { id: 'ship', type: 'caravel', profession: null, x: 0, y: 2 });
    expect(nextHint(s, 'a', { where: 'map', activeUnitId: 'ship' }, new Set())?.id).toBe(11);
  });

  it('in Europe: the port, and buying less than a full load when gold is short', () => {
    expect(ids(patch(base(), { gold: 0 }), { where: 'europe' })).toEqual([17]);
    expect(ids(patch(base(), { gold: 50 }), { where: 'europe' })).toEqual([17, 18]);
    expect(nextHint(base(), 'a', { where: 'europe' }, new Set())?.text).toContain('London');
  });

  it('each is given once, nothing is said to a stranger, and there are nineteen of them', () => {
    expect(nextHint(base(), 'nobody', { where: 'map' }, new Set())).toBeNull();
    const pioneer = withUnit(base(), { id: 'u', type: 'pioneer', x: 2, y: 2 });
    expect(nextHint(pioneer, 'a', { where: 'map', activeUnitId: 'u' }, new Set([13, 3, 9, 10]))).toBeNull();
    expect(HINT_COUNT).toBe(19);
    // every moment can be reached in some situation or other
    const reached = new Set<number>();
    let s = withUnit(base(), { id: 'ship', type: 'caravel', profession: null, x: 1, y: 2 });
    s = withUnit(s, { id: 'rider', type: 'soldier', x: 1, y: 2, aboard: 'ship' });
    for (const id of ids(s, { where: 'map', activeUnitId: 'ship' })) reached.add(id);
    for (const type of ['pioneer', 'soldier'] as const) for (const id of ids(withUnit(base(), { id: 'u', type, x: 2, y: 2 }), { where: 'map', activeUnitId: 'u' })) reached.add(id);
    let busy = settled({ colonists: folk('freeColonist', 'freeColonist', 'indianConvert'), goods: { furs: 150 } });
    busy = withUnit({ ...busy, settlements: { v: village } }, { id: 'u', x: 5, y: 2 });
    busy = withUnit(withUnit(busy, { id: 'ship', type: 'caravel', profession: null, x: 2, y: 2 }), { id: 'gate', x: 2, y: 2 });
    busy = withUnit(busy, { id: 'w', x: 0, y: 0 });
    busy = patch({ ...busy, units: { ...busy.units, w: { ...busy.units['w']!, x: OFF_MAP, y: OFF_MAP, voyage: { phase: 'inEurope', turnsLeft: 0, origin: [0, 2] } } } }, { gold: 50 });
    for (const context of [{ where: 'map', activeUnitId: 'u' }, { where: 'map', activeUnitId: 'ship' }, { where: 'colony', colonyId: 'col' }, { where: 'europe' }] as const) for (const id of ids(busy, context)) reached.add(id);
    expect([...reached].sort((a, b) => a - b)).toEqual(Array.from({ length: 19 }, (_, i) => i + 1));
  });
});
