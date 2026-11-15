import { expect, test, type Locator, type Page } from '@playwright/test';
import { field, foundJamestown, settled, startNewGame } from './helpers';
import { pinch, POSTURES, SMALL_POSTURES, tap, type Size } from './postures';

// The dock: the map screen in the compact layout (R-1072, docs/specs/phone-play.md W2).

interface ViewData {
  zoom: number;
  tileSize: number;
  originX: number;
  originY: number;
  width: number;
  height: number;
}
type Box = { x: number; y: number; width: number; height: number };

const html = (page: Page): Locator => page.locator('html');
const canvasOf = (page: Page): Locator => page.locator('canvas.map');
const dockButton = (page: Page, id: string): Locator => page.locator(`.dock [data-dock-command="${id}"]`);
const sheet = (page: Page): Locator => page.locator('.sheet');
const viewOf = (page: Page): Promise<ViewData> => canvasOf(page).evaluate((c) => JSON.parse((c as HTMLCanvasElement).dataset['view']!) as ViewData);
const boxOf = async (locator: Locator): Promise<Box> => {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`${String(locator)} has no box`);
  return box;
};
const inside = (inner: Box, outer: Box): boolean =>
  inner.x >= outer.x - 0.5 && inner.y >= outer.y - 0.5 && inner.x + inner.width <= outer.x + outer.width + 0.5 && inner.y + inner.height <= outer.y + outer.height + 0.5;

/** Where the active unit stands, as the sidebar (shown or not) tells it. */
async function spot(page: Page): Promise<{ x: number; y: number } | null> {
  const text = (await field(page, 'location').textContent()) ?? '';
  const [x, y] = text.match(/\d+/g)?.map(Number) ?? [];
  return x === undefined || y === undefined ? null : { x, y };
}

/** The middle of a map square, in the window's CSS pixels. */
async function squareAt(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  const v = await viewOf(page);
  const c = await boxOf(canvasOf(page));
  return { x: c.x + (x - v.originX + 0.5) * v.tileSize, y: c.y + (y - v.originY + 0.5) * v.tileSize };
}

/** Every element `locator` matches lies inside the window. */
async function allInWindow(page: Page, locator: Locator, what: string): Promise<void> {
  const size = page.viewportSize()!;
  const window = { x: 0, y: 0, width: size.width, height: size.height };
  const count = await locator.count();
  expect(count, what).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    const box = await boxOf(locator.nth(i));
    expect(inside(box, window), `${what} #${i} ${JSON.stringify(box)} in ${size.width} x ${size.height}`).toBe(true);
  }
}

async function begin(page: Page, query = ''): Promise<void> {
  await page.goto(`/?seed=7${query}`);
  await startNewGame(page);
  await settled(page);
}

for (const [set, sizes] of [['', POSTURES], ['40 px smaller, ', SMALL_POSTURES]] as const) {
  for (const [name, viewport] of Object.entries(sizes) as [string, Size][]) {
    test.describe(`${set}${name} (${viewport.width} x ${viewport.height})`, () => {
      test.use({ viewport, hasTouch: true });

      test('the dock stands in for the sidebar, the map keeps most of the window, and every button is in reach', async ({ page }) => {
        await begin(page);
        await expect(html(page)).toHaveAttribute('data-layout', 'compact');
        const upright = viewport.height > viewport.width;
        if (viewport.width >= 760 && viewport.height >= 540) {
          // sideways with room for it, the sidebar itself stands at the map's right as a panel: no dock, no sheet
          await expect(html(page)).toHaveAttribute('data-panel', 'side');
          await expect(page.locator('.dock')).toBeHidden();
          const panel = page.locator('.sidebar');
          await expect(panel).toBeVisible();
          const map = await boxOf(canvasOf(page));
          const box = await boxOf(panel);
          expect(map.width * map.height, 'the map has 55% of the window').toBeGreaterThanOrEqual(0.55 * viewport.width * viewport.height);
          expect(Math.round(box.x)).toBe(Math.round(map.x + map.width));
          expect(Math.round(box.x + box.width)).toBe(viewport.width);
          expect(Math.round(box.height)).toBe(viewport.height);
          const buttons = panel.locator('.command-bar button:not([hidden])');
          expect(await buttons.count()).toBeGreaterThanOrEqual(20);
          await allInWindow(page, buttons, 'panel button');
          for (let i = 0; i < (await buttons.count()); i++) {
            const b = await boxOf(buttons.nth(i));
            expect(Math.min(b.width, b.height), `button ${i}`).toBeGreaterThanOrEqual(44);
          }
          for (const row of ['date', 'treasury', 'unit', 'location', 'terrain']) await expect(field(page, row)).toBeVisible();
          const chart = await boxOf(panel.locator('canvas.minimap'));
          expect(chart.height, 'the chart keeps a third of its height at the least').toBeGreaterThanOrEqual(84);
          expect(inside(chart, box), 'the chart in the panel').toBe(true);
          expect(inside(await boxOf(page.locator('.event-log')), map), 'the log inside the map').toBe(true);
          expect(await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight])).toEqual([viewport.width, viewport.height]);
          // the panel's other rows growing squeezes the chart, and its picture follows its box
          const picture = (): Promise<number[]> => panel.locator('canvas.minimap').evaluate((c: HTMLCanvasElement) => [c.width, c.height, Math.round(c.clientWidth * devicePixelRatio), Math.round(c.clientHeight * devicePixelRatio)]);
          await page.locator('.sidebar-info').evaluate((el: HTMLElement) => { el.style.paddingBottom = '40px'; });
          await settled(page);
          await expect.poll(async () => { const p = await picture(); return p[0] === p[2] && p[1] === p[3]; }).toBe(true);
          expect((await boxOf(panel.locator('canvas.minimap'))).height).toBeLessThanOrEqual(chart.height); // (already at its least in the lowest window)
          await page.locator('.sidebar-info').evaluate((el: HTMLElement) => { el.style.paddingBottom = ''; });
          // a command in the panel runs
          const zoom = (await viewOf(page)).zoom;
          await tap(page, panel.locator('[data-command="zoomOut"]'));
          await expect.poll(async () => (await viewOf(page)).zoom).toBeLessThan(zoom);
          return;
        }
        await expect(html(page)).not.toHaveAttribute('data-panel');
        await expect(page.locator('.sidebar')).toBeHidden();
        const dock = page.locator('.dock');
        await expect(dock).toBeVisible();
        const map = await boxOf(canvasOf(page));
        const box = await boxOf(dock);
        expect(map.width * map.height, 'the map has 55% of the window').toBeGreaterThanOrEqual(0.55 * viewport.width * viewport.height);
        if (upright) {
          // under the map, at its full width
          expect(Math.round(box.y)).toBeGreaterThanOrEqual(Math.round(map.y + map.height));
          expect(Math.round(box.width)).toBe(Math.round(map.width));
        } else {
          // at its right, the window's height
          expect(Math.round(box.x)).toBeGreaterThanOrEqual(Math.round(map.x + map.width));
          expect(Math.round(box.height)).toBe(Math.round(map.height));
        }
        const buttons = dock.getByRole('button');
        expect(await buttons.allTextContents()).toEqual(['Wait', 'Skip', 'Go to', 'Fortify', 'Sentry', 'Build', 'End turn', 'More']);
        await allInWindow(page, buttons, 'dock button');
        for (let i = 0; i < 8; i++) {
          const b = await boxOf(buttons.nth(i));
          expect(Math.min(b.width, b.height), `button ${i}`).toBeGreaterThanOrEqual(44);
        }
        await expect(dock.locator('[data-dock="date"]')).toHaveText(await field(page, 'date').textContent() ?? '');
        await expect(dock.locator('[data-dock="treasury"]')).toHaveText(/\d+ gold/);
        await expect(dock.locator('[data-dock="unit"]')).toHaveText(await field(page, 'unit').textContent() ?? '');
        await expect(dock.locator('[data-dock="moves"]')).toHaveText(/^Moves: /);
        // the log of the turn's news lies on the map
        const log = page.locator('.event-log');
        await expect(log).toBeVisible();
        expect(inside(await boxOf(log), map), 'the log inside the map').toBe(true);
        const doc = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight]);
        expect(doc).toEqual([viewport.width, viewport.height]);
      });
    });
  }
}

test.describe('the slip, in the compact layout', () => {
  for (const [name, viewport] of Object.entries(SMALL_POSTURES) as [string, Size][]) {
    test(`lies inside the map at ${name}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      // (every square known, so that each has something to say)
      await begin(page, '&reveal');
      // the middle of the world, from the chart in the sheet: the map then reaches past every edge of the view
      // (or from the chart in the panel, where the window keeps one)
      const docked = await page.locator('.dock').isVisible();
      if (docked) await dockButton(page, 'more').click();
      await page.locator('.sheet canvas.minimap').click();
      if (docked) await expect(sheet(page)).toBeHidden();
      const map = await boxOf(canvasOf(page));
      const slip = page.locator('.map-tooltip');
      // a square at each corner of the map: the slip is pushed back inside it wherever the pointer rests
      for (const [fx, fy] of [[0.85, 0.85], [0.15, 0.15], [0.85, 0.15], [0.15, 0.85]] as const) {
        const at = { x: map.x + map.width * fx, y: map.y + map.height * fy };
        // (the log lies over the map's lower left: a pointer over it is not over the map)
        if (!(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.matches('canvas.map'), at))) continue;
        await page.mouse.move(at.x, at.y);
        await expect(slip).toBeVisible();
        expect(inside(await boxOf(slip), map), `slip at ${fx},${fy}`).toBe(true);
        await page.mouse.move(map.x + map.width / 2, map.y + map.height / 2);
        await expect(slip).toBeVisible();
      }
    });
  }
});

test.describe('the dock at work', () => {
  test.use({ viewport: POSTURES.phoneUpright, hasTouch: true });

  test('runs what the sidebar runs, relabels as it does, and carries the Europe mark on More', async ({ page }) => {
    await begin(page);
    await tap(page, dockButton(page, 'goTo'));
    await expect(html(page)).toHaveAttribute('data-pointer', 'coarse');
    // a ship is offered Europe first; the map is the last choice
    await tap(page, page.getByRole('dialog').getByRole('button', { name: 'Pick a square on the map' }));
    await expect(dockButton(page, 'goTo')).toHaveText('Cancel');
    await expect(page.locator('.command-bar [data-command="goTo"]')).toHaveText('Cancel');
    await expect(canvasOf(page)).toHaveAttribute('data-mode', 'goto');
    await tap(page, dockButton(page, 'goTo'));
    await expect(dockButton(page, 'goTo')).toHaveText('Go to');
    await expect(canvasOf(page)).toHaveAttribute('data-mode', 'move');
    const europe = page.locator('.command-bar [data-command="europe"]');
    const more = dockButton(page, 'more');
    expect(await more.getAttribute('data-europe')).toBe(await europe.getAttribute('data-europe'));
    expect(await more.getAttribute('title')).toBe((await europe.getAttribute('title'))!.replace('Europe (E)', 'More'));
    // End turn ends the turn, as the sidebar's does
    const turn = Number(await canvasOf(page).getAttribute('data-turn'));
    await tap(page, dockButton(page, 'endTurn'));
    await expect(canvasOf(page)).toHaveAttribute('data-turn', String(turn + 1));
    // each button is enabled and disabled with the sidebar's
    for (const id of ['wait', 'skip', 'goTo', 'fortify', 'sentry', 'buildColony', 'endTurn']) {
      expect(await dockButton(page, id).isDisabled(), id).toBe(await page.locator(`.command-bar [data-command="${id}"]`).isDisabled());
    }
  });

  test('closing the sheet by its veil or its Close leaves the keyboard with the map', async ({ page }) => {
    await begin(page);
    const opened = sheet(page);
    for (const way of ['veil', 'close'] as const) {
      await dockButton(page, 'more').click();
      await expect(opened).toBeVisible();
      if (way === 'veil') {
        const box = await boxOf(opened);
        await page.mouse.click(box.x + box.width / 2, Math.max(4, box.y / 2));
      } else await opened.getByRole('button', { name: 'Close' }).click();
      await expect(opened).toBeHidden();
      expect(await page.evaluate(() => document.activeElement?.matches('canvas.map')), way).toBe(true);
      const zoom = (await viewOf(page)).zoom;
      await page.keyboard.press('x');
      await expect.poll(async () => (await viewOf(page)).zoom, way).toBeLessThan(zoom);
      await page.keyboard.press('z');
      await expect.poll(async () => (await viewOf(page)).zoom, way).toBe(zoom);
    }
  });

  test('More opens a sheet of the other commands, the chart and the rows, and each way out closes it', async ({ page }) => {
    await begin(page);
    const more = dockButton(page, 'more');
    await tap(page, more);
    const opened = sheet(page);
    await expect(opened).toBeVisible();
    const chart = opened.locator('canvas.minimap');
    await expect(chart).toBeVisible();
    for (const row of ['location', 'terrain']) await expect(field(page, row)).toBeVisible();
    for (const row of ['date', 'treasury', 'unit']) await expect(field(page, row)).toBeHidden();
    for (const id of ['plow', 'road', 'tradeRoute', 'load', 'unload', 'dump', 'center', 'disband', 'hiddenTerrain', 'europe', 'zoomIn', 'zoomOut', 'reports', 'menus']) {
      await expect(opened.locator(`[data-command="${id}"]`), id).toBeVisible();
    }
    for (const id of ['wait', 'skip', 'goTo', 'fortify', 'sentry', 'buildColony', 'endTurn']) await expect(opened.locator(`[data-command="${id}"]`), id).toBeHidden();
    await allInWindow(page, opened.getByRole('button').filter({ visible: true }), 'sheet button');

    // a command runs and the sheet goes
    const zoom = (await viewOf(page)).zoom;
    await tap(page, opened.locator('[data-command="zoomOut"]'));
    await expect(opened).toBeHidden();
    await expect.poll(async () => (await viewOf(page)).zoom).toBeLessThan(zoom);

    // Close, and a tap outside it
    await tap(page, more);
    await expect(opened).toBeVisible();
    await tap(page, opened.getByRole('button', { name: 'Close' }));
    await expect(opened).toBeHidden();
    await tap(page, more);
    await expect(opened).toBeVisible();
    const box = await boxOf(opened);
    await tap(page, { x: box.x + box.width / 2, y: Math.max(4, box.y / 2) });
    await expect(opened).toBeHidden();
    // a tap on the map behind it gave no order
    await expect(canvasOf(page)).toHaveAttribute('data-mode', 'move');

    // a tap on the chart centres the map there
    await tap(page, more);
    const before = await viewOf(page);
    const c = await boxOf(chart);
    await tap(page, { x: c.x + 6, y: c.y + c.height / 2 });
    await expect(opened).toBeHidden();
    await expect.poll(async () => (await viewOf(page)).originX).toBeLessThan(before.originX);
  });
});

test.describe('a change of window in the middle of a turn', () => {
  test.use({ viewport: POSTURES.duoCoverUpright, hasTouch: true, deviceScaleFactor: 2 });

  const order: readonly Size[] = [
    POSTURES.duoCoverUpright, POSTURES.duoCoverSideways, POSTURES.duoInnerUpright, POSTURES.duoInnerSideways,
    POSTURES.phoneUpright, POSTURES.phoneSideways, { width: 1280, height: 800 }, POSTURES.duoCoverUpright,
  ];

  test('a phone opens on squares of 32 pixels, and Zoom + and a pinch bring them to 64', async ({ page }) => {
    await begin(page);
    expect((await viewOf(page)).tileSize).toBe(32);
    await tap(page, dockButton(page, 'more'));
    await tap(page, sheet(page).locator('[data-command="zoomIn"]'));
    await expect.poll(async () => (await viewOf(page)).tileSize).toBe(64);
    await tap(page, dockButton(page, 'more'));
    await tap(page, sheet(page).locator('[data-command="zoomOut"]'));
    await expect.poll(async () => (await viewOf(page)).tileSize).toBe(32);
    const box = await boxOf(canvasOf(page));
    await pinch(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, { from: 100, to: 300 });
    await expect.poll(async () => (await viewOf(page)).tileSize).toBe(64);
  });

  test('keeps the game, the unit, the zoom and the unit in sight, and a tap on the map still moves it', async ({ page }) => {
    await begin(page);
    let west = true;
    for (const size of order) {
      const turn = await canvasOf(page).getAttribute('data-turn');
      const active = await canvasOf(page).getAttribute('data-active');
      const zoom = (await viewOf(page)).zoom;
      await page.setViewportSize(size);
      await settled(page);
      const what = `${size.width} x ${size.height}`;
      await expect(html(page)).toHaveAttribute('data-layout', size.width >= 760 && size.height >= 640 ? 'full' : 'compact');
      const compact = (await html(page).getAttribute('data-layout')) === 'compact';
      const panel = compact && size.width > size.height && size.width >= 760 && size.height >= 540;
      await expect(page.locator('.dock'), what).toBeVisible({ visible: compact && !panel });
      await expect(page.locator('.sidebar'), what).toBeVisible({ visible: !compact || panel });
      if (panel) {
        // the chart's picture is as large as its box, at this screen's two pixels to one, however the panel has squeezed it
        const chart = await page.locator('.sidebar canvas.minimap').evaluate((c: HTMLCanvasElement) => [c.width, c.height, Math.round(c.clientWidth * devicePixelRatio), Math.round(c.clientHeight * devicePixelRatio), c.clientHeight]);
        expect(chart.slice(0, 2), what).toEqual(chart.slice(2, 4));
        expect(chart[4], what).toBeLessThanOrEqual(232);
      }
      await expect(canvasOf(page)).toHaveAttribute('data-turn', turn!);
      await expect(canvasOf(page)).toHaveAttribute('data-active', active!);
      const view = await viewOf(page);
      expect(view.zoom, what).toBe(zoom);
      const backing = await canvasOf(page).evaluate((c: HTMLCanvasElement) => [c.width, c.height, Math.round(c.clientWidth * devicePixelRatio), Math.round(c.clientHeight * devicePixelRatio), devicePixelRatio]);
      expect(backing.slice(0, 2), what).toEqual(backing.slice(2, 4));
      expect(backing[4]).toBe(2);
      const at = await spot(page);
      expect(at, what).not.toBeNull();
      const square = { x: (at!.x - view.originX) * view.tileSize, y: (at!.y - view.originY) * view.tileSize, width: view.tileSize, height: view.tileSize };
      expect(inside(square, { x: 0, y: 0, width: view.width, height: view.height }), `${what}: the unit's square in the map`).toBe(true);

      // a tap on the square beside the ship moves it there (west, then east, so as never to reach land)
      const to = { x: at!.x + (west ? -1 : 1), y: at!.y };
      west = !west;
      await tap(page, await squareAt(page, to.x, to.y));
      await settled(page);
      if ((await field(page, 'unit').textContent()) === 'No active unit') {
        // its last move: the turn ends, and the next begins with the ship where the tap sent it
        await tap(page, compact && !panel ? dockButton(page, 'endTurn') : page.locator('.command-bar [data-command="endTurn"]'));
        await settled(page);
      }
      await expect(field(page, 'location'), what).toHaveText(`(${to.x}, ${to.y})`);
    }
  });

  test('leaves the More sheet, the colony screen and a dialog open, with their buttons in the window', async ({ page }) => {
    await begin(page);
    const sizes = [...Object.values(POSTURES), { width: 1280, height: 800 }, POSTURES.phoneUpright];
    // the More sheet (in the full layout the sidebar is simply there)
    await tap(page, dockButton(page, 'more'));
    for (const size of sizes) {
      await page.setViewportSize(size);
      await settled(page);
      const compact = (await html(page).getAttribute('data-layout')) === 'compact';
      if (!compact) continue;
      await expect(sheet(page)).toBeVisible();
      await allInWindow(page, sheet(page).getByRole('button').filter({ visible: true }), `sheet at ${size.width} x ${size.height}`);
    }
    await tap(page, sheet(page).getByRole('button', { name: 'Close' }));
    // a question
    await tap(page, dockButton(page, 'more'));
    await tap(page, sheet(page).locator('[data-command="disband"]'));
    const dialog = page.getByRole('dialog').filter({ hasText: 'Disband this unit' });
    await expect(dialog).toBeVisible();
    for (const size of sizes) {
      await page.setViewportSize(size);
      await settled(page);
      await expect(dialog).toBeVisible();
      await allInWindow(page, dialog.getByRole('button'), `dialog at ${size.width} x ${size.height}`);
    }
    await tap(page, dialog.getByRole('button', { name: 'No, keep it' }));
    await expect(dialog).toHaveCount(0);
  });

  test('leaves the colony screen open, with its way out in the window', async ({ page }) => {
    await foundJamestown(page);
    const colony = page.locator('.colony-screen');
    await expect(colony).toBeVisible();
    for (const size of [...Object.values(POSTURES), { width: 1280, height: 800 }, POSTURES.phoneUpright]) {
      await page.setViewportSize(size);
      await settled(page);
      await expect(colony).toBeVisible();
      await allInWindow(page, colony, `the colony screen at ${size.width} x ${size.height}`);
      await allInWindow(page, colony.locator('.colony-close'), `its way out at ${size.width} x ${size.height}`);
    }
    await tap(page, colony.locator('.colony-close'));
    await expect(colony).toHaveCount(0);
  });
});

// A window a fold divides in two (the browser tells its parts): the map keeps the first part, the
// panel the second, in any layout. The fold is set through the debugging protocol.
const FOLDS = [
  { name: 'folded like a book', size: { width: 890, height: 626 }, orientation: 'vertical', offset: 445, mask: 0, place: 'side', form: 'column' },
  { name: 'folded like a book, the hinge 24 px wide', size: { width: 914, height: 626 }, orientation: 'vertical', offset: 445, mask: 24, place: 'side', form: 'column' },
  { name: 'half open on a table', size: { width: 626, height: 890 }, orientation: 'horizontal', offset: 445, mask: 0, place: 'below', form: 'spread' },
  { name: 'a wide window with a mouse', size: { width: 1280, height: 800 }, orientation: 'vertical', offset: 640, mask: 0, place: 'side', form: 'column' },
] as const;

test.describe('a window a fold divides', () => {
  for (const fold of FOLDS) {
    test(`${fold.name}: the map on one side of the fold, the panel on the other`, async ({ page }) => {
      await page.setViewportSize(fold.size);
      const cdp = await page.context().newCDPSession(page);
      const metrics = { ...fold.size, deviceScaleFactor: 1, mobile: false };
      await cdp.send('Emulation.setDeviceMetricsOverride', { ...metrics, displayFeature: { orientation: fold.orientation, offset: fold.offset, maskLength: fold.mask } });
      await begin(page);
      await expect(html(page)).toHaveAttribute('data-panel', fold.place);
      await expect(html(page)).toHaveAttribute('data-panel-form', fold.form);
      await expect(page.locator('.dock')).toBeHidden();
      const map = await boxOf(canvasOf(page));
      const panel = await boxOf(page.locator('.sidebar'));
      const far = fold.offset + fold.mask;
      if (fold.place === 'side') {
        expect([Math.round(map.x), Math.round(map.width)]).toEqual([0, fold.offset]);
        expect([Math.round(panel.x), Math.round(panel.x + panel.width)]).toEqual([far, fold.size.width]);
      } else {
        expect([Math.round(map.y), Math.round(map.height)]).toEqual([0, fold.offset]);
        expect([Math.round(panel.y), Math.round(panel.y + panel.height)]).toEqual([far, fold.size.height]);
      }
      const buttons = page.locator('.sidebar .command-bar button:not([hidden])');
      await allInWindow(page, buttons, 'panel button');
      expect(inside(await boxOf(page.locator('.sidebar canvas.minimap')), panel), 'the chart in the panel').toBe(true);
      expect(inside(await boxOf(page.locator('.event-log')), map), 'the log inside the map').toBe(true);
      // the map still takes orders, and a command in the panel runs
      const zoom = (await viewOf(page)).zoom;
      await page.locator('.sidebar [data-command="zoomOut"]').click();
      await expect.poll(async () => (await viewOf(page)).zoom).toBeLessThan(zoom);

      // laid flat again, the fold is gone and the window is laid out as its size calls for
      await cdp.send('Emulation.setDeviceMetricsOverride', metrics);
      await page.setViewportSize({ width: fold.size.width, height: fold.size.height - 1 });
      await settled(page);
      await expect(html(page)).not.toHaveAttribute('data-fold');
      const flat = await html(page).getAttribute('data-panel');
      expect(flat).toBe(fold.size.width > fold.size.height && fold.size.width < 1280 ? 'side' : null);
    });
  }
});
