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
import { FEATURE_ART, FEATURE_ART_16, FEATURE_CODES, FEATURE_COLORS, FEATURE_SIZE, FEATURE_SIZE_16 } from '../../../src/ui/feature-art';
import { FLOOR_ART, FLOOR_ART_16, FLOOR_CODES, FLOOR_COLORS, FLOOR_SIZE, FLOOR_SIZE_16 } from '../../../src/ui/floor-art';
import { GOODS_ART, GOODS_SIZE } from '../../../src/ui/goods-art';
import { RESOURCE_ART, RESOURCE_ART_12, RESOURCE_CODES, RESOURCE_COLORS, RESOURCE_SIZE, RESOURCE_SIZE_12 } from '../../../src/ui/resource-art';
import { ART_COLORS, buildingArt, drawGood, drawSprite, figureArt, FLAG_IDS, flagArt, goodArt, SEAL_GLYPHS, sealArt } from '../../../src/ui/pixel-art';
import { CHART, CHART_MARK_KINDS } from '../../../src/ui/chart';
import { CHART_ART, CHART_COLORS } from '../../../src/ui/chart-art';
import { blendArt, COAST_MASKS, coastArt, EDGE_MASKS, floorArt, joins, openOf, overArt, rotate, type TileGrid } from '../../../src/ui/pixel-art';
import { activeFrameArt, ART, at, blank, blockedCursorArt, cursorArt, chartMarkArt, colonyArt, COLONY_LOOKS, DETAIL, detailedColonyArt, detailedPieceArt, detailedSettlementArt, detailedTileArt, GROUND, halve, hasFigure, INK, LABEL_GLYPHS, labelArt, labelText, MINI, miniTileArt, PALETTE, pieceArt, rumorSealArt, settlementArt, tileArt, toRgba, VELLUM, vellumArt, VILLAGE_LOOKS, write, type ChartGrid, type Sprite, type TileLook } from '../../../src/ui/pixel-art';

const look = (change: Partial<TileLook> = {}): TileLook => ({ terrain: 'plains', river: 'none', riverMask: 0, road: false, roadMask: 0, plowed: false, resource: null, rumor: false, totem: false, variant: 0, joinMask: 0, mouthMask: 0, ...change });
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
        expect([...s.cells].every((c) => c >= 1 && c <= ART_COLORS.length), terrain).toBe(true);
      }
      const mini = miniTileArt(look({ terrain }));
      expect(mini.size).toBe(8);
      expect([...mini.cells].every((c) => c >= 1), terrain).toBe(true);
    }
  });

  it('every terrain can be told from every other, at full size and at the smallest zoom apart from open and wooded ground of one colour', () => {
    for (let variant = 0; variant < 4; variant++) {
      const full = new Map(TERRAIN_IDS.map((t) => [t, text(tileArt(look({ terrain: t, variant })))]));
      expect(new Set(full.values()).size, `variant ${variant}`).toBe(TERRAIN_IDS.length);
    }
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
    expect(inks(tileArt(look({ river: 'minor', riverMask: 5 })))).toContain(INK.blue);
    expect(inks(tileArt(look({ river: 'minor', riverMask: 5 })))).toContain(INK.brightBlue);
    const minor = [...tileArt(look({ river: 'minor', riverMask: 5 })).cells].filter((c) => c - 1 === INK.blue).length;
    const major = [...tileArt(look({ river: 'major', riverMask: 5 })).cells].filter((c) => c - 1 === INK.blue).length;
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

describe('the lost-city seal', () => {
  const square = (grid: ChartGrid, change: Partial<TileLook> = {}): Sprite => (grid === 32 ? detailedTileArt(look(change)) : grid === 16 ? tileArt(look(change)) : miniTileArt(look(change)));
  const cellsOf = (s: Sprite): number[] => [...s.cells].flatMap((cell, i) => (cell === 0 ? [] : [i]));
  const changed = (a: Sprite, b: Sprite): number[] => [...a.cells].flatMap((cell, i) => (cell === b.cells[i] ? [] : [i]));

  it('marks a rumor at every grid, in gold: yellow, orange, wood, ink and white and nothing else', () => {
    for (const grid of [32, 16, 8] as const) {
      const seal = rumorSealArt(grid);
      expect(seal.size).toBe(grid);
      expect(differ(square(grid), square(grid, { rumor: true })), `${grid}`).toBe(true);
      // the square with a rumor is the square without, with the seal laid over it
      expect(changed(square(grid), square(grid, { rumor: true }))).toEqual(cellsOf(seal));
      for (const i of cellsOf(seal)) expect(square(grid, { rumor: true }).cells[i]).toBe(seal.cells[i]);
    }
    for (const grid of [32, 16] as const) expect(inks(rumorSealArt(grid))).toEqual(new Set([INK.yellow, INK.orange, INK.wood, INK.ink, INK.white]));
    // it stands on the floor: on open ground with nothing else, the over layer is the seal alone
    for (const grid of [32, 16] as const) expect(text(overArt(look({ rumor: true }), grid))).toBe(text(rumorSealArt(grid)));
    // at the smallest grid, a dot of two by two at (1, 5)
    expect(text(rumorSealArt(8))).toBe(['........', '........', '........', '........', '........', '.ss.....', '.ss.....', '........'].join('\n').replaceAll('s', INK.yellow.toString(32)));
  });

  it('is round and fills the lower left quarter of the square on the 32 and 16 grids', () => {
    for (const grid of [32, 16] as const) {
      const seal = rumorSealArt(grid);
      const half = grid / 2;
      for (const i of cellsOf(seal)) {
        expect(i % grid, `${grid}`).toBeLessThan(half);
        expect(Math.floor(i / grid), `${grid}`).toBeGreaterThanOrEqual(half);
      }
      // each row is one unbroken run, centred; the middle rows span the quarter and the top and bottom are narrow
      const widths = Array.from({ length: half }, (_, j) => {
        const xs = Array.from({ length: half }, (_, x) => x).filter((x) => at(seal, x, half + j) !== 0);
        expect(xs.length, `${grid} row ${j}`).toBe((xs.at(-1) as number) - (xs[0] as number) + 1);
        expect((xs[0] as number) + (xs.at(-1) as number), `${grid} row ${j}`).toBe(half - 1);
        return xs.length;
      });
      expect(widths[half / 2 - 1]).toBe(half);
      expect(widths[half / 2]).toBe(half);
      expect(Math.max(...widths)).toBe(half);
      expect(widths[0] as number).toBeLessThan(8);
      expect(widths[half - 1] as number).toBeLessThan(8);
      expect(widths[0] as number).toBeLessThanOrEqual(half / 2);
      expect(widths[half - 1] as number).toBeLessThanOrEqual(half / 2);
      // it never widens toward the top or the bottom, and the rim is ink all the way round
      for (let j = 1; j < half / 2; j++) expect(widths[j] as number).toBeGreaterThanOrEqual(widths[j - 1] as number);
      for (let j = half / 2 + 1; j < half; j++) expect(widths[j] as number).toBeLessThanOrEqual(widths[j - 1] as number);
      for (const i of cellsOf(seal)) {
        const [x, y] = [i % grid, Math.floor(i / grid)];
        if ([at(seal, x - 1, y), at(seal, x + 1, y), at(seal, x, y - 1), at(seal, x, y + 1)].includes(0)) expect(at(seal, x, y) - 1, `${grid} ${x},${y}`).toBe(INK.ink);
      }
    }
    // the pyramid has three steps on the 32 grid and two on the 16: each run of wood wider than the one above
    const steps = (grid: 32 | 16): number[] => {
      const seal = rumorSealArt(grid);
      const runs = Array.from({ length: grid }, (_, y) => Array.from({ length: grid }, (_, x) => x).filter((x) => at(seal, x, y) - 1 === INK.wood).length).filter((n) => n > 0);
      return [...new Set(runs)];
    };
    expect(steps(32)).toEqual([2, 6, 10]);
    expect(steps(16)).toEqual([2, 4]);
    // the glint is at the upper left and the shade at the lower right
    for (const grid of [32, 16] as const) {
      const seal = rumorSealArt(grid);
      const middle = (ink: number): [number, number] => {
        const found = cellsOf(seal).filter((i) => (seal.cells[i] as number) - 1 === ink);
        return [found.reduce((sum, i) => sum + (i % grid), 0) / found.length, found.reduce((sum, i) => sum + Math.floor(i / grid), 0) / found.length];
      };
      const centre = [grid / 4 - 0.5, (grid * 3) / 4 - 0.5] as const;
      expect(middle(INK.white)[0]).toBeLessThan(centre[0]);
      expect(middle(INK.white)[1]).toBeLessThan(centre[1]);
      expect(middle(INK.orange)[0]).toBeGreaterThan(centre[0]);
      expect(middle(INK.orange)[1]).toBeGreaterThan(centre[1]);
    }
  });

  it('stands whole over the corner of a resource marker, the trees, the river and the furrows, under a road, and clear of the totem', () => {
    for (const grid of [32, 16] as const) {
      const seal = rumorSealArt(grid);
      // every resource's marker reaches into the seal's quarter: there the seal is whole, and elsewhere the marker is
      for (const resource of RESOURCE_IDS) {
        const marker = changed(square(grid), square(grid, { resource }));
        expect(marker.filter((i) => seal.cells[i] !== 0).length, `${grid} ${resource}`).toBeGreaterThan(0);
        const both = square(grid, { resource, rumor: true });
        for (const i of cellsOf(seal)) expect(both.cells[i], `${grid} ${resource}`).toBe(seal.cells[i]);
        for (const i of marker) if (seal.cells[i] === 0) expect(both.cells[i], `${grid} ${resource}`).toBe(square(grid, { resource }).cells[i]);
      }
      // what is drawn before it and does reach its quarter lies under it: trees, a river to the south and west, furrows
      for (const under of [{ terrain: 'mixed' }, { river: 'major', riverMask: 12 }, { plowed: true }] as const satisfies readonly Partial<TileLook>[]) {
        const reaches = changed(square(grid), square(grid, under)).filter((i) => seal.cells[i] !== 0);
        expect(reaches.length, `${grid} ${JSON.stringify(under)}`).toBeGreaterThan(0);
        const sealed = square(grid, { ...under, rumor: true });
        for (const i of cellsOf(seal)) expect(sealed.cells[i], `${grid} ${JSON.stringify(under)}`).toBe(seal.cells[i]);
      }
      // a road runs over the seal: every cell of a road to the south-west is the road's, with the seal or without
      const road = { road: true, roadMask: 32 } as const;
      const paved = changed(square(grid), square(grid, road));
      expect(paved.some((i) => seal.cells[i] !== 0)).toBe(true);
      for (const i of paved) expect(square(grid, { ...road, rumor: true }).cells[i]).toBe(square(grid, road).cells[i]);
      // the totem stands in the upper left quarter and shares no cell with the seal
      const totem = changed(square(grid), square(grid, { totem: true }));
      expect(totem.length).toBeGreaterThan(0);
      for (const i of totem) {
        expect(seal.cells[i]).toBe(0);
        expect(i % grid).toBeLessThan(grid / 2);
        expect(Math.floor(i / grid)).toBeLessThan(grid / 2);
        if (grid === 32) {
          expect(i % grid).toBeGreaterThanOrEqual(4);
          expect(i % grid).toBeLessThanOrEqual(13);
        }
      }
      expect(changed(square(grid, { rumor: true }), square(grid, { rumor: true, totem: true }))).toEqual(totem);
    }
  });
});

describe('resource markers', () => {
  const first = ART_COLORS.length - RESOURCE_COLORS.length;
  const isMarker = (cell: number): boolean => cell - 1 >= first;
  const grids = [[detailedTileArt, DETAIL, RESOURCE_ART, RESOURCE_SIZE], [tileArt, ART, RESOURCE_ART_12, RESOURCE_SIZE_12]] as const;

  it('there is a picture of each of the thirteen at 24 pixels and at 12, every one its own', () => {
    expect(RESOURCE_COLORS.length).toBeLessThanOrEqual(24);
    const letters = RESOURCE_CODES.slice(0, RESOURCE_COLORS.length);
    const sum = (colour: string): number => [1, 3, 5].reduce((n, i) => n + parseInt(colour.slice(i, i + 2), 16), 0);
    const darkest = letters[RESOURCE_COLORS.indexOf([...RESOURCE_COLORS].sort((a, b) => sum(a) - sum(b))[0] as (typeof RESOURCE_COLORS)[number])] as string;
    for (const [art, size] of [[RESOURCE_ART, RESOURCE_SIZE], [RESOURCE_ART_12, RESOURCE_SIZE_12]] as const) {
      expect(Object.keys(art).sort()).toEqual([...RESOURCE_IDS].sort());
      expect(new Set(Object.values(art).map((rows) => rows.join('\n'))).size).toBe(RESOURCE_IDS.length);
      for (const [id, rows] of Object.entries(art)) {
        expect(rows.length, id).toBe(size);
        // a see-through cell or a colour of the 24-pixel bake, and nothing else
        for (const row of rows) expect([...row].every((ch) => ch === '.' || letters.includes(ch)) && row.length === size, `${id}: ${row}`).toBe(true);
      }
    }
    expect([RESOURCE_SIZE, RESOURCE_SIZE_12]).toEqual([24, 12]);
    for (const id of RESOURCE_IDS) {
      const cells = (RESOURCE_ART[id] as readonly string[]).join('');
      const opaque = [...cells].filter((ch) => ch !== '.').length;
      expect(opaque, id).toBeGreaterThanOrEqual(120);
      expect(opaque, id).toBeLessThanOrEqual(460);
      // the dark outline that lets it read on any ground
      expect(cells.includes(darkest), id).toBe(true);
    }
  });

  it('a marker shows in the middle of the square on the 32 and 16 grids, and not at all on the 8', () => {
    for (const resource of RESOURCE_IDS) {
      expect(text(miniTileArt(look({ resource }))), resource).toBe(text(miniTileArt(look())));
      for (const [draw, grid, art, size] of grids) {
        const [plain, marked] = [draw(look()), draw(look({ resource }))];
        const rows = art[resource] as readonly string[];
        const edge = (grid - size) / 2;
        expect(differ(plain, marked), resource).toBe(true);
        for (let y = 0; y < grid; y++) {
          for (let x = 0; x < grid; x++) {
            const inside = x >= edge && x < edge + size && y >= edge && y < edge + size;
            const opaque = inside && rows[y - edge]?.[x - edge] !== '.';
            // the picture itself where it is opaque, at one art pixel to the cell, and the bare square everywhere else
            if (opaque) expect(at(marked, x, y) - 1, `${resource} ${x},${y}`).toBe(first + RESOURCE_CODES.indexOf(rows[y - edge]?.[x - edge] as string));
            else expect(at(marked, x, y), `${resource} ${x},${y}`).toBe(at(plain, x, y));
          }
        }
      }
    }
  });

  it('a marker stands over the forest and under the road', () => {
    for (const [draw, grid, art, size] of grids) {
      const edge = (grid - size) / 2;
      const opaque = (id: keyof typeof art | string, x: number, y: number): boolean => ((art[id] as readonly string[])[y - edge]?.[x - edge] ?? '.') !== '.';
      // over the trees: every opaque cell of the beaver is the beaver's own colour, whatever the wood has there
      const wood = draw(look({ terrain: 'mixed' }));
      const beaver = draw(look({ terrain: 'mixed', resource: 'beaver' }));
      let covered = 0;
      for (let y = 0; y < grid; y++) {
        for (let x = 0; x < grid; x++) {
          if (!opaque('beaver', x, y)) continue;
          expect(isMarker(at(beaver, x, y)), `${grid}: ${x},${y}`).toBe(true);
          if (at(wood, x, y) !== at(draw(look()), x, y)) covered++;
        }
      }
      expect(covered, `${grid}: the marker hides some of the trees`).toBeGreaterThan(0);
      // under the road: wherever the road runs through the marker, the cell is the road's
      const road = draw(look({ road: true, roadMask: 0b01000100 }));
      const both = draw(look({ road: true, roadMask: 0b01000100, resource: 'wheat' }));
      const bare = draw(look());
      let crossed = 0;
      for (let y = 0; y < grid; y++) {
        for (let x = 0; x < grid; x++) {
          if (at(road, x, y) === at(bare, x, y)) continue;
          expect(at(both, x, y), `${grid}: ${x},${y}`).toBe(at(road, x, y));
          if (opaque('wheat', x, y)) crossed++;
        }
      }
      expect(crossed, `${grid}: the road crosses the marker`).toBeGreaterThan(0);
    }
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

  const FORESTS = ['boreal', 'conifer', 'mixed', 'broadleaf', 'tropical', 'wetland', 'rain', 'scrub'] as const;
  const FLOORS = ['arctic', 'tundra', 'desert', 'plains', 'prairie', 'grassland', 'savannah', 'marsh', 'swamp', 'hills', 'mountains', 'ocean', 'seaLane'] as const;

  it('every baked floor is mostly its terrain\'s ground colour, the one the far zooms and the minimap draw it in, at 32 pixels and at 16', () => {
    expect(FLOOR_COLORS.length).toBeLessThanOrEqual(32);
    // the floors are baked in the map palette itself, so the ground is the palette's colours at every zoom
    for (const colour of FLOOR_COLORS) expect(PALETTE as readonly string[], colour).toContain(colour);
    expect([FLOOR_SIZE, FLOOR_SIZE_16]).toEqual([32, 16]);
    const letters = FLOOR_CODES.slice(0, FLOOR_COLORS.length);
    for (const [art, size] of [[FLOOR_ART, FLOOR_SIZE], [FLOOR_ART_16, FLOOR_SIZE_16]] as const) {
      expect(Object.keys(art).sort()).toEqual([...FLOORS].sort());
      for (const [name, rows] of Object.entries(art)) {
        expect(rows.length, name).toBe(size);
        // every cell is a colour of the 32-pixel bake: a floor has no see-through cell, and the copy no colour of its own
        for (const row of rows) expect(row.length === size && [...row].every((ch) => letters.includes(ch)), `${name} ${size}: ${row}`).toBe(true);
        const count = new Map<string, number>();
        for (const letter of rows.join('')) count.set(letter, (count.get(letter) ?? 0) + 1);
        const [commonest, cells] = [...count].sort((a, b) => b[1] - a[1])[0] as [string, number];
        expect(FLOOR_COLORS[FLOOR_CODES.indexOf(commonest)], `${name} ${size}`).toBe(PALETTE[GROUND[name as keyof typeof GROUND]]);
        expect(cells, `${name} ${size}`).toBeGreaterThanOrEqual(0.4 * size * size);
        // and it is textured: not the one colour alone
        expect(count.size, `${name} ${size}`).toBeGreaterThan(1);
      }
    }
  });

  it('there is a picture of each forest, of hills and of mountains at 32 pixels and at 16, every one its own, filling most of its square', () => {
    expect(FEATURE_COLORS.length).toBeLessThanOrEqual(32);
    expect([FEATURE_SIZE, FEATURE_SIZE_16]).toEqual([32, 16]);
    const letters = FEATURE_CODES.slice(0, FEATURE_COLORS.length);
    for (const [art, size] of [[FEATURE_ART, FEATURE_SIZE], [FEATURE_ART_16, FEATURE_SIZE_16]] as const) {
      expect(Object.keys(art).sort()).toEqual([...FORESTS, 'hills', 'mountains'].sort());
      expect(new Set(Object.values(art).map((rows) => rows.join('\n'))).size).toBe(10);
      for (const [name, rows] of Object.entries(art)) {
        expect(rows.length, name).toBe(size);
        // a see-through cell or a colour of the 32-pixel bake, and nothing else
        for (const row of rows) expect(row.length === size && [...row].every((ch) => ch === '.' || letters.includes(ch)), `${name} ${size}: ${row}`).toBe(true);
      }
    }
    const cover = (rows: readonly string[] | undefined): number => [...(rows as readonly string[]).join('')].filter((ch) => ch !== '.').length / (rows as readonly string[]).join('').length;
    for (const forest of FORESTS) expect(cover(FEATURE_ART[forest]), forest).toBeGreaterThanOrEqual(0.6);
    for (const rise of ['hills', 'mountains']) expect(cover(FEATURE_ART[rise]), rise).toBeGreaterThanOrEqual(0.45);
  });

  it('the 16-pixel grid draws the baked ground and features, turned by the variant as the 32-pixel grid turns its own', () => {
    for (const open of FLOORS) {
      const rows = FLOOR_ART_16[open] as readonly string[];
      const [a, b, c, d] = [0, 1, 2, 3].map((variant) => floorArt(16, open, variant)) as [Sprite, Sprite, Sprite, Sprite];
      for (let y = 0; y < ART; y++) {
        for (let x = 0; x < ART; x++) {
          expect(ART_COLORS[at(a, x, y) - 1], `${open} ${x},${y}`).toBe(FLOOR_COLORS[FLOOR_CODES.indexOf((rows[y] as string)[x] as string)]);
          expect(at(b, x, y)).toBe(at(a, ART - 1 - x, y));
          expect(at(c, x, y)).toBe(at(a, x, ART - 1 - y));
          expect(at(d, x, y)).toBe(at(a, ART - 1 - x, ART - 1 - y));
        }
      }
    }
    for (const terrain of [...FORESTS, 'hills', 'mountains'] as const) {
      const rows = FEATURE_ART_16[terrain] as readonly string[];
      const [a, b, c] = [0, 1, 2].map((variant) => overArt(look({ terrain, variant }), 16)) as [Sprite, Sprite, Sprite];
      for (let y = 0; y < ART; y++) {
        for (let x = 0; x < ART; x++) {
          // the picture's own cells and no others; mirrored by the variant, never turned upside down
          expect(at(a, x, y) !== 0, `${terrain} ${x},${y}`).toBe((rows[y] as string)[x] !== '.');
          if (at(a, x, y) !== 0) expect(ART_COLORS[at(a, x, y) - 1], `${terrain} ${x},${y}`).toBe(FEATURE_COLORS[FEATURE_CODES.indexOf((rows[y] as string)[x] as string)]);
          expect(at(b, x, y)).toBe(at(a, ART - 1 - x, y));
          expect(at(c, x, y)).toBe(at(a, x, y));
        }
      }
    }
  });

  it('a river runs through a forest in a clearing and over the hills and the mountains: every cell of its body and of its rim shows', () => {
    for (const grid of [32, 16] as const) {
      for (const river of ['minor', 'major'] as const) {
        const stroke = overArt(look({ river, riverMask: 10 }), grid);
        expect(inks(stroke)).toEqual(new Set([INK.blue, INK.brightBlue]));
        for (const terrain of [...FORESTS, 'hills', 'mountains'] as const) {
          for (let variant = 0; variant < 4; variant++) {
            const bare = overArt(look({ variant, river, riverMask: 10 }), grid);
            const over = overArt(look({ terrain, variant, river, riverMask: 10 }), grid);
            for (let i = 0; i < bare.cells.length; i++) if (bare.cells[i] !== 0) expect(over.cells[i], `${grid} ${terrain} ${variant}`).toBe(bare.cells[i]);
            // a forest is cut back from the water (two cells on the 32 grid, one on the 16) and shaded at the cut;
            // the hills and the mountains are not: the river lies on them
            const dry = overArt(look({ terrain, variant }), grid);
            const reach = grid === 32 ? 2 : 1;
            const wet = (x: number, y: number): boolean => at(bare, x, y) !== 0;
            const near = (x: number, y: number, by: number): boolean => Array.from({ length: 2 * by + 1 }, (_, j) => j - by).some((dy) => Array.from({ length: 2 * by + 1 }, (_, j) => j - by).some((dx) => wet(x + dx, y + dy)));
            let shaded = 0;
            for (let y = 0; y < grid; y++) {
              for (let x = 0; x < grid; x++) {
                if (wet(x, y)) continue;
                const where = `${grid} ${terrain} ${variant} (${x}, ${y})`;
                if (!(FORESTS as readonly string[]).includes(terrain)) expect(at(over, x, y), where).toBe(at(dry, x, y));
                else if (near(x, y, reach)) expect(at(over, x, y), where).toBe(0);
                else if (!near(x, y, reach + 1)) expect(at(over, x, y), where).toBe(at(dry, x, y));
                else if (at(over, x, y) !== at(dry, x, y)) {
                  expect(at(over, x, y) - 1, where).toBe(INK.deepForest);
                  shaded++;
                }
              }
            }
            if ((FORESTS as readonly string[]).includes(terrain)) expect(shaded, `${grid} ${terrain} ${variant}`).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it('a wood joins any wood but scrub, hills join hills and mountains mountains; open ground and water join nothing', () => {
    for (const a of TERRAIN_IDS) {
      for (const b of TERRAIN_IDS) {
        const wood = (t: string): boolean => (FORESTS as readonly string[]).includes(t) && t !== 'scrub';
        expect(joins(a, b), `${a} ${b}`).toBe((wood(a) && wood(b)) || ((a === 'hills' || a === 'mountains') && a === b));
      }
    }
  });

  it('a join is the feature once more, half a square toward that side, cut off at the edge and under the feature itself', () => {
    for (const grid of [32, 16] as const) {
      const half = grid / 2;
      for (const terrain of ['mixed', 'boreal', 'hills', 'mountains'] as const) {
        for (let variant = 0; variant < 4; variant++) {
          const own = overArt(look({ terrain, variant }), grid);
          [[0, -1], [1, 0], [0, 1], [-1, 0]].forEach(([dx, dy], side) => {
            const made = overArt(look({ terrain, variant, joinMask: 1 << side }), grid);
            for (let y = 0; y < grid; y++) {
              for (let x = 0; x < grid; x++) {
                const moved = at(own, x - (dx as number) * half, y - (dy as number) * half);
                expect(at(made, x, y), `${grid} ${terrain} ${variant} side ${side} ${x},${y}`).toBe(at(own, x, y) !== 0 ? at(own, x, y) : moved);
              }
            }
          });
          // all four at once never uncover what one alone covers
          const all = overArt(look({ terrain, variant, joinMask: 15 }), grid);
          for (let side = 0; side < 4; side++) {
            const one = overArt(look({ terrain, variant, joinMask: 1 << side }), grid);
            for (let i = 0; i < one.cells.length; i++) if (one.cells[i] !== 0) expect(all.cells[i]).not.toBe(0);
          }
        }
      }
      // open ground has nothing to join with, whatever the mask says
      expect(inks(overArt(look({ joinMask: 15 }), grid)).size).toBe(0);
    }
  });

  it('what stands on a square is laid in order: joins, feature, furrows, river or mouths, marker, seal, road, totem', () => {
    for (const grid of [32, 16] as const) {
      const cellsOf = (s: Sprite): number[] => [...s.cells].map((c, i) => (c !== 0 ? i : -1)).filter((i) => i >= 0);
      // the furrows show over a joined canopy, and the river over the furrows
      const rows = overArt(look({ plowed: true }), grid);
      const field = overArt(look({ terrain: 'mixed', joinMask: 15, plowed: true }), grid);
      for (const i of cellsOf(rows)) expect(field.cells[i]).toBe(rows.cells[i]);
      const stream = overArt(look({ river: 'major', riverMask: 15 }), grid);
      const wet = overArt(look({ terrain: 'mixed', joinMask: 15, plowed: true, river: 'major', riverMask: 15 }), grid);
      for (const i of cellsOf(stream)) expect(wet.cells[i]).toBe(stream.cells[i]);
      // a river's mouths lie under the marker, the marker under the seal, the seal under the road, the road under the totem
      const mouth = overArt(look({ terrain: 'ocean', mouthMask: 15 | 240 }), grid);
      expect(inks(mouth)).toEqual(new Set([INK.blue, INK.brightBlue]));
      const fish = overArt(look({ terrain: 'ocean', resource: 'fishery' }), grid);
      const both = overArt(look({ terrain: 'ocean', resource: 'fishery', mouthMask: 15 | 240 }), grid);
      expect(cellsOf(fish).some((i) => mouth.cells[i] !== 0)).toBe(true);
      for (const i of cellsOf(fish)) expect(both.cells[i]).toBe(fish.cells[i]);
      for (const i of cellsOf(mouth)) if (fish.cells[i] === 0) expect(both.cells[i]).toBe(mouth.cells[i]);
      // on land the marker stands over the river that crosses it
      const wheat = overArt(look({ resource: 'wheat' }), grid);
      const crossed = overArt(look({ resource: 'wheat', river: 'major', riverMask: 15 }), grid);
      expect(cellsOf(wheat).some((i) => stream.cells[i] !== 0)).toBe(true);
      for (const i of cellsOf(wheat)) expect(crossed.cells[i]).toBe(wheat.cells[i]);
      for (const i of cellsOf(stream)) if (wheat.cells[i] === 0) expect(crossed.cells[i]).toBe(stream.cells[i]);
      const seal = overArt(look({ rumor: true }), grid);
      const marked = overArt(look({ resource: 'wheat', rumor: true }), grid);
      for (const i of cellsOf(seal)) expect(marked.cells[i]).toBe(seal.cells[i]);
      const way = overArt(look({ road: true, roadMask: 255 }), grid);
      const full = overArt(look({ terrain: 'mixed', joinMask: 15, plowed: true, river: 'major', riverMask: 15, resource: 'wheat', rumor: true, road: true, roadMask: 255, totem: true }), grid);
      const pole = overArt(look({ totem: true }), grid);
      for (const i of cellsOf(way)) if (pole.cells[i] === 0) expect(full.cells[i]).toBe(way.cells[i]);
      for (const i of cellsOf(pole)) expect(full.cells[i]).toBe(pole.cells[i]);
    }
  });

  it('a river mouth is the end of its river on the water, in that river\'s width, on both grids, and the smallest zoom shows none', () => {
    const blue = (s: Sprite): number => [...s.cells].filter((c) => c - 1 === INK.blue).length;
    for (const grid of [32, 16] as const) {
      for (let side = 0; side < 4; side++) {
        // the body of a mouth is the body of the end piece that runs on to that side, minor and major
        for (const [river, major] of [['minor', 0], ['major', 16 << side]] as const) {
          const mouth = overArt(look({ terrain: 'ocean', mouthMask: (1 << side) | major }), grid);
          const end = overArt(look({ river, riverMask: 1 << side }), grid);
          expect(text(mouth), `${grid} ${side} ${river}`).toBe(text(end));
        }
        expect(blue(overArt(look({ terrain: 'ocean', mouthMask: (1 << side) | (16 << side) }), grid))).toBeGreaterThan(blue(overArt(look({ terrain: 'ocean', mouthMask: 1 << side }), grid)));
      }
      // a major bit with no mouth on that side draws nothing
      expect(blue(overArt(look({ terrain: 'ocean', mouthMask: 32 }), grid))).toBe(0);
      expect(inks(overArt(look({ terrain: 'ocean', mouthMask: 32 }), grid)).size).toBe(0);
    }
    expect(differ(miniTileArt(look({ terrain: 'ocean', mouthMask: 15 })), miniTileArt(look({ terrain: 'ocean' })))).toBe(false);
    expect(differ(miniTileArt(look({ terrain: 'mixed', joinMask: 15 })), miniTileArt(look({ terrain: 'mixed' })))).toBe(false);
  });

  it('a forest is told from its open row by what stands on it alone, on both grids and in every variant', () => {
    for (const grid of [32, 16] as const) {
      for (let variant = 0; variant < 4; variant++) {
        const overs = FORESTS.map((terrain) => overArt(look({ terrain, variant }), grid));
        // each forest's picture is its own, and covers a good part of the square its open row leaves bare
        expect(new Set(overs.map(text)).size, `${grid} ${variant}`).toBe(FORESTS.length);
        FORESTS.forEach((terrain, i) => {
          expect(inks(overArt(look({ terrain: openOf(terrain), variant }), grid)).size, terrain).toBe(0);
          expect([...(overs[i] as Sprite).cells].filter((c) => c !== 0).length, `${grid} ${terrain}`).toBeGreaterThanOrEqual(0.5 * grid * grid);
        });
      }
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

  it('shows rivers, roads, plowing, resources, rumors and totems as the plain art does, the river drawn for its own grid', () => {
    const plain = detailedTileArt(look());
    const changes: Partial<TileLook>[] = [{ river: 'minor', riverMask: 5 }, { river: 'major', riverMask: 5 }, { road: true, roadMask: 68 }, { plowed: true }, { resource: 'wheat' }, { rumor: true }, { totem: true }];
    const seen = new Set([text(plain)]);
    for (const change of changes) seen.add(text(detailedTileArt(look(change))));
    expect(seen.size).toBe(changes.length + 1);
    // a river is not the plain art's enlarged: a minor one crosses the side on three cells here and on two there
    const across = (s: Sprite): number => Array.from({ length: s.size }, (_, x) => at(s, x, 0)).filter((c) => c - 1 === INK.blue).length;
    expect(across(detailedTileArt(look({ river: 'minor', riverMask: 5 })))).toBe(3);
    expect(across(tileArt(look({ river: 'minor', riverMask: 5 })))).toBe(2);
  });
});

describe('rivers by their neighbours (R-1047)', () => {
  const GRIDS = [32, 16] as const satisfies readonly TileGrid[];
  const KINDS = ['minor', 'major'] as const;
  /** How wide the body is, and the first cell of a side it crosses on: by grid, a minor river then a major one. */
  const CROSSING = { 32: { minor: [3, 14], major: [5, 13] }, 16: { minor: [2, 7], major: [3, 6] } } as const;
  const MASKS = Array.from({ length: 16 }, (_, mask) => mask);
  const piece = (grid: TileGrid, river: 'minor' | 'major', riverMask: number, variant = 0): Sprite => overArt(look({ river, riverMask, variant }), grid);
  const cells = (s: Sprite, ink: number): string[] => [...s.cells].flatMap((c, i) => (c - 1 === ink ? [`${i % s.size},${Math.floor(i / s.size)}`] : []));
  /** The cells of a side, from its left or top end: north, east, south, west. */
  const edge = (s: Sprite, side: number): number[] =>
    Array.from({ length: s.size }, (_, i) => (side === 0 ? at(s, i, 0) : side === 1 ? at(s, s.size - 1, i) : side === 2 ? at(s, i, s.size - 1) : at(s, 0, i)) - 1);
  /** The middle of the body across the square: the middle cell for an odd width, the middle of the square for an even one. */
  const middle = (grid: number, wide: number): number => (wide % 2 ? grid / 2 - 1 : (grid - 1) / 2);
  const turnMask = (mask: number): number => ((mask << 1) | (mask >> 3)) & 15;

  it('crosses each side it runs on to on exactly the middle cells of its width, and no other side', () => {
    for (const grid of GRIDS) {
      for (const river of KINDS) {
        const [wide, from] = CROSSING[grid][river];
        for (const mask of MASKS) {
          for (const variant of [0, 1]) {
            const s = piece(grid, river, mask, variant);
            for (let side = 0; side < 4; side++) {
              const row = edge(s, side);
              const on = ((mask || 15) & (1 << side)) !== 0;
              const want = row.map((_, i) => (on && i >= from && i < from + wide ? INK.blue : -1));
              expect(row.map((c) => (c === INK.blue || c === INK.brightBlue ? c : -1)), `${grid} ${river} ${mask} ${variant} side ${side}`).toEqual(want);
            }
          }
        }
      }
    }
  });

  it('a river that runs on to no side is the cross, and a major river is wider than a minor one', () => {
    for (const grid of GRIDS) {
      for (const river of KINDS) expect(text(piece(grid, river, 0))).toBe(text(piece(grid, river, 15)));
      for (const mask of MASKS) expect(cells(piece(grid, 'major', mask), INK.blue).length, `${grid} ${mask}`).toBeGreaterThan(cells(piece(grid, 'minor', mask), INK.blue).length);
    }
  });

  it('the sixteen pieces are five shapes turned: a mask turned one side clockwise is its piece turned a quarter turn about the middle of the body', () => {
    for (const grid of GRIDS) {
      for (const river of KINDS) {
        const m = middle(grid, CROSSING[grid][river][0]);
        const inside = (n: number): boolean => n >= 0 && n < grid;
        for (const mask of MASKS.slice(1)) {
          // a quarter turn clockwise about (m, m) takes (x, y) to (2m - y, x); an odd body is centred on the
          // middle cell, so the last row and column have nowhere to turn to and are left out on both sides
          const turned = cells(piece(grid, river, mask), INK.blue)
            .map((c) => c.split(',').map(Number) as [number, number])
            .filter(([, y]) => inside(2 * m - y))
            .map(([x, y]) => `${2 * m - y},${x}`);
          const want = cells(piece(grid, river, turnMask(mask)), INK.blue).filter((c) => inside(2 * m - Number(c.split(',')[0])));
          expect(turned.sort(), `${grid} ${river} ${mask}`).toEqual(want.sort());
        }
      }
    }
  });

  it('the variant mirrors the winding: a piece whose sides are the same left and right is its other variant mirrored', () => {
    for (const grid of GRIDS) {
      for (const river of KINDS) {
        const m = middle(grid, CROSSING[grid][river][0]);
        const inside = (n: number): boolean => n >= 0 && n < grid;
        for (const mask of [1, 4, 5, 10, 15]) {
          const mirrored = cells(piece(grid, river, mask, 0), INK.blue)
            .map((c) => c.split(',').map(Number) as [number, number])
            .filter(([x]) => inside(2 * m - x))
            .map(([x, y]) => `${2 * m - x},${y}`);
          const want = cells(piece(grid, river, mask, 1), INK.blue).filter((c) => inside(2 * m - Number(c.split(',')[0])));
          expect(mirrored.sort(), `${grid} ${river} ${mask}`).toEqual(want.sort());
          // and it does wind: the two variants are not the same piece
          expect(text(piece(grid, river, mask, 0))).not.toBe(text(piece(grid, river, mask, 1)));
          // only the first bit of the variant counts
          expect(text(piece(grid, river, mask, 2))).toBe(text(piece(grid, river, mask, 0)));
        }
      }
    }
  });

  it('opposite arms make an S: a straight river leans one way above the middle and the other way below it', () => {
    for (const grid of GRIDS) {
      for (const river of KINDS) {
        const [wide, from] = CROSSING[grid][river];
        const s = piece(grid, river, 5);
        const columns = (rows: readonly number[]): number[] => rows.flatMap((y) => Array.from({ length: grid }, (_, x) => x).filter((x) => at(s, x, y) - 1 === INK.blue));
        const upper = columns(Array.from({ length: grid / 2 - 2 }, (_, y) => y));
        const lower = columns(Array.from({ length: grid / 2 - 2 }, (_, y) => grid - 1 - y));
        // the arm from the north leans west and never east of the crossing; the arm from the south the other way
        expect(Math.min(...upper), `${grid} ${river}`).toBeLessThan(from);
        expect(Math.max(...upper), `${grid} ${river}`).toBe(from + wide - 1);
        expect(Math.max(...lower), `${grid} ${river}`).toBeGreaterThan(from + wide - 1);
        expect(Math.min(...lower), `${grid} ${river}`).toBe(from);
      }
    }
  });

  it('has a broken pale rim along both banks: beside the body, never on it, no two rim cells touching', () => {
    for (const grid of GRIDS) {
      for (const river of KINDS) {
        for (const mask of MASKS) {
          const s = piece(grid, river, mask);
          expect(inks(s)).toEqual(new Set([INK.blue, INK.brightBlue]));
          for (let y = 0; y < grid; y++) {
            for (let x = 0; x < grid; x++) {
              if (at(s, x, y) - 1 !== INK.brightBlue) continue;
              const beside = [at(s, x, y - 1), at(s, x + 1, y), at(s, x, y + 1), at(s, x - 1, y)].map((c) => c - 1);
              expect(beside, `${grid} ${river} ${mask} (${x}, ${y})`).toContain(INK.blue);
              expect(beside, `${grid} ${river} ${mask} (${x}, ${y})`).not.toContain(INK.brightBlue);
            }
          }
        }
        // on a straight piece at least a third of the cells beside the body on each bank are rim (the two
        // outermost rows aside, which take no rim so that the side holds the body alone)
        for (const mask of [5, 10]) {
          const s = piece(grid, river, mask);
          const along = (x: number, y: number): readonly [number, number] => (mask === 5 ? [x, y] : [y, x]);
          for (const bank of [-1, 1]) {
            let beside = 0;
            let pale = 0;
            for (let y = 1; y < grid - 1; y++) {
              const body = Array.from({ length: grid }, (_, x) => x).filter((x) => at(s, ...along(x, y)) - 1 === INK.blue);
              const x = bank < 0 ? Math.min(...body) - 1 : Math.max(...body) + 1;
              beside++;
              if (at(s, ...along(x, y)) - 1 === INK.brightBlue) pale++;
            }
            expect(beside).toBe(grid - 2);
            expect(pale * 3, `${grid} ${river} ${mask} bank ${bank}`).toBeGreaterThanOrEqual(beside);
          }
        }
      }
    }
  });

  it('an end has a pool in the middle of the square, and nothing on the sides it does not run on to', () => {
    for (const grid of GRIDS) {
      // the middle ten cells each way
      const within = (s: Sprite): number => cells(s, INK.blue).filter((c) => c.split(',').every((n) => Number(n) >= grid / 2 - 5 && Number(n) < grid / 2 + 5)).length;
      /** How many cells of body lie across the middle of the square, measured across an arm that runs up or sideways. */
      const across = (s: Sprite, upright: boolean): number => Array.from({ length: grid }, (_, i) => (upright ? at(s, i, grid / 2 - 1) : at(s, grid / 2 - 1, i))).filter((c) => c - 1 === INK.blue).length;
      for (const river of KINDS) {
        const wide = CROSSING[grid][river][0];
        for (const mask of [1, 2, 4, 8]) {
          const s = piece(grid, river, mask);
          // the pool holds more water than a river running straight through: counted on the 32 grid, where the
          // middle ten cells are a third of the square, and measured across the middle on both
          if (grid === 32) for (const straight of [5, 10]) expect(within(s), `${grid} ${river} ${mask}`).toBeGreaterThan(within(piece(grid, river, straight)));
          const upright = mask === 1 || mask === 4;
          expect(across(s, upright), `${grid} ${river} ${mask}`).toBe(wide + (grid === 32 ? 4 : 2));
          expect(across(piece(grid, river, upright ? 5 : 10), upright), `${grid} ${river} ${mask}`).toBeLessThan(across(s, upright));
          for (let side = 0; side < 4; side++) if (!(mask & (1 << side))) expect(edge(s, side).filter((c) => c === INK.blue || c === INK.brightBlue)).toEqual([]);
        }
      }
    }
  });

  it('at the smallest zoom is a line of single cells from the middle cell to the middle of each side it runs on to', () => {
    const ENDS = [[3, 0], [7, 3], [3, 7], [0, 3]] as const;
    for (const river of KINDS) {
      for (const mask of MASKS) {
        const want = new Set<string>();
        ENDS.forEach(([ex, ey], side) => {
          if (!((mask || 15) & (1 << side))) return;
          for (let x = Math.min(3, ex); x <= Math.max(3, ex); x++) for (let y = Math.min(3, ey); y <= Math.max(3, ey); y++) want.add(`${x},${y}`);
        });
        const s = miniTileArt(look({ river, riverMask: mask }));
        expect(cells(s, INK.blue).sort(), `${river} ${mask}`).toEqual([...want].sort());
        expect(cells(s, INK.brightBlue)).toEqual([]);
      }
    }
    expect(text(miniTileArt(look({ river: 'minor', riverMask: 0 })))).toBe(text(miniTileArt(look({ river: 'minor', riverMask: 15 }))));
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
