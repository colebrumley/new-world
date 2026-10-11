// The map renderer checked without a browser: render() run against a plain pixel buffer
// (test/helpers/reference-canvas.ts). The e2e suite requires the browser's canvas to match this
// same reference pixel for pixel, so what is pinned here holds on every platform.
import { describe, expect, it } from 'vitest';
import type { GameState, Settlement } from '../../../src/engine/state';
import { chartMarks } from '../../../src/ui/chart';
import { ART_COLORS, at, COAST_MASKS, EDGE_MASKS, floorArt, INK, overArt, PALETTE, rotate, type Sprite, type TileGrid } from '../../../src/ui/pixel-art';
import { landBeside, renderGround } from '../../../src/ui/render';
import { lookOf, tileSprite, type TileCache } from '../../../src/ui/tiles';
import { makeView, type View } from '../../../src/ui/view';
import { fingerprint, referencePixels } from '../../helpers/reference-canvas';
import { setTile, withColony, withUnit, world } from '../../helpers/world';

const ROWS = ['~~~~~~~~~~', '~..fh.mR.~', '~..=.g.w.~', '~........~', '~~~~~~~~~~'];
function scene(): GameState {
  let s = world({ rows: ROWS, players: [{ id: 'a' }, { id: 'b', kind: 'ai', nation: 'france' }] });
  s = withColony(s, { id: 'col', x: 2, y: 2, name: 'C' });
  s = withUnit(s, { id: 'u', type: 'soldier', x: 4, y: 3 });
  s = withUnit(s, { id: 'ship', owner: 'b', type: 'frigate', profession: null, x: 0, y: 2 });
  s = setTile(s, 6, 3, { rumor: true });
  const village: Settlement = { id: 'v', tribe: 'sioux', x: 7, y: 3, capital: true, population: 3, growth: 0, taught: false, tributePaid: false, alarm: { a: 0 }, mission: null, scouted: [], lastBought: null, lastSold: null, haggleMemory: null };
  return { ...s, settlements: { v: village } };
}
const shot = (state: GameState, width: number, height: number, zoom: number, extras = {}): ReturnType<typeof referencePixels> =>
  referencePixels(state, makeView(state.map, width, height, 4, 2, { zoom }), { activeUnitId: 'u', cursor: null, ...extras });
const colours = (rgb: Uint8Array): Set<string> => {
  const seen = new Set<string>();
  for (let i = 0; i < rgb.length; i += 3) seen.add(`#${[rgb[i], rgb[i + 1], rgb[i + 2]].map((n) => (n as number).toString(16).padStart(2, '0')).join('')}`);
  return seen;
};

describe('the map renderer, against a plain pixel buffer', () => {
  it('draws only palette colours, on the pixel grid, at every zoom', () => {
    // the reference refuses a colour outside the palette, art off the grid, or smoothing: none of those happens
    for (const zoom of [3, 2, 1, 0]) {
      const made = shot(scene(), 960, 768, zoom);
      for (const c of colours(made.rgb)) expect(ART_COLORS, `zoom ${zoom}`).toContain(c);
      expect(colours(made.rgb).size, `zoom ${zoom}`).toBeGreaterThanOrEqual(zoom === 0 ? 6 : 10);
    }
  });

  it('is the same every time, and changes when what it shows changes', () => {
    const base = fingerprint(shot(scene(), 960, 768, 3).rgb);
    expect(fingerprint(shot(scene(), 960, 768, 3).rgb)).toBe(base);
    const moved = { ...scene(), units: { ...scene().units, u: { ...scene().units['u']!, x: 5 } } };
    expect(fingerprint(shot(moved, 960, 768, 3).rgb)).not.toBe(base);
    expect(fingerprint(shot(scene(), 960, 768, 3, { blinkOn: false }).rgb)).not.toBe(base); // the active frame
    expect(fingerprint(shot(scene(), 960, 768, 3, { waterPhase: 1 }).rgb)).not.toBe(base); // the sea
    expect(fingerprint(shot(scene(), 960, 768, 3, { cursor: { x: 3, y: 3 } }).rgb)).not.toBe(base);
    expect(fingerprint(shot(scene(), 960, 768, 3, { slide: { unitId: 'u', dx: -0.5, dy: 0 } }).rgb)).not.toBe(base);
    // a piece being dragged is drawn once more under the pointer
    expect(fingerprint(shot(scene(), 960, 768, 3, { dragged: { unitId: 'u', x: 101, y: 203 } }).rgb)).not.toBe(base);
  });

  it('marks a square the dragged unit cannot go to in red', () => {
    const count = (rgb: Uint8Array, ink: number): number => {
      const hex = PALETTE[ink] as string;
      let n = 0;
      for (let i = 0; i < rgb.length; i += 3) if (`#${[rgb[i], rgb[i + 1], rgb[i + 2]].map((v) => (v as number).toString(16).padStart(2, '0')).join('')}` === hex) n++;
      return n;
    };
    const plain = shot(scene(), 960, 768, 3).rgb;
    const yellow = shot(scene(), 960, 768, 3, { cursor: { x: 5, y: 1 } }).rgb;
    const blocked = shot(scene(), 960, 768, 3, { cursor: { x: 5, y: 1, blocked: true } }).rgb;
    // the frame that is yellow on its own is red when blocked, pixel for pixel
    const frame = count(yellow, INK.yellow) - count(plain, INK.yellow);
    expect(frame).toBeGreaterThan(0);
    expect(count(blocked, INK.red) - count(plain, INK.red)).toBe(frame);
    expect(count(blocked, INK.yellow)).toBe(count(plain, INK.yellow));
    expect(fingerprint(blocked)).not.toBe(fingerprint(yellow));
  });

  // --- the explorer's chart (R-1011): a 48 x 48 world of which only a patch round (20, 20) is known ---
  const hex = (ink: number): string => PALETTE[ink] as string;
  const CHART_INKS = [INK.parchment, INK.sand, INK.hill, INK.earth, INK.wood, INK.ink].map(hex);
  const chart = (known: (x: number, y: number) => boolean, seed: number | string = 7): GameState => {
    const s = world({ rows: Array.from({ length: 48 }, () => '.'.repeat(48)), seed, players: [{ id: 'a' }] });
    return { ...s, map: { ...s.map, tiles: s.map.tiles.map((tile, i) => (known(i % 48, Math.floor(i / 48)) ? tile : { ...tile, explored: 0 })) } };
  };
  const patch = (x: number, y: number): boolean => Math.abs(x - 20) <= 1 && Math.abs(y - 20) <= 1;
  /** The colours of one square of the map as drawn, counted. */
  const square = (state: GameState, x: number, y: number, zoom: number, options = {}): Map<string, number> => {
    const view = makeView(state.map, 960, 768, 20, 20, { zoom, ...options });
    const made = referencePixels(state, view, { activeUnitId: null, cursor: null });
    const seen = new Map<string, number>();
    const t = view.tileSize;
    for (let py = Math.round((y - view.originY) * t); py < Math.round((y - view.originY) * t) + t; py++) {
      for (let px = Math.round((x - view.originX) * t); px < Math.round((x - view.originX) * t) + t; px++) {
        const i = (py * made.width + px) * 3;
        const colour = `#${[made.rgb[i], made.rgb[i + 1], made.rgb[i + 2]].map((n) => (n as number).toString(16).padStart(2, '0')).join('')}`;
        seen.set(colour, (seen.get(colour) ?? 0) + 1);
      }
    }
    return seen;
  };
  /** A square no mark of the chart covers or touches. */
  const open = (state: GameState, x: number, y: number): boolean =>
    chartMarks(state.seed, 48, 48).every((m) => x < m.x - 1 || x > m.x + m.size || y < m.y - 1 || y > m.y + m.size);

  it('draws unexplored squares as vellum, at every zoom, and leaves what is beyond the map the page\'s dark', () => {
    const state = chart(patch);
    expect(open(state, 24, 20)).toBe(true);
    for (const zoom of [3, 2, 1, 0]) {
      const seen = square(state, 24, 20, zoom);
      for (const colour of seen.keys()) expect([hex(INK.parchment), hex(INK.sand), hex(INK.hill)], `zoom ${zoom}`).toContain(colour);
      const all = [...seen.values()].reduce((a, b) => a + b, 0);
      expect(seen.get(hex(INK.parchment)) ?? 0, `zoom ${zoom}`).toBeGreaterThan(all * 0.9);
      // the known square beside the patch's middle is ground, not vellum
      expect(square(state, 20, 20, zoom).has(hex(INK.parchment)), `zoom ${zoom}`).toBe(false);
    }
    // the small scene's map is narrower than the window: its margins are untouched
    const dark = world({ rows: ROWS, players: [{ id: 'a' }] });
    const made = shot({ ...dark, map: { ...dark.map, tiles: dark.map.tiles.map((tile) => ({ ...tile, explored: 0 })) } }, 960, 768, 3);
    const seen = colours(made.rgb);
    expect(seen).toContain(hex(INK.void));
    expect([...made.rgb.slice(0, 3)]).toEqual([0x0b, 0x0d, 0x12]);
    for (const colour of seen) expect([hex(INK.void), ...CHART_INKS]).toContain(colour);
  });

  it('hatches the vellum where it meets the known, on the vellum side only', () => {
    const state = chart(patch);
    for (const zoom of [3, 2, 1]) {
      // east of the patch, and at its corner: coastline ink; one square further out: none
      expect(square(state, 22, 20, zoom).has(hex(INK.wood)), `zoom ${zoom}`).toBe(true);
      expect(square(state, 22, 20, zoom).has(hex(INK.earth)), `zoom ${zoom}`).toBe(true);
      expect(square(state, 22, 22, zoom).has(hex(INK.wood)), `zoom ${zoom}`).toBe(true);
      expect(square(state, 23, 20, zoom).has(hex(INK.wood)), `zoom ${zoom}`).toBe(false);
      // the known side is the terrain as it always was
      expect(square(state, 21, 20, zoom)).toEqual(square(chart(() => true), 21, 20, zoom));
    }
    expect(square(state, 22, 20, 0).get(hex(INK.hill))).toBe(8);
    // the edge of the map is not a coast
    const corner = chart((x, y) => x > 40 && y > 40);
    expect(open(corner, 0, 30)).toBe(true);
    expect(square(corner, 0, 30, 1).has(hex(INK.wood))).toBe(false);
  });

  it('draws the compass rose and the chart\'s creatures on open vellum, and takes one away whole once any of its squares is known', () => {
    const blankChart = chart(() => false);
    const marks = chartMarks(7, 48, 48);
    expect(marks.filter((m) => m.kind === 'rose')).toHaveLength(4);
    // every mark is outlined in black ink, which the vellum and its hatching never use
    const inked = (state: GameState, x: number, y: number): boolean => square(state, x, y, 1).has(hex(INK.ink));
    for (const kind of ['rose', 'serpent', 'ship'] as const) {
      const mark = marks.find((m) => m.kind === kind)!;
      const middle = { x: mark.x + Math.floor(mark.size / 2), y: mark.y + Math.floor(mark.size / 2) };
      expect(inked(blankChart, middle.x, middle.y), kind).toBe(true);
      // one corner square of it explored: nothing of it is left on the others
      const found = chart((x, y) => x === mark.x && y === mark.y);
      for (let y = mark.y; y < mark.y + mark.size; y++) for (let x = mark.x; x < mark.x + mark.size; x++) expect(inked(found, x, y), kind).toBe(false);
    }
    // seen whole, the map has no chart at all
    const view = makeView(blankChart.map, 960, 768, 20, 20, { zoom: 1, revealAll: true });
    const revealed = colours(referencePixels(blankChart, view, { activeUnitId: null, cursor: null }).rgb);
    expect(revealed.has(hex(INK.parchment))).toBe(false);
    // and another seed lays the chart out another way
    const shotOf = (state: GameState): string => fingerprint(referencePixels(state, makeView(state.map, 960, 768, 20, 20, { zoom: 1 }), { activeUnitId: null, cursor: null }).rgb);
    expect(shotOf(chart(() => false, 8))).not.toBe(shotOf(blankChart));
    expect(shotOf(chart(() => false))).toBe(shotOf(blankChart));
  });

  // --- colony names (R-1045) ---
  const named = (name: string): GameState => {
    const s = scene();
    return { ...s, colonies: { col: { ...s.colonies['col']!, name } } };
  };
  /** The pixels that differ between two renders, as [x, y, colour in the first]. */
  const changed = (a: ReturnType<typeof referencePixels>, b: ReturnType<typeof referencePixels>): [number, number, string][] => {
    const out: [number, number, string][] = [];
    for (let i = 0; i < a.rgb.length; i += 3) {
      if (a.rgb[i] === b.rgb[i] && a.rgb[i + 1] === b.rgb[i + 1] && a.rgb[i + 2] === b.rgb[i + 2]) continue;
      out.push([(i / 3) % a.width, Math.floor(i / 3 / a.width), `#${[a.rgb[i], a.rgb[i + 1], a.rgb[i + 2]].map((n) => (n as number).toString(16).padStart(2, '0')).join('')}`]);
    }
    return out;
  };

  it('writes a colony\'s name under its square in white edged with ink, at the two nearest zooms only', () => {
    for (const zoom of [3, 2]) {
      const view = makeView(scene().map, 960, 768, 4, 2, { zoom });
      const t = view.tileSize;
      const fine = t / 32;
      const left = Math.round((2 - view.originX) * t);
      const top = Math.round((3 - view.originY) * t);
      const cells = changed(shot(named('Jamestown'), 960, 768, zoom), shot(named(''), 960, 768, zoom));
      expect(cells.length, `zoom ${zoom}`).toBeGreaterThan(0);
      // all of it lies in the row of squares below the colony, from a little in from its left edge, and is white or ink
      for (const [x, y, colour] of cells) {
        expect(y >= top && y < top + 10 * fine, `zoom ${zoom}`).toBe(true);
        expect(x >= left + 4 * fine && x < left + (4 + 8 * 7 + 10) * fine, `zoom ${zoom}`).toBe(true);
        expect([hex(INK.white), hex(INK.ink)], `zoom ${zoom}`).toContain(colour);
      }
      const white = cells.filter(([, , colour]) => colour === hex(INK.white));
      const first = (Math.min(...white.map(([x]) => x)) - left) / fine;
      expect(first, `zoom ${zoom}`).toBeGreaterThanOrEqual(4);
      expect(first, `zoom ${zoom}`).toBeLessThanOrEqual(6);
      // the glyph's seven rows start one art pixel below the square's bottom edge
      expect((Math.min(...white.map(([, y]) => y)) - top) / fine, `zoom ${zoom}`).toBe(1);
      expect((Math.max(...white.map(([, y]) => y)) + 1 - top) / fine, `zoom ${zoom}`).toBe(8);
    }
    for (const zoom of [1, 0]) expect(changed(shot(named('Jamestown'), 960, 768, zoom), shot(named(''), 960, 768, zoom)), `zoom ${zoom}`).toEqual([]);
    // an accented name is written in plain capitals
    expect(fingerprint(shot(named('Québec'), 960, 768, 2).rgb)).toBe(fingerprint(shot(named('QUEBEC'), 960, 768, 2).rgb));
    expect(fingerprint(shot(named('Québec'), 960, 768, 2).rgb)).not.toBe(fingerprint(shot(named('QUEBEK'), 960, 768, 2).rgb));
    // hidden-terrain view draws no pieces and no names
    const hidden = (name: string): string => fingerprint(referencePixels(named(name), makeView(scene().map, 960, 768, 4, 2, { zoom: 2, showHidden: true }), { activeUnitId: null, cursor: null }).rgb);
    expect(hidden('Jamestown')).toBe(hidden(''));
  });

  it('clips a name at the canvas edge without moving it, and shows the name of a colony just outside the view', () => {
    const land = (name: string, x: number, y: number): GameState => withColony(world({ rows: Array.from({ length: 6 }, () => '.'.repeat(8)), players: [{ id: 'a' }] }), { id: 'col', x, y, name });
    const window = (width: number, height: number, originX: number, originY: number) => ({ width, height, zoom: 2, tileSize: 32, originX, originY, showHidden: false, revealAll: false });
    const draw = (state: GameState, width: number, originX = 0, originY = 0): ReturnType<typeof referencePixels> => referencePixels(state, window(width, 96, originX, originY), { activeUnitId: null, cursor: null });
    // a canvas a square and a half wide shows the start of the name exactly where a wide one does
    const narrow = draw(land('Jamestown', 0, 0), 48);
    const wide = draw(land('Jamestown', 0, 0), 256);
    for (let y = 0; y < 96; y++) expect([...narrow.rgb.slice(y * 48 * 3, (y + 1) * 48 * 3)], `row ${y}`).toEqual([...wide.rgb.slice(y * 256 * 3, (y * 256 + 48) * 3)]);
    expect(changed(narrow, draw(land('', 0, 0), 48)).length).toBeGreaterThan(0);
    expect(changed(wide, draw(land('', 0, 0), 256)).some(([x]) => x >= 48)).toBe(true);
    // a colony on the row just above the view hangs its name in the top row
    const above = changed(draw(land('Jamestown', 2, 0), 256, 0, 1), draw(land('', 2, 0), 256, 0, 1));
    expect(above.length).toBeGreaterThan(0);
    for (const [x, y] of above) expect(y < 10 && x >= 64 + 4).toBe(true);
    // one two rows above does not, and one left of the view still runs its name into it
    expect(changed(draw(land('Jamestown', 2, 0), 256, 0, 2), draw(land('', 2, 0), 256, 0, 2))).toEqual([]);
    const beside = changed(draw(land('A Very Long Name Here', 0, 0), 256, 3, 0), draw(land('', 0, 0), 256, 3, 0));
    expect(beside.length).toBeGreaterThan(0);
    for (const [x] of beside) expect(x).toBeLessThan(4 + 16 * 7 + 3 - 96);
  });

  // --- blended edges and coasts (R-1041): each square drawn one art pixel to the canvas pixel, so a cell is a pixel ---
  const GRIDS = [32, 16] as const satisfies readonly TileGrid[];
  const land = (rows: readonly string[]): GameState => world({ rows, players: [{ id: 'a' }] });
  const window = (state: GameState, grid: number, options: Partial<View> = {}): View =>
    ({ width: state.map.width * grid, height: state.map.height * grid, zoom: 0, tileSize: grid, originX: 0, originY: 0, showHidden: false, revealAll: false, ...options });
  const drawn = (state: GameState, grid: number, waterPhase = 0): ReturnType<typeof referencePixels> => referencePixels(state, window(state, grid), { activeUnitId: null, cursor: null, waterPhase });
  /** The colour of one cell of the square at (x, y) as drawn. */
  const cell = (made: ReturnType<typeof referencePixels>, grid: number, x: number, y: number, cx: number, cy: number): string => {
    const i = ((y * grid + cy) * made.width + x * grid + cx) * 3;
    return `#${[made.rgb[i], made.rgb[i + 1], made.rgb[i + 2]].map((n) => (n as number).toString(16).padStart(2, '0')).join('')}`;
  };
  /** The colour of one cell of a sprite. */
  const ink = (sprite: Sprite, cx: number, cy: number): string => ART_COLORS[at(sprite, cx, cy) - 1] as string;
  const variantAt = (x: number, y: number): number => (x * 7 + y * 13) % 4;
  /** The square at (x, y) as it stands alone: floor and all, nothing of its neighbours. */
  const composite = (state: GameState, grid: number, x: number, y: number): Sprite => tileSprite(lookOf(state.map.tiles[y * state.map.width + x]!, 0, 0, variantAt(x, y), false), grid);
  /** What each cell of that square is when it stands alone. */
  const alone = (state: GameState, grid: number, x: number, y: number): ((cx: number, cy: number) => string) => {
    const sprite = composite(state, grid, x, y);
    return (cx, cy) => ink(sprite, cx, cy);
  };
  /** Every cell of the square, with what it is expected to be. Returns the cells that are not. */
  const wrong = (made: ReturnType<typeof referencePixels>, grid: number, x: number, y: number, expected: (cx: number, cy: number) => string): string[] => {
    const out: string[] = [];
    for (let cy = 0; cy < grid; cy++) for (let cx = 0; cx < grid; cx++) if (cell(made, grid, x, y, cx, cy) !== expected(cx, cy)) out.push(`${cx},${cy}`);
    return out;
  };
  const stencil = (grid: TileGrid, side: number, cx: number, cy: number): boolean => ((EDGE_MASKS[grid][side] as readonly string[])[cy] as string)[cx] === '#';

  it('spills each differing neighbour\'s floor a little way in through that side\'s stencil, forests as their open ground', () => {
    const state = land(['~~~~', '~.g~', '~ff~', '~~~~']);
    for (const grid of GRIDS) {
      const made = drawn(state, grid);
      const own = (x: number, y: number): ((cx: number, cy: number) => string) => alone(state, grid, x, y);
      // the plains square: grassland inside the east stencil, itself everywhere else
      const grass = floorArt(grid, 'grassland', variantAt(2, 1));
      const [plainsAlone, grassAlone, woodAlone] = [own(1, 1), own(2, 1), own(2, 2)];
      expect(wrong(made, grid, 1, 1, (cx, cy) => (stencil(grid, 1, cx, cy) ? ink(grass, cx, cy) : plainsAlone(cx, cy))), `plains ${grid}`).toEqual([]);
      // the grassland square: the plains square's floor inside the west stencil, the forest's open ground (plains) inside the south one
      const plains = floorArt(grid, 'plains', variantAt(1, 1));
      const wood = floorArt(grid, 'plains', variantAt(2, 2));
      expect(wrong(made, grid, 2, 1, (cx, cy) => (stencil(grid, 3, cx, cy) ? ink(plains, cx, cy) : stencil(grid, 2, cx, cy) ? ink(wood, cx, cy) : grassAlone(cx, cy))), `grassland ${grid}`).toEqual([]);
      // the mixed forest beside the plains square is plains to it: nothing spills, either way
      expect(wrong(made, grid, 1, 2, own(1, 2)), `forest ${grid}`).toEqual([]);
      // the forest under the grassland takes grassland through its north stencil, under its trees, and nothing else
      const trees = overArt(lookOf(state.map.tiles[2 * 4 + 2]!, 0, 0, variantAt(2, 2), false), grid);
      expect(wrong(made, grid, 2, 2, (cx, cy) => (stencil(grid, 0, cx, cy) && at(trees, cx, cy) === 0 ? ink(grass, cx, cy) : woodAlone(cx, cy))), `forest under grassland ${grid}`).toEqual([]);
      // the land does not move with the water
      const later = drawn(state, grid, 1);
      for (const [x, y] of [[1, 1], [2, 1], [1, 2], [2, 2]] as const) expect(wrong(later, grid, x, y, (cx, cy) => cell(made, grid, x, y, cx, cy))).toEqual([]);
      expect(wrong(later, grid, 0, 0, (cx, cy) => cell(made, grid, 0, 0, cx, cy)).length).toBeGreaterThan(0);
    }
    // a square whose four orthogonal neighbours are its own open terrain is itself alone, whatever lies at its corners
    const same = land(['g.g', '.f.', 'g.g']);
    for (const grid of GRIDS) expect(wrong(drawn(same, grid), grid, 1, 1, alone(same, grid, 1, 1)), `${grid}`).toEqual([]);
  });

  it('never spills water onto land: a land square\'s water side shows the land that water is painted as', () => {
    // the water between is painted as the plains to its west, so the grassland takes plains through its west side
    const state = land(['.~g']);
    for (const grid of GRIDS) {
      const made = drawn(state, grid);
      expect(wrong(made, grid, 0, 0, alone(state, grid, 0, 0)), `plains ${grid}`).toEqual([]);
      const plains = floorArt(grid, 'plains', variantAt(1, 0));
      const grassAlone = alone(state, grid, 2, 0);
      expect(wrong(made, grid, 2, 0, (cx, cy) => (stencil(grid, 3, cx, cy) ? ink(plains, cx, cy) : grassAlone(cx, cy))), `grassland ${grid}`).toEqual([]);
    }
    expect(landBeside(state.map, 1, 0)).toBe('plains');
    expect(landBeside(state.map, 1, 0, (x) => x !== 0)).toBe('grassland');
    expect(landBeside(state.map, 0, 0)).toBe(null);
    // west, then south, then east, then north; a forest counts as its open ground
    const ring = land(['.g.', 'w~f', '.a.']);
    expect(landBeside(ring.map, 1, 1)).toBe('swamp');
    expect(landBeside(ring.map, 1, 1, (x) => x !== 0)).toBe('arctic');
    expect(landBeside(ring.map, 1, 1, (x, y) => x !== 0 && y !== 2)).toBe('plains');
    expect(landBeside(ring.map, 1, 1, (x, y) => x === 1 && y === 0)).toBe('grassland');
  });

  it('carries the coast on the water square: the land beside it under its edge, a line of shallows, then the water', () => {
    const island = land(['~~~', '~.~', '~~~']);
    const hex = (i: number): string => PALETTE[i] as string;
    for (const grid of GRIDS) {
      const half = grid / 2;
      const made = drawn(island, grid);
      const plains = floorArt(grid, 'plains', variantAt(1, 0));
      const water = composite(island, grid, 1, 0);
      // north of the island: every column is plains from the bottom up, then shallows, then the sea, and the top half is the sea alone
      for (let cx = 0; cx < grid; cx++) {
        let cy = grid - 1;
        while (cell(made, grid, 1, 0, cx, cy) === ink(plains, cx, cy) && cy >= half) cy--;
        const depth = grid - 1 - cy;
        expect(depth, `${grid} column ${cx}`).toBeGreaterThanOrEqual(2);
        expect(depth, `${grid} column ${cx}`).toBeLessThanOrEqual(grid / 16 * 3);
        let shallows = 0;
        while (cell(made, grid, 1, 0, cx, cy) === hex(INK.wave) && cy >= half) {
          shallows++;
          cy--;
        }
        expect(shallows, `${grid} column ${cx}`).toBeGreaterThanOrEqual(grid / 16);
        expect(shallows, `${grid} column ${cx}`).toBeLessThanOrEqual(grid / 16 + 2);
        for (; cy >= 0; cy--) expect(cell(made, grid, 1, 0, cx, cy), `${grid} ${cx},${cy}`).toBe(ink(water, cx, cy));
      }
      // north-west of it: a small corner of plains at the south-east, shallows beside it, the sea everywhere else
      const corner = composite(island, grid, 0, 0);
      const floor = floorArt(grid, 'plains', variantAt(0, 0));
      const shape = rotate(rotate(COAST_MASKS[grid][2] as readonly string[]));
      const differs = wrong(made, grid, 0, 0, (cx, cy) => ink(corner, cx, cy));
      expect(differs.length).toBeGreaterThan(0);
      for (const where of differs) {
        const [cx, cy] = where.split(',').map(Number) as [number, number];
        expect(cx >= half && cy >= half, `${grid} ${where}`).toBe(true);
        expect(cell(made, grid, 0, 0, cx, cy), `${grid} ${where}`).toBe((shape[cy - half] as string)[cx - half] === '.' ? ink(floor, cx, cy) : hex(INK.wave));
      }
      expect(cell(made, grid, 0, 0, grid - 1, grid - 1)).toBe(ink(floor, grid - 1, grid - 1));
      expect(differs.some((where) => cell(made, grid, 0, 0, ...(where.split(',').map(Number) as [number, number])) === hex(INK.wave))).toBe(true);
      // the land square carries none of it
      expect(wrong(made, grid, 1, 1, alone(island, grid, 1, 1)), `${grid}`).toEqual([]);
      // and water with no land about is water alone
      const sea = land(['~~~~', '~~~.']);
      expect(wrong(drawn(sea, grid), grid, 0, 0, alone(sea, grid, 0, 0)), `${grid}`).toEqual([]);
      expect(wrong(drawn(sea, grid), grid, 2, 0, alone(sea, grid, 2, 0)).length).toBeGreaterThan(0);
    }
  });

  it('draws an open bay where land lies to the north, the west and between: land along both sides, water in the middle', () => {
    const bay = land(['...', '.~.', '...']);
    for (const grid of GRIDS) {
      const half = grid / 2;
      const made = drawn(bay, grid);
      const floor = floorArt(grid, 'plains', variantAt(1, 1));
      const water = composite(bay, grid, 1, 1);
      const shape = COAST_MASKS[grid][7] as readonly string[];
      for (let i = 0; i < grid; i++) {
        expect(cell(made, grid, 1, 1, i, 0), `north ${i}`).toBe(ink(floor, i, 0));
        expect(cell(made, grid, 1, 1, 0, i), `west ${i}`).toBe(ink(floor, 0, i));
        expect(cell(made, grid, 1, 1, i, grid - 1), `south ${i}`).toBe(ink(floor, i, grid - 1));
        expect(cell(made, grid, 1, 1, grid - 1, i), `east ${i}`).toBe(ink(floor, grid - 1, i));
      }
      // the north-west quarter is the shape for all three: plains where it is land, and the middle of the square is the sea
      for (let cy = 0; cy < half; cy++) for (let cx = 0; cx < half; cx++) if ((shape[cy] as string)[cx] === '.') expect(cell(made, grid, 1, 1, cx, cy), `${cx},${cy}`).toBe(ink(floor, cx, cy));
      for (let cy = half - 2; cy < half + 2; cy++) for (let cx = half - 2; cx < half + 2; cx++) expect(cell(made, grid, 1, 1, cx, cy)).toBe(ink(water, cx, cy));
    }
  });

  it('shows nothing of a neighbour the viewer has not seen: no blend from it, and no coast toward it', () => {
    const hide = (state: GameState, x: number, y: number): GameState => setTile(state, x, y, { explored: 0 });
    for (const grid of GRIDS) {
      const edge = hide(land(['.g', '..']), 1, 0);
      expect(wrong(drawn(edge, grid), grid, 0, 0, alone(edge, grid, 0, 0)), `land ${grid}`).toEqual([]);
      expect(wrong(drawn(land(['.g', '..']), grid), grid, 0, 0, alone(edge, grid, 0, 0)).length).toBeGreaterThan(0);
      const shore = hide(land(['~.', '~~']), 1, 0);
      expect(wrong(drawn(shore, grid), grid, 0, 0, alone(shore, grid, 0, 0)), `water ${grid}`).toEqual([]);
      // nor is unseen land read through the water beside it
      const beyond = hide(land(['.~g']), 0, 0);
      expect(wrong(drawn(beyond, grid), grid, 2, 0, alone(beyond, grid, 2, 0)), `through water ${grid}`).toEqual([]);
    }
  });

  it('draws a land square in two pieces and a coastal water square in six; the smallest zoom draws one', () => {
    const island = land(['~~~', '~.~', '~~~']);
    const count = (state: GameState, grid: number): number[] => {
      const calls = new Array<number>(state.map.width * state.map.height).fill(0);
      const ctx = {
        fillStyle: '',
        imageSmoothingEnabled: true,
        fillRect: (): void => {},
        drawImage: (_art: unknown, x: number, y: number): void => {
          calls[(y / grid) * state.map.width + x / grid]!++;
        },
      };
      const cache = { get: () => ({}), sprite: () => ({}), size: 0 };
      renderGround(ctx as unknown as CanvasRenderingContext2D, state, window(state, grid), cache as unknown as TileCache);
      return calls;
    };
    expect(count(island, 32)).toEqual([6, 6, 6, 6, 2, 6, 6, 6, 6]);
    expect(count(island, 16)).toEqual([6, 6, 6, 6, 2, 6, 6, 6, 6]);
    expect(count(island, 8)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1]);
    // open sea is two (floor and over); a land square adds one for each side that differs
    expect(count(land(['~~~~', '~~~.']), 32).slice(0, 2)).toEqual([2, 2]);
    expect(count(land(['~~~~', '~.g~', '~ff~', '~~~~']), 32).filter((_, i) => [5, 6, 9, 10].includes(i))).toEqual([3, 4, 2, 3]);
  });

  it('matches the baseline at each zoom', () => {
    expect(Object.fromEntries([3, 2, 1, 0].map((zoom) => [`zoom${zoom}`, fingerprint(shot(scene(), 960, 768, zoom).rgb)]))).toMatchSnapshot();
  });

  it('matches the chart\'s baseline at each zoom: a known patch on the vellum', () => {
    const state = chart((x, y) => Math.abs(x - 20) <= 2 && Math.abs(y - 20) <= 1);
    const at = (zoom: number): string => fingerprint(referencePixels(state, makeView(state.map, 960, 768, 20, 20, { zoom }), { activeUnitId: null, cursor: null }).rgb);
    expect(Object.fromEntries([3, 2, 1, 0].map((zoom) => [`zoom${zoom}`, at(zoom)]))).toMatchSnapshot();
  });
});
