import { expect, test } from '@playwright/test';
import { saveGame } from '../../src/engine/save';
import type { Colonist, GameState } from '../../src/engine/state';
import { withColony, withUnit, world } from '../helpers/world';
import { field } from './helpers';

const people = (n: number, p: string): Colonist[] => Array.from({ length: n }, (_, i) => ({ id: `${p}${i}`, profession: 'freeColonist' as const, job: { kind: 'idle' as const }, turns: 0 }));

/** Our scout one step from a French colony we have not met: a step east brings their envoy. */
function nearParis(): GameState {
  const rows = Array.from({ length: 10 }, (_, y) => (y === 0 || y === 9 ? '~'.repeat(16) : `~${'.'.repeat(14)}~`));
  let state = world({ rows, seed: 7, players: [{ id: 'p0', kind: 'human', nation: 'england' }, { id: 'france', kind: 'ai', nation: 'france' }] });
  state = { ...state, turn: 120, players: state.players.map((p) => ({ ...p, gold: 1000 })) };
  state = withColony(state, { id: 'home', owner: 'p0', x: 3, y: 4, name: 'Home', colonists: people(4, 'h') });
  state = withColony(state, { id: 'paris', owner: 'france', x: 12, y: 4, name: 'Paris', colonists: people(4, 'p') });
  return withUnit(state, { id: 'scout', owner: 'p0', type: 'scout', profession: null, x: 10, y: 4 });
}

test('a first meeting: the treaty is proposed with the menu, and agreeing is one answer', async ({ page }) => {
  await page.addInitScript((text) => localStorage.setItem('new-world:autosave', text), saveGame({ options: { seed: 7 }, log: [], state: nearParis() }));
  await page.goto('/');
  await page.getByRole('menuitem', { name: 'Load Game' }).click();
  await expect(field(page, 'unit')).toHaveText('Scout');
  await page.keyboard.press('ArrowRight');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('The French envoy is courteous. They propose a treaty of peace between our peoples.');
  await expect(dialog.getByRole('button')).toHaveText([
    'Agree, and go in peace',
    'Agree, and ask them to pull their forces back from our colonies',
    'Agree, and ask what their lives are worth to them',
    'Agree, and ask them to join us against an enemy',
    'Refuse',
  ]);
  await dialog.getByRole('button', { name: 'Agree, and go in peace' }).click();
  // no second question: the envoy has gone, the treaty stands
  await expect(dialog).toHaveCount(0);
  await expect(field(page, 'status')).toContainText('A treaty of peace is signed.');
  const stance = await page.evaluate(() => (JSON.parse(localStorage.getItem('new-world:autosave')!) as { state: { players: { stance: Record<string, string> }[] } }).state.players[0]!.stance);
  expect(stance).toEqual({ france: 'peace' });
});

test('a first meeting: an answer for the menu is put once the treaty is signed', async ({ page }) => {
  await page.addInitScript((text) => localStorage.setItem('new-world:autosave', text), saveGame({ options: { seed: 7 }, log: [], state: nearParis() }));
  await page.goto('/');
  await page.getByRole('menuitem', { name: 'Load Game' }).click();
  await expect(field(page, 'unit')).toHaveText('Scout');
  await page.keyboard.press('ArrowRight');
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Agree, and ask them to join us against an enemy' }).click();
  // the one question the alliance needs, and nothing else between
  await expect(dialog).toContainText('Against whom shall they take up arms?');
  await expect(dialog.getByRole('button')).toHaveText(['Never mind']);
  await dialog.getByRole('button', { name: 'Never mind' }).click();
  await expect(dialog).toHaveCount(0);
  // both answers went in: the treaty was signed, then the envoy was sent in peace, and the audience is over
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('new-world:autosave')!) as { log: { type: string; reply?: string }[]; state: { audience: unknown; players: { stance: Record<string, string> }[] } });
  expect(saved.log.filter((a) => a.type === 'audienceReply').map((a) => a.reply)).toEqual(['yes', 'goInPeace']);
  expect(saved.state.audience).toBeNull();
  expect(saved.state.players[0]!.stance).toEqual({ france: 'peace' });
});

test('refusing the treaty asks nothing more', async ({ page }) => {
  await page.addInitScript((text) => localStorage.setItem('new-world:autosave', text), saveGame({ options: { seed: 7 }, log: [], state: nearParis() }));
  await page.goto('/');
  await page.getByRole('menuitem', { name: 'Load Game' }).click();
  await expect(field(page, 'unit')).toHaveText('Scout');
  await page.keyboard.press('ArrowRight');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('They propose a treaty of peace');
  await page.keyboard.press('Escape'); // Escape is Refuse
  await expect(dialog).toHaveCount(0);
  const stance = await page.evaluate(() => (JSON.parse(localStorage.getItem('new-world:autosave')!) as { state: { players: { stance: Record<string, string> }[] } }).state.players[0]!.stance);
  expect(stance).toEqual({ france: 'war' });
});
