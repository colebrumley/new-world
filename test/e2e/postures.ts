import type { CDPSession, Locator, Page } from '@playwright/test';

// The screens planned for (docs/specs/phone-play.md, "Rules and sources"), and touches sent as
// real touch input through the browser's debugging protocol. A test opts in with
// `test.use({ viewport: POSTURES.x, hasTouch: true })`, and each touch test begins by expecting
// data-pointer="coarse" on <html> after its first tap.

export interface Size {
  readonly width: number;
  readonly height: number;
}

export const POSTURES = {
  duoCoverUpright: { width: 466, height: 678 },
  duoCoverSideways: { width: 678, height: 466 },
  duoInnerUpright: { width: 626, height: 890 },
  duoInnerSideways: { width: 890, height: 626 },
  phoneUpright: { width: 393, height: 852 },
  phoneSideways: { width: 852, height: 393 },
} as const satisfies Record<string, Size>;
export type PostureName = keyof typeof POSTURES;

/** Each posture 40 px smaller both ways: a browser's bars take some of the window, so layouts are written for ranges. */
export const SMALL_POSTURES = Object.fromEntries(
  Object.entries(POSTURES).map(([name, { width, height }]) => [name, { width: width - 40, height: height - 40 }]),
) as { readonly [K in PostureName]: Size };

/** Where a touch lands: a point in the window's CSS pixels, or the middle of an element. */
export type Where = Locator | { readonly x: number; readonly y: number };

const sessions = new WeakMap<Page, Promise<CDPSession>>();
function session(page: Page): Promise<CDPSession> {
  let found = sessions.get(page);
  if (!found) {
    found = page.context().newCDPSession(page);
    sessions.set(page, found);
  }
  return found;
}

async function point(where: Where): Promise<{ x: number; y: number }> {
  if (!('boundingBox' in where)) return { x: where.x, y: where.y };
  await where.scrollIntoViewIfNeeded();
  const box = await where.boundingBox();
  if (!box) throw new Error(`nothing to touch: ${String(where)} has no box`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

type Finger = { x: number; y: number; id: number };
async function touch(page: Page, type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel', fingers: readonly Finger[]): Promise<void> {
  const cdp = await session(page);
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: fingers.map(({ x, y, id }) => ({ x, y, id, radiusX: 4, radiusY: 4, force: 1 })) });
}

const between = (a: { x: number; y: number }, b: { x: number; y: number }, t: number): { x: number; y: number } => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** One finger down and up again at once, without moving. */
export async function tap(page: Page, where: Where): Promise<void> {
  const at = await point(where);
  await touch(page, 'touchStart', [{ ...at, id: 0 }]);
  await touch(page, 'touchEnd', []);
}

/** One finger down at `from`, held `hold` ms, moved in `steps` even steps to `to`, and lifted (unless `lift` is false). */
export async function touchDrag(page: Page, from: Where, to: Where, { steps = 10, hold = 0, lift = true }: { steps?: number; hold?: number; lift?: boolean } = {}): Promise<void> {
  const a = await point(from);
  const b = await point(to);
  await touch(page, 'touchStart', [{ ...a, id: 0 }]);
  if (hold > 0) await page.waitForTimeout(hold);
  for (let i = 1; i <= steps; i++) await touch(page, 'touchMove', [{ ...between(a, b, i / steps), id: 0 }]);
  if (lift) await touch(page, 'touchEnd', []);
}

/** One finger held still for `hold` ms (well past the long press's 500), then lifted (unless `lift` is false). */
export async function longPress(page: Page, where: Where, { hold = 700, lift = true }: { hold?: number; lift?: boolean } = {}): Promise<void> {
  const at = await point(where);
  await touch(page, 'touchStart', [{ ...at, id: 0 }]);
  await page.waitForTimeout(hold);
  if (lift) await touch(page, 'touchEnd', []);
}

/**
 * Two fingers either side of `centre`, level with it, moved from `from` px apart to `to` px apart
 * in `steps` even steps, and lifted: `to` greater than `from` spreads them (zooms in).
 */
export async function pinch(page: Page, centre: Where, { from, to, steps = 10 }: { from: number; to: number; steps?: number }): Promise<void> {
  const c = await point(centre);
  const fingers = (gap: number): Finger[] => [
    { x: c.x - gap / 2, y: c.y, id: 0 },
    { x: c.x + gap / 2, y: c.y, id: 1 },
  ];
  await touch(page, 'touchStart', fingers(from));
  for (let i = 1; i <= steps; i++) await touch(page, 'touchMove', fingers(from + ((to - from) * i) / steps));
  await touch(page, 'touchEnd', []);
}
