// The Europe screen (R-402): ships at sea and in port, the docks, the market with bid and ask,
// a line for the last transaction, and Recruit / Purchase / Train.
import type { Action, GameEvent } from '../engine/actions';
import type { GoodId } from '../engine/data/goods';
import type { GameState } from '../engine/state';
import { ask, askText } from './dialog';
import { dockOptions, europeView } from './europe-model';

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

  function group(name: string, title: string): HTMLElement {
    const box = el('div', `europe-${name}`);
    box.dataset['region'] = name;
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', title);
    box.append(el('h3', '', title));
    return box;
  }

  function render(): void {
    const view = europeView(host.state(), host.player());
    if (!view) {
      host.close();
      return;
    }
    if (shipId === null || !view.inPort.some((s) => s.id === shipId)) shipId = view.inPort[0]?.id ?? null;
    root.replaceChildren();

    const header = el('header', 'europe-header');
    header.append(el('h2', '', view.port), el('span', 'europe-gold', `Treasury ${view.gold} gold`), el('span', 'europe-tax', `Tax ${view.taxRate}%`));
    header.append(button('Leave (Esc)', 'leave', () => host.close(), 'europe-close'));

    const sea = group('sea', 'At sea');
    const lanes = el('div', 'lanes');
    const lane = (title: string, ships: typeof view.expected, name: string): HTMLElement => {
      const box = el('div', `lane lane-${name}`);
      box.append(el('span', 'row-title', title));
      for (const s of ships) {
        box.append(el('span', 'lane-ship', `${s.label}, ${s.turns} ${s.turns === 1 ? 'turn' : 'turns'}`));
        box.append(button('Turn back', `turn:${s.id}`, () => {
          attempt({ type: 'reverseVoyage', unitId: s.id });
          render();
        }));
      }
      if (ships.length === 0) box.append(el('span', 'empty', 'none'));
      return box;
    };
    lanes.append(lane('Expected soon:', view.expected, 'in'), lane('Bound for the New World:', view.outbound, 'out'));
    sea.append(lanes);

    const harbor = group('harbor', 'In port');
    for (const ship of view.inPort) {
      const box = el('div', `europe-ship${ship.id === shipId ? ' europe-ship-active' : ''}`);
      box.dataset['ship'] = ship.id;
      box.append(button(`${ship.label} (${ship.used}/${ship.holds} holds)`, `ship:${ship.id}`, () => {
        shipId = ship.id;
        focusKey = `ship:${ship.id}`;
        render();
      }, 'token token-carrier'));
      for (const lot of ship.cargo) {
        box.append(button(`${lot.name} ${lot.amount}`, `cargo:${ship.id}:${lot.good}`, () => {
          shipId = ship.id;
          void sell(lot.good, false);
        }, 'token token-cargo'));
      }
      for (const rider of ship.passengers) {
        box.append(button(rider.label, `rider:${rider.id}`, () => {
          attempt({ type: 'landInEurope', unitId: rider.id });
          render();
        }, 'token token-unit'));
      }
      box.append(
        button('Set sail', `sail:${ship.id}`, () => {
          attempt({ type: 'sailFromEurope', unitId: ship.id });
          render();
        }),
        button('Sell all cargo', `unload:${ship.id}`, () => void unloadAll(ship.id)),
      );
      harbor.append(box);
    }
    if (view.inPort.length === 0) harbor.append(el('p', 'empty', 'No ship is in port.'));

    const docks = group('docks', 'On the docks');
    for (const unit of view.docks) {
      docks.append(button(`${unit.label}${unit.boarding ? '' : ' (staying)'}`, `dock:${unit.id}`, () => void dockMenu(unit.id), 'token token-unit'));
    }
    if (view.docks.length === 0) docks.append(el('p', 'empty', 'Nobody is waiting.'));

    const market = group('market', 'Market (bid / ask)');
    for (const p of view.prices) {
      const b = button('', `good:${p.good}`, () => void buy(p.good, false), `token token-good${p.boycotted ? ' token-over' : ''}`);
      b.dataset['good'] = p.good;
      b.append(el('span', 'token-label', p.name), el('span', 'token-sub', p.boycotted ? 'boycott' : `${p.bid}/${p.ask}`));
      market.append(b);
    }

    const office = group('office', 'Offices');
    office.append(button('Recruit (R)', 'recruit', () => void recruit()), button('Purchase (P)', 'purchase', () => void purchase()), button('Train (T)', 'train', () => void train()));

    const line = el('p', 'europe-monitor', monitor);
    line.dataset['field'] = 'europe-monitor';
    line.setAttribute('aria-live', 'polite');

    root.append(header, sea, harbor, docks, market, office, line);
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
