import { expect, test } from '@playwright/test';
import { saveGame } from '../../src/engine/save';
import { withColony, withUnit, world } from '../helpers/world';
import { field, foundJamestown } from './helpers';

test('lands a soldier on the American coast and founds Jamestown', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await foundJamestown(page);
  const colony = page.locator('.colony-screen');
  await expect(colony.getByRole('heading', { name: 'Jamestown' })).toBeVisible();
  await expect(colony.locator('.colony-pop')).toHaveText('Population 1');
  await page.keyboard.press('Escape');
  await expect(colony).toHaveCount(0);

  // The soldier is now the colony's first citizen, and the colony is a named Go To destination.
  await expect(field(page, 'unit')).not.toHaveText('Soldier');
  await page.keyboard.press('g');
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button')).toHaveText(['Jamestown', 'Pick a square on the map']);
  await page.keyboard.press('Escape');
  await expect(page.locator('canvas.map')).toHaveAttribute('data-mode', 'move'); // Escape cancels the order outright
  await page.screenshot({ path: 'test-results/colony-founded.png' });
  expect(errors).toEqual([]);
});

test('the colony screen lays out the settlement, area, people, transport, warehouse and production', async ({ page }) => {
  await foundJamestown(page);
  const colony = page.locator('.colony-screen');
  for (const group of ['Settlement', 'Area', 'People', 'Transport', 'Production']) await expect(colony.getByRole('group', { name: group })).toBeVisible();
  await expect(colony.getByRole('group', { name: /Warehouse/ })).toBeVisible();
  await expect(colony.locator('.building-name')).toHaveText([
    'Town Hall', "Weaver's House", "Tobacconist's House", "Rum Distiller's House", "Fur Trader's House", "Carpenter's Shop", "Blacksmith's House",
  ]);
  await expect(colony.locator('.square')).toHaveCount(9);
  await expect(colony.locator('.token-good')).toHaveCount(16);
  await expect(colony.locator('.token-good', { hasText: 'Muskets' })).toContainText('50'); // the soldier laid down his arms

  const summary = await colony.evaluate((root) => ({
    header: [...root.querySelectorAll('.colony-header span')].map((n) => n.textContent),
    buildings: [...root.querySelectorAll('.building')].map((n) => `${n.querySelector('.building-name')?.textContent}: ${n.querySelectorAll('.token').length}`),
    squares: [...root.querySelectorAll('.square')].map((n) => `${(n as HTMLElement).dataset['square']} ${n.className.replace('square ', '')}`),
    working: root.querySelectorAll('.square .token').length,
    warehouse: [...root.querySelectorAll('.token-good')].map((n) => n.textContent),
    construction: root.querySelector('[data-region="multi"] h3')?.textContent,
  }));
  expect(JSON.stringify(summary, null, 2)).toMatchSnapshot('jamestown-founded.json');
  await page.screenshot({ path: 'test-results/colony-screen.png' });
});

test('dragging a colonist from a field to a building changes production', async ({ page }) => {
  await foundJamestown(page);
  const colony = page.locator('.colony-screen');
  const bells = colony.locator('.production-table tr[data-good="bells"] td').first();
  const table = colony.locator('.production-table');
  await expect(bells).toHaveText('+1');
  const before = (await table.textContent())!;

  const farmer = colony.locator('.square .token');
  await expect(farmer).toHaveCount(1);
  await farmer.dragTo(colony.locator('.building[data-building="townHall"]'));
  await expect(colony.locator('.building[data-building="townHall"] .token')).toHaveCount(1);
  await expect(colony.locator('.square .token')).toHaveCount(0);
  await expect(bells).toHaveText('+4'); // a statesman's 3 on top of the free bell
  await expect(table).not.toHaveText(before); // what he raised in the field is gone from the table too

  // and back out to a field square
  await colony.locator('.building[data-building="townHall"] .token').dragTo(colony.locator('.square[data-square="-1,0"]'));
  await expect(colony.locator('.square[data-square="-1,0"] .token')).toHaveCount(1);
  await expect(bells).toHaveText('+1');

  // a click opens the jobs menu with here / best figures
  await colony.locator('.square .token').click();
  const menu = page.getByRole('dialog').filter({ hasText: 'Choose work' });
  await expect(menu.getByRole('button', { name: /^Farmer \(\d+ here \/ \d+ best\)$/ })).toBeVisible();
  await menu.getByRole('button', { name: /^Statesman/ }).click();
  await expect(bells).toHaveText('+4');
});

test('the colony lies over the whole game, and a click on a colonist then on a place moves them', async ({ page }) => {
  await foundJamestown(page);
  const colony = page.locator('.colony-screen');
  const game = (await page.locator('.game').boundingBox())!;
  expect(await colony.boundingBox()).toEqual(game);
  expect((await page.locator('canvas.map').boundingBox())!.width).toBeGreaterThan(game.width / 2); // the map keeps its room underneath
  // the six views sit in their places
  const box = async (name: string) => (await colony.locator(`[data-region="${name}"]`).boundingBox())!;
  const [settlement, area, people, transport, multi, warehouse] = [await box('settlement'), await box('area'), await box('people'), await box('transport'), await box('multi'), await box('warehouse')];
  expect(settlement.x).toBeLessThan(area.x);
  expect(Math.abs(settlement.y - area.y)).toBeLessThan(2);
  expect(people.y).toBeGreaterThan(settlement.y);
  expect(people.x).toBeLessThan(transport.x);
  expect(transport.x).toBeLessThan(multi.x);
  expect(multi.y).toBeGreaterThan(area.y);
  expect(warehouse.y).toBeGreaterThan(people.y);
  expect(warehouse.width).toBeGreaterThan(game.width * 0.9);

  // the first click selects and says what to do next; it does not open the menu
  const help = colony.locator('.colony-help');
  await expect(help).toContainText('Click a colonist');
  await colony.locator('.square .token').click();
  await expect(colony.locator('.token-selected')).toHaveCount(1);
  await expect(page.locator('.dialog')).toHaveCount(0);
  await expect(help).toContainText('selected: click a square or a building');
  await expect(colony).toHaveAttribute('data-holding', 'colonist');
  // a click on a building, then on a square, sends them there, still selected
  await colony.locator('.building[data-building="townHall"]').click();
  await expect(colony.locator('.building[data-building="townHall"] .token-selected')).toHaveCount(1);
  await expect(colony.locator('.building[data-building="townHall"] .slot-free')).toHaveCount(2);
  await colony.locator('.square[data-square="-1,0"]').click();
  await expect(colony.locator('.square[data-square="-1,0"] .token-selected')).toHaveCount(1);
  // a click on the selected colonist is the jobs menu
  await colony.locator('.token-selected').click();
  await expect(page.locator('.dialog')).toContainText('Choose work');
});

test('the keyboard alone opens a colony, loads cargo, changes the project and leaves', async ({ page }) => {
  await foundJamestown(page);
  const colony = page.locator('.colony-screen');
  await page.keyboard.press('Escape');
  await expect(colony).toHaveCount(0);

  // bring the caravel into port, then open the colony from view mode
  await expect(field(page, 'unit')).toHaveText('Pioneer');
  await page.keyboard.press('w'); // the pioneer waits; the ship comes up
  await expect(field(page, 'unit')).toHaveText('Caravel');
  await page.keyboard.press('ArrowLeft');
  // docking ends the ship's turn and wakes the pioneer, who is now in the colony: centre on him
  await expect(field(page, 'unit')).toHaveText('Pioneer');
  await page.keyboard.press('c');
  await page.keyboard.press('v');
  await page.keyboard.press('Enter');
  await expect(colony).toBeVisible();
  await expect(colony.locator('.carrier')).toHaveCount(1);

  // Tab round to the warehouse, walk to Muskets, load a hold of them with '='
  for (let i = 0; i < 8 && (await page.evaluate(() => document.activeElement?.closest('[data-region]')?.getAttribute('data-region'))) !== 'warehouse'; i++) await page.keyboard.press('Tab');
  for (let i = 0; i < 20 && !(await page.evaluate(() => document.activeElement?.textContent?.startsWith('Muskets'))); i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('=');
  await expect(colony.locator('.carrier .token-cargo')).toHaveText('Muskets50');
  await expect(colony.locator('.token-good', { hasText: 'Muskets' })).toContainText('0');

  // unload it again with U
  await page.keyboard.press('u');
  await expect(colony.locator('.carrier .token-cargo')).toHaveCount(0);
  await expect(colony.locator('.token-good', { hasText: 'Muskets' })).toContainText('50');

  // 3 shows construction; C changes the project
  await page.keyboard.press('3');
  await expect(colony).toHaveAttribute('data-tab', 'construction');
  await expect(colony.locator('.construction-item')).toHaveText('Building: Docks');
  await page.keyboard.press('c');
  const menu = page.getByRole('dialog').filter({ hasText: 'What shall the colony build?' });
  await menu.getByRole('button', { name: /^Stable/ }).focus();
  await page.keyboard.press('Enter');
  await expect(colony.locator('.construction-item')).toHaveText('Building: Stable');
  await page.keyboard.press('b');
  await page.keyboard.press('Escape'); // decline to buy
  await page.keyboard.press('1');
  await expect(colony).toHaveAttribute('data-tab', 'production');
  await page.keyboard.press('m');
  await expect(colony).toHaveAttribute('data-tab', 'units');
  await page.keyboard.press('Escape');
  await expect(colony).toHaveCount(0);
  await expect(page.locator('canvas.map')).toBeFocused();
});

test('a passenger on a docked ship can be picked in the colony and put ashore or to work', async ({ page }) => {
  await foundJamestown(page);
  const colony = page.locator('.colony-screen');
  await page.keyboard.press('Escape');
  await expect(colony).toHaveCount(0);
  await expect(field(page, 'unit')).toHaveText('Pioneer');
  await page.keyboard.press('w'); // the pioneer waits; the ship comes up and docks with him aboard
  await expect(field(page, 'unit')).toHaveText('Caravel');
  await page.keyboard.press('ArrowLeft');
  await expect(field(page, 'unit')).toHaveText('Pioneer');
  await page.keyboard.press('c');
  await page.keyboard.press('v');
  await page.keyboard.press('Enter');
  await expect(colony).toBeVisible();
  const rider = colony.locator('.carrier .token-unit');
  await expect(rider).toHaveCount(1);
  await rider.click();
  await expect(colony.locator('.carrier .token-selected')).toHaveCount(1);
  await expect(colony.locator('.colony-help')).toContainText('put them ashore');
  // a click outside the gates lands them; from there a building takes them into the colony
  await colony.locator('.outside-row .row-title').click();
  await expect(colony.locator('.outside-row .token-unit')).toHaveCount(1);
  await expect(rider).toHaveCount(0);
  await colony.locator('.building[data-building="townHall"]').click();
  await expect(colony.locator('.outside-row .token-unit')).toHaveCount(0);
  await expect(colony.locator('.building[data-building="townHall"] .token')).toHaveCount(1);
});

test('right-clicking in the colony opens the encyclopedia at that building, cargo or colonist', async ({ page }) => {
  await foundJamestown(page);
  const colony = page.getByRole('dialog', { name: 'Colony' });
  const pedia = page.getByRole('dialog', { name: 'Encyclopedia' });
  await colony.locator('[data-building="townHall"] .building-name').click({ button: 'right' });
  await expect(pedia).toHaveAttribute('data-entry', 'buildings:townHall');
  await page.keyboard.press('Escape');
  await colony.locator('.token-good').first().click({ button: 'right' });
  await expect(pedia).toHaveAttribute('data-entry', /^cargo:/);
  await page.keyboard.press('Escape');
  await colony.locator('.token-colonist').first().click({ button: 'right' });
  await expect(pedia).toHaveAttribute('data-entry', /^skills:/);
  await page.keyboard.press('Escape');
  await expect(pedia).toHaveCount(0);
  await expect(colony).toBeVisible();
});

test('with cargo or a good selected, the Custom House button still opens its menu and moves nothing', async ({ page }) => {
  const rows = Array.from({ length: 14 }, (_, y) => (y === 0 || y === 13 ? '~'.repeat(20) : `~~${'.'.repeat(16)}~~`));
  let state = world({ rows, seed: 5, players: [{ id: 'p0', kind: 'human' }] });
  state = withColony(state, { id: 'james', owner: 'p0', x: 2, y: 5, name: 'Jamestown', goods: { furs: 40 }, buildings: ['townHall', 'customHouse'] });
  state = withUnit(state, { id: 'ship', owner: 'p0', type: 'merchantman', profession: null, x: 2, y: 5, cargo: { furs: 100 } });
  await page.addInitScript((text) => localStorage.setItem('new-world:autosave', text), saveGame({ options: { seed: 5 }, log: [], state }));
  await page.goto('/');
  await page.getByRole('menuitem', { name: 'Load Game' }).click();
  await expect(field(page, 'unit')).toHaveText('Merchantman');
  await page.keyboard.press('v');
  await page.keyboard.press('Enter');
  const colony = page.locator('.colony-screen');
  const customs = colony.getByRole('button', { name: 'Custom House (X)' });
  const menu = page.locator('.dialog').filter({ hasText: 'Which goods shall the Custom House export?' });
  const furs = colony.locator('.token-good', { hasText: 'Furs' });

  for (const pick of [colony.locator('.carrier .token-cargo'), furs]) {
    await pick.click();
    await expect(colony.locator('.token-selected')).toHaveCount(1);
    await customs.click();
    await expect(menu).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(colony.locator('.carrier .token-cargo')).toHaveText('Furs100');
    await expect(furs).toContainText('40');
  }
  // the warehouse itself still takes the selected cargo
  await colony.locator('.carrier .token-cargo').click();
  await colony.locator('[data-region="warehouse"] h3').click();
  await expect(colony.locator('.carrier .token-cargo')).toHaveCount(0);
  await expect(furs).toContainText('140');
});
