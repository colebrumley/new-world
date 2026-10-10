import { expect, test, type Page } from '@playwright/test';
import { field, startNewGame } from './helpers';

async function start(page: Page): Promise<void> {
  await page.goto('/?seed=11');
  await startNewGame(page);
  await expect(field(page, 'unit')).toHaveText('Caravel');
}

test('game options and colony report options are remembered across a reload', async ({ page }) => {
  await start(page);
  await page.keyboard.press('Alt+G');
  const game = page.getByRole('dialog', { name: 'Game Options' });
  await expect(game.getByRole('checkbox')).toHaveCount(9);
  await expect(game.getByLabel('Terrain tooltips')).toBeChecked();
  await expect(game.getByLabel('Combat analysis')).toBeChecked();
  await expect(game.getByLabel('Fast piece slide')).not.toBeChecked();
  await game.getByLabel('Combat analysis').uncheck();
  await game.getByLabel('Fast piece slide').check();
  await game.getByLabel('Tutorial hints').uncheck();
  await page.keyboard.press('Escape');
  await expect(game).toHaveCount(0);

  await page.keyboard.press('Alt+O');
  const colony = page.getByRole('dialog', { name: 'Colony Report Options' });
  await expect(colony.getByRole('checkbox')).toHaveCount(10);
  await colony.getByLabel('Labels on buildings').uncheck();
  await colony.getByLabel('Report food shortages').uncheck();
  await colony.getByRole('button', { name: 'Done (Esc)' }).click();
  await expect(page.locator('.game')).toHaveAttribute('data-building-labels', 'off');

  await page.reload();
  await page.getByRole('menuitem', { name: 'Load Game' }).click();
  await expect(field(page, 'unit')).toHaveText('Caravel');
  await expect(page.locator('.game')).toHaveAttribute('data-building-labels', 'off');
  await page.keyboard.press('Alt+G');
  await expect(game.getByLabel('Combat analysis')).not.toBeChecked();
  await expect(game.getByLabel('Fast piece slide')).toBeChecked();
  await expect(game.getByLabel('Tutorial hints')).not.toBeChecked();
  await expect(game.getByLabel('Autosave')).toBeChecked();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Alt+O');
  await expect(colony.getByLabel('Labels on buildings')).not.toBeChecked();
  await expect(colony.getByLabel('Report food shortages')).not.toBeChecked();
  await expect(colony.getByLabel('Report rebel majorities')).toBeChecked();
});

test('tutorial hints go to the log, once, and stop when switched off', async ({ page }) => {
  await start(page);
  const log = page.locator('[data-field="log"]');
  await expect(log).toContainText('Adviser: Our Caravel is on the open sea');
  await expect(log.locator('li')).toHaveCount(1);
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect(log.locator('li')).toHaveCount(1); // the same moment is not explained twice

  await page.keyboard.press('Alt+G');
  await page.getByRole('dialog', { name: 'Game Options' }).getByLabel('Tutorial hints').uncheck();
  await page.keyboard.press('Escape');
  await page.reload();
  await page.goto('/?seed=12');
  await startNewGame(page);
  await expect(field(page, 'unit')).toHaveText('Caravel');
  await expect(log.locator('li')).toHaveCount(0);
});

test('with End of turn off the turn ends by itself after the last unit; with Autosave off nothing is kept', async ({ page }) => {
  await start(page);
  await page.keyboard.press('Alt+G');
  const game = page.getByRole('dialog', { name: 'Game Options' });
  await game.getByLabel('End of turn').uncheck();
  await game.getByLabel('Autosave').uncheck();
  await page.keyboard.press('Escape');
  await expect(field(page, 'date')).toHaveText('1492');
  await page.keyboard.press('f'); // the caravel fortifies: nobody else needs orders
  await expect(field(page, 'date')).toHaveText('1493');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('new-world:autosave') ?? '{"state":{"turn":-1}}').state.turn as number);
  expect(saved).toBe(0); // the autosave still holds the game as it was before the option was switched off
});

test('the event log keeps everything and scrolls', async ({ page }) => {
  await start(page);
  const log = page.locator('[data-field="log"]');
  for (let i = 0; i < 12; i++) await page.keyboard.press('Enter');
  const style = await log.evaluate((el) => {
    const s = getComputedStyle(el);
    return { overflow: s.overflowY, max: s.maxHeight };
  });
  expect(style.overflow).toBe('auto');
  expect(style.max).not.toBe('none');
});

test('the encyclopedia has a page for every entry, and a right-click opens the page of what is under the pointer', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await start(page);
  await page.keyboard.press('Alt+P');
  const pedia = page.getByRole('dialog', { name: 'Encyclopedia' });
  await expect(pedia).toBeVisible();
  for (const group of ['Cargo', 'Units', 'Terrain', 'Skills', 'Buildings', 'Founding Fathers', 'Concepts']) await expect(pedia.getByRole('group', { name: group, exact: true })).toBeVisible();
  // every entry in the index opens a page that carries its name and something to read
  const visited = await pedia.evaluate((root) => {
    const out: { entry: string; ok: boolean }[] = [];
    for (const button of root.querySelectorAll<HTMLButtonElement>('.pedia-index button')) {
      button.click();
      const title = root.querySelector('.pedia-page h3')?.textContent ?? '';
      const prose = [...root.querySelectorAll('.pedia-page p')].map((p) => p.textContent ?? '').join(' ');
      out.push({ entry: button.dataset['entry'] ?? '', ok: title === button.textContent && prose.length > 20 && root.dataset['entry'] === button.dataset['entry'] });
    }
    return out;
  });
  expect(visited.length).toBeGreaterThan(120);
  expect(visited.filter((v) => !v.ok)).toEqual([]);
  expect(new Set(visited.map((v) => v.entry)).size).toBe(visited.length);
  await pedia.getByRole('button', { name: 'Liberty Bells' }).last().click();
  await expect(pedia.locator('.pedia-page')).toContainText('Sons of Liberty');
  await page.keyboard.press('Escape');
  await expect(pedia).toHaveCount(0);

  // right-click the ship in the middle of the view: its page
  const canvas = page.locator('canvas.map');
  const box = (await canvas.boundingBox())!;
  const view = JSON.parse((await canvas.getAttribute('data-view'))!) as { originX: number; originY: number; tileSize: number };
  const [x, y] = (await field(page, 'location').textContent())!.match(/\d+/g)!.map(Number) as [number, number];
  const at = (tx: number, ty: number): { x: number; y: number } => ({ x: box.x + (tx - view.originX + 0.5) * view.tileSize, y: box.y + (ty - view.originY + 0.5) * view.tileSize });
  await page.mouse.click(at(x, y).x, at(x, y).y, { button: 'right' });
  await expect(pedia).toHaveAttribute('data-entry', 'units:caravel');
  await expect(pedia.locator('.pedia-page h3')).toHaveText('Caravel');
  await page.keyboard.press('Escape');
  // the sea beside her: the terrain
  await page.mouse.click(at(x - 1, y).x, at(x - 1, y).y, { button: 'right' });
  await expect(pedia).toHaveAttribute('data-entry', /^terrain:(ocean|seaLane)$/);
  await page.keyboard.press('Escape');
  // the unexplored vellum says nothing
  await page.mouse.click(at(x - 6, y).x, at(x - 6, y).y, { button: 'right' });
  await expect(pedia).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('sound options are remembered, and events ask for their cues', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await start(page);
  await page.keyboard.press('Alt+S');
  const sound = page.getByRole('dialog', { name: 'Sound Options' });
  await expect(sound.getByRole('checkbox')).toHaveCount(3);
  await expect(sound.getByLabel('Background music')).not.toBeChecked();
  await expect(sound.getByLabel('Sound effects')).toBeChecked();
  await sound.getByLabel('Background music').check();
  await sound.getByLabel('Event music').uncheck();
  await page.keyboard.press('Escape');

  // a move asks for the footfall; ending the turn for the new-turn figure
  const canvas = page.locator('canvas.map');
  await page.keyboard.press('ArrowLeft');
  await expect(canvas).toHaveAttribute('data-cues', /move$/);
  await page.keyboard.press('f');
  await page.keyboard.press('Enter');
  await expect(canvas).toHaveAttribute('data-cues', /newTurn/);

  await page.reload();
  await page.getByRole('menuitem', { name: 'Load Game' }).click();
  await page.keyboard.press('Alt+S');
  await expect(sound.getByLabel('Background music')).toBeChecked();
  await expect(sound.getByLabel('Event music')).not.toBeChecked();
  await sound.getByLabel('Sound effects').uncheck();
  await sound.getByLabel('Background music').uncheck();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Enter'); // another turn goes by
  await expect(field(page, 'date')).toHaveText('1494');
  await expect(canvas).toHaveAttribute('data-cues', /^$/); // silenced: nothing is asked for
  expect(errors).toEqual([]);
});

test('the level is chosen on the title screen and the game starts at it', async ({ page }) => {
  await page.goto('/?seed=11');
  const level = page.getByLabel('Difficulty');
  await expect(level).toHaveValue('conquistador');
  await expect(page.locator('.title-difficulty-note')).toContainText('Conquistador: 0 gold');
  await level.selectOption('discoverer');
  await expect(page.locator('.title-difficulty-note')).toContainText('Discoverer: 1000 gold');
  await startNewGame(page);
  await expect(field(page, 'unit')).toHaveText('Caravel');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('new-world:autosave')!).state as { difficulty: string; players: { gold: number; ref: { regulars: number } }[] });
  expect(saved.difficulty).toBe('discoverer');
  expect(saved.players[0]?.gold).toBe(1000);
  expect(saved.players[0]?.ref.regulars).toBe(15);
});

test('?difficulty= preselects the level', async ({ page }) => {
  await page.goto('/?seed=11&difficulty=viceroy');
  await expect(page.getByLabel('Difficulty')).toHaveValue('viceroy');
});
