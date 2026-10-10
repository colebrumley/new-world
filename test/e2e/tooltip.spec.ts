import { expect, test, type Locator, type Page } from '@playwright/test';
import { saveGame } from '../../src/engine/save';
import type { GameState } from '../../src/engine/state';
import { makeTile } from '../../src/engine/tile';
import { tileTip, TOOLTIP_DELAY_MS } from '../../src/ui/tile-tooltip';
import { withUnit, world } from '../helpers/world';

// The slip that describes the square under a resting pointer (R-1020). The game is a small world
// laid out by hand, so the squares with something to say are at known places.

const COTTON = { x: 5, y: 4 }; // prairie with Prime Cotton
const MINERALS = { x: 6, y: 4 }; // tundra with Minerals, next to it
const POND = { x: 8, y: 4 }; // ocean with land all round it
const UNSEEN = { x: 5, y: 5 }; // plains the player has not explored, below the cotton
/** Longer than the wait, with room for a busy machine. */
const RESTED = TOOLTIP_DELAY_MS + 250;

function land(): GameState {
  const rows = Array.from({ length: 12 }, (_, y) => (y === 0 || y === 11 ? '~'.repeat(16) : `~${'.'.repeat(14)}~`));
  let state: GameState = world({ rows, seed: 3, players: [{ id: 'p0', kind: 'human' }, { id: 'fr', kind: 'ai', nation: 'france' }] });
  const tiles = state.map.tiles.map((tile) => ({ ...tile, explored: 0xff }));
  const put = (at: { x: number; y: number }, t: Parameters<typeof makeTile>[0]): void => {
    tiles[at.y * 16 + at.x] = makeTile({ explored: 0xff, ...t });
  };
  put(COTTON, { base: 'prairie', resource: 'primeCotton' });
  put(MINERALS, { base: 'tundra', resource: 'minerals', river: 'minor' });
  put(POND, { base: 'ocean' });
  put(UNSEEN, { base: 'plains', explored: 0 });
  state = { ...state, map: { ...state.map, tiles } };
  // someone to give orders to, well away from the squares the pointer visits
  return withUnit(state, { id: 'u0', type: 'soldier', owner: 'p0', profession: null, x: 2, y: 9, orders: 'none' });
}

async function start(page: Page, query: string): Promise<{ canvas: Locator; tip: Locator; state: GameState }> {
  const state = land();
  await page.addInitScript(() => localStorage.setItem('new-world:options', JSON.stringify({ tutorialHints: false, waterShimmer: false })));
  await page.addInitScript((text) => {
    // (kept from one load of the page to the next, as an autosave is)
    if (!localStorage.getItem('new-world:autosave')) localStorage.setItem('new-world:autosave', text);
  }, saveGame({ options: { seed: 3 }, log: [], state }));
  await page.goto(query);
  await page.getByRole('menuitem', { name: 'Load Game' }).click();
  const canvas = page.locator('canvas.map');
  await expect(canvas).toHaveAttribute('data-frames', /\d+/);
  await expect(canvas).toHaveAttribute('data-active', 'u0');
  return { canvas, tip: page.locator('.map-tooltip'), state };
}

/** The middle of a map square, in page pixels. */
async function pixel(canvas: Locator, at: { x: number; y: number }): Promise<{ x: number; y: number }> {
  const v = await canvas.evaluate((c) => JSON.parse((c as HTMLCanvasElement).dataset['view']!) as { tileSize: number; originX: number; originY: number });
  const box = (await canvas.boundingBox())!;
  const p = { x: box.x + (at.x - v.originX + 0.5) * v.tileSize, y: box.y + (at.y - v.originY + 0.5) * v.tileSize };
  expect(p.x > box.x && p.x < box.x + box.width && p.y > box.y && p.y < box.y + box.height, `square ${at.x},${at.y} is in sight`).toBe(true);
  return p;
}

async function moveTo(page: Page, canvas: Locator, at: { x: number; y: number }): Promise<void> {
  const p = await pixel(canvas, at);
  await page.mouse.move(p.x, p.y);
}

/** How many times the map has been drawn: redraws asked for, and animation steps. */
const drawn = async (canvas: Locator): Promise<string> => `${await canvas.getAttribute('data-frames')} ${await canvas.getAttribute('data-ticks')}`;

test('the pointer resting on a square brings up a slip that says what the square is', async ({ page }) => {
  const { canvas, tip, state } = await start(page, '/?reveal&still');
  await expect(tip).toBeHidden();
  await expect(tip).toHaveAttribute('role', 'tooltip');
  const sidebar = await page.locator('.sidebar').innerText();

  // not at once: the pointer has to rest
  await moveTo(page, canvas, COTTON);
  await page.waitForTimeout(TOOLTIP_DELAY_MS / 4);
  await expect(tip).toBeHidden();
  const before = await drawn(canvas);
  await expect(tip).toBeVisible({ timeout: RESTED });
  await expect(tip.locator('.map-tooltip-title')).toHaveText('Prairie');
  await expect(tip).toContainText('Prime Cotton: doubles Cotton');
  const cotton = tileTip(state, COTTON.x, COTTON.y, true)!;
  expect(cotton.yields).toContain('Cotton');
  await expect(tip.locator('.map-tooltip-yields')).toHaveText(cotton.yields);
  await expect(tip.locator('.map-tooltip-ground')).toHaveText(cotton.ground);
  await expect(tip.locator('p')).toHaveCount(4);
  await page.screenshot({ path: 'test-results/tooltip.png' });

  // it lies beside the pointer, on the map, and lets the mouse through
  const at = await pixel(canvas, COTTON);
  const slip = (await tip.boundingBox())!;
  expect(slip.x).toBeCloseTo(at.x + 14, 0);
  expect(slip.y).toBeCloseTo(at.y + 14, 0);
  await expect(tip).toHaveCSS('pointer-events', 'none');
  await expect(tip).toHaveCSS('z-index', '4');

  // the neighbouring square: the words change with no second wait
  await moveTo(page, canvas, MINERALS);
  await expect(tip.locator('.map-tooltip-title')).toHaveText('Tundra', { timeout: TOOLTIP_DELAY_MS / 2 });
  await expect(tip).toContainText('Minerals: +3 Ore, +1 Silver');
  await expect(tip).toContainText('Minor River');
  await expect(tip.locator('.map-tooltip-yields')).toHaveText(tileTip(state, MINERALS.x, MINERALS.y, true)!.yields);

  // the sea
  await moveTo(page, canvas, POND);
  await expect(tip.locator('.map-tooltip-title')).toHaveText('Ocean', { timeout: TOOLTIP_DELAY_MS / 2 });
  await expect(tip.locator('.map-tooltip-yields')).toHaveText('4 Fish');

  // none of that drew the map again, nor changed the sidebar
  expect(await drawn(canvas)).toBe(before);
  expect(await page.locator('.sidebar').innerText()).toBe(sidebar);

  // a press of the button takes it away, and the wait starts over with the next movement
  await page.mouse.down();
  await expect(tip).toBeHidden();
  await page.mouse.up();
  await page.waitForTimeout(RESTED);
  await expect(tip).toBeHidden();
  await moveTo(page, canvas, COTTON);
  await expect(tip).toBeHidden();
  await expect(tip.locator('.map-tooltip-title')).toHaveText('Prairie', { timeout: RESTED });
  await expect(tip).toBeVisible();

  // a key the map answers takes it away
  await page.keyboard.press('c');
  await expect(tip).toBeHidden();
  await moveTo(page, canvas, MINERALS);
  await expect(tip).toBeVisible({ timeout: RESTED });

  // so does the wheel
  await page.mouse.wheel(0, 1);
  await expect(tip).toBeHidden();
  await moveTo(page, canvas, COTTON);
  await expect(tip).toBeVisible({ timeout: RESTED });

  // a button held as the pointer comes onto the map is not a rest
  const side = (await page.locator('.sidebar').boundingBox())!;
  await page.mouse.move(side.x + side.width / 2, side.y + side.height / 2);
  await page.mouse.down();
  await moveTo(page, canvas, MINERALS);
  await moveTo(page, canvas, COTTON);
  await page.waitForTimeout(RESTED);
  await expect(tip).toBeHidden();
  await page.mouse.up();
  await moveTo(page, canvas, MINERALS);
  await expect(tip).toBeVisible({ timeout: RESTED });

  // and the pointer leaving the map
  await page.mouse.move(side.x + side.width / 2, side.y + side.height / 2);
  await expect(tip).toBeHidden();
  await page.waitForTimeout(RESTED);
  await expect(tip).toBeHidden();
});

test('near the right and bottom edges the slip turns to the other side of the pointer and stays on the map', async ({ page }) => {
  const { canvas, tip } = await start(page, '/?reveal&still');
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width - 3, box.y + box.height / 2);
  // (the pointer at the edge may scroll the view, which puts the slip off; where the map ends it rests)
  const corner = { x: box.x + box.width - 40, y: box.y + box.height - 40 };
  await page.mouse.move(corner.x, corner.y);
  await expect(tip).toBeVisible({ timeout: RESTED });
  const slip = (await tip.boundingBox())!;
  expect(slip.x + slip.width).toBeLessThanOrEqual(corner.x);
  expect(slip.y + slip.height).toBeLessThanOrEqual(corner.y);
  expect(slip.x).toBeGreaterThanOrEqual(box.x);
  expect(slip.y).toBeGreaterThanOrEqual(box.y);
});

test('an unexplored square has no slip, and a dialog over the map takes the slip away', async ({ page }) => {
  const { canvas, tip } = await start(page, '/?still');
  await moveTo(page, canvas, UNSEEN);
  await page.waitForTimeout(RESTED);
  await expect(tip).toBeHidden();
  await moveTo(page, canvas, COTTON);
  await expect(tip).toBeVisible({ timeout: RESTED });
  // crossing into the unexplored square hides it; coming back waits again
  await moveTo(page, canvas, UNSEEN);
  await expect(tip).toBeHidden();
  await moveTo(page, canvas, COTTON);
  await expect(tip).toBeHidden();
  await expect(tip).toBeVisible({ timeout: RESTED });

  // the encyclopedia opens over the map; no press, key or movement comes with it, so it is the dialog that takes the slip away
  const at = await pixel(canvas, COTTON);
  await canvas.evaluate((c, p) => c.dispatchEvent(new MouseEvent('contextmenu', { clientX: p.x, clientY: p.y, button: 2, bubbles: true, cancelable: true })), at);
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(tip).toBeHidden();
  await page.waitForTimeout(RESTED);
  await expect(tip).toBeHidden();
});

test('with Terrain tooltips switched off nothing is shown; switched on again it is', async ({ page }) => {
  const { canvas, tip } = await start(page, '/?reveal&still');
  await moveTo(page, canvas, COTTON);
  await expect(tip).toBeVisible({ timeout: RESTED });

  await page.keyboard.press('Alt+G');
  const game = page.getByRole('dialog', { name: 'Game Options' });
  await expect(tip).toBeHidden();
  await game.getByLabel('Terrain tooltips').uncheck();
  await page.keyboard.press('Escape');
  await expect(game).toHaveCount(0);
  await moveTo(page, canvas, MINERALS);
  await moveTo(page, canvas, COTTON);
  await page.waitForTimeout(RESTED);
  await expect(tip).toBeHidden();

  // the option takes effect at once, both ways
  await page.keyboard.press('Alt+G');
  await game.getByLabel('Terrain tooltips').check();
  await page.keyboard.press('Escape');
  await expect(game).toHaveCount(0);
  await moveTo(page, canvas, MINERALS);
  await expect(tip.locator('.map-tooltip-title')).toHaveText('Tundra', { timeout: RESTED });
});

test.describe('on a device that cannot hover', () => {
  test.use({ hasTouch: true, isMobile: true });
  test('a pointer over the map brings up nothing', async ({ page }) => {
    const { canvas, tip } = await start(page, '/?reveal&still');
    test.skip(await page.evaluate(() => window.matchMedia('(hover: hover)').matches), 'this browser says it can hover');
    await moveTo(page, canvas, COTTON);
    await page.waitForTimeout(RESTED);
    await expect(tip).toBeHidden();
  });
});
