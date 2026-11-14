import { expect, test, type CDPSession, type Locator, type Page } from '@playwright/test';
import { saveGame } from '../../src/engine/save';
import { MOVE_THIRDS, OFF_MAP, type GameState } from '../../src/engine/state';
import { setTile, withColony, withUnit, world } from '../helpers/world';
import { field, settled } from './helpers';
import { longPress, pinch, POSTURES, tap, touchDrag } from './postures';

// Fingers on the map, and the long press that looks a thing up (R-1073, docs/specs/phone-play.md W3).
// A plain world laid out by hand: our soldier under orders in the middle, a second soldier of ours
// on sentry to the east, our colony to the west, and a caravel lying in Europe.

const SOLDIER = { x: 20, y: 15 };
const OTHER = { x: 24, y: 15 };
const COLONY = { x: 16, y: 15 };
const POND = { x: 20, y: 12 }; // a square of sea in the land, three north of the soldier

/** A plain `width` by `height`, the sea two squares deep round it. */
function land(width = 40, height = 30): GameState {
  const rows = Array.from({ length: height }, (_, y) => (y < 2 || y >= height - 2 ? '~'.repeat(width) : `~~${'.'.repeat(width - 4)}~~`));
  let state = world({ rows, seed: 9, players: [{ id: 'p0', kind: 'human', nation: 'england' }] });
  // (moves enough for every step a test asks of him in one turn)
  state = withUnit(state, { id: 'u0', type: 'soldier', owner: 'p0', profession: null, ...SOLDIER, movesLeft: 20 * MOVE_THIRDS });
  state = withUnit(state, { id: 'u1', type: 'soldier', owner: 'p0', profession: null, ...OTHER, orders: 'sentry', movesLeft: 20 * MOVE_THIRDS });
  state = setTile(state, POND.x, POND.y, { base: 'ocean' });
  state = withColony(state, { id: 'c0', owner: 'p0', name: 'Hope', ...COLONY, buildings: ['townHall'] });
  state = withUnit(state, { id: 'ship', type: 'caravel', owner: 'p0', profession: null, x: OFF_MAP, y: OFF_MAP });
  return { ...state, units: { ...state.units, ship: { ...state.units['ship']!, voyage: { phase: 'inEurope', turnsLeft: 0, origin: [0, 15] } } } };
}

interface ViewData { tileSize: number; originX: number; originY: number; width: number; height: number }
const viewOf = (canvas: Locator): Promise<ViewData> => canvas.evaluate((c) => JSON.parse((c as HTMLCanvasElement).dataset['view']!) as ViewData);

/** The middle of a map square, in the window's pixels. */
async function at(canvas: Locator, square: { x: number; y: number }): Promise<{ x: number; y: number }> {
  const v = await viewOf(canvas);
  const box = (await canvas.boundingBox())!;
  return { x: box.x + (square.x - v.originX + 0.5) * v.tileSize, y: box.y + (square.y - v.originY + 0.5) * v.tileSize };
}

/** The square under a point of the window. */
async function squareAt(canvas: Locator, p: { x: number; y: number }): Promise<{ x: number; y: number }> {
  const v = await viewOf(canvas);
  const box = (await canvas.boundingBox())!;
  return { x: Math.floor(v.originX + (p.x - box.x) / v.tileSize), y: Math.floor(v.originY + (p.y - box.y) / v.tileSize) };
}

/** Fingers put down, moved and lifted one event at a time, through the browser's debugging protocol. */
async function hand(page: Page): Promise<(type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel', points?: readonly { x: number; y: number }[]) => Promise<void>> {
  const cdp: CDPSession = await page.context().newCDPSession(page);
  return async (type, points = []) => {
    await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p, id) => ({ x: p.x, y: p.y, id, radiusX: 4, radiusY: 4, force: 1 })) });
  };
}

async function start(page: Page, state: GameState = land()): Promise<{ canvas: Locator; slip: Locator }> {
  // the Terrain tooltips option off: a long press shows the slip all the same
  await page.addInitScript(() => localStorage.setItem('new-world:options', JSON.stringify({ tutorialHints: false, waterShimmer: false, terrainTooltips: false })));
  await page.addInitScript((text) => {
    if (!localStorage.getItem('new-world:autosave')) localStorage.setItem('new-world:autosave', text);
  }, saveGame({ options: { seed: 9 }, log: [], state }));
  await page.goto('/?still');
  const load = page.getByRole('menuitem', { name: 'Load Game' });
  await tap(page, load);
  // each touch test begins with the pointer taken for a finger: it fails, never skips, if not
  await expect(page.locator('html')).toHaveAttribute('data-pointer', 'coarse');
  const canvas = page.locator('canvas.map');
  await expect(canvas).toHaveAttribute('data-active', 'u0');
  await settled(page);
  return { canvas, slip: page.locator('.map-tooltip') };
}

const location = (page: Page): Locator => field(page, 'location');

/** Go To from the command bar, choosing a square on the map over our colony. */
async function pickGoTo(page: Page): Promise<void> {
  await tap(page, page.locator('.command-bar [data-command="goTo"]'));
  await tap(page, page.getByRole('dialog').getByRole('button', { name: 'Pick a square on the map' }));
  await expect(page.locator('canvas.map')).toHaveAttribute('data-mode', 'goto');
}
const pedia = (page: Page): Locator => page.getByRole('dialog', { name: 'Encyclopedia' });

test.describe('fingers on the map', () => {
  test.use({ viewport: { width: 1280, height: 800 }, hasTouch: true });

  test('a tap does what a click does: centres, steps, picks a unit, opens our colony, sets a Go To', async ({ page }) => {
    const { canvas } = await start(page);
    // on an empty square away from the soldier, the view centres there
    const far = { x: SOLDIER.x + 3, y: SOLDIER.y - 3 };
    await tap(page, await at(canvas, far));
    await settled(page);
    const v = await viewOf(canvas);
    expect(Math.abs(v.originX + v.width / v.tileSize / 2 - (far.x + 0.5))).toBeLessThanOrEqual(1);
    expect(Math.abs(v.originY + v.height / v.tileSize / 2 - (far.y + 0.5))).toBeLessThanOrEqual(1);
    await expect(location(page)).toHaveText(`(${SOLDIER.x}, ${SOLDIER.y})`);

    // beside the active unit, it steps there
    await tap(page, await at(canvas, { x: SOLDIER.x + 1, y: SOLDIER.y }));
    await expect(location(page)).toHaveText(`(${SOLDIER.x + 1}, ${SOLDIER.y})`);

    // on another unit of ours, that one is picked (and woken)
    await tap(page, await at(canvas, OTHER));
    await expect(canvas).toHaveAttribute('data-active', 'u1');
    await expect(field(page, 'orders')).toHaveText('No orders');

    // while a destination is picked, a tap is the destination
    await pickGoTo(page);
    await tap(page, await at(canvas, { x: OTHER.x + 6, y: OTHER.y }));
    await expect(canvas).toHaveAttribute('data-mode', 'move');
    await expect(location(page)).not.toHaveText(`(${OTHER.x}, ${OTHER.y})`);

    // our colony opens
    await tap(page, await at(canvas, COLONY));
    await expect(page.locator('.colony-screen')).toBeVisible();
  });

  test('a tap ends the hidden-terrain look, as a key does', async ({ page }) => {
    const { canvas } = await start(page);
    await tap(page, page.locator('.command-bar [data-command="hiddenTerrain"]'));
    await expect(canvas).toHaveAttribute('data-hidden', 'true');
    await tap(page, await at(canvas, { x: SOLDIER.x + 4, y: SOLDIER.y + 4 }));
    await expect(canvas).toHaveAttribute('data-hidden', 'false');
  });

  test('one finger dragged across the map pans it, keeping its square under it, and orders nothing', async ({ page }) => {
    const { canvas } = await start(page);
    const from = await at(canvas, { x: SOLDIER.x + 2, y: SOLDIER.y + 1 });
    const to = { x: from.x - 260, y: from.y - 150 };
    const before = await viewOf(canvas);
    await touchDrag(page, from, to, { steps: 20 });
    await settled(page);
    const after = await viewOf(canvas);
    expect(after.originX).toBeGreaterThan(before.originX);
    expect(after.originY).toBeGreaterThan(before.originY);
    const under = await squareAt(canvas, to);
    expect(Math.abs(under.x - (SOLDIER.x + 2))).toBeLessThanOrEqual(1);
    expect(Math.abs(under.y - (SOLDIER.y + 1))).toBeLessThanOrEqual(1);
    // no order, nothing selected, no destination
    await expect(location(page)).toHaveText(`(${SOLDIER.x}, ${SOLDIER.y})`);
    await expect(canvas).toHaveAttribute('data-active', 'u0');
    await expect(canvas).toHaveAttribute('data-mode', 'move');
    await expect(canvas).toHaveAttribute('data-aim', '');
  });

  test('a finger from the active unit sends it, with the marker, and scrolls the view only near an edge while it does', async ({ page }) => {
    const { canvas } = await start(page);
    const touch = await hand(page);
    const unit = await at(canvas, SOLDIER);
    const target = await at(canvas, { x: SOLDIER.x + 4, y: SOLDIER.y });
    await touch('touchStart', [unit]);
    for (let i = 1; i <= 8; i++) await touch('touchMove', [{ x: unit.x + ((target.x - unit.x) * i) / 8, y: unit.y }]);
    await expect(canvas).toHaveAttribute('data-aim', `${SOLDIER.x + 4},${SOLDIER.y},ok`);
    // the sea is refused, as the mouse's drag shows it
    await touch('touchMove', [await at(canvas, POND)]);
    await expect(canvas).toHaveAttribute('data-aim', `${POND.x},${POND.y},blocked`);
    const box = (await canvas.boundingBox())!;
    // within --tap of the right edge the view scrolls
    const before = await viewOf(canvas);
    await touch('touchMove', [{ x: box.x + box.width - 20, y: unit.y }]);
    await expect.poll(async () => (await viewOf(canvas)).originX).toBeGreaterThan(before.originX);
    // back on the target, and lifted: a Go To there
    await touch('touchMove', [await at(canvas, { x: SOLDIER.x + 4, y: SOLDIER.y })]);
    await touch('touchEnd');
    await expect(canvas).toHaveAttribute('data-aim', '');
    await expect(location(page)).not.toHaveText(`(${SOLDIER.x}, ${SOLDIER.y})`);

    // a finger that pans and rests near the edge does not scroll the view
    await touch('touchStart', [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }]);
    await touch('touchMove', [{ x: box.x + box.width - 60, y: box.y + box.height / 2 }]);
    await touch('touchMove', [{ x: box.x + box.width - 20, y: box.y + box.height / 2 }]);
    await settled(page);
    const resting = await viewOf(canvas);
    await page.waitForTimeout(400);
    expect((await viewOf(canvas)).originX).toBe(resting.originX);
    await touch('touchEnd');
  });

  test('a finger from the active unit let go off the map sends it nowhere', async ({ page }) => {
    const { canvas } = await start(page);
    const touch = await hand(page);
    const unit = await at(canvas, SOLDIER);
    const box = (await canvas.boundingBox())!;
    const before = await viewOf(canvas);
    await touch('touchStart', [unit]);
    for (let i = 1; i <= 6; i++) await touch('touchMove', [{ x: unit.x + i * 30, y: unit.y }]);
    await expect(canvas).not.toHaveAttribute('data-aim', '');
    // over the sidebar, and let go there: nothing at all happens
    await touch('touchMove', [{ x: box.x + box.width + 60, y: unit.y }]);
    await expect(canvas).toHaveAttribute('data-aim', '');
    await touch('touchEnd');
    await settled(page);
    await expect(location(page)).toHaveText(`(${SOLDIER.x}, ${SOLDIER.y})`);
    await expect(canvas).toHaveAttribute('data-active', 'u0');
    expect(await viewOf(canvas)).toEqual(before);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('a finger already down when a dialog comes over the map does nothing more: no tap, no pan, no order', async ({ page }) => {
    const { canvas } = await start(page);
    const touch = await hand(page);
    const dialog = page.getByRole('dialog');
    // a tap begun on an empty square, the Go To question asked before it lifts
    const before = await viewOf(canvas);
    await touch('touchStart', [await at(canvas, { x: SOLDIER.x + 3, y: SOLDIER.y + 3 })]);
    await page.keyboard.press('g');
    await expect(dialog).toContainText('Go to which place?');
    await touch('touchEnd');
    await settled(page);
    expect(await viewOf(canvas)).toEqual(before);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);

    // a pan under way
    const middle = await at(canvas, { x: SOLDIER.x + 2, y: SOLDIER.y + 2 });
    await touch('touchStart', [middle]);
    await touch('touchMove', [{ x: middle.x - 40, y: middle.y }]);
    await touch('touchMove', [{ x: middle.x - 80, y: middle.y }]);
    await page.keyboard.press('g');
    await expect(dialog).toContainText('Go to which place?');
    const panned = await viewOf(canvas);
    await touch('touchMove', [{ x: middle.x - 300, y: middle.y }]);
    await touch('touchEnd');
    await settled(page);
    expect(await viewOf(canvas)).toEqual(panned);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);

    // a drag from the unit under way, let go beside it
    const unit = await at(canvas, SOLDIER);
    const next = await at(canvas, { x: SOLDIER.x + 1, y: SOLDIER.y });
    await touch('touchStart', [unit]);
    await touch('touchMove', [{ x: (unit.x + next.x) / 2, y: unit.y }]);
    await touch('touchMove', [next]);
    await expect(canvas).not.toHaveAttribute('data-aim', '');
    await page.keyboard.press('g');
    await expect(dialog).toContainText('Go to which place?');
    await touch('touchEnd');
    await settled(page);
    await expect(canvas).toHaveAttribute('data-aim', '');
    await page.keyboard.press('Escape');
    await expect(location(page)).toHaveText(`(${SOLDIER.x}, ${SOLDIER.y})`);
  });

  test('a finger from the active unit to its neighbour steps it', async ({ page }) => {
    const { canvas } = await start(page);
    await touchDrag(page, await at(canvas, SOLDIER), await at(canvas, { x: SOLDIER.x, y: SOLDIER.y + 1 }), { steps: 8 });
    await expect(location(page)).toHaveText(`(${SOLDIER.x}, ${SOLDIER.y + 1})`);
    await expect(canvas).toHaveAttribute('data-aim', '');
  });

  test('two fingers zoom about the point between them, and while they are down nothing pans, is ordered or held', async ({ page }) => {
    const { canvas, slip } = await start(page);
    // the map opens at its nearest: fingers drawn together zoom it out, keeping the square between them there
    const before = await viewOf(canvas);
    const middle = await at(canvas, { x: SOLDIER.x + 2, y: SOLDIER.y });
    await pinch(page, middle, { from: 300, to: 150, steps: 10 });
    await expect.poll(async () => (await viewOf(canvas)).tileSize).toBeLessThan(before.tileSize);
    const kept = await squareAt(canvas, middle);
    expect(Math.abs(kept.x - (SOLDIER.x + 2))).toBeLessThanOrEqual(1);
    expect(Math.abs(kept.y - SOLDIER.y)).toBeLessThanOrEqual(1);
    await expect(location(page)).toHaveText(`(${SOLDIER.x}, ${SOLDIER.y})`);

    // a finger on the active unit, a second beside it, both held long and moved together, then lifted one by one
    const touch = await hand(page);
    const unit = await at(canvas, SOLDIER);
    const beside = { x: unit.x + 120, y: unit.y };
    await touch('touchStart', [unit]);
    await touch('touchStart', [unit, beside]);
    await page.waitForTimeout(700);
    await expect(slip).toBeHidden();
    const held = await viewOf(canvas);
    await touch('touchMove', [{ x: unit.x + 1, y: unit.y + 90 }, { x: beside.x + 1, y: beside.y + 90 }]);
    await touch('touchMove', [{ x: unit.x + 2, y: unit.y + 180 }, { x: beside.x + 2, y: beside.y + 180 }]);
    await expect(canvas).toHaveAttribute('data-aim', '');
    // the second lifts; the first, still down, moves on and lifts: it was part of the pinch, and pans and orders nothing
    await touch('touchEnd', [{ x: unit.x + 2, y: unit.y + 180 }]);
    await touch('touchMove', [{ x: unit.x + 2, y: unit.y + 300 }]);
    await page.waitForTimeout(600);
    await touch('touchEnd');
    await settled(page);
    const v = await viewOf(canvas);
    expect(v.originX).toBe(held.originX);
    expect(v.originY).toBe(held.originY);
    await expect(slip).toBeHidden();
    await expect(location(page)).toHaveText(`(${SOLDIER.x}, ${SOLDIER.y})`);
    await expect(canvas).toHaveAttribute('data-aim', '');
  });

  test('a long press shows the square\'s slip, above the finger, with Look up, and does nothing else', async ({ page }) => {
    const { canvas, slip } = await start(page);
    // the active unit's own square: the slip, and no order
    const unit = await at(canvas, SOLDIER);
    await longPress(page, unit);
    await expect(slip).toBeVisible();
    await expect(slip.locator('.map-tooltip-unit')).toContainText('Soldier');
    const box = (await slip.boundingBox())!;
    expect(Math.abs(box.y + box.height - (unit.y - 24))).toBeLessThanOrEqual(1);
    await expect(location(page)).toHaveText(`(${SOLDIER.x}, ${SOLDIER.y})`);
    await expect(canvas).toHaveAttribute('data-aim', '');
    await expect(pedia(page)).toHaveCount(0);
    // the Look up button is a fingertip high, and opens what a right-click there opens
    const lookUp = slip.getByRole('button', { name: 'Look up' });
    expect((await lookUp.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await tap(page, lookUp);
    await expect(pedia(page)).toHaveAttribute('data-entry', 'units:soldier');
    await expect(slip).toBeHidden();
    await tap(page, pedia(page).locator('.report-close'));
    await expect(pedia(page)).toHaveCount(0);

    // a plain square: its terrain; the next tap takes the slip away
    const plain = { x: SOLDIER.x + 3, y: SOLDIER.y + 2 };
    await longPress(page, await at(canvas, plain));
    await expect(slip.locator('.map-tooltip-title')).toHaveText('Plains');
    await expect(canvas).toHaveAttribute('data-active', 'u0');
    await tap(page, await at(canvas, plain));
    await expect(slip).toBeHidden();

    // the mouse moving over the map takes a long press's slip back (its own is off here)
    await longPress(page, await at(canvas, plain));
    await expect(slip).toBeVisible();
    await page.waitForTimeout(900);
    const spot = await at(canvas, { x: plain.x + 1, y: plain.y });
    await page.mouse.move(spot.x, spot.y);
    await page.mouse.move(spot.x + 3, spot.y + 3);
    await expect(slip).toBeHidden();

    // near the top of the map the slip stands below the finger instead
    const canvasBox = (await canvas.boundingBox())!;
    const high = { x: canvasBox.x + canvasBox.width / 2, y: canvasBox.y + 20 };
    await longPress(page, high);
    await expect(slip).toBeVisible();
    expect(Math.abs((await slip.boundingBox())!.y - (high.y + 24))).toBeLessThanOrEqual(1);
    // a pan takes it away
    await touchDrag(page, { x: canvasBox.x + 300, y: canvasBox.y + 300 }, { x: canvasBox.x + 360, y: canvasBox.y + 300 });
    await expect(slip).toBeHidden();
  });

  test('a long press during Go To targeting shows the slip and sets no destination', async ({ page }) => {
    const { canvas, slip } = await start(page);
    await pickGoTo(page);
    await longPress(page, await at(canvas, { x: SOLDIER.x + 5, y: SOLDIER.y }));
    await expect(slip).toBeVisible();
    await expect(canvas).toHaveAttribute('data-mode', 'goto');
    await expect(location(page)).toHaveText(`(${SOLDIER.x}, ${SOLDIER.y})`);
    await expect(field(page, 'orders')).toHaveText('No orders');
  });

  test('a button held as long as a long press still does what it does', async ({ page }) => {
    await start(page);
    await longPress(page, page.locator('.command-bar [data-command="goTo"]'));
    await expect(page.getByRole('dialog')).toContainText('Go to which place?');
    await expect(pedia(page)).toHaveCount(0);
  });

  test('a lookup event opens the encyclopedia at its target, and a touch\'s contextmenu opens nothing', async ({ page }) => {
    const { canvas } = await start(page);
    const p = await at(canvas, { x: SOLDIER.x + 2, y: SOLDIER.y });
    await canvas.evaluate((c, q) => c.dispatchEvent(new PointerEvent('contextmenu', { clientX: q.x, clientY: q.y, button: 2, pointerType: 'touch', bubbles: true, cancelable: true })), p);
    await page.waitForTimeout(300);
    await expect(pedia(page)).toHaveCount(0);
    await canvas.evaluate((c, q) => c.dispatchEvent(new CustomEvent('lookup', { detail: { clientX: q.x, clientY: q.y }, bubbles: true })), p);
    await expect(pedia(page)).toHaveAttribute('data-entry', 'terrain:plains');
  });

  test('a long press on a building in the colony, or a token in Europe, opens its page and is not a tap', async ({ page }) => {
    const { canvas } = await start(page);
    await tap(page, await at(canvas, COLONY));
    const colony = page.locator('.colony-screen');
    await expect(colony).toBeVisible();
    const townHall = colony.locator('[data-building="townHall"] .building-name');
    // held across a change of the window's size, it looks nothing up
    const touch = await hand(page);
    const hall = (await townHall.boundingBox())!;
    await touch('touchStart', [{ x: hall.x + hall.width / 2, y: hall.y + hall.height / 2 }]);
    await page.waitForTimeout(150);
    await page.setViewportSize({ width: 1280, height: 790 });
    await page.waitForTimeout(700);
    await expect(pedia(page)).toHaveCount(0);
    await touch('touchEnd');
    await page.setViewportSize({ width: 1280, height: 800 });
    await longPress(page, townHall);
    await expect(pedia(page)).toHaveAttribute('data-entry', 'buildings:townHall');
    await tap(page, pedia(page).locator('.report-close'));
    await expect(pedia(page)).toHaveCount(0);
    await tap(page, colony.locator('.colony-close'));
    await expect(colony).toHaveCount(0);

    await tap(page, page.locator('.command-bar [data-command="europe"]'));
    const europe = page.locator('.europe-screen');
    await expect(europe).toBeVisible();
    await longPress(page, europe.locator('.token-carrier').first());
    await expect(pedia(page)).toHaveAttribute('data-entry', 'units:caravel');
    await tap(page, pedia(page).locator('.report-close'));
    await expect(pedia(page)).toHaveCount(0);
    // the long press was not also a tap: no menu for the ship came up behind it
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await expect(europe).toBeVisible();
  });

  test('a pointercancel or a change of the window\'s size drops the gesture: no order, no pan, no marker', async ({ page }) => {
    const { canvas } = await start(page);
    const touch = await hand(page);
    const unit = await at(canvas, SOLDIER);
    await touch('touchStart', [unit]);
    for (let i = 1; i <= 6; i++) await touch('touchMove', [{ x: unit.x + i * 30, y: unit.y }]);
    await expect(canvas).not.toHaveAttribute('data-aim', '');
    await touch('touchCancel');
    await expect(canvas).toHaveAttribute('data-aim', '');
    await expect(location(page)).toHaveText(`(${SOLDIER.x}, ${SOLDIER.y})`);

    // a drag from the unit under way when the window changes size
    await touch('touchStart', [unit]);
    for (let i = 1; i <= 6; i++) await touch('touchMove', [{ x: unit.x + i * 30, y: unit.y }]);
    await expect(canvas).not.toHaveAttribute('data-aim', '');
    await page.setViewportSize({ width: 1200, height: 760 });
    await expect(canvas).toHaveAttribute('data-aim', '');
    await touch('touchMove', [{ x: unit.x + 200, y: unit.y + 10 }]);
    await touch('touchEnd');
    await settled(page);
    await expect(location(page)).toHaveText(`(${SOLDIER.x}, ${SOLDIER.y})`);
    await expect(canvas).toHaveAttribute('data-aim', '');

    // a pan under way when the window changes size goes no further
    const middle = { x: 500, y: 400 };
    await touch('touchStart', [middle]);
    await touch('touchMove', [{ x: middle.x - 40, y: middle.y }]);
    await touch('touchMove', [{ x: middle.x - 80, y: middle.y }]);
    await page.setViewportSize({ width: 1280, height: 800 });
    await settled(page);
    const after = await viewOf(canvas);
    await touch('touchMove', [{ x: middle.x - 300, y: middle.y }]);
    await touch('touchEnd');
    await settled(page);
    expect((await viewOf(canvas)).originX).toBe(after.originX);
    await expect(location(page)).toHaveText(`(${SOLDIER.x}, ${SOLDIER.y})`);
  });

  test('a tap on the chart centres the map there', async ({ page }) => {
    const { canvas } = await start(page);
    const chart = page.locator('canvas.minimap');
    const box = (await chart.boundingBox())!;
    const before = await viewOf(canvas);
    await tap(page, { x: box.x + 10, y: box.y + 10 });
    await expect.poll(async () => (await viewOf(canvas)).originX).not.toBe(before.originX);
  });
});

test.describe('fingers on the map of a phone', () => {
  test.use({ viewport: POSTURES.phoneUpright, hasTouch: true });

  test('a tap steps the unit, and a pan keeps its square under the finger and orders nothing', async ({ page }) => {
    // a map larger than the window however small its squares are drawn, so that it has somewhere to pan
    const { canvas } = await start(page, land(140, 140));
    // a tap beside the unit steps it there, as its square's slip then says
    const slip = page.locator('.map-tooltip');
    const north = { x: SOLDIER.x, y: SOLDIER.y - 1 };
    await longPress(page, await at(canvas, north));
    await expect(slip.locator('.map-tooltip-title')).toHaveText('Plains');
    await expect(slip.locator('.map-tooltip-unit')).toHaveCount(0);
    await tap(page, await at(canvas, north));
    await expect(slip).toBeHidden();
    await settled(page);
    await longPress(page, await at(canvas, north));
    await expect(slip.locator('.map-tooltip-unit')).toContainText('Soldier');

    const box = (await canvas.boundingBox())!;
    const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const square = await squareAt(canvas, from);
    const to = { x: from.x - box.width / 3, y: from.y - box.height / 4 };
    await touchDrag(page, from, to, { steps: 12 });
    await settled(page);
    const under = await squareAt(canvas, to);
    expect(Math.abs(under.x - square.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(under.y - square.y)).toBeLessThanOrEqual(1);
    await expect(slip).toBeHidden();
    await expect(canvas).toHaveAttribute('data-active', 'u0');
    await expect(canvas).toHaveAttribute('data-aim', '');
  });
});
