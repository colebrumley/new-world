import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BUILDING_IDS } from '../../../src/engine/data/buildings';
import { ABSTRACT_GOOD_IDS, GOOD_IDS } from '../../../src/engine/data/goods';
import { NATION_IDS } from '../../../src/engine/data/nations';
import { RESOURCE_IDS } from '../../../src/engine/data/resources';
import { TERRAIN_IDS } from '../../../src/engine/data/terrain';
import { UNIT_TYPE_IDS } from '../../../src/engine/data/units';
import { BUILDING_ART, BUILDING_SIZE } from '../../../src/ui/building-art';
import { FLOOR_ART, FLOOR_CODES, FLOOR_COLORS } from '../../../src/ui/floor-art';
import { GOODS_ART, GOODS_SIZE } from '../../../src/ui/goods-art';
import { ART_COLORS, buildingArt, drawGood, drawSprite, figureArt, FLAG_IDS, flagArt, goodArt, SEAL_GLYPHS, sealArt } from '../../../src/ui/pixel-art';
import { CHART, CHART_MARK_KINDS } from '../../../src/ui/chart';
import { CHART_ART, CHART_COLORS } from '../../../src/ui/chart-art';
import { blendArt, COAST_MASKS, coastArt, EDGE_MASKS, floorArt, openOf, overArt, rotate, type TileGrid } from '../../../src/ui/pixel-art';
import { activeFrameArt, ART, at, blank, blockedCursorArt, cursorArt, chartMarkArt, colonyArt, COLONY_LOOKS, DETAIL, detailedColonyArt, detailedPieceArt, detailedSettlementArt, detailedTileArt, GROUND, halve, hasFigure, INK, LABEL_GLYPHS, labelArt, labelText, MINI, miniTileArt, PALETTE, pieceArt, settlementArt, tileArt, toRgba, VELLUM, vellumArt, VILLAGE_LOOKS, write, type ChartGrid, type Sprite, type TileLook } from '../../../src/ui/pixel-art';

const look = (change: Partial<TileLook> = {}): TileLook => ({ terrain: 'plains', river: 'none', riverMask: 0, road: false, roadMask: 0, plowed: false, resource: null, rumor: false, totem: false, variant: 0, ...change });
const text = (s: Sprite): string => Array.from({ length: s.size }, (_, y) => Array.from({ length: s.size }, (_, x) => (at(s, x, y) === 0 ? '.' : (at(s, x, y) - 1).toString(32))).join('')).join('\n');
const inks = (s: Sprite): Set<number> => new Set([...s.cells].filter((c) => c > 0).map((c) => c - 1));
const differ = (a: Sprite, b: Sprite): boolean => text(a) !== text(b);

describe('the palette', () => {
  it('is thirty-two distinct colours', () => {
    expect(PALETTE).toHaveLength(32);
    expect(new Set(PALETTE).size).toBe(32);
    for (const hex of PALETTE) expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    expect(Object.values(INK).sort((a, b) => a - b)).toEqual(Array.from({ length: 32 }, (_, i) => i));
  });

  it('is these thirty-two colours and no others: the baked art and every later picture are painted against them', () => {
    expect(Object.fromEntries(Object.entries(INK).map(([name, ink]) => [name, PALETTE[ink]]))).toEqual({
      void: '#0b0d12', ink: '#111111', white: '#f2f2f2', parchment: '#e9dfc4', lightGrey: '#c3c7cc', grey: '#8d8a84', darkGrey: '#5f5b57',
      deepSea: '#141f6b', sea: '#1f2f8e', wave: '#3d58b0', brightBlue: '#4a8fe8',
      ice: '#e6edf2', tundra: '#a8b08f', sand: '#d3bd7a', plains: '#c2b268', prairie: '#cfae5c', grass: '#6cb43e', savannah: '#a9bd4a',
      marsh: '#6a9c5e', swamp: '#4c7a4e', leaf: '#4f9f2c', forest: '#2b7a28', deepForest: '#1a5a1e',
      hill: '#a39262', earth: '#7c6b45', wood: '#6b4a2a',
      red: '#c8322b', blue: '#2f5fc4', yellow: '#d9c23c', orange: '#d9812e', green: '#39c24a', purple: '#8a5fb5',
    });
    expect([...PALETTE]).toEqual([
      '#0b0d12', '#111111', '#f2f2f2', '#e9dfc4', '#c3c7cc', '#8d8a84', '#5f5b57', '#141f6b', '#1f2f8e', '#3d58b0', '#4a8fe8',
      '#e6edf2', '#a8b08f', '#d3bd7a', '#c2b268', '#cfae5c', '#6cb43e', '#a9bd4a', '#6a9c5e', '#4c7a4e', '#4f9f2c', '#2b7a28', '#1a5a1e',
      '#a39262', '#7c6b45', '#6b4a2a', '#c8322b', '#2f5fc4', '#d9c23c', '#d9812e', '#39c24a', '#8a5fb5',
    ]);
  });

  it('is the only source of colour for the map: the drawing code names no colours of its own', () => {
    for (const file of ['render.ts', 'tiles.ts', 'minimap.ts']) {
      const source = readFileSync(join(__dirname, '../../../src/ui', file), 'utf8');
      expect(source.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g) ?? [], file).toEqual([]);
    }
  });
});

describe('terrain art', () => {
  it('fills the whole square for every terrain, in every variant, on the sixteen-pixel grid', () => {
    for (const terrain of TERRAIN_IDS) {
      for (let variant = 0; variant < 4; variant++) {
        const s = tileArt(look({ terrain, variant }));
        expect(s.size).toBe(ART);
        expect([...s.cells].every((c) => c >= 1 && c <= 32), terrain).toBe(true);
      }
      const mini = miniTileArt(look({ terrain }));
      expect(mini.size).toBe(8);
      expect([...mini.cells].every((c) => c >= 1), terrain).toBe(true);
    }
  });

  it('every terrain can be told from every other, at full size and at the smallest zoom apart from open and wooded ground of one colour', () => {
    const full = new Map(TERRAIN_IDS.map((t) => [t, text(tileArt(look({ terrain: t })))]));
    expect(new Set(full.values()).size).toBe(TERRAIN_IDS.length);
    const mini = new Set(TERRAIN_IDS.map((t) => text(miniTileArt(look({ terrain: t })))));
    expect(mini.size).toBeGreaterThanOrEqual(14);
    // sea and land never share a colour, and forest is never the colour of its open ground
    for (const [open, forest] of [['plains', 'mixed'], ['grassland', 'conifer'], ['tundra', 'boreal'], ['swamp', 'rain']] as const) expect(text(miniTileArt(look({ terrain: open })))).not.toBe(text(miniTileArt(look({ terrain: forest }))));
  });

  it('water is never the flat colour of any land, at the smallest zoom and on the minimap', () => {
    const water = ['ocean', 'seaLane'] as const;
    const land = TERRAIN_IDS.filter((t) => !(water as readonly string[]).includes(t));
    expect(land).toHaveLength(TERRAIN_IDS.length - 2);
    for (const sea of water) for (const t of land) expect(MINI[t], `${sea} and ${t}`).not.toBe(MINI[sea]);
    expect(MINI.ocean).not.toBe(MINI.seaLane);
  });

  it('is the same every time, and varies a little from variant to variant', () => {
    expect(text(tileArt(look({ terrain: 'mixed', variant: 2 })))).toBe(text(tileArt(look({ terrain: 'mixed', variant: 2 }))));
    expect(differ(tileArt(look({ terrain: 'mixed', variant: 0 })), tileArt(look({ terrain: 'mixed', variant: 1 })))).toBe(true);
    expect(differ(tileArt(look({ terrain: 'ocean', variant: 0 })), tileArt(look({ terrain: 'ocean', variant: 3 })))).toBe(true);
  });

  it('shows rivers, roads, plowing, resources, rumors and totems', () => {
    const plain = tileArt(look());
    expect(inks(tileArt(look({ river: 'minor', riverMask: 5 })))).toContain(INK.brightBlue);
    const minor = [...tileArt(look({ river: 'minor', riverMask: 5 })).cells].filter((c) => c - 1 === INK.brightBlue).length;
    const major = [...tileArt(look({ river: 'major', riverMask: 5 })).cells].filter((c) => c - 1 === INK.brightBlue).length;
    expect(major).toBeGreaterThan(minor);
    expect(differ(tileArt(look({ river: 'minor', riverMask: 5 })), tileArt(look({ river: 'minor', riverMask: 10 })))).toBe(true);
    expect(inks(tileArt(look({ road: true, roadMask: 0b01000100 })))).toContain(INK.wood);
    expect(differ(tileArt(look({ road: true, roadMask: 1 })), tileArt(look({ road: true, roadMask: 16 })))).toBe(true);
    expect(differ(plain, tileArt(look({ plowed: true })))).toBe(true);
    expect(differ(plain, tileArt(look({ rumor: true })))).toBe(true);
    expect(differ(plain, tileArt(look({ totem: true })))).toBe(true);
    for (const resource of RESOURCE_IDS) expect(differ(plain, tileArt(look({ resource }))), resource).toBe(true);
  });
});

describe('pieces', () => {
  it('every unit type has its own figure in a box of its owner\'s colour', () => {
    const seen = new Set<string>();
    for (const type of UNIT_TYPE_IDS) {
      const s = pieceArt({ type, color: INK.red, label: '-', stacked: false });
      expect(inks(s), type).toContain(INK.red);
      expect(inks(s), type).toContain(INK.ink);
      // something other than the box and its outline is drawn in it
      expect([...inks(s)].some((i) => i !== INK.red && i !== INK.ink) || text(s) !== text(pieceArt({ type: 'colonist', color: INK.red, label: '-', stacked: false })), type).toBe(true);
      seen.add(text(s));
    }
    expect(seen.size).toBe(UNIT_TYPE_IDS.length);
  });

  it('takes the owner\'s colour, carries the order on a plate in that colour, and shows when it stands on others', () => {
    const red = pieceArt({ type: 'soldier', color: INK.red, label: 'F', stacked: false });
    const blue = pieceArt({ type: 'soldier', color: INK.blue, label: 'F', stacked: false });
    expect(inks(red)).toContain(INK.red);
    expect(inks(blue)).not.toContain(INK.red);
    expect(at(red, 0, 0) - 1).toBe(INK.ink); // the plate's outline
    expect(at(red, 2, 5) - 1).toBe(INK.red); // inside the plate, clear of the letter F
    expect(differ(red, pieceArt({ type: 'soldier', color: INK.red, label: 'S', stacked: false }))).toBe(true);
    expect(differ(red, pieceArt({ type: 'soldier', color: INK.red, label: 'F', stacked: true }))).toBe(true);
    // a native band has no plate
    expect(at(pieceArt({ type: 'brave', color: INK.purple, label: '', stacked: false }), 0, 0)).toBe(0);
    // the active frame runs round the edge and leaves the middle alone
    expect(at(activeFrameArt(), 0, 7) - 1).toBe(INK.white);
    expect(at(activeFrameArt(), 7, 7)).toBe(0);
    // the destination marker is yellow, and red over a square the dragged unit cannot go to
    expect(at(cursorArt(), 0, 7) - 1).toBe(INK.yellow);
    expect(at(cursorArt(), ART - 1, 3) - 1).toBe(INK.yellow);
    expect(at(cursorArt(), 7, 7)).toBe(0);
    expect(at(blockedCursorArt(), 0, 7) - 1).toBe(INK.red);
    expect(at(blockedCursorArt(), ART - 1, 3) - 1).toBe(INK.red);
    expect(at(blockedCursorArt(), 7, 0) - 1).toBe(INK.red);
    expect(at(blockedCursorArt(), 7, 7)).toBe(0);
  });
});

describe('detailed pieces', () => {
  const figured = UNIT_TYPE_IDS.filter(hasFigure);

  it('every kind of unit has a detailed figure of its own, twice the grid of the map', () => {
    expect(figured).toEqual([...UNIT_TYPE_IDS]);
    const seen = new Set<string>();
    for (const type of figured) {
      const s = detailedPieceArt({ type, color: INK.red, label: '', stacked: false });
      expect(s?.size, type).toBe(DETAIL);
      if (s) seen.add(text(s));
    }
    expect(seen.size).toBe(figured.length);
  });

  it('stands on a base of its owner\'s colour, carries its orders on a tab at the foot, shows a stack, and turns into colours', () => {
    const look = { type: 'soldier', color: INK.red, label: 'F', stacked: false } as const;
    const red = detailedPieceArt(look) as Sprite;
    expect(inks(red)).toContain(INK.red); // the base
    expect(at(red, 15, 30) - 1).toBe(INK.ink); // its outline, below the figure's feet
    expect(inks(detailedPieceArt({ ...look, color: INK.blue }) as Sprite)).not.toContain(INK.red);
    // the tab: white on dark at the bottom left, and nothing of it at the top left where the old plate sat
    expect(at(red, 0, 22) - 1).toBe(INK.ink);
    expect(at(red, 1, 23) - 1).toBe(INK.white); // the top stroke of the F
    expect(at(red, 0, 0)).toBe(0);
    expect(differ(red, detailedPieceArt({ ...look, label: 'S' }) as Sprite)).toBe(true);
    expect(differ(red, detailedPieceArt({ ...look, stacked: true }) as Sprite)).toBe(true);
    // a unit with no orders has no tab, and every order letter and digit has a glyph of its own
    const idle = detailedPieceArt({ ...look, label: '-' }) as Sprite;
    expect(text(idle)).toBe(text(detailedPieceArt({ ...look, label: '' }) as Sprite));
    expect(differ(idle, red)).toBe(true);
    const tabs = [...'SGFPRT0123456789'].map((label) => text(detailedPieceArt({ ...look, label }) as Sprite));
    expect(new Set(tabs).size).toBe(tabs.length);
    // the figure's own colours lie beyond the map palette and still come out opaque
    const beyond = red.cells.findIndex((c) => c > PALETTE.length);
    expect(beyond).toBeGreaterThanOrEqual(0);
    expect(toRgba(red)[beyond * 4 + 3]).toBe(255);
  });
});

describe('colonies and settlements', () => {
  it('a colony wears its owner\'s roof and shows its population in the colour of its loyalties', () => {
    const one = colonyArt(INK.red, 1, INK.white);
    expect(inks(one)).toEqual(new Set([INK.red, INK.parchment, INK.ink, INK.white]));
    expect(differ(one, colonyArt(INK.red, 2, INK.white))).toBe(true);
    expect(differ(one, colonyArt(INK.blue, 1, INK.white))).toBe(true);
    expect(inks(colonyArt(INK.red, 12, INK.green))).toContain(INK.green);
    expect(inks(colonyArt(INK.red, 12, INK.brightBlue))).toContain(INK.brightBlue);
    expect(text(colonyArt(INK.red, 150, INK.white))).toBe(text(colonyArt(INK.red, 99, INK.white)));
  });

  it('a settlement is a tent, a longhouse or a pyramid; a capital flies a pennant; the mood mark is an exclamation in its colour', () => {
    const shapes = [0, 1, 2].map((tech) => text(settlementArt(INK.purple, tech, false, null)));
    expect(new Set(shapes).size).toBe(3);
    expect(differ(settlementArt(INK.purple, 0, false, null), settlementArt(INK.purple, 0, true, null))).toBe(true);
    const calm = settlementArt(INK.purple, 0, false, INK.green);
    const angry = settlementArt(INK.purple, 0, false, INK.red);
    expect(inks(calm)).toContain(INK.green);
    expect(inks(angry)).toContain(INK.red);
    // the mark: two wide, three tall, a gap, and a dot, at the top right
    expect([1, 2, 3, 4, 5].map((y) => at(angry, 13, y) - 1)).toEqual([INK.red, INK.red, INK.red, INK.ink, INK.red]);
    expect(inks(settlementArt(INK.purple, 0, false, null))).not.toContain(INK.red);
  });
});

describe('detailed terrain', () => {
  it('fills the whole square for every terrain, in every variant, on the 32-pixel grid', () => {
    for (const terrain of TERRAIN_IDS) {
      for (let variant = 0; variant < 4; variant++) {
        const s = detailedTileArt(look({ terrain, variant }));
        expect(s.size).toBe(DETAIL);
        expect([...s.cells].every((c) => c >= 1), `${terrain} ${variant}`).toBe(true);
      }
    }
  });

  it('every baked floor is mostly its terrain\'s ground colour, the one the far zooms and the minimap draw it in', () => {
    expect(Object.keys(FLOOR_ART).length).toBeGreaterThanOrEqual(13);
    for (const [name, rows] of Object.entries(FLOOR_ART)) {
      expect(TERRAIN_IDS as readonly string[], name).toContain(name);
      const count = new Map<string, number>();
      for (const letter of rows.join('')) count.set(letter, (count.get(letter) ?? 0) + 1);
      const [commonest] = [...count].sort((a, b) => b[1] - a[1])[0] as [string, number];
      expect(FLOOR_COLORS[FLOOR_CODES.indexOf(commonest)], name).toBe(PALETTE[GROUND[name as keyof typeof GROUND]]);
    }
  });

  it('every terrain can be told from every other, and a variant is the same ground turned another way', () => {
    expect(new Set(TERRAIN_IDS.map((t) => text(detailedTileArt(look({ terrain: t }))))).size).toBe(TERRAIN_IDS.length);
    const [a, b, c, d] = [0, 1, 2, 3].map((variant) => detailedTileArt(look({ terrain: 'tundra', variant }))) as [Sprite, Sprite, Sprite, Sprite];
    expect(new Set([a, b, c, d].map(text)).size).toBe(4);
    for (let y = 0; y < DETAIL; y++) {
      for (let x = 0; x < DETAIL; x++) {
        expect(at(b, x, y)).toBe(at(a, DETAIL - 1 - x, y));
        expect(at(c, x, y)).toBe(at(a, x, DETAIL - 1 - y));
        expect(at(d, x, y)).toBe(at(a, DETAIL - 1 - x, DETAIL - 1 - y));
      }
    }
    // a forest stands on the open ground of its row, and is never turned upside down
    const wood = detailedTileArt(look({ terrain: 'conifer', variant: 0 }));
    const upended = detailedTileArt(look({ terrain: 'conifer', variant: 2 }));
    const trees = [...wood.cells].map((cell, i) => (cell !== detailedTileArt(look({ terrain: 'grassland', variant: 0 })).cells[i] ? i : -1)).filter((i) => i >= 0);
    expect(trees.length).toBeGreaterThan(100);
    expect(trees.filter((i) => upended.cells[i] === wood.cells[i]).length).toBeGreaterThan(trees.length * 0.9);
  });

  it('shows rivers, roads, plowing, resources, rumors and totems as the plain art does, enlarged', () => {
    const plain = detailedTileArt(look());
    const changes: Partial<TileLook>[] = [{ river: 'minor', riverMask: 5 }, { river: 'major', riverMask: 5 }, { road: true, roadMask: 68 }, { plowed: true }, { resource: 'wheat' }, { rumor: true }, { totem: true }];
    const seen = new Set([text(plain)]);
    for (const change of changes) seen.add(text(detailedTileArt(look(change))));
    expect(seen.size).toBe(changes.length + 1);
    // a river is the bright blue of the plain art, each of its pixels four here
    const blue = (s: Sprite): number => [...s.cells].filter((c) => c - 1 === INK.brightBlue).length;
    expect(blue(detailedTileArt(look({ river: 'minor', riverMask: 5 })))).toBe(4 * blue(tileArt(look({ river: 'minor', riverMask: 5 }))));
  });
});

describe('a square in layers: floor, blends, coasts and what stands on it (R-1041)', () => {
  const GRIDS = [32, 16] as const satisfies readonly TileGrid[];
  const whole = (l: TileLook, grid: TileGrid): Sprite => (grid === 32 ? detailedTileArt(l) : tileArt(l));
  const rowsOf = (shape: readonly string[] | undefined): readonly string[] => shape as readonly string[];

  it('splits every square into a floor that fills it and an over layer, and the two together are the whole square', () => {
    const changes: Partial<TileLook>[] = [{}, { river: 'major', riverMask: 5 }, { road: true, roadMask: 68 }, { plowed: true }, { resource: 'wheat' }, { rumor: true }, { totem: true }];
    for (const grid of GRIDS) {
      for (const terrain of TERRAIN_IDS) {
        for (let variant = 0; variant < 4; variant++) {
          const floor = floorArt(grid, terrain, variant);
          expect(floor.size).toBe(grid);
          expect([...floor.cells].every((c) => c >= 1), `${terrain} ${variant}`).toBe(true);
          // a forest's floor is the floor of its open row
          expect(text(floor), terrain).toBe(text(floorArt(grid, openOf(terrain), variant)));
          for (const change of changes) {
            const l = look({ terrain, variant, ...change });
            const over = overArt(l, grid);
            const expected = floor.cells.map((cell, i) => (over.cells[i] !== 0 ? (over.cells[i] as number) : cell));
            expect(Buffer.from(whole(l, grid).cells).equals(Buffer.from(expected)), `${grid} ${terrain} ${variant} ${JSON.stringify(change)}`).toBe(true);
          }
        }
      }
      // nothing stands on bare open ground or on water; a forest stands on its floor
      for (const terrain of ['plains', 'ocean', 'seaLane', 'arctic'] as const) expect(inks(overArt(look({ terrain }), grid)).size, terrain).toBe(0);
      expect(inks(overArt(look({ terrain: 'mixed' }), grid)).size).toBeGreaterThan(0);
    }
    expect(openOf('mixed')).toBe('plains');
    expect(openOf('conifer')).toBe('grassland');
    expect(openOf('hills')).toBe('hills');
    expect(openOf('ocean')).toBe('ocean');
  });

  it('turns rows of text art a quarter turn clockwise', () => {
    expect(rotate(['ab', 'cd'])).toEqual(['ca', 'db']);
    expect(rotate(['abc', 'def', 'ghi'])).toEqual(['gda', 'heb', 'ifc']);
    const north = rowsOf(EDGE_MASKS[32][0]);
    expect(rotate(rotate(rotate(rotate(north))))).toEqual(north);
    expect(rotate(north)).not.toEqual(north);
  });

  it('has one stencil per side, an uneven band along that edge, the other three the north one turned', () => {
    /** How deep the band is under each cell of the top edge; nothing lies below it. */
    const depths = (rows: readonly string[]): number[] =>
      Array.from({ length: rows.length }, (_, x) => {
        const column = rows.map((row) => row[x]).join('');
        const depth = column.indexOf('.');
        expect(column.slice(depth)).toBe('.'.repeat(rows.length - depth));
        return depth;
      });
    const count = (list: readonly number[], n: number): number => list.filter((d) => d === n).length;
    for (const grid of GRIDS) {
      const masks = EDGE_MASKS[grid].map(rowsOf);
      expect(masks).toHaveLength(4);
      for (const mask of masks) {
        expect(mask).toHaveLength(grid);
        for (const row of mask) expect(row).toMatch(new RegExp(`^[#.]{${grid}}$`));
      }
      expect(masks[1]).toEqual(rotate(rowsOf(masks[0])));
      expect(masks[2]).toEqual(rotate(rowsOf(masks[1])));
      expect(masks[3]).toEqual(rotate(rowsOf(masks[2])));
      // east lies along the right-hand edge, south along the bottom, west along the left
      expect(rowsOf(masks[1]).every((row) => row.endsWith('##') && row.startsWith('.'))).toBe(true);
      expect(rowsOf(masks[2])[grid - 1]).toBe('#'.repeat(grid));
      expect(rowsOf(masks[3]).every((row) => row.startsWith('##') && row.endsWith('.'))).toBe(true);
    }
    const large = depths(rowsOf(EDGE_MASKS[32][0]));
    expect(Math.min(...large)).toBe(2);
    expect(Math.max(...large)).toBe(6);
    expect(count(large, 2)).toBe(2);
    expect(count(large, 6)).toBe(2);
    expect(new Set(large).size).toBe(5);
    expect(new Set(depths(rowsOf(EDGE_MASKS[16][0])))).toEqual(new Set([2, 3]));
  });

  it('a blend piece holds the neighbour\'s floor inside its side\'s stencil and nothing outside it', () => {
    for (const grid of GRIDS) {
      for (let side = 0; side < 4; side++) {
        const piece = blendArt(grid, side, 'grassland', 3);
        const floor = floorArt(grid, 'grassland', 3);
        const mask = rowsOf(EDGE_MASKS[grid][side]);
        for (let y = 0; y < grid; y++) for (let x = 0; x < grid; x++) expect(at(piece, x, y), `${grid} ${side} ${x},${y}`).toBe((mask[y] as string)[x] === '#' ? at(floor, x, y) : 0);
      }
      // a forest spills as its open row does
      expect(text(blendArt(grid, 1, 'conifer', 2))).toBe(text(blendArt(grid, 1, 'grassland', 2)));
      expect(differ(blendArt(grid, 0, 'grassland', 0), blendArt(grid, 0, 'plains', 0))).toBe(true);
    }
  });

  it('has eight coast shapes for a quarter of a square on each grid, whose land meets across quarters and squares', () => {
    const landCells = (rows: readonly string[]): number => rows.join('').split('.').length - 1;
    /** How far the land reaches in from the west along a row, and down from the north along a column. */
    const fromWest = (rows: readonly string[], y: number): number => `${rows[y] as string}#`.indexOf('#');
    const fromNorth = (rows: readonly string[], x: number): number => [...rows, '#'.repeat(rows.length)].findIndex((row) => row[x] === '#');
    for (const grid of GRIDS) {
      const half = grid / 2;
      const shapes = COAST_MASKS[grid].map(rowsOf);
      expect(shapes).toHaveLength(8);
      for (const shape of shapes) {
        expect(shape).toHaveLength(half);
        for (const row of shape) expect(row).toMatch(new RegExp(`^[#.]{${half}}$`));
      }
      const [none, west, corner, westCorner, north, both, northCorner, all] = shapes.map(rowsOf) as [readonly string[], readonly string[], readonly string[], readonly string[], readonly string[], readonly string[], readonly string[], readonly string[]];
      expect(landCells(none)).toBe(0);
      expect(both).toEqual(all);
      // the corner alone is the smallest piece of land, and sits in the corner
      expect((corner[0] as string)[0]).toBe('.');
      for (const shape of [west, westCorner, north, both, northCorner]) expect(landCells(corner)).toBeLessThan(landCells(shape));
      // land down the west side, along the north side, and round the inner corner; water in the middle of the square
      for (let i = 0; i < half; i++) {
        expect(fromWest(west, i), `west ${i}`).toBeGreaterThan(0);
        expect(fromNorth(north, i), `north ${i}`).toBeGreaterThan(0);
        expect(fromWest(both, i)).toBeGreaterThan(0);
        expect(fromNorth(both, i)).toBeGreaterThan(0);
        expect(fromWest(westCorner, i)).toBeGreaterThan(0);
        expect(fromNorth(northCorner, i)).toBeGreaterThan(0);
      }
      for (const shape of shapes) expect((shape[half - 1] as string)[half - 1]).toBe('#');
      // a side's land is one depth at the middle of the side, whichever shape draws it
      const middle = fromWest(west, half - 1);
      for (const shape of [westCorner, both]) expect(fromWest(shape, half - 1)).toBe(middle);
      for (const shape of [north, northCorner, both]) expect(fromNorth(shape, half - 1)).toBe(middle);
      // and one depth at the square's corner where a side ends or a lone corner begins; a side with its corner swells there
      const end = fromWest(west, 0);
      expect(fromNorth(north, 0)).toBe(end);
      expect(fromWest(corner, 0)).toBe(end);
      expect(fromNorth(corner, 0)).toBe(end);
      expect(fromWest(westCorner, 0)).toBeGreaterThan(end);
      expect(fromNorth(northCorner, 0)).toBe(fromWest(westCorner, 0));
      // the edges are uneven
      expect(new Set(Array.from({ length: half }, (_, i) => fromWest(west, i))).size).toBeGreaterThan(1);
      expect(new Set(Array.from({ length: half }, (_, i) => fromNorth(north, i))).size).toBeGreaterThan(1);
    }
  });

  it('a coast piece is the water\'s floor through its quarter\'s shape, with a line of shallows where it meets the land', () => {
    const wave = INK.wave + 1;
    for (const grid of GRIDS) {
      const half = grid / 2;
      const reach = grid / 16;
      for (const water of ['ocean', 'seaLane'] as const) {
        const floor = floorArt(grid, water, 1);
        for (let quadrant = 0; quadrant < 4; quadrant++) {
          const left = quadrant === 1 || quadrant === 2 ? half : 0;
          const top = quadrant >= 2 ? half : 0;
          for (let code = 0; code < 8; code++) {
            let shape = rowsOf(COAST_MASKS[grid][code]);
            for (let turn = 0; turn < quadrant; turn++) shape = rotate(shape);
            const piece = coastArt(grid, water, quadrant, code, 1);
            const land = (x: number, y: number): boolean => shape[y]?.[x] === '.';
            let wrong = '';
            for (let y = 0; y < grid; y++) {
              for (let x = 0; x < grid; x++) {
                const [qx, qy] = [x - left, y - top];
                let expected = 0;
                if (qx >= 0 && qy >= 0 && qx < half && qy < half && !land(qx, qy)) {
                  let nearest = Infinity;
                  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (land(qx + dx, qy + dy)) nearest = Math.min(nearest, Math.max(Math.abs(dx), Math.abs(dy)));
                  expected = nearest <= reach ? wave : at(floor, x, y);
                }
                if (at(piece, x, y) !== expected) wrong = `${x},${y}`;
              }
            }
            expect(wrong, `${grid} ${water} quarter ${quadrant} code ${code}`).toBe('');
          }
          // with no land about, the quarter is the water alone
          expect([...coastArt(grid, water, quadrant, 0, 1).cells].filter((c) => c !== 0)).toHaveLength(half * half);
        }
      }
      // the water under the shape shimmers with the variant, as the open sea does
      expect(differ(coastArt(grid, 'ocean', 0, 2, 0), coastArt(grid, 'ocean', 0, 2, 1))).toBe(true);
      // land along the north of the north-west quarter is, turned once, land along the east of the north-east one
      const northWest = coastArt(grid, 'ocean', 0, 4, 0);
      const northEast = coastArt(grid, 'ocean', 1, 4, 0);
      for (let i = 0; i < half; i++) {
        expect(at(northWest, i, 0)).toBe(0);
        expect(at(northEast, grid - 1, i)).toBe(0);
      }
      expect(at(northEast, half, half - 1)).not.toBe(0);
    }
  });
});

describe('detailed places', () => {
  it('a colony has a picture for each state of its walls, roofed in its owner\'s colour, with its population at the foot', () => {
    const looks = COLONY_LOOKS.map((_, fort) => detailedColonyArt(INK.red, 5, INK.white, fort) as Sprite);
    expect(new Set(looks.map(text)).size).toBe(4);
    for (const s of looks) {
      expect(s.size).toBe(DETAIL);
      expect(inks(s)).toContain(INK.red);
    }
    const blue = detailedColonyArt(INK.blue, 5, INK.white, 0) as Sprite;
    expect(inks(blue)).toContain(INK.blue);
    expect(inks(blue)).not.toContain(INK.red);
    // the population: every count reads differently, in the colour of the colony's loyalties, and 99 is the most shown
    expect(new Set([1, 2, 9, 10, 12, 99].map((n) => text(detailedColonyArt(INK.red, n, INK.white, 0) as Sprite))).size).toBe(6);
    expect(inks(detailedColonyArt(INK.red, 12, INK.green, 0) as Sprite)).toContain(INK.green);
    expect(text(detailedColonyArt(INK.red, 150, INK.white, 0) as Sprite)).toBe(text(detailedColonyArt(INK.red, 99, INK.white, 0) as Sprite));
    // walls beyond a fortress, or less than none, are drawn as the nearest there is
    expect(text(detailedColonyArt(INK.red, 5, INK.white, 7) as Sprite)).toBe(text(looks[3] as Sprite));
  });

  it('a settlement has a picture for each tech level in its people\'s colour; a capital carries a star and the mood mark is an exclamation', () => {
    const looks = VILLAGE_LOOKS.map((_, tech) => detailedSettlementArt(INK.purple, tech, false, null) as Sprite);
    expect(new Set(looks.map(text)).size).toBe(4);
    for (const s of looks) expect(inks(s)).toContain(INK.purple);
    const capital = detailedSettlementArt(INK.purple, 0, true, null) as Sprite;
    expect(at(capital, 3, 3) - 1).toBe(INK.yellow);
    expect(at(looks[0] as Sprite, 3, 3) - 1).not.toBe(INK.yellow);
    const angry = detailedSettlementArt(INK.purple, 0, false, INK.red) as Sprite;
    expect([1, 2, 3, 4, 5, 6, 7].map((y) => at(angry, DETAIL - 3, y) - 1)).toEqual([INK.red, INK.red, INK.red, INK.red, INK.ink, INK.red, INK.red]);
    expect(inks(looks[0] as Sprite)).not.toContain(INK.red);
  });
});

describe('the explorer\'s chart', () => {
  const GRIDS: readonly ChartGrid[] = [32, 16, 8];
  const CHART_INKS: readonly number[] = [INK.parchment, INK.sand, INK.hill, INK.earth, INK.wood, INK.ink];
  const count = (s: Sprite, ink: number): number => [...s.cells].filter((c) => c - 1 === ink).length;
  // the eight neighbours, north first and clockwise
  const N = 1, NE = 2, E = 4, S = 16, W = 64;

  it('is baked in six inks of the map palette and no colours of its own', () => {
    expect(CHART_COLORS.map((colour) => (PALETTE as readonly string[]).indexOf(colour))).toEqual(CHART_INKS);
    for (const [name, rows] of Object.entries(CHART_ART)) {
      expect(rows.every((row) => row.length === rows.length), name).toBe(true);
      expect(rows.join('')).toMatch(/^[pshewk.]+$/);
    }
  });

  it('vellum fills the whole square at each grid, in every variant, mostly bare parchment', () => {
    for (const grid of GRIDS) {
      for (let variant = 0; variant < 4; variant++) {
        const s = vellumArt(grid, variant, 0);
        expect(s.size).toBe(grid);
        expect([...s.cells].every((c) => c >= 1)).toBe(true);
        for (const ink of inks(s)) expect([INK.parchment, INK.sand, INK.hill]).toContain(ink);
        expect(count(s, VELLUM)).toBeGreaterThan(grid * grid * 0.9);
      }
    }
    // a variant is the same vellum turned another way; the smallest is bare
    expect(differ(vellumArt(32, 0, 0), vellumArt(32, 1, 0))).toBe(true);
    expect(differ(vellumArt(16, 0, 0), vellumArt(16, 2, 0))).toBe(true);
    expect(count(vellumArt(32, 0, 0), INK.sand)).toBe(count(vellumArt(32, 3, 0), INK.sand));
    expect(inks(vellumArt(8, 0, 0))).toEqual(new Set([VELLUM]));
  });

  it('vellum is hatched in ink along each edge that meets the known, and nowhere else', () => {
    for (const grid of [32, 16] as const) {
      const bare = vellumArt(grid, 0, 0);
      expect(inks(bare).has(INK.wood) || inks(bare).has(INK.earth)).toBe(false);
      const north = vellumArt(grid, 0, N);
      // the coastline runs the whole edge, with strokes of different lengths reaching in from it
      for (let x = 0; x < grid; x++) expect(at(north, x, 0) - 1).toBe(INK.wood);
      const reach = (x: number): number => Array.from({ length: grid }, (_, y) => y).filter((y) => y > 0 && at(north, x, y) - 1 === INK.earth).length;
      const lengths = Array.from({ length: grid }, (_, x) => reach(x));
      expect(new Set(lengths.filter((n) => n > 0)).size).toBeGreaterThanOrEqual(3);
      expect(lengths.filter((n) => n > 0).length).toBeGreaterThanOrEqual(grid / 4);
      expect(Math.max(...lengths)).toBeLessThan(grid / 4); // light: it stays near the edge
      // the far half of the square is untouched
      for (let y = grid / 2; y < grid; y++) for (let x = 0; x < grid; x++) expect(at(north, x, y)).toBe(at(bare, x, y));
      // each side is hatched on its own edge
      for (let y = 0; y < grid; y++) expect(at(vellumArt(grid, 0, E), grid - 1, y) - 1).toBe(INK.wood);
      for (let x = 0; x < grid; x++) expect(at(vellumArt(grid, 0, S), x, grid - 1) - 1).toBe(INK.wood);
      for (let y = 0; y < grid; y++) expect(at(vellumArt(grid, 0, W), 0, y) - 1).toBe(INK.wood);
      expect(count(vellumArt(grid, 0, N | E | S | W), INK.wood)).toBe(4 * grid - 4);
      // a known square at a corner alone leaves a tick in that corner; beside a hatched side it adds nothing
      const corner = vellumArt(grid, 0, NE);
      expect(at(corner, grid - 1, 0) - 1).toBe(INK.wood);
      expect(count(corner, INK.wood)).toBe(1);
      expect(count(corner, INK.earth)).toBe(grid / 16);
      expect(differ(vellumArt(grid, 0, N), vellumArt(grid, 0, N | NE))).toBe(false);
    }
    // at the smallest zoom the edge is a single quiet line
    const small = vellumArt(8, 0, N);
    for (let x = 0; x < 8; x++) expect(at(small, x, 0) - 1).toBe(INK.hill);
    expect(count(small, INK.hill)).toBe(8);
    expect(count(small, VELLUM)).toBe(56);
  });

  it('has a compass rose, a sea serpent and a ship at each grid, drawn in the chart inks over see-through', () => {
    const seen = new Set<string>();
    for (const kind of CHART_MARK_KINDS) {
      for (const grid of GRIDS) {
        const s = chartMarkArt(kind, grid);
        expect(s.size, `${kind} ${grid}`).toBe(CHART.squares[kind] * grid);
        for (const ink of inks(s)) expect(CHART_INKS, `${kind} ${grid}`).toContain(ink);
        const drawn = [...s.cells].filter((c) => c > 0).length;
        // a drawing on the vellum, not a tile: most of it is left clear, and something is there
        expect(drawn).toBeGreaterThan(s.size);
        expect(drawn).toBeLessThan(s.size * s.size * 0.6);
        expect(inks(s).size, `${kind} ${grid}`).toBeGreaterThanOrEqual(3);
        seen.add(text(s));
      }
    }
    expect(seen.size).toBe(CHART_MARK_KINDS.length * GRIDS.length);
    // the rose is the same either side of its upright, near enough: its north point stands on the middle
    const rose = chartMarkArt('rose', 32);
    expect(at(rose, 63, 8) !== 0 || at(rose, 64, 8) !== 0).toBe(true);
  });

  it('matches the chart snapshot', () => {
    expect({ vellum: text(vellumArt(16, 1, N | W)), corner: text(vellumArt(16, 0, NE)), ship: text(chartMarkArt('ship', 16)), rose: text(chartMarkArt('rose', 8)) }).toMatchSnapshot();
  });
});

describe('helpers', () => {
  it('writes in a three-by-five face', () => {
    const s = blank();
    write(s, 0, 0, '10', INK.white);
    expect(text(s).split('\n').slice(0, 5).map((row) => row.slice(0, 7))).toEqual(['.2..222', '22..2.2', '.2..2.2', '.2..2.2', '222.222']);
  });

  it('has a five-by-seven face for names on the map: capitals, digits, space, hyphen, apostrophe and full stop', () => {
    const listed = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -\'.'];
    for (const ch of [...listed, '?']) {
      const rows = LABEL_GLYPHS[ch];
      expect(rows, ch).toHaveLength(7);
      for (const row of rows!) expect(row, ch).toMatch(/^[#.]{5}$/);
    }
    expect(new Set([...listed, '?'].map((ch) => LABEL_GLYPHS[ch]!.join('\n'))).size).toBe(listed.length + 1);
    // a letter is the glyph in white at (2, 1) with ink on every empty cell that touches it, and nothing else
    for (const ch of listed) {
      const s = labelArt(ch);
      expect(s.size).toBe(10);
      const rows = LABEL_GLYPHS[ch]!;
      const white = (x: number, y: number): boolean => rows[y - 1]?.[x - 2] === '#';
      for (let y = 0; y < 10; y++) {
        for (let x = 0; x < 10; x++) {
          let beside = false;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (white(x + dx, y + dy)) beside = true;
          expect(at(s, x, y), `${ch} at ${x}, ${y}`).toBe(white(x, y) ? INK.white + 1 : beside ? INK.ink + 1 : 0);
        }
      }
    }
    expect(inks(labelArt(' ')).size).toBe(0);
    // an unknown character comes out as a question mark
    expect(text(labelArt('%'))).toBe(text(labelArt('?')));
    expect(differ(labelArt('?'), labelArt('A'))).toBe(true);
  });

  it('writes a name in plain capitals, sixteen characters at most', () => {
    expect(labelText('Jamestown')).toBe('JAMESTOWN');
    expect(labelText('Québec')).toBe('QUEBEC');
    expect(labelText('São Luís-d’Été 2.')).toBe('SAO LUIS-D\'ETE 2');
    expect(labelText('Fort St. George on the Hill')).toBe('FORT ST. GEORGE ');
    expect(labelText('Ærø & Łódź')).toBe('?R? ? ?ODZ');
    expect(labelText('')).toBe('');
  });

  it('halves art for the smallest zoom and turns it into bytes', () => {
    const big = colonyArt(INK.red, 3, INK.white);
    const small = halve(big);
    expect(small.size).toBe(8);
    expect(inks(small)).toContain(INK.red);
    const bytes = toRgba(small);
    expect(bytes).toHaveLength(8 * 8 * 4);
    const i = small.cells.findIndex((c) => c - 1 === INK.red);
    expect([...bytes.slice(i * 4, i * 4 + 4)]).toEqual([0xc8, 0x32, 0x2b, 255]);
    const clear = small.cells.findIndex((c) => c === 0);
    expect(bytes[clear * 4 + 3]).toBe(0);
  });

  it('matches the art snapshot', () => {
    expect({
      plains: text(tileArt(look())), forest: text(tileArt(look({ terrain: 'conifer' }))), mountains: text(tileArt(look({ terrain: 'mountains' }))),
      caravel: text(pieceArt({ type: 'caravel', color: INK.red, label: '-', stacked: false })),
      dragoon: text(pieceArt({ type: 'dragoon', color: INK.blue, label: 'F', stacked: true })),
      colony: text(colonyArt(INK.red, 7, INK.green)), village: text(settlementArt(INK.orange, 2, true, INK.yellow)),
    }).toMatchSnapshot();
  });
});

describe('colony screen art', () => {
  /** A stand-in for a canvas context: it keeps every rectangle it is asked to fill. */
  const brush = (): { fillStyle: string; fills: string[]; fillRect(x: number, y: number, w: number, h: number): void } => ({
    fillStyle: '',
    fills: [],
    fillRect(x, y, w, h) {
      this.fills.push(`${x},${y} ${w}x${h} ${this.fillStyle}`);
    },
  });

  it('every building in the table has a picture of its own on the 32-pixel grid, roofed in its owner\'s colour', () => {
    expect(BUILDING_SIZE).toBe(32);
    const seen = new Map<string, string>();
    for (const id of BUILDING_IDS) {
      const s = buildingArt(id, INK.red) as Sprite;
      expect(s, id).not.toBeNull();
      expect(s.size, id).toBe(32);
      expect([...s.cells].filter((c) => c > 0).length, id).toBeGreaterThan(250); // a building, not a speck
      expect([...s.cells].some((c) => c === 0), id).toBe(true); // standing on a clear ground
      seen.set(id, text(s));
    }
    // the two Town Halls that are never built are drawn as the first; every other building is its own picture
    expect(seen.get('townHall2')).toBe(seen.get('townHall'));
    expect(seen.get('townHall3')).toBe(seen.get('townHall'));
    expect(new Set(seen.values()).size).toBe(BUILDING_IDS.length - 2);
    // nothing is baked that the table does not name
    expect(Object.keys(BUILDING_ART).filter((name) => !(BUILDING_IDS as readonly string[]).includes(name))).toEqual([]);
    expect(buildingArt('lighthouse', INK.red)).toBeNull();
  });

  it('a building takes the owner\'s colour wherever its picture was painted for it', () => {
    for (const id of ['townHall', 'stockade', 'church', 'docks', 'weaversHouse', 'ironWorks', 'capitol'] as const) {
      const red = buildingArt(id, INK.red) as Sprite;
      const blue = buildingArt(id, INK.blue) as Sprite;
      expect(inks(red), id).toContain(INK.red);
      expect(inks(blue), id).toContain(INK.blue);
      expect(inks(blue), id).not.toContain(INK.red);
      // only the owner's parts change
      red.cells.forEach((cell, i) => expect(cell - 1 === INK.red).toBe((blue.cells[i] as number) - 1 === INK.blue));
    }
  });

  it('each link of a chain is drawn differently, so a chain shows the level it has reached', () => {
    for (const chain of [['docks', 'drydock', 'shipyard'], ['stockade', 'fort', 'fortress'], ['schoolhouse', 'college', 'university'], ['weaversHouse', 'weaversShop', 'textileMill']] as const) {
      expect(new Set(chain.map((id) => text(buildingArt(id, INK.red) as Sprite))).size, chain.join()).toBe(chain.length);
    }
  });

  it('every good, and hammers, crosses and bells, has an icon of its own on the 16-pixel grid', () => {
    expect(GOODS_SIZE).toBe(16);
    const all = [...GOOD_IDS, ...ABSTRACT_GOOD_IDS];
    expect(all).toHaveLength(19);
    expect(Object.keys(GOODS_ART).sort()).toEqual([...all].sort());
    const seen = all.map((good) => {
      const s = goodArt(good) as Sprite;
      expect(s.size, good).toBe(16);
      expect([...s.cells].filter((c) => c > 0).length, good).toBeGreaterThan(40);
      return text(s);
    });
    expect(new Set(seen).size).toBe(19);
    expect(goodArt('fish')).toBeNull();
  });

  it('drawGood paints an icon as blocks of colour at any whole size, and says when a good has none', () => {
    const one = brush();
    expect(drawGood(one, 'bells', 0, 0)).toBe(true);
    const bell = goodArt('bells') as Sprite;
    expect(one.fills).toHaveLength([...bell.cells].filter((c) => c > 0).length);
    for (const fill of one.fills) expect(fill).toMatch(/^\d+,\d+ 1x1 #[0-9a-f]{6}$/);
    const doubled = brush();
    expect(drawGood(doubled, 'bells', 10, 20, 32)).toBe(true);
    expect(doubled.fills).toHaveLength(one.fills.length);
    for (const fill of doubled.fills) expect(fill).toMatch(/ 2x2 #/);
    const [x, y] = (doubled.fills[0] as string).split(' ')[0]!.split(',').map(Number) as [number, number];
    expect(x).toBeGreaterThanOrEqual(10);
    expect(y).toBeGreaterThanOrEqual(20);
    const none = brush();
    expect(drawGood(none, 'fish', 0, 0)).toBe(false);
    expect(none.fills).toEqual([]);
    // an uneven size still covers the square exactly, with no gaps between blocks
    const odd = brush();
    drawSprite(odd, flagArt('england'), 0, 0, 24);
    const widths = new Set(odd.fills.map((f) => (f.split(' ')[1] as string).split('x')[0]));
    expect([...widths].sort()).toEqual(['1', '2']);
  });

  it('there is a flag for each of the four powers and for the Crown, each in its own colours inside an ink edge', () => {
    expect(FLAG_IDS).toEqual([...NATION_IDS, 'crown']);
    const flags = FLAG_IDS.map((id) => flagArt(id));
    expect(new Set(flags.map(text)).size).toBe(5);
    for (const s of flags) {
      expect(s.size).toBe(ART);
      expect(at(s, 0, 2)).toBe(INK.ink + 1);
      expect(at(s, 15, 13)).toBe(INK.ink + 1);
      expect(at(s, 0, 0)).toBe(0);
    }
    expect([...inks(flagArt('england'))].sort()).toEqual([INK.ink, INK.white, INK.red].sort());
    expect([...inks(flagArt('france'))].sort()).toEqual([INK.ink, INK.blue, INK.yellow].sort());
    expect([...inks(flagArt('spain'))].sort()).toEqual([INK.ink, INK.white, INK.red].sort());
    expect([...inks(flagArt('netherlands'))].sort()).toEqual([INK.ink, INK.white, INK.orange, INK.blue].sort());
    expect(inks(flagArt('crown'))).toContain(INK.purple);
    expect(inks(flagArt('crown'))).toContain(INK.yellow);
  });

  it('there are four seals, each a round of wax in the colour asked for with its own mark pressed in', () => {
    expect(SEAL_GLYPHS).toEqual(['quill', 'cross', 'anchor', 'wheat']);
    const seals = SEAL_GLYPHS.map((glyph) => sealArt(glyph, INK.red));
    expect(new Set(seals.map(text)).size).toBe(4);
    for (const s of seals) {
      expect(s.size).toBe(ART);
      // round: the corners are clear and the edge is ink
      for (const [x, y] of [[0, 0], [15, 0], [0, 15], [15, 15]] as const) expect(at(s, x, y)).toBe(0);
      expect(at(s, 0, 8)).toBe(INK.ink + 1);
      expect(at(s, 8, 15)).toBe(INK.ink + 1);
      expect([...inks(s)].sort()).toEqual([INK.ink, INK.white, INK.parchment, INK.red].sort());
      // the mark is the same whatever the wax
      const marked = (seal: Sprite, ink: number): string => text(seal).replace(new RegExp(`[^${ink.toString(32)}\n]`, 'g'), '.');
      expect(marked(sealArt(SEAL_GLYPHS[seals.indexOf(s)]!, INK.blue), INK.parchment)).toBe(marked(s, INK.parchment));
    }
    // the wax is the colour asked for, and a pale wax takes its mark in ink so it can still be read
    expect(inks(sealArt('anchor', INK.sea))).toContain(INK.sea);
    expect([...inks(sealArt('anchor', INK.yellow))].sort()).toEqual([INK.ink, INK.white, INK.yellow].sort());
  });

  it('a figure for a token is the unit\'s detailed figure with nothing under it', () => {
    const colonist = figureArt('colonist') as Sprite;
    expect(colonist.size).toBe(30);
    expect([...colonist.cells].some((c) => c > 0)).toBe(true);
    expect(text(figureArt('caravel') as Sprite)).not.toBe(text(colonist));
    expect(figureArt('nobody')).toBeNull();
  });

  it('all the colours of all the art still fit in a byte', () => {
    expect(ART_COLORS.length).toBeLessThanOrEqual(255);
    for (const colour of ART_COLORS) expect(colour).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('matches the snapshot of the four seals', () => {
    expect(Object.fromEntries(SEAL_GLYPHS.map((glyph) => [glyph, text(sealArt(glyph, INK.red))]))).toMatchSnapshot();
  });

  it('matches the snapshot of a flag, an icon and a building', () => {
    expect({ flag: text(flagArt('netherlands')), crown: text(flagArt('crown')), bell: text(goodArt('bells') as Sprite), townHall: text(buildingArt('townHall', INK.red) as Sprite) }).toMatchSnapshot();
  });
});
