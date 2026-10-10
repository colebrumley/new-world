// The Europe screen (R-402), drawn as a harbour (R-1014): ships out on the water and alongside the
// quay, those waiting on the docks, the market as a row of stalls with bid and ask on a tag, the
// harbour-master's note of the last transaction, and three doors: Recruit, Purchase and Train.
import type { Action, GameEvent } from '../engine/actions';
import type { GoodId } from '../engine/data/goods';
import type { GameState } from '../engine/state';
import { ask, askText } from './dialog';
import { dockOptions, europeView, type EuropeVoyage } from './europe-model';
import { figureArt, flagArt, goodArt, type Sprite } from './pixel-art';
import { spriteCanvas } from './tiles';

export interface EuropeScreenHost {
  readonly state: () => GameState;
  readonly player: () => string;
  /** Apply an action; returns the events it caused, or null (after noting why) if it was refused. */
  readonly dispatch: (action: Action) => readonly GameEvent[] | null;
  readonly refusal: (action: Action) => string | null;
  readonly close: () => void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** How many screen pixels an art pixel is drawn at: of a ship out at sea and of one alongside (nearer, so larger), of a person, of a goods icon and of the Crown's crest. */
const SHIP_SCALE = 2;
const BERTH_SCALE = 3;
const FIGURE_SCALE = 2;
const GOOD_SCALE = 2;
const CREST_SCALE = 2;

/** The palette art by kind and name, made once each: a unit's figure, a good's icon, a flag. */
const drawn = new Map<string, Sprite | null>();
function artOf(kind: 'figure' | 'good' | 'flag', name: string): Sprite | null {
  const key = `${kind}:${name}`;
  if (!drawn.has(key)) drawn.set(key, kind === 'figure' ? figureArt(name) : kind === 'good' ? goodArt(name) : flagArt('crown'));
  return drawn.get(key) ?? null;
}

/** That art as a canvas `scale` times its grid, shown with crisp pixels and passed over by a screen reader; null if there is none by that name. */
function picture(kind: 'figure' | 'good' | 'flag', name: string, className: string, scale = 1): HTMLCanvasElement | null {
  const art = artOf(kind, name);
  if (!art) return null;
  const canvas = spriteCanvas(art);
  if (className) canvas.className = className;
  canvas.style.width = `${art.size * scale}px`;
  canvas.style.height = `${art.size * scale}px`;
  canvas.setAttribute('aria-hidden', 'true');
  return canvas;
}

export function openEuropeScreen(parent: HTMLElement, host: EuropeScreenHost): { element: HTMLElement; refresh(): void } {
  const root = el('section', 'europe-screen');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Europe');
  root.tabIndex = -1;
  let shipId: string | null = null;
  let monitor = '';
  let focusKey = '';

  const attempt = (action: Action): readonly GameEvent[] | null => {
    const why = host.refusal(action);
    if (why) {
      monitor = why;
      return null;
    }
    const events = host.dispatch(action);
    for (const e of events ?? []) {
      if (e.type === 'goodsSold') monitor = `Sold ${e.amount} ${e.good} for ${e.gross}, less ${e.tax} tax: ${e.net} gold`;
      else if (e.type === 'goodsBought') monitor = `Bought ${e.amount} ${e.good} for ${e.cost} gold`;
      else if (e.type === 'unitTrained' || e.type === 'unitPurchased') monitor = `Paid ${e.price} gold`;
      else if (e.type === 'equippedInEurope') monitor = e.cost >= 0 ? `Paid ${e.cost} gold` : `Received ${-e.cost} gold`;
      else if (e.type === 'immigrantArrived' && e.price !== null) monitor = `Paid ${e.price} gold for passage`;
      else if (e.type === 'boycottLifted') monitor = `Paid ${e.paid} gold in back taxes`;
    }
    return events;
  };

  async function howMany(question: string, most: number): Promise<number> {
    const answer = await askText(root, { text: `${question} (up to ${most})`, initial: String(most), maxLength: 3 });
    const n = Math.floor(Number(answer));
    return answer !== null && Number.isFinite(n) && n > 0 ? Math.min(n, most) : 0;
  }

  async function buy(good: GoodId, some: boolean): Promise<void> {
    if (!shipId) monitor = 'There is no ship in port to load.';
    else {
      const amount = some ? await howMany(`Buy how many ${good}?`, 100) : 100;
      if (amount > 0) attempt({ type: 'buyGoods', unitId: shipId, good, amount });
    }
    render();
  }

  async function sell(good: GoodId | null, some: boolean): Promise<void> {
    const view = europeView(host.state(), host.player());
    const ship = view?.inPort.find((s) => s.id === shipId);
    const lot = good ? ship?.cargo.find((c) => c.good === good) : ship?.cargo[0];
    if (!ship || !lot) monitor = 'There is no such cargo aboard.';
    else {
      const most = Math.min(100, lot.amount);
      const amount = some ? await howMany(`Sell how many ${lot.good}?`, most) : most;
      if (amount > 0) attempt({ type: 'sellGoods', unitId: ship.id, good: lot.good, amount });
    }
    render();
  }

  async function unloadAll(id: string): Promise<void> {
    for (let guard = 0; guard < 40; guard++) {
      const ship = europeView(host.state(), host.player())?.inPort.find((s) => s.id === id);
      const lot = ship?.cargo[0];
      if (!lot || !attempt({ type: 'sellGoods', unitId: id, good: lot.good, amount: Math.min(100, lot.amount) })) break;
    }
    render();
  }

  async function menu(text: string, entries: { label: string; action: Action }[]): Promise<void> {
    const labels = [...entries.map((e) => e.label), 'Never mind'];
    const pick = await ask(root, { text, choices: labels, escape: labels.length - 1 });
    const chosen = entries[pick];
    if (chosen) attempt(chosen.action);
    render();
  }

  const recruit = (): Promise<void> => {
    const view = europeView(host.state(), host.player());
    return menu(`Whose passage will you pay? It costs ${view?.recruitPrice ?? 0} gold.`, (view?.pool ?? []).map((p) => ({ label: p.label, action: { type: 'recruit', slot: p.slot } })));
  };
  const purchase = (): Promise<void> => {
    const view = europeView(host.state(), host.player());
    return menu('Purchase what?', (view?.purchase ?? []).map((p) => ({ label: `${p.label} (${p.price} gold)`, action: { type: 'purchaseUnit', unit: p.unit } })));
  };
  const train = (): Promise<void> => {
    const view = europeView(host.state(), host.player());
    return menu('Train whom at the Royal University?', (view?.train ?? []).map((t) => ({ label: `${t.label} (${t.price} gold)`, action: { type: 'trainUnit', profession: t.profession } })));
  };

  async function dockMenu(unitId: string): Promise<void> {
    const state = host.state();
    const unit = state.units[unitId];
    if (!unit) return;
    const entries: { label: string; action: Action }[] = [];
    if (shipId) entries.push({ label: 'Board the ship in port now', action: { type: 'boardInEurope', unitId, shipId } });
    entries.push(unit.orders === 'sentry'
      ? { label: 'Do not board the next ship', action: { type: 'setBoarding', unitId, board: false } }
      : { label: 'Board the next ship', action: { type: 'setBoarding', unitId, board: true } });
    for (const option of dockOptions(state, unitId)) entries.push({ label: option.label, action: { type: 'equipInEurope', unitId, role: option.role } });
    await menu('What shall this one do?', entries);
  }

  function button(label: string, key: string, onClick: () => void, className = 'europe-button'): HTMLButtonElement {
    const b = el('button', className, label);
    b.type = 'button';
    b.dataset['key'] = key;
    b.addEventListener('click', onClick);
    return b;
  }

  /** A token that is its picture first: the picture, its name, and (after a space, so the two read as two words) a line under it. */
  function token(className: string, key: string, art: HTMLCanvasElement | null, label: string, sub: string, onClick: () => void): HTMLButtonElement {
    const b = button('', key, onClick, `token ${className}`);
    if (art) b.append(art);
    b.append(el('span', 'token-label', label));
    if (sub) {
      b.append(' ', el('span', 'token-sub', sub));
      b.setAttribute('aria-label', `${label} ${sub}`); // its name whether or not the option to hide cargo names hides the label
    }
    return b;
  }

  function group(name: string, title: string): HTMLElement {
    const box = el('div', `europe-${name}`);
    box.dataset['region'] = name;
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', title);
    box.append(el('h3', '', title));
    return box;
  }
  /** Put new contents in a region, under its heading. */
  const fill = (box: HTMLElement, ...nodes: Node[]): void => box.replaceChildren(box.firstElementChild as Element, ...nodes);

  // The parts that stay: the header's fields, the regions, the stalls and the doors are made once, and a
  // change is written into them, so a price changes on its tag and the stall it hangs from is the same one.
  const header = el('header', 'europe-header');
  const crest = el('span', 'europe-crest');
  const crown = picture('flag', 'crown', '', CREST_SCALE);
  if (crown) crest.append(crown);
  const port = el('h2');
  const gold = el('span', 'europe-gold');
  const tax = el('span', 'europe-tax');
  header.append(crest, port, gold, tax, button('Leave (Esc)', 'leave', () => host.close(), 'europe-close'));

  const sea = group('sea', 'At sea');
  const harbor = group('harbor', 'In port');
  const docks = group('docks', 'On the docks');
  const market = group('market', 'Market (bid / ask)');
  const stalls = new Map<GoodId, { stall: HTMLButtonElement; tag: HTMLElement }>();
  const office = group('office', 'Offices');
  const door = (label: string, key: string, onClick: () => void): HTMLButtonElement => {
    const b = button('', key, onClick, 'europe-button europe-door');
    const leaf = el('span', 'door-leaf');
    leaf.setAttribute('aria-hidden', 'true');
    b.append(el('span', 'door-sign', label), leaf);
    return b;
  };
  office.append(door('Recruit (R)', 'recruit', () => void recruit()), door('Purchase (P)', 'purchase', () => void purchase()), door('Train (T)', 'train', () => void train()));

  const line = el('p', 'europe-monitor');
  line.dataset['field'] = 'europe-monitor';
  line.setAttribute('aria-live', 'polite');
  root.append(header, sea, harbor, docks, market, office, line);

  /** Write text into a part only when it has changed, so nothing that is the same is touched. */
  const write = (node: HTMLElement, text: string): void => {
    if (node.textContent !== text) node.textContent = text;
  };

  function render(): void {
    const view = europeView(host.state(), host.player());
    if (!view) {
      host.close();
      return;
    }
    if (shipId === null || !view.inPort.some((s) => s.id === shipId)) shipId = view.inPort[0]?.id ?? null;

    write(port, view.port);
    write(gold, `Treasury ${view.gold} gold`);
    write(tax, `Tax ${view.taxRate}%`);

    // Out on the water: those coming in head east for the quay, those bound for the New World west.
    const lanes = el('div', 'lanes');
    const lane = (title: string, ships: readonly EuropeVoyage[], name: 'in' | 'out'): HTMLElement => {
      const box = el('div', `lane lane-${name}`);
      box.append(el('span', 'row-title', title));
      for (const s of ships) {
        const berth = el('span', 'lane-berth');
        const art = picture('figure', s.type, `ship-art heads-${name === 'out' ? 'west' : 'east'}`, SHIP_SCALE);
        if (art) berth.append(art);
        berth.append(el('span', 'lane-ship', `${s.label}, ${s.turns} ${s.turns === 1 ? 'turn' : 'turns'}`));
        berth.append(button('Turn back', `turn:${s.id}`, () => {
          attempt({ type: 'reverseVoyage', unitId: s.id });
          render();
        }));
        box.append(berth);
      }
      if (ships.length === 0) box.append(el('span', 'empty', 'none'));
      return box;
    };
    lanes.append(lane('Expected soon:', view.expected, 'in'), lane('Bound for the New World:', view.outbound, 'out'));
    fill(sea, lanes);

    // Alongside: each ship lies at the quay, her cargo set down on it as crates, her passengers by them.
    const berths: HTMLElement[] = [];
    for (const ship of view.inPort) {
      const box = el('div', `europe-ship${ship.id === shipId ? ' europe-ship-active' : ''}`);
      box.dataset['ship'] = ship.id;
      const water = el('div', 'ship-water');
      water.append(token('token-carrier', `ship:${ship.id}`, picture('figure', ship.type, 'ship-art heads-east', BERTH_SCALE), `${ship.label} (${ship.used}/${ship.holds} holds)`, '', () => {
        shipId = ship.id;
        focusKey = `ship:${ship.id}`;
        render();
      }));
      const quay = el('div', 'ship-quay');
      for (const lot of ship.cargo) {
        quay.append(token('token-cargo', `cargo:${ship.id}:${lot.good}`, picture('good', lot.good, 'good-art', GOOD_SCALE), lot.name, String(lot.amount), () => {
          shipId = ship.id;
          void sell(lot.good, false);
        }));
      }
      for (const rider of ship.passengers) {
        quay.append(token('token-unit', `rider:${rider.id}`, picture('figure', rider.type, 'figure-art', FIGURE_SCALE), rider.label, '', () => {
          attempt({ type: 'landInEurope', unitId: rider.id });
          render();
        }));
      }
      const orders = el('div', 'ship-orders');
      orders.append(
        button('Set sail', `sail:${ship.id}`, () => {
          attempt({ type: 'sailFromEurope', unitId: ship.id });
          render();
        }),
        button('Sell all cargo', `unload:${ship.id}`, () => void unloadAll(ship.id)),
      );
      box.append(water, quay, orders);
      berths.push(box);
    }
    if (berths.length === 0) berths.push(el('p', 'empty', 'No ship is in port.'));
    fill(harbor, ...berths);

    const waiting: HTMLElement[] = view.docks.map((unit) =>
      token('token-unit', `dock:${unit.id}`, picture('figure', unit.type, 'figure-art', FIGURE_SCALE), `${unit.label}${unit.boarding ? '' : ' (staying)'}`, '', () => void dockMenu(unit.id)));
    if (waiting.length === 0) waiting.push(el('p', 'empty', 'Nobody is waiting.'));
    fill(docks, ...waiting);

    // The market: a stall to a good, set up the first time and kept; after that only the tags are rewritten.
    for (const p of view.prices) {
      let made = stalls.get(p.good);
      if (!made) {
        const stall = button('', `good:${p.good}`, () => void buy(p.good, false), 'token token-good');
        stall.dataset['good'] = p.good;
        const art = picture('good', p.good, 'good-art', GOOD_SCALE);
        if (art) stall.append(art);
        const tag = el('span', 'token-sub');
        stall.append(el('span', 'token-label', p.name), tag);
        made = { stall, tag };
        stalls.set(p.good, made);
        market.append(stall);
      }
      made.stall.classList.toggle('token-over', p.boycotted);
      write(made.tag, p.boycotted ? 'boycott' : `${p.bid}/${p.ask}`);
    }

    write(line, monitor);
    const again = focusKey ? root.querySelector<HTMLElement>(`[data-key="${focusKey}"]`) : null;
    (again ?? root.querySelector<HTMLElement>('.token-good') ?? root).focus();
  }

  root.addEventListener('keydown', (event) => {
    if ((event.target as HTMLElement).closest('.dialog')) return;
    const active = document.activeElement as HTMLElement | null;
    focusKey = active?.dataset['key'] ?? focusKey;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    const [kind, , third] = (active?.dataset['key'] ?? '').split(':');
    const good = (kind === 'good' ? active?.dataset['good'] : kind === 'cargo' ? third : null) as GoodId | null | undefined;
    const done = (): void => {
      event.preventDefault();
      event.stopPropagation();
    };
    if (event.key === 'Escape' || key === 'e') {
      done();
      host.close();
      return;
    }
    if (event.key.startsWith('Arrow')) {
      done();
      const all = [...root.querySelectorAll<HTMLElement>('button:not(:disabled)')];
      const at = active ? all.indexOf(active) : -1;
      const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
      all[(at + step + all.length) % all.length]?.focus();
      return;
    }
    switch (key) {
      case 'r':
      case '1':
        done();
        void recruit();
        return;
      case 'p':
      case '2':
        done();
        void purchase();
        return;
      case 't':
      case '3':
        done();
        void train();
        return;
      case 'l':
      case '=':
      case '+':
        done();
        if (kind === 'good' && good) void buy(good, key === '+');
        else {
          monitor = 'Select a good in the market first.';
          render();
        }
        return;
      case 'u':
      case '-':
      case '_':
        done();
        void sell(kind === 'cargo' && good ? good : null, key === '_');
        return;
      default:
    }
  });

  parent.append(root);
  render();
  return { element: root, refresh: render };
}
