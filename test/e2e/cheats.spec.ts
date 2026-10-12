import { expect, test, type Page } from '@playwright/test';
import { field, startNewGame } from './helpers';

const gold = async (page: Page): Promise<number> => Number((await field(page, 'treasury').textContent())!.replace(/\D/g, ''));

/** Squares of bare vellum on the New World view, counted as `map.spec.ts` counts them. */
const vellum = (page: Page): Promise<number> =>
  page.locator('canvas.minimap').evaluate((el) => {
    const c = el as HTMLCanvasElement;
    const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] === 0xe9 && data[i + 1] === 0xdf && data[i + 2] === 0xc4) n++;
    return n;
  });

test('the cheat console: Alt+C opens it, a line is done at once and logged, a bad one is refused, and the autosave carries it', async ({ page }) => {
  await page.goto('/?seed=11&still');
  await startNewGame(page, 'america');
  await expect(field(page, 'unit')).toHaveText('Caravel');
  const before = await gold(page);
  expect(await vellum(page)).toBeGreaterThan(1000);

  await page.keyboard.press('Alt+C');
  const cheats = page.getByRole('dialog', { name: 'Cheats' });
  await expect(cheats.getByRole('heading', { name: 'Cheats' })).toBeVisible();
  const line = cheats.getByLabel('Command');
  await expect(line).toBeFocused();
  const transcript = cheats.getByRole('log');
  await expect(transcript.getByRole('listitem')).toHaveCount(0);
  const hint = cheats.getByRole('status');

  // the help sheet: a row for every cheat, folded away until it is asked for
  const sheet = cheats.locator('details');
  await expect(sheet.locator('summary')).toHaveText('Commands');
  await expect(sheet.getByRole('row', { name: /gold \[amount\]/ })).toBeHidden();
  await sheet.locator('summary').click();
  await expect(sheet.getByRole('row', { name: /gold \[amount\]/ })).toContainText('gold 5000');
  await sheet.locator('summary').click();

  // gold: the treasury beside the map rises while the console stays open
  await line.fill('gold 5000');
  await line.press('Enter');
  await expect(transcript.getByRole('listitem')).toHaveText(['gold 5000 Added 5000 gold to the treasury.']);
  await expect(line).toHaveValue('');
  await expect(line).toBeFocused();
  await expect(field(page, 'treasury')).toHaveText(`${before + 5000} gold`);
  await expect(field(page, 'log').getByRole('listitem').last()).toHaveText('Cheat: Added 5000 gold to the treasury.');

  // reveal: no vellum is left on the New World view
  await line.fill('reveal');
  await line.press('Enter');
  await expect(transcript.getByRole('listitem')).toHaveCount(2);
  await expect(transcript.getByRole('listitem').last()).toContainText('Revealed the whole map.');
  await expect.poll(() => vellum(page)).toBe(0);

  // a line that is no cheat is refused, and stays to be mended
  await line.fill('nonsense');
  await line.press('Enter');
  await expect(hint).toContainText('there is no cheat "nonsense"');
  await expect(line).toHaveValue('nonsense');
  // so does one the engine will not have
  await line.fill('gold -999999');
  await line.press('Enter');
  await expect(hint).toHaveClass(/refused/);
  await expect(line).toHaveValue('gold -999999');
  await expect(transcript.getByRole('listitem')).toHaveCount(2);

  // Tab finishes a word when one fits, and lists them when several do
  await line.fill('reve');
  await line.press('Tab');
  await expect(line).toHaveValue('reveal ');
  await expect(line).toBeFocused();
  await line.fill('');
  await line.pressSequentially('father ');
  await line.press('Tab');
  await expect(hint).toContainText('adamSmith');
  await expect(hint).toContainText('thomasJefferson');
  await expect(line).toHaveValue('father ');
  await line.pressSequentially('adam');
  await line.press('Tab');
  await expect(line).toHaveValue('father adamSmith ');
  // Up and Down walk the lines accepted this visit
  await line.fill('');
  await line.press('ArrowUp');
  await expect(line).toHaveValue('reveal');
  await line.press('ArrowUp');
  await expect(line).toHaveValue('gold 5000');
  await line.press('ArrowDown');
  await line.press('ArrowDown');
  await expect(line).toHaveValue('');

  await line.press('Escape');
  await expect(cheats).toBeHidden();
  await expect(page.locator('canvas.map')).toBeFocused();

  // the autosave carried the cheat
  await page.reload();
  await page.getByRole('menuitem', { name: 'Load Game' }).click();
  await expect(field(page, 'unit')).toHaveText('Caravel');
  await expect(field(page, 'treasury')).toHaveText(`${before + 5000} gold`);
  await expect.poll(() => vellum(page)).toBe(0);
});

test('the Menus picker lists Cheats, and Done closes the console', async ({ page }) => {
  await page.goto('/?seed=11&still');
  await startNewGame(page, 'america');
  await page.getByRole('button', { name: 'Menu…' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cheats' }).click();
  const cheats = page.getByRole('dialog', { name: 'Cheats' });
  await expect(cheats.getByLabel('Command')).toBeFocused();
  // the keys typed here are not orders on the map
  await cheats.getByLabel('Command').pressSequentially('v');
  await expect(page.locator('canvas.map')).toHaveAttribute('data-mode', 'move');
  // and Tab goes round within the console, either way: the map never gets the keyboard while it is up
  await cheats.getByLabel('Command').fill('');
  for (const [key, stop] of [['Tab', 'button'], ['Tab', 'summary'], ['Tab', 'input'], ['Shift+Tab', 'summary'], ['Shift+Tab', 'button'], ['Shift+Tab', 'input']] as const) {
    await page.keyboard.press(key);
    expect(await page.evaluate(() => document.activeElement?.tagName.toLowerCase())).toBe(stop);
  }

  // bells enough to convene the Congress: its question is put at once, over the console, and the console takes the keys back after
  const line = cheats.getByLabel('Command');
  await line.fill('bells 1');
  await line.press('Enter');
  const congress = page.getByRole('dialog').filter({ hasText: 'Which Founding Father' });
  await expect(congress).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(congress).toBeHidden();
  await expect(line).toBeFocused();
  await expect(cheats.getByRole('log').getByRole('listitem')).toHaveText(['bells 1 Added 1 liberty bells.']);

  await cheats.getByRole('button', { name: 'Done (Esc)' }).click();
  await expect(cheats).toBeHidden();
  await expect(page.locator('canvas.map')).toBeFocused();
});
