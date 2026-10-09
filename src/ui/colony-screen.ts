// The colony screen (R-308): settlement view, area view, people, transport, warehouse and the
// multi-function panel, all drawn from colonyView(). People, units and goods are moved by
// dragging, by clicking them and then where they should go, or with the keyboard; clicking
// someone already selected opens the jobs menu.
import { squareStatus } from '../engine/jobs';
import { landPrice } from '../engine/land';
import type { Action } from '../engine/actions';
import { COLONIST_ROLES } from '../engine/data/equipment';
import type { GoodId } from '../engine/data/goods';
import type { GameState, Job } from '../engine/state';
import { colonyView, jobChoices, type ColonyView, type PersonView } from './colony-model';
import { ask, askText } from './dialog';
import { lookOf, paintTile } from './tiles';

export interface ColonyScreenHost {
  /** The current game state (it changes as actions are applied). */
  readonly state: () => GameState;
  /** Apply an action; returns false (after showing why) if it was refused. */
  readonly dispatch: (action: Action) => boolean;
  /** Reason for refusing an action, or null if it would be accepted. */
  readonly refusal: (action: Action) => string | null;
  readonly close: () => void;
}

type Tab = 'production' | 'units' | 'construction';
const TABS: readonly Tab[] = ['production', 'units', 'construction'];
const TAB_TITLES: Readonly<Record<Tab, string>> = { production: 'Production', units: 'Units', construction: 'Construction' };
const TILE = 64;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

export function openColonyScreen(parent: HTMLElement, colonyId: string, host: ColonyScreenHost): { element: HTMLElement; refresh(): void } {
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

  async function drop(source: string, target: string, partial: boolean): Promise<void> {
    const [kind, id, extra] = source.split(':') as [string, string, string | undefined];
    if (kind === 'colonist') {
      if (target === 'outside') attempt({ type: 'leaveColony', colonyId, colonistId: id });
      else {
        const ours = await settleLand(target);
        const job = ours ? jobForTarget(target, id) : null;
        if (job) attempt({ type: 'assignJob', colonyId, colonistId: id, job });
        else tell(ours ? 'Nothing can be produced there.' : 'The land stays with the natives.');
      }
    } else if (kind === 'unit') {
      // a unit dragged into the colony joins it, then takes the job it was dropped on
      if (target === 'outside' || target === 'warehouse' || target.startsWith('carrier')) return;
      if (attempt({ type: 'joinColony', unitId: id })) {
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
    const answer = await askText(root, { text: `${question} (up to ${most})`, initial: String(most), maxLength: 4 });
    const n = Math.floor(Number(answer));
    return answer !== null && Number.isFinite(n) && n > 0 ? Math.min(n, most) : 0;
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
    else if (pick === labels.length - 2) attempt({ type: 'leaveColony', colonyId, colonistId });
    focusKey = `colonist:${colonistId}`;
    render();
  }

  async function ordersMenu(unitId: string): Promise<void> {
    const options: { label: string; action: Action }[] = [{ label: 'Join the colony', action: { type: 'joinColony', unitId } }];
    for (const role of COLONIST_ROLES) {
      const action: Action = { type: 'equip', unitId, role };
      if (host.refusal(action) === null) options.push({ label: role === 'colonist' ? 'Lay down equipment' : `Equip as ${role}`, action });
    }
    options.push({ label: 'Sentry', action: { type: 'setOrders', unitId, orders: 'sentry' } }, { label: 'Fortify', action: { type: 'setOrders', unitId, orders: 'fortify' } });
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

  function token(kind: string, id: string, label: string, sub: string, extra = ''): HTMLButtonElement {
    const b = el('button', `token token-${kind}`);
    b.type = 'button';
    b.dataset['drag'] = extra ? `${kind}:${id}:${extra}` : `${kind}:${id}`;
    b.dataset['key'] = `${kind}:${id}${extra ? `:${extra}` : ''}`;
    b.append(el('span', 'token-label', label));
    if (sub) b.append(el('span', 'token-sub', sub));
    return b;
  }

  const personToken = (kind: 'colonist' | 'unit', p: PersonView): HTMLButtonElement => token(kind, p.id, p.label, p.doing);

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
    const view = colonyView(host.state(), colonyId);
    if (!view) {
      host.close();
      return;
    }
    if (carrierId === null || !view.carriers.some((c) => c.id === carrierId)) carrierId = view.carriers[0]?.id ?? null;
    root.replaceChildren();
    root.dataset['colony'] = view.id;
    root.dataset['tab'] = tab;
    root.classList.toggle('hide-numbers', !showNumbers);

    const header = el('header', 'colony-header');
    header.append(
      el('h2', '', view.name),
      el('span', 'colony-pop', `Population ${view.population}`),
      el('span', 'colony-sol', `Sons of Liberty ${view.solPercent}%`),
      el('span', 'colony-tory', `Tories ${view.toryPercent}%`),
    );
    const done = el('button', 'colony-close', 'Exit (Esc)');
    done.type = 'button';
    done.addEventListener('click', () => host.close());

    const settlement = region('settlement', 'Settlement');
    for (const b of view.buildings) {
      const box = el('div', 'building');
      box.dataset['building'] = b.id;
      if (b.trade) box.dataset['drop'] = `trade:${b.trade}`;
      box.append(el('span', 'building-name', b.name));
      const slots = el('div', 'building-slots');
      for (const w of b.workers) slots.append(personToken('colonist', w));
      for (let free = b.workers.length; free < b.capacity; free++) slots.append(el('span', 'slot-free'));
      box.append(slots);
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
      const pick = token('carrier', c.id, c.label, `${c.used}/${c.holds} holds`);
      box.append(pick);
      for (const lot of c.cargo) box.append(token('cargo', c.id, lot.name, String(lot.amount), lot.good));
      for (const p of c.passengers) box.append(el('span', 'passenger', p.label));
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
      const t = token('good', g.good, g.name, g.exported ? `${g.amount} export` : String(g.amount));
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
        row.append(el('th', '', line.name), el('td', '', `+${line.made}`), el('td', '', line.used ? `-${line.used}` : ''), el('td', '', `${line.net >= 0 ? '+' : ''}${line.net}`));
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
        el('p', 'construction-item', c.item ? `Building: ${c.item}` : 'Building nothing'),
        el('p', 'construction-progress', c.item ? `Hammers ${c.hammers}/${c.hammersNeeded}, tools ${Math.min(c.tools, c.toolsNeeded)}/${c.toolsNeeded}` : `Hammers stored: ${c.hammers}`),
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
    showHolding();
    root.append(el('p', 'colony-help', helpFor(picked?.querySelector('.token-label')?.textContent ?? '')), done);
    const again = focusKey ? root.querySelector<HTMLElement>(`[data-key="${focusKey}"]`) : null;
    (again ?? root.querySelector<HTMLElement>('.token') ?? root).focus();
  }

  /** Marks the screen with the kind of thing in hand, so the places it can go light up. */
  function showHolding(kind = selected.split(':')[0] ?? ''): void {
    root.dataset['holding'] = kind;
  }

  function helpFor(name: string): string {
    const kind = selected.split(':')[0];
    if (kind === 'colonist') return `${name} selected: click a square or a building to put them to work there, or click them again for the jobs menu.`;
    if (kind === 'unit') return `${name} selected: click a square or a building to have them join the colony there, or click them again for orders.`;
    if (kind === 'good') return `${name} selected: click a ship or wagon train to load a hold of it (Shift for part).`;
    if (kind === 'cargo') return `${name} selected: click the warehouse to unload it, or another ship or wagon train to move it (Shift for part).`;
    return 'Click a colonist, then a square or a building, to put them to work there (or drag them); click them again for the jobs menu. Move goods between the warehouse and a hold the same way. Right-click anything to look it up.';
  }

  // --- pointer: press, move, release ----------------------------------------------------------

  let held: { source: string; x: number; y: number; moved: boolean; shift: boolean } | null = null;
  root.addEventListener('mousedown', (event) => {
    const from = (event.target as HTMLElement).closest<HTMLElement>('[data-drag]');
    if (!from || event.button !== 0) return;
    held = { source: from.dataset['drag'] ?? '', x: event.clientX, y: event.clientY, moved: false, shift: event.shiftKey };
    focusKey = from.dataset['key'] ?? '';
    if (!held.source.startsWith('carrier:')) showHolding(held.source.split(':')[0]);
  });
  root.addEventListener('mousemove', (event) => {
    if (held && Math.hypot(event.clientX - held.x, event.clientY - held.y) > 4) held.moved = true;
  });
  root.addEventListener('mouseup', (event) => {
    const grip = held;
    held = null;
    if (event.button !== 0) return;
    showHolding();
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
        if (cargo) void drop(selected, `carrier:${id}`, event.shiftKey);
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

  // --- keyboard ---------------------------------------------------------------------------------

  const focusables = (scope: ParentNode): HTMLElement[] => [...scope.querySelectorAll<HTMLElement>('button:not(:disabled)')];
  const REGIONS = ['settlement', 'area', 'people', 'multi', 'transport', 'warehouse'];

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
      host.close();
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
  return { element: root, refresh: render };
}

export type { ColonyView };
