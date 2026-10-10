// What the mouse means on the map: a click, a drag begun on the active unit, a turn of the wheel, a pinch.
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

/**
 * How far into a neighbouring square, as a fraction of a square measured from the active unit's own,
 * a click still means "step there" when the square holds something a click would otherwise open or
 * pick: the strip along the shared side, or the corner that touches for a diagonal neighbour.
 */
export const STEP_RIM = 0.35;

/** Wheel travel, in pixels, that makes one zoom step. */
export const WHEEL_STEP = 100;
/** Pixels a wheel that reports lines is taken to turn per line. */
export const WHEEL_LINE = 33;
/**
 * Wheel travel that makes one zoom step when it comes from a pinch (a wheel event with Ctrl held).
 * A pinch reports far less travel than a wheel does: 100 for each e-fold its fingers spread, so
 * this is a spread of about two thirds again.
 */
export const PINCH_STEP = 50;

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
 * there); otherwise the view centres on the square. Outside move mode the active unit can be picked
 * like any other, which is how the mouse gives it back the orders.
 *
 * `at` is where in the square the click fell, in map squares (the square's own corner is its whole
 * coordinates). A colony or a unit of ours beside the active unit is stepped onto when the click
 * falls on the part of its square nearest the unit (STEP_RIM); the rest of the square opens or picks.
 */
export function mapClick(state: GameState, playerId: string, active: Unit | null, mode: PointerMode, tile: { x: number; y: number }, at?: { x: number; y: number }): MapClick {
  if (mode === 'goto') return { kind: 'goto', x: tile.x, y: tile.y };
  const dx = active ? tile.x - active.x : 0;
  const dy = active ? tile.y - active.y : 0;
  const step: MapClick | null = mode === 'move' && active && active.voyage === null && Math.max(Math.abs(dx), Math.abs(dy)) === 1 ? { kind: 'step', dx, dy } : null;
  if (step && active && at && Math.max(Math.abs(at.x - active.x - 0.5), Math.abs(at.y - active.y - 0.5)) <= 0.5 + STEP_RIM) return step;
  const colony = colonyAt(state, tile.x, tile.y);
  if (colony && colony.owner === playerId) return { kind: 'colony', colonyId: colony.id };
  const others = unitsToPick(state, playerId, tile.x, tile.y).filter((u) => mode !== 'move' || u.id !== active?.id);
  if (others.length > 0) return { kind: 'select', unitIds: others.map((u) => u.id) };
  return step ?? { kind: 'center', x: tile.x, y: tile.y };
}

const ARROW_NAMES: Readonly<Record<string, string>> = { '0,-1': 'n', '1,-1': 'ne', '1,0': 'e', '1,1': 'se', '0,1': 's', '-1,1': 'sw', '-1,0': 'w', '-1,-1': 'nw' };

/**
 * The CSS cursor that says what a click would do: an arrow pointing the way the active unit would
 * step, a hand over a colony that would open or a unit that would be picked, the cross-hair otherwise.
 * The arrow is drawn here as an SVG, its hot spot in the middle; the keyword after it is for
 * browsers that will not take an SVG cursor.
 */
export function mapCursor(click: MapClick): string {
  if (click.kind === 'colony' || click.kind === 'select') return 'pointer';
  const name = click.kind === 'step' ? ARROW_NAMES[`${click.dx},${click.dy}`] : undefined;
  if (click.kind !== 'step' || !name) return 'crosshair';
  const turn = (Math.atan2(click.dx, -click.dy) * 180) / Math.PI;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><path transform="rotate(${turn} 12 12)" d="M12 2 19 11H14.5V22H9.5V11H5Z" fill="#fff" stroke="#000" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 12 12, ${name}-resize`;
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
 * race through the levels. `full` is the travel that makes a step: less for a pinch (PINCH_STEP).
 */
export function wheelStep(kept: number, deltaY: number, full: number = WHEEL_STEP): { kept: number; step: -1 | 0 | 1 } {
  // a change of direction forgets what was kept
  const total = Math.sign(kept) === -Math.sign(deltaY) ? deltaY : kept + deltaY;
  if (Math.abs(total) < full) return { kept: total, step: 0 };
  return { kept: 0, step: total < 0 ? 1 : -1 };
}

/**
 * The wheel travel a pinch stands for where the browser gives the fingers themselves rather than a
 * wheel event (Safari's gestures, a touch screen): `ratio` is how far apart they are now over how
 * far they were. Spreading zooms in, as the wheel turned away does.
 */
export function pinchTravel(ratio: number): number {
  return ratio > 0 && Number.isFinite(ratio) ? -100 * Math.log(ratio) : 0;
}
