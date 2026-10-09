// A notice shown while the page itself is magnified (a pinch the browser did not let us refuse, or
// one restored with the page). The game fills the window, so a magnified page has its edges cut off
// and nothing to scroll back to; a script cannot undo it, so the player is told the key that does.

/** Magnification below this is taken for none: browsers report 1 with a little rounding. */
const MAGNIFIED_FROM = 1.005;

export const MAGNIFIED_TEXT = 'The page is magnified, so its edges are cut off. Press Ctrl+0 (Cmd+0 on a Mac) to set it right.';

export function createMagnifiedNotice(): { element: HTMLElement; stop(): void } {
  const element = document.createElement('p');
  element.className = 'magnified-notice';
  element.setAttribute('role', 'status');
  element.textContent = MAGNIFIED_TEXT;
  element.hidden = true;
  const viewport = window.visualViewport;
  const update = (): void => {
    if (!viewport) return;
    element.hidden = viewport.scale < MAGNIFIED_FROM;
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
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
    },
  };
}
