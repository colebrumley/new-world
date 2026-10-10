import { expect, test, type Page } from '@playwright/test';
import { PALETTE } from '../../src/ui/pixel-art';
import { field, setSail, startNewGame } from './helpers';

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

const frames = (page: Page): Promise<number> => page.locator('canvas.map').evaluate((c) => Number((c as HTMLCanvasElement).dataset['frames']));

test('title screen offers the five opening choices', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await expect(page).toHaveTitle('New World');
  await expect(page.getByRole('menuitem')).toHaveText([
    'Start a Game in New World',
    'Start a Game in America',
    'Customize New World',
    'Load Game',
    'View Hall of Fame',
  ]);
  await expect(page.getByRole('menuitem', { name: 'Load Game' })).toBeDisabled();
  expect(errors).toEqual([]);
});

test('the title is a frontispiece: a painting in palette colours behind the menu, enlarged by a whole number at every window size', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  const painting = page.locator('canvas.frontispiece');
  await expect(painting).toHaveAttribute('data-painted', 'true');
  await expect(painting).toBeVisible();

  // one canvas pixel to an art pixel, every one a colour of the map palette
  const colours = await painting.evaluate((el) => {
    const c = el as HTMLCanvasElement;
    const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    const seen = new Set<string>();
    for (let i = 0; i < data.length; i += 4) seen.add(`#${[data[i]!, data[i + 1]!, data[i + 2]!].map((v) => v.toString(16).padStart(2, '0')).join('')}/${data[i + 3]}`);
    return { size: [c.width, c.height], seen: [...seen], rendering: getComputedStyle(c).imageRendering };
  });
  expect(colours.size).toEqual([320, 200]);
  expect(colours.rendering).toBe('pixelated');
  expect(colours.seen.length).toBeGreaterThanOrEqual(12);
  for (const colour of colours.seen) expect(PALETTE.map((hex) => `${hex}/255`)).toContain(colour);

  // letterboxed on the wood, never stretched: a whole multiple of 320 x 200, centred, with the frame showing
  for (const [width, height, scale] of [[1280, 800, 3], [1024, 640, 3], [1700, 1000, 4], [1100, 1300, 3], [2000, 700, 3]] as const) {
    await page.setViewportSize({ width, height });
    await expect(painting).toHaveAttribute('data-scale', String(scale));
    const box = (await painting.boundingBox())!;
    expect([box.width, box.height]).toEqual([320 * scale, 200 * scale]);
    expect([box.x, box.y]).toEqual([(width - box.width) / 2, (height - box.height) / 2]);
    expect(Math.min(box.x, box.y)).toBeGreaterThanOrEqual(8);
    // the menu lies over it, inside the window
    const sheet = (await page.locator('.title-screen .cartouche').boundingBox())!;
    expect(sheet.x).toBeGreaterThanOrEqual(0);
    expect(sheet.y).toBeGreaterThanOrEqual(0);
    expect(sheet.y + sheet.height).toBeLessThanOrEqual(height);
    const top = await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.closest('.cartouche') !== null, [width / 2, height / 2]);
    expect(top).toBe(true);
  }
  await page.setViewportSize({ width: 1280, height: 800 });

  // the title is set in the display face over a rule, and the menu shows where the keyboard is and what cannot be chosen
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('New World');
  await page.evaluate(() => document.fonts.ready);
  const first = page.getByRole('menuitem', { name: 'Start a Game in New World' });
  await page.keyboard.press('Tab');
  await expect(first).toBeFocused();
  const look = (name: string): Promise<{ outline: string; opacity: string; colour: string; style: string }> =>
    page.getByRole('menuitem', { name }).evaluate((el) => {
      const s = getComputedStyle(el);
      return { outline: s.outlineStyle === 'none' ? 'none' : s.outlineWidth, opacity: s.opacity, colour: s.color, style: s.fontStyle };
    });
  expect((await look('Start a Game in New World')).outline).toBe('2px');
  expect((await look('Start a Game in America')).outline).toBe('none');
  const load = await look('Load Game');
  expect(load.opacity).toBe('1');
  expect(load.style).toBe('italic');
  expect(load.colour).not.toBe((await look('Start a Game in America')).colour);
  await expect(painting).toHaveCSS('opacity', '1'); // faded in
  await page.screenshot({ path: 'test-results/title.png' });
  expect(errors).toEqual([]);
});

test('the painting is asked for after the title is up, and the menu does not wait for it', async ({ page }) => {
  let release = (): void => undefined;
  const held = new Promise<void>((resolve) => (release = resolve));
  /** What the page had done by the time it asked for the picture. */
  let asked: { title: boolean; menu: number } | null = null;
  await page.route(/frontispiece-[^/]*\.js$/, async (route) => {
    asked = await page.evaluate(() => ({ title: performance.getEntriesByName('new-world:title').length > 0, menu: document.querySelectorAll('.title-menu button').length }));
    await held;
    await route.continue();
  });
  await page.goto('/');
  const painting = page.locator('canvas.frontispiece');
  await expect(page.getByRole('menuitem', { name: 'Start a Game in New World' })).toBeEnabled();
  // the picture went for only after the title and its menu were up
  await expect.poll(() => asked).toEqual({ title: true, menu: 5 });
  // with the picture still on its way the frame is empty wood, and the screens work: the note arrives, Customize opens and comes back
  await expect(painting).not.toHaveAttribute('data-painted', 'true');
  await expect(page.locator('.title-difficulty-note')).not.toHaveText('');
  await page.getByRole('menuitem', { name: 'Customize New World' }).click();
  await expect(page.getByRole('group')).toHaveCount(4);
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('menuitem')).toHaveCount(5);
  release();
  await expect(painting).toHaveAttribute('data-painted', 'true');
  const order = await page.evaluate(() => {
    const title = performance.getEntriesByName('new-world:title')[0]?.startTime ?? Infinity;
    const chunk = performance.getEntriesByType('resource').find((entry) => /frontispiece-[^/]*\.js$/.test(entry.name))?.startTime ?? -Infinity;
    return { title, chunk };
  });
  expect(order.chunk).toBeGreaterThan(order.title);
  // a game takes the painting down with the title
  await startNewGame(page);
  await expect(painting).toBeHidden();
});

test('Customize and the Hall of Fame keep the title\'s frame', async ({ page }) => {
  await page.goto('/');
  const painting = page.locator('canvas.frontispiece');
  await expect(painting).toHaveAttribute('data-painted', 'true');
  const hung = (await painting.boundingBox())!;

  await page.getByRole('menuitem', { name: 'Customize New World' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Customize New World');
  await expect(page.locator('.customize .cartouche')).toBeVisible();
  await expect(painting).toBeVisible();
  expect(await painting.boundingBox()).toEqual(hung);
  await page.evaluate(() => document.fonts.ready);
  await expect(painting).toHaveCSS('opacity', '1'); // faded in
  await page.screenshot({ path: 'test-results/title-customize.png' });
  await page.getByRole('button', { name: 'Cancel' }).click();

  await page.getByRole('menuitem', { name: 'View Hall of Fame' }).click();
  const hall = page.getByRole('dialog', { name: 'Hall of Fame' });
  await expect(hall).toBeVisible();
  await expect(painting).toBeVisible();
  expect(await painting.boundingBox()).toEqual(hung);
  // a sheet in the frame, not the whole window; the menu steps aside for it
  const sheet = (await hall.boundingBox())!;
  expect(sheet.width).toBeLessThan(1280);
  expect(sheet.height).toBeLessThan(800);
  await expect(page.locator('.title-screen .cartouche')).toBeHidden();
  await page.screenshot({ path: 'test-results/title-hall.png' });
  await page.keyboard.press('Escape');
  await expect(hall).toHaveCount(0);
  await expect(page.getByRole('menuitem', { name: 'View Hall of Fame' })).toBeVisible();
});

test('starting a game shows a canvas with non-blank pixels', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await startNewGame(page);
  const canvas = page.locator('canvas.map');
  await expect(canvas).toBeVisible();

  const colors = await canvas.evaluate((el) => {
    const c = el as HTMLCanvasElement;
    const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    const seen = new Set<number>();
    for (let i = 0; i < data.length; i += 4 * 97) seen.add((data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!);
    return seen.size;
  });
  expect(colors).toBeGreaterThanOrEqual(3); // void, ocean, land at least
  expect(errors).toEqual([]);
});

test('redraws only when state or view changes, and fills the window', async ({ page }) => {
  await page.goto('/');
  await startNewGame(page);

  const idle = await frames(page);
  await page.waitForTimeout(300);
  expect(await frames(page)).toBe(idle);

  await page.keyboard.press('Enter'); // end turn: state changed
  await expect.poll(() => frames(page)).toBe(idle + 1);
  await expect(page.locator('canvas.map')).toHaveAttribute('data-turn', '1');

  await page.setViewportSize({ width: 1024, height: 640 });
  await expect.poll(() => frames(page)).toBe(idle + 2);
  const box = await page.locator('canvas.map').boundingBox();
  expect(box).toMatchObject({ width: 1024 - 232, height: 640 });
});

test('Load Game resumes the autosave', async ({ page }) => {
  await page.goto('/');
  await startNewGame(page);
  await page.keyboard.press('Enter');
  await expect(page.locator('canvas.map')).toHaveAttribute('data-turn', '1');
  await page.reload();
  await page.getByRole('menuitem', { name: 'Load Game' }).click();
  await expect(page.locator('canvas.map')).toHaveAttribute('data-turn', '1');
});

test('Customize New World offers the four settings and starts a game', async ({ page }) => {
  await page.goto('/?reveal');
  await page.getByRole('menuitem', { name: 'Customize New World' }).click();
  await expect(page.getByRole('group')).toHaveCount(4);
  for (const [group, choices] of [
    ['Land Mass', ['Small', 'Normal', 'Large']],
    ['Land Form', ['Archipelago', 'Normal', 'Large Continents']],
    ['Temperature', ['Cool', 'Temperate', 'Warm']],
    ['Climate', ['Arid', 'Normal', 'Wet']],
  ] as const) {
    await expect(page.getByRole('group', { name: group }).getByRole('radio')).toHaveCount(3);
    for (const c of choices) await expect(page.getByRole('group', { name: group }).getByLabel(c, { exact: true })).toBeVisible();
  }
  await page.getByRole('group', { name: 'Land Mass' }).getByLabel('Large').check();
  await page.getByRole('group', { name: 'Climate' }).getByLabel('Wet').check();
  await page.getByRole('button', { name: 'Start' }).click();
  await setSail(page);
  await page.screenshot({ path: 'test-results/customize-world.png' });
});

test('America map shows a recognizable Florida and Caribbean', async ({ page }) => {
  await page.goto('/?reveal');
  await startNewGame(page, 'america');
  const canvas = page.locator('canvas.map');
  for (let i = 0; i < 3; i++) await page.keyboard.press('x'); // zoom out to the whole map
  await expect(canvas).toHaveAttribute('data-view', /"zoom":0/);
  await page.screenshot({ path: 'test-results/america.png' });

  // Sample a corner pixel (clear of river stripes and pieces) of a few tiles (grid coordinates) and classify it as sea or not.
  const isSea = (gx: number, gy: number): Promise<boolean> =>
    canvas.evaluate((el, [x, y]) => {
      const c = el as HTMLCanvasElement;
      const view = JSON.parse(c.dataset['view']!) as { originX: number; originY: number; tileSize: number };
      const dpr = c.width / c.clientWidth;
      const px = Math.round((x! - view.originX + 0.12) * view.tileSize * dpr);
      const py = Math.round((y! - view.originY + 0.12) * view.tileSize * dpr);
      const [r, g, b] = c.getContext('2d')!.getImageData(px, py, 1, 1).data;
      return b! > r! + 30 && b! > g! + 20;
    }, [gx, gy]);

  expect(await isSea(28, 25)).toBe(false); // Florida
  expect(await isSea(23, 25)).toBe(true); // Gulf of Mexico
  expect(await isSea(30, 25)).toBe(true); // Atlantic off Florida
  expect(await isSea(33, 26)).toBe(false); // Cuba
  expect(await isSea(34, 32)).toBe(true); // Caribbean Sea
  expect(await isSea(46, 46)).toBe(false); // Brazil
});

test('the map is bare vellum outside the explored start area, and H strips forests and pieces', async ({ page }) => {
  await page.goto('/?seed=11');
  await startNewGame(page);
  const canvas = page.locator('canvas.map');
  for (let i = 0; i < 3; i++) await page.keyboard.press('x'); // zoom out to the whole map
  await expect(canvas).toHaveAttribute('data-view', /"zoom":0/);
  await page.screenshot({ path: 'test-results/fog.png' });

  // squares that are not chart: an unknown square is drawn in the six chart inks alone, some of it bare vellum.
  // (The sea and the ship, which are all that is known here, are neither.)
  const lit = (): Promise<number> =>
    canvas.evaluate((el) => {
      const c = el as HTMLCanvasElement;
      const view = JSON.parse(c.dataset['view']!) as { originX: number; originY: number; tileSize: number };
      const dpr = c.width / c.clientWidth;
      const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      const inks = new Set([0xe9dfc4, 0xd3bd7a, 0xa39262, 0x7c6b45, 0x6b4a2a, 0x111111]);
      const side = Math.round(view.tileSize * dpr);
      let n = 0;
      for (let y = 0; y < 72; y++) {
        for (let x = 0; x < 58; x++) {
          const left = Math.round((x - view.originX) * view.tileSize * dpr);
          const top = Math.round((y - view.originY) * view.tileSize * dpr);
          let chart = true;
          let bare = false;
          for (let py = top; py < top + side && chart; py++) {
            for (let px = left; px < left + side; px++) {
              const i = (py * c.width + px) * 4;
              const rgb = (data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!;
              if (!inks.has(rgb)) chart = false;
              if (rgb === 0xe9dfc4) bare = true;
            }
          }
          if (!(chart && bare)) n++;
        }
      }
      return n;
    });

  await expect.poll(lit).toBe(9); // radius 1 around the first unit
  await page.keyboard.press('ArrowLeft'); // west, away from the Sea Lane
  await expect.poll(lit).toBe(12);

  await page.keyboard.press('h');
  await expect(canvas).toHaveAttribute('data-hidden', 'true');
  await page.keyboard.press('Shift');
  await expect(canvas).toHaveAttribute('data-hidden', 'false');
});

// --- R-1017: choosing a power ------------------------------------------------------------------

test('each way of starting a new game passes through Choose a European Power, and Back returns whence it came', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  for (const choice of ['Start a Game in New World', 'Start a Game in America']) {
    await page.getByRole('menuitem', { name: choice }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Choose a European Power');
    const radios = page.getByRole('radiogroup', { name: 'Choose a European Power' }).getByRole('radio');
    await expect(radios).toHaveCount(4);
    await expect(radios).toContainText(['England', 'France', 'Spain', 'Netherlands']);
    await expect(radios.nth(0)).toContainText('Walter Raleigh · London');
    await expect(radios.nth(3)).toContainText('Trade: prices in Amsterdam');
    await expect(page.getByRole('radio', { checked: true })).toContainText('England');
    await expect(page.getByLabel('Your name')).toHaveValue('Walter Raleigh');
    await expect(page.getByRole('radio', { checked: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menuitem')).toHaveCount(5);
  }
  // from Customize, and back to it with its settings as they were
  await page.getByRole('menuitem', { name: 'Customize New World' }).click();
  await page.getByRole('group', { name: 'Land Mass' }).getByLabel('Large').check();
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Choose a European Power');
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Customize New World');
  await expect(page.getByRole('group', { name: 'Land Mass' }).getByLabel('Large')).toBeChecked();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('menuitem')).toHaveCount(5);
  expect(errors).toEqual([]);
});

test('choosing a power changes the name, the account and what it lands with; a name once typed is kept', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('menuitem', { name: 'Start a Game in New World' }).click();
  const screen = page.locator('.power');
  const chosen = screen.getByRole('radio', { checked: true });
  const name = page.getByLabel('Your name');
  await expect(screen.locator('.power-account')).toContainText('Quarrels over religion');
  await expect(screen.locator('.power-lands')).toHaveText('Lands with: Caravel, Soldier, Pioneer');
  await screen.getByRole('radio', { name: /^Netherlands/ }).click();
  await expect(chosen).toContainText('Netherlands');
  await expect(name).toHaveValue('Michiel De Ruyter');
  await expect(screen.locator('.power-account')).toContainText('republic of merchants');
  await expect(screen.locator('.power-lands')).toHaveText('Lands with: Merchantman, Soldier, Pioneer');
  // the keys: Up and the digits move the choice
  await page.keyboard.press('ArrowUp');
  await expect(chosen).toContainText('Spain');
  await expect(name).toHaveValue('Christopher Columbus');
  await expect(screen.locator('.power-lands')).toHaveText('Lands with: Caravel, Veteran Soldier, Pioneer');
  await page.keyboard.press('2');
  await expect(chosen).toContainText('France');
  await expect(screen.locator('.power-lands')).toHaveText('Lands with: Caravel, Soldier, Hardy Pioneer');
  // typed, the name stays whichever power is chosen; the digits in it are a name's, not a choice
  await name.fill('Anne 4');
  await expect(chosen).toContainText('France');
  await screen.getByRole('radio', { name: /^England/ }).click();
  await expect(name).toHaveValue('Anne 4');
  await expect(chosen).toContainText('England');
});

test('Set Sail as France: an audience with the King, then the game under the French flag and the typed name', async ({ page }) => {
  await page.goto('/?seed=11');
  await page.getByRole('menuitem', { name: 'Start a Game in New World' }).click();
  await page.locator('.power-row[data-nation="france"]').click();
  await page.getByLabel('Your name').fill('  Anne of Brittany ');
  await page.getByRole('button', { name: 'Set Sail' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('In the year of Our Lord 1492');
  await expect(dialog).toContainText('An audience with the King of France');
  await expect(dialog).toContainText('Anne of Brittany: for the glory of France we name you Viceroy of the New World.');
  await expect(dialog.locator('canvas[data-portrait="king"]')).toBeVisible();
  await expect(page.locator('canvas.map')).toBeVisible(); // the ship already on the map behind it
  await page.screenshot({ path: 'test-results/audience.png' });
  await dialog.getByRole('button', { name: 'So be it' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.game')).toHaveAttribute('data-nation', 'france');
  await expect(field(page, 'unit')).toHaveText('Caravel');

  // the autosave is summed up under the typed name, trimmed
  await page.keyboard.press('Alt+L');
  const saves = page.getByRole('dialog', { name: 'Save or Load Game' });
  await expect(saves.getByRole('row', { name: /Autosave \(last turn\)/ })).toContainText('Anne of Brittany of France, 1492');
  await page.keyboard.press('Escape');
  await expect(saves).toHaveCount(0);
  // a loaded game opens with no audience
  await page.reload();
  await page.getByRole('menuitem', { name: 'Load Game' }).click();
  await expect(field(page, 'unit')).toHaveText('Caravel');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // the Hall of Fame too, once the game is over
  await page.keyboard.press('Shift+R');
  await dialog.getByRole('button', { name: 'Yes, retire' }).click();
  await dialog.getByRole('button', { name: 'So be it' }).click();
  const score = page.getByRole('dialog', { name: 'Colonial Score' });
  await expect(score.getByRole('group', { name: 'Hall of Fame' })).toContainText('Anne of Brittany of France');

  // next time the screen opens on France under that name; a name given as France is not England's
  await page.goto('/');
  await page.getByRole('menuitem', { name: 'Start a Game in America' }).click();
  await expect(page.getByRole('radio', { checked: true })).toContainText('France');
  await expect(page.getByLabel('Your name')).toHaveValue('Anne of Brittany');
  await page.locator('.power-row[data-nation="england"]').click();
  await expect(page.getByLabel('Your name')).toHaveValue('Walter Raleigh');
});

test('?nation= and ?name= preselect the power and the name, and ?rivals=0 seats the chosen power alone', async ({ page }) => {
  await page.goto('/?nation=spain&name=Cortes&rivals=0&seed=11');
  await page.getByRole('menuitem', { name: 'Start a Game in New World' }).click();
  await expect(page.getByRole('radio', { checked: true })).toContainText('Spain');
  await expect(page.getByLabel('Your name')).toHaveValue('Cortes');
  // the name given on the page is kept whichever power is chosen
  await page.locator('.power-row[data-nation="france"]').click();
  await expect(page.getByLabel('Your name')).toHaveValue('Cortes');
  await page.locator('.power-row[data-nation="spain"]').click();
  await setSail(page);
  await expect(page.locator('.game')).toHaveAttribute('data-nation', 'spain');
  await expect(field(page, 'unit')).toHaveText('Caravel');
  const players = await page.evaluate(() => (JSON.parse(localStorage.getItem('new-world:autosave')!) as { state: { players: { id: string; name: string; nation: string; kind: string }[] } }).state.players);
  expect(players).toEqual([{ id: 'p0', name: 'Cortes', nation: 'spain', kind: 'human' }].map((p) => expect.objectContaining(p)));
  // an empty name falls back to the leader's
  await page.goto('/?seed=11');
  await page.getByRole('menuitem', { name: 'Start a Game in New World' }).click();
  await setSail(page, { nation: 'netherlands', name: '   ' });
  const seated = await page.evaluate(() => (JSON.parse(localStorage.getItem('new-world:autosave')!) as { state: { players: { id: string; name: string; nation: string }[] } }).state.players);
  expect(seated.map((p) => [p.id, p.name, p.nation])).toEqual([['p0', 'Michiel De Ruyter', 'netherlands'], ['england', 'England', 'england'], ['france', 'France', 'france'], ['spain', 'Spain', 'spain']]);
});

test("the power screen keeps the title's frame, fits at 1024 x 640 without scrolling, and shows the flags in palette colours", async ({ page }) => {
  await page.goto('/');
  const painting = page.locator('canvas.frontispiece');
  await expect(painting).toHaveAttribute('data-painted', 'true');
  const hung = (await painting.boundingBox())!;
  await page.getByRole('menuitem', { name: 'Start a Game in America' }).click();
  const sheet = page.locator('.power .cartouche');
  await expect(sheet).toBeVisible();
  await expect(painting).toBeVisible();
  expect(await painting.boundingBox()).toEqual(hung);
  for (const [width, height] of [[1280, 800], [1024, 640]] as const) {
    await page.setViewportSize({ width, height });
    const fit = await sheet.evaluate((el) => {
      const box = el.getBoundingClientRect();
      return { scroll: el.scrollHeight, client: el.clientHeight, top: box.top, bottom: box.bottom, left: box.left, right: box.right };
    });
    expect(fit.scroll, `${width} x ${height}`).toBeLessThanOrEqual(fit.client);
    expect(fit.top).toBeGreaterThanOrEqual(0);
    expect(fit.left).toBeGreaterThanOrEqual(0);
    expect(fit.bottom).toBeLessThanOrEqual(height);
    expect(fit.right).toBeLessThanOrEqual(width);
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  // a flag is drawn three screen pixels to the art pixel, in palette colours, and never smoothed
  const flags = page.locator('.power-flag');
  await expect(flags).toHaveCount(4);
  const look = await flags.first().evaluate((el) => {
    const c = el as HTMLCanvasElement;
    const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    const seen = new Set<string>();
    for (let i = 0; i < data.length; i += 4) seen.add(`#${[data[i]!, data[i + 1]!, data[i + 2]!].map((v) => v.toString(16).padStart(2, '0')).join('')}/${data[i + 3]}`);
    return { size: [c.width, c.height], css: [c.clientWidth, c.clientHeight], seen: [...seen], rendering: getComputedStyle(c).imageRendering };
  });
  expect(look.size).toEqual([48, 36]);
  expect(look.css).toEqual([48, 36]);
  expect(look.rendering).toBe('pixelated');
  expect(look.seen.length).toBeGreaterThanOrEqual(3); // ink, white, red
  for (const colour of look.seen) expect(PALETTE.map((hex) => `${hex}/255`)).toContain(colour);
  await page.evaluate(() => document.fonts.ready);
  await expect(painting).toHaveCSS('opacity', '1');
  await page.screenshot({ path: 'test-results/title-power.png' });
});
