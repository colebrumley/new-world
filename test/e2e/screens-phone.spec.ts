import { expect, test, type Locator, type Page } from '@playwright/test';
import { saveGame } from '../../src/engine/save';
import type { GameState, Unit } from '../../src/engine/state';
import { withColony, withUnit, world } from '../helpers/world';
import { field } from './helpers';
import { POSTURES, SMALL_POSTURES, tap, type Size } from './postures';

// Every other screen at phone sizes (R-1076, docs/specs/phone-play.md W6): the title, Customize,
// Choose a European Power, every dialog, the Europe screen, the ten reports, the encyclopedia, the
// cheat console and the end page, each inside the window, scrolling inside itself and never
// sideways, with its way out in sight wherever it is scrolled to.

/** Half a pixel either way, for boxes that land on fractions. */
const SLACK = 0.5;
const TAP = 44;

type Box = { x: number; y: number; width: number; height: number };
const boxOf = async (locator: Locator): Promise<Box> => {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`no box for ${String(locator)}`);
  return box;
};

/** Neither way can the document scroll. */
async function expectNoPageScroll(page: Page): Promise<void> {
  const sizes = await page.evaluate(() => {
    const doc = document.scrollingElement ?? document.documentElement;
    return { width: doc.scrollWidth, height: doc.scrollHeight, inner: [innerWidth, innerHeight], at: [scrollX, scrollY] };
  });
  expect(sizes.width, 'page scroll width').toBeLessThanOrEqual(sizes.inner[0]!);
  expect(sizes.height, 'page scroll height').toBeLessThanOrEqual(sizes.inner[1]!);
  expect(sizes.at, 'page scrolled').toEqual([0, 0]);
}

function expectInside(box: Box, frame: Box, what: string): void {
  expect(box.x, `${what}: left`).toBeGreaterThanOrEqual(frame.x - SLACK);
  expect(box.y, `${what}: top`).toBeGreaterThanOrEqual(frame.y - SLACK);
  expect(box.x + box.width, `${what}: right`).toBeLessThanOrEqual(frame.x + frame.width + SLACK);
  expect(box.y + box.height, `${what}: bottom`).toBeLessThanOrEqual(frame.y + frame.height + SLACK);
}

const windowBox = (viewport: Size): Box => ({ x: 0, y: 0, width: viewport.width, height: viewport.height });

/**
 * The surface lies inside the window, never scrolls sideways, scrolls inside itself when it is
 * taller than the window, has no minimum width wider than the window, and its way out (if given)
 * stays inside the window and inside the surface at its top, its middle and its foot.
 */
async function expectFits(page: Page, viewport: Size, surface: Locator, what: string, leave?: Locator): Promise<void> {
  await expect(surface).toBeVisible();
  await expectNoPageScroll(page);
  const frame = await boxOf(surface);
  expectInside(frame, windowBox(viewport), what);
  const shape = await surface.evaluate((node) => {
    const style = getComputedStyle(node);
    return { scrollWidth: node.scrollWidth, clientWidth: node.clientWidth, scrollHeight: node.scrollHeight, clientHeight: node.clientHeight, overflowY: style.overflowY, minWidth: parseFloat(style.minWidth) || 0 };
  });
  expect(shape.scrollWidth, `${what}: scrolls sideways`).toBeLessThanOrEqual(shape.clientWidth + 1);
  if (shape.scrollHeight > shape.clientHeight + 1) expect(['auto', 'scroll'], `${what}: taller than it is, and cannot scroll`).toContain(shape.overflowY);
  expect(shape.minWidth, `${what}: min-width`).toBeLessThanOrEqual(viewport.width);
  if (!leave) return;
  for (const at of [0, 0.5, 1]) {
    await surface.evaluate((node, t) => {
      node.scrollTop = (node.scrollHeight - node.clientHeight) * t;
    }, at);
    const way = await boxOf(leave);
    expectInside(way, windowBox(viewport), `${what}: its way out, scrolled to ${at}`);
    expectInside(way, await boxOf(surface), `${what}: its way out, scrolled to ${at}, inside it`);
  }
  await surface.evaluate((node) => {
    node.scrollTop = 0;
  });
}

/** Under a finger, every button the surface shows is a finger high. */
async function expectFingerHigh(surface: Locator, what: string): Promise<void> {
  const heights = await surface.locator('button:visible, select:visible, .option:visible').evaluateAll((nodes) =>
    nodes.map((node) => ({ name: (node.getAttribute('aria-label') ?? node.textContent ?? '').trim().slice(0, 30), height: node.getBoundingClientRect().height })),
  );
  expect(heights.length, `${what}: has choices`).toBeGreaterThan(0);
  for (const { name, height } of heights) expect(height, `${what}: "${name}" height`).toBeGreaterThanOrEqual(TAP - SLACK);
}

/** The dialog's cross: a finger square at its top right. */
async function expectCross(dialog: Locator, what: string): Promise<Locator> {
  const cross = dialog.locator('> .dialog-close');
  await expect(cross, `${what}: its cross`).toBeVisible();
  const box = await boxOf(cross);
  const frame = await boxOf(dialog);
  expect(box.width, `${what}: cross width`).toBeGreaterThanOrEqual(TAP - SLACK);
  expect(box.height, `${what}: cross height`).toBeGreaterThanOrEqual(TAP - SLACK);
  expect(frame.x + frame.width - (box.x + box.width), `${what}: cross off the right edge`).toBeLessThanOrEqual(8);
  expect(box.y - frame.y, `${what}: cross off the top`).toBeLessThanOrEqual(8);
  return cross;
}

/** Every text field the surface shows is set at 16px or more. */
async function expectLargeFields(surface: Locator, what: string): Promise<void> {
  const sizes = await surface.locator('input[type="text"]:visible, select:visible, textarea:visible').evaluateAll((nodes) => nodes.map((node) => parseFloat(getComputedStyle(node).fontSize)));
  for (const size of sizes) expect(size, `${what}: a field's text`).toBeGreaterThanOrEqual(16);
}

/** A tap on the veil round a dialog leaves it up. */
async function expectVeilDoesNothing(page: Page, dialog: Locator, what: string): Promise<void> {
  await tap(page, { x: 3, y: 3 });
  await expect(dialog, `${what}: still up after a tap on the veil`).toBeVisible();
}

/** A modal dialog over the map or a screen: fits, is a finger high, and has its cross; closed by the cross. */
async function checkDialog(page: Page, viewport: Size, dialog: Locator, what: string, { leave, close = 'cross' }: { leave?: Locator; close?: 'cross' | 'none' } = {}): Promise<void> {
  await expectFits(page, viewport, dialog, what, leave);
  await expectFingerHigh(dialog, what);
  await expectLargeFields(dialog, what);
  if (close === 'none') return;
  const cross = await expectCross(dialog, what);
  await expectVeilDoesNothing(page, dialog, what);
  await tap(page, cross);
  await expect(dialog, `${what}: closed by its cross`).toHaveCount(0);
}

/** A small prepared game: our veteran dragoon beside a lone foreign soldier, as test/e2e/combat.spec.ts sets it. */
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

const REPORT_KEYS = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10'] as const;

for (const [set, sizes] of [['', POSTURES], ['40 px smaller, ', SMALL_POSTURES]] as const) {
  for (const [name, viewport] of Object.entries(sizes)) {
    test.describe(`${set}${name} (${viewport.width} x ${viewport.height})`, () => {
      test.use({ viewport, hasTouch: true });

      test('the title, Customize and Choose a European Power fit, and their ways out stay in sight', async ({ page }) => {
        await page.goto('/?seed=11');
        await expect(page.locator('html')).toHaveAttribute('data-layout', 'compact');
        await expect(page.locator('html')).toHaveAttribute('data-pointer', 'coarse');
        const title = page.locator('.title-screen .cartouche');
        await expectFits(page, viewport, title, 'the title screen');
        // the menu is all inside the window, or scrolls to it
        for (const item of await page.getByRole('menuitem').all()) {
          await item.scrollIntoViewIfNeeded();
          expectInside(await boxOf(item), windowBox(viewport), `title menu: ${await item.textContent()}`);
        }
        await expectFingerHigh(title, 'the title screen');
        await expectLargeFields(title, 'the title screen');

        await tap(page, page.getByRole('menuitem', { name: 'Customize New World' }));
        const customize = page.locator('.customize .cartouche');
        await expectFits(page, viewport, customize, 'Customize', customize.getByRole('button', { name: 'Cancel' }));
        await expectFingerHigh(customize, 'Customize');
        await tap(page, customize.getByRole('button', { name: 'Start' }));

        const power = page.locator('.power .cartouche');
        await expect(power.getByRole('radiogroup')).toBeVisible();
        await expectFits(page, viewport, power, 'Choose a European Power', power.getByRole('button', { name: 'Back' }));
        await expectFingerHigh(power, 'Choose a European Power');
        await expectLargeFields(power, 'Choose a European Power');
        // the name field, taking the focus, is in sight
        const name = power.getByLabel('Your name');
        await power.evaluate((node) => {
          node.scrollTop = 0;
        });
        await name.focus();
        expectInside(await boxOf(name), windowBox(viewport), 'the name field, focused');
        await tap(page, power.getByRole('button', { name: 'Back' }));
        await expect(page.locator('.customize')).toBeVisible();
      });

      test('every dialog, the Europe screen, the reports, the encyclopedia, the cheats and the end page fit', async ({ page }) => {
        test.slow();
        await page.goto('/?seed=11&difficulty=discoverer');
        await tap(page, page.getByRole('menuitem', { name: 'Start a Game in New World' }));
        await tap(page, page.locator('.power').getByRole('button', { name: 'Set Sail' }));
        const audience = page.locator('.dialog').filter({ hasText: 'An audience with' });
        await checkDialog(page, viewport, audience, 'the audience', { close: 'none' });
        await tap(page, audience.getByRole('button', { name: 'So be it' }));
        await expect(page.locator('canvas.map')).toHaveAttribute('data-frames', /\d+/);
        await expect(field(page, 'unit')).toHaveText('Caravel');
        await page.locator('canvas.map').focus();

        // a question
        await page.keyboard.press('ArrowRight');
        const question = page.locator('.dialog').filter({ hasText: 'Shall we set course for Europe?' });
        await checkDialog(page, viewport, question, 'a question');
        await page.keyboard.press('ArrowRight');
        await page.getByRole('button', { name: 'Yes, make for Europe' }).click();
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await page.keyboard.press('Enter');
        await page.keyboard.press('Enter');
        await expect(page.locator('.command-bar [data-command="europe"]')).toHaveAttribute('data-europe', 'port');

        // the Europe screen, and a menu and a text prompt over it
        await page.keyboard.press('e');
        const europe = page.getByRole('dialog', { name: 'Europe' });
        const leave = europe.getByRole('button', { name: 'Leave (Esc)' });
        await expectFits(page, viewport, europe, 'the Europe screen', leave);
        await expectFingerHigh(europe, 'the Europe screen');
        await tap(page, europe.getByRole('button', { name: /^Recruit/ }));
        const menu = page.locator('.dialog').filter({ hasText: 'Whose passage will you pay?' });
        await checkDialog(page, viewport, menu, 'a menu');
        // the passengers ashore, so that there is room to buy into
        const harbor = europe.getByRole('group', { name: 'In port' });
        await tap(page, harbor.getByRole('button', { name: 'Veteran Soldier' }));
        await tap(page, harbor.getByRole('button', { name: 'Pioneer' }));
        await expect(harbor).toContainText('Caravel (0/2 holds)');
        await europe.locator('[data-good="tools"]').focus();
        await page.keyboard.press('+');
        const prompt = page.locator('.dialog').filter({ hasText: 'Buy how many tools?' });
        await expectFits(page, viewport, prompt, 'a text prompt');
        expectInside(await boxOf(prompt.getByRole('textbox')), windowBox(viewport), 'the prompt\'s field');
        await checkDialog(page, viewport, prompt, 'a text prompt');
        await tap(page, leave);
        await expect(europe).toHaveCount(0);
        await page.locator('canvas.map').focus();

        // the options, the sound, the colony report options, save and load, the trade menu
        for (const [key, label, done] of [
          ['Alt+g', 'Game Options', 'Done (Esc)'],
          ['Alt+s', 'Sound', 'Done (Esc)'],
          ['Alt+o', 'Colony Report Options', 'Done (Esc)'],
          ['Alt+l', 'Save or Load Game', 'Close (Esc)'],
        ] as const) {
          await page.keyboard.press(key);
          const dialog = page.locator('.dialog[role="dialog"]').last();
          await expect(dialog).toContainText(label);
          await checkDialog(page, viewport, dialog, label, { leave: dialog.getByRole('button', { name: done }) });
          await page.locator('canvas.map').focus();
        }
        // each option's hint is a line under its label
        await page.keyboard.press('Alt+g');
        const options = page.getByRole('dialog', { name: 'Game Options' });
        const hints = options.locator('.option-hint');
        expect(await hints.count()).toBeGreaterThan(0);
        for (const hint of await hints.all()) {
          await expect(hint).toBeVisible();
          const line = hint.locator('xpath=..');
          const words = await boxOf(line);
          const under = await boxOf(hint);
          expect(under.y, 'the hint lies under the label').toBeGreaterThan(words.y + 4);
        }
        await page.keyboard.press('Escape');
        await expect(options).toHaveCount(0);

        // the cheat console
        await page.locator('canvas.map').focus();
        await page.keyboard.press('Alt+c');
        const cheats = page.getByRole('dialog', { name: 'Cheats' });
        await cheats.locator('summary').click();
        await expectLargeFields(cheats, 'the cheats');
        await checkDialog(page, viewport, cheats, 'the cheats', { leave: cheats.getByRole('button', { name: 'Done (Esc)' }) });

        // the encyclopedia
        await page.locator('canvas.map').focus();
        await page.keyboard.press('Alt+p');
        const pedia = page.getByRole('dialog', { name: 'Encyclopedia' });
        await expectFits(page, viewport, pedia, 'the encyclopedia', pedia.getByRole('button', { name: 'Close (Esc)' }));
        for (const part of ['.pedia-index', '.pedia-page']) {
          const box = await boxOf(pedia.locator(part));
          expectInside(box, windowBox(viewport), `the encyclopedia's ${part}`);
          expect(box.width, `the encyclopedia's ${part} is wide enough to read`).toBeGreaterThan(120);
          expect(box.height, `the encyclopedia's ${part} is tall enough to read`).toBeGreaterThan(80);
        }
        await tap(page, await expectCross(pedia, 'the encyclopedia'));
        await expect(pedia).toHaveCount(0);

        // the ten reports
        for (const key of REPORT_KEYS) {
          await page.locator('canvas.map').focus();
          await page.keyboard.press(key);
          const report = page.locator('.report-screen');
          await expect(report).toHaveCount(1);
          const what = `the report on ${key}`;
          await expectFits(page, viewport, report, what, report.getByRole('button', { name: 'Close (Esc)' }));
          // a table wider than its section scrolls inside the section
          const sections = await report.locator('.report-section').evaluateAll((nodes) =>
            nodes.map((node) => ({ name: node.getAttribute('aria-label'), wide: (node.querySelector('table')?.scrollWidth ?? 0) > node.clientWidth + 1, overflow: getComputedStyle(node).overflowX })),
          );
          for (const s of sections) if (s.wide) expect(['auto', 'scroll'], `${what}: ${s.name} is wide and cannot scroll`).toContain(s.overflow);
          await tap(page, await expectCross(report, what));
          await expect(report).toHaveCount(0);
        }

        // the end page, after the question that asks first
        await page.locator('canvas.map').focus();
        await page.keyboard.press('Shift+R');
        const retire = page.locator('.dialog').filter({ hasText: 'Retire as Viceroy now?' });
        await expectFits(page, viewport, retire, 'the question before retiring');
        await retire.getByRole('button', { name: 'Yes, retire' }).click();
        const end = page.locator('.end-page');
        await expectFits(page, viewport, end, 'the end page', end.locator('.end-choices'));
        await expectFingerHigh(end.locator('.end-choices'), 'the end page');
      });

      test('the combat analysis fits, and its cross holds', async ({ page }) => {
        const save = skirmish();
        await page.addInitScript((text) => {
          if (!sessionStorage.getItem('seeded')) {
            localStorage.setItem('new-world:autosave', text);
            sessionStorage.setItem('seeded', '1');
          }
        }, save);
        await page.goto('/');
        await tap(page, page.getByRole('menuitem', { name: 'Load Game' }));
        await expect(field(page, 'unit')).toHaveText('Dragoon');
        await page.locator('canvas.map').focus();
        await page.keyboard.press('ArrowRight');
        const analysis = page.getByRole('dialog', { name: 'Combat Analysis' });
        await checkDialog(page, viewport, analysis, 'the combat analysis');
        // the cross held, as Esc does: nothing happened, and no fight is in the log
        await expect(field(page, 'location')).toHaveText('(5, 5)');
        await expect(page.locator('[data-field="log"] li:not(.hint)')).toHaveCount(0);
        await expect(page.locator('[data-field="combat-result"]')).toHaveCount(0);
      });
    });
  }
}

/** A colony with furs in store, a full treasury, and the turn before the Crown's tax comes round: ending it raises the tax. */
function eveOfTax(): string {
  const rows = Array.from({ length: 12 }, (_, y) => (y === 0 || y === 11 ? '~'.repeat(16) : `~${'.'.repeat(14)}~`));
  let state: GameState = world({ rows, seed: 3, players: [{ id: 'p0', kind: 'human' }] });
  state = withColony(state, { id: 'c1', owner: 'p0', x: 1, y: 5, name: 'Jamestown', goods: { furs: 100 } });
  state = withUnit(state, { id: 'u1', owner: 'p0', type: 'soldier', x: 5, y: 5 });
  state = { ...state, turn: 35, players: state.players.map((p) => ({ ...p, gold: 100000 })) };
  return saveGame({ options: { seed: 3 }, log: [], state });
}

test.describe('a question whose every answer decides something', () => {
  test.use({ viewport: POSTURES.phoneUpright, hasTouch: true });

  test('the tax rise offers no cross: Esc pays the tax, so a finger must choose an answer', async ({ page }) => {
    await page.addInitScript((text) => {
      if (!sessionStorage.getItem('seeded')) {
        localStorage.setItem('new-world:autosave', text);
        sessionStorage.setItem('seeded', '1');
      }
    }, eveOfTax());
    await page.goto('/');
    await tap(page, page.getByRole('menuitem', { name: 'Load Game' }));
    await expect(page.locator('html')).toHaveAttribute('data-layout', 'compact');
    await expect(page.locator('html')).toHaveAttribute('data-pointer', 'coarse');
    await page.locator('canvas.map').focus();
    await page.keyboard.press('Enter');
    const tax = page.locator('.dialog').filter({ hasText: 'The Crown has raised the tax rate' });
    await expect(tax).toBeVisible();
    await expect(tax.getByRole('button')).toHaveText(['Pay the new tax', 'Hold a furs party in Jamestown']);
    await expect(tax.locator('.dialog-close')).toHaveCount(0);
  });
});

test.describe('the full layout with a mouse', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('shows no cross on a dialog and no hint under an option', async ({ page }) => {
    await page.goto('/?seed=11');
    await page.getByRole('menuitem', { name: 'Start a Game in New World' }).click();
    await page.locator('.power').getByRole('button', { name: 'Set Sail' }).click();
    await page.getByRole('button', { name: 'So be it' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-layout', 'full');
    await expect(page.locator('html')).toHaveAttribute('data-pointer', 'fine');
    await page.keyboard.press('Alt+g');
    const options = page.getByRole('dialog', { name: 'Game Options' });
    await expect(options).toBeVisible();
    await expect(options.locator('.dialog-close')).toBeHidden();
    await expect(options.getByRole('button')).toHaveText(['Done (Esc)']);
    await expect(options.locator('.option-hint').first()).toBeHidden();
    await expect(options.getByLabel('Combat analysis')).toBeVisible();
  });
});
