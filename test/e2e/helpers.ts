import { expect, type Locator, type Page } from '@playwright/test';

export const field = (page: Page, name: string): Locator => page.locator(`[data-field="${name}"]`);

/** The sidebar is redrawn on the next animation frame; wait for two so that what we read is current. */
export const settled = (page: Page): Promise<void> =>
  page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

/**
 * Start the America scenario with a fixed seed, sail the caravel to the coast, land the veteran
 * soldier and found Jamestown with him. Ends with the colony screen open (it opens on founding).
 * Returns the grid coordinates of the colony and of the ship lying off it.
 */
export async function foundJamestown(page: Page): Promise<{ colony: string; ship: string }> {
  await page.goto('/?seed=7');
  await page.getByRole('menuitem', { name: 'Start a Game in America' }).click();
  await expect(field(page, 'unit')).toHaveText('Caravel');
  await expect(field(page, 'location')).toHaveText('(35, 21)');

  // Sail west until the shore is dead ahead; the next step west offers landfall.
  const dialog = page.getByRole('dialog');
  // (each key is followed by a redraw before we look again, so the number of turns taken never varies)
  for (let step = 0; step < 12 && !(await dialog.isVisible()); step++) {
    if ((await field(page, 'unit').textContent()) === 'No active unit') {
      await page.keyboard.press('Enter');
      await settled(page);
    }
    await page.keyboard.press('ArrowLeft');
    await settled(page);
  }
  await expect(dialog).toContainText('ashore');
  await dialog.getByRole('button', { name: 'Make landfall' }).click();
  await expect(field(page, 'unit')).toHaveText('Soldier');
  const ship = (await field(page, 'location').textContent())!;
  const [shipX, shipY] = ship.match(/\d+/g)!.map(Number) as [number, number];
  const colony = `(${shipX - 1}, ${shipY})`;
  await page.keyboard.press('ArrowLeft');
  // Going ashore ends the soldier's turn, so the other passenger comes up next.
  await expect(field(page, 'unit')).toHaveText('Pioneer');

  // Next turn: bring the soldier up again and build where he stands.
  await page.keyboard.press('Enter');
  await settled(page);
  for (let i = 0; i < 4 && (await field(page, 'location').textContent()) !== colony; i++) {
    await page.keyboard.press('w');
    await settled(page);
  }
  await expect(field(page, 'unit')).toHaveText('Soldier');
  await expect(field(page, 'location')).toHaveText(colony);
  await page.keyboard.press('b');
  // site warnings, if any, then the name
  const build = dialog.getByRole('button', { name: 'Build the colony' });
  const name = dialog.getByRole('textbox');
  for (let i = 0; i < 3; i++) {
    await expect(build.or(name)).toBeVisible();
    if (await name.isVisible()) break;
    await build.click();
  }
  await expect(name).toHaveValue('Jamestown');
  await name.press('Enter');
  await expect(page.locator('.colony-screen')).toBeVisible();
  return { colony, ship };
}
