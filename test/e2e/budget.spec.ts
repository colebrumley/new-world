import { expect, test } from '@playwright/test';
import { playTurn } from '../../src/ai/european';
import { DEFAULT_WORLD } from '../../src/engine/data/mapgen';
import { NATION_IDS } from '../../src/engine/data/nations';
import { createGame } from '../../src/engine/game';
import { checkInvariants } from '../../src/engine/invariants';
import { saveGame } from '../../src/engine/save';
import type { GameState } from '../../src/engine/state';
import { isLand } from '../../src/engine/tile';
import { withColony } from '../helpers/world';
import { field } from './helpers';

// Performance budgets (R-1007). The size budget is scripts/check-size.mjs, run by `npm run check`.

/** Chrome DevTools' "Fast 3G" preset. */
const FAST_3G = { offline: false, latency: 562.5, downloadThroughput: (1.6 * 1024 * 1024 * 0.9) / 8, uploadThroughput: (750 * 1024 * 0.9) / 8 };

test('cold load: the title screen is up within 1.5 s on throttled Fast 3G', async ({ page, context }) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', FAST_3G);
  await page.goto('/', { waitUntil: 'commit' });
  await expect(page.getByRole('menuitem', { name: 'Start a Game in New World' })).toBeVisible();
  // the page's own clock, from the request for it to the title screen going up
  const elapsed = await page.evaluate(() => performance.getEntriesByName('new-world:title')[0]?.startTime ?? Infinity);
  test.info().annotations.push({ type: 'cold-load-ms', description: String(elapsed) });
  expect(elapsed).toBeLessThanOrEqual(1500);
  // the game itself arrives behind the title screen without being asked for
  await expect(page.locator('.title-difficulty-note')).toContainText('Conquistador', { timeout: 15000 });
});

/** A long game between four powers, topped up to forty colonies, on the human's turn. */
function fortyColonies(): string {
  const options = { seed: 11, world: DEFAULT_WORLD, players: NATION_IDS.map((nation, i) => ({ id: nation, name: nation, kind: i === 0 ? ('human' as const) : ('ai' as const), nation })) };
  let state: GameState = createGame(options);
  while (state.turn < 200 || state.current !== 0) state = playTurn(state).state;
  // the computer powers stop at eight colonies each: found more by decree until there are forty
  const taken = (x: number, y: number): boolean =>
    Object.values(state.colonies).some((c) => Math.max(Math.abs(c.x - x), Math.abs(c.y - y)) <= 2)
    || Object.values(state.settlements).some((s) => Math.max(Math.abs(s.x - x), Math.abs(s.y - y)) <= 2)
    || Object.values(state.units).some((u) => u.x === x && u.y === y);
  let made = 0;
  for (let y = 3; y < state.map.height - 3 && Object.keys(state.colonies).length < 40; y++) {
    for (let x = 3; x < state.map.width - 3 && Object.keys(state.colonies).length < 40; x++) {
      const tile = state.map.tiles[y * state.map.width + x];
      if (!tile || !isLand(tile) || tile.relief !== 'flat' || tile.base === 'arctic' || taken(x, y)) continue;
      const owner = NATION_IDS[made % NATION_IDS.length] as string;
      const id = `extra${made++}`;
      state = withColony(state, {
        id, owner, x, y, name: `Extra ${made}`, founded: state.turn,
        colonists: [0, 1, 2].map((i) => ({ id: `${id}-c${i}`, profession: 'freeColonist' as const, job: { kind: 'idle' as const }, turns: 0 })),
        goods: { food: 100 }, buildings: ['townHall', 'carpentersShop'], construction: { kind: 'building', id: 'stockade' },
      });
    }
  }
  if (Object.keys(state.colonies).length < 40) throw new Error(`only ${Object.keys(state.colonies).length} colonies`);
  const problems = checkInvariants(state);
  if (problems.length > 0) throw new Error(problems.join('; '));
  return saveGame({ options, log: [], state });
}

test('ending a turn with four powers and forty colonies takes no more than 500 ms', async ({ page }) => {
  test.setTimeout(120_000);
  const save = fortyColonies();
  await page.addInitScript(([key, text]) => {
    localStorage.setItem(key!, text!);
    localStorage.setItem('new-world:options', JSON.stringify({ tutorialHints: false, autosave: false }));
  }, ['new-world:autosave', save] as const);
  await page.goto('/');
  await page.getByRole('menuitem', { name: 'Load Game' }).click();
  const canvas = page.locator('canvas.map');
  await expect(canvas).toHaveAttribute('data-turn', /^\d+$/);
  const turn = Number(await canvas.getAttribute('data-turn'));
  const colonies = await page.evaluate(() => (window as unknown as { __newWorld: { colonies?: () => number } }).__newWorld.colonies?.() ?? -1);
  expect(colonies).toBeGreaterThanOrEqual(40);

  // three turns, timed inside the page from the key to the end of the handler: the worst must fit
  const times: number[] = [];
  for (let i = 0; i < 3; i++) {
    const ms = await page.evaluate(() => (window as unknown as { __newWorld: { endTurnMs: () => number } }).__newWorld.endTurnMs());
    times.push(ms);
    await expect(canvas).toHaveAttribute('data-turn', String(turn + i + 1));
    // answer whatever the new turn asks, so the next can be ended
    for (let guard = 0; guard < 12 && (await page.getByRole('dialog').count()) > 0; guard++) await page.keyboard.press('Escape');
  }
  test.info().annotations.push({ type: 'end-turn-ms', description: times.map((t) => t.toFixed(0)).join(', ') });
  expect(Math.max(...times)).toBeLessThanOrEqual(500);
  await expect(field(page, 'date')).not.toHaveText('');
});
