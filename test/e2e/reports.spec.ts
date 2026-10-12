import { expect, test, type Locator, type Page } from '@playwright/test';
import { saveGame } from '../../src/engine/save';
import type { GameState } from '../../src/engine/state';
import { withColony, withUnit, world } from '../helpers/world';

const summarise = (root: Element) => [...root.querySelectorAll('.report-section')].map((box) => ({
  heading: box.querySelector('h3')?.textContent,
  rows: [...box.querySelectorAll('tr')].map((tr) => [...tr.children].map((c) => c.textContent)),
  note: box.querySelector('p')?.textContent ?? null,
}));
import { field, settled, startNewGame } from './helpers';

/** A prepared game with a Congress under way. */
function congress(): string {
  const rows = Array.from({ length: 12 }, (_, y) => (y === 0 || y === 11 ? '~'.repeat(16) : `~${'.'.repeat(14)}~`));
  let state: GameState = world({ rows, seed: 3, difficulty: 'conquistador', players: [{ id: 'p0', kind: 'human', fathers: ['peterMinuit', 'thomasJefferson'] }, { id: 'rival', kind: 'ai', nation: 'france' }] });
  state = withColony(state, { id: 'col', owner: 'p0', x: 5, y: 5, name: 'Jamestown', sol: { n: 1, d: 4 } });
  state = withUnit(state, { id: 'scout', owner: 'p0', type: 'scout', x: 7, y: 5 });
  state = { ...state, players: state.players.map((p) => (p.id === 'p0' ? { ...p, candidate: 'paulRevere', fatherBells: 100 } : p)) };
  return saveGame({ options: { seed: 3 }, log: [], state });
}

test('F3 opens the Continental Congress report', async ({ page }) => {
  await page.addInitScript((text) => localStorage.setItem('new-world:autosave', text), congress());
  await page.goto('/');
  await page.getByRole('menuitem', { name: 'Load Game' }).click();
  await expect(field(page, 'unit')).toHaveText('Scout');

  await page.keyboard.press('F3');
  const report = page.getByRole('dialog', { name: 'Continental Congress' });
  await expect(report).toBeVisible();
  for (const group of ['Members (2 of 25)', 'Next session', 'Rebel sentiment', 'Royal Expeditionary Force']) await expect(report.getByRole('group', { name: group })).toBeVisible();
  const summary = await report.evaluate((root) => [...root.querySelectorAll('.report-section')].map((box) => ({
    heading: box.querySelector('h3')?.textContent,
    rows: [...box.querySelectorAll('tr')].map((tr) => [...tr.children].map((c) => c.textContent)),
  })));
  expect(JSON.stringify(summary, null, 2)).toMatchSnapshot('congress-report.json');

  // the adviser's portrait stands in the head beside the seal, and each father named has his own at the head of his line
  await expect(report.locator('.report-head .report-portrait canvas[data-portrait="congress"]')).toBeVisible();
  const faces = await report.evaluate((root) => [...root.querySelectorAll('.report-section tr')].map((tr) => [tr.querySelector('th')?.textContent, tr.querySelector<HTMLElement>('canvas.portrait')?.dataset['portrait'] ?? null]).filter(([, face]) => face));
  expect(faces).toEqual([['Peter Minuit', 'peterMinuit'], ['Thomas Jefferson', 'thomasJefferson'], ['Next to be seated', 'paulRevere']]);

  // Esc closes it and the map has the keys again
  await page.keyboard.press('Escape');
  await expect(report).toHaveCount(0);
  await page.keyboard.press('ArrowRight');
  await expect(field(page, 'location')).toHaveText('(8, 5)');
});

/** A prepared game with rivals on the map; `fathers` and `atWar` are the viewer's. */
function rivals(fathers: string[], atWar = false): string {
  const rows = Array.from({ length: 12 }, (_, y) => (y === 0 || y === 11 ? '~'.repeat(16) : `~${'.'.repeat(14)}~`));
  let state: GameState = world({ rows, seed: 3, players: [{ id: 'p0', kind: 'human', fathers, atWar }, { id: 'fr', kind: 'ai', nation: 'france' }, { id: 'sp', kind: 'ai', nation: 'spain' }] });
  const stance: Record<string, Record<string, 'war' | 'peace'>> = { p0: { fr: 'peace' }, fr: { p0: 'peace', sp: 'war' }, sp: { fr: 'war' } };
  state = { ...state, players: state.players.map((p) => ({ ...p, stance: stance[p.id] ?? {} })) };
  state = withColony(state, { id: 'col', owner: 'p0', x: 5, y: 5, name: 'Jamestown' });
  state = withColony(state, { id: 'q', owner: 'fr', x: 10, y: 8, name: 'Quebec' });
  state = withUnit(state, { id: 'guard', owner: 'fr', type: 'soldier', x: 10, y: 8 });
  state = withUnit(state, { id: 'scout', owner: 'p0', type: 'scout', x: 7, y: 5 });
  return saveGame({ options: { seed: 3 }, log: [], state });
}

for (const [label, fathers] of [['before', []], ['after', ['janDeWitt']]] as const) {
  test(`F8 opens the Foreign Affairs report (${label} de Witt)`, async ({ page }) => {
    await page.addInitScript((text) => localStorage.setItem('new-world:autosave', text), rivals([...fathers]));
    await page.goto('/');
    await page.getByRole('menuitem', { name: 'Load Game' }).click();
    await expect(field(page, 'unit')).toHaveText('Scout');
    await page.keyboard.press('F8');
    const report = page.getByRole('dialog', { name: 'Foreign Affairs' });
    await expect(report.getByRole('group', { name: 'War and peace' })).toBeVisible();
    expect(JSON.stringify(await report.evaluate(summarise), null, 2)).toMatchSnapshot(`foreign-report-${label}.json`);
    await page.keyboard.press('Escape');
    await expect(report).toHaveCount(0);
  });
}

test('F8 gives no report during the War of Independence', async ({ page }) => {
  await page.addInitScript((text) => localStorage.setItem('new-world:autosave', text), rivals(['janDeWitt'], true));
  await page.goto('/');
  await page.getByRole('menuitem', { name: 'Load Game' }).click();
  await expect(field(page, 'unit')).toHaveText('Scout');
  await page.keyboard.press('F8');
  await expect(field(page, 'status')).toContainText('makes no report');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('Shift+I declares independence after asking, and the war begins', async ({ page }) => {
  // the colony is strongly for independence; without that the adviser says no
  const rows = Array.from({ length: 12 }, (_, y) => (y === 0 || y === 11 ? '~'.repeat(16) : `~~${'.'.repeat(12)}~~`));
  const make = (sol: number): string => {
    let state: GameState = world({ rows, seed: 3, players: [{ id: 'p0', kind: 'human' }] });
    state = withColony(state, { id: 'col', owner: 'p0', x: 2, y: 5, name: 'Jamestown', sol: { n: sol * 2, d: 200 } });
    state = withUnit(state, { id: 'scout', owner: 'p0', type: 'scout', x: 7, y: 5 });
    return saveGame({ options: { seed: 3 }, log: [], state });
  };
  await page.addInitScript(([key, text]) => {
    if (!sessionStorage.getItem('seeded')) localStorage.setItem(key!, text!);
    sessionStorage.setItem('seeded', '1');
  }, ['new-world:autosave', make(40)] as const);
  await page.goto('/');
  await page.getByRole('menuitem', { name: 'Load Game' }).click();
  await expect(field(page, 'unit')).toHaveText('Scout');
  await page.keyboard.press('Shift+I');
  await expect(field(page, 'status')).toContainText('We cannot declare yet');
  await expect(field(page, 'status')).toContainText('40%');

  await page.evaluate((text) => localStorage.setItem('new-world:autosave', text), make(80));
  await page.reload();
  await page.getByRole('menuitem', { name: 'Load Game' }).click();
  await expect(field(page, 'unit')).toHaveText('Scout');
  await page.keyboard.press('Shift+I');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Declare independence');
  await page.keyboard.press('Escape'); // not yet
  await expect(field(page, 'date')).toContainText('1492');
  await page.keyboard.press('Shift+I');
  await dialog.getByRole('button', { name: 'Yes, declare independence' }).click();
  await expect(field(page, 'date')).toContainText('1493');
  await expect(page.locator('.event-log, [data-field="log"]').first()).toContainText('Independence is declared');
  // the report that is closed to rebels says so
  await page.keyboard.press('F8');
  await expect(field(page, 'status')).toContainText('makes no report');
});

/** A prepared game on the last turn before 1800, with something to score. */
function eveOf1800(): string {
  const rows = Array.from({ length: 12 }, (_, y) => (y === 0 || y === 11 ? '~'.repeat(16) : `~~${'.'.repeat(12)}~~`));
  let state: GameState = world({ rows, seed: 3, players: [{ id: 'p0', kind: 'human', fathers: ['peterMinuit', 'thomasJefferson', 'adamSmith'] }] });
  state = withColony(state, { id: 'col', owner: 'p0', x: 2, y: 5, name: 'Jamestown', sol: { n: 80, d: 200 }, goods: { food: 100 } });
  state = withUnit(state, { id: 'scout', owner: 'p0', type: 'scout', x: 7, y: 5 });
  // named as every game begun before the power could be chosen was: the Hall shows the leader
  state = { ...state, turn: 507, players: state.players.map((p) => ({ ...p, gold: 42000, name: 'Player' })) };
  return saveGame({ options: { seed: 3 }, log: [], state });
}

test('in 1800 the game is scored, entered in the Hall of Fame, and may be played on', async ({ page }) => {
  await page.addInitScript(([key, text]) => {
    if (!sessionStorage.getItem('seeded')) localStorage.setItem(key!, text!);
    sessionStorage.setItem('seeded', '1');
  }, ['new-world:autosave', eveOf1800()] as const);
  await page.goto('/');
  await page.getByRole('menuitem', { name: 'Load Game' }).click();
  await expect(field(page, 'unit')).toHaveText('Scout');

  // the adviser will show the score at any time
  await page.keyboard.press('F10');
  const score = page.getByRole('dialog', { name: 'Colonial Score' });
  await expect(score.getByRole('group', { name: 'Score', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(score).toHaveCount(0);

  await page.keyboard.press(' '); // the scout has nothing to do
  await page.keyboard.press('Enter');
  // the end page: what happened, the reckoning in short, and the ways on
  const end = page.getByRole('dialog', { name: 'Retirement: your term is over' });
  await expect(end).toContainText('The year is 1800');
  await expect(end.locator('[data-end="date"]')).toHaveText('Spring 1800');
  await expect(end.locator('[data-end="rating"]')).toHaveText(/^\d+%$/);
  await expect(end.locator('[data-end="honour"]')).toContainText('named');
  await expect(end.getByRole('button')).toHaveText(['The reckoning', 'Play on', 'New game', 'Load game', 'Look over the map']);
  await expect(end.getByRole('button', { name: 'The reckoning' })).toBeFocused();
  await expect(page.locator('canvas.map')).toHaveAttribute('data-over', 'retired');
  // the reckoning in full, and back to the page
  await page.keyboard.press('Enter');
  await expect(score.getByRole('group', { name: 'Colonial rating' })).toBeVisible();
  await expect(score.getByRole('group', { name: 'Hall of Fame' })).toContainText('Walter Raleigh of England');
  expect(JSON.stringify(await score.evaluate(summarise), null, 2)).toMatchSnapshot('score-1800.json');
  const total = await score.getByRole('row', { name: /^Total/ }).getByRole('cell').last().textContent();
  await page.keyboard.press('Escape');
  await expect(score).toHaveCount(0);
  await expect(end.getByRole('button', { name: 'The reckoning' })).toBeFocused();
  await expect(end.locator('[data-end="score"]')).toHaveText(total!);

  // stop, or play on unscored
  await expect(end).toContainText('will not be scored again');
  await page.keyboard.press('ArrowDown');
  await expect(end.getByRole('button', { name: 'Play on' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(end).toHaveCount(0);
  await expect(page.locator('canvas.map')).toHaveAttribute('data-over', '');
  await expect(field(page, 'date')).toHaveText('Spring 1800');
  await page.keyboard.press(' ');
  await page.keyboard.press('Enter');
  await expect(field(page, 'date')).toHaveText('Autumn 1800');
  await expect(page.locator('canvas.map')).toHaveAttribute('data-over', ''); // the calendar does not stop it again

  // and the title screen remembers
  await page.reload();
  await page.getByRole('menuitem', { name: 'View Hall of Fame' }).click();
  const hall = page.getByRole('dialog', { name: 'Hall of Fame' });
  await expect(hall).toContainText('Walter Raleigh of England');
  await expect(hall).toContainText('Spring 1800');
});

/** Load the game on the eve of 1800 and retire from it: the end page of an early retirement is up. */
async function retire(page: Page): Promise<Locator> {
  await page.addInitScript(([key, text]) => {
    if (!sessionStorage.getItem('seeded')) localStorage.setItem(key!, text!);
    sessionStorage.setItem('seeded', '1');
  }, ['new-world:autosave', eveOf1800()] as const);
  await page.goto('/');
  await page.getByRole('menuitem', { name: 'Load Game' }).click();
  await expect(field(page, 'unit')).toHaveText('Scout');
  await page.keyboard.press('Shift+R');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Retire as Viceroy');
  await dialog.getByRole('button', { name: 'Yes, retire' }).click();
  const end = page.getByRole('dialog', { name: 'Retirement: you lay down your office' });
  await expect(end).toBeVisible();
  return end;
}

test('Shift+R retires after asking, and the game is over for good', async ({ page }) => {
  const end = await retire(page);
  await expect(end).toContainText('laid down');
  await expect(end).toHaveAttribute('aria-modal', 'true');
  await expect(page.locator('canvas.map')).toHaveAttribute('data-over', 'retiredEarly');
  // no offer to play on
  await expect(end.getByRole('button')).toHaveText(['The reckoning', 'New game', 'Load game', 'Look over the map']);
  // Tab goes round the choices and never to the map or the bar under the page
  await page.keyboard.press('Shift+Tab');
  await expect(end.getByRole('button', { name: 'Look over the map' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(end.getByRole('button', { name: 'The reckoning' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(end.getByRole('button', { name: 'New game' })).toBeFocused();
  await end.getByRole('button', { name: 'The reckoning' }).click();
  await expect(page.getByRole('dialog', { name: 'Colonial Score' }).getByRole('group', { name: 'Hall of Fame' })).toContainText('Walter Raleigh of England');
  await page.keyboard.press('Escape');
  await expect(end).toBeVisible();
  // Load game: the load dialog, and the page again when nothing is loaded
  await end.getByRole('button', { name: 'Load game' }).click();
  const loader = page.getByRole('dialog', { name: 'Load Game' });
  await expect(loader.getByRole('button', { name: /^Save / })).toHaveCount(0); // a finished game is not saved again
  await page.keyboard.press('Escape');
  await expect(loader).toHaveCount(0);
  await expect(end.getByRole('button', { name: 'Load game' })).toBeFocused();

  // the page fits the window, wide and narrow: nothing runs off it and nothing scrolls
  for (const size of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(size);
    await settled(page);
    const fit = await end.evaluate((el) => {
      const box = el.getBoundingClientRect();
      const inside = [...el.querySelectorAll('*')].every((child) => {
        const b = child.getBoundingClientRect();
        return b.left >= box.left - 0.5 && b.right <= box.right + 0.5 && b.top >= box.top - 0.5 && b.bottom <= box.bottom + 0.5;
      });
      const doc = document.documentElement;
      return { inside, pageScrolls: el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth, windowScrolls: doc.scrollHeight > window.innerHeight || doc.scrollWidth > window.innerWidth, fills: box.width === window.innerWidth && box.height === window.innerHeight };
    });
    expect(fit, `${size.width} x ${size.height}`).toEqual({ inside: true, pageScrolls: false, windowScrolls: false, fills: true });
  }
});

test('from the end page, New game reaches the title screen and a new game can be begun', async ({ page }) => {
  const end = await retire(page);
  await end.getByRole('button', { name: 'New game' }).click();
  await expect(page.locator('canvas.map')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'New World', level: 1 })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Load Game' })).toBeEnabled();
  // the finished game is still where it was saved
  const kept = await page.evaluate(() => (JSON.parse(localStorage.getItem('new-world:autosave') ?? 'null') as { state: { over: { reason: string } | null } } | null)?.state.over?.reason);
  expect(kept).toBe('retiredEarly');
  // the title's choices work: the Hall of Fame, then a game begun afresh
  await page.getByRole('menuitem', { name: 'View Hall of Fame' }).click();
  await expect(page.getByRole('dialog', { name: 'Hall of Fame' })).toContainText('Walter Raleigh of England');
  await page.keyboard.press('Escape');
  await startNewGame(page);
  await expect(field(page, 'date')).toHaveText('1492');
  await expect(field(page, 'unit')).toHaveText('Caravel');
  await expect(page.locator('canvas.map')).toHaveAttribute('data-over', '');
  await expect(page.locator('canvas.map')).toHaveCount(1);
  // and it is played: the ship sails
  const from = await field(page, 'location').textContent();
  await page.keyboard.press('ArrowLeft');
  await expect(field(page, 'location')).not.toHaveText(from!);
});

test('Look over the map closes the end page; The end, Enter and Esc bring it back, and no order is taken', async ({ page }) => {
  const end = await retire(page);
  await end.getByRole('button', { name: 'Look over the map' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('canvas.map')).toBeFocused();
  await expect(page.locator('canvas.map')).toHaveAttribute('data-over', 'retiredEarly');
  await expect(field(page, 'status')).toContainText('The game has ended');
  await expect(field(page, 'unit')).toHaveText('No active unit');

  // the bar: no orders, no turn to end, and The end where End turn was
  const bar = page.getByRole('toolbar', { name: 'Commands' });
  for (const name of ['Wait', 'Fortify', 'Go to', 'Build', 'Disband', 'Europe']) await expect(bar.getByRole('button', { name, exact: true })).toBeDisabled();
  await expect(bar.getByRole('button', { name: 'End turn' })).toHaveCount(0);
  await expect(bar.getByRole('button', { name: 'The end' })).toBeEnabled();

  // keys that would give an order do nothing, and nothing is said of them
  const logged = (): Promise<number> => page.evaluate(() => (JSON.parse(localStorage.getItem('new-world:autosave') ?? 'null') as { log: unknown[] } | null)?.log.length ?? -1);
  const before = await logged();
  for (const key of ['f', 's', 'w', ' ', 'b', 'e', 'Shift+D', 'Shift+R', 'Shift+I', 'Alt+T']) await page.keyboard.press(key);
  await settled(page);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(field(page, 'status')).toHaveText('The game has ended. Press Enter for the end page.');
  expect(await logged()).toBe(before);

  // looking goes on: the zoom zooms, the reports report, the load menu opens (the arrows scroll: saves.spec.ts, on a map wider than the window)
  const tileSize = async (): Promise<number> => (JSON.parse((await page.locator('canvas.map').getAttribute('data-view'))!) as { tileSize: number }).tileSize;
  const near = await tileSize();
  await page.keyboard.press('x');
  await settled(page);
  expect(await tileSize()).toBeLessThan(near);
  await page.keyboard.press('F10');
  await expect(page.getByRole('dialog', { name: 'Colonial Score' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Alt+L');
  await expect(page.getByRole('dialog', { name: 'Load Game' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // three ways back to the page
  await bar.getByRole('button', { name: 'The end' }).click();
  await expect(end).toBeVisible();
  await expect(end.getByRole('button', { name: 'The reckoning' })).toBeFocused();
  await page.keyboard.press('Escape'); // Esc on the page looks over the map
  await expect(end).toHaveCount(0);
  await page.keyboard.press('Enter');
  await expect(end).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(end).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(end).toBeVisible();
  // the game went into the Hall of Fame once
  expect(await page.evaluate(() => (JSON.parse(localStorage.getItem('new-world:hall-of-fame') ?? '[]') as unknown[]).length)).toBe(1);
});

/** A prepared game with something for every adviser to say. */
function busy(): string {
  const rows = Array.from({ length: 14 }, (_, y) => (y === 0 || y === 13 ? '~'.repeat(20) : `~~${'.'.repeat(16)}~~`));
  let state: GameState = world({ rows, seed: 5, players: [{ id: 'p0', kind: 'human', fathers: ['peterMinuit'] }, { id: 'fr', kind: 'ai', nation: 'france' }] });
  state = withColony(state, { id: 'james', owner: 'p0', x: 2, y: 5, name: 'Jamestown', goods: { food: 80, furs: 120, tools: 30 }, construction: { kind: 'building', id: 'stockade' }, sol: { n: 60, d: 200 } });
  state = withColony(state, { id: 'ply', owner: 'p0', x: 15, y: 9, name: 'Plymouth', goods: { lumber: 45 } });
  state = withUnit(state, { id: 'scout', owner: 'p0', type: 'scout', x: 7, y: 5 });
  state = withUnit(state, { id: 'ship', owner: 'p0', type: 'merchantman', profession: null, x: 1, y: 5, cargo: { furs: 100 }, orders: 'sentry' });
  const village = { id: 'v1', tribe: 'sioux' as const, x: 10, y: 4, capital: true, population: 5, growth: 0, taught: false, tributePaid: false, alarm: {}, mission: { owner: 'p0', expert: false }, scouted: [], lastBought: null, lastSold: null, haggleMemory: null };
  state = { ...state, settlements: { v1: village }, players: state.players.map((p) => (p.id === 'p0' ? { ...p, gold: 2500, crosses: 9, taxRate: 12 } : p)) };
  return saveGame({ options: { seed: 5 }, log: [], state });
}

test('every adviser reports (F1 to F10) without an error, and a row takes the map to its place', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript((text) => localStorage.setItem('new-world:autosave', text), busy());
  await page.goto('/');
  await page.getByRole('menuitem', { name: 'Load Game' }).click();
  await expect(field(page, 'unit')).toHaveText('Scout');

  const titles = ['Terrain Information', 'Religious Adviser', 'Continental Congress', 'Labor Adviser', 'Economic Adviser', 'Colony Adviser', 'Naval Adviser', 'Foreign Affairs', 'Indian Adviser', 'Colonial Score'];
  const all: Record<string, unknown> = {};
  for (const [i, title] of titles.entries()) {
    await page.keyboard.press(`F${i + 1}`);
    const report = page.getByRole('dialog', { name: title });
    await expect(report).toBeVisible();
    all[title] = await report.evaluate(summarise);
    await page.keyboard.press('Escape');
    await expect(report).toHaveCount(0);
  }
  expect(JSON.stringify(all, null, 2)).toMatchSnapshot('advisers.json');

  // the Colony Adviser's row for Plymouth shows Plymouth
  await page.keyboard.press('F6');
  await page.getByRole('dialog', { name: 'Colony Adviser' }).getByRole('group', { name: 'Colonies (2)' }).getByRole('row', { name: /Plymouth/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const view = JSON.parse((await page.locator('canvas.map').getAttribute('data-view'))!) as { originX: number; originY: number; tileSize: number; width: number; height: number };
  const shown = (x: number, y: number): boolean => x >= view.originX && y >= view.originY && x < view.originX + view.width / view.tileSize && y < view.originY + view.height / view.tileSize;
  expect(shown(15, 9)).toBe(true);
  expect(errors).toEqual([]);
});
