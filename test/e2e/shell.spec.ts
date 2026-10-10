import { expect, test, type Page } from '@playwright/test';
import { PALETTE } from '../../src/ui/pixel-art';

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

const frames = (page: Page): Promise<number> => page.locator('canvas.map').evaluate((c) => Number((c as HTMLCanvasElement).dataset['frames']));

test('title screen offers the five opening choices', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await expect(page).toHaveTitle('New World');
  await expect(page.getByRole('menuitem')).toHaveText([
    'Start a Game in New World',
    'Start a Game in America',
    'Customize New World',
    'Load Game',
    'View Hall of Fame',
  ]);
  await expect(page.getByRole('menuitem', { name: 'Load Game' })).toBeDisabled();
  expect(errors).toEqual([]);
});

test('the title is a frontispiece: a painting in palette colours behind the menu, enlarged by a whole number at every window size', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  const painting = page.locator('canvas.frontispiece');
  await expect(painting).toHaveAttribute('data-painted', 'true');
  await expect(painting).toBeVisible();

  // one canvas pixel to an art pixel, every one a colour of the map palette
  const colours = await painting.evaluate((el) => {
    const c = el as HTMLCanvasElement;
    const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    const seen = new Set<string>();
    for (let i = 0; i < data.length; i += 4) seen.add(`#${[data[i]!, data[i + 1]!, data[i + 2]!].map((v) => v.toString(16).padStart(2, '0')).join('')}/${data[i + 3]}`);
    return { size: [c.width, c.height], seen: [...seen], rendering: getComputedStyle(c).imageRendering };
  });
  expect(colours.size).toEqual([320, 200]);
  expect(colours.rendering).toBe('pixelated');
  expect(colours.seen.length).toBeGreaterThanOrEqual(12);
  for (const colour of colours.seen) expect(PALETTE.map((hex) => `${hex}/255`)).toContain(colour);

  // letterboxed on the wood, never stretched: a whole multiple of 320 x 200, centred, with the frame showing
  for (const [width, height, scale] of [[1280, 800, 3], [1024, 640, 3], [1700, 1000, 4], [1100, 1300, 3], [2000, 700, 3]] as const) {
    await page.setViewportSize({ width, height });
    await expect(painting).toHaveAttribute('data-scale', String(scale));
    const box = (await painting.boundingBox())!;
    expect([box.width, box.height]).toEqual([320 * scale, 200 * scale]);
    expect([box.x, box.y]).toEqual([(width - box.width) / 2, (height - box.height) / 2]);
    expect(Math.min(box.x, box.y)).toBeGreaterThanOrEqual(8);
    // the menu lies over it, inside the window
    const sheet = (await page.locator('.title-screen .cartouche').boundingBox())!;
    expect(sheet.x).toBeGreaterThanOrEqual(0);
    expect(sheet.y).toBeGreaterThanOrEqual(0);
    expect(sheet.y + sheet.height).toBeLessThanOrEqual(height);
    const top = await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.closest('.cartouche') !== null, [width / 2, height / 2]);
    expect(top).toBe(true);
  }
  await page.setViewportSize({ width: 1280, height: 800 });

  // the title is set in the display face over a rule, and the menu shows where the keyboard is and what cannot be chosen
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('New World');
  await page.evaluate(() => document.fonts.ready);
  const first = page.getByRole('menuitem', { name: 'Start a Game in New World' });
  await page.keyboard.press('Tab');
  await expect(first).toBeFocused();
  const look = (name: string): Promise<{ outline: string; opacity: string; colour: string; style: string }> =>
    page.getByRole('menuitem', { name }).evaluate((el) => {
      const s = getComputedStyle(el);
      return { outline: s.outlineStyle === 'none' ? 'none' : s.outlineWidth, opacity: s.opacity, colour: s.color, style: s.fontStyle };
    });
  expect((await look('Start a Game in New World')).outline).toBe('2px');
  expect((await look('Start a Game in America')).outline).toBe('none');
  const load = await look('Load Game');
  expect(load.opacity).toBe('1');
  expect(load.style).toBe('italic');
  expect(load.colour).not.toBe((await look('Start a Game in America')).colour);
  await expect(painting).toHaveCSS('opacity', '1'); // faded in
  await page.screenshot({ path: 'test-results/title.png' });
  expect(errors).toEqual([]);
});

test('the painting is asked for after the title is up, and the menu does not wait for it', async ({ page }) => {
  let release = (): void => undefined;
  const held = new Promise<void>((resolve) => (release = resolve));
  /** What the page had done by the time it asked for the picture. */
  let asked: { title: boolean; menu: number } | null = null;
  await page.route(/frontispiece-[^/]*\.js$/, async (route) => {
    asked = await page.evaluate(() => ({ title: performance.getEntriesByName('new-world:title').length > 0, menu: document.querySelectorAll('.title-menu button').length }));
    await held;
    await route.continue();
  });
  await page.goto('/');
  const painting = page.locator('canvas.frontispiece');
  await expect(page.getByRole('menuitem', { name: 'Start a Game in New World' })).toBeEnabled();
  // the picture went for only after the title and its menu were up
  await expect.poll(() => asked).toEqual({ title: true, menu: 5 });
  // with the picture still on its way the frame is empty wood, and the screens work: the note arrives, Customize opens and comes back
  await expect(painting).not.toHaveAttribute('data-painted', 'true');
  await expect(page.locator('.title-difficulty-note')).not.toHaveText('');
  await page.getByRole('menuitem', { name: 'Customize New World' }).click();
  await expect(page.getByRole('group')).toHaveCount(4);
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('menuitem')).toHaveCount(5);
  release();
  await expect(painting).toHaveAttribute('data-painted', 'true');
  const order = await page.evaluate(() => {
    const title = performance.getEntriesByName('new-world:title')[0]?.startTime ?? Infinity;
    const chunk = performance.getEntriesByType('resource').find((entry) => /frontispiece-[^/]*\.js$/.test(entry.name))?.startTime ?? -Infinity;
    return { title, chunk };
  });
  expect(order.chunk).toBeGreaterThan(order.title);
  // a game takes the painting down with the title
  await page.getByRole('menuitem', { name: 'Start a Game in New World' }).click();
  await expect(page.locator('canvas.map')).toHaveAttribute('data-frames', /\d+/);
  await expect(painting).toBeHidden();
});

test('Customize and the Hall of Fame keep the title\'s frame', async ({ page }) => {
  await page.goto('/');
  const painting = page.locator('canvas.frontispiece');
  await expect(painting).toHaveAttribute('data-painted', 'true');
  const hung = (await painting.boundingBox())!;

  await page.getByRole('menuitem', { name: 'Customize New World' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Customize New World');
  await expect(page.locator('.customize .cartouche')).toBeVisible();
  await expect(painting).toBeVisible();
  expect(await painting.boundingBox()).toEqual(hung);
  await page.evaluate(() => document.fonts.ready);
  await expect(painting).toHaveCSS('opacity', '1'); // faded in
  await page.screenshot({ path: 'test-results/title-customize.png' });
  await page.getByRole('button', { name: 'Cancel' }).click();

  await page.getByRole('menuitem', { name: 'View Hall of Fame' }).click();
  const hall = page.getByRole('dialog', { name: 'Hall of Fame' });
  await expect(hall).toBeVisible();
  await expect(painting).toBeVisible();
  expect(await painting.boundingBox()).toEqual(hung);
  // a sheet in the frame, not the whole window; the menu steps aside for it
  const sheet = (await hall.boundingBox())!;
  expect(sheet.width).toBeLessThan(1280);
  expect(sheet.height).toBeLessThan(800);
  await expect(page.locator('.title-screen .cartouche')).toBeHidden();
  await page.screenshot({ path: 'test-results/title-hall.png' });
  await page.keyboard.press('Escape');
  await expect(hall).toHaveCount(0);
  await expect(page.getByRole('menuitem', { name: 'View Hall of Fame' })).toBeVisible();
});

test('starting a game shows a canvas with non-blank pixels', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await page.getByRole('menuitem', { name: 'Start a Game in New World' }).click();
  const canvas = page.locator('canvas.map');
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute('data-frames', /\d+/);

  const colors = await canvas.evaluate((el) => {
    const c = el as HTMLCanvasElement;
    const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    const seen = new Set<number>();
    for (let i = 0; i < data.length; i += 4 * 97) seen.add((data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!);
    return seen.size;
  });
  expect(colors).toBeGreaterThanOrEqual(3); // void, ocean, land at least
  expect(errors).toEqual([]);
});

test('redraws only when state or view changes, and fills the window', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('menuitem', { name: 'Start a Game in New World' }).click();
  await expect(page.locator('canvas.map')).toHaveAttribute('data-frames', /\d+/);

  const idle = await frames(page);
  await page.waitForTimeout(300);
  expect(await frames(page)).toBe(idle);

  await page.keyboard.press('Enter'); // end turn: state changed
  await expect.poll(() => frames(page)).toBe(idle + 1);
  await expect(page.locator('canvas.map')).toHaveAttribute('data-turn', '1');

  await page.setViewportSize({ width: 1024, height: 640 });
  await expect.poll(() => frames(page)).toBe(idle + 2);
  const box = await page.locator('canvas.map').boundingBox();
  expect(box).toMatchObject({ width: 1024 - 232, height: 640 });
});

test('Load Game resumes the autosave', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('menuitem', { name: 'Start a Game in New World' }).click();
  await page.keyboard.press('Enter');
  await expect(page.locator('canvas.map')).toHaveAttribute('data-turn', '1');
  await page.reload();
  await page.getByRole('menuitem', { name: 'Load Game' }).click();
  await expect(page.locator('canvas.map')).toHaveAttribute('data-turn', '1');
});

test('Customize New World offers the four settings and starts a game', async ({ page }) => {
  await page.goto('/?reveal');
  await page.getByRole('menuitem', { name: 'Customize New World' }).click();
  await expect(page.getByRole('group')).toHaveCount(4);
  for (const [group, choices] of [
    ['Land Mass', ['Small', 'Normal', 'Large']],
    ['Land Form', ['Archipelago', 'Normal', 'Large Continents']],
    ['Temperature', ['Cool', 'Temperate', 'Warm']],
    ['Climate', ['Arid', 'Normal', 'Wet']],
  ] as const) {
    await expect(page.getByRole('group', { name: group }).getByRole('radio')).toHaveCount(3);
    for (const c of choices) await expect(page.getByRole('group', { name: group }).getByLabel(c, { exact: true })).toBeVisible();
  }
  await page.getByRole('group', { name: 'Land Mass' }).getByLabel('Large').check();
  await page.getByRole('group', { name: 'Climate' }).getByLabel('Wet').check();
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.locator('canvas.map')).toHaveAttribute('data-frames', /\d+/);
  await page.screenshot({ path: 'test-results/customize-world.png' });
});

test('America map shows a recognizable Florida and Caribbean', async ({ page }) => {
  await page.goto('/?reveal');
  await page.getByRole('menuitem', { name: 'Start a Game in America' }).click();
  const canvas = page.locator('canvas.map');
  for (let i = 0; i < 3; i++) await page.keyboard.press('x'); // zoom out to the whole map
  await expect(canvas).toHaveAttribute('data-view', /"zoom":0/);
  await page.screenshot({ path: 'test-results/america.png' });

  // Sample a corner pixel (clear of river stripes and pieces) of a few tiles (grid coordinates) and classify it as sea or not.
  const isSea = (gx: number, gy: number): Promise<boolean> =>
    canvas.evaluate((el, [x, y]) => {
      const c = el as HTMLCanvasElement;
      const view = JSON.parse(c.dataset['view']!) as { originX: number; originY: number; tileSize: number };
      const dpr = c.width / c.clientWidth;
      const px = Math.round((x! - view.originX + 0.12) * view.tileSize * dpr);
      const py = Math.round((y! - view.originY + 0.12) * view.tileSize * dpr);
      const [r, g, b] = c.getContext('2d')!.getImageData(px, py, 1, 1).data;
      return b! > r! + 30 && b! > g! + 20;
    }, [gx, gy]);

  expect(await isSea(28, 25)).toBe(false); // Florida
  expect(await isSea(23, 25)).toBe(true); // Gulf of Mexico
  expect(await isSea(30, 25)).toBe(true); // Atlantic off Florida
  expect(await isSea(33, 26)).toBe(false); // Cuba
  expect(await isSea(34, 32)).toBe(true); // Caribbean Sea
  expect(await isSea(46, 46)).toBe(false); // Brazil
});

test('the map is bare vellum outside the explored start area, and H strips forests and pieces', async ({ page }) => {
  await page.goto('/?seed=11');
  await page.getByRole('menuitem', { name: 'Start a Game in New World' }).click();
  const canvas = page.locator('canvas.map');
  for (let i = 0; i < 3; i++) await page.keyboard.press('x'); // zoom out to the whole map
  await expect(canvas).toHaveAttribute('data-view', /"zoom":0/);
  await page.screenshot({ path: 'test-results/fog.png' });

  // squares that are not chart: an unknown square is drawn in the six chart inks alone, some of it bare vellum.
  // (The sea and the ship, which are all that is known here, are neither.)
  const lit = (): Promise<number> =>
    canvas.evaluate((el) => {
      const c = el as HTMLCanvasElement;
      const view = JSON.parse(c.dataset['view']!) as { originX: number; originY: number; tileSize: number };
      const dpr = c.width / c.clientWidth;
      const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      const inks = new Set([0xe9dfc4, 0xd3bd7a, 0xa39262, 0x7c6b45, 0x6b4a2a, 0x111111]);
      const side = Math.round(view.tileSize * dpr);
      let n = 0;
      for (let y = 0; y < 72; y++) {
        for (let x = 0; x < 58; x++) {
          const left = Math.round((x - view.originX) * view.tileSize * dpr);
          const top = Math.round((y - view.originY) * view.tileSize * dpr);
          let chart = true;
          let bare = false;
          for (let py = top; py < top + side && chart; py++) {
            for (let px = left; px < left + side; px++) {
              const i = (py * c.width + px) * 4;
              const rgb = (data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!;
              if (!inks.has(rgb)) chart = false;
              if (rgb === 0xe9dfc4) bare = true;
            }
          }
          if (!(chart && bare)) n++;
        }
      }
      return n;
    });

  await expect.poll(lit).toBe(9); // radius 1 around the first unit
  await page.keyboard.press('ArrowLeft'); // west, away from the Sea Lane
  await expect.poll(lit).toBe(12);

  await page.keyboard.press('h');
  await expect(canvas).toHaveAttribute('data-hidden', 'true');
  await page.keyboard.press('Shift');
  await expect(canvas).toHaveAttribute('data-hidden', 'false');
});
