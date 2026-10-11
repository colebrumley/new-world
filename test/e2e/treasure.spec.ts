import { expect, test, type Page } from '@playwright/test';
import { royalTransport, royalTransportCut } from '../../src/engine/royal';
import { saveGame } from '../../src/engine/save';
import type { GameState } from '../../src/engine/state';
import { withColony, withUnit, world } from '../helpers/world';
import { field } from './helpers';

// Cashing a treasure train (R-1039): the Crown's question when one enters a coastal colony, the
// colony screen's orders menu, and no question while the player has a galleon of their own.

const VALUE = 1000;

/** Jamestown on the coast at (2, 3) with a treasure train of ours one square east of it. */
function crafted({ galleon = false } = {}): GameState {
  const rows = Array.from({ length: 8 }, (_, y) => (y === 0 || y === 7 ? '~'.repeat(10) : '~~......~~'));
  let state = world({ rows, seed: 5, players: [{ id: 'p0', kind: 'human', nation: 'england' }] });
  state = withColony(state, { id: 'james', owner: 'p0', x: 2, y: 3, name: 'Jamestown' });
  // moves to spare, so that once in Jamestown it is still the active unit and the colony opens on it
  state = withUnit(state, { id: 'gold', owner: 'p0', type: 'treasure', profession: null, x: 3, y: 3, movesLeft: 9 });
  state = { ...state, units: { ...state.units, gold: { ...state.units['gold']!, treasure: VALUE } } };
  if (galleon) state = withUnit(state, { id: 'ship', owner: 'p0', type: 'galleon', profession: null, x: 0, y: 3, orders: 'sentry' });
  return state;
}

async function load(page: Page, state: GameState): Promise<void> {
  await page.addInitScript((text) => localStorage.setItem('new-world:autosave', text), saveGame({ options: { seed: 5 }, log: [], state }));
  await page.goto('/');
  await page.getByRole('menuitem', { name: 'Load Game' }).click();
  await expect(field(page, 'unit')).toHaveText('Treasure Train');
}

/** Open the colony screen on the square the active unit stands on, and the orders menu of the treasure outside the gates. */
async function treasureOrders(page: Page) {
  await page.keyboard.press('v');
  await page.keyboard.press('Enter');
  const colony = page.locator('.colony-screen');
  await expect(colony).toBeVisible();
  const train = colony.locator('.outside-row .token-unit', { hasText: 'Treasure' });
  await train.click();
  await train.click();
  return { colony, train, dialog: page.getByRole('dialog').filter({ hasText: 'Orders for this unit' }).last() };
}

test('entering a coastal colony with no galleon of our own, the Crown offers to carry the treasure home', async ({ page }) => {
  const state = crafted();
  const { fee, net } = royalTransport(state, 'p0', VALUE);
  const cut = royalTransportCut(state, 'p0');
  await load(page, state);
  await page.keyboard.press('ArrowLeft');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText(`The Crown will carry this treasure of ${VALUE} gold home to London. The King keeps ${fee} gold (${cut} percent) for his trouble; we receive ${net}.`);
  await expect(dialog.locator('canvas')).toHaveCount(1); // the King's portrait
  await dialog.getByRole('button', { name: 'Accept' }).click();
  await expect(dialog).toContainText(`${net} gold has been added to the treasury`);
  await dialog.getByRole('button', { name: 'Continue' }).click();
  await expect(field(page, 'treasury')).toHaveText(`${net} gold`);
  await expect(field(page, 'unit')).not.toHaveText('Treasure Train');
});

test('a declined treasure waits in the colony, and the orders menu there sends it home', async ({ page }) => {
  const state = crafted();
  const { net } = royalTransport(state, 'p0', VALUE);
  await load(page, state);
  await page.keyboard.press('ArrowLeft');
  await page.getByRole('dialog').getByRole('button', { name: 'Decline' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(field(page, 'treasury')).toHaveText('0 gold');
  await expect(field(page, 'location')).toHaveText('(2, 3)');
  const { colony, train, dialog } = await treasureOrders(page);
  await expect(dialog.getByRole('button')).toHaveText([`Send the treasure home (keep ${net} of ${VALUE} gold)`, 'Sentry', 'Fortify', 'No change']);
  await dialog.getByRole('button', { name: /Send the treasure home/ }).click();
  await expect(train).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(colony).toHaveCount(0);
  await expect(field(page, 'treasury')).toHaveText(`${net} gold`);
});

test('with a galleon of our own the Crown asks nothing, and the orders menu says why', async ({ page }) => {
  await load(page, crafted({ galleon: true }));
  await page.keyboard.press('ArrowLeft');
  await expect(field(page, 'location')).toHaveText('(2, 3)');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const { dialog } = await treasureOrders(page);
  await expect(dialog.getByRole('button')).toHaveText(['Send the treasure home (not while we have a galleon)', 'Sentry', 'Fortify', 'No change']);
  await dialog.getByRole('button', { name: /Send the treasure home/ }).click();
  await expect(page.locator('.colony-screen')).toContainText('the Crown will not carry treasure for a power with a galleon of its own');
  await expect(field(page, 'treasury')).toHaveText('0 gold');
});
