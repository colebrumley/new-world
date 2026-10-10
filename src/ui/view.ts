// View math for the map canvas: zoom levels, clamping, panning, screen/tile conversion.
import type { GameMap } from '../engine/state';

/** Tiles shown across and down at each zoom level, farthest first (four sizes). */
export const ZOOM_LEVELS = [
  { cols: 120, rows: 96 },
  { cols: 60, rows: 48 },
  { cols: 30, rows: 24 },
  { cols: 15, rows: 12 },
] as const;

export const DEFAULT_ZOOM = 3;
/** Square sizes are whole multiples of this many pixels, once there is room for one. */
export const ART_STEP = 8;
/** From this many pixels up a square is a whole multiple of it, so the detailed art fits it exactly. */
export const DETAIL_STEP = 32;

export interface View {
  /** Canvas size in CSS pixels. */
  readonly width: number;
  readonly height: number;
  /** Index into ZOOM_LEVELS. */
  readonly zoom: number;
  /** Tile edge in CSS pixels. */
  readonly tileSize: number;
  /** Map tile shown at the top-left corner; may be fractional or negative when the map is smaller than the canvas. */
  readonly originX: number;
  readonly originY: number;
  /** "Show Hidden Terrain": draw the ground with forests and pieces stripped away. */
  readonly showHidden: boolean;
  /** Ignore the fog (tests and debugging). */
  readonly revealAll: boolean;
}

export function tileSizeFor(width: number, height: number, zoom: number): number {
  const level = ZOOM_LEVELS[zoom] ?? ZOOM_LEVELS[DEFAULT_ZOOM];
  const fit = Math.floor(Math.min(width / level.cols, height / level.rows));
  // the detailed art is drawn on a grid of 32 pixels to the square and the plain art on one of 16: keep
  // the square a whole number of the first where there is room, else of eighths of the second, so
  // every art pixel comes out the same size
  if (fit >= DETAIL_STEP) return fit - (fit % DETAIL_STEP);
  return fit >= ART_STEP ? fit - (fit % ART_STEP) : Math.max(2, fit);
}

function clampOrigin(origin: number, visible: number, size: number): number {
  if (size <= visible) return -(visible - size) / 2;
  return Math.min(Math.max(origin, 0), size - visible);
}

export interface ViewOptions {
  readonly zoom?: number;
  readonly showHidden?: boolean;
  readonly revealAll?: boolean;
}

/** A view of the given canvas size centred (as far as the map edges allow) on a tile. */
export function makeView(map: GameMap, width: number, height: number, centerX: number, centerY: number, options: ViewOptions = {}): View {
  const zoom = Math.min(ZOOM_LEVELS.length - 1, Math.max(0, options.zoom ?? DEFAULT_ZOOM));
  const tileSize = tileSizeFor(width, height, zoom);
  const cols = width / tileSize;
  const rows = height / tileSize;
  return {
    width,
    height,
    zoom,
    tileSize,
    originX: clampOrigin(centerX + 0.5 - cols / 2, cols, map.width),
    originY: clampOrigin(centerY + 0.5 - rows / 2, rows, map.height),
    showHidden: options.showHidden ?? false,
    revealAll: options.revealAll ?? false,
  };
}

/** The (fractional) tile at the middle of the canvas. */
export function viewCenter(view: View): { x: number; y: number } {
  return { x: view.originX + view.width / view.tileSize / 2 - 0.5, y: view.originY + view.height / view.tileSize / 2 - 0.5 };
}

const carry = (view: View): ViewOptions => ({ zoom: view.zoom, showHidden: view.showHidden, revealAll: view.revealAll });

export function centerOn(view: View, map: GameMap, x: number, y: number): View {
  return makeView(map, view.width, view.height, x, y, carry(view));
}

export function panBy(view: View, map: GameMap, dx: number, dy: number): View {
  const c = viewCenter(view);
  return centerOn(view, map, c.x + dx, c.y + dy);
}

export function zoomBy(view: View, map: GameMap, delta: number): View {
  const c = viewCenter(view);
  return makeView(map, view.width, view.height, c.x, c.y, { ...carry(view), zoom: view.zoom + delta });
}

/** Zoom keeping the map point under a canvas pixel where it is (as far as the map edges allow). */
export function zoomAt(view: View, map: GameMap, delta: number, px: number, py: number): View {
  const zoomed = zoomBy(view, map, delta);
  if (zoomed.tileSize === view.tileSize) return zoomed;
  const x = view.originX + px / view.tileSize;
  const y = view.originY + py / view.tileSize;
  return centerOn(zoomed, map, x + (zoomed.width / 2 - px) / zoomed.tileSize - 0.5, y + (zoomed.height / 2 - py) / zoomed.tileSize - 0.5);
}

export function resizeView(view: View, map: GameMap, width: number, height: number): View {
  const c = viewCenter(view);
  return makeView(map, width, height, c.x, c.y, carry(view));
}

/** Tile under a canvas pixel, or null when the pixel is off the map. */
export function screenToTile(view: View, map: GameMap, px: number, py: number): { x: number; y: number } | null {
  const x = Math.floor(view.originX + px / view.tileSize);
  const y = Math.floor(view.originY + py / view.tileSize);
  return x >= 0 && y >= 0 && x < map.width && y < map.height ? { x, y } : null;
}

/** Is the tile fully inside the canvas, with `margin` tiles to spare? */
export function isTileInView(view: View, x: number, y: number, margin = 0): boolean {
  const cols = view.width / view.tileSize;
  const rows = view.height / view.tileSize;
  return x >= view.originX + margin && x + 1 <= view.originX + cols - margin && y >= view.originY + margin && y + 1 <= view.originY + rows - margin;
}
