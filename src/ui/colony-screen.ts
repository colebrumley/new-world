// The colony screen (R-308): settlement view, area view, people, transport, warehouse and the
// multi-function panel, all drawn from colonyView(). People, units and goods are moved by
// dragging, by clicking them and then where they should go, or with the keyboard; clicking
// someone already selected opens the jobs menu, and clicking the ship or wagon train already picked
// opens its orders. A thing being dragged travels under the pointer
// as a ghost (R-1035), and the place under it is lit by what letting go there would come to.
// It is drawn as a town plan (R-1013): every building is its picture with the people who work in
// it standing on it, goods are their icons with a count, and the head of the sheet carries the
// owner's flag and a bell gauge for the Sons of Liberty.
import { squareStatus } from '../engine/jobs';
import { landPrice } from '../engine/land';
import type { Action } from '../engine/actions';
import { COLONIST_ROLES } from '../engine/data/equipment';
import { UNIT_TYPES } from '../engine/data/units';
import type { GoodId } from '../engine/data/goods';
import type { GameState, Job, Unit } from '../engine/state';
import { checkCashTreasure, treasureQuote } from '../engine/royal';
import { abandonQuestion, boardingRefusal, colonyView, dropVerdict, jobChoices, leaveAction, type ColonyView, type DropVerdict, type PersonView } from './colony-model';
import { ask, askText } from './dialog';
import { buildingArt, figureArt, flagArt, goodArt, type Sprite } from './pixel-art';
import { lookOf as unitLookOf, type LookId } from './unit-looks';
import { inkOf } from './render';
import { lookOf, paintTile, spriteCanvas } from './tiles';
import { LONG_PRESS_TRAVEL, LOOK_UP, onLongPress, type LookUpDetail } from './touch';

export interface ColonyScreenHost {
  /** The current game state (it changes as actions are applied). */
  readonly state: () => GameState;
  /** Apply an action; returns false (after showing why) if it was refused. */
  readonly dispatch: (action: Action) => boolean;
  /** Reason for refusing an action, or null if it would be accepted. */
  readonly refusal: (action: Action) => string | null;
  /** The player looking at the screen: only their own colony offers to be abandoned. */
  readonly player: () => string;
  readonly close: () => void;
}

type Tab = 'production' | 'units' | 'construction';
const TABS: readonly Tab[] = ['production', 'units', 'construction'];
const TAB_TITLES: Readonly<Record<Tab, string>> = { production: 'Production', units: 'Units', construction: 'Construction' };
const TILE = 64;
/** How far the pointer must travel with the button down before a press is a drag, in CSS pixels. */
const DRAG_THRESHOLD = 4;
/** How many screen pixels an art pixel of a building is drawn at: three in a small town, two once there are more than this many buildings to fit on the plan. */
const BUILDING_SCALE = 3;
const CROWDED_SCALE = 2;
const CROWDED_FROM = 9;
/** And an art pixel of a goods icon and of the flag. */
const GOOD_SCALE = 2;
const FLAG_SCALE = 2;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** Art as a canvas `scale` times its grid, to be shown with crisp pixels; null art gives null. */
function picture(art: Sprite | null, className: string, scale = 1): HTMLCanvasElement | null {
  if (!art) return null;
  const canvas = spriteCanvas(art);
  canvas.className = className;
  canvas.style.width = `${art.size * scale}px`;
  canvas.style.height = `${art.size * scale}px`;
  canvas.setAttribute('aria-hidden', 'true');
  return canvas;
}

export function openColonyScreen(parent: HTMLElement, colonyId: string, host: ColonyScreenHost): { element: HTMLElement; refresh(): void; chooseProject(): Promise<void> } {
  const root = el('section', 'colony-screen');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Colony');
  root.tabIndex = -1;
  let tab: Tab = 'production';
  let showNumbers = true;
  let message = '';
  /** Which carrier L / U and the cargo keys act on. */
  let carrierId: string | null = null;
  /** Remembered focus across re-renders, as "kind:id". */
  let focusKey = '';
  /** The token picked by a click or a drag, as its drag source ("colonist:id"); the next click on a place sends it there. */
  let selected = '';
  /** The Part button is pressed for this selection ('' when it is not): the next placement asks how much, as Shift does. */
  let partFor = '';
  /** The screen has asked to be closed: nothing more is drawn, and the host is not asked twice. */
  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    stopFingers();
    host.close();
  };

  const tell = (text: string): void => {
    message = text;
  };

  const attempt = (action: Action): boolean => {
    const why = host.refusal(action);
    if (why) {
      tell(why);
      return false;
    }
    message = '';
    return host.dispatch(action);
  };

  // --- what a drop means ----------------------------------------------------------------

  function jobForTarget(target: string, colonistId: string): Job | null {
    const [kind, rest] = target.split(':');
    if (kind === 'idle') return { kind: 'idle' };
    if (kind === 'trade' && rest) return { kind: 'work', trade: rest as Extract<Job, { kind: 'work' }>['trade'] };
    if (kind === 'field' && rest) {
      const [dx, dy] = rest.split(',').map(Number) as [number, number];
      // keep the good they were raising if this square offers it, otherwise take the best one here
      const current = host.state().colonies[colonyId]?.colonists.find((c) => c.id === colonistId)?.job;
      const wanted = current?.kind === 'field' ? current.good : null;
      const offered = squareGoods(dx, dy, colonistId);
      const pick = offered.find((v) => v.good === wanted) ?? offered[0];
      return pick ? { kind: 'field', dx, dy, good: pick.good } : null;
    }
    return null;
  }

  /** Goods this colonist could raise on a square, best first. */
  function squareGoods(dx: number, dy: number, colonistId: string): { good: Extract<Job, { kind: 'field' }>['good']; amount: number }[] {
    const state = host.state();
    const colony = state.colonies[colonyId];
    const colonist = colony?.colonists.find((c) => c.id === colonistId);
    if (!colony || !colonist) return [];
    const out: { good: Extract<Job, { kind: 'field' }>['good']; amount: number }[] = [];
    for (const good of ['food', 'fish', 'sugar', 'tobacco', 'cotton', 'furs', 'lumber', 'ore', 'silver'] as const) {
      const action: Action = { type: 'assignJob', colonyId, colonistId, job: { kind: 'field', dx, dy, good } };
      if (host.refusal(action)) continue;
      // read the yield from a trial model: cheap enough at this size
      const trial = colonyView({ ...state, colonies: { ...state.colonies, [colonyId]: { ...colony, colonists: colony.colonists.map((c) => (c.id === colonistId ? { ...c, job: { kind: 'field', dx, dy, good } } : c)) } } }, colonyId);
      const cell = trial?.squares.find((s) => s.dx === dx && s.dy === dy);
      const amount = Number(cell?.worker?.doing.split(' ')[0] ?? 0);
      if (amount > 0) out.push({ good, amount });
    }
    return out.sort((a, b) => b.amount - a.amount);
  }

  /** A square that is still the natives': offer to buy it or take it. Returns whether it is now ours to work. */
  async function settleLand(target: string): Promise<boolean> {
    const state = host.state();
    const colony = state.colonies[colonyId];
    const [kind, rest] = target.split(':');
    if (kind !== 'field' || !rest || !colony) return true;
    const [dx, dy] = rest.split(',').map(Number) as [number, number];
    if (squareStatus(state, colony, dx, dy) !== 'nativeLand') return true;
    const x = colony.x + dx;
    const y = colony.y + dy;
    const price = landPrice(state, colony.owner, x, y);
    const rich = (state.players.find((p) => p.id === colony.owner)?.gold ?? 0) >= price;
    const choices = ['Leave it to them', ...(rich ? [`Pay ${price} gold for it`] : []), 'Take it'];
    const pick = await ask(root, { text: `This land is the natives'. They ask ${price} gold for it${rich ? '' : ', which we do not have'}.`, choices, escape: 0 });
    if (pick === 0) return false;
    return attempt({ type: 'acquireLand', x, y, pay: rich && pick === 1 });
  }

  async function drop(source: string, target: string, shift: boolean): Promise<void> {
    const [kind, id, extra] = source.split(':') as [string, string, string | undefined];
    // the Part button lets go after one placement, whatever it came to
    const partial = shift || partFor !== '';
    partFor = '';
    if (kind === 'colonist') {
      if (target === 'outside') await leave(id);
      else if (target.startsWith('carrier:')) {
        // a worker let go on a ship steps out of the colony and goes aboard, but only if both may be done
        const shipId = target.slice('carrier:'.length);
        const refused = boardingRefusal(host.state(), colonyId, id, shipId, host.refusal);
        if (refused !== null) tell(refused);
        else if (attempt({ type: 'leaveColony', colonyId, colonistId: id })) attempt({ type: 'boardShip', unitId: id, shipId });
      } else {
        const ours = await settleLand(target);
        const job = ours ? jobForTarget(target, id) : null;
        if (job) attempt({ type: 'assignJob', colonyId, colonistId: id, job });
        else tell(ours ? 'Nothing can be produced there.' : 'The land stays with the natives.');
      }
    } else if (kind === 'unit') {
      // a unit dragged into the colony joins it, then takes the job it was dropped on; one let go on a ship goes aboard
      if (target === 'warehouse') return;
      if (target.startsWith('carrier:')) attempt({ type: 'boardShip', unitId: id, shipId: target.slice('carrier:'.length) });
      else if (target === 'outside') {
        // a passenger dropped outside the gates steps off the ship
        if (host.state().units[id]?.aboard) attempt({ type: 'goAshore', unitId: id });
      } else if (attempt({ type: 'joinColony', unitId: id })) {
        const job = jobForTarget(target, id);
        if (job) attempt({ type: 'assignJob', colonyId, colonistId: id, job });
      }
    } else if (kind === 'good' && target.startsWith('carrier:')) {
      const unitId = target.slice('carrier:'.length);
      const view = colonyView(host.state(), colonyId);
      const have = view?.warehouse.find((g) => g.good === id)?.amount ?? 0;
      const amount = partial ? await howMany(`Load how many ${id}?`, have) : Math.min(have, 100);
      if (amount > 0) attempt({ type: 'loadCargo', unitId, good: id as GoodId, amount });
    } else if (kind === 'cargo' && extra) {
      const view = colonyView(host.state(), colonyId);
      const have = view?.carriers.find((c) => c.id === id)?.cargo.find((g) => g.good === extra)?.amount ?? 0;
      if (target === 'warehouse') {
        const amount = partial ? await howMany(`Unload how many ${extra}?`, have) : have;
        if (amount > 0) attempt({ type: 'unloadCargo', unitId: id, good: extra as GoodId, amount });
      } else if (target.startsWith('carrier:') && target !== `carrier:${id}`) {
        const amount = partial ? await howMany(`Move how many ${extra}?`, have) : have;
        if (amount > 0) attempt({ type: 'transferCargo', unitId: id, toId: target.slice('carrier:'.length), good: extra as GoodId, amount });
      }
    }
    render();
  }

  async function howMany(question: string, most: number): Promise<number> {
    const answer = await askText(root, { text: `${question} (up to ${most})`, initial: String(most), maxLength: 4, numeric: true });
    const n = Math.floor(Number(answer));
    return answer !== null && Number.isFinite(n) && n > 0 ? Math.min(n, most) : 0;
  }

  // --- leaving and abandoning --------------------------------------------------------------

  /** Asks once whether the colony is to be given up, and gives it up on yes: the screen then closes. A refusal is told instead. */
  async function abandon(): Promise<void> {
    const action: Action = { type: 'abandonColony', colonyId };
    const text = abandonQuestion(host.state(), colonyId);
    const why = host.refusal(action);
    if (why || text === null) {
      if (why) tell(why);
      return;
    }
    const pick = await ask(root, { text, choices: ['No, keep it', 'Yes, abandon it'], escape: 0 });
    if (pick === 1 && attempt(action)) close();
  }

  /** A colonist steps outside the gates; the last one out abandons the colony, once the player has agreed to it. */
  async function leave(colonistId: string): Promise<void> {
    const action = leaveAction(host.state(), colonyId, colonistId);
    if (action.type === 'abandonColony') await abandon();
    else attempt(action);
  }

  // --- menus ------------------------------------------------------------------------------

  async function jobsMenu(colonistId: string): Promise<void> {
    const choices = jobChoices(host.state(), colonyId, colonistId);
    const colonist = host.state().colonies[colonyId]?.colonists.find((c) => c.id === colonistId);
    const labels = choices.map((c) => c.label);
    const clear = host.refusal({ type: 'clearSpecialty', colonyId, colonistId }) === null;
    if (clear) labels.push('Clear Specialty');
    labels.push('Leave the colony', 'No change');
    const pick = await ask(root, { text: `Choose work for this ${colonist ? 'colonist' : 'person'}:`, choices: labels, escape: labels.length - 1 });
    const chosen = choices[pick];
    if (chosen) attempt({ type: 'assignJob', colonyId, colonistId, job: chosen.job });
    else if (clear && pick === choices.length) attempt({ type: 'clearSpecialty', colonyId, colonistId });
    else if (pick === labels.length - 2) await leave(colonistId);
    focusKey = `colonist:${colonistId}`;
    render();
  }

  /**
   * The orders-menu line for cashing a treasure, or null when there is nothing to say. A treasure
   * the Crown will not carry (we have a galleon, or no harbour) still gets a line naming why;
   * picking it shows the refusal rather than leaving the player guessing.
   */
  function treasureEntry(state: GameState, unit: Unit): string | null {
    const quote = treasureQuote(state, unit);
    if (quote) return quote.carrier === 'agents' ? `Sell the treasure (${quote.value} gold)` : `Send the treasure home (keep ${quote.net} of ${quote.value} gold)`;
    const check = checkCashTreasure(state, unit.owner, unit.id);
    if (check.ok) return null;
    if (check.code === 'treasureOwnGalleon') return 'Send the treasure home (not while we have a galleon)';
    if (check.code === 'treasureNoPort') return 'Send the treasure home (no harbour here)';
    return null;
  }

  async function ordersMenu(unitId: string): Promise<void> {
    const unit = host.state().units[unitId];
    const treasure = unit?.type === 'treasure';
    const carrier = unit !== undefined && UNIT_TYPES[unit.type].holds > 0;
    const options: { label: string; action: Action }[] = treasure || carrier ? [] : [{ label: 'Join the colony', action: { type: 'joinColony', unitId } }];
    if (unit && treasure) {
      const label = treasureEntry(host.state(), unit);
      if (label) options.push({ label, action: { type: 'cashTreasure', unitId } });
    }
    const aboard = Boolean(unit?.aboard);
    if (aboard) options.push({ label: 'Go ashore', action: { type: 'goAshore', unitId } });
    for (const role of aboard || carrier ? [] : COLONIST_ROLES) {
      const action: Action = { type: 'equip', unitId, role };
      if (host.refusal(action) === null) options.push({ label: role === 'colonist' ? 'Lay down equipment' : `Equip as ${role}`, action });
    }
    options.push({ label: 'Sentry', action: { type: 'setOrders', unitId, orders: 'sentry' } }, { label: 'Fortify', action: { type: 'setOrders', unitId, orders: 'fortify' } });
    // a unit standing in a colony cannot be picked on the map, so its orders are lifted here
    if (!aboard && host.state().units[unitId]?.orders !== 'none') options.push({ label: 'Clear orders', action: { type: 'setOrders', unitId, orders: 'none' } });
    const labels = [...options.map((o) => o.label), 'No change'];
    const pick = await ask(root, { text: 'Orders for this unit:', choices: labels, escape: labels.length - 1 });
    const chosen = options[pick];
    if (chosen) attempt(chosen.action);
    render();
  }

  async function constructionMenu(): Promise<void> {
    const view = colonyView(host.state(), colonyId);
    if (!view) return;
    const labels = [...view.construction.choices.map((c) => c.label), 'No change'];
    const pick = await ask(root, { text: 'What shall the colony build?', choices: labels, escape: labels.length - 1 });
    const chosen = view.construction.choices[pick];
    if (chosen) attempt({ type: 'setConstruction', colonyId, item: chosen.item });
    tab = 'construction';
    render();
  }

  /** The Custom House checklist: pick a good to switch its export on or off, until done. */
  async function exportsMenu(): Promise<void> {
    for (let at = 0; ;) {
      const view = colonyView(host.state(), colonyId);
      if (!view?.customHouse) {
        tell('This colony has no Custom House.');
        break;
      }
      const labels = [...view.warehouse.map((g) => `${g.exported ? '[x]' : '[ ]'} ${g.name}`), 'Done'];
      const pick = await ask(root, { text: 'Which goods shall the Custom House export?', choices: labels, escape: labels.length - 1, initial: at });
      const chosen = view.warehouse[pick];
      if (!chosen) break;
      attempt({ type: 'setExport', colonyId, good: chosen.good, on: !chosen.exported });
      at = pick;
    }
    render();
  }

  async function buy(): Promise<void> {
    const view = colonyView(host.state(), colonyId);
    const price = view?.construction.buyPrice;
    if (price === null || price === undefined) {
      tell('There is nothing left to pay for.');
    } else {
      const pick = await ask(root, { text: `Finish the ${view?.construction.item} for ${price} gold?`, choices: ['No', `Yes, pay ${price}`], escape: 0 });
      if (pick === 1) attempt({ type: 'buyConstruction', colonyId });
    }
    tab = 'construction';
    render();
  }

  // --- drawing ----------------------------------------------------------------------------

  /** A thing that can be picked up: its picture (a figure or a goods icon) if it has one, its name, and a line under it. */
  function token(kind: string, id: string, label: string, sub: string, extra = '', art: HTMLCanvasElement | null = null, named = label): HTMLButtonElement {
    const b = el('button', `token token-${kind}`);
    b.type = 'button';
    b.dataset['drag'] = extra ? `${kind}:${id}:${extra}` : `${kind}:${id}`;
    b.dataset['key'] = `${kind}:${id}${extra ? `:${extra}` : ''}`;
    b.title = sub ? `${named}: ${sub}` : named;
    if (art) b.append(art);
    b.append(el('span', 'token-label', label));
    if (sub) b.append(el('span', 'token-sub', sub));
    return b;
  }

  /** The figure of a look: a colonist at work shows its profession, a unit here the figure the map draws it as. */
  const figure = (look: LookId): HTMLCanvasElement | null => picture(figureArt(look), 'token-art token-figure');
  /** The look of a person in the colony or of a unit here, from the state, for a token's ghost. */
  const lookFor = (kind: 'colonist' | 'unit', id: string): LookId | null => {
    const state = host.state();
    if (kind === 'unit') {
      const unit = state.units[id];
      return unit ? unitLookOf(unit.type, unit.profession) : null;
    }
    const colonist = state.colonies[colonyId]?.colonists.find((c) => c.id === id);
    return colonist ? unitLookOf('colonist', colonist.profession) : null;
  };
  const goodIcon = (good: string): HTMLCanvasElement | null => picture(goodArt(good), 'token-art good-art', GOOD_SCALE);

  const personToken = (kind: 'colonist' | 'unit', p: PersonView): HTMLButtonElement => token(kind, p.id, p.label, p.doing, '', figure(p.look), p.fullName);

  function region(name: string, title: string): HTMLElement {
    const box = el('div', `colony-${name}`);
    box.dataset['region'] = name;
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', title);
    box.append(el('h3', '', title));
    return box;
  }

  function drawSquare(dx: number, dy: number): HTMLCanvasElement {
    const canvas = el('canvas', 'square-art');
    canvas.width = TILE;
    canvas.height = TILE;
    const state = host.state();
    const colony = state.colonies[colonyId];
    const tile = colony ? state.map.tiles[(colony.y + dy) * state.map.width + colony.x + dx] : undefined;
    const ctx = canvas.getContext('2d');
    if (ctx && tile) paintTile(ctx, TILE, lookOf(tile, tile.river === 'none' ? 0 : 15, 0, 0, false, tile.homeland !== null));
    return canvas;
  }

  function render(): void {
    if (closed) return;
    const view = colonyView(host.state(), colonyId);
    if (!view) {
      close();
      return;
    }
    if (carrierId === null || !view.carriers.some((c) => c.id === carrierId)) carrierId = view.carriers[0]?.id ?? null;
    root.replaceChildren();
    root.dataset['colony'] = view.id;
    root.dataset['tab'] = tab;
    root.classList.toggle('hide-numbers', !showNumbers);

    const ink = inkOf(host.state(), view.owner);
    root.dataset['nation'] = view.nation ?? '';
    const header = el('header', 'colony-header');
    const flag = picture(flagArt(view.nation ?? 'crown'), 'colony-flag', FLAG_SCALE);
    if (flag) header.append(flag);
    // the bell gauge: how much of the colony stands with the Sons of Liberty, the rest of the bar being the Tories'
    const gauge = el('div', 'liberty-gauge');
    gauge.setAttribute('role', 'meter');
    gauge.setAttribute('aria-label', 'Sons of Liberty');
    gauge.setAttribute('aria-valuemin', '0');
    gauge.setAttribute('aria-valuemax', '100');
    gauge.setAttribute('aria-valuenow', String(view.solPercent));
    const bar = el('div', 'liberty-bar');
    const fill = el('div', 'liberty-fill');
    fill.style.width = `${Math.max(0, Math.min(100, view.solPercent))}%`;
    bar.append(fill);
    const bell = picture(goodArt('bells'), 'liberty-bell', GOOD_SCALE);
    if (bell) gauge.append(bell);
    gauge.append(el('span', 'colony-sol', `Sons of Liberty ${view.solPercent}%`), bar, el('span', 'colony-tory', `Tories ${view.toryPercent}%`));
    header.append(el('h2', '', view.name), el('span', 'colony-pop', `Population ${view.population}`), gauge);
    const done = el('button', 'colony-close', 'Exit (Esc)');
    done.type = 'button';
    done.addEventListener('click', close);
    // the commands at the foot of the sheet: giving the colony up (our own only), and leaving the screen
    const commands = el('div', 'colony-commands');
    commands.dataset['region'] = 'commands';
    commands.setAttribute('role', 'group');
    commands.setAttribute('aria-label', 'Commands');
    if (view.owner === host.player()) {
      const giveUp = el('button', 'colony-abandon', 'Abandon colony');
      giveUp.type = 'button';
      const why = host.refusal({ type: 'abandonColony', colonyId });
      giveUp.disabled = why !== null;
      if (why) giveUp.title = why;
      giveUp.addEventListener('click', () => void abandon().then(render));
      commands.append(giveUp);
    }
    commands.append(done);

    const settlement = region('settlement', 'Settlement');
    for (const b of view.buildings) {
      const box = el('div', 'building');
      box.dataset['building'] = b.id;
      if (b.trade) box.dataset['drop'] = `trade:${b.trade}`;
      box.title = b.name;
      // the picture of the chain's present link, and on it the people who work there and the places still free
      const plot = el('div', 'building-plot');
      const art = picture(buildingArt(b.id, ink), 'building-art', view.buildings.length >= CROWDED_FROM ? CROWDED_SCALE : BUILDING_SCALE);
      if (art) plot.append(art);
      const slots = el('div', 'building-slots');
      for (const w of b.workers) slots.append(personToken('colonist', w));
      for (let free = b.workers.length; free < b.capacity; free++) slots.append(el('span', 'slot-free'));
      plot.append(slots);
      box.append(plot, el('span', 'building-name', b.name));
      settlement.append(box);
    }

    const area = region('area', 'Area');
    const grid = el('div', 'area-grid');
    for (const sq of view.squares) {
      const cell = el('div', `square square-${sq.status}`);
      cell.dataset['square'] = `${sq.dx},${sq.dy}`;
      if (sq.status !== 'center') cell.dataset['drop'] = `field:${sq.dx},${sq.dy}`;
      cell.append(drawSquare(sq.dx, sq.dy));
      if (sq.status === 'center') cell.append(el('span', 'square-note', sq.note));
      if (sq.worker) cell.append(personToken('colonist', sq.worker));
      if (sq.status === 'nativeLand' || sq.status === 'otherColony' || sq.status === 'foreignUnit') cell.title = sq.status;
      grid.append(cell);
    }
    area.append(grid);

    const people = region('people', 'People');
    const f = view.food;
    people.append(
      el('p', 'food-line', `Food ${f.made} made, ${f.eaten} eaten, ${f.surplus >= 0 ? 'surplus' : 'shortfall'} ${Math.abs(f.surplus)}; ${f.stored} stored`),
      el('p', 'liberty-line', `Bells ${view.production.find((l) => l.good === 'bells')?.made ?? 0}, crosses ${view.production.find((l) => l.good === 'crosses')?.made ?? 0}`),
    );
    const idle = el('div', 'idle-row');
    idle.dataset['drop'] = 'idle';
    idle.append(el('span', 'row-title', 'Not working:'));
    for (const p of view.idle) idle.append(personToken('colonist', p));
    const outside = el('div', 'outside-row');
    outside.dataset['drop'] = 'outside';
    outside.append(el('span', 'row-title', 'Outside the gates:'));
    for (const p of view.outside) outside.append(personToken('unit', p));
    people.append(idle, outside);

    const transport = region('transport', 'Transport');
    for (const c of view.carriers) {
      const box = el('div', `carrier${c.id === carrierId ? ' carrier-active' : ''}`);
      box.dataset['drop'] = `carrier:${c.id}`;
      box.dataset['carrier'] = c.id;
      const pick = token('carrier', c.id, c.label, `${c.used}/${c.holds} holds`, '', figure(c.look));
      box.append(pick);
      for (const lot of c.cargo) box.append(token('cargo', c.id, lot.name, String(lot.amount), lot.good, goodIcon(lot.good)));
      for (const p of c.passengers) box.append(personToken('unit', p));
      transport.append(box);
    }
    if (view.carriers.length === 0) transport.append(el('p', 'empty', 'No ship or wagon train is here.'));

    const warehouse = region('warehouse', `Warehouse (holds ${view.capacity} of each)`);
    warehouse.dataset['drop'] = 'warehouse';
    if (view.customHouse) {
      const customs = el('button', 'construction-change', 'Custom House (X)');
      customs.type = 'button';
      customs.addEventListener('click', () => void exportsMenu());
      warehouse.append(customs);
    }
    for (const g of view.warehouse) {
      const t = token('good', g.good, g.name, g.exported ? `${g.amount} export` : String(g.amount), '', goodIcon(g.good));
      if (g.amount === 0) t.classList.add('token-empty');
      if (g.good !== 'food' && g.amount > view.capacity) t.classList.add('token-over');
      warehouse.append(t);
    }

    const multi = region('multi', TAB_TITLES[tab]);
    const tabs = el('div', 'tabs');
    TABS.forEach((name, i) => {
      const b = el('button', `tab${name === tab ? ' tab-active' : ''}`, `${i + 1} ${TAB_TITLES[name]}`);
      b.type = 'button';
      b.addEventListener('click', () => {
        tab = name;
        render();
      });
      tabs.append(b);
    });
    multi.append(tabs);
    if (tab === 'production') {
      const table = el('table', 'production-table');
      for (const line of view.production) {
        const row = el('tr');
        row.dataset['good'] = line.good;
        const name = el('th', '', line.name);
        const icon = picture(goodArt(line.good), 'good-art');
        if (icon) name.prepend(icon);
        row.append(name, el('td', '', `+${line.made}`), el('td', '', line.used ? `-${line.used}` : ''), el('td', '', `${line.net >= 0 ? '+' : ''}${line.net}`));
        table.append(row);
      }
      multi.append(table);
    } else if (tab === 'units') {
      const list = el('ul', 'unit-list');
      for (const p of [...view.outside, ...view.carriers.map((c) => ({ id: c.id, label: c.label, doing: `${c.used}/${c.holds} holds` }))]) list.append(el('li', '', p.doing ? `${p.label} (${p.doing})` : p.label));
      if (list.childElementCount === 0) list.append(el('li', '', 'No units here.'));
      multi.append(list);
    } else {
      const c = view.construction;
      multi.append(
        el('p', 'construction-item', c.built ? `${c.item} is built: choose the next project.` : c.item ? `Building: ${c.item}` : 'Building nothing'),
        el('p', 'construction-progress', c.item && !c.built ? `Hammers ${c.hammers}/${c.hammersNeeded}, tools ${Math.min(c.tools, c.toolsNeeded)}/${c.toolsNeeded}` : `Hammers stored: ${c.hammers}`),
      );
      const change = el('button', 'construction-change', 'Change (C)');
      change.type = 'button';
      change.addEventListener('click', () => void constructionMenu());
      const buyButton = el('button', 'construction-buy', c.buyPrice === null ? 'Buy (B)' : `Buy for ${c.buyPrice} (B)`);
      buyButton.type = 'button';
      buyButton.disabled = c.buyPrice === null;
      buyButton.addEventListener('click', () => void buy());
      multi.append(change, buyButton);
    }

    const status = el('p', 'colony-message', message);
    status.setAttribute('aria-live', 'polite');
    status.dataset['field'] = 'colony-message';

    root.append(header, settlement, area, people, multi, transport, warehouse, status);
    const picked = selected ? root.querySelector<HTMLElement>(`[data-drag="${selected}"]`) : null;
    if (!picked) selected = '';
    picked?.classList.add('token-selected');
    // with a good or a cargo in hand, the foot of the sheet offers to move only part of it (Shift's work, for a finger)
    // (it lets go when the selection is dropped or changed)
    if (partFor !== selected) partFor = '';
    if (selected.startsWith('good:') || selected.startsWith('cargo:')) commands.insertBefore(partButton(), done);
    showHolding();
    restoreDrag();
    root.append(el('p', 'colony-help', helpFor(picked)), commands);
    const again = focusKey ? root.querySelector<HTMLElement>(`[data-key="${focusKey}"]`) : null;
    (again ?? root.querySelector<HTMLElement>('.token') ?? root).focus();
  }

  /** Marks the screen with the kind of thing in hand, so the places it can go light up. */
  function showHolding(kind = selected.split(':')[0] ?? ''): void {
    root.dataset['holding'] = kind;
  }

  /** The Part button: pressed, the next placement of the good or cargo in hand asks how much. */
  function partButton(): HTMLButtonElement {
    const b = el('button', 'colony-part', 'Part');
    b.type = 'button';
    b.title = 'Move only part of it: the next placement asks how much';
    b.setAttribute('aria-pressed', String(partFor !== ''));
    b.addEventListener('click', () => {
      partFor = partFor ? '' : selected;
      render();
    });
    return b;
  }

  /** What the help line says: with a finger at work it speaks of taps and holds, otherwise of clicks. */
  function helpFor(picked: HTMLElement | null): string {
    if (document.documentElement.dataset['pointer'] === 'coarse') return fingerHelpFor(picked);
    const name = picked?.querySelector('.token-label')?.textContent ?? '';
    const kind = selected.split(':')[0];
    if (kind === 'colonist') return `${name} selected: click a square or a building to put them to work there, or a ship to put them aboard; click them again for the jobs menu.`;
    if (kind === 'unit' && host.state().units[selected.split(':')[1] ?? '']?.aboard) return `${name} selected: click a square or a building to have them join the colony there, "Outside the gates" to put them ashore, or another ship to move them to it; click them again for orders.`;
    if (kind === 'unit') return `${name} selected: click a square or a building to have them join the colony there, or a ship to put them aboard; click them again for orders.`;
    if (kind === 'good') return `${name} selected: click a ship or wagon train to load a hold of it (Shift for part).`;
    if (kind === 'cargo') return `${name} selected: click the warehouse to unload it, or another ship or wagon train to move it (Shift for part).`;
    return 'Click a colonist, then a square or a building, to put them to work there, or a ship to put them aboard (or drag them); click them again for the jobs menu. Move goods between the warehouse and a hold the same way; click a ship or wagon train twice for its orders. Right-click anything to look it up.';
  }

  /** The help line for a finger: the thing in hand is named by its title, which tells what its label leaves out (an equipped colonist's role, say). */
  function fingerHelpFor(picked: HTMLElement | null): string {
    const name = picked?.title ?? '';
    const kind = selected.split(':')[0];
    const some = partFor ? 'Part is pressed: the next placement asks how much.' : 'Press Part first to move only some.';
    if (kind === 'colonist') return `${name}. Tap a square or a building to put them to work there, or a ship to put them aboard; tap them again for the jobs menu.`;
    if (kind === 'unit' && host.state().units[selected.split(':')[1] ?? '']?.aboard) return `${name}. Tap a square or a building to have them join the colony there, "Outside the gates" to put them ashore, or another ship to move them to it; tap them again for orders.`;
    if (kind === 'unit') return `${name}. Tap a square or a building to have them join the colony there, or a ship to put them aboard; tap them again for orders.`;
    if (kind === 'good') return `${name}. Tap a ship or wagon train to load a hold of it. ${some}`;
    if (kind === 'cargo') return `${name}. Tap the warehouse to unload it, or another ship or wagon train to move it. ${some}`;
    return 'Tap a colonist, then a square or a building, to put them to work there, or a ship to put them aboard; tap them again for the jobs menu. Move goods between the warehouse and a hold the same way; tap a ship or wagon train twice for its orders. Hold anything to pick it up and drag it where it should go, or hold it and let go to look it up.';
  }

  // --- pointer: press, move, release ----------------------------------------------------------

  /** A press on a token, and the drag it may become. */
  interface Grip {
    readonly source: string;
    /** Where the button went down, and where the pointer was last seen. */
    readonly x: number;
    readonly y: number;
    px: number;
    py: number;
    moved: boolean;
    readonly shift: boolean;
    /** The token pressed (a redraw mid-drag points this at its successor). */
    from: HTMLElement;
    /** The picture travelling under the pointer, once the press has become a drag. */
    ghost: HTMLElement | null;
    /** The place under the pointer that is marked now. */
    over: HTMLElement | null;
    /** Verdicts already worked out in this drag, by target: a field square's costs up to nine refusals and nine trial views. */
    readonly verdicts: Map<string, DropVerdict>;
    /** The finger holding it (its pointer id), or null for the mouse. */
    readonly finger: number | null;
  }
  let held: Grip | null = null;
  /** The pointer left the window with the button down: the release that may follow its return is nobody's click. */
  let abandoned = false;

  /** The ghost of a token: fresh art (a copied canvas would be blank) with the token's name and line. */
  function makeGhost(grip: Grip): HTMLElement {
    const [kind = '', id = '', extra = ''] = grip.source.split(':');
    const ghost = el('div', `drag-ghost token token-${kind}`);
    ghost.setAttribute('aria-hidden', 'true');
    const look = kind === 'colonist' || kind === 'unit' ? lookFor(kind, id) : null;
    const art = kind === 'colonist' || kind === 'unit' ? (look ? figure(look) : null) : goodIcon(kind === 'cargo' ? extra : id);
    if (art) ghost.append(art);
    ghost.append(el('span', 'token-label', grip.from.querySelector('.token-label')?.textContent ?? ''));
    const sub = grip.from.querySelector('.token-sub')?.textContent ?? '';
    if (sub) ghost.append(el('span', 'token-sub', sub));
    return ghost;
  }

  /** Moves the ghost to the pointer and marks the place under it, found as the release finds it. */
  function aim(grip: Grip, x: number, y: number): void {
    grip.px = x;
    grip.py = y;
    if (!grip.ghost) return;
    grip.ghost.style.left = `${x}px`;
    grip.ghost.style.top = `${y}px`;
    const place = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-drop]') ?? null;
    if (place === grip.over) return;
    grip.over?.removeAttribute('data-drop-state');
    grip.over = place;
    const target = place?.dataset['drop'];
    if (!place || !target) {
      grip.ghost.removeAttribute('data-verdict');
      return;
    }
    let verdict = grip.verdicts.get(target);
    if (!verdict) {
      verdict = dropVerdict(host.state(), colonyId, grip.source, target, host.refusal, jobForTarget);
      grip.verdicts.set(target, verdict);
    }
    place.dataset['dropState'] = verdict;
    // the ghost is marked only where it would be refused; over a place that takes it, or its own, it is plain
    if (verdict === 'bad') grip.ghost.dataset['verdict'] = verdict;
    else grip.ghost.removeAttribute('data-verdict');
  }

  /** Takes away the ghost and every mark of a drag. */
  function endDrag(grip: Grip | null): void {
    if (!grip) return;
    grip.ghost?.remove();
    grip.ghost = null;
    grip.over?.removeAttribute('data-drop-state');
    grip.over = null;
    grip.from.classList.remove('token-lifted');
  }

  /** After a redraw in the middle of a drag (a refresh from the host): the ghost and the marks, which the redraw dropped, go back. */
  function restoreDrag(): void {
    const grip = held;
    if (!grip) return;
    const from = root.querySelector<HTMLElement>(`[data-drag="${grip.source}"]`);
    if (!from) {
      // what was pressed or being dragged is no longer here
      endDrag(grip);
      held = null;
      showHolding();
      return;
    }
    // a press that is not yet a drag keeps hold of the new token too, so that the drag dims the one on screen
    grip.from = from;
    if (!grip.ghost) return;
    from.classList.add('token-lifted');
    root.append(grip.ghost);
    // the places are new elements and the state may have changed under the drag: ask again
    grip.over = null;
    grip.verdicts.clear();
    aim(grip, grip.px, grip.py);
  }

  root.addEventListener('mousedown', (event) => {
    if (fingerAtWork()) return;
    const from = (event.target as HTMLElement).closest<HTMLElement>('[data-drag]');
    if (event.button === 0) abandoned = false;
    if (!from || event.button !== 0) return;
    endDrag(held);
    held = { source: from.dataset['drag'] ?? '', x: event.clientX, y: event.clientY, px: event.clientX, py: event.clientY, moved: false, shift: event.shiftKey, from, ghost: null, over: null, verdicts: new Map(), finger: null };
    focusKey = from.dataset['key'] ?? '';
    if (!held.source.startsWith('carrier:')) showHolding(held.source.split(':')[0]);
  });
  root.addEventListener('mousemove', (event) => {
    if (!held || fingerAtWork()) return;
    if (!held.moved && Math.hypot(event.clientX - held.x, event.clientY - held.y) > DRAG_THRESHOLD) {
      held.moved = true;
      // a ship or wagon train gets no ghost: dragging one does nothing
      if (!held.source.startsWith('carrier:')) {
        held.ghost = makeGhost(held);
        held.from.classList.add('token-lifted');
        root.append(held.ghost);
      }
    }
    aim(held, event.clientX, event.clientY);
  });
  // A region (or the screen) scrolled under a still pointer puts another place beneath it: mark that one.
  // Scroll events do not bubble, hence the capture.
  root.addEventListener('scroll', () => {
    if (held?.ghost) aim(held, held.px, held.py);
  }, true);
  // The screen covers the whole game, so the pointer leaving it has left the window: the press is
  // over, and so is the drag (a release out there never reaches us).
  root.addEventListener('mouseleave', (event) => {
    if (!held || fingerAtWork()) return;
    endDrag(held);
    held = null;
    abandoned = (event.buttons & 1) === 1;
    showHolding();
  });
  root.addEventListener('mouseup', (event) => {
    if (fingerAtWork()) return;
    const grip = held;
    held = null;
    // the ghost and the marks go before anything the drop shows (a question, a message)
    endDrag(grip);
    if (event.button !== 0) return;
    showHolding();
    if (abandoned) {
      abandoned = false;
      return;
    }
    if (!grip) {
      // a click on a place: whoever or whatever is selected goes there (a button there keeps its own click)
      const at = event.target as HTMLElement;
      const place = at.closest('button') ? undefined : at.closest<HTMLElement>('[data-drop]')?.dataset['drop'];
      if (selected && place) void drop(selected, place, event.shiftKey);
      return;
    }
    const [kind, id] = grip.source.split(':') as [string, string];
    if (!grip.moved) {
      // a plain click selects; a click on a ship or wagon train picks it, or loads what is selected
      if (kind === 'carrier') {
        const cargo = selected.startsWith('good:') || (selected.startsWith('cargo:') && !selected.startsWith(`cargo:${id}:`));
        // someone selected goes aboard if they may; otherwise the click picks the ship, or asks its orders, as usual
        const held = selected.split(':')[0];
        const passenger = (held === 'colonist' || held === 'unit') && dropVerdict(host.state(), colonyId, selected, `carrier:${id}`, host.refusal, jobForTarget) === 'ok';
        if (cargo || passenger) void drop(selected, `carrier:${id}`, event.shiftKey);
        else if (carrierId === id) void ordersMenu(id);
        else {
          carrierId = id;
          render();
        }
      } else if (selected !== grip.source) {
        selected = grip.source;
        render();
      } else if (kind === 'colonist') void jobsMenu(id);
      else if (kind === 'unit') void ordersMenu(id);
      return;
    }
    selected = grip.source;
    const over = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-drop]');
    if (over?.dataset['drop']) void drop(grip.source, over.dataset['drop'], grip.shift || event.shiftKey);
    else render();
  });

  // A finger (docs/specs/phone-play.md W5): a swipe scrolls the screen, as the browser does it; a
  // hold of LONG_PRESS_MS picks a thing up, its ghost lifted clear of the finger; moved, it is dragged
  // as the mouse drags it and let go where it should go; let go in place, it is put back and looked
  // up. A tap is the browser's click, and goes through the mouse's handlers above.

  /** How far above the finger the ghost's bottom edge rides, so that the finger does not hide it. */
  const GHOST_LIFT = 12;
  /** How far the screen scrolls in a frame while a thing picked up is held at its top or bottom edge. */
  const EDGE_SCROLL_STEP = 12;
  /** For this long after a pick-up ends, or until the next touch, a mouse event is the browser's echo of the finger, and nobody's click. */
  const ECHO_MS = 800;
  let echoUntil = 0;
  function fingerAtWork(): boolean {
    return (held !== null && held.finger !== null) || performance.now() < echoUntil;
  }
  /** The last finger to go down on the screen: where, and whether it has travelled. */
  let touched: { id: number; x: number; y: number; travelled: boolean } | null = null;
  /** Takes away the window's listeners while a thing is held by a finger. */
  let unhold: (() => void) | null = null;

  /** The size of a thing to tap (--tap), which is also how near an edge the screen begins to scroll. */
  const tapSize = (): number => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tap')) || 44;

  /** What scrolls the screen: the first of it and its parents that has more to show than it shows. */
  function scroller(): HTMLElement | null {
    for (let node: HTMLElement | null = root; node; node = node.parentElement) {
      const overflow = getComputedStyle(node).overflowY;
      if ((overflow === 'auto' || overflow === 'scroll') && node.scrollHeight > node.clientHeight) return node;
    }
    const page = document.scrollingElement;
    return page instanceof HTMLElement && page.scrollHeight > page.clientHeight ? page : null;
  }

  /** The thing held by a finger is put back: no drop, no ghost, no marks. */
  function putBack(): void {
    const grip = held;
    unhold?.();
    if (!grip || grip.finger === null) return;
    held = null;
    endDrag(grip);
    showHolding();
    echoUntil = performance.now() + ECHO_MS;
  }

  function pickUp(target: Element): void {
    const from = target.closest<HTMLElement>('[data-drag]');
    const finger = touched;
    if (closed || !from || !root.contains(from) || !finger || finger.travelled || root.querySelector('.dialog-backdrop')) return;
    endDrag(held);
    unhold?.();
    const source = from.dataset['drag'] ?? '';
    const grip: Grip = { source, x: finger.x, y: finger.y, px: finger.x, py: finger.y, moved: false, shift: false, from, ghost: null, over: null, verdicts: new Map(), finger: finger.id };
    held = grip;
    focusKey = from.dataset['key'] ?? '';
    // a ship or wagon train is not picked up (dragging one does nothing), but letting go in place still looks it up
    if (!source.startsWith('carrier:')) {
      showHolding(source.split(':')[0]);
      grip.ghost = makeGhost(grip);
      grip.ghost.dataset['finger'] = '';
      grip.ghost.style.setProperty('--ghost-lift', `${GHOST_LIFT}px`);
      from.classList.add('token-lifted');
      root.append(grip.ghost);
      aim(grip, grip.x, grip.y);
    }
    /** Where the finger is now; the ghost stays where it was picked up until the finger has travelled. */
    let at = { x: finger.x, y: finger.y };
    let frame = 0;
    const edgeScroll = (): void => {
      frame = 0;
      if (held !== grip) return;
      const edge = tapSize();
      const way = at.y < edge ? -1 : at.y > window.innerHeight - edge ? 1 : 0;
      const pane = grip.moved && way !== 0 ? scroller() : null;
      if (pane) pane.scrollTop += way * EDGE_SCROLL_STEP; // the screen's scroll listener marks what is now under the finger
      frame = requestAnimationFrame(edgeScroll);
    };
    const mine = (event: PointerEvent): boolean => held === grip && event.pointerId === grip.finger;
    const onMove = (event: PointerEvent): void => {
      if (!mine(event)) return;
      at = { x: event.clientX, y: event.clientY };
      if (!grip.moved && Math.hypot(at.x - grip.x, at.y - grip.y) >= LONG_PRESS_TRAVEL) grip.moved = true;
      if (grip.moved) aim(grip, at.x, at.y);
    };
    const onUp = (event: PointerEvent): void => {
      if (!mine(event)) return;
      const { moved, source: what } = grip;
      const token = grip.from;
      putBack();
      if (!moved) {
        // held and let go in place: put back, and looked up
        const detail: LookUpDetail = { clientX: event.clientX, clientY: event.clientY };
        token.dispatchEvent(new CustomEvent(LOOK_UP, { bubbles: true, detail }));
        return;
      }
      if (what.startsWith('carrier:')) return;
      // the place under the finger, not under the ghost, is where it goes
      const place = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-drop]')?.dataset['drop'];
      if (!place) return;
      selected = what;
      void drop(what, place, false);
    };
    // a second finger, the browser taking the touch back, or a change of the window's size: put it back
    const onOther = (event: PointerEvent): void => {
      if (held === grip && event.pointerId !== grip.finger) putBack();
    };
    const onCancel = (event: PointerEvent): void => {
      if (mine(event)) putBack();
    };
    const capture = { capture: true } as const;
    window.addEventListener('pointermove', onMove, capture);
    window.addEventListener('pointerup', onUp, capture);
    window.addEventListener('pointercancel', onCancel, capture);
    window.addEventListener('pointerdown', onOther, capture);
    window.addEventListener('resize', putBack);
    frame = requestAnimationFrame(edgeScroll);
    unhold = () => {
      unhold = null;
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onMove, capture);
      window.removeEventListener('pointerup', onUp, capture);
      window.removeEventListener('pointercancel', onCancel, capture);
      window.removeEventListener('pointerdown', onOther, capture);
      window.removeEventListener('resize', putBack);
    };
  }

  root.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse') return;
    touched = { id: event.pointerId, x: event.clientX, y: event.clientY, travelled: false };
    if (held?.finger === undefined || held.finger === null) echoUntil = 0; // a new touch: whatever echoes it makes are its own
  });
  root.addEventListener('pointermove', (event) => {
    if (touched?.id === event.pointerId && Math.hypot(event.clientX - touched.x, event.clientY - touched.y) >= LONG_PRESS_TRAVEL) touched.travelled = true;
  });
  // A tap tells what resting the mouse on a thing tells: a square that cannot be worked, a building
  // and a refused button (which, disabled, has no click of its own) say their title in the help line.
  root.addEventListener('pointerup', (event) => {
    const finger = touched;
    if (event.pointerType === 'mouse' || finger?.id !== event.pointerId) return;
    touched = null;
    if (finger.travelled || held || !(event.target instanceof Element)) return;
    const titled = event.target.closest<HTMLElement>('button:disabled[title], .square[title], .building[title]');
    if (!titled || !root.contains(titled) || event.target.closest('.token') || (selected && !titled.matches('button'))) return;
    const help = root.querySelector<HTMLElement>('.colony-help');
    const status = root.querySelector<HTMLElement>('.colony-message');
    message = '';
    if (status) status.textContent = ''; // a message showing hides the help line
    if (help) help.textContent = titled.title;
  });
  root.addEventListener('pointercancel', (event) => {
    if (touched?.id === event.pointerId) touched = null;
  });
  // Once a thing is picked up, the screen does not scroll under the finger that holds it.
  root.addEventListener('touchmove', (event) => {
    if (held !== null && held.finger !== null && event.cancelable) event.preventDefault();
  }, { passive: false });
  const stopHolds = onLongPress(root, (target) => pickUp(target));
  // the first touch felt makes the pointer coarse: the help line speaks of fingers from then on
  const pointerWatch = new MutationObserver(() => {
    const help = root.querySelector<HTMLElement>('.colony-help');
    if (help) help.textContent = helpFor(root.querySelector<HTMLElement>('.token-selected'));
  });
  pointerWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-pointer'] });
  function stopFingers(): void {
    putBack();
    stopHolds();
    pointerWatch.disconnect();
  }
  // the host may take the screen away without asking it to close: the window's listeners go with it
  const gone = new MutationObserver(() => {
    if (root.isConnected) return;
    gone.disconnect();
    stopFingers();
  });
  gone.observe(parent, { childList: true });

  // --- keyboard ---------------------------------------------------------------------------------

  const focusables = (scope: ParentNode): HTMLElement[] => [...scope.querySelectorAll<HTMLElement>('button:not(:disabled)')];
  const REGIONS = ['settlement', 'area', 'people', 'multi', 'transport', 'warehouse', 'commands'];

  root.addEventListener('keydown', (event) => {
    if ((event.target as HTMLElement).closest('.dialog')) return;
    const active = document.activeElement as HTMLElement | null;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    const drag = active?.dataset['drag']?.split(':') ?? [];
    const handled = (): void => {
      event.preventDefault();
      event.stopPropagation();
    };
    focusKey = active?.dataset['key'] ?? focusKey;

    if (event.key === 'Escape') {
      handled();
      close();
      return;
    }
    if (event.key === 'Tab') {
      handled();
      const here = REGIONS.indexOf(active?.closest<HTMLElement>('[data-region]')?.dataset['region'] ?? '');
      for (let i = 1; i <= REGIONS.length; i++) {
        const next = REGIONS[(here + (event.shiftKey ? -i : i) + REGIONS.length * 2) % REGIONS.length];
        const first = focusables(root.querySelector(`[data-region="${next}"]`) ?? root)[0];
        if (first && first.closest('[data-region]')?.getAttribute('data-region') === next) {
          first.focus();
          return;
        }
      }
      return;
    }
    if (event.key.startsWith('Arrow')) {
      handled();
      const scope = active?.closest<HTMLElement>('[data-region]') ?? root;
      const list = focusables(scope);
      const at = active ? list.indexOf(active) : -1;
      const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
      list[(at + step + list.length) % list.length]?.focus();
      return;
    }
    if (event.key === 'Enter' && drag[0]) {
      if (drag[0] === 'colonist') {
        handled();
        void jobsMenu(drag[1] ?? '');
      } else if (drag[0] === 'unit') {
        handled();
        void ordersMenu(drag[1] ?? '');
      } else if (drag[0] === 'carrier') {
        handled();
        if (carrierId === drag[1]) {
          void ordersMenu(drag[1]);
          return;
        }
        carrierId = drag[1] ?? null;
        render();
      }
      return;
    }
    const view = colonyView(host.state(), colonyId);
    const carrier = view?.carriers.find((c) => c.id === carrierId);
    const needCarrier = (): boolean => {
      if (carrier) return true;
      tell('No ship or wagon train is here.');
      render();
      return false;
    };
    switch (key) {
      case '1':
      case '2':
      case '3':
        tab = TABS[Number(key) - 1] ?? tab;
        break;
      case 'm':
        tab = TABS[(TABS.indexOf(tab) + 1) % TABS.length] ?? tab;
        break;
      case 'n':
        showNumbers = !showNumbers;
        break;
      case 'c':
        handled();
        void constructionMenu();
        return;
      case 'b':
        handled();
        void buy();
        return;
      case 'x':
        handled();
        void exportsMenu();
        return;
      case 'F1':
        tell('Click someone and then a square or building (or drag them), or press Enter on someone for the jobs menu. L loads, U unloads, C changes the project, B buys it, Esc leaves.');
        break;
      case 'l':
        if (needCarrier() && carrier) attempt({ type: 'loadMostValuable', unitId: carrier.id });
        break;
      case '=':
      case '+': {
        if (!needCarrier() || !carrier) break;
        if (drag[0] !== 'good') {
          tell('Select a good in the warehouse first.');
          break;
        }
        const good = drag[1] as GoodId;
        const have = view?.warehouse.find((g) => g.good === good)?.amount ?? 0;
        handled();
        void (async () => {
          const amount = key === '+' ? await howMany(`Load how many ${good}?`, have) : Math.min(have, 100);
          if (amount > 0) attempt({ type: 'loadCargo', unitId: carrier.id, good, amount });
          render();
        })();
        return;
      }
      case 'u':
      case '-':
      case '_': {
        if (!needCarrier() || !carrier) break;
        const lot = drag[0] === 'cargo' ? carrier.cargo.find((g) => g.good === drag[2]) : carrier.cargo[0];
        if (!lot) {
          tell('There is no cargo aboard.');
          break;
        }
        handled();
        void (async () => {
          const amount = key === '_' ? await howMany(`Unload how many ${lot.good}?`, lot.amount) : lot.amount;
          if (amount > 0) attempt({ type: 'unloadCargo', unitId: carrier.id, good: lot.good, amount });
          render();
        })();
        return;
      }
      default:
        return;
    }
    handled();
    render();
  });

  parent.append(root);
  render();
  /** Shows the construction view and asks what to build next: for a colony whose project has just finished. */
  async function chooseProject(): Promise<void> {
    tab = 'construction';
    render();
    await constructionMenu();
  }

  return { element: root, refresh: render, chooseProject };
}

export type { ColonyView };
