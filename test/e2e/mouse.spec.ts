import { expect, test, type Locator, type Page } from '@playwright/test';
import { field, foundJamestown, settled } from './helpers';

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
  await expect(canvas).toHaveAttribute('data-mode', 'goto');
  const target = await pixel(canvas, from.x - 2, from.y + 1);
  await page.mouse.move(box.x + target.x, box.y + target.y);
  await expect(field(page, 'location')).toHaveText(`(${from.x - 2}, ${from.y + 1})`);
  await page.mouse.click(box.x + target.x, box.y + target.y);
  await expect(canvas).toHaveAttribute('data-mode', 'move');
});

test('End turn ends the turn while a Go To square is being picked, and Go to reads Cancel meanwhile', async ({ page }) => {
  await page.goto('/?seed=7');
  await page.getByRole('menuitem', { name: 'Start a Game in America' }).click();
  const canvas = page.locator('canvas.map');
  await expect(field(page, 'unit')).toHaveText('Caravel');
  const start = await spot(page);
  const box = (await canvas.boundingBox())!;
  const far = await pixel(canvas, start.x - 3, start.y + 1);

  // Cancel gives the targeting up and orders nothing
  await command(page, 'goTo').click();
  await expect(canvas).toHaveAttribute('data-mode', 'goto');
  await expect(command(page, 'goTo')).toHaveText('Cancel');
  await page.mouse.move(box.x + far.x, box.y + far.y);
  await command(page, 'goTo').click();
  await expect(canvas).toHaveAttribute('data-mode', 'move');
  await expect(command(page, 'goTo')).toHaveText('Go to');
  await expect(field(page, 'location')).toHaveText(`(${start.x}, ${start.y})`);
  await expect(field(page, 'orders')).toHaveText('No orders');

  // End turn with a destination under the pointer: the turn ends and the ship has not been sent anywhere
  await command(page, 'goTo').click();
  await page.mouse.move(box.x + far.x, box.y + far.y);
  await expect(field(page, 'location')).toHaveText(`(${start.x - 3}, ${start.y + 1})`);
  await command(page, 'endTurn').click();
  await expect(canvas).toHaveAttribute('data-turn', '1');
  await expect(canvas).toHaveAttribute('data-mode', 'move');
  await expect(field(page, 'unit')).toHaveText('Caravel');
  await expect(field(page, 'location')).toHaveText(`(${start.x}, ${start.y})`);
  await expect(field(page, 'orders')).toHaveText('No orders');
});

test('in view mode a click on the active unit gives it back the orders', async ({ page }) => {
  await page.goto('/?seed=7');
  await page.getByRole('menuitem', { name: 'Start a Game in America' }).click();
  const canvas = page.locator('canvas.map');
  await expect(field(page, 'unit')).toHaveText('Caravel');
  const start = await spot(page);
  await page.keyboard.press('v');
  await expect(canvas).toHaveAttribute('data-mode', 'view');
  await expect(command(page, 'wait')).toBeDisabled();
  await clickSquare(page, canvas, start.x, start.y);
  await expect(canvas).toHaveAttribute('data-mode', 'move');
  await expect(field(page, 'unit')).toHaveText('Caravel');
  await expect(command(page, 'wait')).toBeEnabled();
});

test('the destination marker stays under the pointer while the view scrolls beneath it', async ({ page }) => {
  await page.goto('/?reveal');
  await page.getByRole('menuitem', { name: 'Start a Game in America' }).click();
  const canvas = page.locator('canvas.map');
  await expect(canvas).toHaveAttribute('data-view', /tileSize/);
  const box = (await canvas.boundingBox())!;
  /** The square under a canvas pixel, by the view as it now is. */
  const squareAt = async (x: number, y: number): Promise<string> => {
    const v = await viewOf(canvas);
    return `(${Math.floor(v.originX + x / v.tileSize)}, ${Math.floor(v.originY + y / v.tileSize)})`;
  };

  await command(page, 'goTo').click();
  await expect(canvas).toHaveAttribute('data-mode', 'goto');
  // rest at the left edge: the view scrolls west, and the cursor goes with the pointer
  const before = await viewOf(canvas);
  await page.mouse.move(box.x + 300, box.y + 300);
  await page.mouse.move(box.x + 5, box.y + 300);
  await expect.poll(async () => (await viewOf(canvas)).originX).toBeLessThan(before.originX - 3);
  // (the view may still be moving: read both in one frame's time, until they agree)
  await expect.poll(async () => (await field(page, 'location').textContent()) === (await squareAt(5, 300))).toBe(true);
  await page.mouse.move(box.x + 300, box.y + 300);
  await settled(page);
  await expect(field(page, 'location')).toHaveText(await squareAt(300, 300));

  // the wheel moves the map under the pointer too
  await page.mouse.move(box.x + 700, box.y + 500);
  await page.mouse.wheel(0, 120);
  await expect.poll(async () => (await viewOf(canvas)).zoom).toBe(2);
  await settled(page);
  await expect(field(page, 'location')).toHaveText(await squareAt(700, 500));
});

test('a drag orders the unit it began on, and is dropped if another has become the active one', async ({ page }) => {
  await page.goto('/?seed=7');
  await page.getByRole('menuitem', { name: 'Start a Game in America' }).click();
  const canvas = page.locator('canvas.map');
  await expect(field(page, 'unit')).toHaveText('Caravel');
  const dialog = page.getByRole('dialog');
  for (let step = 0; step < 12 && !(await dialog.isVisible()); step++) {
    if ((await field(page, 'unit').textContent()) === 'No active unit') {
      await command(page, 'endTurn').click();
      await settled(page);
    }
    const at = await spot(page);
    await clickSquare(page, canvas, at.x - 1, at.y);
  }
  await dialog.getByRole('button', { name: 'Make landfall' }).click();
  await expect(field(page, 'unit')).toHaveText('Soldier');
  const ship = await spot(page);
  const box = (await canvas.boundingBox())!;
  const from = await pixel(canvas, ship.x, ship.y);
  const to = await pixel(canvas, ship.x - 1, ship.y);

  // the soldier is dragged toward the shore; W, with the button still down, brings up the pioneer
  await page.mouse.move(box.x + from.x, box.y + from.y);
  await page.mouse.down();
  await page.mouse.move(box.x + to.x, box.y + to.y, { steps: 5 });
  await page.keyboard.press('w');
  await expect(field(page, 'unit')).toHaveText('Pioneer');
  await page.mouse.up();
  await settled(page);
  // nobody has gone ashore: both are still aboard and still to be given orders
  await expect(field(page, 'unit')).toHaveText('Pioneer');
  await expect(field(page, 'location')).toHaveText(`(${ship.x}, ${ship.y})`);
  // (the ship may come up in between)
  for (let i = 0; i < 4 && (await field(page, 'unit').textContent()) !== 'Soldier'; i++) {
    await page.keyboard.press('w');
    await settled(page);
  }
  await expect(field(page, 'unit')).toHaveText('Soldier');
  await expect(field(page, 'location')).toHaveText(`(${ship.x}, ${ship.y})`);

  // the same drag left alone puts the soldier ashore
  await page.mouse.move(box.x + from.x, box.y + from.y);
  await page.mouse.down();
  await page.mouse.move(box.x + to.x, box.y + to.y, { steps: 5 });
  await page.mouse.up();
  await expect(field(page, 'unit')).toHaveText('Pioneer');
});

test('at 1024x640 the sidebar keeps what the game says in sight', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 640 });
  await page.goto('/?seed=7');
  await page.getByRole('menuitem', { name: 'Start a Game in America' }).click();
  await expect(field(page, 'unit')).toHaveText('Caravel');
  await command(page, 'road').click();
  const status = field(page, 'status');
  await expect(status).not.toHaveText('');
  await expect(status).toBeInViewport({ ratio: 1 });
  // the passengers can be reached by scrolling the sidebar
  const sidebar = page.locator('.sidebar');
  const last = page.locator('.sidebar-aboard li').last();
  await sidebar.hover();
  await page.mouse.wheel(0, 400);
  await expect(last).toBeInViewport({ ratio: 1 });
});

test('a trackpad pinch never magnifies the page, on the map or over the colony screen', async ({ page }) => {
  await foundJamestown(page);
  // a pinch reaches the page as a wheel event with Ctrl held; left alone, the browser zooms the page
  const pinch = (selector: string): Promise<boolean> =>
    page.locator(selector).first().evaluate((node) => !node.dispatchEvent(new WheelEvent('wheel', { deltaY: -4, ctrlKey: true, bubbles: true, cancelable: true })));
  for (const place of ['.colony-screen', '.colony-screen .square', '.colony-warehouse']) expect(await pinch(place), place).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('.colony-screen')).toHaveCount(0);
  for (const place of ['canvas.map', '.sidebar', '.command-bar button']) expect(await pinch(place), place).toBe(true);
  // an ordinary turn of the wheel still scrolls a list
  const scroll = await page.locator('.sidebar').evaluate((node) => !node.dispatchEvent(new WheelEvent('wheel', { deltaY: 40, bubbles: true, cancelable: true })));
  expect(scroll).toBe(false);
  expect(await page.locator('.game').evaluate((node) => getComputedStyle(node).touchAction)).toBe('pan-x pan-y');
});
