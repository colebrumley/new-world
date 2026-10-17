import { expect, test, type Page } from '@playwright/test';
import { startNewGame } from './helpers';

const field = (page: Page, name: string) => page.locator(`[data-field="${name}"]`);

async function start(page: Page): Promise<void> {
  await page.goto('/?seed=11');
  await startNewGame(page);
  await expect(field(page, 'unit')).toHaveText('Caravel');
}

test('a key sequence moves a unit, runs out its turn, and ends the turn', async ({ page }) => {
  await start(page);
  const home = (await field(page, 'location').textContent())!;
  const [x, y] = home.match(/\d+/g)!.map(Number) as [number, number];

  await page.keyboard.press('ArrowLeft');
  await expect(field(page, 'location')).toHaveText(`(${x - 1}, ${y})`);
  await expect(field(page, 'moves')).toHaveText('Moves: 3');
  await page.keyboard.press('Numpad1'); // south-west on the keypad
  await expect(field(page, 'location')).toHaveText(`(${x - 2}, ${y + 1})`);
  await page.keyboard.press('Numpad7');
  await page.keyboard.press('ArrowLeft');
  await expect(field(page, 'moves')).toHaveText(''); // caravel spent; nobody else needs orders
  await expect(field(page, 'unit')).toHaveText('No active unit');
  await expect(field(page, 'status')).toHaveText('End of turn. Press Enter.');

  await page.keyboard.press('Enter');
  await expect(field(page, 'date')).toHaveText('1493');
  await expect(field(page, 'unit')).toHaveText('Caravel');
  await expect(field(page, 'moves')).toHaveText('Moves: 4');
  await expect(field(page, 'location')).toHaveText(`(${x - 4}, ${y})`);
});

test('Sentry, Activate, Wait, Skip and Fortify behave as ordered', async ({ page }) => {
  await start(page);
  await expect(field(page, 'orders')).toHaveText('No orders');
  await expect(field(page, 'aboard')).toContainText('Soldier');
  await expect(field(page, 'aboard')).toContainText('Pioneer');

  await page.keyboard.press('s');
  await expect(field(page, 'unit')).toHaveText('No active unit'); // the only free unit is now on sentry
  await page.keyboard.press('v'); // view mode: the cursor starts on the ship's square
  await page.keyboard.press('a');
  await expect(field(page, 'unit')).toHaveText('Caravel');
  await expect(field(page, 'orders')).toHaveText('No orders');
  await expect(page.locator('canvas.map')).toHaveAttribute('data-mode', 'move');

  await page.keyboard.press('w'); // nobody else to turn to: the caravel stays up
  await expect(field(page, 'unit')).toHaveText('Caravel');
  await page.keyboard.press('f');
  await expect(field(page, 'unit')).toHaveText('No active unit');
  await page.keyboard.press('Enter');
  await expect(field(page, 'status')).toHaveText('End of turn. Press Enter.'); // fortified units are not asked again
  await page.keyboard.press('v');
  await page.keyboard.press('a');
  await expect(field(page, 'orders')).toHaveText('No orders');
  await page.keyboard.press(' ');
  await expect(field(page, 'unit')).toHaveText('No active unit');
});

test('Go To picks a destination with the cursor and sails there over turns', async ({ page }) => {
  await start(page);
  const [x, y] = (await field(page, 'location').textContent())!.match(/\d+/g)!.map(Number) as [number, number];
  await page.keyboard.press('g');
  // a ship is offered Europe first; the map is the last choice
  await expect(page.getByRole('dialog').getByRole('button')).toHaveText(['Europe', 'Pick a square on the map']);
  await page.getByRole('dialog').getByRole('button', { name: 'Pick a square on the map' }).click();
  await expect(page.locator('canvas.map')).toHaveAttribute('data-mode', 'goto');
  await expect(field(page, 'status')).toContainText('Go to where?');
  // east along the Sea Lane: the ship starts on its inner edge, a few squares off the land
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight');
  await expect(field(page, 'location')).toHaveText(`(${x + 6}, ${y})`);
  await page.keyboard.press('Enter');
  await expect(page.locator('canvas.map')).toHaveAttribute('data-mode', 'move');
  await expect(field(page, 'unit')).toHaveText('No active unit'); // four squares sailed, order still standing
  await page.keyboard.press('Enter');
  await expect(field(page, 'unit')).toHaveText('Caravel'); // arrived: the order is cleared and it asks again
  await expect(field(page, 'location')).toHaveText(`(${x + 6}, ${y})`);
  await expect(field(page, 'moves')).toHaveText('Moves: 2');

  await page.keyboard.press('g');
  await page.keyboard.press('Escape');
  await expect(page.locator('canvas.map')).toHaveAttribute('data-mode', 'move');
});

test('Go To offers a ship Europe, and she sails from the Sea Lane she lies on', async ({ page }) => {
  await start(page);
  await page.keyboard.press('g');
  await page.getByRole('dialog').getByRole('button', { name: 'Europe' }).click();
  await expect(field(page, 'unit')).toHaveText('No active unit'); // the ship and all aboard are away
});

test('Shift-D asks before disbanding; unavailable commands say so', async ({ page }) => {
  await start(page);
  await page.keyboard.press('t');
  await expect(field(page, 'status')).toContainText('No trade routes are defined');
  await page.keyboard.press('p');
  await expect(field(page, 'status')).toContainText('only pioneers');
  await page.keyboard.press('Shift+D');
  await expect(page.getByRole('dialog')).toContainText('Disband');
  await page.keyboard.press('Escape');
  await expect(field(page, 'unit')).toHaveText('Caravel');
  await page.keyboard.press('Shift+D');
  await page.getByRole('button', { name: 'Yes, disband' }).click();
  await expect(field(page, 'unit')).toHaveText('No active unit');
});

test('units stand on a nation-coloured base', async ({ page }) => {
  await start(page);
  const canvas = page.locator('canvas.map');
  // where the active unit stands, from the sidebar
  const [ux, uy] = (await field(page, 'location').textContent())!.match(/\d+/g)!.map(Number) as [number, number];
  const redAt = (dx: number, dy: number): Promise<boolean> =>
    canvas.evaluate((el, [ox, oy, cx, cy]) => {
      const c = el as HTMLCanvasElement;
      const view = JSON.parse(c.dataset['view']!) as { originX: number; originY: number; tileSize: number; width: number; height: number };
      const px = Math.round((cx! - view.originX) * view.tileSize + ox!);
      const py = Math.round((cy! - view.originY) * view.tileSize + oy!);
      const [r, g, b] = c.getContext('2d')!.getImageData(px, py, 1, 1).data;
      return r! > 150 && g! < 100 && b! < 100;
    }, [dx, dy, ux, uy]);
  expect(await redAt(5, 5)).toBe(false); // a unit with no orders carries no tab, and nothing sits in the corner
  expect(await redAt(5, 57)).toBe(true); // the base the figure stands on, clear of the hull
  await page.screenshot({ path: 'test-results/orders-box.png' });
});

test('with no colony by 1600 the charter is withdrawn and the game stops', async ({ page }) => {
  await start(page);
  for (let year = 1492; year < 1600; year++) await page.keyboard.press('Enter');
  // the end page: a defeat, with the reckoning to hand and no offer to play on
  const end = page.getByRole('dialog', { name: 'Defeat: your charter is withdrawn' });
  await expect(end).toContainText('charter');
  await expect(end).toHaveAttribute('data-kind', 'loss');
  await expect(field(page, 'date')).toHaveText('Spring 1600');
  await expect(page.locator('canvas.map')).toHaveAttribute('data-over', 'noColonies');
  await expect(end.getByRole('button', { name: 'Play on' })).toHaveCount(0);
  await end.getByRole('button', { name: 'The reckoning' }).click();
  await expect(page.getByRole('dialog', { name: 'Colonial Score' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(end).toBeVisible();
  // looking over the map: the game has stopped, and Enter ends no turn but brings the page back
  await end.getByRole('button', { name: 'Look over the map' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(field(page, 'status')).toContainText('The game has ended');
  await page.keyboard.press('Enter');
  await expect(end).toBeVisible();
  await expect(field(page, 'date')).toHaveText('Spring 1600');
});
