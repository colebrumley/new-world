import { describe, expect, it } from 'vitest';
import { applyAction, validateAction } from '../../../src/engine/actions';
import { AMERICA_TRIBE_SITES } from '../../../src/engine/data/america';
import { DEFAULT_WORLD } from '../../../src/engine/data/mapgen';
import { SETTLEMENT_PLACEMENT, SETTLEMENT_TERRAIN } from '../../../src/engine/data/settlements';
import { MAX_SETTLEMENTS, settlementPopulation, TRIBE_IDS, TRIBES } from '../../../src/engine/data/tribes';
import { createGame } from '../../../src/engine/game';
import { checkInvariants } from '../../../src/engine/invariants';
import { isSettlementGround, placeRandomSettlements } from '../../../src/engine/mapgen/settlements';
import { generateWorld } from '../../../src/engine/mapgen/generate';
import { createRng } from '../../../src/engine/rng';
import { capitalOf, isNativeLand, landOwner, markHomelands, nativeDistance, settlementAt, settlementsOf } from '../../../src/engine/settlements';
import type { GameState, Settlement } from '../../../src/engine/state';
import { isWater, makeTile } from '../../../src/engine/tile';
import { withUnit, world } from '../../helpers/world';

const america = (seed: number): GameState => createGame({ seed, scenario: 'america', players: [{ id: 'h', name: 'H', kind: 'human' }, { id: 'c', name: 'C', kind: 'ai' }], difficulty: 'governor' });
const random = (seed: number): GameState => createGame({ seed, world: DEFAULT_WORLD, players: [{ id: 'h', name: 'H', kind: 'human' }] });
const village = (id: string, tribe: Settlement['tribe'], x: number, y: number, capital = false): Settlement => ({
  id, tribe, x, y, capital, population: settlementPopulation(tribe, capital).start, growth: 0, taught: false, tributePaid: false,
  alarm: {}, mission: null, scouted: [], lastBought: null, lastSold: null, haggleMemory: null,
});

describe('placement tables', () => {
  it('match the snapshot', () => {
    expect({ SETTLEMENT_PLACEMENT, SETTLEMENT_TERRAIN }).toMatchSnapshot();
  });
});

describe('settlements on the America map', () => {
  it('stand near every listed site, the first of each tribe being its capital', () => {
    for (const seed of [1, 2, 3]) {
      const s = america(seed);
      const all = Object.values(s.settlements);
      const listed = TRIBE_IDS.reduce((n, t) => n + AMERICA_TRIBE_SITES[t].length, 0);
      expect(all.length).toBeGreaterThan(listed - 6);
      expect(all.length).toBeLessThanOrEqual(Math.min(listed, MAX_SETTLEMENTS));
      for (const tribe of TRIBE_IDS) {
        const own = settlementsOf(s, tribe);
        expect(own.length, tribe).toBeGreaterThan(AMERICA_TRIBE_SITES[tribe].length - 3);
        expect(own.filter((v) => v.capital), tribe).toHaveLength(1);
        const [px, py] = AMERICA_TRIBE_SITES[tribe][0];
        const capital = capitalOf(s, tribe) as Settlement;
        expect(Math.max(Math.abs(capital.x - (px + 1)), Math.abs(capital.y - (py + 1)))).toBeLessThanOrEqual(2);
      }
      expect(checkInvariants(s)).toEqual([]);
    }
  });

  it('is the same for the same seed and differs between seeds', () => {
    expect(america(4).settlements).toEqual(america(4).settlements);
    expect(america(4).settlements).not.toEqual(america(5).settlements);
  });
});

describe('settlements on a random map', () => {
  it('gives every tribe a capital, keeps settlements apart and on fit ground, and stays within the limit', () => {
    for (const seed of [1, 2, 3, 4]) {
      const s = random(seed);
      const all = Object.values(s.settlements);
      expect(all.length).toBeGreaterThan(20);
      expect(all.length).toBeLessThanOrEqual(MAX_SETTLEMENTS);
      for (const v of all) {
        const tile = s.map.tiles[v.y * s.map.width + v.x]!;
        expect(isWater(tile)).toBe(false);
        expect(tile.relief).toBe('flat');
        if (!v.capital) expect(SETTLEMENT_TERRAIN as readonly string[]).toContain(tile.base);
        expect(v.population).toBe(3 + 2 * TRIBES[v.tribe].tech);
      }
      const capitals = all.filter((v) => v.capital);
      expect(new Set(capitals.map((v) => v.tribe)).size).toBe(capitals.length);
      expect(capitals.length).toBeGreaterThanOrEqual(6);
      for (const tribe of TRIBE_IDS) if (settlementsOf(s, tribe).length > 0) expect(s.tribes[tribe], tribe).toBeDefined();
      expect(checkInvariants(s)).toEqual([]);
    }
  });

  it('puts at most one settlement in each 5 x 5 cell', () => {
    const map = generateWorld(createRng(8).fork('world'), DEFAULT_WORLD);
    const placed = placeRandomSettlements(map, createRng(8));
    const cells = placed.map((v) => `${Math.floor(v.x / 5)},${Math.floor(v.y / 5)}`);
    expect(new Set(cells).size).toBe(cells.length);
  });

  it('holds the two city peoples to the west more often than not', () => {
    let west = 0;
    let seen = 0;
    for (let seed = 0; seed < 12; seed++) {
      const s = random(seed);
      for (const tribe of ['inca', 'aztec'] as const) {
        const c = capitalOf(s, tribe);
        if (!c) continue;
        seen++;
        if (c.x < s.map.width / 2) west++;
      }
    }
    expect(seen).toBeGreaterThan(12);
    expect(west / seen).toBeGreaterThan(0.6);
  });

  it('the small test map has no natives', () => {
    const s = createGame({ seed: 1 });
    expect(s.settlements).toEqual({});
    expect(s.tribes).toEqual({});
  });
});

describe('what a tribe starts with', () => {
  it('no arms, nobody met, and a little alarm that is greater toward a human on a hard level', () => {
    let human = 0;
    let computer = 0;
    for (let seed = 0; seed < 8; seed++) {
      const s = america(seed);
      for (const tribe of TRIBE_IDS) {
        const t = s.tribes[tribe]!;
        expect(t).toMatchObject({ muskets: 0, horses: 0, met: [], landSold: 0 });
        expect(t.alarm['h']).toBeGreaterThanOrEqual(6);
        expect(t.alarm['h']).toBeLessThanOrEqual(20);
        expect(t.alarm['c']).toBeLessThanOrEqual(14);
        human += t.alarm['h']!;
        computer += t.alarm['c']!;
      }
    }
    expect(human / 64 - computer / 64).toBeCloseTo(6, 0);
  });
});

describe('native land', () => {
  it('measures distance as the longer offset plus half the shorter', () => {
    expect(nativeDistance(5, 5, 6, 6)).toBe(1);
    expect(nativeDistance(5, 5, 7, 6)).toBe(2);
    expect(nativeDistance(5, 5, 7, 7)).toBe(3);
    expect(nativeDistance(5, 5, 8, 6)).toBe(3);
    expect(nativeDistance(5, 5, 8, 7)).toBe(4);
  });

  const count = (owner: Settlement, all: Settlement[]): number => {
    let n = 0;
    for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) if (landOwner(all, x, y) === owner) n++;
    return n;
  };

  it('a camp or village holds its 9 squares, an Aztec city 21, an Inca city 37', () => {
    const camp = village('a', 'sioux', 10, 10);
    const aztec = village('b', 'aztec', 10, 10);
    const inca = village('c', 'inca', 10, 10);
    expect(count(camp, [camp])).toBe(9);
    expect(count(aztec, [aztec])).toBe(21);
    expect(count(inca, [inca])).toBe(37);
  });

  it('a tile belongs to the nearest settlement only, and only if within that one\'s reach', () => {
    const inca = village('a', 'inca', 5, 5);
    const camp = village('b', 'sioux', 8, 5);
    expect(landOwner([inca, camp], 6, 5)).toBe(inca);
    expect(landOwner([inca, camp], 7, 5)).toBe(camp);
    // nearer to the camp but outside its reach: nobody's, although the Inca city reaches that far
    const far = village('c', 'sioux', 10, 6);
    expect(landOwner([inca], 8, 6)).toBe(inca);
    expect(landOwner([inca, far], 8, 6)).toBeNull();
    expect(landOwner([], 7, 5)).toBeNull();
  });

  it('is written into the map, land only, and cleared when the settlement goes', () => {
    const tiles = Array.from({ length: 100 }, (_, i) => makeTile({ base: i % 10 < 2 ? 'ocean' : 'plains' }));
    const map = { width: 10, height: 10, tiles };
    const camp = village('a', 'apache', 2, 5);
    const marked = markHomelands(map, [camp]);
    const owned = marked.tiles.map((t, i) => (t.homeland ? i : -1)).filter((i) => i >= 0);
    expect(owned).toEqual([42, 43, 52, 53, 62, 63]);
    expect(marked.tiles[52]?.homeland).toBe('apache');
    expect(markHomelands(marked, [camp])).toBe(marked);
    expect(markHomelands(marked, []).tiles.every((t) => t.homeland === null)).toBe(true);
  });

  it('a new game marks the land around each settlement', () => {
    const s = america(2);
    for (const v of Object.values(s.settlements)) expect(s.map.tiles[v.y * s.map.width + v.x]?.homeland).toBe(v.tribe);
    expect(isSettlementGround(s.map.tiles[0])).toBe(false);
  });
});

describe('whether land must be bargained for', () => {
  const land = makeTile({ base: 'plains', homeland: 'sioux' });
  const base = world({ rows: ['~~~', '~.~', '~~~'], players: [{ id: 'a' }, { id: 'b', fathers: ['peterMinuit'] }] });

  it('only once the tribe has met the power, and never with Minuit or on land already claimed', () => {
    expect(isNativeLand(base, land, 'a')).toBe(true);
    expect(isNativeLand(base, land, 'b')).toBe(false);
    expect(isNativeLand(base, land, null)).toBe(false);
    expect(isNativeLand(base, { ...land, claim: 'a' }, 'a')).toBe(false);
    expect(isNativeLand(base, makeTile({ base: 'plains' }), 'a')).toBe(false);
    const strangers = { ...base, tribes: { sioux: { ...base.tribes.sioux!, met: [] } } };
    expect(isNativeLand(strangers, land, 'a')).toBe(false);
    expect(isNativeLand({ ...base, tribes: {} }, land, 'a')).toBe(false);
  });
});

describe('a settlement on the map', () => {
  const ROWS = ['~~~~~~', '~....~', '~....~', '~~~~~~'];
  const withVillage = (): GameState => {
    const s = world({ rows: ROWS });
    const v = village('s1', 'cherokee', 3, 1);
    return { ...s, settlements: { s1: v }, tribes: { cherokee: { alarm: {}, goodwill: {}, met: [], muskets: 0, horses: 0, breeding: 0, silver: 0, peace: [], landSold: 0, grudge: [], joinedCrown: false, visited: {}, stock: {} } } };
  };

  it('can be found by its square', () => {
    expect(settlementAt(withVillage(), 3, 1)?.id).toBe('s1');
    expect(settlementAt(withVillage(), 2, 1)).toBeNull();
  });

  it('cannot simply be walked into, nor built upon, and Go To finds a way round', () => {
    const s = withUnit(withVillage(), { id: 'u', x: 2, y: 1 });
    const move = validateAction(s, { type: 'moveUnit', unitId: 'u', dx: 1, dy: 0 });
    expect(move.ok ? 'ok' : move.error.code).toBe('settlement');
    const beside = validateAction(s, { type: 'foundColony', unitId: 'u', name: 'X' });
    expect(beside.ok).toBe(true);
    const gone = applyAction(s, { type: 'goTo', unitId: 'u', x: 4, y: 1 });
    expect(checkInvariants(gone.state)).toEqual([]);
    const u = gone.state.units['u']!;
    expect([u.x, u.y]).not.toEqual([3, 1]);
  });

  it('invariants catch settlements at sea, adjacent ones, and orphans', () => {
    const s = withVillage();
    expect(checkInvariants(s)).toEqual([]);
    const second = { ...s, settlements: { ...s.settlements, s2: village('s2', 'cherokee', 4, 2) } };
    expect(checkInvariants(second).join()).toContain('adjacent');
    const wet = { ...s, settlements: { s1: { ...village('s1', 'cherokee', 0, 0) } } };
    expect(checkInvariants(wet).join()).toContain('not on land');
    expect(checkInvariants({ ...s, tribes: {} }).join()).toContain('no record');
  });
});
