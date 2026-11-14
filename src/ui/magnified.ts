// A notice shown while the page itself is magnified (a pinch the browser did not let us refuse, or
// one restored with the page). The game fills the window, so a magnified page has its edges cut off
// and nothing to scroll back to; a script cannot undo it, so the player is told the key that does,
// or under a finger (data-pointer="coarse" on <html>, src/ui/touch.ts) the pinch that does. While
// the page is magnified, <html> carries data-magnified and the game lets that pinch through: the
// stylesheet gives every element the browser's own pinch, and two-finger touches and Safari's
// gestures are kept from the game's handlers, which would take them for a zoom of the map.

/** Magnification below this is taken for none: browsers report 1 with a little rounding. */
const MAGNIFIED_FROM = 1.005;

export const MAGNIFIED_TEXT = 'The page is magnified, so its edges are cut off. Press Ctrl+0 (Cmd+0 on a Mac) to set it right.';
export const MAGNIFIED_TOUCH_TEXT = 'The page is magnified, so its edges are cut off. Pinch it back with two fingers to set it right.';

export function createMagnifiedNotice(): { element: HTMLElement; stop(): void } {
  const element = document.createElement('p');
  element.className = 'magnified-notice';
  element.setAttribute('role', 'status');
  element.hidden = true;
  const root = document.documentElement;
  const words = (): void => {
    const text = root.getAttribute('data-pointer') === 'coarse' ? MAGNIFIED_TOUCH_TEXT : MAGNIFIED_TEXT;
    if (element.textContent !== text) element.textContent = text;
  };
  words();
  // the first touch turns the pointer coarse, magnified or not
  const pointer = new MutationObserver(words);
  pointer.observe(root, { attributes: true, attributeFilter: ['data-pointer'] });
  const viewport = window.visualViewport;
  let magnified = false;
  /** Seen on the window before any element hears it: while magnified, a pinch is the browser's. */
  const letPinchThrough = (event: Event): void => {
    if (!magnified) return;
    if (event.type.startsWith('touch') && (event as TouchEvent).touches.length < 2) return;
    event.stopImmediatePropagation();
  };
  const PINCH_EVENTS = ['touchstart', 'touchmove', 'gesturestart', 'gesturechange', 'gestureend'] as const;
  for (const type of PINCH_EVENTS) window.addEventListener(type, letPinchThrough, { capture: true, passive: true });
  const update = (): void => {
    words();
    if (!viewport) return;
    magnified = viewport.scale >= MAGNIFIED_FROM;
    root.toggleAttribute('data-magnified', magnified);
    element.hidden = !magnified;
    // kept in the part of the page that is in sight
    element.style.left = `${viewport.offsetLeft + viewport.width / 2}px`;
    element.style.top = `${viewport.offsetTop + 8 / viewport.scale}px`;
  };
  viewport?.addEventListener('resize', update);
  viewport?.addEventListener('scroll', update);
  update();
  return {
    element,
    stop() {
      pointer.disconnect();
      for (const type of PINCH_EVENTS) window.removeEventListener(type, letPinchThrough, { capture: true });
      magnified = false;
      root.removeAttribute('data-magnified');
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
    },
  };
}
