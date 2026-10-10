// The map renderer checked without a browser: render() run against a plain pixel buffer
// (test/helpers/reference-canvas.ts). The e2e suite requires the browser's canvas to match this
// same reference pixel for pixel, so what is pinned here holds on every platform.
import { describe, expect, it } from 'vitest';
import type { GameState, Settlement } from '../../../src/engine/state';
import { chartMarks } from '../../../src/ui/chart';
import { ART_COLORS, INK, PALETTE } from '../../../src/ui/pixel-art';
import { makeView } from '../../../src/ui/view';
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

  it('matches the baseline at each zoom', () => {
    expect(Object.fromEntries([3, 2, 1, 0].map((zoom) => [`zoom${zoom}`, fingerprint(shot(scene(), 960, 768, zoom).rgb)]))).toMatchSnapshot();
  });

  it('matches the chart\'s baseline at each zoom: a known patch on the vellum', () => {
    const state = chart((x, y) => Math.abs(x - 20) <= 2 && Math.abs(y - 20) <= 1);
    const at = (zoom: number): string => fingerprint(referencePixels(state, makeView(state.map, 960, 768, 20, 20, { zoom }), { activeUnitId: null, cursor: null }).rgb);
    expect(Object.fromEntries([3, 2, 1, 0].map((zoom) => [`zoom${zoom}`, at(zoom)]))).toMatchSnapshot();
  });
});
