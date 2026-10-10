import { expect, test, type Page } from '@playwright/test';
import { startNewGame } from './helpers';

// The Europe screen as a harbour (R-1014): what is drawn, and that a price changes on its tag
// without the stall being made again. The actions themselves are in europe.spec.ts.

const europe = (page: Page) => page.getByRole('dialog', { name: 'Europe' });

async function sailForEurope(page: Page): Promise<void> {
  await page.goto('/?seed=11&difficulty=discoverer');
  await startNewGame(page);
  await expect(page.locator('[data-field="unit"]')).toHaveText('Caravel');
  await page.keyboard.press('ArrowRight');
  await page.getByRole('button', { name: 'Yes, make for Europe' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

/** Whether a canvas has anything drawn on it. */
const painted = (canvas: HTMLCanvasElement): boolean => {
  const data = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data ?? [];
  for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) return true;
  return false;
};

test('ships at sea are their pictures: one coming in heads east, one turned back heads west', async ({ page }) => {
  await sailForEurope(page);
  await page.keyboard.press('e');
  const screen = europe(page);
  const coming = screen.locator('.lane-in canvas.ship-art');
  await expect(coming).toHaveCount(1);
  await expect(coming).toHaveClass(/heads-east/);
  expect(await coming.evaluate(painted)).toBe(true);
  await expect(coming).toHaveAttribute('aria-hidden', 'true');

  await screen.getByRole('button', { name: 'Turn back' }).click();
  await expect(screen.locator('.lane-in canvas')).toHaveCount(0);
  await expect(screen.locator('.lane-out canvas.ship-art')).toHaveClass(/heads-west/);
  // the two are drawn opposite ways round
  const flip = (canvas: Element): string => getComputedStyle(canvas).transform;
  expect(await screen.locator('.lane-out canvas.ship-art').evaluate(flip)).toBe('none');
});

test('in port the ship, her cargo, those on the docks and every stall are drawn; prices are rewritten on the same tags', async ({ page }) => {
  await sailForEurope(page);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.press('e');
  const screen = europe(page);
  const harbor = screen.getByRole('group', { name: 'In port' });
  const docks = screen.getByRole('group', { name: 'On the docks' });
  const market = screen.getByRole('group', { name: 'Market (bid / ask)' });

  // the Crown's crest and the capital at the head of the sheet
  expect(await screen.locator('.europe-crest canvas').evaluate(painted)).toBe(true);
  await expect(screen.getByRole('heading', { level: 2 })).toHaveText(/\S/);

  const ship = harbor.locator('.europe-ship canvas.ship-art');
  await expect(ship).toHaveClass(/heads-east/);
  expect(await ship.evaluate(painted)).toBe(true);
  expect(await ship.evaluate((canvas) => getComputedStyle(canvas).transform)).not.toBe('none');

  // every stall has its good's icon and a tag
  await expect(market.locator('.token-good canvas')).toHaveCount(16);
  for (const canvas of await market.locator('.token-good canvas').all()) expect(await canvas.evaluate(painted)).toBe(true);
  await expect(market.locator('.token-good .token-sub')).toHaveText(Array.from({ length: 16 }, () => /^\d+\/\d+$/));

  // a passenger put ashore stands on the docks as a figure
  await harbor.getByRole('button', { name: 'Veteran Soldier' }).click();
  expect(await docks.getByRole('button', { name: 'Veteran Soldier' }).locator('canvas').evaluate(painted)).toBe(true);

  // buying leaves the stalls as they are (a mark put on one survives) and sets a crate with the good's icon on the quay
  const tools = market.locator('[data-good="tools"]');
  await tools.evaluate((stall) => stall.setAttribute('data-mark', 'kept'));
  await tools.focus();
  await page.keyboard.press('l');
  await expect(harbor.getByRole('button', { name: 'Tools 100' })).toBeVisible();
  await expect(tools).toHaveAttribute('data-mark', 'kept');
  await expect(tools).toBeFocused();
  await expect(tools.locator('.token-sub')).toHaveText(/^\d+\/\d+$/);
  expect(await harbor.getByRole('button', { name: 'Tools 100' }).locator('canvas').evaluate(painted)).toBe(true);

  // the three doors are buttons by their old names, and the one with the keyboard on it shows a ring
  for (const name of ['Recruit (R)', 'Purchase (P)', 'Train (T)']) await expect(screen.getByRole('button', { name, exact: true })).toBeVisible();
  await page.keyboard.press('Tab');
  const ring = await page.evaluate(() => {
    const style = getComputedStyle(document.activeElement as Element);
    return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
  });
  expect(ring.style).toBe('solid');
  expect(ring.width).toBeGreaterThanOrEqual(2);
});
