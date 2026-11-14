// The dock (R-1072, docs/specs/phone-play.md W2): in the compact layout it stands in for the
// sidebar, under the map when the window is upright and at its right when sideways. It tells the
// date, the treasury, the active unit and the status line, and carries the commands a turn is
// mostly played with; More opens a sheet over the map holding the sidebar itself: the chart, the
// Location and Terrain rows, the lists, and every other command. The stylesheet does the placing,
// by data-layout and data-posture on <html> and data-sheet on the game's screen.
import type { EuropeCall } from './europe-model';
import { COMMAND_BUTTONS, createCommandBar, DOCK_COMMANDS, europeTitle, type CommandButton } from './command-bar';
import type { SidebarModel } from './sidebar';

/** What the More button reads; its title adds what the Europe button would say. */
export const MORE_LABEL = 'More';
export const CLOSE_LABEL = 'Close';

/** The commands the dock carries, in its order; More comes after them. */
export const DOCK_BUTTONS: readonly CommandButton[] = COMMAND_BUTTONS.filter((b) => DOCK_COMMANDS.includes(b.id));
/** Every other command of the bar: the ones the More sheet holds. */
export const SHEET_BUTTONS: readonly CommandButton[] = COMMAND_BUTTONS.filter((b) => !DOCK_COMMANDS.includes(b.id));

/** More holds Europe, so it carries the Europe button's `data-europe`, in every state, and says why in its title. */
export function moreLook(europe: EuropeCall): { readonly title: string; readonly europe?: 'sea' | 'port' } {
  return { title: europeTitle(MORE_LABEL, europe), ...(europe.state === 'none' ? {} : { europe: europe.state }) };
}

export interface Dock {
  readonly element: HTMLElement;
  readonly more: HTMLButtonElement;
  /** The same arguments the command bar takes, and the sidebar's text. */
  update(model: SidebarModel, hasUnit: boolean, targeting: boolean, europe?: EuropeCall, over?: boolean, explorer?: boolean): void;
}

/** `onPick` runs a command as the command bar's does; `onMore` opens the sheet. */
export function createDock(onPick: (button: CommandButton) => void, onMore: () => void): Dock {
  const element = document.createElement('section');
  element.className = 'dock';
  element.setAttribute('aria-label', 'Dock');

  const info = document.createElement('div');
  info.className = 'dock-info';
  const fields: Partial<Record<'date' | 'treasury' | 'unit' | 'moves' | 'orders' | 'status', HTMLElement>> = {};
  const line = (className: string, keys: readonly ('date' | 'treasury' | 'unit' | 'moves' | 'orders')[]): HTMLElement => {
    const p = document.createElement('p');
    p.className = className;
    for (const key of keys) {
      const span = document.createElement('span');
      span.dataset['dock'] = key;
      fields[key] = span;
      p.append(span);
    }
    return p;
  };
  const status = document.createElement('p');
  status.className = 'dock-status';
  status.dataset['dock'] = 'status';
  status.setAttribute('aria-live', 'polite');
  fields.status = status;
  info.append(line('dock-head', ['date', 'treasury']), line('dock-unit', ['unit', 'moves', 'orders']), status);

  // the dock's own buttons, under a name of their own: the sidebar's keep data-command to themselves
  const bar = createCommandBar(onPick, { only: DOCK_BUTTONS.map((b) => b.id), className: 'dock-commands', label: 'Dock commands', attribute: 'dockCommand' });
  const more = document.createElement('button');
  more.type = 'button';
  more.textContent = MORE_LABEL;
  more.title = MORE_LABEL;
  more.dataset['dockCommand'] = 'more';
  more.setAttribute('aria-haspopup', 'true');
  more.addEventListener('mousedown', (event) => event.preventDefault());
  more.addEventListener('click', onMore);
  bar.element.append(more);
  element.append(info, bar.element);

  let shown = '';
  return {
    element,
    more,
    update(model, hasUnit, targeting, europe = { state: 'none', note: '' }, over = false, explorer = false) {
      bar.update(hasUnit, targeting, europe, over, explorer);
      const said = `${europe.state}|${europe.note}`;
      if (said !== shown) {
        shown = said;
        const look = moreLook(europe);
        more.title = look.title;
        if (look.europe) more.dataset['europe'] = look.europe;
        else delete more.dataset['europe'];
      }
      for (const key of ['date', 'treasury', 'unit', 'moves', 'orders', 'status'] as const) {
        const node = fields[key];
        if (node && node.textContent !== model[key]) node.textContent = model[key];
      }
    },
  };
}

export interface Sheet {
  /** The sheet itself: a Close button over the sidebar, which it holds. */
  readonly element: HTMLElement;
  /** What lies over the rest of the screen while the sheet is open: a tap on it closes the sheet. */
  readonly backdrop: HTMLElement;
  isOpen(): boolean;
  open(): void;
  close(): void;
}

/**
 * Wrap `sidebar` in the More sheet. In the full layout the wrapper takes no box of its own, and the
 * sidebar stands where it always has; in the compact one it lies over the map while `screen`
 * carries data-sheet="open". A command chosen in it, or a tap on `chart`, closes it once the
 * thing's own handler has run (the click has bubbled up to the sidebar by then); so does a tap on
 * the backdrop or on Close. `onChange` runs after it opens or closes.
 */
export function createSheet(screen: HTMLElement, sidebar: HTMLElement, chart: HTMLElement, onChange: () => void): Sheet {
  const element = document.createElement('div');
  element.className = 'sheet';
  element.setAttribute('aria-label', 'More');
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'sheet-close';
  close.textContent = CLOSE_LABEL;
  close.addEventListener('mousedown', (event) => event.preventDefault());
  element.append(close, sidebar);
  const backdrop = document.createElement('div');
  backdrop.className = 'sheet-backdrop';

  const isOpen = (): boolean => screen.dataset['sheet'] === 'open';
  const set = (open: boolean): void => {
    if (open === isOpen()) return;
    if (open) screen.dataset['sheet'] = 'open';
    else delete screen.dataset['sheet'];
    onChange();
  };
  const shut = (): void => set(false);
  close.addEventListener('click', shut);
  // like Close, a press on the veil leaves the keyboard with the map
  backdrop.addEventListener('mousedown', (event) => event.preventDefault());
  backdrop.addEventListener('click', shut);
  sidebar.addEventListener('click', (event) => {
    const hit = event.target instanceof Element ? event.target : null;
    if (hit && (hit === chart || hit.closest('.command-bar button'))) shut();
  });
  return { element, backdrop, isOpen, open: () => set(true), close: shut };
}
