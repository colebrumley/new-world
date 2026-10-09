import { expect, test } from '@playwright/test';
import { field } from './helpers';

test('the built game installs as an app and plays with the network gone', async ({ page, context }) => {
  await page.goto('/?seed=11');
  await expect(page.getByRole('menuitem', { name: 'Start a Game in New World' })).toBeVisible();

  // installable: a manifest with a name, a start URL inside its scope, and an icon that loads
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifest = await page.evaluate(async (url) => (await fetch(url!)).json() as Promise<{ name: string; start_url: string; display: string; icons: { src: string }[] }>, href);
  expect(manifest).toMatchObject({ name: 'New World', start_url: './', display: 'standalone' });
  expect(await page.evaluate(async (src) => (await fetch(src)).ok, manifest.icons[0]!.src)).toBe(true);

  // the worker takes charge and has every built file in hand
  const cached = await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    for (let i = 0; i < 100 && !navigator.serviceWorker.controller; i++) await new Promise((r) => setTimeout(r, 50));
    const names = (await caches.keys()).filter((n) => n.startsWith('new-world-'));
    const keys = names.length === 1 ? await (await caches.open(names[0]!)).keys() : [];
    return { controlled: navigator.serviceWorker.controller !== null, caches: names.length, files: keys.map((k) => new URL(k.url).pathname) };
  });
  expect(cached.controlled).toBe(true);
  expect(cached.caches).toBe(1);
  expect(cached.files.filter((f) => f.endsWith('.js')).length).toBeGreaterThanOrEqual(2);
  expect(cached.files.some((f) => f.endsWith('.css'))).toBe(true);

  // pull the plug: the page still comes up, and a game can be started and played
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('menuitem', { name: 'Start a Game in New World' }).click();
  await expect(field(page, 'unit')).toHaveText('Caravel');
  await page.keyboard.press('ArrowLeft');
  await expect(field(page, 'moves')).toHaveText('Moves: 3');
  await context.setOffline(false);
});

test('every path in the built page is relative, so it can be served from any folder', async ({ page }) => {
  const response = await page.goto('/');
  const html = await response!.text();
  const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]!);
  expect(refs.length).toBeGreaterThanOrEqual(4);
  for (const ref of refs) expect(ref, ref).toMatch(/^\.\//);
});
