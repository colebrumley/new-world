// The "New World view": the whole map in miniature with a box showing what the main view covers.
import type { GameState } from '../engine/state';
import { isExploredBy, terrainOf } from '../engine/tile';
import { colorOf, viewerIndex, VOID_COLOR } from './render';
import { INK, PALETTE } from './pixel-art';
import { MINI_COLORS } from './tiles';

const WHITE: string = PALETTE[INK.white];
import type { View } from './view';

export interface MinimapLayout {
  /** Pixels per tile. */
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

export function minimapLayout(mapWidth: number, mapHeight: number, width: number, height: number): MinimapLayout {
  const scale = Math.max(1, Math.floor(Math.min(width / mapWidth, height / mapHeight)));
  return { scale, offsetX: Math.floor((width - mapWidth * scale) / 2), offsetY: Math.floor((height - mapHeight * scale) / 2) };
}

/** Tile under a minimap pixel (clamped to the map). */
export function minimapToTile(layout: MinimapLayout, mapWidth: number, mapHeight: number, px: number, py: number): { x: number; y: number } {
  const clamp = (v: number, max: number): number => Math.min(max - 1, Math.max(0, v));
  return {
    x: clamp(Math.floor((px - layout.offsetX) / layout.scale), mapWidth),
    y: clamp(Math.floor((py - layout.offsetY) / layout.scale), mapHeight),
  };
}

export function renderMinimap(
  ctx: CanvasRenderingContext2D, state: GameState, view: View, width: number, height: number, activeUnitId: string | null = null,
): void {
  const { map } = state;
  const { scale, offsetX, offsetY } = minimapLayout(map.width, map.height, width, height);
  const viewer = viewerIndex(state);
  ctx.fillStyle = VOID_COLOR;
  ctx.fillRect(0, 0, width, height);
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const tile = map.tiles[y * map.width + x];
      if (!tile || !(view.revealAll || isExploredBy(tile, viewer))) continue;
      ctx.fillStyle = MINI_COLORS[terrainOf(tile)];
      ctx.fillRect(offsetX + x * scale, offsetY + y * scale, scale, scale);
    }
  }
  for (const colony of Object.values(state.colonies)) {
    const tile = map.tiles[colony.y * map.width + colony.x];
    if (!tile || !(view.revealAll || isExploredBy(tile, viewer))) continue;
    ctx.fillStyle = WHITE;
    ctx.fillRect(offsetX + colony.x * scale, offsetY + colony.y * scale, scale, scale);
  }
  const me = state.players[viewer]?.id;
  for (const unit of Object.values(state.units)) {
    if (unit.owner !== me) continue;
    ctx.fillStyle = unit.id === activeUnitId ? WHITE : colorOf(state, me ?? '');
    ctx.fillRect(offsetX + unit.x * scale, offsetY + unit.y * scale, scale, scale);
  }
  const cols = view.width / view.tileSize;
  const rows = view.height / view.tileSize;
  const bx = Math.max(0, view.originX);
  const by = Math.max(0, view.originY);
  const bw = Math.min(map.width, view.originX + cols) - bx;
  const bh = Math.min(map.height, view.originY + rows) - by;
  ctx.strokeStyle = WHITE;
  ctx.lineWidth = 1;
  ctx.strokeRect(
    offsetX + Math.round(bx * scale) + 0.5, offsetY + Math.round(by * scale) + 0.5,
    Math.max(1, Math.round(bw * scale) - 1), Math.max(1, Math.round(bh * scale) - 1),
  );
}
