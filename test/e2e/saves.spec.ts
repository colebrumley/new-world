import { expect, test, type Page } from '@playwright/test';
import { field, settled } from './helpers';

async function start(page: Page): Promise<void> {
  await page.goto('/?seed=11');
  await page.getByRole('menuitem', { name: 'Start a Game in New World' }).click();
  await expect(field(page, 'unit')).toHaveText('Caravel');
}
const stored = (page: Page, key: string): Promise<{ state: unknown; log: unknown[] } | null> =>
  page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null') as { state: unknown; log: unknown[] } | null, key);

test('save in a slot, play on, reload the page, load the slot: the game is exactly as it was saved', async ({ page }) => {
  await start(page);
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await settled(page);
  const where = (await field(page, 'location').textContent())!;

  await page.keyboard.press('Alt+L');
  const dialog = page.getByRole('dialog', { name: 'Save or Load Game' });
  await expect(dialog.getByRole('row')).toHaveCount(10);
  await expect(dialog.getByRole('row', { name: /Slot 1/ })).toContainText('Empty');
  await expect(dialog.getByRole('row', { name: /Autosave \(last turn\)/ })).toContainText('Walter Raleigh of England, 1492');
  // the autosave slots are the game's to write
  await expect(dialog.getByRole('button', { name: 'Save Autosave (last turn)' })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Save Autosave (decade)' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Save Slot 1' }).click();
  await expect(dialog.locator('.save-notice')).toHaveText('Saved in slot 1.');
  await expect(dialog.getByRole('row', { name: /Slot 1/ })).toContainText('Walter Raleigh of England, 1492, Conquistador, 0 colonies');
  await page.keyboard.press('Escape');
  const saved = (await stored(page, 'new-world:slot:0'))!;
  expect(saved.log).toHaveLength(2);

  // play on: the game moves away from what was saved
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('f');
  await page.keyboard.press('Enter');
  await expect(field(page, 'date')).toHaveText('1493');
  expect((await stored(page, 'new-world:autosave'))!.state).not.toEqual(saved.state);

  await page.reload();
  await page.getByRole('menuitem', { name: 'Load Game' }).click();
  const loader = page.getByRole('dialog', { name: 'Load Game' });
  await expect(loader.getByRole('button', { name: /^Save / })).toHaveCount(0); // nothing to save from the title screen
  await loader.getByRole('button', { name: 'Load Slot 1' }).click();
  await expect(field(page, 'date')).toHaveText('1492');
  await expect(field(page, 'location')).toHaveText(where);
  const resumed = (await stored(page, 'new-world:autosave'))!;
  expect(resumed.state).toEqual(saved.state);
  expect(resumed.log).toEqual(saved.log);
});

test('a game goes out to a .json file and comes back in; a file that is not a save is refused politely', async ({ page }) => {
  await start(page);
  await page.keyboard.press('ArrowLeft');
  const before = (await stored(page, 'new-world:autosave'))!;
  await page.keyboard.press('Alt+L');
  const dialog = page.getByRole('dialog', { name: 'Save or Load Game' });
  const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Export to a file' }).click()]);
  expect(download.suggestedFilename()).toBe('new-world-england-1492.json');
  const path = await download.path();
  await expect(dialog.locator('.save-notice')).toHaveText('Exported as new-world-england-1492.json.');

  // not a save
  await dialog.locator('input[type="file"]').setInputFiles({ name: 'notes.json', mimeType: 'application/json', buffer: Buffer.from('{"shopping":["eggs"]}') });
  await expect(dialog.locator('.save-notice')).toHaveText('That is not a New World saved game.');
  // a save whose map has lost some squares
  const damaged = JSON.parse(JSON.stringify(before)) as { state: { map: { tiles: unknown[] } } };
  damaged.state.map.tiles.pop();
  await dialog.locator('input[type="file"]').setInputFiles({ name: 'damaged.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(damaged)) });
  await expect(dialog.locator('.save-notice')).toContainText('map is not the size');
  await page.keyboard.press('Escape');

  // move on, then bring the exported game back
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  expect((await stored(page, 'new-world:autosave'))!.state).not.toEqual(before.state);
  await page.keyboard.press('Alt+L');
  await dialog.locator('input[type="file"]').setInputFiles(path);
  await expect(dialog).toHaveCount(0);
  await expect.poll(async () => (await stored(page, 'new-world:autosave'))!.state).toEqual(before.state);
  await expect(field(page, 'unit')).toHaveText('Caravel');
});

test('a copy is put by as each decade opens', async ({ page }) => {
  await start(page);
  await page.keyboard.press('f');
  for (let year = 1492; year < 1500; year++) await page.keyboard.press('Enter');
  await expect(field(page, 'date')).toHaveText('1500');
  await page.keyboard.press('Enter'); // 1501: the copy from 1500 stays
  await page.keyboard.press('Alt+L');
  const dialog = page.getByRole('dialog', { name: 'Save or Load Game' });
  await expect(dialog.getByRole('row', { name: /Autosave \(decade\)/ })).toContainText('1500');
  await expect(dialog.getByRole('row', { name: /Autosave \(last turn\)/ })).toContainText('1501');
  await dialog.getByRole('button', { name: 'Load Autosave (decade)' }).click();
  await expect(field(page, 'date')).toHaveText('1500');
});
