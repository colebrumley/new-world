import { writeFile } from 'node:fs/promises';
import { expect, test, type Locator, type Page } from '@playwright/test';
import sharp from 'sharp';
import { STARTING_BUILDINGS } from '../../src/engine/data/colony';
import { saveGame } from '../../src/engine/save';
import type { Colonist, GameState, Settlement } from '../../src/engine/state';
import { makeTile } from '../../src/engine/tile';
import { TOOLTIP_DELAY_MS } from '../../src/ui/tile-tooltip';
import { setTile, withColony, withUnit, world } from '../helpers/world';
import { field, setSail, settled, startNewGame } from './helpers';

// Screenshots of the game's screens for the player's manual (wiki/images/screens/, R-1026).
//
// Not part of the e2e suite: every test here is skipped unless WIKI_SHOTS=1 is set. To regenerate
// the pictures after a change to a screen, run
//
//   WIKI_SHOTS=1 npx playwright test test/e2e/wiki-shots.spec.ts
//
// and commit what changed under wiki/images/screens/. test/unit/wiki/screens.test.ts holds the list
// of pictures and checks each is there at 1280 x 800. Every page is opened with `still`, which
// freezes the blink and the water, and each picture is taken once the frame has settled.
//
// Each picture is written as a palette PNG (R-1037): the parchment and the antialiased text give a
// screen four to seven thousand colours, which a 24-bit PNG keeps at half a megabyte or more.
// sharp's quantiser (libimagequant) maps them to at most 256. `colours` alone only sets the bit
// depth, so `quality` is what holds the folder under the 5 MB the screens test allows; without
// dithering the text and the ruled lines stay crisp. The quantiser is deterministic: the same
// screen gives the same bytes.

test.skip(!process.env['WIKI_SHOTS'], 'set WIKI_SHOTS=1 to write the screenshots for the wiki');

const OUT = 'wiki/images/screens';

/** The palette PNG every screenshot is written as. */
const PALETTE = { palette: true, colours: 256, quality: 75, dither: 0, effort: 10, compressionLevel: 9 } as const;

/** Quiet options: no adviser lines in the log, no shimmer on the water. */
async function quiet(page: Page): Promise<void> {
  await page.addInitScript(() => {
    if (!localStorage.getItem('new-world:options')) localStorage.setItem('new-world:options', JSON.stringify({ tutorialHints: false, waterShimmer: false }));
  });
}

/** Put the pointer where it shows nothing (the sidebar in a game, the corner elsewhere). */
async function park(page: Page): Promise<void> {
  const side = page.locator('.sidebar');
  if (await side.isVisible()) {
    const box = (await side.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height - 8);
  } else {
    await page.mouse.move(1, 1);
  }
}

/** Wait for the fonts and two frames, then write the picture. */
async function shoot(page: Page, name: string, { parked = true }: { parked?: boolean } = {}): Promise<void> {
  if (parked) await park(page);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await settled(page);
  // (CSS transitions, such as the title painting's fade, are finished first)
  const shot = await page.screenshot({ animations: 'disabled' });
  await writeFile(`${OUT}/${name}.png`, await sharp(shot).png(PALETTE).toBuffer());
}

/** Open the page with a prepared game in the autosave and load it from the title screen. */
async function load(page: Page, state: GameState, seed = 7): Promise<void> {
  await quiet(page);
  await page.addInitScript((text) => {
    if (!sessionStorage.getItem('seeded')) localStorage.setItem('new-world:autosave', text);
    sessionStorage.setItem('seeded', '1');
  }, saveGame({ options: { seed }, log: [], state }));
  await page.goto('/?still');
  await page.getByRole('menuitem', { name: 'Load Game' }).click();
  await expect(page.locator('canvas.map')).toHaveAttribute('data-frames', /\d+/);
}

/** England, seed 7, the America scenario, turn 1 with the caravel off the coast. */
async function england(page: Page): Promise<void> {
  await quiet(page);
  await page.goto('/?seed=7&still');
  await startNewGame(page, 'america', { nation: 'england' });
  await expect(field(page, 'unit')).toHaveText('Caravel');
}

/** The steps of foundJamestown in test/e2e/helpers.ts, from a game already started with `still`. */
async function foundJamestown(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog');
  for (let step = 0; step < 12 && !(await dialog.isVisible()); step++) {
    if ((await field(page, 'unit').textContent()) === 'No active unit') {
      await page.keyboard.press('Enter');
      await settled(page);
    }
    await page.keyboard.press('ArrowLeft');
    await settled(page);
  }
  await dialog.getByRole('button', { name: 'Make landfall' }).click();
  await expect(field(page, 'unit')).toHaveText('Soldier');
  const ship = (await field(page, 'location').textContent())!;
  const [shipX, shipY] = ship.match(/\d+/g)!.map(Number) as [number, number];
  const colony = `(${shipX - 1}, ${shipY})`;
  await page.keyboard.press('ArrowLeft');
  await expect(field(page, 'unit')).toHaveText('Pioneer');
  await page.keyboard.press('Enter');
  await settled(page);
  for (let i = 0; i < 4 && (await field(page, 'location').textContent()) !== colony; i++) {
    await page.keyboard.press('w');
    await settled(page);
  }
  await expect(field(page, 'location')).toHaveText(colony);
  await page.keyboard.press('b');
  const build = dialog.getByRole('button', { name: 'Build the colony' });
  const name = dialog.getByRole('textbox');
  for (let i = 0; i < 3; i++) {
    await expect(build.or(name)).toBeVisible();
    if (await name.isVisible()) break;
    await build.click();
  }
  await name.press('Enter');
  await expect(page.locator('.colony-screen')).toBeVisible();
}

/** A small island: plains and grassland, woods, a river, hills, a marsh. */
const LAND = [
  '~~~~~~~~~~~~~~~~~~~~',
  '~~~..ggff....hh..~~~',
  '~~..gggfr.....hm.f~~',
  '~~.ggg.fr....fhhff~~',
  '~...gg..r...ffff.~~~',
  '~~..g.g.rg..ff.f..~~',
  '~~.ff...r.g...g...~~',
  '~~ff.fg.r..gg.....~~',
  '~~fff..gr...g..ww.~~',
  '~~.ff...r.....wWw.~~',
  '~~~.....r..ff..w..~~',
  '~~~~..hhr..fff...~~~',
  '~~~~~..h..~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~',
];

/** The island above, a French rival; every square explored. */
function land(players: Parameters<typeof world>[0]['players'] = [{ id: 'p0', kind: 'human', nation: 'england' }, { id: 'fr', kind: 'ai', nation: 'france' }]): GameState {
  return world({ rows: LAND, seed: 7, players });
}

/** A village of the Sioux, friendly to everyone. */
const village = (x: number, y: number): Settlement => ({ id: 'v1', tribe: 'sioux', x, y, capital: false, population: 4, growth: 0, taught: false, tributePaid: false, alarm: {}, mission: null, scouted: [], lastBought: null, lastSold: null, haggleMemory: null });

/** Eight colonists and the buildings a grown colony has, 100 of food, lumber and furs; a soldier on guard. */
function largeColony(): GameState {
  const who = (id: string, job: Colonist['job'], profession: Colonist['profession'] = 'freeColonist'): Colonist => ({ id, profession, job, turns: 0 });
  let state = withColony(land(), {
    // on the west coast, so that Docks can stand; the buildings every colony starts with, and six more
    id: 'james', owner: 'p0', x: 2, y: 6, name: 'Jamestown',
    buildings: [...STARTING_BUILDINGS, 'stockade', 'lumberMill', 'docks', 'schoolhouse', 'printingPress', 'church'],
    goods: { food: 100, lumber: 100, furs: 100 },
    construction: { kind: 'building', id: 'armory' }, hammers: 24,
    sol: { n: 4, d: 9 },
    colonists: [
      who('a', { kind: 'field', dx: 1, dy: -1, good: 'food' }, 'expertFarmer'),
      who('b', { kind: 'field', dx: 1, dy: 0, good: 'lumber' }, 'expertLumberjack'),
      who('c', { kind: 'field', dx: 0, dy: -1, good: 'food' }),
      who('d', { kind: 'field', dx: 0, dy: 1, good: 'furs' }, 'expertFurTrapper'),
      who('e', { kind: 'work', trade: 'carpenter' }, 'masterCarpenter'),
      who('f', { kind: 'work', trade: 'carpenter' }),
      who('g', { kind: 'work', trade: 'statesman' }, 'elderStatesman'),
      who('h', { kind: 'work', trade: 'preacher' }, 'indenturedServant'),
    ],
  });
  state = withColony(state, { id: 'q', owner: 'fr', x: 16, y: 4, name: 'Quebec' });
  state = withUnit(state, { id: 'guard', owner: 'p0', type: 'soldier', x: 2, y: 6, profession: 'veteranSoldier' });
  // a Congress at work, so its report has something to say
  const PEACE: Record<string, Record<string, 'peace' | 'war'>> = { p0: { fr: 'peace' }, fr: { p0: 'peace' } };
  // and the French met and at peace, so the foreign report has a stance to show
  return { ...state, turn: 60, players: state.players.map((p) => (p.id === 'p0' ? { ...p, name: 'Walter Raleigh', gold: 1200, fathers: ['peterMinuit', 'thomasJefferson'], candidate: 'paulRevere', fatherBells: 120, stance: PEACE.p0! } : { ...p, stance: PEACE.fr! })) };
}

// --- before the game ----------------------------------------------------------------------------

test('title, customize, choose a power, audience', async ({ page }) => {
  await quiet(page);
  await page.goto('/?seed=7&still');
  await expect(page.locator('canvas.frontispiece')).toHaveAttribute('data-painted', 'true');
  await expect(page.locator('.title-difficulty-note')).not.toHaveText('');
  await shoot(page, 'title');

  await page.getByRole('menuitem', { name: 'Customize New World' }).click();
  await expect(page.getByRole('group')).toHaveCount(4);
  await shoot(page, 'customize');
  await page.getByRole('button', { name: 'Cancel' }).click();

  await page.getByRole('menuitem', { name: 'Start a Game in America' }).click();
  const power = page.locator('.power');
  await power.locator('.power-row[data-nation="england"]').click();
  await expect(power.locator('.power-row[data-nation="england"]')).toHaveAttribute('aria-checked', 'true');
  await shoot(page, 'choose-power');

  await power.getByRole('button', { name: 'Set Sail' }).click();
  const audience = page.getByRole('dialog').filter({ hasText: 'An audience with' });
  await expect(audience).toBeVisible();
  await shoot(page, 'audience');
});

// --- the map --------------------------------------------------------------------------------------

test('the map at the start, zoomed out', async ({ page }) => {
  await england(page);
  const canvas = page.locator('canvas.map');
  await shoot(page, 'map-start');
  let view = await canvas.getAttribute('data-view');
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('x');
    await settled(page);
    const now = await canvas.getAttribute('data-view');
    if (now === view) break;
    view = now;
  }
  await shoot(page, 'map-zoomed-out');
});

test('the tooltip on a resource square', async ({ page }) => {
  // the hand-made world and the Prime Cotton square of test/e2e/tooltip.spec.ts: seed 7 shows no
  // resource on the first turn
  const COTTON = { x: 5, y: 4 };
  const rows = Array.from({ length: 12 }, (_, y) => (y === 0 || y === 11 ? '~'.repeat(16) : `~${'.'.repeat(14)}~`));
  let state: GameState = world({ rows, seed: 3, players: [{ id: 'p0', kind: 'human' }, { id: 'fr', kind: 'ai', nation: 'france' }] });
  const tiles = state.map.tiles.map((tile) => ({ ...tile, explored: 0xff }));
  tiles[COTTON.y * 16 + COTTON.x] = makeTile({ explored: 0xff, base: 'prairie', resource: 'primeCotton' });
  tiles[4 * 16 + 6] = makeTile({ explored: 0xff, base: 'tundra', resource: 'minerals', river: 'minor' });
  state = withUnit({ ...state, map: { ...state.map, tiles } }, { id: 'u0', type: 'soldier', owner: 'p0', profession: null, x: 2, y: 9, orders: 'none' });
  await load(page, state, 3);
  const canvas = page.locator('canvas.map');
  const v = await canvas.evaluate((c) => JSON.parse((c as HTMLCanvasElement).dataset['view']!) as { tileSize: number; originX: number; originY: number });
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + (COTTON.x - v.originX + 0.5) * v.tileSize, box.y + (COTTON.y - v.originY + 0.5) * v.tileSize);
  await expect(page.locator('.map-tooltip')).toBeVisible({ timeout: TOOLTIP_DELAY_MS + 2000 });
  await shoot(page, 'map-tooltip', { parked: false });
});

// --- the colony -----------------------------------------------------------------------------------

test('Jamestown just founded, and its construction menu', async ({ page }) => {
  await england(page);
  await foundJamestown(page);
  await shoot(page, 'colony');
  await page.keyboard.press('3');
  await page.keyboard.press('c');
  await expect(page.locator('.dialog').filter({ hasText: 'What shall the colony build?' })).toBeVisible();
  await shoot(page, 'colony-construction');
});

/** Open the colony the guard stands in. */
async function openColony(page: Page): Promise<Locator> {
  await expect(field(page, 'unit')).toHaveText(/Soldier$/);
  await page.keyboard.press('v');
  await page.keyboard.press('Enter');
  const colony = page.locator('.colony-screen');
  await expect(colony.getByRole('heading', { name: 'Jamestown' })).toBeVisible();
  return colony;
}

test('a large colony', async ({ page }) => {
  await load(page, largeColony());
  await openColony(page);
  await shoot(page, 'colony-large');
});

// --- Europe ---------------------------------------------------------------------------------------

test('Europe and its Recruit window', async ({ page }) => {
  await england(page);
  await page.keyboard.press('e');
  const europe = page.locator('.europe-screen');
  await expect(europe).toBeVisible();
  await shoot(page, 'europe');
  await page.keyboard.press('r');
  await expect(page.locator('.dialog').filter({ hasText: 'Whose passage will you pay?' })).toBeVisible();
  await shoot(page, 'europe-recruit');
});

// --- reports --------------------------------------------------------------------------------------

test('the advisers\' reports', async ({ page }) => {
  await load(page, largeColony());
  await expect(field(page, 'unit')).toHaveText(/Soldier$/);
  for (const [key, name, title] of [['F5', 'report-economic', 'Economic Adviser'], ['F6', 'report-colony', 'Colony Adviser'], ['F8', 'report-foreign', 'Foreign Affairs'], ['F3', 'report-congress', 'Continental Congress'], ['F10', 'report-score', 'Colonial Score']] as const) {
    await page.keyboard.press(key);
    const report = page.getByRole('dialog', { name: title });
    await expect(report).toBeVisible();
    await shoot(page, name);
    await page.keyboard.press('Escape');
    await expect(report).toHaveCount(0);
  }
});

// --- help and options -----------------------------------------------------------------------------

test('the encyclopedia, the options and the saves', async ({ page }) => {
  await england(page);
  await page.keyboard.press('Alt+P');
  const pedia = page.getByRole('dialog', { name: 'Encyclopedia' });
  await pedia.getByRole('group', { name: 'Units', exact: true }).getByRole('button', { name: 'Soldier', exact: true }).click();
  await expect(pedia.locator('.pedia-page h3')).toHaveText('Soldier');
  await shoot(page, 'encyclopedia');
  await page.keyboard.press('Escape');
  await expect(pedia).toHaveCount(0);

  await page.keyboard.press('Alt+G');
  const options = page.getByRole('dialog', { name: 'Game Options' });
  await expect(options).toBeVisible();
  await shoot(page, 'options');
  await page.keyboard.press('Escape');
  await expect(options).toHaveCount(0);

  // two games under two names: England's in slot 1, the Netherlands' in slot 2
  const saves = page.getByRole('dialog', { name: 'Save or Load Game' });
  await page.keyboard.press('Alt+L');
  await saves.getByRole('button', { name: 'Save Slot 1' }).click();
  await expect(saves.locator('.save-notice')).toHaveText('Saved in slot 1.');
  await page.keyboard.press('Escape');
  await page.goto('/?seed=8&still');
  await page.getByRole('menuitem', { name: 'Start a Game in America' }).click();
  await setSail(page, { nation: 'netherlands', name: 'Peter Stuyvesant' });
  await page.keyboard.press('Alt+L');
  await saves.getByRole('button', { name: 'Save Slot 2' }).click();
  await expect(saves.locator('.save-notice')).toHaveText('Saved in slot 2.');
  await expect(saves.getByRole('row', { name: /Slot 1/ })).toContainText('England');
  await shoot(page, 'saves');
});

// --- the end of the game --------------------------------------------------------------------------

test('retiring: the score, then the Hall of Fame', async ({ page }) => {
  await load(page, largeColony());
  await expect(field(page, 'unit')).toHaveText(/Soldier$/);
  await page.keyboard.press('Shift+R');
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Yes, retire' }).click();
  await dialog.getByRole('button', { name: 'So be it' }).click();
  const score = page.getByRole('dialog', { name: 'Colonial Score' });
  await expect(score.getByRole('group', { name: 'Hall of Fame' })).toBeVisible();
  await shoot(page, 'game-over');
  await page.keyboard.press('Escape');
  await expect(page.locator('canvas.map')).toHaveAttribute('data-over', 'retiredEarly');

  await page.goto('/?still');
  await page.getByRole('menuitem', { name: 'View Hall of Fame' }).click();
  const hall = page.getByRole('dialog', { name: 'Hall of Fame' });
  await expect(hall).toContainText('England');
  await shoot(page, 'hall-of-fame');
});

// --- moments in play ------------------------------------------------------------------------------

test('the combat analysis', async ({ page }) => {
  let state = land([{ id: 'p0', kind: 'human', nation: 'england' }]);
  state = withUnit(state, { id: 'sol', owner: 'p0', type: 'soldier', x: 6, y: 6, profession: 'veteranSoldier' });
  state = withUnit(state, { id: 'brave', owner: 'tribe:sioux', type: 'brave', profession: null, x: 7, y: 6 });
  state = { ...state, settlements: { v1: village(10, 8) } };
  await load(page, state);
  await expect(field(page, 'unit')).toHaveText(/Soldier$/);
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('dialog', { name: 'Combat Analysis' })).toBeVisible();
  await shoot(page, 'combat-analysis');
});

test('a trade route being edited', async ({ page }) => {
  let state = land();
  state = withColony(state, { id: 'james', owner: 'p0', x: 5, y: 6, name: 'Jamestown', goods: { furs: 80, food: 40 } });
  state = withColony(state, { id: 'ply', owner: 'p0', x: 12, y: 6, name: 'Plymouth', goods: { tools: 60 } });
  state = withUnit(state, { id: 'wagon', owner: 'p0', type: 'wagonTrain', profession: null, x: 5, y: 6 });
  state = { ...state, tradeRoutes: { r1: { id: 'r1', owner: 'p0', name: 'Fur Road', kind: 'land', stops: [{ colonyId: 'james', unload: ['tools'], load: ['furs'] }, { colonyId: 'ply', unload: ['furs'], load: ['tools'] }] } } };
  await load(page, state);
  const dialog = page.getByRole('dialog');
  await page.keyboard.press('Alt+t');
  await dialog.getByRole('button', { name: 'Edit Trade Route' }).click();
  await dialog.getByRole('button', { name: 'Fur Road' }).click();
  await expect(page.getByRole('dialog', { name: 'Edit Trade Route' })).toBeVisible();
  await shoot(page, 'trade-route');
});

test('a scout at a native village', async ({ page }) => {
  let state = land([{ id: 'p0', kind: 'human', nation: 'england' }]);
  state = withUnit(state, { id: 'scout', owner: 'p0', type: 'scout', x: 6, y: 6 });
  state = { ...state, settlements: { v1: village(7, 6) } };
  await load(page, state);
  await expect(field(page, 'unit')).toHaveText('Scout');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('dialog')).toBeVisible();
  await shoot(page, 'native-settlement');
});

test('a rumor explored', async ({ page }) => {
  let state = land([{ id: 'p0', kind: 'human', nation: 'england' }]);
  state = setTile(state, 7, 6, { rumor: true });
  state = withUnit(state, { id: 'scout', owner: 'p0', type: 'scout', x: 6, y: 6 });
  await load(page, state);
  await expect(field(page, 'unit')).toHaveText('Scout');
  await page.keyboard.press('ArrowRight');
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Continue' }).or(dialog.getByRole('button', { name: 'Search them' }))).toBeVisible();
  await shoot(page, 'rumor');
});

test('the declaration of independence', async ({ page }) => {
  let state = land([{ id: 'p0', kind: 'human', nation: 'england' }]);
  state = withColony(state, { id: 'james', owner: 'p0', x: 5, y: 6, name: 'Jamestown', sol: { n: 160, d: 200 } });
  state = withUnit(state, { id: 'scout', owner: 'p0', type: 'scout', x: 8, y: 6 });
  state = { ...state, players: state.players.map((p) => ({ ...p, candidate: 'paulRevere' })) };
  await load(page, state);
  await expect(field(page, 'unit')).toHaveText('Scout');
  await page.keyboard.press('Shift+I');
  await expect(page.getByRole('dialog')).toContainText('Declare independence');
  await shoot(page, 'declaration');
});

test('the Continental Congress offers its candidates', async ({ page }) => {
  let state = land([{ id: 'p0', kind: 'human', nation: 'england' }]);
  state = withColony(state, { id: 'james', owner: 'p0', x: 5, y: 6, name: 'Jamestown' });
  state = withUnit(state, { id: 'scout', owner: 'p0', type: 'scout', x: 8, y: 6 });
  // no candidate chosen and bells in hand: the Congress asks at the end of the turn
  state = { ...state, players: state.players.map((p) => ({ ...p, candidate: null, fatherBells: 40 })) };
  await load(page, state);
  await expect(field(page, 'unit')).toHaveText('Scout');
  await page.keyboard.press(' ');
  const offer = page.getByRole('dialog').filter({ hasText: 'Which Founding Father' });
  for (let i = 0; i < 3 && !(await offer.isVisible()); i++) {
    await page.keyboard.press('Enter');
    await settled(page);
  }
  await expect(offer).toBeVisible();
  await shoot(page, 'congress-choice');
});
