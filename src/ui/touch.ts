// The page under a finger (R-1071, docs/specs/phone-play.md): which layout the window calls for,
// how it is held, whether a finger is at work, and the long press. Every rule for a phone is
// written against the three attributes this keeps on <html>: data-layout="compact|full",
// data-posture="upright|sideways" and data-pointer="coarse|fine".

/** A touch held this long without travelling LONG_PRESS_TRAVEL is a long press. */
export const LONG_PRESS_MS = 500;
/** A touch that travels this far (CSS px) is a pan or a scroll, and can no longer be a tap or a long press. */
export const LONG_PRESS_TRAVEL = 10;
/** Narrower than this, the layout is compact. */
const COMPACT_BELOW_WIDTH = 760;
/** Shorter than this, the layout is compact: the height today's sidebar is built to fit. */
const COMPACT_BELOW_HEIGHT = 640;

/**
 * The name of a bubbling CustomEvent whose detail is `{ clientX, clientY }`: sent from an element,
 * it asks for that element's encyclopedia page.
 */
export const LOOK_UP = 'lookup';
export interface LookUpDetail {
  readonly clientX: number;
  readonly clientY: number;
}

export type Layout = 'compact' | 'full';
export type Posture = 'upright' | 'sideways';
export type Pointer = 'coarse' | 'fine';

/** The layout a window of this size calls for, and how it is held: upright only when taller than wide. */
export function layoutOf(width: number, height: number): { layout: Layout; posture: Posture } {
  return {
    layout: width < COMPACT_BELOW_WIDTH || height < COMPACT_BELOW_HEIGHT ? 'compact' : 'full',
    posture: height > width ? 'upright' : 'sideways',
  };
}

/**
 * Keep data-layout, data-posture and data-pointer on `root` (the document's <html>) current: set
 * at once, the first two again on every resize, the pointer coarse when the browser says its
 * primary pointer is or from the first touch felt in this visit. Returns the function that stops.
 */
export function watchScreen(root: HTMLElement = document.documentElement, win: Window = window): () => void {
  let touched = false;
  const coarse = win.matchMedia?.('(pointer: coarse)');
  const set = (name: string, value: string): void => {
    if (root.getAttribute(name) !== value) root.setAttribute(name, value);
  };
  const pointer = (): void => set('data-pointer', touched || coarse?.matches ? 'coarse' : 'fine');
  const size = (): void => {
    const { layout, posture } = layoutOf(win.innerWidth, win.innerHeight);
    set('data-layout', layout);
    set('data-posture', posture);
  };
  const felt = (event: Event): void => {
    if ('pointerType' in event ? event.pointerType !== 'touch' : event.type !== 'touchstart') return;
    touched = true;
    pointer();
  };
  size();
  pointer();
  const listen = { capture: true, passive: true } as const;
  win.addEventListener('resize', size);
  win.addEventListener('orientationchange', size);
  win.addEventListener('pointerdown', felt, listen);
  win.addEventListener('touchstart', felt, listen);
  coarse?.addEventListener?.('change', pointer);
  return () => {
    win.removeEventListener('resize', size);
    win.removeEventListener('orientationchange', size);
    win.removeEventListener('pointerdown', felt, listen);
    win.removeEventListener('touchstart', felt, listen);
    coarse?.removeEventListener?.('change', pointer);
  };
}

/** How long after a long press's release a click or contextmenu is still taken for part of it. */
const SWALLOW_MS = 1000;

/**
 * Run `handler` once a touch or pen pointer that went down inside `element` has been held
 * LONG_PRESS_MS without travelling LONG_PRESS_TRAVEL: never for a mouse, never once a second
 * pointer is down, never after a pointercancel. Whenever it ran, the release that follows makes no
 * click and no contextmenu; a click a key makes, or one after a key is pressed, is never taken for it. Returns the function that removes it.
 */
export function onLongPress(element: Element, handler: (target: Element, clientX: number, clientY: number) => void): () => void {
  const win = element.ownerDocument.defaultView ?? window;
  /** Every pointer down on the page and its kind, so that a second one is seen wherever it lands. */
  const down = new Map<number, string>();
  type Press = { id: number; x: number; y: number; target: Element; timer: ReturnType<typeof setTimeout> };
  let press: Press | null = null;
  /** The pointer whose long press ran, until its release; then the moment the swallowing ends. */
  let held: number | null = null;
  let swallowUntil = 0;
  let swallowing = false;

  const drop = (): void => {
    if (press) clearTimeout(press.timer);
    press = null;
  };
  const onDown = (event: PointerEvent): void => {
    // the first pointer of its kind: any of that kind left over from a release that never reached
    // us are gone (a primary touch and a primary mouse can be down together, so only its own kind)
    if (event.isPrimary) for (const [id, kind] of down) if (kind === event.pointerType) down.delete(id);
    down.set(event.pointerId, event.pointerType);
    // a new touch starts afresh: whatever the last long press left to swallow is gone
    if (held === null) swallowing = false;
    drop();
    if (down.size > 1) return;
    const target = event.target as Element | null;
    if (event.pointerType === 'mouse' || !target || !element.contains(target)) return;
    const started: Press = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      target,
      timer: setTimeout(() => {
        if (press !== started) return;
        press = null;
        held = started.id;
        swallowing = true;
        handler(started.target, started.x, started.y);
      }, LONG_PRESS_MS),
    };
    press = started;
  };
  const onMove = (event: PointerEvent): void => {
    if (press?.id === event.pointerId && Math.hypot(event.clientX - press.x, event.clientY - press.y) >= LONG_PRESS_TRAVEL) drop();
  };
  const onUp = (event: PointerEvent): void => {
    down.delete(event.pointerId);
    if (press?.id === event.pointerId) drop();
    if (held === event.pointerId) {
      held = null;
      swallowUntil = Date.now() + SWALLOW_MS;
    }
  };
  const onCancel = (event: PointerEvent): void => {
    onUp(event);
    drop();
  };
  const swallow = (event: Event): void => {
    if (!swallowing) return;
    // a click a key made (Enter or Space on a button: detail 0) is never the release's
    if (event.type === 'click' && (event as MouseEvent).detail === 0) return;
    if (held === null && Date.now() > swallowUntil) {
      swallowing = false;
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    // the release makes one click: once it is gone, nothing else is taken
    if (event.type === 'click') swallowing = false;
  };

  /** A key pressed once the hold is let go: what follows is the keyboard's, and nothing is left to swallow. */
  const onKey = (): void => {
    if (held === null) swallowing = false;
  };
  const capture = { capture: true } as const;
  win.addEventListener('keydown', onKey, capture);
  win.addEventListener('pointerdown', onDown, capture);
  win.addEventListener('pointermove', onMove, capture);
  win.addEventListener('pointerup', onUp, capture);
  win.addEventListener('pointercancel', onCancel, capture);
  win.addEventListener('click', swallow, capture);
  win.addEventListener('contextmenu', swallow, capture);
  return () => {
    drop();
    win.removeEventListener('keydown', onKey, capture);
    win.removeEventListener('pointerdown', onDown, capture);
    win.removeEventListener('pointermove', onMove, capture);
    win.removeEventListener('pointerup', onUp, capture);
    win.removeEventListener('pointercancel', onCancel, capture);
    win.removeEventListener('click', swallow, capture);
    win.removeEventListener('contextmenu', swallow, capture);
  };
}
