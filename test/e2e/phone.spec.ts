import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { MAGNIFIED_TEXT, MAGNIFIED_TOUCH_TEXT } from '../../src/ui/magnified';
import { foundJamestown, settled, startNewGame } from './helpers';
import { POSTURES, SMALL_POSTURES, tap } from './postures';

// The page on a phone (R-1071, docs/specs/phone-play.md W1).

/** The box of every element a selector matches, rounded to whole pixels, keyed by what it is. */
async function boxes(page: Page, selector: string): Promise<string[]> {
  return page.locator(selector).evaluateAll((nodes) =>
    nodes.map((node) => {
      const r = node.getBoundingClientRect();
      const name = (node.getAttribute('data-command') ?? node.className) || node.tagName.toLowerCase();
      return `${name}: ${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`;
    }),
  );
}

/** Text is laid out a pixel or two differently from one platform's font rendering to another's. */
const BOX_TOLERANCE = 2;
/** Boxes as wide as a run of text that moves by more than BOX_TOLERANCE between platforms: their width is not compared. */
const TEXT_WIDTH = new Set(['europe-gold']);
const BOXES_FILE = 'test/e2e/__snapshots__/phone.spec.ts/desktop-boxes.json';

/** Each box measured matches the one recorded, by name and in order, every number within BOX_TOLERANCE. */
function expectBoxes(measured: Record<string, string[]>, recorded: Record<string, string[]>): void {
  const parse = (line: string): { name: string; numbers: number[] } => {
    const found = /^(.*): (-?\d+),(-?\d+) (\d+)x(\d+)$/.exec(line);
    if (!found) throw new Error(`not a box: ${line}`);
    return { name: found[1]!, numbers: found.slice(2).map(Number) };
  };
  expect(Object.keys(measured)).toEqual(Object.keys(recorded));
  for (const [screen, lines] of Object.entries(recorded)) {
    const now = measured[screen]!.map(parse);
    const then = lines.map(parse);
    expect(now.map((box) => box.name), screen).toEqual(then.map((box) => box.name));
    then.forEach((box, i) => {
      const [x, y, width, height] = now[i]!.numbers as [number, number, number, number];
      const [x0, y0, width0, height0] = box.numbers as [number, number, number, number];
      const off = [x - x0, y - y0, TEXT_WIDTH.has(box.name) ? 0 : width - width0, height - height0];
      expect(Math.max(...off.map(Math.abs)), `${screen} ${box.name}: ${measured[screen]![i]} was ${lines[i]}`).toBeLessThanOrEqual(BOX_TOLERANCE);
    });
  }
}

// The measure of "as it is today" for the full layout: recorded on main's code before any of the
// phone work, and never changed by it. --update-snapshots records it again.
test.describe('the full layout at 1280 x 800', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('keeps the boxes of the map, colony and Europe screens as they were', async ({ page }) => {
    await foundJamestown(page);
    await settled(page);
    const colony = await boxes(page, '.colony-screen, .colony-screen > *, .colony-screen > * > *');
    await page.keyboard.press('Escape');
    await expect(page.locator('.colony-screen')).toHaveCount(0);
    await settled(page);
    const map = await boxes(page, '.sidebar, .sidebar > *, .minimap, .command-bar, .command-bar button');
    await page.keyboard.press('e');
    const europe = page.locator('.europe-screen');
    await expect(europe).toBeVisible();
    await settled(page);
    const harbour = await boxes(page, '.europe-screen, .europe-screen > *, .europe-screen > * > *');
    const measured = { map, colony, europe: harbour };
    if (test.info().config.updateSnapshots === 'all') writeFileSync(BOXES_FILE, JSON.stringify(measured, null, 2));
    expectBoxes(measured, JSON.parse(readFileSync(BOXES_FILE, 'utf8')) as Record<string, string[]>);
  });
});

const root = (page: Page) => page.locator('html');

test.describe('the attributes on <html>', () => {
  test('are there before the title screen paints, and follow the window', async ({ page }) => {
    // read at the moment the title screen is put on the page: a microtask later, still before any paint
    await page.addInitScript(() => {
      const seen: string[][] = [];
      (window as unknown as { titleSeen: typeof seen }).titleSeen = seen;
      const watch = new MutationObserver(() => {
        if (!document.querySelector('.title-screen')) return;
        watch.disconnect();
        const html = document.documentElement;
        seen.push(['data-layout', 'data-posture', 'data-pointer'].map((name) => String(html.getAttribute(name))));
      });
      watch.observe(document, { childList: true, subtree: true });
    });
    await page.goto('/');
    await expect(page.getByRole('menuitem').first()).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { titleSeen: unknown }).titleSeen)).toEqual([['full', 'sideways', 'fine']]);
    await page.setViewportSize(POSTURES.phoneUpright);
    await expect(root(page)).toHaveAttribute('data-layout', 'compact');
    await expect(root(page)).toHaveAttribute('data-posture', 'upright');
    await page.setViewportSize({ width: 1280, height: 639 });
    await expect(root(page)).toHaveAttribute('data-layout', 'compact');
    await expect(root(page)).toHaveAttribute('data-posture', 'sideways');
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(root(page)).toHaveAttribute('data-layout', 'full');
    await expect(root(page)).toHaveAttribute('data-pointer', 'fine');
  });
});

test.describe('the page, as text', () => {
  test('asks for the whole screen, names the game for the home screen and keeps its bars dark', async ({ page }) => {
    await page.goto('/');
    expect(await page.locator('meta[name="viewport"]').getAttribute('content')).toContain('viewport-fit=cover');
    expect(await page.locator('meta[name="apple-mobile-web-app-title"]').getAttribute('content')).toBe('New World');
    expect(await page.locator('meta[name="apple-mobile-web-app-status-bar-style"]').getAttribute('content')).toBe('black-translucent');
    const manifest = (await (await page.request.get('/manifest.webmanifest')).json()) as { orientation: string };
    expect(manifest.orientation).toBe('any');
    const style = await page.evaluate(() => {
      const app = getComputedStyle(document.querySelector('#app')!);
      const html = getComputedStyle(document.documentElement);
      const field = document.createElement('input');
      document.body.append(field);
      const typed = getComputedStyle(field).userSelect;
      field.remove();
      return { touch: app.touchAction, overscroll: html.overscrollBehaviorY, select: app.userSelect, field: typed, tap: html.getPropertyValue('--tap').trim() };
    });
    expect(style).toEqual({ touch: 'manipulation', overscroll: 'none', select: 'none', field: 'text', tap: '44px' });
  });
});

/** Neither way can the document scroll: nothing in it reaches past the window. */
async function expectNoPageScroll(page: Page): Promise<void> {
  const sizes = await page.evaluate(() => {
    const doc = document.scrollingElement ?? document.documentElement;
    return { width: doc.scrollWidth, height: doc.scrollHeight, inner: [innerWidth, innerHeight], at: [scrollX, scrollY] };
  });
  expect(sizes.width, 'page scroll width').toBeLessThanOrEqual(sizes.inner[0]!);
  expect(sizes.height, 'page scroll height').toBeLessThanOrEqual(sizes.inner[1]!);
  expect(sizes.at).toEqual([0, 0]);
}

for (const [set, sizes] of [['', POSTURES], ['40 px smaller, ', SMALL_POSTURES]] as const) {
  for (const [name, viewport] of Object.entries(sizes)) {
    test.describe(`${set}${name} (${viewport.width} x ${viewport.height})`, () => {
      test.use({ viewport, hasTouch: true });

      test('the title screen loads and a game starts by taps alone, and the page never scrolls', async ({ page }) => {
        await page.goto('/?seed=7');
        await expect(root(page)).toHaveAttribute('data-layout', 'compact');
        await expect(root(page)).toHaveAttribute('data-posture', viewport.height > viewport.width ? 'upright' : 'sideways');
        const start = page.getByRole('menuitem', { name: 'Start a Game in New World' });
        await expect(start).toBeVisible();
        await expectNoPageScroll(page);
        await tap(page, start);
        await expect(root(page)).toHaveAttribute('data-pointer', 'coarse');
        const power = page.locator('.power');
        await expect(power.getByRole('radiogroup')).toBeVisible();
        await expectNoPageScroll(page);
        await tap(page, power.getByRole('button', { name: 'Set Sail' }));
        const audience = page.getByRole('dialog').filter({ hasText: 'An audience with' });
        await expectNoPageScroll(page);
        await tap(page, audience.getByRole('button', { name: 'So be it' }));
        await expect(page.locator('canvas.map')).toHaveAttribute('data-frames', /\d+/);
        await expect(audience).toHaveCount(0);
        await expectNoPageScroll(page);
      });
    });
  }
}

test.describe('the magnified-page notice', () => {
  test('tells a mouse the key, and once a finger has touched the page, the pinch', async ({ page }) => {
    await page.goto('/?seed=7');
    await startNewGame(page);
    await expect(root(page)).toHaveAttribute('data-pointer', 'fine');
    const notice = page.locator('.magnified-notice');
    await expect(notice).toHaveText(MAGNIFIED_TEXT);
    await tap(page, page.locator('canvas.map'));
    await expect(root(page)).toHaveAttribute('data-pointer', 'coarse');
    await expect(notice).toHaveText(MAGNIFIED_TOUCH_TEXT);
  });

  test.describe('on a phone', () => {
    test.use({ viewport: POSTURES.duoInnerSideways, hasTouch: true });

    test('tells a finger to pinch the page back from the start, and lets that pinch through', async ({ page }) => {
      await page.goto('/?seed=7');
      await startNewGame(page);
      // the browser says the pointer is coarse: no touch has been felt yet
      await expect(root(page)).toHaveAttribute('data-pointer', 'coarse');
      const notice = page.locator('.magnified-notice');
      await expect(notice).toHaveText(MAGNIFIED_TOUCH_TEXT);
      const canvas = page.locator('canvas.map');
      /** Whether a two-finger pinch and Safari's gesture over the map are left to the browser, and the map's touch-action. */
      const pinchIsTheBrowsers = (): Promise<[boolean, boolean, string]> =>
        canvas.evaluate((node) => {
          const at = (id: number, x: number): Touch => new Touch({ identifier: id, target: node, clientX: x, clientY: 100 });
          const touches = [at(0, 100), at(1, 200)];
          const move = new TouchEvent('touchmove', { touches, targetTouches: touches, changedTouches: touches, bubbles: true, cancelable: true });
          const gesture = new Event('gesturestart', { bubbles: true, cancelable: true });
          return [node.dispatchEvent(move), node.dispatchEvent(gesture), getComputedStyle(node).touchAction];
        });
      expect(await pinchIsTheBrowsers()).toEqual([false, false, 'none']);
      // no test can pinch the page: stand in for the browser's report of it
      const magnify = (scale: number): Promise<void> =>
        page.evaluate((s) => {
          Object.defineProperty(window.visualViewport!, 'scale', { configurable: true, get: () => s });
          window.visualViewport!.dispatchEvent(new Event('resize'));
        }, scale);
      await magnify(1.5);
      await expect(notice).toBeVisible();
      await expect(root(page)).toHaveAttribute('data-magnified', '');
      expect(await pinchIsTheBrowsers()).toEqual([true, true, 'manipulation']);
      await magnify(1);
      await expect(notice).toBeHidden();
      await expect(root(page)).not.toHaveAttribute('data-magnified');
      expect(await pinchIsTheBrowsers()).toEqual([false, false, 'none']);
    });
  });
});
