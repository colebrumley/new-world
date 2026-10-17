// The command bar: a button in the sidebar for every map command, for play with the mouse.
// Each button runs the same command as its key; the lists of reports and menus come from the keyboard table.
import { END_BUTTON } from './end-page';
import type { EuropeCall } from './europe-model';
import { KEYMAP, type MapCommand } from './keymap';

/** A command and the key it is run with (the handler tells Z from X, and one report or menu from another, by key). */
export interface BarCommand {
  readonly command: MapCommand;
  readonly key: string;
}

export interface CommandButton {
  readonly id: string;
  readonly label: string;
  /** The key that does the same, as written in docs/KEYS.md. */
  readonly keys: string;
  /** What a click runs: a command, or one of the two lists. */
  readonly run: BarCommand | 'reports' | 'menus';
  /** Orders for the active unit: disabled when none is waiting. */
  readonly needsUnit: boolean;
  readonly wide?: boolean;
}

const order = (id: MapCommand, label: string, keys: string, key: string): CommandButton => ({ id, label, keys, run: { command: id, key }, needsUnit: true });
const always = (id: MapCommand, label: string, keys: string, key: string, wide = false): CommandButton => ({ id, label, keys, run: { command: id, key }, needsUnit: false, ...(wide ? { wide } : {}) });

export const COMMAND_BUTTONS: readonly CommandButton[] = [
  order('wait', 'Wait', 'W', 'w'),
  order('skip', 'Skip', 'Space', ' '),
  order('goTo', 'Go to', 'G', 'g'),
  order('explore', 'Explore', 'Shift-E', 'e'),
  order('fortify', 'Fortify', 'F', 'f'),
  order('sentry', 'Sentry', 'S', 's'),
  order('buildColony', 'Build', 'B', 'b'),
  order('plow', 'Plow', 'P', 'p'),
  order('road', 'Road', 'R', 'r'),
  order('tradeRoute', 'Route', 'T', 't'),
  order('load', 'Load', 'L', 'l'),
  order('unload', 'Unload', 'U', 'u'),
  order('dump', 'Dump', 'O', 'o'),
  order('center', 'Centre', 'C', 'c'),
  order('disband', 'Disband', 'Shift-D', 'd'),
  always('endTurn', 'End turn', 'Enter', 'Enter', true),
  always('hiddenTerrain', 'Terrain', 'H', 'h'),
  always('europe', 'Europe', 'E', 'e'),
  always('zoomIn', 'Zoom +', 'Z', 'z'),
  always('zoomOut', 'Zoom −', 'X', 'x'),
  { id: 'reports', label: 'Reports…', keys: 'F1-F10', run: 'reports', needsUnit: false },
  { id: 'menus', label: 'Menu…', keys: 'Alt+letter', run: 'menus', needsUnit: false },
];

export interface BarChoice extends BarCommand {
  readonly label: string;
}

const title = (action: string): string => action.split(':')[0] ?? action;

/** What the Go to button reads while a destination is being picked. */
export const CANCEL_LABEL = 'Cancel';

/** The ten reports, in function-key order. */
export const REPORT_CHOICES: readonly BarChoice[] = KEYMAP
  .filter((b) => b.context === 'map' && b.command === 'report')
  .map((b) => ({ label: title(b.action), command: 'report', key: b.keys }));

/** The Alt menus, then the two decisions that end an era. */
export const MENU_CHOICES: readonly BarChoice[] = [
  ...KEYMAP
    .filter((b) => b.context === 'map' && b.command === 'menu')
    .map((b): BarChoice => ({ label: title(b.action), command: 'menu', key: b.keys.slice(-1).toLowerCase() })),
  { label: 'Declare independence', command: 'declare', key: 'i' },
  { label: 'Retire', command: 'retire', key: 'r' },
];

export interface CommandBar {
  readonly element: HTMLElement;
  /**
   * Enable or disable the orders, according to whether a unit is waiting for them. While a Go To
   * destination is being picked the Go to button reads Cancel, and gives the targeting up. The
   * Europe button shows whether a ship in port is ready, or ships are at sea or under repair, by
   * its `data-europe` and its title. Once the game is `over` no order can be given: the orders, End
   * turn's own work and Europe are shut, and the End turn button reads The end and brings the end
   * page back; looking (the terrain, the zoom, the reports and the menus) goes on. The Explore
   * button is shown only while the active unit is one that may explore (a scout or a ship).
   */
  update(hasUnit: boolean, targeting: boolean, europe?: EuropeCall, over?: boolean, explorer?: boolean): void;
}

export function createCommandBar(onPick: (button: CommandButton) => void): CommandBar {
  const element = document.createElement('div');
  element.className = 'command-bar';
  element.setAttribute('role', 'toolbar');
  element.setAttribute('aria-label', 'Commands');
  const orders: HTMLButtonElement[] = [];
  let goTo: HTMLButtonElement | null = null;
  let europeButton: HTMLButtonElement | null = null;
  let endTurn: HTMLButtonElement | null = null;
  let explore: HTMLButtonElement | null = null;
  for (const button of COMMAND_BUTTONS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = button.label;
    b.title = `${button.label} (${button.keys})`;
    b.dataset['command'] = button.id;
    if (button.wide) b.className = 'command-wide';
    // the map keeps the keyboard: a press on a button must not take the focus from it
    b.addEventListener('mousedown', (event) => event.preventDefault());
    b.addEventListener('click', () => onPick(button));
    if (button.needsUnit) orders.push(b);
    if (button.id === 'goTo') goTo = b;
    if (button.id === 'europe') europeButton = b;
    if (button.id === 'endTurn') endTurn = b;
    if (button.id === 'explore') explore = b;
    element.append(b);
  }
  let shown: string | null = null;
  return {
    element,
    update(hasUnit, targeting, europe = { state: 'none', note: '' }, over = false, explorer = false) {
      const state = `${hasUnit}|${targeting}|${europe.state}|${europe.note}|${over}|${explorer}`;
      if (shown === state) return;
      shown = state;
      for (const b of orders) b.disabled = !hasUnit || over;
      if (explore) explore.hidden = !(hasUnit && explorer);
      if (endTurn) {
        const label = over ? END_BUTTON : (COMMAND_BUTTONS.find((c) => c.id === 'endTurn')?.label ?? '');
        endTurn.textContent = label;
        endTurn.title = `${label} (Enter)`;
      }
      if (goTo) {
        const label = targeting ? CANCEL_LABEL : (COMMAND_BUTTONS.find((c) => c.id === 'goTo')?.label ?? '');
        goTo.textContent = label;
        goTo.title = targeting ? `${CANCEL_LABEL} (Esc)` : `${label} (G)`;
        goTo.disabled = over || (!hasUnit && !targeting);
      }
      if (europeButton) {
        europeButton.disabled = over;
        if (europe.state === 'none') delete europeButton.dataset['europe'];
        else europeButton.dataset['europe'] = europe.state;
        europeButton.title = europe.note ? `Europe (E): ${europe.note}` : 'Europe (E)';
      }
    },
  };
}
