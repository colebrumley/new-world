// What the mouse means on the map: a click, a drag begun on the active unit, a turn of the wheel.
// Pure, so the rules can be tested without a browser.
import { colonyAt, type GameState, type Unit, type UnitId } from '../engine/state';

export type PointerMode = 'move' | 'view' | 'goto';

export type MapClick =
  /** Go To targeting: this square is the destination. */
  | { readonly kind: 'goto'; readonly x: number; readonly y: number }
  | { readonly kind: 'colony'; readonly colonyId: string }
  /** Units of ours on the square, any of which may be made the active one. */
  | { readonly kind: 'select'; readonly unitIds: readonly UnitId[] }
  /** One step for the active unit. */
  | { readonly kind: 'step'; readonly dx: number; readonly dy: number }
  | { readonly kind: 'center'; readonly x: number; readonly y: number };

export type MapDrag =
  | { readonly kind: 'none' }
  | { readonly kind: 'step'; readonly dx: number; readonly dy: number }
  | { readonly kind: 'goto'; readonly x: number; readonly y: number };

/** Wheel travel, in pixels, that makes one zoom step. */
export const WHEEL_STEP = 100;
/** Pixels a wheel that reports lines is taken to turn per line. */
export const WHEEL_LINE = 33;

const order = (id: UnitId): number => Number(id.replace(/\D+/g, '')) || 0;

/** Our units standing on a square (not carried, not at sea for Europe), in id order. */
export function unitsToPick(state: GameState, playerId: string, x: number, y: number): Unit[] {
  return Object.values(state.units)
    .filter((u) => u.owner === playerId && u.x === x && u.y === y && u.aboard === null && u.voyage === null)
    .sort((a, b) => order(a.id) - order(b.id));
}

/**
 * What a click on a square asks for. In order: a Go To destination; our colony (it opens); a unit
 * of ours other than the active one (it is selected); a square beside the active unit (it steps
 * there); otherwise the view centres on the square.
 */
export function mapClick(state: GameState, playerId: string, active: Unit | null, mode: PointerMode, tile: { x: number; y: number }): MapClick {
  if (mode === 'goto') return { kind: 'goto', x: tile.x, y: tile.y };
  const colony = colonyAt(state, tile.x, tile.y);
  if (colony && colony.owner === playerId) return { kind: 'colony', colonyId: colony.id };
  const others = unitsToPick(state, playerId, tile.x, tile.y).filter((u) => u.id !== active?.id);
  if (others.length > 0) return { kind: 'select', unitIds: others.map((u) => u.id) };
  if (mode === 'move' && active && active.voyage === null) {
    const dx = tile.x - active.x;
    const dy = tile.y - active.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) === 1) return { kind: 'step', dx, dy };
  }
  return { kind: 'center', x: tile.x, y: tile.y };
}

/** A drag begun on the active unit and let go over a square: one step if it is adjacent, a Go To if farther. */
export function mapDrag(active: Unit, tile: { x: number; y: number } | null): MapDrag {
  if (!tile) return { kind: 'none' };
  const dx = tile.x - active.x;
  const dy = tile.y - active.y;
  const far = Math.max(Math.abs(dx), Math.abs(dy));
  if (far === 0) return { kind: 'none' };
  return far === 1 ? { kind: 'step', dx, dy } : { kind: 'goto', x: tile.x, y: tile.y };
}

/**
 * Add a wheel event to the travel kept so far. A full step's worth zooms once (away from the
 * player zooms in) and starts the count again, so a trackpad's stream of small events does not
 * race through the levels.
 */
export function wheelStep(kept: number, deltaY: number): { kept: number; step: -1 | 0 | 1 } {
  // a change of direction forgets what was kept
  const total = Math.sign(kept) === -Math.sign(deltaY) ? deltaY : kept + deltaY;
  if (Math.abs(total) < WHEEL_STEP) return { kept: total, step: 0 };
  return { kept: 0, step: total < 0 ? 1 : -1 };
}
