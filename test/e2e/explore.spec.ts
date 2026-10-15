import { expect, test, type Page } from '@playwright/test';
import { AUTOSAVE_KEY } from '../../src/app/save-keys';
import { settlementPopulation } from '../../src/engine/data/tribes';
import { loadGame, saveGame } from '../../src/engine/save';
import type { GameState, Settlement, Unit } from '../../src/engine/state';
import { orderLetter } from '../../src/ui/unit-queue';
import { setTile, withUnit, world } from '../helpers/world';
import { field } from './helpers';

// The Explore order in the interface (R-1067): Shift-E and the sidebar's Explore button, the chief's
// and the rumour's dialogs after the scout's own moves, and the X in its box.

// x:  0123456789AB
const ROWS = [
  '~~~~~~~~~~~~',
  '~..........~',
  '~..........~',
  '~..........~',
  '~..........~',
  '~~~~~~~~~~~~',
];

const village = (x: number, y: number): Settlement => ({
  id: 'v1', tribe: 'sioux', x, y, capital: false, population: settlementPopulation('sioux', false).start, growth: 0, taught: false, tributePaid: false,
  alarm: {}, mission: null, scouted: [], lastBought: null, lastSold: null, haggleMemory: null,
});

/** A scout of ours at (2, 2) beside a settlement nobody has visited, with a rumour two squares east and the east of the map unseen. */
function crafted(seed: number, type: 'scout' | 'colonist' = 'scout'): GameState {
  let state = world({ rows: ROWS, seed, players: [{ id: 'p0', kind: 'human', nation: 'england' }] });
  state = { ...state, settlements: { v1: village(2, 3) } };
  state = setTile(state, 4, 2, { rumor: true });
  for (let y = 0; y < ROWS.length; y++) for (let x = 8; x < 12; x++) state = setTile(state, x, y, { explored: 0 });
  return withUnit(state, { id: 'u1', owner: 'p0', type, x: 2, y: 2 });
}

async function load(page: Page, state: GameState, name: string): Promise<void> {
  await page.addInitScript(([key, text]) => localStorage.setItem(key, text), [AUTOSAVE_KEY, saveGame({ options: { seed: state.seed }, log: [], state })] as const);
  await page.goto('/');
  await page.getByRole('menuitem', { name: 'Load Game' }).click();
  await expect(field(page, 'unit')).toHaveText(name);
}

/** The game as it was last saved, read back from the page. */
async function saved(page: Page): Promise<GameState> {
  const text = await page.evaluate((key) => localStorage.getItem(key), AUTOSAVE_KEY);
  return loadGame(text ?? '').state;
}

const RUMOUR = /rumors of a lost city|ruins of a lost colony|city of gold|Fountain of Youth|burial mounds|vanished|friendly village|holy shrines|Survivors of a lost colony/;

test('Shift-E sends a scout exploring: it speaks with the chief at once, enters the rumour next turn and keeps its X', async ({ page }) => {
  await load(page, crafted(3), 'Scout');
  const button = page.locator('.command-bar [data-command="explore"]');
  await expect(button).toBeVisible();

  await page.keyboard.press('Shift+E');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText(/chief/);
  await dialog.getByRole('button', { name: 'Continue' }).click();
  await expect(field(page, 'unit')).toHaveText('No active unit'); // it has its orders: the cycle passes it over
  expect(orderLetter((await saved(page)).units['u1'] as Unit)).toBe('X');

  await page.keyboard.press('Enter');
  await expect(dialog).toContainText(RUMOUR);
  await dialog.getByRole('button').first().click();
  const after = await saved(page);
  expect(after.map.tiles[2 * 12 + 4]?.rumor).toBe(false);
  const scout = after.units['u1'];
  expect(scout && orderLetter(scout)).toBe('X');
});

test('a scout already exploring speaks with the chief on its own after End Turn, and Activate wakes it', async ({ page }) => {
  const state = crafted(3);
  const exploring = { ...state, units: { ...state.units, u1: { ...(state.units['u1'] as Unit), orders: 'explore' as const, movesLeft: 0 } } };
  await page.addInitScript(([key, text]) => localStorage.setItem(key, text), [AUTOSAVE_KEY, saveGame({ options: { seed: 3 }, log: [], state: exploring })] as const);
  await page.goto('/');
  await page.getByRole('menuitem', { name: 'Load Game' }).click();
  await expect(field(page, 'status')).toHaveText('End of turn. Press Enter.');
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText(/chief/);
  await dialog.getByRole('button', { name: 'Continue' }).click();
  expect(orderLetter((await saved(page)).units['u1'] as Unit)).toBe('X');

  // Activate on the scout's square wakes it, as for any other order
  await page.keyboard.press('v');
  const [cx, cy] = (await field(page, 'location').textContent())!.match(/\d+/g)!.map(Number) as [number, number];
  for (let i = cx; i > 2; i--) await page.keyboard.press('ArrowLeft');
  for (let i = cx; i < 2; i++) await page.keyboard.press('ArrowRight');
  for (let i = cy; i > 2; i--) await page.keyboard.press('ArrowUp');
  for (let i = cy; i < 2; i++) await page.keyboard.press('ArrowDown');
  await expect(field(page, 'location')).toHaveText('(2, 2)');
  await page.keyboard.press('a');
  await expect(field(page, 'unit')).toHaveText('Scout');
  await expect(field(page, 'orders')).toHaveText('No orders');
});

test('a unit that may not explore: Shift-E says why, and no Explore button is shown', async ({ page }) => {
  await load(page, crafted(3, 'colonist'), 'Free Colonist');
  await expect(page.locator('.command-bar [data-command="explore"]')).toBeHidden();
  await page.keyboard.press('Shift+E');
  await expect(field(page, 'status')).toContainText('only a scout or a ship can');
  await expect(field(page, 'unit')).toHaveText('Free Colonist');
});

test('with End of turn off, the turn ends by itself once the chief\'s dialog after Shift-E is closed', async ({ page }) => {
  await load(page, crafted(3), 'Scout');
  await page.keyboard.press('Alt+G');
  const game = page.getByRole('dialog', { name: 'Game Options' });
  await game.getByLabel('End of turn').uncheck();
  await page.keyboard.press('Escape');
  await expect(field(page, 'date')).toHaveText('1492');
  await page.keyboard.press('Shift+E');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText(/chief/);
  await expect(field(page, 'date')).toHaveText('1492'); // nothing ends while the dialog is up
  await dialog.getByRole('button', { name: 'Continue' }).click();
  // the scout was the last unit: the turn ends, and next turn it enters the rumour
  await expect(dialog).toContainText(RUMOUR);
  await expect(field(page, 'date')).not.toHaveText('1492');
});
