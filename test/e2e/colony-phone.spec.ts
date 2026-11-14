import { expect, test, type Locator, type Page } from '@playwright/test';
import { BUILDING_CHAINS } from '../../src/engine/data/buildings';
import { STARTING_BUILDINGS } from '../../src/engine/data/colony';
import { saveGame } from '../../src/engine/save';
import type { Colonist, GameState } from '../../src/engine/state';
import { withColony, withUnit, world } from '../helpers/world';
import { field } from './helpers';
import { POSTURES, SMALL_POSTURES, tap } from './postures';

// The colony screen at phone sizes (R-1074, docs/specs/phone-play.md W4).

/** The squares around the colony are never drawn wider than in the full layout at 1280 x 800 (the desktop box snapshot). */
const AREA_GRID_TODAY = 272;
const TAP = 44;

const who = (id: string, job: Colonist['job'], profession: Colonist['profession'] = 'freeColonist'): Colonist => ({ id, profession, job, turns: 0 });

/** A colony as one has it a few years in: the founding buildings and a Custom House, a few people, a ship in port with cargo. */
function smallColony(): GameState {
  const rows = Array.from({ length: 14 }, (_, y) => (y === 0 || y === 13 ? '~'.repeat(20) : `~~${'.f.g'.repeat(4)}~~`));
  let state = world({ rows, seed: 5, players: [{ id: 'p0', kind: 'human', nation: 'england' }] });
  state = withColony(state, {
    id: 'james', owner: 'p0', x: 2, y: 5, name: 'Jamestown', buildings: [...STARTING_BUILDINGS, 'customHouse'],
    goods: { food: 60, furs: 40, lumber: 30, tools: 20 },
    colonists: [who('a', { kind: 'field', dx: 1, dy: 0, good: 'food' }), who('b', { kind: 'work', trade: 'carpenter' }), who('c', { kind: 'work', trade: 'statesman' }), who('d', { kind: 'idle' })],
  });
  state = withUnit(state, { id: 'ship', owner: 'p0', type: 'caravel', profession: null, x: 2, y: 5, cargo: { furs: 100 } });
  return withUnit(state, { id: 'pass', owner: 'p0', x: 2, y: 5, aboard: 'ship' });
}

/** A colony with every chain at its last link and a crowd at work: the longest the sheet gets. */
function largeColony(): GameState {
  let state = smallColony();
  const top = Object.values(BUILDING_CHAINS).map((chain) => chain[chain.length - 1] as string);
  state = withColony(state, {
    id: 'james', owner: 'p0', x: 2, y: 5, name: 'New Amsterdam', buildings: top as never,
    goods: { food: 180, sugar: 40, tobacco: 95, cotton: 12, furs: 230, lumber: 64, ore: 31, silver: 8, horses: 26, rum: 77, cigars: 140, cloth: 55, coats: 9, tradeGoods: 20, tools: 120, muskets: 50 },
    colonists: [
      who('a', { kind: 'field', dx: 1, dy: -1, good: 'food' }, 'expertFarmer'), who('b', { kind: 'field', dx: 1, dy: 0, good: 'lumber' }, 'expertLumberjack'),
      who('e', { kind: 'work', trade: 'weaver' }, 'masterWeaver'), who('f', { kind: 'work', trade: 'weaver' }), who('g', { kind: 'work', trade: 'weaver' }),
      who('h', { kind: 'work', trade: 'statesman' }, 'elderStatesman'), who('l', { kind: 'work', trade: 'carpenter' }), who('q', { kind: 'idle' }),
    ],
  });
  return withUnit(state, { id: 'wagon', owner: 'p0', type: 'wagonTrain', profession: null, x: 2, y: 5, cargo: { cloth: 100 } });
}

async function openColony(page: Page, state: GameState, name: string): Promise<Locator> {
  await page.addInitScript((text) => localStorage.setItem('new-world:autosave', text), saveGame({ options: { seed: 5 }, log: [], state }));
  await page.goto('/');
  await page.getByRole('menuitem', { name: 'Load Game' }).click();
  await expect(field(page, 'unit')).not.toHaveText('');
  await page.keyboard.press('v');
  await page.keyboard.press('Enter');
  const screen = page.locator('.colony-screen');
  await expect(screen.getByRole('heading', { name })).toBeVisible();
  return screen;
}

interface Box { readonly name: string; readonly left: number; readonly right: number; readonly top: number; readonly bottom: number }
interface Sheet {
  /** The regions, in the sheet's own coordinates (as if it were not scrolled). */
  readonly regions: Box[];
  readonly header: Box;
  readonly exit: Box;
  readonly scrollWidth: number;
  readonly clientWidth: number;
  readonly clientHeight: number;
  readonly scrollHeight: number;
  /** Regions whose contents run out of their box, which would leave them cut off or lying over another. */
  readonly spills: string[];
}

const REGIONS = ['settlement', 'area', 'people', 'transport', 'multi', 'warehouse'] as const;

/** Where everything lies on the sheet. */
function measure(screen: Locator): Promise<Sheet> {
  return screen.evaluate((root, regions) => {
    const at = root.getBoundingClientRect();
    const box = (name: string, node: Element | null): Box => {
      if (!node) throw new Error(`no ${name}`);
      const r = node.getBoundingClientRect();
      return { name, left: r.left - at.left, right: r.right - at.left, top: r.top - at.top + root.scrollTop, bottom: r.bottom - at.top + root.scrollTop };
    };
    const help = [...root.querySelectorAll('.colony-message, .colony-help')].find((n) => getComputedStyle(n).display !== 'none') ?? null;
    return {
      regions: [...regions.map((name) => box(name, root.querySelector(`[data-region="${name}"]`))), box('help', help)],
      header: box('header', root.querySelector('.colony-header')),
      exit: box('exit', root.querySelector('.colony-commands')),
      spills: [...root.querySelectorAll<HTMLElement>('[data-region]')].filter((n) => {
        const r = n.getBoundingClientRect();
        const out = [...n.querySelectorAll('*')].some((c) => {
          const b = c.getBoundingClientRect();
          return c.getClientRects().length > 0 && (b.bottom > r.bottom + 1 || b.right > r.right + 1 || b.left < r.left - 1 || b.top < r.top - 1);
        });
        return out || n.scrollHeight > n.clientHeight + 1 || n.scrollWidth > n.clientWidth + 1;
      }).map((n) => n.dataset['region'] ?? ''),
      scrollWidth: root.scrollWidth, clientWidth: root.clientWidth, clientHeight: root.clientHeight, scrollHeight: root.scrollHeight,
    };
  }, REGIONS as unknown as string[]);
}

const overlap = (a: Box, b: Box): boolean => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;

/** The header and the way out lie wholly in the window, and over whatever is beneath them, wherever the sheet is scrolled to. */
async function expectBarsInWindow(screen: Locator, viewport: { width: number; height: number }): Promise<void> {
  const most = await screen.evaluate((root) => root.scrollHeight - root.clientHeight);
  for (const top of [0, Math.round(most / 2), most]) {
    await screen.evaluate((root, y) => { root.scrollTop = y; }, top);
    for (const selector of ['.colony-header', '.colony-commands']) {
      const bar = screen.locator(selector);
      const box = (await bar.boundingBox())!;
      expect(box.x, `${selector} at ${top}`).toBeGreaterThanOrEqual(0);
      expect(box.y, `${selector} at ${top}`).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, `${selector} at ${top}`).toBeLessThanOrEqual(viewport.width + 0.5);
      expect(box.y + box.height, `${selector} at ${top}`).toBeLessThanOrEqual(viewport.height + 0.5);
      const onTop = await bar.evaluate((node) => {
        const r = node.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + 3, r.top + r.height / 2);
        return hit !== null && node.contains(hit);
      });
      expect(onTop, `${selector} lies over the sheet at ${top}`).toBe(true);
    }
  }
}

/** Every region can be brought wholly into sight between the header and the way out, and the sheet never runs sideways. */
async function expectRegionsReachable(page: Page, screen: Locator, viewport: { width: number; height: number }): Promise<Sheet> {
  const sheet = await measure(screen);
  expect(sheet.scrollWidth, 'the sheet runs no wider than the window').toBeLessThanOrEqual(sheet.clientWidth);
  expect(sheet.spills, 'regions whose contents run out of them').toEqual([]);
  const doc = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight }));
  expect(doc.w).toBeLessThanOrEqual(viewport.width);
  expect(doc.h).toBeLessThanOrEqual(viewport.height);
  for (const [i, a] of sheet.regions.entries()) {
    expect(a.left, `${a.name} left`).toBeGreaterThanOrEqual(0);
    expect(a.right, `${a.name} right`).toBeLessThanOrEqual(sheet.clientWidth + 0.5);
    for (const b of sheet.regions.slice(i + 1)) expect(overlap(a, b), `${a.name} and ${b.name} overlap`).toBe(false);
  }
  const headerHeight = sheet.header.bottom - sheet.header.top;
  const exitHeight = sheet.exit.bottom - sheet.exit.top;
  for (const region of sheet.regions) {
    const node = region.name === 'help' ? screen.locator('.colony-message:not(:empty), .colony-message:empty + .colony-help').first() : screen.locator(`[data-region="${region.name}"]`);
    // its head brought down to just under the header, then its foot up to just over the way out
    await screen.evaluate((root, y) => { root.scrollTop = y; }, region.top - headerHeight);
    const top = (await node.boundingBox())!;
    expect(top.y, `${region.name}'s head can be seen`).toBeGreaterThanOrEqual(headerHeight - 1);
    await screen.evaluate((root, y) => { root.scrollTop = y; }, region.bottom - (sheet.clientHeight - exitHeight));
    const foot = (await node.boundingBox())!;
    expect(foot.y + foot.height, `${region.name}'s foot can be seen`).toBeLessThanOrEqual(viewport.height - exitHeight + 1);
  }
  return sheet;
}

/** The squares and the buildings' pictures fit their region, and are no larger than in the full layout. */
async function expectPicturesFit(screen: Locator): Promise<void> {
  const fit = await screen.evaluate((root) => {
    const inside = (node: Element, outer: Element): boolean => {
      const a = node.getBoundingClientRect();
      const b = outer.getBoundingClientRect();
      return a.left >= b.left - 0.5 && a.right <= b.right + 0.5;
    };
    const area = root.querySelector('[data-region="area"]')!;
    const grid = root.querySelector('.area-grid')!;
    const settlement = root.querySelector('[data-region="settlement"]')!;
    return {
      grid: grid.getBoundingClientRect().width,
      gridInside: inside(grid, area),
      squaresInside: [...root.querySelectorAll('.square')].every((s) => inside(s, area)),
      art: [...root.querySelectorAll<HTMLCanvasElement>('.building-art')].map((art) => ({
        shown: art.getBoundingClientRect().width,
        drawn: parseFloat(art.style.width),
        square: Math.abs(art.getBoundingClientRect().width / art.getBoundingClientRect().height - art.width / art.height) < 0.05,
        inside: inside(art, art.closest('.building')!) && inside(art, settlement),
      })),
    };
  });
  expect(fit.grid).toBeLessThanOrEqual(AREA_GRID_TODAY + 0.5);
  expect(fit.gridInside && fit.squaresInside).toBe(true);
  for (const art of fit.art) {
    expect(art.shown).toBeLessThanOrEqual(art.drawn + 0.5);
    expect(art.square && art.inside).toBe(true);
  }
}

/** A menu the screen puts up, opened with the sheet scrolled to its foot, lies in the window and scrolls in itself. */
async function expectMenuInWindow(page: Page, screen: Locator, viewport: { width: number; height: number }, open: () => Promise<void>, text: string): Promise<void> {
  await screen.evaluate((root) => { root.scrollTop = root.scrollHeight; });
  await open();
  const menu = page.locator('.dialog').filter({ hasText: text });
  await expect(menu).toBeVisible();
  const box = (await menu.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 0.5);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 0.5);
  const scrolls = await menu.evaluate((node) => {
    if (node.scrollHeight <= node.clientHeight) return true;
    node.scrollTop = node.scrollHeight;
    return node.scrollTop > 0;
  });
  expect(scrolls, `${text} scrolls in itself`).toBe(true);
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
}

/** The sheet's layout at this size: every region in reach, the bars in the window, the pictures fitted, the column or the two side by side. */
async function expectReflowed(page: Page, screen: Locator, viewport: { width: number; height: number }): Promise<void> {
  await expect(page.locator('html')).toHaveAttribute('data-layout', 'compact');
  const sheet = await expectRegionsReachable(page, screen, viewport);
  await expectBarsInWindow(screen, viewport);
  await expectPicturesFit(screen);
  const at = Object.fromEntries(sheet.regions.map((r) => [r.name, r]));
  if (viewport.height > viewport.width) {
    // one column, the regions one under another
    for (const r of sheet.regions) {
      expect(Math.abs(r.left - at['settlement']!.left), `${r.name} in the column`).toBeLessThanOrEqual(1);
      expect(Math.abs(r.right - at['settlement']!.right), `${r.name} in the column`).toBeLessThanOrEqual(1);
    }
  } else {
    const settlement = at['settlement']!;
    const area = at['area']!;
    expect(Math.abs(settlement.top - area.top), 'settlement and squares side by side').toBeLessThanOrEqual(1);
    expect(area.left).toBeGreaterThanOrEqual(settlement.right - 1);
    const exitHeight = sheet.exit.bottom - sheet.exit.top;
    expect(at['warehouse']!.bottom - (sheet.clientHeight - exitHeight), 'the warehouse within one window of scrolling').toBeLessThanOrEqual(sheet.clientHeight);
  }
}

/** The jobs menu, the construction menu and the Custom House's exports. */
async function expectMenusInWindow(page: Page, screen: Locator, viewport: { width: number; height: number }): Promise<void> {
  await expectMenuInWindow(page, screen, viewport, async () => {
    await screen.locator('[data-region="people"] .token-colonist').first().focus();
    await page.keyboard.press('Enter');
  }, 'Choose work');
  await expectMenuInWindow(page, screen, viewport, () => page.keyboard.press('c'), 'What shall the colony build?');
  await expectMenuInWindow(page, screen, viewport, () => page.keyboard.press('x'), 'Which goods shall the Custom House export?');
}

for (const [set, sizes] of [['', POSTURES], ['40 px smaller, ', SMALL_POSTURES]] as const) {
  for (const [name, viewport] of Object.entries(sizes)) {
    test.describe(`${set}${name} (${viewport.width} x ${viewport.height})`, () => {
      test.use({ viewport, hasTouch: true });

      test('under a finger the colony screen reflows, everything to tap is a finger high, and the menus lie inside the window', async ({ page }) => {
        const screen = await openColony(page, smallColony(), 'Jamestown');
        await tap(page, screen.locator('.colony-header h2'));
        await expect(page.locator('html')).toHaveAttribute('data-pointer', 'coarse');
        await expectReflowed(page, screen, viewport);

        // under a finger: everything to tap is a finger high, and the warehouse shows all sixteen goods, legibly
        const short = await screen.evaluate((root, tapAt) => [...root.querySelectorAll('button, .token, .building, .square')]
          .filter((n) => n.getClientRects().length > 0 && n.getBoundingClientRect().height < tapAt - 0.5)
          .map((n) => `${n.className || n.tagName} "${n.textContent}" ${n.getBoundingClientRect().height}`), TAP);
        expect(short).toEqual([]);
        const goods = screen.locator('[data-region="warehouse"] .token-good');
        await expect(goods).toHaveCount(16);
        const counts = await goods.evaluateAll((nodes) => nodes.map((n) => {
          const sub = n.querySelector('.token-sub')!;
          return { text: sub.textContent, size: parseFloat(getComputedStyle(sub).fontSize), shown: sub.getClientRects().length > 0 };
        }));
        for (const count of counts) {
          expect(count.shown && count.text !== '').toBe(true);
          expect(count.size).toBeGreaterThanOrEqual(11);
        }

        await expectMenusInWindow(page, screen, viewport);

        if ((name === 'duoCoverUpright' || name === 'phoneSideways') && set === '') {
          await screen.evaluate((root) => { root.scrollTop = 0; });
          await page.screenshot({ path: `test-results/colony-${name}.png` });
        }
      });

      test('the largest colony still fits the window across and keeps every region in reach', async ({ page }) => {
        const screen = await openColony(page, largeColony(), 'New Amsterdam');
        await tap(page, screen.locator('.colony-header h2'));
        await expect(page.locator('html')).toHaveAttribute('data-pointer', 'coarse');
        await expectRegionsReachable(page, screen, viewport);
        await expectBarsInWindow(screen, viewport);
        await expectPicturesFit(screen);
      });

      test.describe('with a mouse', () => {
        test.use({ hasTouch: false });

        test('the colony screen reflows the same way, and the menus lie inside the window', async ({ page }) => {
          const screen = await openColony(page, smallColony(), 'Jamestown');
          await expect(page.locator('html')).toHaveAttribute('data-pointer', 'fine');
          await expectReflowed(page, screen, viewport);
          await expectMenusInWindow(page, screen, viewport);
        });
      });
    });
  }
}

test.describe('a long sheet, upright', () => {
  test.use({ viewport: POSTURES.phoneUpright, hasTouch: true });

  test('a tap that redraws the sheet leaves it scrolled where it was', async ({ page }) => {
    const screen = await openColony(page, smallColony(), 'Jamestown');
    // someone in the middle of the sheet, which is scrolled so that they stand half way down the window
    const idle = screen.locator('.idle-row .token-colonist');
    await idle.evaluate((node) => node.scrollIntoView({ block: 'center' }));
    const before = await screen.evaluate((root) => root.scrollTop);
    expect(before).toBeGreaterThan(0);
    await tap(page, idle);
    await expect(idle).toHaveClass(/token-selected/);
    expect(await screen.evaluate((root) => root.scrollTop)).toBe(before);
  });
});
