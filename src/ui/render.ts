// Canvas 2D map drawing (R-105): only the tiles inside the view are drawn, each from the tile
// cache, unexplored tiles as the vellum of an explorer's chart (R-1011), and the visible pieces on top.
import { holdsUsed } from '../engine/cargo';
import { chartMarks, markShows } from './chart';
import { COLONY_LIMITS } from '../engine/data/colony';
import type { NationId } from '../engine/data/nations';
import { UNIT_TYPES } from '../engine/data/units';
import { visibleUnits } from '../engine/explore';
import { membershipBand } from '../engine/liberty';
import type { GameMap, GameState, Unit } from '../engine/state';
import { attitude, isHostile } from '../engine/alarm';
import { TRIBES, type TribeId } from '../engine/data/tribes';
import { tribeOfOwner } from '../engine/settlements';
import { isExploredBy, isWater, type Tile } from '../engine/tile';
import { activeFrameArt, colonyArt, chartMarkArt, cursorArt, DETAIL, detailedColonyArt, detailedPieceArt, detailedSettlementArt, halve, hasFigure, INK, PALETTE, pieceArt, settlementArt, VELLUM, vellumArt, type InkId, type Sprite } from './pixel-art';
import { chartGrid, DETAIL_FROM, drawArt, lookOf, TILE_VARIANTS, type TileCache } from './tiles';
import { orderLetter, topUnit } from './unit-queue';
import type { View } from './view';

/** What lies beyond the map's edge: the page's own dark. */
export const VOID_COLOR: string = PALETTE[INK.void];
/** Bare vellum: an unexplored square on the minimap. */
export const VELLUM_COLOR: string = PALETTE[VELLUM];

/** Ink for each nation's pieces: English red, French blue, Spanish yellow, Dutch orange. */
const NATION_INK: Readonly<Record<NationId, InkId>> = { england: INK.red, france: INK.blue, spain: INK.yellow, netherlands: INK.orange };
/** Box colours in nation order. */
export const PLAYER_COLORS = [PALETTE[INK.red], PALETTE[INK.blue], PALETTE[INK.yellow], PALETTE[INK.orange]] as const;

/** Our own colours for the eight tribes. */
const TRIBE_INK: Readonly<Record<TribeId, InkId>> = {
  inca: INK.sand, aztec: INK.orange, arawak: INK.marsh, iroquois: INK.purple, cherokee: INK.green, apache: INK.earth, sioux: INK.lightGrey, tupi: INK.brightBlue,
};
export const TRIBE_COLORS: Readonly<Record<TribeId, string>> = Object.fromEntries(Object.entries(TRIBE_INK).map(([tribe, ink]) => [tribe, PALETTE[ink]])) as Record<TribeId, string>;

/** The ink a power's pieces and colonies are drawn in. */
export function inkOf(state: GameState, playerId: string): InkId {
  const tribe = tribeOfOwner(playerId);
  if (tribe) return TRIBE_INK[tribe];
  // the King's own army fights under a white flag
  if (playerId === state.crownPlayer) return INK.white;
  return NATION_INK[state.players.find((p) => p.id === playerId)?.nation ?? 'england'];
}

/** The colour a power's pieces and colonies are drawn in. */
export function colorOf(state: GameState, playerId: string): string {
  return PALETTE[inkOf(state, playerId)];
}

const N4: readonly (readonly [number, number])[] = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const N8: readonly (readonly [number, number])[] = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];

function tileOf(map: GameMap, x: number, y: number): Tile | null {
  return x >= 0 && y >= 0 && x < map.width && y < map.height ? (map.tiles[y * map.width + x] ?? null) : null;
}

function riverMask(map: GameMap, x: number, y: number): number {
  let mask = 0;
  N4.forEach(([dx, dy], i) => {
    const n = tileOf(map, x + dx, y + dy);
    if (n && (n.river !== 'none' || isWater(n))) mask |= 1 << i;
  });
  return mask;
}

function roadMask(map: GameMap, x: number, y: number): number {
  let mask = 0;
  N8.forEach(([dx, dy], i) => {
    if (tileOf(map, x + dx, y + dy)?.road) mask |= 1 << i;
  });
  return mask;
}

/** Index of the player whose knowledge the screen shows: the first human. */
export function viewerIndex(state: GameState): number {
  return Math.max(0, state.players.findIndex((p) => p.kind === 'human'));
}

export interface RenderExtras {
  /** Unit to outline as the active piece. */
  readonly activeUnitId?: string | null;
  /** Square to mark with the view / Go To cursor. */
  readonly cursor?: { readonly x: number; readonly y: number } | null;
  /** Whether the active unit's frame is lit just now (it blinks); lit when not given. */
  readonly blinkOn?: boolean;
  /** A unit drawn off its square by this much, in squares, while it slides there. */
  readonly slide?: { readonly unitId: string; readonly dx: number; readonly dy: number } | null;
  /** Shifts which wave pattern each sea square shows, so the water moves. */
  readonly waterPhase?: number;
}

/** Ink of the mark over a settlement, by how its people feel about the viewer: calm to hostile. */
const MOOD_INK: readonly InkId[] = [INK.green, INK.brightBlue, INK.yellow, INK.orange, INK.red];
export const MOOD_COLORS: readonly string[] = MOOD_INK.map((ink) => PALETTE[ink]);

/** Population number ink by Sons of Liberty membership: under half, half or more, everyone. */
/** The walls a colony may have, weakest first; its picture shows the strongest it has. */
const FORT_LEVELS: readonly string[] = COLONY_LIMITS.fortifications;
const BAND_INK = { minority: INK.white, majority: INK.green, unanimous: INK.brightBlue } as const;

export function render(ctx: CanvasRenderingContext2D, state: GameState, view: View, cache: TileCache, extras: RenderExtras = {}): void {
  renderGround(ctx, state, view, cache, extras.waterPhase ?? 0);
  renderPieces(ctx, state, view, cache, extras);
}

/**
 * The ground: the void beyond the map, every explored square in view, and the rest as an explorer's chart:
 * vellum, hatched where it meets the known, with the chart's roses and creatures where all they cover is
 * still unknown. It changes only with the map, the view and the water's phase.
 */
export function renderGround(ctx: CanvasRenderingContext2D, state: GameState, view: View, cache: TileCache, waterPhase = 0): void {
  const { map } = state;
  const t = view.tileSize;
  const viewer = viewerIndex(state);
  ctx.fillStyle = VOID_COLOR;
  ctx.fillRect(0, 0, view.width, view.height);
  ctx.imageSmoothingEnabled = false;

  const x0 = Math.max(0, Math.floor(view.originX));
  const y0 = Math.max(0, Math.floor(view.originY));
  const x1 = Math.min(map.width, Math.ceil(view.originX + view.width / t));
  const y1 = Math.min(map.height, Math.ceil(view.originY + view.height / t));
  const ox = Math.round(-view.originX * t);
  const oy = Math.round(-view.originY * t);

  const grid = chartGrid(t);
  /** Whether a square is on the map and not yet seen. */
  const unknown = (x: number, y: number): boolean => {
    const tile = tileOf(map, x, y);
    return tile !== null && !view.revealAll && !isExploredBy(tile, viewer);
  };
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const tile = map.tiles[y * map.width + x];
      if (!tile) continue;
      if (unknown(x, y)) {
        // vellum, hatched along whichever of its edges and corners touch the known
        let mask = 0;
        N8.forEach(([dx, dy], i) => {
          if (tileOf(map, x + dx, y + dy) && !unknown(x + dx, y + dy)) mask |= 1 << i;
        });
        const variant = grid === 8 ? 0 : (x * 7 + y * 13) % TILE_VARIANTS;
        ctx.drawImage(cache.sprite(`vellum|${grid}|${variant}|${mask}`, () => vellumArt(grid, variant, mask)), ox + x * t, oy + y * t, t, t);
        continue;
      }
      const look = lookOf(
        tile,
        tile.river === 'none' ? 0 : riverMask(map, x, y),
        tile.road ? roadMask(map, x, y) : 0,
        (x * 7 + y * 13 + (isWater(tile) ? waterPhase : 0)) % TILE_VARIANTS,
        view.showHidden,
      );
      ctx.drawImage(cache.get(look, t), ox + x * t, oy + y * t, t, t);
    }
  }
  if (view.revealAll) return;
  for (const mark of chartMarks(state.seed, map.width, map.height)) {
    if (mark.x >= x1 || mark.y >= y1 || mark.x + mark.size <= x0 || mark.y + mark.size <= y0 || !markShows(mark, unknown)) continue;
    ctx.drawImage(cache.sprite(`chart|${mark.kind}|${grid}`, () => chartMarkArt(mark.kind, grid)), ox + mark.x * t, oy + mark.y * t, mark.size * t, mark.size * t);
  }
}

/** Everything that stands on the ground: the cursor, colonies, settlements and units. Drawn over renderGround's work. */
export function renderPieces(ctx: CanvasRenderingContext2D, state: GameState, view: View, cache: TileCache, extras: RenderExtras = {}): void {
  const { map } = state;
  const t = view.tileSize;
  const viewer = viewerIndex(state);
  ctx.imageSmoothingEnabled = false;
  const x0 = Math.max(0, Math.floor(view.originX));
  const y0 = Math.max(0, Math.floor(view.originY));
  const x1 = Math.min(map.width, Math.ceil(view.originX + view.width / t));
  const y1 = Math.min(map.height, Math.ceil(view.originY + view.height / t));
  const ox = Math.round(-view.originX * t);
  const oy = Math.round(-view.originY * t);

  /** Art for the current zoom: full size, or halved where a square is too small to hold it. */
  const small = t < DETAIL_FROM;
  const art = (key: string, make: () => Sprite): CanvasImageSource => cache.sprite(small ? `half|${key}` : key, small ? () => halve(make()) : make);
  // a colony or settlement is drawn from its detailed picture once a square can hold it, as large as whole pixels allow, standing on the square's foot
  const large = Math.floor(t / DETAIL) * DETAIL;
  const place = (key: string, detailed: () => Sprite | null, plain: () => Sprite, x: number, y: number): void => {
    if (large > 0) drawArt(ctx, cache.sprite(`detail|${key}`, () => detailed() ?? plain()), ox + x * t + (t - large) / 2, oy + y * t + t - large, large);
    else drawArt(ctx, art(key, plain), ox + x * t, oy + y * t, t);
  };
  if (extras.cursor) drawArt(ctx, art('cursor', cursorArt), ox + extras.cursor.x * t, oy + extras.cursor.y * t, t);
  if (view.showHidden) return;
  const colonySquares = new Set<number>();
  for (const colony of Object.values(state.colonies)) {
    if (colony.x < x0 || colony.x >= x1 || colony.y < y0 || colony.y >= y1) continue;
    const tile = map.tiles[colony.y * map.width + colony.x];
    if (!tile || !(view.revealAll || isExploredBy(tile, viewer))) continue;
    colonySquares.add(colony.y * map.width + colony.x);
    const ink = inkOf(state, colony.owner);
    const band = BAND_INK[membershipBand(state, colony)];
    const people = colony.colonists.length;
    const fort = FORT_LEVELS.reduce((best, building, i) => (colony.buildings.includes(building) ? i + 1 : best), 0);
    place(`colony|${ink}|${people}|${band}|${fort}`, () => detailedColonyArt(ink, people, band, fort), () => colonyArt(ink, people, band), colony.x, colony.y);
  }
  const me = state.players[viewer]?.id;
  for (const village of Object.values(state.settlements)) {
    if (village.x < x0 || village.x >= x1 || village.y < y0 || village.y >= y1) continue;
    const tile = map.tiles[village.y * map.width + village.x];
    if (!tile || !(view.revealAll || isExploredBy(tile, viewer))) continue;
    const met = me !== undefined && (state.tribes[village.tribe]?.met.includes(me) ?? false);
    const mood = met && me !== undefined ? (MOOD_INK[isHostile(village, me) ? 4 : attitude(state, village.tribe, me)] as InkId) : null;
    const ink = TRIBE_INK[village.tribe];
    const tech = TRIBES[village.tribe].tech;
    place(`village|${ink}|${tech}|${village.capital ? 1 : 0}|${mood ?? '-'}`, () => detailedSettlementArt(ink, tech, village.capital, mood), () => settlementArt(ink, Math.min(2, tech), village.capital, mood), village.x, village.y);
  }
  const pieces = (view.revealAll ? Object.values(state.units) : visibleUnits(state, viewer)).filter((u) => u.aboard === null && u.voyage === null);
  const bySquare = new Map<number, Unit[]>();
  for (const unit of pieces) {
    if (unit.x < x0 || unit.x >= x1 || unit.y < y0 || unit.y >= y1) continue;
    const key = unit.y * map.width + unit.x;
    const stack = bySquare.get(key);
    if (stack) stack.push(unit);
    else bySquare.set(key, [unit]);
  }
  for (const stack of bySquare.values()) {
    const unit = topUnit(stack, extras.activeUnitId ?? null);
    if (!unit) continue;
    // Inside a colony only the active piece is drawn, so the settlement itself stays visible.
    if (colonySquares.has(unit.y * map.width + unit.x) && unit.id !== extras.activeUnitId) continue;
    const ink = inkOf(state, unit.owner);
    // A foreign ship shows how many of its holds are filled instead of its orders; native bands carry no plate.
    const foreignShip = unit.owner !== me && UNIT_TYPES[unit.type].domain === 'sea';
    const label = UNIT_TYPES[unit.type].native ? '' : foreignShip ? String(holdsUsed(state, unit)) : orderLetter(unit);
    const stacked = stack.length > 1;
    // a piece on the move is drawn part of the way there
    const slide = extras.slide && extras.slide.unitId === unit.id ? extras.slide : null;
    const px = ox + Math.round((unit.x + (slide?.dx ?? 0)) * t);
    const py = oy + Math.round((unit.y + (slide?.dy ?? 0)) * t);
    const piece = { type: unit.type, color: ink, label, stacked };
    // a kind with a detailed figure is drawn from it once a square can hold it, as large as whole pixels allow, standing on the square's foot
    const large = hasFigure(unit.type) ? Math.floor(t / DETAIL) * DETAIL : 0;
    if (large > 0) drawArt(ctx, cache.sprite(`figure|${unit.type}|${ink}|${label}|${stacked ? 1 : 0}`, () => detailedPieceArt(piece) ?? pieceArt(piece)), px + (t - large) / 2, py + t - large, large);
    else drawArt(ctx, art(`piece|${unit.type}|${ink}|${label}|${stacked ? 1 : 0}`, () => pieceArt(piece)), px, py, t);
    // the piece awaiting orders blinks its frame
    if (unit.id === extras.activeUnitId && extras.blinkOn !== false) drawArt(ctx, art('active', activeFrameArt), px, py, t);
  }
}
