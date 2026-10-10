// The map renderer checked without a browser: render() run against a plain pixel buffer
// (test/helpers/reference-canvas.ts). The e2e suite requires the browser's canvas to match this
// same reference pixel for pixel, so what is pinned here holds on every platform.
import { describe, expect, it } from 'vitest';
import type { GameState, Settlement } from '../../../src/engine/state';
import { ART_COLORS } from '../../../src/ui/pixel-art';
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

  it('leaves unexplored squares black', () => {
    const dark = setTile(scene(), 5, 2, { explored: 0 });
    const made = shot(dark, 960, 768, 3);
    const view = makeView(dark.map, 960, 768, 4, 2, { zoom: 3 });
    const px = Math.round((5 - view.originX + 0.5) * view.tileSize);
    const py = Math.round((2 - view.originY + 0.5) * view.tileSize);
    expect([...made.rgb.slice((py * made.width + px) * 3, (py * made.width + px) * 3 + 3)]).toEqual([0x0b, 0x0d, 0x12]);
  });

  it('matches the baseline at each zoom', () => {
    expect(Object.fromEntries([3, 2, 1, 0].map((zoom) => [`zoom${zoom}`, fingerprint(shot(scene(), 960, 768, zoom).rgb)]))).toMatchSnapshot();
  });
});
