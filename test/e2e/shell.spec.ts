import { expect, test, type Page } from '@playwright/test';

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

test('the map is black outside the explored start area, and H strips forests and pieces', async ({ page }) => {
  await page.goto('/?seed=11');
  await page.getByRole('menuitem', { name: 'Start a Game in New World' }).click();
  const canvas = page.locator('canvas.map');
  for (let i = 0; i < 3; i++) await page.keyboard.press('x'); // zoom out to the whole map
  await expect(canvas).toHaveAttribute('data-view', /"zoom":0/);
  await page.screenshot({ path: 'test-results/fog.png' });

  const lit = (): Promise<number> =>
    canvas.evaluate((el) => {
      const c = el as HTMLCanvasElement;
      const view = JSON.parse(c.dataset['view']!) as { originX: number; originY: number; tileSize: number };
      const dpr = c.width / c.clientWidth;
      const ctx = c.getContext('2d')!;
      let n = 0;
      for (let y = 0; y < 72; y++) {
        for (let x = 0; x < 58; x++) {
          // the middle of each square
          const px = Math.round((x - view.originX + 0.5) * view.tileSize * dpr);
          const py = Math.round((y - view.originY + 0.5) * view.tileSize * dpr);
          const [r, g, b] = ctx.getImageData(px, py, 1, 1).data;
          if (r! + g! + b! > 90) n++;
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
