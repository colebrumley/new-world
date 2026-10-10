// Tiles and sprites on canvas (constraint C1: nothing here is taken from anyone else's
// graphics). The art itself is data (pixel-art.ts); this module turns each distinct piece of
// art into a small canvas once and hands it out again, and draws it scaled without smoothing.
import { terrainOf, type Tile } from '../engine/tile';
import type { TerrainId } from '../engine/data/terrain';
import { ART, GROUND, MINI, miniTileArt, PALETTE, tileArt, toRgba, type Sprite, type TileLook } from './pixel-art';

export type { TileLook } from './pixel-art';

const hexOf = (table: Readonly<Record<TerrainId, number>>): Record<TerrainId, string> =>
  Object.fromEntries(Object.entries(table).map(([terrain, ink]) => [terrain, PALETTE[ink]])) as Record<TerrainId, string>;

/** The ground colour of each terrain. */
export const TERRAIN_COLORS: Readonly<Record<TerrainId, string>> = hexOf(GROUND);
/** Flat colour used on the minimap and at the smallest zoom. */
export const MINI_COLORS: Readonly<Record<TerrainId, string>> = hexOf(MINI);

export const TILE_VARIANTS = 4;
/** Below this many pixels a square is drawn from the simplified art. */
export const DETAIL_FROM = 12;

export function lookKey(look: TileLook, size: number): string {
  return [
    size < DETAIL_FROM ? 's' : 'l', look.terrain, look.river, look.riverMask, look.road ? look.roadMask : -1, look.plowed ? 1 : 0,
    look.resource ?? '', look.rumor ? 1 : 0, look.totem ? 1 : 0, look.variant,
  ].join('|');
}

/** What a tile looks like, optionally with forests and markers stripped ("Show Hidden Terrain"). */
export function lookOf(tile: Tile, riverMask: number, roadMask: number, variant: number, hidden: boolean, totem = false): TileLook {
  const shown = hidden && tile.forest ? { ...tile, forest: false } : tile;
  return {
    terrain: terrainOf(shown),
    river: tile.river,
    riverMask,
    road: tile.road,
    roadMask,
    plowed: tile.plowed,
    resource: hidden ? null : tile.resource,
    rumor: hidden ? false : tile.rumor,
    totem: !hidden && totem,
    variant,
  };
}

type Ctx = CanvasRenderingContext2D;

/** A sprite as a canvas of its own size, one canvas pixel per art pixel. */
export function spriteCanvas(sprite: Sprite): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = sprite.size;
  canvas.height = sprite.size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const image = ctx.createImageData(sprite.size, sprite.size);
    image.data.set(toRgba(sprite));
    ctx.putImageData(image, 0, 0);
  }
  return canvas;
}

/** Draw art at (x, y), `size` pixels square, every art pixel a crisp block. */
export function drawArt(ctx: Ctx, art: CanvasImageSource, x: number, y: number, size: number): void {
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(art, x, y, size, size);
}

/** Paint one tile at (0, 0) of the context, `size` pixels square. */
export function paintTile(ctx: Ctx, size: number, look: TileLook): void {
  drawArt(ctx, spriteCanvas(size < DETAIL_FROM ? miniTileArt(look) : tileArt(look)), 0, 0, size);
}

export interface TileCache {
  get(look: TileLook, size: number): CanvasImageSource;
  /** Any other art, made once per key. */
  sprite(key: string, make: () => Sprite): CanvasImageSource;
  readonly size: number;
}

/** Cache of art as canvases. Tiles are keyed by their look; the art is the same at every size above the smallest. */
export function createTileCache(): TileCache {
  let cache = new Map<string, HTMLCanvasElement>();
  const keep = (key: string, make: () => Sprite): HTMLCanvasElement => {
    let canvas = cache.get(key);
    if (!canvas) {
      if (cache.size > 6000) cache = new Map();
      canvas = spriteCanvas(make());
      cache.set(key, canvas);
    }
    return canvas;
  };
  return {
    get: (look, size) => keep(lookKey(look, size), () => (size < DETAIL_FROM ? miniTileArt(look) : tileArt(look))),
    sprite: (key, make) => keep(`sprite|${key}`, make),
    get size() {
      return cache.size;
    },
  };
}

export { ART };
