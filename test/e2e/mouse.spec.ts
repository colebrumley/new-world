import { expect, test, type Locator, type Page } from '@playwright/test';
import { field, settled } from './helpers';

interface ViewData {
  zoom: number;
  tileSize: number;
  originX: number;
  originY: number;
}

const viewOf = (canvas: Locator): Promise<ViewData> => canvas.evaluate((c) => JSON.parse((c as HTMLCanvasElement).dataset['view']!) as ViewData);
const command = (page: Page, id: string): Locator => page.locator(`.command-bar [data-command="${id}"]`);

/** Where the active unit stands, as the sidebar tells it. */
async function spot(page: Page): Promise<{ x: number; y: number }> {
  const [x, y] = (await field(page, 'location').textContent())!.match(/\d+/g)!.map(Number) as [number, number];
  return { x, y };
}

/** The middle of a map square, in canvas pixels. */
async function pixel(canvas: Locator, x: number, y: number): Promise<{ x: number; y: number }> {
  const v = await viewOf(canvas);
  return { x: (x - v.originX + 0.5) * v.tileSize, y: (y - v.originY + 0.5) * v.tileSize };
}

async function clickSquare(page: Page, canvas: Locator, x: number, y: number): Promise<void> {
  await canvas.click({ position: await pixel(canvas, x, y) });
  await settled(page);
}

test('a colony is founded and the turn ended with the mouse alone', async ({ page }) => {
  // any key press fails the test: this game is played without the keyboard
  await page.addInitScript(() => window.addEventListener('keydown', (event) => { document.documentElement.dataset['keyUsed'] = event.key; }, true));
  await page.goto('/?seed=7');
  await page.getByRole('menuitem', { name: 'Start a Game in America' }).click();
  const canvas = page.locator('canvas.map');
  await expect(field(page, 'unit')).toHaveText('Caravel');
  await expect(field(page, 'location')).toHaveText('(35, 21)');
  await expect(command(page, 'wait')).toBeEnabled();

  // Sail west a click at a time, ending the turn from the bar when the ship is spent.
  const dialog = page.getByRole('dialog');
  for (let step = 0; step < 12 && !(await dialog.isVisible()); step++) {
    if ((await field(page, 'unit').textContent()) === 'No active unit') {
      await expect(command(page, 'wait')).toBeDisabled();
      await command(page, 'endTurn').click();
      await settled(page);
    }
    const at = await spot(page);
    await clickSquare(page, canvas, at.x - 1, at.y);
  }
  await expect(dialog).toContainText('ashore');
  await dialog.getByRole('button', { name: 'Make landfall' }).click();
  await expect(field(page, 'unit')).toHaveText('Soldier');
  const ship = await spot(page);
  await clickSquare(page, canvas, ship.x - 1, ship.y);
  await expect(field(page, 'unit')).toHaveText('Pioneer');

  // Next turn the pioneer comes up first; a click on the soldier ashore makes him the active unit.
  await command(page, 'endTurn').click();
  await settled(page);
  await clickSquare(page, canvas, ship.x - 1, ship.y);
  await expect(field(page, 'unit')).toHaveText('Soldier');
  await expect(field(page, 'location')).toHaveText(`(${ship.x - 1}, ${ship.y})`);

  await command(page, 'buildColony').click();
  const build = dialog.getByRole('button', { name: 'Build the colony' });
  const name = dialog.getByRole('textbox');
  for (let i = 0; i < 3; i++) {
    await expect(build.or(name)).toBeVisible();
    if (await name.isVisible()) break;
    await build.click();
  }
  await expect(name).toHaveValue('Jamestown');
  await dialog.getByRole('button', { name: 'OK' }).click();
  await expect(page.locator('.colony-screen')).toBeVisible();
  await page.locator('.colony-close').click();
  await expect(page.locator('.colony-screen')).toHaveCount(0);

  // A click on the colony opens it again.
  await clickSquare(page, canvas, ship.x - 1, ship.y);
  await expect(page.locator('.colony-screen')).toBeVisible();
  await page.locator('.colony-close').click();

  // A report and a menu from the bar.
  await command(page, 'reports').click();
  await dialog.getByRole('button', { name: 'Colony Adviser' }).click();
  await expect(page.locator('.report-screen')).toContainText('Jamestown');
  await page.locator('.report-close').click();
  await command(page, 'menus').click();
  await dialog.getByRole('button', { name: 'Game options' }).click();
  await expect(page.getByRole('dialog')).toContainText('Game Options');
  await page.getByRole('dialog').getByRole('button').last().click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  const turn = Number(await canvas.getAttribute('data-turn'));
  await command(page, 'skip').click();
  await command(page, 'endTurn').click();
  await expect.poll(async () => Number(await canvas.getAttribute('data-turn'))).toBeGreaterThan(turn);
  expect(await page.locator('html').getAttribute('data-key-used')).toBeNull();
});

test('dragging from the active unit sends it there; dragging from elsewhere pans', async ({ page }) => {
  await page.goto('/?seed=7');
  await page.getByRole('menuitem', { name: 'Start a Game in America' }).click();
  const canvas = page.locator('canvas.map');
  await expect(field(page, 'unit')).toHaveText('Caravel');
  const box = (await canvas.boundingBox())!;
  const drag = async (from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> => {
    await page.mouse.move(box.x + from.x, box.y + from.y);
    await page.mouse.down();
    await page.mouse.move(box.x + to.x, box.y + to.y, { steps: 6 });
    await page.mouse.up();
    await settled(page);
  };

  // three squares west: farther than one step, so the ship is given a Go To and sails at once
  const start = await spot(page);
  const before = await viewOf(canvas);
  await drag(await pixel(canvas, start.x, start.y), await pixel(canvas, start.x - 3, start.y));
  expect((await viewOf(canvas)).originY).toBe(before.originY);
  // it arrives with a move to spare and asks for orders again from its new square
  await expect(field(page, 'location')).toHaveText(`(${start.x - 3}, ${start.y})`);
  await expect(field(page, 'unit')).toHaveText('Caravel');
  const now = await spot(page);

  // one square: a single step
  await drag(await pixel(canvas, now.x, now.y), await pixel(canvas, now.x, now.y + 1));
  // that was its last move: it is found on the new square when the next turn asks for its orders
  await expect(field(page, 'unit')).toHaveText('No active unit');
  await command(page, 'endTurn').click();
  await expect(field(page, 'location')).toHaveText(`(${now.x}, ${now.y + 1})`);

  // a drag begun off the unit pans the view and moves nobody
  const here = await spot(page);
  const p = await pixel(canvas, here.x + 3, here.y + 2);
  const view = await viewOf(canvas);
  await drag(p, { x: p.x - 128, y: p.y });
  expect((await viewOf(canvas)).originX).toBe(view.originX + 2);
  await expect(field(page, 'location')).toHaveText(`(${here.x}, ${here.y})`);
});

test('the wheel zooms about the pointer, and the Go To cursor follows it', async ({ page }) => {
  await page.goto('/?reveal');
  await page.getByRole('menuitem', { name: 'Start a Game in America' }).click();
  const canvas = page.locator('canvas.map');
  await expect(canvas).toHaveAttribute('data-view', /tileSize/);
  expect((await viewOf(canvas)).zoom).toBe(3);
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 300, box.y + 300);
  await page.mouse.wheel(0, 120);
  await expect.poll(async () => (await viewOf(canvas)).zoom).toBe(2);
  await page.waitForTimeout(200);
  await page.mouse.wheel(0, -120);
  await expect.poll(async () => (await viewOf(canvas)).zoom).toBe(3);
  await command(page, 'zoomOut').click();
  await expect.poll(async () => (await viewOf(canvas)).zoom).toBe(2);
  await command(page, 'zoomIn').click();
  await expect.poll(async () => (await viewOf(canvas)).zoom).toBe(3);

  // Go To from the bar, then a click on the square: no list of colonies yet, so the map is the choice
  const from = await spot(page);
  await command(page, 'goTo').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Pick a square on the map' }).click();
  await expect(canvas).toHaveAttribute('data-mode', 'goto');
  const target = await pixel(canvas, from.x - 2, from.y + 1);
  await page.mouse.move(box.x + target.x, box.y + target.y);
  await expect(field(page, 'location')).toHaveText(`(${from.x - 2}, ${from.y + 1})`);
  await page.mouse.click(box.x + target.x, box.y + target.y);
  await expect(canvas).toHaveAttribute('data-mode', 'move');
});
