import { expect, test } from '@playwright/test';
import { BUILDING_CHAINS } from '../../src/engine/data/buildings';
import { saveGame } from '../../src/engine/save';
import type { Colonist } from '../../src/engine/state';
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

/** How many pixels of a canvas are painted at all, and how many are exactly this colour. */
const painted = (canvas: HTMLCanvasElement | SVGElement, rgb: readonly number[]): { any: number; match: number; width: number } => {
  const c = canvas as HTMLCanvasElement;
  const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
  let any = 0;
  let match = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] !== 0) any++;
    if (data[i + 3] === 255 && data[i] === rgb[0] && data[i + 1] === rgb[1] && data[i + 2] === rgb[2]) match++;
  }
  return { any, match, width: c.width };
};
const ENGLISH_RED = [0xc8, 0x32, 0x2b];
const DUTCH_ORANGE = [0xd9, 0x81, 0x2e];

test('the colony is drawn as a town plan: pictures of buildings with places to stand, goods icons, a flag and a bell gauge', async ({ page }) => {
  await foundJamestown(page);
  const colony = page.locator('.colony-screen');

  // the head of the sheet: the owner's flag, the name, the population, the bell gauge with the Tory share
  const header = colony.locator('.colony-header');
  const flag = await header.locator('canvas.colony-flag').evaluate(painted, ENGLISH_RED);
  expect(flag.width).toBe(16);
  expect(flag.match).toBeGreaterThan(20); // the red cross
  await expect(colony).toHaveAttribute('data-nation', 'england');
  const gauge = header.getByRole('meter', { name: 'Sons of Liberty' });
  await expect(gauge).toHaveAttribute('aria-valuenow', '0');
  await expect(gauge.locator('canvas.liberty-bell')).toBeVisible();
  await expect(gauge.locator('.liberty-bar')).toBeVisible();
  await expect(gauge).toContainText('Tories 100%');
  expect((await gauge.locator('.liberty-fill').boundingBox())?.width ?? 0).toBe(0);

  // every building is its picture, roofed in the owner's colour, with its three free places showing
  const buildings = colony.locator('.building');
  await expect(buildings).toHaveCount(7);
  for (const id of ['townHall', 'weaversHouse', 'carpentersShop', 'blacksmithsHouse']) {
    const art = await colony.locator(`.building[data-building="${id}"] canvas.building-art`).evaluate(painted, ENGLISH_RED);
    expect(art.width, id).toBe(32);
    expect(art.any, id).toBeGreaterThan(250);
    expect(art.match, id).toBeGreaterThan(10);
  }
  await expect(colony.locator('.building .slot-free')).toHaveCount(21);
  await expect(colony.locator('.building[data-building="townHall"] .slot-free').first()).toBeVisible();
  // in a small town a picture is drawn three screen pixels to the art pixel
  expect((await colony.locator('.building[data-building="townHall"] canvas.building-art').boundingBox())?.width).toBe(96);

  await page.screenshot({ path: 'test-results/colony-one-colonist.png' });

  // someone put to work in a building stands on its picture, as a figure with a name
  await colony.locator('.square .token').dragTo(colony.locator('.building[data-building="townHall"] canvas.building-art'));
  const worker = colony.locator('.building[data-building="townHall"] .building-plot .token-colonist');
  await expect(worker).toHaveCount(1);
  await expect(worker.locator('canvas.token-figure')).toBeVisible();
  await expect(worker).toHaveText(/^Free Colonist\d+ Liberty Bells$/);
  await expect(colony.locator('.building[data-building="townHall"] .slot-free')).toHaveCount(2);
  const plot = (await colony.locator('.building[data-building="townHall"] .building-plot').boundingBox())!;
  const figure = (await worker.locator('canvas').boundingBox())!;
  expect(figure.y).toBeGreaterThanOrEqual(plot.y);
  expect(figure.y).toBeLessThan(plot.y + 96); // his head is over the picture: he stands on it

  // every good in the warehouse is its icon with the count, and N hides the counts it hid before
  await expect(colony.locator('.token-good canvas.good-art')).toHaveCount(16);
  const musket = await colony.locator('.token-good[data-key="good:muskets"] canvas').evaluate(painted, [0, 0, 0]);
  expect(musket.width).toBe(16);
  expect(musket.any).toBeGreaterThan(40);
  await expect(colony.locator('.token-good[data-key="good:muskets"] .token-sub')).toHaveText('50');
  await expect(colony.locator('.production-table tr[data-good="bells"] th canvas')).toBeVisible();
  await expect(worker.locator('.token-sub')).toBeVisible();
  await page.keyboard.press('n');
  await expect(colony).toHaveClass(/hide-numbers/);
  await expect(worker.locator('.token-sub')).toBeHidden();
  await expect(colony.locator('.production-table tr[data-good="bells"] td').first()).toBeHidden();
  await page.keyboard.press('n');
  await expect(worker.locator('.token-sub')).toBeVisible();

  // the sheets are parchment with ink on them, and the help line is a footnote in fainter ink
  const tone = (selector: string): Promise<{ ink: number; paper: number; image: string; style: string }> => colony.locator(selector).first().evaluate((node) => {
    const light = (colour: string): number => {
      const [r, g, b] = (colour.match(/[\d.]+/g) ?? []).map(Number) as [number, number, number];
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const style = getComputedStyle(node);
    return { ink: light(style.color), paper: light(style.backgroundColor), image: style.backgroundImage, style: style.fontStyle };
  });
  for (const region of ['settlement', 'area', 'people', 'transport', 'multi', 'warehouse']) {
    const sheet = await tone(`[data-region="${region}"]`);
    expect(sheet.image, region).not.toBe('none');
    expect(sheet.ink, region).toBeLessThan(70); // dark ink
  }
  const help = await tone('.colony-help');
  const body = await tone('.food-line');
  expect(help.style).toBe('italic');
  expect(help.ink).toBeGreaterThan(body.ink); // faded
  expect(help.ink).toBeLessThan(120); // and still ink
});

test('a large colony: every chain shows the picture of the link it has reached, cargo is icons, and the flag is the owner\'s', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const rows = Array.from({ length: 14 }, (_, y) => (y === 0 || y === 13 ? '~'.repeat(20) : `~~${'.f.g'.repeat(4)}~~`));
  let state = world({ rows, seed: 5, players: [{ id: 'p0', kind: 'human', nation: 'netherlands' }] });
  const top = Object.values(BUILDING_CHAINS).map((chain) => chain[chain.length - 1] as string);
  const who = (id: string, job: Colonist['job'], profession: Colonist['profession'] = 'freeColonist'): Colonist => ({ id, profession, job, turns: 0 });
  state = withColony(state, {
    id: 'james', owner: 'p0', x: 2, y: 5, name: 'New Amsterdam', buildings: top, hammers: 80, construction: { kind: 'unit', unit: 'artillery' },
    goods: { food: 180, sugar: 40, tobacco: 95, cotton: 12, furs: 230, lumber: 64, ore: 31, silver: 8, horses: 26, rum: 77, cigars: 140, cloth: 55, coats: 9, tradeGoods: 20, tools: 120, muskets: 50 },
    colonists: [
      who('a', { kind: 'field', dx: 1, dy: -1, good: 'food' }, 'expertFarmer'), who('b', { kind: 'field', dx: 1, dy: 0, good: 'lumber' }, 'expertLumberjack'),
      who('c', { kind: 'field', dx: 1, dy: 1, good: 'food' }), who('d', { kind: 'field', dx: 0, dy: 1, good: 'furs' }, 'expertFurTrapper'),
      who('e', { kind: 'work', trade: 'weaver' }, 'masterWeaver'), who('f', { kind: 'work', trade: 'weaver' }), who('g', { kind: 'work', trade: 'weaver' }, 'indenturedServant'),
      who('h', { kind: 'work', trade: 'statesman' }, 'elderStatesman'), who('i', { kind: 'work', trade: 'statesman' }),
      who('j', { kind: 'work', trade: 'tobacconist' }, 'masterTobacconist'), who('k', { kind: 'work', trade: 'distiller' }, 'masterDistiller'),
      who('l', { kind: 'work', trade: 'carpenter' }, 'masterCarpenter'), who('m', { kind: 'work', trade: 'carpenter' }),
      who('n', { kind: 'work', trade: 'blacksmith' }, 'masterBlacksmith'), who('o', { kind: 'work', trade: 'preacher' }, 'firebrandPreacher'),
      who('p', { kind: 'work', trade: 'furTrader' }, 'masterFurTrader'), who('q', { kind: 'idle' }, 'pettyCriminal'),
    ],
  });
  state = withUnit(state, { id: 'ship', owner: 'p0', type: 'galleon', profession: null, x: 2, y: 5, cargo: { furs: 100, tools: 60, tradeGoods: 100 } });
  state = withUnit(state, { id: 'wagon', owner: 'p0', type: 'wagonTrain', profession: null, x: 2, y: 5, cargo: { cloth: 100 } });
  state = withUnit(state, { id: 'pass', owner: 'p0', x: 2, y: 5, aboard: 'ship' });
  state = withUnit(state, { id: 'sol', owner: 'p0', type: 'soldier', x: 2, y: 5, profession: 'veteranSoldier' });
  await page.addInitScript((text) => localStorage.setItem('new-world:autosave', text), saveGame({ options: { seed: 5 }, log: [], state }));
  await page.goto('/');
  await page.getByRole('menuitem', { name: 'Load Game' }).click();
  await expect(field(page, 'unit')).not.toHaveText('');
  await page.keyboard.press('v');
  await page.keyboard.press('Enter');
  const colony = page.locator('.colony-screen');
  await expect(colony.getByRole('heading', { name: 'New Amsterdam' })).toBeVisible();

  // one picture per chain, of its present link, under the owner's orange
  await expect(colony).toHaveAttribute('data-nation', 'netherlands');
  expect((await colony.locator('canvas.colony-flag').evaluate(painted, DUTCH_ORANGE)).match).toBeGreaterThan(30);
  await expect(colony.locator('.building')).toHaveCount(top.length);
  await expect(colony.locator('.building canvas.building-art')).toHaveCount(top.length);
  for (const id of ['shipyard', 'fortress', 'university', 'textileMill', 'cathedral']) await expect(colony.locator(`.building[data-building="${id}"] canvas.building-art`)).toHaveCount(1);
  for (const id of ['docks', 'drydock', 'stockade']) await expect(colony.locator(`.building[data-building="${id}"]`)).toHaveCount(0);
  const [shipyard, cathedral] = await Promise.all(['shipyard', 'cathedral'].map((id) => colony.locator(`.building[data-building="${id}"] canvas.building-art`).evaluate((c) => (c as HTMLCanvasElement).toDataURL())));
  expect(shipyard).not.toBe(cathedral);
  expect((await colony.locator('.building[data-building="shipyard"] canvas.building-art').evaluate(painted, DUTCH_ORANGE)).match).toBeGreaterThan(3);
  // with this many buildings the pictures are drawn smaller so the plan fits
  expect((await colony.locator('.building[data-building="shipyard"] canvas.building-art').boundingBox())?.width).toBe(64);
  // three weavers stand on the mill, and it has no place left
  const mill = colony.locator('.building[data-building="textileMill"]');
  await expect(mill.locator('.token-colonist canvas.token-figure')).toHaveCount(3);
  await expect(mill.locator('.slot-free')).toHaveCount(0);
  await expect(mill.locator('.token-colonist .token-label')).toHaveText(['Master Weaver', 'Free Colonist', 'Indentured Servant']);
  for (const label of await mill.locator('.token-colonist .token-label').all()) await expect(label).toBeVisible();

  // ships and wagons are their figures; what they carry is an icon and a count
  await expect(colony.locator('.carrier')).toHaveCount(2);
  await expect(colony.locator('.carrier .token-carrier canvas.token-figure')).toHaveCount(2);
  await expect(colony.locator('.carrier .token-cargo')).toHaveText(['Furs100', 'Trade Goods100', 'Tools60', 'Cloth100']);
  await expect(colony.locator('.carrier .token-cargo canvas.good-art')).toHaveCount(4);
  await expect(colony.locator('.carrier .token-unit canvas.token-figure')).toHaveCount(1);
  await expect(colony.locator('.outside-row .token-unit canvas.token-figure')).toHaveCount(1);
  await expect(colony.locator('.token-good.token-over')).toHaveText(['Furs230']);

  // nothing in the plan spills out of its sheet sideways, and the whole screen still fits the window
  for (const region of ['settlement', 'people', 'transport', 'warehouse']) {
    const spill = await colony.locator(`[data-region="${region}"]`).evaluate((node) => node.scrollWidth - node.clientWidth);
    expect(spill, region).toBeLessThanOrEqual(0);
  }
  expect(await colony.evaluate((node) => node.scrollHeight - node.clientHeight)).toBeLessThanOrEqual(0);

  await page.screenshot({ path: 'test-results/colony-large.png' });

  // a weaver is carried from the mill to the cathedral by a click on him and a click on its picture
  await mill.locator('.token-colonist').first().click();
  await colony.locator('.building[data-building="cathedral"] canvas.building-art').click();
  await expect(colony.locator('.building[data-building="cathedral"] .token-colonist')).toHaveCount(2);
  await expect(mill.locator('.slot-free')).toHaveCount(1);
  expect(errors).toEqual([]);
});
