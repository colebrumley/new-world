import { expect, test, type Locator } from '@playwright/test';
import { FATHERS, type FatherId } from '../../src/engine/data/fathers';
import { saveGame } from '../../src/engine/save';
import type { GameState } from '../../src/engine/state';
import { withColony, world } from '../helpers/world';
import { field } from './helpers';

/** A prepared game with one colony, most of it for independence, and no Congress yet: the first bells rung will convene one. */
function business(): string {
  const rows = Array.from({ length: 12 }, (_, y) => (y === 0 || y === 11 ? '~'.repeat(16) : `~${'.'.repeat(14)}~`));
  let state: GameState = world({ rows, seed: 3, players: [{ id: 'p0', kind: 'human', taxRate: 12 }] });
  state = withColony(state, { id: 'col', owner: 'p0', x: 5, y: 5, name: 'Jamestown', sol: { n: 3, d: 4 } });
  return saveGame({ options: { seed: 3 }, log: [], state });
}

/** What a portrait's canvas says of itself: whose it is, its size in art pixels, and how many screen pixels it is shown at. */
const shown = (canvas: Locator): Promise<{ id: string | undefined; art: number[]; css: number[]; crisp: string; colours: number }> => canvas.evaluate((el: HTMLCanvasElement) => {
  const data = el.getContext('2d')!.getImageData(0, 0, el.width, el.height).data;
  const colours = new Set<number>();
  for (let i = 0; i < data.length; i += 4) colours.add((data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!);
  return { id: el.dataset['portrait'], art: [el.width, el.height], css: [el.clientWidth, el.clientHeight], crisp: getComputedStyle(el).imageRendering, colours: colours.size };
});

test('the King stands over the Crown\'s questions and the Congress shows whom it may seat, each with a portrait', async ({ page }) => {
  await page.addInitScript((text) => localStorage.setItem('new-world:autosave', text), business());
  await page.goto('/');
  await page.getByRole('menuitem', { name: 'Load Game' }).click();
  await expect(field(page, 'unit')).toHaveText('No active unit');

  // a question about the Crown: the King over it, twice the size of his art and not smoothed
  await page.keyboard.press('Shift+I');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Declare independence from the Crown?');
  const king = await shown(dialog.locator('canvas.portrait'));
  expect(king).toMatchObject({ id: 'king', art: [64, 64], css: [128, 128], crisp: 'pixelated' });
  expect(king.colours).toBeGreaterThan(4);
  await dialog.getByRole('button', { name: 'Not yet' }).click();
  await expect(dialog).toHaveCount(0);

  // the turn ends, the first bells are rung, and the Congress asks whom to seat: every name has its own face, and the keys still walk the list
  await page.keyboard.press('Enter');
  await expect(dialog).toContainText('Which Founding Father');
  const choices = dialog.getByRole('button');
  const offered = await choices.evaluateAll((all) => all.map((b) => ({ name: b.textContent?.split(' (')[0] ?? '', face: b.querySelector<HTMLElement>('canvas.portrait')?.dataset['portrait'] ?? '' })));
  expect(offered.length).toBeGreaterThan(1);
  for (const { name, face } of offered) expect(FATHERS[face as FatherId]?.name, name).toBe(name);
  expect(new Set(offered.map((o) => o.face)).size).toBe(offered.length);
  expect(await shown(choices.nth(1).locator('canvas'))).toMatchObject({ art: [64, 64], css: [64, 64], crisp: 'pixelated' });
  await expect(choices.nth(0)).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(choices.nth(1)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog).toHaveCount(0);
});

test('a founding father\'s page in the encyclopedia opens with his portrait, and no other page has one', async ({ page }) => {
  await page.addInitScript((text) => localStorage.setItem('new-world:autosave', text), business());
  await page.goto('/');
  await page.getByRole('menuitem', { name: 'Load Game' }).click();
  await expect(field(page, 'unit')).toHaveText('No active unit');
  await page.keyboard.press('Alt+P');
  const pedia = page.getByRole('dialog', { name: 'Encyclopedia' });
  await expect(pedia).toBeVisible();
  await expect(pedia.locator('.pedia-page canvas.portrait')).toHaveCount(0);
  await pedia.getByRole('button', { name: 'Pocahontas' }).click();
  expect(await shown(pedia.locator('.pedia-page canvas.portrait'))).toMatchObject({ id: 'pocahontas', art: [64, 64], css: [128, 128], crisp: 'pixelated' });
  await pedia.getByRole('button', { name: 'Caravel' }).click();
  await expect(pedia.locator('.pedia-page canvas.portrait')).toHaveCount(0);
});
