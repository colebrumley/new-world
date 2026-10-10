import { expect, test, type Locator, type Page } from '@playwright/test';
import { UNIT_TYPE_IDS } from '../../src/engine/data/units';
import { loadGame, saveGame } from '../../src/engine/save';
import type { GameState, Settlement } from '../../src/engine/state';
import { makeTile } from '../../src/engine/tile';
import { ART_COLORS, INK, PALETTE } from '../../src/ui/pixel-art';
import type { View } from '../../src/ui/view';
import { fingerprint, referencePixels } from '../helpers/reference-canvas';
import { withColony, withUnit, world } from '../helpers/world';

// Visual baselines at 1280 x 800 (docs/VISUAL_CHECKLIST.md). The map is drawn only from
// palette-indexed art blown up by whole numbers, so what it must show can be worked out without a
// browser: test/helpers/reference-canvas.ts runs the game's render() against a plain pixel
// buffer. Each view's canvas must match that reference pixel for pixel, on whatever platform the
// test runs; the reference's fingerprint is what is kept as the baseline. A PNG of each view is
// written to test-results/ for the eye. `?still` freezes the blink and the water.

interface Survey {
  /** FNV-1a over every pixel. */
  readonly fingerprint: string;
  /** Distinct colours on the canvas, as hex. */
  readonly colours: string[];
  readonly width: number;
  readonly height: number;
}

const survey = (canvas: Locator): Promise<Survey> =>
  canvas.evaluate((el) => {
    const c = el as HTMLCanvasElement;
    const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let h = 2166136261;
    const seen = new Set<number>();
    for (let i = 0; i < data.length; i += 4) {
      const rgb = (data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!;
      seen.add(rgb);
      h = Math.imul(h ^ rgb, 16777619);
    }
    return { fingerprint: (h >>> 0).toString(16).padStart(8, '0'), colours: [...seen].map((n) => `#${n.toString(16).padStart(6, '0')}`).sort(), width: c.width, height: c.height };
  });

/** What the canvas must show just now, worked out from the game as saved and the view the page reports. */
async function expected(page: Page, canvas: Locator): Promise<{ fingerprint: string; size: string }> {
  const saved = await page.evaluate(() => localStorage.getItem('new-world:autosave'));
  const state = loadGame(saved!).state;
  const view = JSON.parse((await canvas.getAttribute('data-view'))!) as View;
  const active = (await canvas.getAttribute('data-active')) || null;
  const made = referencePixels(state, view, { activeUnitId: active, cursor: null, blinkOn: true, waterPhase: 0, slide: null });
  return { fingerprint: fingerprint(made.rgb), size: `${made.width}x${made.height}` };
}

const quiet = async (page: Page): Promise<void> => {
  await page.addInitScript(() => localStorage.setItem('new-world:options', JSON.stringify({ tutorialHints: false, waterShimmer: false })));
};

/** One of everything: each terrain open and wooded, the features, every unit type, colonies and settlements. */
function sheet(): string {
  const rows = Array.from({ length: 12 }, (_, y) => (y === 0 || y === 11 ? '~'.repeat(16) : `~${'.'.repeat(14)}~`));
  let state: GameState = world({ rows, seed: 3, players: [{ id: 'p0', kind: 'human' }, { id: 'fr', kind: 'ai', nation: 'france' }, { id: 'sp', kind: 'ai', nation: 'spain' }, { id: 'nl', kind: 'ai', nation: 'netherlands' }] });
  const tiles = [...state.map.tiles];
  const put = (x: number, y: number, t: Parameters<typeof makeTile>[0]): void => {
    tiles[y * 16 + x] = makeTile({ ...t, explored: 0xff });
  };
  (['tundra', 'desert', 'plains', 'prairie', 'grassland', 'savannah', 'marsh', 'swamp'] as const).forEach((base, i) => {
    put(1 + i, 1, { base });
    put(1 + i, 2, { base, forest: true });
  });
  put(9, 1, { base: 'arctic' });
  put(10, 1, { base: 'plains', relief: 'hills' });
  put(11, 1, { base: 'plains', relief: 'mountains' });
  put(12, 1, { base: 'seaLane' });
  put(13, 1, { base: 'plains', rumor: true });
  put(14, 1, { base: 'grassland', resource: 'wheat' });
  put(9, 2, { base: 'plains', river: 'minor' });
  put(10, 2, { base: 'plains', river: 'major' });
  put(11, 2, { base: 'plains', road: true });
  put(12, 2, { base: 'plains', road: true });
  put(13, 2, { base: 'plains', plowed: true });
  put(14, 2, { base: 'plains', relief: 'mountains', resource: 'silverDeposit' });
  state = { ...state, map: { ...state.map, tiles } };
  const owners = ['p0', 'fr', 'sp', 'nl'];
  UNIT_TYPE_IDS.forEach((type, i) => {
    const sea = ['caravel', 'merchantman', 'galleon', 'privateer', 'frigate', 'manOWar'].includes(type);
    const native = type.endsWith('rave') || type.endsWith('Brave') || type === 'mountedWarrior';
    state = withUnit(state, { id: `u${i}`, type, owner: native ? 'tribe:sioux' : (owners[i % 4] as string), profession: null, x: 1 + (i % 12), y: sea ? 10 : 4 + Math.floor(i / 12), orders: i % 5 === 0 ? 'fortified' : 'none' });
  });
  state = withColony(state, { id: 'c1', owner: 'p0', x: 2, y: 7, name: 'A' });
  state = withColony(state, { id: 'c2', owner: 'fr', x: 4, y: 7, name: 'B', sol: { n: 60, d: 100 }, colonists: Array.from({ length: 12 }, (_, i) => ({ id: `k${i}`, profession: 'freeColonist' as const, job: { kind: 'idle' as const }, turns: 0 })) });
  const village = (id: string, tribe: Settlement['tribe'], x: number, capital: boolean, alarm: number): Settlement =>
    ({ id, tribe, x, y: 7, capital, population: 3, growth: 0, taught: false, tributePaid: false, alarm: { p0: alarm }, mission: null, scouted: [], lastBought: null, lastSold: null, haggleMemory: null });
  const sioux = state.tribes.sioux!;
  state = { ...state, tribes: { sioux, aztec: sioux, inca: sioux, arawak: sioux }, settlements: { a: village('a', 'sioux', 6, false, 0), b: village('b', 'arawak', 8, true, 0), c: village('c', 'aztec', 10, false, 90), d: village('d', 'inca', 12, true, 0) } };
  return saveGame({ options: { seed: 3 }, log: [], state });
}

test('every pixel of the map is one of the 32 palette colours, at every zoom; baselines for each', async ({ page }) => {
  await quiet(page);
  await page.goto('/?seed=11&reveal&still');
  await page.getByRole('menuitem', { name: 'Start a Game in America' }).click();
  const canvas = page.locator('canvas.map');
  await expect(canvas).toHaveAttribute('data-view', /"zoom":3/);
  const palette = new Set<string>(ART_COLORS);
  const baselines: Record<string, string> = {};
  for (const zoom of [3, 2, 1, 0]) {
    await expect(canvas).toHaveAttribute('data-view', new RegExp(`"zoom":${zoom}`));
    await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    const seen = await survey(canvas);
    expect(seen.colours.filter((c) => !palette.has(c)), `zoom ${zoom}`).toEqual([]);
    // terrain is readable: a good many of the palette's colours are in use, not a smear of two or three
    expect(seen.colours.length, `zoom ${zoom}`).toBeGreaterThanOrEqual(zoom === 0 ? 8 : 12);
    // the browser shows exactly what the art says it should, pixel for pixel
    const want = await expected(page, canvas);
    expect(`${seen.width}x${seen.height} ${seen.fingerprint}`, `zoom ${zoom}`).toBe(`${want.size} ${want.fingerprint}`);
    baselines[`zoom${zoom}`] = `${want.size} ${want.fingerprint}`;
    await page.screenshot({ path: `test-results/visual-zoom${zoom}.png` });
    await page.keyboard.press('x');
  }
  expect(JSON.stringify(baselines, null, 2)).toMatchSnapshot('map-baselines.json');
});

test('the unexplored map is an explorer\'s chart in the same palette, at every zoom; baselines for each', async ({ page }) => {
  await quiet(page);
  await page.goto('/?seed=11&still');
  await page.getByRole('menuitem', { name: 'Start a Game in America' }).click();
  const canvas = page.locator('canvas.map');
  await expect(canvas).toHaveAttribute('data-view', /"zoom":3/);
  const palette = new Set<string>(ART_COLORS);
  const baselines: Record<string, string> = {};
  for (const zoom of [3, 2, 1, 0]) {
    await expect(canvas).toHaveAttribute('data-view', new RegExp(`"zoom":${zoom}`));
    await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    const seen = await survey(canvas);
    // nothing blended or off the palette (that the chart itself is in six of the 32 map colours alone is a unit test)
    expect(seen.colours.filter((c) => !palette.has(c)), `zoom ${zoom}`).toEqual([]);
    for (const ink of [INK.parchment, INK.wood]) expect(seen.colours, `zoom ${zoom}`).toContain(PALETTE[ink]);
    // the whole map is in view at the two smallest zooms, and with it the dark beyond its edges and the inked marks
    if (zoom < 2) for (const ink of [INK.void, INK.ink, INK.sand, INK.earth]) expect(seen.colours, `zoom ${zoom}`).toContain(PALETTE[ink]);
    const want = await expected(page, canvas);
    expect(`${seen.width}x${seen.height} ${seen.fingerprint}`, `zoom ${zoom}`).toBe(`${want.size} ${want.fingerprint}`);
    baselines[`zoom${zoom}`] = `${want.size} ${want.fingerprint}`;
    await page.screenshot({ path: `test-results/visual-chart-zoom${zoom}.png` });
    await page.keyboard.press('x');
  }
  expect(JSON.stringify(baselines, null, 2)).toMatchSnapshot('chart-baselines.json');
});

test('one of everything: terrain, features, every unit type, colonies and settlements', async ({ page }) => {
  await quiet(page);
  await page.addInitScript((text) => localStorage.setItem('new-world:autosave', text), sheet());
  await page.goto('/?reveal&still');
  await page.getByRole('menuitem', { name: 'Load Game' }).click();
  const canvas = page.locator('canvas.map');
  await expect(canvas).toHaveAttribute('data-view', /"zoom":3/);
  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
  const seen = await survey(canvas);
  const palette = new Set<string>(ART_COLORS);
  expect(seen.colours.filter((c) => !palette.has(c))).toEqual([]);
  expect(seen.colours.length).toBeGreaterThanOrEqual(26); // nearly the whole palette is on show
  const want = await expected(page, canvas);
  expect(`${seen.width}x${seen.height} ${seen.fingerprint}`).toBe(`${want.size} ${want.fingerprint}`);
  expect(`${want.size} ${want.fingerprint}`).toMatchSnapshot('sheet-baseline.txt');
  await page.screenshot({ path: 'test-results/visual-sheet.png' });
});

test('the active unit\'s frame blinks, the sea shimmers if asked to, and neither happens with ?still', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('new-world:options', JSON.stringify({ tutorialHints: false })));
  await page.goto('/?seed=11');
  await page.getByRole('menuitem', { name: 'Start a Game in New World' }).click();
  const canvas = page.locator('canvas.map');
  await expect(canvas).toHaveAttribute('data-ticks', /\d+/); // animation redraws are counted apart from the game's own
  const prints = new Set<string>();
  for (let i = 0; i < 12; i++) {
    prints.add((await survey(canvas)).fingerprint);
    await page.waitForTimeout(160);
  }
  expect(prints.size).toBeGreaterThanOrEqual(2);

  await page.goto('/?seed=11&still');
  await page.getByRole('menuitem', { name: 'Start a Game in New World' }).click();
  await expect(canvas).toHaveAttribute('data-frames', /\d+/);
  const before = (await survey(canvas)).fingerprint;
  await page.waitForTimeout(1200);
  expect((await survey(canvas)).fingerprint).toBe(before);
  expect(await canvas.getAttribute('data-ticks')).toBeNull();
});
