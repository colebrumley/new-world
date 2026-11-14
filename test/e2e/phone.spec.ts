import { expect, test, type Page } from '@playwright/test';
import { foundJamestown, settled } from './helpers';

// The page on a phone (R-1071, docs/specs/phone-play.md W1).

/** The box of every element a selector matches, rounded to whole pixels, keyed by what it is. */
async function boxes(page: Page, selector: string): Promise<string[]> {
  return page.locator(selector).evaluateAll((nodes) =>
    nodes.map((node) => {
      const r = node.getBoundingClientRect();
      const name = (node.getAttribute('data-command') ?? node.className) || node.tagName.toLowerCase();
      return `${name}: ${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`;
    }),
  );
}

// The measure of "as it is today" for the full layout: recorded on main's code before any of the
// phone work, and never changed by it.
test.describe('the full layout at 1280 x 800', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('keeps the boxes of the map, colony and Europe screens as they were', async ({ page }) => {
    await foundJamestown(page);
    await settled(page);
    const colony = await boxes(page, '.colony-screen, .colony-screen > *, .colony-screen > * > *');
    await page.keyboard.press('Escape');
    await expect(page.locator('.colony-screen')).toHaveCount(0);
    await settled(page);
    const map = await boxes(page, '.sidebar, .sidebar > *, .minimap, .command-bar, .command-bar button');
    await page.keyboard.press('e');
    const europe = page.locator('.europe-screen');
    await expect(europe).toBeVisible();
    await settled(page);
    const harbour = await boxes(page, '.europe-screen, .europe-screen > *, .europe-screen > * > *');
    expect(JSON.stringify({ map, colony, europe: harbour }, null, 2)).toMatchSnapshot('desktop-boxes.json');
  });
});
