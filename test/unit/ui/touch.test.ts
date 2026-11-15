import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LONG_PRESS_MS, LONG_PRESS_TRAVEL, LOOK_UP, layoutOf, onLongPress, panelOf, watchScreen } from '../../../src/ui/touch';

describe('the layout a window calls for', () => {
  it('is compact below 760 wide or 640 high, full otherwise', () => {
    expect(layoutOf(759, 800)).toEqual({ layout: 'compact', posture: 'upright' });
    expect(layoutOf(760, 800)).toEqual({ layout: 'full', posture: 'upright' });
    expect(layoutOf(1280, 639)).toEqual({ layout: 'compact', posture: 'sideways' });
    expect(layoutOf(1280, 640)).toEqual({ layout: 'full', posture: 'sideways' });
    expect(layoutOf(759, 639).layout).toBe('compact');
  });

  it('is upright only when taller than wide: a square window is sideways', () => {
    expect(layoutOf(700, 700)).toEqual({ layout: 'compact', posture: 'sideways' });
    expect(layoutOf(800, 800)).toEqual({ layout: 'full', posture: 'sideways' });
    expect(layoutOf(700, 701).posture).toBe('upright');
  });

  it('holds the constants the spec names', () => {
    expect([LONG_PRESS_MS, LONG_PRESS_TRAVEL, LOOK_UP]).toEqual([500, 10, 'lookup']);
  });
});

// Unit tests run without a DOM: a window is an EventTarget, an element is told by what it contains.
interface FakeElement {
  readonly name: string;
  readonly ownerDocument: { defaultView: EventTarget };
  contains(node: unknown): boolean;
}
function page(): { win: EventTarget; element: FakeElement; inside: FakeElement; outside: FakeElement } {
  const win = new EventTarget();
  const doc = { defaultView: win };
  const inside: FakeElement = { name: 'inside', ownerDocument: doc, contains: (n) => n === inside };
  const element: FakeElement = { name: 'element', ownerDocument: doc, contains: (n) => n === element || n === inside };
  const outside: FakeElement = { name: 'outside', ownerDocument: doc, contains: (n) => n === outside };
  return { win, element, inside, outside };
}
function send(win: EventTarget, type: string, target: unknown, fields: Record<string, unknown> = {}): Event {
  const event = Object.assign(new Event(type, { cancelable: true }), { pointerId: 1, pointerType: 'touch', clientX: 0, clientY: 0, isPrimary: true, ...fields });
  Object.defineProperty(event, 'target', { value: target });
  win.dispatchEvent(event);
  return event;
}

describe('the panel beside or under the map', () => {
  const part = (left: number, top: number, width: number, height: number) => ({ left, top, width, height });

  it('is kept at the right of a compact window lying sideways with room for it, and nowhere else without a fold', () => {
    expect(panelOf(890, 626)).toEqual({ place: 'side', form: 'column', fold: null });
    expect(panelOf(850, 586)).toEqual({ place: 'side', form: 'column', fold: null });
    expect(panelOf(760, 540)).toEqual({ place: 'side', form: 'column', fold: null });
    expect(panelOf(759, 540)).toBeNull();
    expect(panelOf(852, 393)).toBeNull(); // a phone on its side: too low
    expect(panelOf(626, 890)).toBeNull(); // upright
    expect(panelOf(1280, 800)).toBeNull(); // the full layout has its sidebar already
    expect(panelOf(890, 626, [part(0, 0, 890, 626)])).toEqual({ place: 'side', form: 'column', fold: null });
  });

  it('follows a fold: the map in the first part, the panel in the second', () => {
    expect(panelOf(890, 626, [part(0, 0, 445, 626), part(445, 0, 445, 626)])).toEqual({ place: 'side', form: 'column', fold: { map: 445, gap: 0 } });
    expect(panelOf(914, 626, [part(0, 0, 445, 626), part(469, 0, 445, 626)])).toEqual({ place: 'side', form: 'column', fold: { map: 445, gap: 24 } });
    expect(panelOf(626, 890, [part(0, 0, 626, 445), part(0, 445, 626, 445)])).toEqual({ place: 'below', form: 'spread', fold: { map: 445, gap: 0 } });
    // in the full layout too
    expect(panelOf(1280, 800, [part(0, 0, 640, 800), part(640, 0, 640, 800)])).toEqual({ place: 'side', form: 'column', fold: { map: 640, gap: 0 } });
    // a part too small to hold the map or the panel is no fold to heed
    expect(panelOf(500, 800, [part(0, 0, 250, 800), part(250, 0, 250, 800)])).toBeNull();
    expect(panelOf(890, 626, [part(0, 0, 200, 626), part(200, 0, 690, 626)])).toEqual({ place: 'side', form: 'column', fold: null });
    // three parts are not ours to divide
    expect(panelOf(900, 400, [part(0, 0, 300, 400), part(300, 0, 300, 400), part(600, 0, 300, 400)])).toBeNull();
  });
});

describe('the long press', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const setup = () => {
    const p = page();
    const handler = vi.fn();
    const stop = onLongPress(p.element as unknown as Element, handler);
    return { ...p, handler, stop };
  };

  it('fires at 500 ms held still, with where the touch went down, and not at 499', () => {
    const { win, inside, handler } = setup();
    send(win, 'pointerdown', inside, { clientX: 30, clientY: 40 });
    vi.advanceTimersByTime(499);
    expect(handler).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(handler).toHaveBeenCalledExactlyOnceWith(inside, 30, 40);
    vi.advanceTimersByTime(2000);
    expect(handler).toHaveBeenCalledOnce();
  });

  it('fires for a pen, never for a mouse, never for a touch outside the element', () => {
    const { win, inside, outside, handler } = setup();
    send(win, 'pointerdown', inside, { pointerType: 'mouse' });
    vi.advanceTimersByTime(1000);
    send(win, 'pointerup', inside, { pointerType: 'mouse' });
    send(win, 'pointerdown', outside);
    vi.advanceTimersByTime(1000);
    send(win, 'pointerup', outside);
    expect(handler).not.toHaveBeenCalled();
    send(win, 'pointerdown', inside, { pointerType: 'pen' });
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(handler).toHaveBeenCalledOnce();
  });

  it('lets a touch travel under 10 px, and stops at 10', () => {
    const { win, inside, handler } = setup();
    send(win, 'pointerdown', inside, { clientX: 100, clientY: 100 });
    send(win, 'pointermove', inside, { clientX: 106, clientY: 107 }); // 9.2 px
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(handler).toHaveBeenCalledOnce();
    send(win, 'pointerup', inside);

    send(win, 'pointerdown', inside, { clientX: 100, clientY: 100 });
    send(win, 'pointermove', inside, { clientX: 110, clientY: 100 });
    send(win, 'pointermove', inside, { clientX: 100, clientY: 100 }); // back again: too late
    vi.advanceTimersByTime(LONG_PRESS_MS * 2);
    expect(handler).toHaveBeenCalledOnce();
  });

  it('is stopped by a second pointer, wherever it lands, and by a pointercancel', () => {
    const { win, inside, outside, handler } = setup();
    send(win, 'pointerdown', inside);
    vi.advanceTimersByTime(200);
    send(win, 'pointerdown', outside, { pointerId: 2, isPrimary: false });
    send(win, 'pointerup', outside, { pointerId: 2, isPrimary: false });
    vi.advanceTimersByTime(1000);
    expect(handler).not.toHaveBeenCalled();
    send(win, 'pointerup', inside);

    send(win, 'pointerdown', inside);
    vi.advanceTimersByTime(300);
    send(win, 'pointercancel', inside);
    vi.advanceTimersByTime(1000);
    expect(handler).not.toHaveBeenCalled();
  });

  it('is stopped by a mouse button pressed during the hold, though each is the first of its kind', () => {
    const { win, inside, outside, handler } = setup();
    send(win, 'pointerdown', inside);
    vi.advanceTimersByTime(200);
    send(win, 'pointerdown', outside, { pointerId: 9, pointerType: 'mouse' });
    vi.advanceTimersByTime(1000);
    expect(handler).not.toHaveBeenCalled();
  });

  it('starts afresh after a touch whose release never came, timing the new one from its own start', () => {
    const { win, inside, handler } = setup();
    send(win, 'pointerdown', inside, { pointerId: 1 });
    vi.advanceTimersByTime(200);
    send(win, 'pointerdown', inside, { pointerId: 2, clientX: 5, clientY: 6 });
    vi.advanceTimersByTime(LONG_PRESS_MS - 1);
    expect(handler).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(handler).toHaveBeenCalledExactlyOnceWith(inside, 5, 6);
  });

  it('is not a long press when lifted sooner, and that release keeps its click', () => {
    const { win, inside, handler } = setup();
    send(win, 'pointerdown', inside);
    vi.advanceTimersByTime(300);
    send(win, 'pointerup', inside);
    expect(send(win, 'click', inside).defaultPrevented).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(handler).not.toHaveBeenCalled();
  });

  it('swallows the click and the contextmenu of the release that follows it, and nothing after', () => {
    const { win, inside, handler } = setup();
    const heard = vi.fn();
    win.addEventListener('click', heard);
    win.addEventListener('contextmenu', heard);
    send(win, 'pointerdown', inside);
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(handler).toHaveBeenCalledOnce();
    expect(send(win, 'contextmenu', inside).defaultPrevented).toBe(true);
    send(win, 'pointerup', inside);
    expect(send(win, 'click', inside).defaultPrevented).toBe(true);
    expect(heard).not.toHaveBeenCalled();
    // the next tap's click is its own
    send(win, 'pointerdown', inside);
    send(win, 'pointerup', inside);
    expect(send(win, 'click', inside).defaultPrevented).toBe(false);
    expect(heard).toHaveBeenCalledOnce();
  });

  it('never swallows a click a key made, or one after a key was pressed, though the release made none', () => {
    const { win, inside, handler } = setup();
    // a hold that travelled after it fired (a drag): its release makes no click, and swallowing waits for one
    send(win, 'pointerdown', inside);
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(handler).toHaveBeenCalledOnce();
    send(win, 'pointermove', inside, { clientX: 40 });
    send(win, 'pointerup', inside, { clientX: 40 });
    // Enter on a prompt's OK button: a click with detail 0
    expect(send(win, 'click', inside, { detail: 0 }).defaultPrevented).toBe(false);
    // and after a key is pressed, a click is the keyboard's too
    send(win, 'keydown', inside);
    expect(send(win, 'click', inside).defaultPrevented).toBe(false);
  });

  it('is removed by the function it returns, a press under way included', () => {
    const { win, inside, handler, stop } = setup();
    send(win, 'pointerdown', inside);
    vi.advanceTimersByTime(200);
    stop();
    vi.advanceTimersByTime(1000);
    send(win, 'pointerdown', inside);
    vi.advanceTimersByTime(1000);
    expect(handler).not.toHaveBeenCalled();
  });
});

/** A stand-in for <html>: its attributes in `attributes`, its inline custom properties in the map returned as `style.set`. */
function fakeRoot(attributes: Map<string, string>, properties = new Map<string, string>()) {
  return {
    getAttribute: (n: string) => attributes.get(n) ?? null,
    setAttribute: (n: string, v: string) => attributes.set(n, v),
    removeAttribute: (n: string) => attributes.delete(n),
    style: { setProperty: (n: string, v: string) => properties.set(n, v), removeProperty: (n: string) => properties.delete(n) },
  };
}

describe('the attributes on <html>', () => {
  it('tell of the panel, and of a fold where the browser tells its parts, and forget both when they go', () => {
    const posture = new EventTarget();
    const viewport: { segments: { left: number; top: number; width: number; height: number }[] | null } = { segments: null };
    const win = Object.assign(new EventTarget(), { innerWidth: 890, innerHeight: 626, matchMedia: () => ({ matches: true }), navigator: { devicePosture: posture }, viewport });
    const attributes = new Map<string, string>();
    const properties = new Map<string, string>();
    const stop = watchScreen(fakeRoot(attributes, properties) as unknown as HTMLElement, win as unknown as Window);
    expect(Object.fromEntries(attributes)).toMatchObject({ 'data-layout': 'compact', 'data-panel': 'side', 'data-panel-form': 'column' });
    expect(attributes.has('data-fold')).toBe(false);
    expect(properties.size).toBe(0);
    // half folded: no change of size, only of posture
    viewport.segments = [{ left: 0, top: 0, width: 433, height: 626 }, { left: 457, top: 0, width: 433, height: 626 }];
    posture.dispatchEvent(new Event('change'));
    expect(attributes.get('data-fold')).toBe('');
    expect(Object.fromEntries(properties)).toEqual({ '--fold-map': '433px', '--fold-gap': '24px' });
    // turned upright, still folded: the panel goes under the map
    Object.assign(win, { innerWidth: 626, innerHeight: 890 });
    viewport.segments = [{ left: 0, top: 0, width: 626, height: 445 }, { left: 0, top: 445, width: 626, height: 445 }];
    win.dispatchEvent(new Event('resize'));
    expect(Object.fromEntries(attributes)).toMatchObject({ 'data-panel': 'below', 'data-panel-form': 'spread', 'data-fold': '' });
    expect(Object.fromEntries(properties)).toEqual({ '--fold-map': '445px', '--fold-gap': '0px' });
    // laid flat
    viewport.segments = null;
    posture.dispatchEvent(new Event('change'));
    expect(['data-panel', 'data-panel-form', 'data-fold'].some((name) => attributes.has(name))).toBe(false);
    expect(properties.size).toBe(0);
    stop();
    viewport.segments = [{ left: 0, top: 0, width: 626, height: 445 }, { left: 0, top: 445, width: 626, height: 445 }];
    posture.dispatchEvent(new Event('change'));
    expect(attributes.has('data-panel')).toBe(false);
  });

  it('are set at once, follow the window, and turn coarse at the first touch', () => {
    const win = Object.assign(new EventTarget(), { innerWidth: 1280, innerHeight: 800, matchMedia: () => ({ matches: false }) });
    const attributes = new Map<string, string>();
    const root = fakeRoot(attributes);
    const stop = watchScreen(root as unknown as HTMLElement, win as unknown as Window);
    expect(Object.fromEntries(attributes)).toEqual({ 'data-layout': 'full', 'data-posture': 'sideways', 'data-pointer': 'fine' });
    Object.assign(win, { innerWidth: 393, innerHeight: 852 });
    win.dispatchEvent(new Event('resize'));
    expect(Object.fromEntries(attributes)).toMatchObject({ 'data-layout': 'compact', 'data-posture': 'upright' });
    send(win, 'pointerdown', null, { pointerType: 'mouse' });
    expect(attributes.get('data-pointer')).toBe('fine');
    send(win, 'pointerdown', null, { pointerType: 'touch' });
    expect(attributes.get('data-pointer')).toBe('coarse');
    stop();
    Object.assign(win, { innerWidth: 1280, innerHeight: 800 });
    win.dispatchEvent(new Event('resize'));
    expect(attributes.get('data-layout')).toBe('compact');
  });

  it('is coarse from the start where the browser says the pointer is', () => {
    const win = Object.assign(new EventTarget(), { innerWidth: 466, innerHeight: 678, matchMedia: () => ({ matches: true }) });
    const attributes = new Map<string, string>();
    const root = fakeRoot(attributes);
    watchScreen(root as unknown as HTMLElement, win as unknown as Window)();
    expect(attributes.get('data-pointer')).toBe('coarse');
  });
});
