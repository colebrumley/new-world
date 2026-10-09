import { expect, test, type Locator, type Page } from '@playwright/test';

interface ViewData {
  zoom: number;
  tileSize: number;
  originX: number;
  originY: number;
  width: number;
  height: number;
}

const viewOf = (canvas: Locator): Promise<ViewData> => canvas.evaluate((c) => JSON.parse((c as HTMLCanvasElement).dataset['view']!) as ViewData);
const center = (v: ViewData): { x: number; y: number } => ({ x: v.originX + v.width / v.tileSize / 2, y: v.originY + v.height / v.tileSize / 2 });

async function startAmerica(page: Page): Promise<Locator> {
  await page.goto('/?reveal');
  await page.getByRole('menuitem', { name: 'Start a Game in America' }).click();
  const canvas = page.locator('canvas.map');
  await expect(canvas).toHaveAttribute('data-view', /tileSize/);
  return canvas;
}

test('Z and X step through the four zoom levels', async ({ page }) => {
  const canvas = await startAmerica(page);
  const sizes: number[] = [(await viewOf(canvas)).tileSize];
  expect((await viewOf(canvas)).zoom).toBe(3);
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('x');
    await expect.poll(async () => (await viewOf(canvas)).zoom).toBe(Math.max(0, 2 - i));
    sizes.push((await viewOf(canvas)).tileSize);
  }
  // 1280x800 minus the sidebar: 15, 30, 60 and 120 tiles across
  expect(sizes).toEqual([64, 32, 16, 8, 8]);
  await page.keyboard.press('z');
  await expect.poll(async () => (await viewOf(canvas)).tileSize).toBe(16);
  await page.screenshot({ path: 'test-results/map-zoom1.png' });
  await page.keyboard.press('z');
  await page.keyboard.press('z');
  await page.keyboard.press('z');
  await expect.poll(async () => (await viewOf(canvas)).tileSize).toBe(64);
  await page.screenshot({ path: 'test-results/map-zoom3.png' });
});

test('clicking the New World view recentres the map and shows the viewport box', async ({ page }) => {
  const canvas = await startAmerica(page);
  const mini = page.locator('canvas.minimap');
  const box = (await mini.boundingBox())!;
  // minimap scale is 3 px per tile at 216x232, offset (21, 8)
  const target = { x: 40, y: 50 };
  await mini.click({ position: { x: 21 + target.x * 3 + 1, y: 8 + target.y * 3 + 1 } });
  await expect.poll(async () => Math.round(center(await viewOf(canvas)).x - 0.5)).toBe(target.x);
  expect(Math.round(center(await viewOf(canvas)).y - 0.5)).toBe(target.y);

  const white = await mini.evaluate((el) => {
    const c = el as HTMLCanvasElement;
    const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i]! > 235 && data[i + 1]! > 235 && data[i + 2]! > 235) n++;
    return n;
  });
  expect(white).toBeGreaterThan(60); // the viewport rectangle
  expect(box.width).toBe(218);
});

test('click centres, drag pans, view mode arrows pan, C returns to the unit', async ({ page }) => {
  const canvas = await startAmerica(page);
  await page.keyboard.press('x');
  const before = center(await viewOf(canvas));

  await canvas.click({ position: { x: 200, y: 200 } });
  const v = await viewOf(canvas);
  const clicked = { x: Math.floor(before.x - v.width / v.tileSize / 2 + 200 / v.tileSize), y: Math.floor(before.y - v.height / v.tileSize / 2 + 200 / v.tileSize) };
  const afterClick = center(v);
  // clamped at map edges, so only assert movement toward the clicked tile where there is room
  expect(Math.abs(afterClick.x - 0.5 - clicked.x) <= Math.abs(before.x - 0.5 - clicked.x)).toBe(true);

  const start = center(await viewOf(canvas));
  await page.mouse.move(600, 400);
  await page.mouse.down();
  await page.mouse.move(600, 300, { steps: 5 });
  await page.mouse.up();
  const dragged = center(await viewOf(canvas));
  expect(dragged.y).toBeGreaterThan(start.y + 2);
  expect(dragged.x).toBeCloseTo(start.x, 0);

  await page.mouse.move(600, 400);
  await page.keyboard.press('v');
  await expect(canvas).toHaveAttribute('data-mode', 'view');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect.poll(async () => center(await viewOf(canvas)).y).toBeCloseTo(dragged.y - 2, 0);
  await expect(page.locator('[data-field="unit"]')).toHaveText('No active unit');

  await page.keyboard.press('m');
  await expect(canvas).toHaveAttribute('data-mode', 'move');
  await page.keyboard.press('c');
  await expect(page.locator('[data-field="unit"]')).toHaveText('Caravel');
});

test('edge-scroll pans while the pointer rests at the map edge', async ({ page }) => {
  const canvas = await startAmerica(page);
  await page.keyboard.press('x');
  await canvas.click({ position: { x: 500, y: 400 } });
  const start = center(await viewOf(canvas));
  // head for whichever vertical edge has room to scroll
  const down = start.y < 36;
  await page.mouse.move(500, down ? 796 : 4);
  await expect.poll(async () => Math.abs(center(await viewOf(canvas)).y - start.y)).toBeGreaterThan(3);
  await page.mouse.move(500, 400);
  const rest = center(await viewOf(canvas));
  await page.waitForTimeout(200);
  expect(center(await viewOf(canvas))).toEqual(rest);
});

test('the sidebar shows date, treasury, unit, moves, location and terrain', async ({ page }) => {
  await startAmerica(page);
  await expect(page.locator('[data-field="date"]')).toHaveText('1492');
  await expect(page.locator('[data-field="treasury"]')).toHaveText('0 gold');
  await expect(page.locator('[data-field="unit"]')).toHaveText('Caravel');
  await expect(page.locator('[data-field="moves"]')).toHaveText('Moves: 4');
  await expect(page.locator('[data-field="location"]')).toHaveText(/^\(\d+, \d+\)$/);
  await expect(page.locator('[data-field="terrain"]')).toHaveText(/\w+/);
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-field="date"]')).toHaveText('1493');
});

test('a full redraw averages under 8 ms at 1280x800 at every zoom level', async ({ page }) => {
  const canvas = await startAmerica(page);
  for (let zoom = 3; zoom >= 0; zoom--) {
    await expect.poll(async () => (await viewOf(canvas)).zoom).toBe(zoom);
    await page.evaluate(() => window.__newWorld!.benchmark(5)); // warm the tile cache
    const ms = await page.evaluate(() => window.__newWorld!.benchmark(100));
    expect(ms, `zoom ${zoom}`).toBeLessThan(8);
    await page.keyboard.press('x');
  }
});
