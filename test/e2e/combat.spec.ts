import { expect, test } from '@playwright/test';
import { saveGame } from '../../src/engine/save';
import type { GameState, Unit } from '../../src/engine/state';
import { withUnit, world } from '../helpers/world';
import { field } from './helpers';

/** A small prepared game: our veteran dragoon beside a lone foreign soldier in the hills, on open land. */
function skirmish(): string {
  const rows = Array.from({ length: 12 }, (_, y) => (y === 0 || y === 11 ? '~'.repeat(16) : `~${'.'.repeat(14)}~`));
  rows[5] = '~.....h........~';
  let state: GameState = world({ rows, seed: 3, difficulty: 'conquistador', players: [{ id: 'p0', kind: 'human' }, { id: 'rival', kind: 'ai', nation: 'france' }] });
  state = withUnit(state, { id: 'dragoon', owner: 'p0', type: 'dragoon', profession: 'veteranSoldier', x: 5, y: 5 });
  state = withUnit(state, { id: 'foe', owner: 'rival', type: 'soldier', x: 6, y: 5 });
  const foe = state.units['foe'] as Unit;
  state = { ...state, units: { ...state.units, foe: { ...foe, orders: 'fortified' } } };
  return saveGame({ options: { seed: 3 }, log: [], state });
}

test('attacking shows the Combat Analysis with both strengths, then the result and a line in the log', async ({ page }) => {
  const save = skirmish();
  await page.addInitScript((text) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('new-world:autosave', text);
      sessionStorage.setItem('seeded', '1');
    }
  }, save);
  await page.goto('/');
  await page.getByRole('menuitem', { name: 'Load Game' }).click();
  await expect(field(page, 'unit')).toHaveText('Dragoon');

  // riding at the soldier raises the analysis instead of moving
  await page.keyboard.press('ArrowRight');
  const analysis = page.getByRole('dialog', { name: 'Combat Analysis' });
  await expect(analysis).toBeVisible();
  const attacker = analysis.locator('[data-side="attack"]');
  const defender = analysis.locator('[data-side="defense"]');
  await expect(attacker).toContainText('Dragoon (3)');
  await expect(attacker).toContainText('Veteran +50%');
  await expect(attacker).toContainText('Attack Bonus +50%');
  // 3 x 1.5 x 1.5 = 6.75, plus the quarter point a human gets on the middle level
  await expect(analysis.locator('[data-field="attack-strength"]')).toHaveText('Strength 7');
  await expect(defender).toContainText('Soldier (2)');
  await expect(defender).toContainText('Terrain +100%');
  await expect(defender).toContainText('Fortified +50%');
  // 2 x (1 + 1 + 0.5) = 5
  await expect(analysis.locator('[data-field="defense-strength"]')).toHaveText('Strength 5');
  await expect(analysis.locator('[data-field="combat-chance"]')).toHaveText('Chance of victory 58%');

  // Escape holds: nothing has happened
  await page.keyboard.press('Escape');
  await expect(analysis).toHaveCount(0);
  await expect(field(page, 'location')).toHaveText('(5, 5)');
  await expect(page.locator('[data-field="log"] li:not(.hint)')).toHaveCount(0);

  // again, and this time attack
  await page.keyboard.press('ArrowRight');
  await analysis.getByRole('button', { name: 'Attack' }).click();
  await expect(page.locator('[data-field="combat-result"]')).toHaveText(/Victory|Defeat/);
  const log = page.locator('[data-field="log"] li:not(.hint)');
  await expect(log).toHaveCount(1);
  await expect(log).toHaveText(/^Our Dragoon attacked French Soldier at \(6, 5\) and (won|lost)\.$/);
  await expect(field(page, 'status')).toHaveText(/Victory|beaten/);
  // the flash clears by itself
  await expect(page.locator('[data-field="combat-result"]')).toHaveCount(0, { timeout: 4000 });
});

test('with the analysis switched off a plain question is asked instead', async ({ page }) => {
  const save = skirmish();
  await page.addInitScript((text) => {
    localStorage.setItem('new-world:autosave', text);
    localStorage.setItem('new-world:combat-analysis', 'off');
  }, save);
  await page.goto('/');
  await page.getByRole('menuitem', { name: 'Load Game' }).click();
  await page.keyboard.press('ArrowRight');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Shall we attack?');
  await expect(dialog.getByRole('button')).toHaveText(['Hold', 'Attack']);
  await expect(page.getByRole('dialog', { name: 'Combat Analysis' })).toHaveCount(0);
});
