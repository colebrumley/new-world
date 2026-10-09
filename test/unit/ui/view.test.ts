import { describe, expect, it } from 'vitest';
import { makeTile } from '../../../src/engine/tile';
import { centerOn, isTileInView, makeView, panBy, resizeView, screenToTile, tileSizeFor, viewCenter, ZOOM_LEVELS, zoomAt, zoomBy } from '../../../src/ui/view';

const map = { width: 58, height: 72, tiles: Array.from({ length: 58 * 72 }, () => makeTile()) };

describe('view math', () => {
  it("offers the original's four view sizes", () => {
    expect(ZOOM_LEVELS).toEqual([
      { cols: 120, rows: 96 }, { cols: 60, rows: 48 }, { cols: 30, rows: 24 }, { cols: 15, rows: 12 },
    ]);
    expect(tileSizeFor(960, 768, 3)).toBe(64);
    expect(tileSizeFor(960, 768, 2)).toBe(32);
    expect(tileSizeFor(960, 768, 1)).toBe(16);
    expect(tileSizeFor(960, 768, 0)).toBe(8);
    expect(tileSizeFor(1040, 800, 3)).toBe(64); // 66 would fit; the art grid wants a multiple of 8
    expect(tileSizeFor(100, 100, 0)).toBe(2);
  });

  it('centres on a tile and clamps at the map edges', () => {
    const v = makeView(map, 960, 768, 30, 40);
    expect(viewCenter(v)).toEqual({ x: 30, y: 40 });
    expect([v.originX, v.originY]).toEqual([23, 34.5]);
    const corner = makeView(map, 960, 768, 0, 0);
    expect([corner.originX, corner.originY]).toEqual([0, 0]);
    const far = makeView(map, 960, 768, 99, 99);
    expect([far.originX, far.originY]).toEqual([58 - 15, 72 - 12]);
  });

  it('centres the whole map when it is smaller than the canvas', () => {
    const v = makeView(map, 960, 768, 5, 5, { zoom: 0 });
    expect(v.originX).toBe(-(120 - 58) / 2);
    expect(v.originY).toBe(-(96 - 72) / 2);
    expect(panBy(v, map, 10, 10).originX).toBe(v.originX);
  });

  it('pans, zooms about the centre, and keeps flags', () => {
    const v = makeView(map, 960, 768, 30, 40, { showHidden: true, revealAll: true });
    const p = panBy(v, map, 2, -3);
    expect(viewCenter(p)).toEqual({ x: 32, y: 37 });
    const out = zoomBy(v, map, -1);
    expect(out.zoom).toBe(2);
    expect(viewCenter(out)).toEqual({ x: 30, y: 40 });
    expect([out.showHidden, out.revealAll]).toEqual([true, true]);
    expect(zoomBy(v, map, 5).zoom).toBe(3);
    expect(zoomBy(out, map, -9).zoom).toBe(0);
    expect(viewCenter(centerOn(v, map, 20, 20))).toEqual({ x: 20, y: 20 });
    const r = resizeView(v, map, 640, 512);
    expect(r.tileSize).toBe(40);
    expect(viewCenter(r).x).toBeCloseTo(30);
  });

  it('converts pixels to tiles and tests visibility', () => {
    const v = makeView(map, 960, 768, 30, 40);
    expect(screenToTile(v, map, 0, 0)).toEqual({ x: 23, y: 34 });
    expect(screenToTile(v, map, 959, 767)).toEqual({ x: 37, y: 46 });
    expect(screenToTile(makeView(map, 960, 768, 5, 5, { zoom: 0 }), map, 0, 0)).toBeNull();
    expect(isTileInView(v, 30, 40)).toBe(true);
    expect(isTileInView(v, 23, 40)).toBe(true);
    expect(isTileInView(v, 23, 40, 1)).toBe(false);
    expect(isTileInView(v, 22, 40)).toBe(false);
  });
  it('zooms about a pixel: the square under the pointer stays under it', () => {
    const v = makeView(map, 960, 768, 30, 40);
    const under = screenToTile(v, map, 200, 600);
    const out = zoomAt(v, map, -1, 200, 600);
    expect(out.zoom).toBe(2);
    expect(screenToTile(out, map, 200, 600)).toEqual(under);
    expect(screenToTile(zoomAt(out, map, 1, 200, 600), map, 200, 600)).toEqual(under);
    // at the last level nothing moves
    expect(zoomAt(v, map, 1, 200, 600)).toEqual(v);
  });
});
