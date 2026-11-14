import { expect, test, type CDPSession, type Locator, type Page } from '@playwright/test';
import { BUILDING_CHAINS } from '../../src/engine/data/buildings';
import { saveGame } from '../../src/engine/save';
import { OFF_MAP, type Colonist, type GameState } from '../../src/engine/state';
import { withColony, withUnit, world } from '../helpers/world';
import { field } from './helpers';
import { POSTURES, longPress, tap as tapAt, touchDrag, type PostureName, type Where } from './postures';

// Fingers on the colony and Europe screens (R-1075, docs/specs/phone-play.md W5): a swipe scrolls,
// a hold picks a thing up, a hold let go in place looks it up, a tap is a click, and Part asks how much.

/** The middle of an element where it is now, without scrolling. */
async function spot(where: Locator): Promise<{ x: number; y: number }> {
  const box = (await where.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** A tap on an element (scrolled to the middle of the window) or a point. */
const tap = async (page: Page, where: Where): Promise<void> => tapAt(page, 'boundingBox' in where ? await middle(where) : where);

const settler = (id: string): Colonist => ({ id, profession: 'freeColonist', job: { kind: 'idle' }, turns: 0 });

/** Load a game with Jamestown (two idle settlers, furs in the warehouse, a merchantman in port with furs aboard) and open its screen. */
async function openJamestown(page: Page, colony: Partial<Parameters<typeof withColony>[1]> = {}, more: (state: GameState) => GameState = (s) => s): Promise<Locator> {
  const rows = Array.from({ length: 8 }, (_, y) => (y === 0 || y === 7 ? '~'.repeat(10) : '~~......~~'));
  let state = world({ rows, seed: 5, players: [{ id: 'p0', kind: 'human', nation: 'england' }] });
  state = withColony(state, { id: 'james', owner: 'p0', x: 2, y: 3, name: 'Jamestown', goods: { food: 50, furs: 30 }, colonists: [settler('ann'), settler('ben')], buildings: ['townHall'], ...colony });
  state = withUnit(state, { id: 'hand', owner: 'p0', x: 2, y: 3 });
  state = withUnit(state, { id: 'ship', owner: 'p0', type: 'merchantman', profession: null, x: 2, y: 3, cargo: { furs: 100 } });
  state = more(state);
  await page.addInitScript((text) => localStorage.setItem('new-world:autosave', text), saveGame({ options: { seed: 5 }, log: [], state }));
  await page.goto('/');
  await tap(page, page.getByRole('menuitem', { name: 'Load Game' }));
  await expect(page.locator('html')).toHaveAttribute('data-pointer', 'coarse');
  await expect(field(page, 'unit')).toHaveText('Free Colonist');
  await page.keyboard.press('v');
  await page.keyboard.press('Enter');
  const screen = page.locator('.colony-screen');
  await expect(screen.getByRole('heading', { name: 'Jamestown' })).toBeVisible();
  return screen;
}

/** A finger of our own, for what the shared helpers do not do: stay down, a second finger, a cancel. */
async function finger(page: Page): Promise<{ down(x: number, y: number): Promise<void>; move(x: number, y: number, steps?: number): Promise<void>; up(): Promise<void>; second(): Promise<void>; cancel(): Promise<void> }> {
  const cdp: CDPSession = await page.context().newCDPSession(page);
  let at = { x: 0, y: 0 };
  const send = (type: string, points: { x: number; y: number; id: number }[]): Promise<unknown> => cdp.send('Input.dispatchTouchEvent', { type: type as 'touchStart', touchPoints: points.map((p) => ({ ...p, radiusX: 4, radiusY: 4, force: 1 })) });
  return {
    async down(x, y) {
      at = { x, y };
      await send('touchStart', [{ x, y, id: 0 }]);
    },
    async move(x, y, steps = 8) {
      const from = at;
      for (let i = 1; i <= steps; i++) await send('touchMove', [{ x: from.x + ((x - from.x) * i) / steps, y: from.y + ((y - from.y) * i) / steps, id: 0 }]);
      at = { x, y };
    },
    up: async () => void (await send('touchEnd', [])),
    second: async () => void (await send('touchStart', [{ ...at, id: 0 }, { x: at.x + 60, y: at.y, id: 1 }])),
    cancel: async () => void (await send('touchCancel', [])),
  };
}

/** The middle of an element, scrolled to the middle of the window first (clear of the colony screen's header and foot, which stay in the window). */
async function middle(where: Locator): Promise<{ x: number; y: number }> {
  await where.evaluate((node) => node.scrollIntoView({ block: 'center', inline: 'center' }));
  const box = (await where.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}


/** The thing at `from` held until it is picked up, then carried to `to` (scrolling the screen at its edge on the way if `to` is out of sight), and let go. */
async function carry(page: Page, from: Locator, to: Locator): Promise<void> {
  const hand = await finger(page);
  const start = await middle(from);
  await hand.down(start.x, start.y);
  await page.waitForTimeout(700);
  await expect(page.locator('.drag-ghost')).toHaveCount(1);
  const height = page.viewportSize()!.height;
  let atEdge = false;
  for (let i = 0; i < 60; i++) {
    // off the edge before looking, so that the screen stands still between the look and the move
    if (atEdge) {
      await hand.move(start.x, height / 2, 2);
      await page.waitForTimeout(100);
    }
    // where the target's middle is, and whether a finger there would be on it (the screen's header and foot lie over what scrolls)
    const { x, y, clear } = await to.evaluate((node) => {
      const r = node.getBoundingClientRect();
      const mx = r.x + r.width / 2;
      const my = r.y + r.height / 2;
      return { x: mx, y: my, clear: my > 50 && my < innerHeight - 50 && node.contains(document.elementFromPoint(mx, my)) };
    });
    if (clear) {
      await hand.move(x, y);
      break;
    }
    await hand.move(x, y < height / 2 ? 10 : height - 10, 2);
    await page.waitForTimeout(100);
    atEdge = true;
  }
  await hand.up();
}

/** How far what scrolls the colony screen is scrolled down, and how far it can be. */
const pane = (page: Page): Promise<{ top: number; most: number }> => page.evaluate(() => {
  for (let node = document.querySelector('.colony-screen') as HTMLElement | null; node; node = node.parentElement) {
    const overflow = getComputedStyle(node).overflowY;
    if ((overflow === 'auto' || overflow === 'scroll') && node.scrollHeight > node.clientHeight) return { top: node.scrollTop, most: node.scrollHeight - node.clientHeight };
  }
  return { top: 0, most: 0 };
});

/** The middle of the first token matching `selector` that a finger there would touch (nothing lies over it), in the window's lower half if `low`. */
const touchable = (page: Page, selector: string, low = false): Promise<{ x: number; y: number }> => page.evaluate(({ selector, low }) => {
  for (const token of document.querySelectorAll<HTMLElement>(selector)) {
    const r = token.getBoundingClientRect();
    const x = r.x + r.width / 2;
    const y = r.y + r.height / 2;
    if (y < (low ? innerHeight / 2 : 0) || y > innerHeight - 50 || x < 0 || x > innerWidth) continue;
    if (token.contains(document.elementFromPoint(x, y))) return { x, y };
  }
  throw new Error(`no touchable ${selector}`);
}, { selector, low });

/** A thing held, picked up, carried a little way and dropped on a place: the ghost, the dimmed token, the still screen, the mark and the drop. */
async function pickUpAndDrop(page: Page): Promise<void> {
  const colony = await openJamestown(page);
  const ann = colony.locator('.idle-row .token').first();
  const at = await middle(ann);
  const outside = await spot(colony.locator('.outside-row .row-title'));
  const hand = await finger(page);
  await hand.down(at.x, at.y);
  await page.waitForTimeout(700);
  const ghost = colony.locator('.drag-ghost');
  await expect(ghost).toHaveCount(1);
  await expect(ann).toHaveClass(/token-lifted/);
  const bottom = async (): Promise<number> => {
    const box = (await ghost.boundingBox())!;
    return box.y + box.height;
  };
  expect(Math.abs((await bottom()) - (at.y - 12))).toBeLessThan(1.5);
  // carried a little way (well clear of the edges), the ghost follows and the screen does not scroll
  const still = (await pane(page)).top;
  await hand.move(outside.x, outside.y);
  expect((await pane(page)).top).toBe(still);
  expect(Math.abs((await bottom()) - (outside.y - 12))).toBeLessThan(1.5);
  // the place under the finger is marked as the mouse's drag marks it, and the drop lands there
  await expect(colony.locator('.outside-row')).toHaveAttribute('data-drop-state', 'ok');
  await hand.up();
  await expect(ghost).toHaveCount(0);
  await expect(colony.locator('.idle-row .token')).toHaveCount(1);
  await expect(colony.locator('.outside-row .token-unit')).toHaveCount(2);
  await expect(colony.locator('.token-lifted')).toHaveCount(0);
}

// (most of it at the inner screen held sideways; the pick-up and drop also folded and upright, below,
// and the edge scrolling at every posture)
test.describe('the colony screen under a finger', () => {
  test.use({ viewport: POSTURES.duoInnerSideways, hasTouch: true });

  test('a swipe scrolls the screen, from a token too, and picks up or moves nothing', async ({ page }) => {
    // every building at the top of its chain and a crowd of idle settlers, so that there is more than the window shows
    const crowd = Array.from({ length: 24 }, (_, i) => settler(`s${i}`));
    const colony = await openJamestown(page, { colonists: crowd, buildings: Object.values(BUILDING_CHAINS).map((chain) => chain[chain.length - 1] as string) as never });
    // a token a finger can touch that lies in something with room to scroll down (the screen, or one of its regions)
    const found = await page.evaluate(() => {
      const reach = (from: Element | null): HTMLElement | null => {
        for (let node = from as HTMLElement | null; node; node = node.parentElement) {
          const overflow = getComputedStyle(node).overflowY;
          if ((overflow === 'auto' || overflow === 'scroll') && node.scrollHeight - node.clientHeight - node.scrollTop > 120) return node;
        }
        return null;
      };
      for (const token of document.querySelectorAll<HTMLElement>('.colony-screen .token[data-drag]')) {
        const r = token.getBoundingClientRect();
        const x = r.x + r.width / 2;
        const y = r.y + r.height / 2;
        if (y < 260 || y > innerHeight - 60 || x < 0 || x > innerWidth || !token.contains(document.elementFromPoint(x, y))) continue;
        const pane = reach(token);
        if (pane) {
          pane.dataset['testPane'] = '';
          return { x, y, top: pane.scrollTop };
        }
      }
      return null;
    });
    expect(found).not.toBeNull();
    const { x, y, top } = found!;
    await touchDrag(page, { x, y }, { x, y: y - 200 }, { steps: 12 });
    await expect.poll(() => page.locator('[data-test-pane]').evaluate((n) => n.scrollTop)).toBeGreaterThan(top + 100);
    await expect(colony.locator('.drag-ghost')).toHaveCount(0);
    await expect(colony.locator('.token-selected')).toHaveCount(0);
    await expect(colony.locator('.idle-row .token')).toHaveCount(24);
    await expect(page.locator('.dialog')).toHaveCount(0);
  });

  test('a hold picks a thing up: its ghost rides 12 px above the finger, the token dims, and the screen holds still', async ({ page }) => {
    await pickUpAndDrop(page);
  });

  test('a hold let go in place puts the thing back and asks to look it up', async ({ page }) => {
    const colony = await openJamestown(page);
    await page.evaluate(() => {
      const seen: unknown[] = [];
      (window as unknown as { lookups: unknown[] }).lookups = seen;
      document.addEventListener('lookup', (event) => {
        const detail = (event as CustomEvent<{ clientX: number; clientY: number }>).detail;
        seen.push({ target: (event.target as HTMLElement).dataset['drag'], x: Math.round(detail.clientX), y: Math.round(detail.clientY) });
      });
    });
    const ann = colony.locator('.idle-row .token').first();
    const source = await ann.getAttribute('data-drag');
    const at = await middle(ann);
    await longPress(page, at);
    expect(await page.evaluate(() => (window as unknown as { lookups: unknown[] }).lookups)).toEqual([{ target: source, x: Math.round(at.x), y: Math.round(at.y) }]);
    await expect(colony.locator('.drag-ghost')).toHaveCount(0);
    await expect(colony.locator('.token-lifted')).toHaveCount(0);
    await expect(colony.locator('.token-selected')).toHaveCount(0);
    await expect(colony.locator('.idle-row .token')).toHaveCount(2);
  });

  test('a second finger, a cancelled touch or a change of size puts the thing back', async ({ page }) => {
    const colony = await openJamestown(page);
    const ann = colony.locator('.idle-row .token').first();
    for (const upset of ['second', 'cancel', 'resize'] as const) {
      const at = await middle(ann);
      const outside = await spot(colony.locator('.outside-row .row-title'));
      const hand = await finger(page);
      await hand.down(at.x, at.y);
      await page.waitForTimeout(700);
      await expect(colony.locator('.drag-ghost')).toHaveCount(1);
      await hand.move(outside.x, outside.y);
      if (upset === 'second') await hand.second();
      else if (upset === 'cancel') await hand.cancel();
      else await page.setViewportSize({ width: POSTURES.phoneUpright.width - 20, height: POSTURES.phoneUpright.height });
      await expect(colony.locator('.drag-ghost')).toHaveCount(0);
      await expect(colony.locator('.token-lifted')).toHaveCount(0);
      if (upset !== 'cancel') await hand.up();
      await expect(colony.locator('.idle-row .token')).toHaveCount(2);
      await expect(colony.locator('.outside-row .token-unit')).toHaveCount(1);
    }
  });

  test('tap, then tap, does what click, then click, does, and the help line speaks of fingers', async ({ page }) => {
    const colony = await openJamestown(page);
    const help = colony.locator('.colony-help');
    await expect(help).toContainText('Tap a colonist');
    await expect(help).toContainText('Hold anything to pick it up and drag it');
    await expect(help).toContainText('let go to look it up');
    await expect(help).not.toContainText(/click|Shift/i);
    // a colonist: selected, then the jobs menu
    const ann = colony.locator('.idle-row .token').first();
    await tap(page, ann);
    await expect(colony.locator('.token-selected')).toHaveCount(1);
    await expect(help).toContainText('tap them again for the jobs menu');
    await expect(help).not.toContainText(/click|Shift/i);
    await tap(page, colony.locator('.token-selected'));
    await expect(page.locator('.dialog')).toContainText('Choose work');
    await page.keyboard.press('Escape');
    // a unit outside the gates: selected, then its orders
    const hand = colony.locator('.outside-row .token-unit');
    await tap(page, hand);
    await expect(hand).toHaveClass(/token-selected/);
    await tap(page, hand);
    await expect(page.locator('.dialog')).toContainText('Orders for this unit');
    await page.keyboard.press('Escape');
    await expect(page.locator('.dialog')).toHaveCount(0);
    // a good: selected, then a tap on the ship loads it
    const furs = colony.locator('.token-good', { hasText: 'Furs' });
    await tap(page, furs);
    await expect(furs).toHaveClass(/token-selected/);
    await expect(help).not.toContainText(/click|Shift/i);
    await tap(page, colony.locator('.carrier .token-carrier'));
    await expect(colony.locator('.carrier .token-cargo', { hasText: 'Furs' })).toHaveText('Furs130');
    await expect(furs).toContainText('0');
    // a cargo: selected, then a tap on the warehouse unloads it
    const cargo = colony.locator('.carrier .token-cargo');
    await tap(page, cargo);
    await expect(cargo).toHaveClass(/token-selected/);
    await tap(page, colony.locator('[data-region="warehouse"] h3'));
    await expect(cargo).toHaveCount(0);
    await expect(furs).toContainText('130');
    // the ship already picked: a tap is its orders
    await tap(page, colony.locator('.carrier .token-carrier'));
    await expect(page.locator('.dialog')).toContainText('Orders for this unit');
    await page.keyboard.press('Escape');
  });

  test('a tap tells what a title tells: a square that cannot be worked, a building, and a refused button', async ({ page }) => {
    const three = ['ann', 'ben', 'cat'].map(settler);
    // Plymouth, two squares east, works the square between the two colonies
    const plymouth = (s: GameState): GameState => withColony(s, { id: 'ply', owner: 'p0', x: 4, y: 3, name: 'Plymouth', colonists: [{ id: 'pat', profession: 'freeColonist', job: { kind: 'field', dx: -1, dy: 0, good: 'food' }, turns: 0 }] });
    const colony = await openJamestown(page, { colonists: three, buildings: ['townHall', 'stockade'] }, plymouth);
    const help = colony.locator('.colony-help');
    const worked = colony.locator('.square[data-square="1,0"]');
    await expect(worked).toHaveAttribute('title', 'a neighbouring colony works that square');
    await tap(page, worked);
    await expect(help).toHaveText('a neighbouring colony works that square');
    await tap(page, colony.locator('.building[data-building="townHall"] .building-name'));
    await expect(help).toHaveText('Town Hall');
    const abandon = colony.getByRole('button', { name: 'Abandon colony' });
    await expect(abandon).toBeDisabled();
    await tap(page, abandon);
    await expect(help).toHaveText('a colony behind a stockade or stronger works cannot be abandoned');
  });

  test('Part, with a good or a cargo in hand, makes the next placement ask how much, on a number pad', async ({ page }) => {
    const colony = await openJamestown(page);
    const part = colony.getByRole('button', { name: 'Part' });
    await expect(part).toHaveCount(0);
    const furs = colony.locator('.token-good', { hasText: 'Furs' });
    await tap(page, furs);
    await expect(part).toBeVisible();
    await expect(part).toHaveAttribute('aria-pressed', 'false');
    await tap(page, part);
    await expect(part).toHaveAttribute('aria-pressed', 'true');
    // a tap that places nothing (the warehouse a good is already in, a building) leaves it pressed
    await tap(page, colony.locator('[data-region="warehouse"] h3'));
    await tap(page, colony.locator('.building[data-building="townHall"] .building-name'));
    await expect(furs).toHaveClass(/token-selected/);
    await expect(part).toHaveAttribute('aria-pressed', 'true');
    await expect(furs).toContainText('30');
    // by a tap
    await tap(page, colony.locator('.carrier .token-carrier'));
    const prompt = page.locator('.dialog').filter({ hasText: 'Load how many furs?' });
    await expect(prompt.locator('input')).toHaveAttribute('inputmode', 'numeric');
    await prompt.locator('input').fill('10');
    await page.keyboard.press('Enter');
    await expect(colony.locator('.carrier .token-cargo', { hasText: 'Furs' })).toHaveText('Furs110');
    await expect(furs).toContainText('20');
    // it let go after one placement
    await expect(part).toHaveAttribute('aria-pressed', 'false');
    // by a finger's drop: the cargo carried to the warehouse
    const cargo = colony.locator('.carrier .token-cargo');
    await tap(page, cargo);
    await tap(page, part);
    await expect(part).toHaveAttribute('aria-pressed', 'true');
    await carry(page, cargo, colony.locator('[data-region="warehouse"] h3'));
    const unload = page.locator('.dialog').filter({ hasText: 'Unload how many furs?' });
    await expect(unload.locator('input')).toHaveAttribute('inputmode', 'numeric');
    await unload.locator('input').fill('5');
    await tap(page, unload.getByRole('button', { name: 'OK' }));
    await expect(cargo).toHaveText('Furs105');
    await expect(furs).toContainText('25');
    // and it lets go when the selection is dropped or changed
    await tap(page, part);
    await expect(part).toHaveAttribute('aria-pressed', 'true');
    await tap(page, furs);
    await expect(furs).toHaveClass(/token-selected/);
    await expect(part).toHaveAttribute('aria-pressed', 'false');
    await tap(page, part);
    await tap(page, colony.locator('.outside-row .token-unit'));
    await expect(part).toHaveCount(0);
    await tap(page, furs);
    await expect(part).toHaveAttribute('aria-pressed', 'false');
  });
});

test.describe('the colony screen under a finger, on the Duo folded and upright', () => {
  test.use({ viewport: POSTURES.duoCoverUpright, hasTouch: true });

  test('a hold picks a thing up and a drop lands where the finger lifts', async ({ page }) => {
    await pickUpAndDrop(page);
  });
});

// Held at the window's top or bottom edge, a thing picked up scrolls the screen that way, so that
// any region can be reached in one drag.
for (const name of Object.keys(POSTURES) as PostureName[]) {
  test.describe(`at ${name}`, () => {
    test.use({ viewport: POSTURES[name], hasTouch: true });

    test('a thing held at the top or bottom edge scrolls the screen that way', async ({ page }) => {
      const colony = await openJamestown(page);
      await colony.locator('.idle-row .token').first().evaluate((node) => node.scrollIntoView({ block: 'center' }));
      const at = await touchable(page, '.colony-screen .token[data-drag]:not(.token-carrier)');
      const hand = await finger(page);
      await hand.down(at.x, at.y);
      await page.waitForTimeout(700);
      await expect(colony.locator('.drag-ghost')).toHaveCount(1);
      const { height } = POSTURES[name];
      await hand.move(at.x, height - 8);
      await expect.poll(async () => { const p = await pane(page); return p.most - p.top; }, { timeout: 15_000 }).toBeLessThan(2);
      await hand.move(at.x, 8);
      await expect.poll(async () => (await pane(page)).top, { timeout: 15_000 }).toBeLessThan(2);
      await hand.cancel();
      await expect(colony.locator('.drag-ghost')).toHaveCount(0);
    });
  });
}

/** Load a game with a merchantman in Europe's port with furs aboard and an expert farmer on the docks. */
async function openEurope(page: Page): Promise<Locator> {
  const rows = Array.from({ length: 6 }, (_, y) => (y === 0 || y === 5 ? '~'.repeat(10) : '~~......~~'));
  let state: GameState = world({ rows, seed: 5, players: [{ id: 'p0', kind: 'human', nation: 'england' }] });
  state = { ...state, players: state.players.map((p) => ({ ...p, gold: 5000 })) };
  state = withUnit(state, { id: 'scout', owner: 'p0', type: 'caravel', profession: null, x: 0, y: 2 });
  state = withUnit(state, { id: 'ship', owner: 'p0', type: 'merchantman', profession: null, x: OFF_MAP, y: OFF_MAP, cargo: { furs: 100 } });
  state = { ...state, units: { ...state.units, ship: { ...state.units['ship']!, voyage: { phase: 'inEurope', turnsLeft: 0, origin: [0, 2] } } } };
  state = withUnit(state, { id: 'farmer', owner: 'p0', type: 'colonist', profession: 'expertFarmer', x: OFF_MAP, y: OFF_MAP });
  state = { ...state, units: { ...state.units, farmer: { ...state.units['farmer']!, voyage: { phase: 'inEurope', turnsLeft: 0, origin: [0, 2] } } } };
  await page.addInitScript((text) => localStorage.setItem('new-world:autosave', text), saveGame({ options: { seed: 5 }, log: [], state }));
  await page.goto('/');
  return page.getByRole('dialog', { name: 'Europe' });
}

test.describe('the Europe screen under a finger', () => {
  test.use({ viewport: POSTURES.phoneUpright, hasTouch: true });

  test('Part makes the next tap on a stall or a cargo ask how much, on a number pad, and a tap tells a title', async ({ page }) => {
    const screen = await openEurope(page);
    await tap(page, page.getByRole('menuitem', { name: 'Load Game' }));
    await expect(page.locator('html')).toHaveAttribute('data-pointer', 'coarse');
    await expect(field(page, 'unit')).toHaveText('Caravel');
    await page.keyboard.press('e');
    const market = screen.getByRole('group', { name: 'Market (bid / ask)' });
    // in the compact layout the screen opens at its top, though the first stall takes the focus
    await expect(market.locator('.token-good').first()).toBeFocused();
    expect(await screen.evaluate((node) => {
      let most = 0;
      for (let n: Element | null = node; n; n = n.parentElement) most = Math.max(most, n.scrollTop);
      return most;
    })).toBe(0);
    const part = market.getByRole('button', { name: 'Part' });
    await expect(part).toBeVisible();
    await expect(part).toHaveAttribute('aria-pressed', 'false');
    const note = screen.locator('[data-field="europe-monitor"]');

    // buying: one stall, how many asked
    await tap(page, part);
    await expect(part).toHaveAttribute('aria-pressed', 'true');
    await tap(page, market.locator('.token-good[data-good="muskets"]'));
    const buy = page.locator('.dialog').filter({ hasText: 'Buy how many muskets?' });
    await expect(buy.locator('input')).toHaveAttribute('inputmode', 'numeric');
    await buy.locator('input').fill('10');
    await page.keyboard.press('Enter');
    await expect(note).toContainText('Bought 10 muskets');
    await expect(part).toHaveAttribute('aria-pressed', 'false');

    // selling: one cargo, how many asked
    await tap(page, part);
    await tap(page, screen.locator('.token-cargo', { hasText: 'Furs' }));
    const sell = page.locator('.dialog').filter({ hasText: 'Sell how many furs?' });
    await expect(sell.locator('input')).toHaveAttribute('inputmode', 'numeric');
    await sell.locator('input').fill('40');
    await page.keyboard.press('Enter');
    await expect(note).toContainText('Sold 40 furs');
    await expect(screen.locator('.token-cargo', { hasText: 'Furs' })).toContainText('60');
    await expect(part).toHaveAttribute('aria-pressed', 'false');

    // the title of someone on the docks (the full name) is told by a tap, as the note under the menu it opens
    const farmer = screen.locator('.token-unit[data-key="dock:farmer"]');
    const title = (await farmer.getAttribute('title'))!;
    expect(title).not.toBe('');
    await tap(page, farmer);
    await expect(page.locator('.dialog')).toContainText('What shall this one do?');
    await expect(note).toHaveText(title);
    await page.keyboard.press('Escape');
  });
});

test.describe('the full layout with a mouse', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('shows no Part button in the market, where Shift does its work', async ({ page }) => {
    const screen = await openEurope(page);
    await page.getByRole('menuitem', { name: 'Load Game' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-pointer', 'fine');
    await page.keyboard.press('e');
    await expect(screen.locator('.europe-part')).toBeHidden();
  });
});
