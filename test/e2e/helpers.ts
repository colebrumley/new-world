import { expect, type Locator, type Page } from '@playwright/test';

export const field = (page: Page, name: string): Locator => page.locator(`[data-field="${name}"]`);

export type StartChoice = 'newWorld' | 'america' | 'customize';
const START_LABELS: Readonly<Record<StartChoice, string>> = { newWorld: 'Start a Game in New World', america: 'Start a Game in America', customize: 'Customize New World' };
export type NationId = 'england' | 'france' | 'spain' | 'netherlands';

/**
 * From the "Choose a European Power" screen: pick the power and name asked for (England and the
 * leader's name as it stands otherwise), Set Sail, dismiss the audience with the Crown, and wait
 * for the map.
 */
export async function setSail(page: Page, { nation, name }: { nation?: NationId; name?: string } = {}): Promise<void> {
  const screen = page.locator('.power');
  await expect(screen.getByRole('radiogroup')).toBeVisible();
  if (nation) await screen.locator(`.power-row[data-nation="${nation}"]`).click();
  if (name !== undefined) await screen.getByLabel('Your name').fill(name);
  await screen.getByRole('button', { name: 'Set Sail' }).click();
  const audience = page.getByRole('dialog').filter({ hasText: 'An audience with' });
  await audience.getByRole('button', { name: 'So be it' }).click();
  await expect(page.locator('canvas.map')).toHaveAttribute('data-frames', /\d+/);
}

/**
 * Start a new game from the title screen: click the choice (Customize's Start with its defaults,
 * for `customize`), pass the power screen and the audience, and wait for the map.
 */
export async function startNewGame(page: Page, choice: StartChoice = 'newWorld', options: { nation?: NationId; name?: string } = {}): Promise<void> {
  await page.getByRole('menuitem', { name: START_LABELS[choice] }).click();
  if (choice === 'customize') await page.getByRole('button', { name: 'Start' }).click();
  await setSail(page, options);
}

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
  await startNewGame(page, 'america');
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
