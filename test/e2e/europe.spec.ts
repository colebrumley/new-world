import { expect, test, type Page } from '@playwright/test';
import { saveGame } from '../../src/engine/save';
import { OFF_MAP } from '../../src/engine/state';
import { withUnit, world } from '../helpers/world';
import { field, startNewGame } from './helpers';

async function start(page: Page, query: string): Promise<void> {
  await page.goto(`/?${query}`);
  await startNewGame(page);
  await expect(page.locator('[data-field="unit"]')).toHaveText('Caravel');
}

/** From the start square on the eastern Sea Lane: one step east, and agree to sail. */
async function sailForEurope(page: Page): Promise<void> {
  await page.keyboard.press('ArrowRight');
  await page.getByRole('button', { name: 'Yes, make for Europe' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

const europe = (page: Page) => page.getByRole('dialog', { name: 'Europe' });

test('a ship sails to Europe and back to the square it left', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await start(page, 'seed=11');
  const home = await page.locator('[data-field="location"]').textContent();

  await page.keyboard.press('ArrowRight');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Europe');
  await expect(dialog.getByRole('button')).toHaveText(['Yes, make for Europe', 'No, stay in these waters']);
  await page.keyboard.press('Enter'); // the first answer is highlighted
  await expect(dialog).toHaveCount(0);
  const button = page.locator('.command-bar [data-command="europe"]');
  await expect(button).toHaveAttribute('data-europe', 'sea');
  await expect(button).toHaveAttribute('title', /Caravel arrives in 2 turns/);

  await page.keyboard.press('e');
  const inbound = europe(page).locator('.lane-in');
  await expect(inbound).toContainText('Caravel, 2 turns');
  await page.keyboard.press('Escape');
  await expect(europe(page)).toHaveCount(0);
  await page.keyboard.press('Enter');
  await page.keyboard.press('e');
  await expect(inbound).toContainText('Caravel, 1 turn');
  await page.keyboard.press('e'); // E leaves as well
  await page.keyboard.press('Enter');
  await expect(button).toHaveAttribute('data-europe', 'port');
  await expect(button).toHaveAttribute('title', /Caravel in port/);
  await page.keyboard.press('e');
  const harbor = europe(page).getByRole('group', { name: 'In port' });
  await expect(harbor).toContainText('Caravel (2/2 holds)');

  await harbor.getByRole('button', { name: 'Set sail' }).click();
  await expect(europe(page).locator('.lane-out')).toContainText('Caravel, 2 turns');
  await expect(harbor).toContainText('No ship is in port.');
  await page.keyboard.press('Escape');
  await expect(button).toHaveAttribute('data-europe', 'sea');
  await expect(button).toHaveAttribute('title', /Caravel returns in 2 turns/);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');

  await expect(page.locator('[data-field="unit"]')).toHaveText('Caravel');
  await expect(page.locator('[data-field="location"]')).toHaveText(home!);
  await expect(button).not.toHaveAttribute('data-europe');
  await expect(button).toHaveAttribute('title', 'Europe (E)');
  await expect(page.locator('[data-field="date"]')).toHaveText('1496');
  expect(errors).toEqual([]);
});

test('declining keeps the ship in these waters; a voyage can be turned back', async ({ page }) => {
  await start(page, 'seed=11');
  const before = await page.locator('[data-field="location"]').textContent();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Escape'); // "No": the ordinary move still happens
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('[data-field="location"]')).not.toHaveText(before!);
  await expect(page.locator('[data-field="moves"]')).toHaveText('Moves: 3');

  await sailForEurope(page);
  await page.keyboard.press('e');
  await europe(page).getByRole('button', { name: 'Turn back' }).click();
  await expect(europe(page).locator('.lane-out')).toContainText('Caravel, 2 turns');
  await expect(europe(page).locator('.lane-in')).toContainText('none');
});

test('buys 100 tools and loads them; prices and treasury update on screen', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await start(page, 'seed=11&difficulty=discoverer');
  await sailForEurope(page);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.press('e');

  const screen = europe(page);
  await expect(screen.locator('.europe-gold')).toHaveText('Treasury 1000 gold');
  await expect(screen.locator('.europe-tax')).toHaveText('Tax 0%');
  const market = screen.getByRole('group', { name: 'Market (bid / ask)' });
  await expect(market.getByRole('button')).toHaveCount(16);
  const tools = market.locator('[data-good="tools"]');
  const [bid, ask] = ((await tools.locator('.token-sub').textContent()) ?? '').split('/').map(Number) as [number, number];
  expect(ask).toBeGreaterThan(bid);

  // Send the two passengers ashore so both holds are free, then put the highlight on tools and load.
  const harbor = screen.getByRole('group', { name: 'In port' });
  const docks = screen.getByRole('group', { name: 'On the docks' });
  await harbor.getByRole('button', { name: 'Veteran Soldier' }).click();
  await harbor.getByRole('button', { name: 'Pioneer' }).click();
  await expect(docks.getByRole('button')).toHaveCount(2);
  await expect(harbor).toContainText('Caravel (0/2 holds)');
  await tools.focus();
  await page.keyboard.press('l');
  await expect(screen.locator('[data-field="europe-monitor"]')).toHaveText(`Bought 100 tools for ${ask * 100} gold`);
  await expect(screen.locator('.europe-gold')).toHaveText(`Treasury ${1000 - ask * 100} gold`);
  await expect(harbor).toContainText('Caravel (1/2 holds)');
  await expect(harbor.getByRole('button', { name: 'Tools 100' })).toBeVisible();

  // Selling them straight back pays the lower bid; with no tax yet the whole of it reaches the treasury.
  await page.keyboard.press('u');
  await expect(screen.locator('.europe-gold')).toHaveText(`Treasury ${1000 - ask * 100 + bid * 100} gold`);
  await expect(harbor).toContainText('Caravel (0/2 holds)');

  // An order larger than a hold is placed as one trade per hold, up to the room aboard.
  await tools.focus();
  await page.keyboard.press('+');
  const order = page.getByRole('dialog').last();
  await expect(order).toContainText('Buy how many tools? (up to 200)');
  await expect(order.getByRole('textbox')).toHaveValue('200');
  await page.keyboard.press('Enter');
  await expect(screen.locator('[data-field="europe-monitor"]')).toHaveText(/^Bought 200 tools for \d+ gold$/);
  await expect(harbor).toContainText('Caravel (2/2 holds)');
  await expect(harbor.getByRole('button', { name: 'Tools 200' })).toBeVisible();
  await harbor.getByRole('button', { name: 'Sell all cargo' }).click();
  await expect(harbor).toContainText('Caravel (0/2 holds)');

  // Those on the docks have a menu of their own, and the offices open theirs.
  await docks.getByRole('button').first().click();
  await expect(page.getByRole('dialog').last()).toContainText('Board the ship in port now');
  await page.keyboard.press('Escape');
  // Paying a passage brings one of the three in the pool to the docks.
  const before = Number(((await screen.locator('.europe-gold').textContent()) ?? '').replace(/\D/g, ''));
  await page.keyboard.press('r');
  // 140 on this level, less a little for the crosses gathered on the way over
  const fare = Number(/costs (\d+) gold/.exec((await page.getByRole('dialog').last().textContent()) ?? '')?.[1]);
  expect(fare).toBeGreaterThan(100);
  expect(fare).toBeLessThan(140);
  await expect(page.getByRole('dialog').last().getByRole('button')).toHaveText(['Master Carpenter', 'Expert Farmer', 'Seasoned Scout', 'Never mind']);
  await page.keyboard.press('Enter');
  await expect(docks.getByRole('button')).toHaveCount(3);
  await expect(docks).toContainText('Master Carpenter');
  await expect(screen.locator('.europe-gold')).toHaveText(`Treasury ${before - fare} gold`);
  await screen.getByRole('button', { name: 'Train (T)' }).click();
  await expect(page.getByRole('dialog').last()).toContainText('Royal University');
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});

test('a ship under repair in Europe is shown so, cannot be told to sail, and does not light the Europe button as in port', async ({ page }) => {
  // A frigate lying in Europe with three turns of repair to go, and a caravel at sea to be the active unit.
  const rows = Array.from({ length: 6 }, (_, y) => (y === 0 || y === 5 ? '~'.repeat(10) : '~~......~~'));
  let state = world({ rows, seed: 5, players: [{ id: 'p0', kind: 'human', nation: 'england' }] });
  state = withUnit(state, { id: 'ship', owner: 'p0', type: 'caravel', profession: null, x: 0, y: 2 });
  state = withUnit(state, { id: 'hulk', owner: 'p0', type: 'frigate', profession: null, x: OFF_MAP, y: OFF_MAP });
  state = { ...state, units: { ...state.units, hulk: { ...state.units['hulk']!, repair: 3, voyage: { phase: 'inEurope', turnsLeft: 0, origin: [0, 2] } } } };
  await page.addInitScript((text) => localStorage.setItem('new-world:autosave', text), saveGame({ options: { seed: 5 }, log: [], state }));
  await page.goto('/');
  await page.getByRole('menuitem', { name: 'Load Game' }).click();
  await expect(field(page, 'unit')).toHaveText('Caravel');

  const button = page.getByRole('button', { name: /^Europe/ });
  await expect(button).toHaveAttribute('data-europe', 'sea');
  await expect(button).toHaveAttribute('title', 'Europe (E): Frigate under repair, 3 turns');
  await page.keyboard.press('e');
  const harbor = europe(page).getByRole('group', { name: 'In port' });
  await expect(harbor).toContainText('Frigate (0/4 holds), under repair, 3 turns');
  await expect(harbor).toContainText('Under repair, 3 turns');
  await expect(harbor.getByRole('button', { name: 'Set sail' })).toHaveCount(0);
});
