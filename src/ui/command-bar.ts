// The command bar: a button in the sidebar for every map command, for play with the mouse.
// Each button runs the same command as its key; the lists of reports and menus come from the keyboard table.
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
  always('hiddenTerrain', 'Terrain', 'H', 'h'),
  always('endTurn', 'End turn', 'Enter', 'Enter', true),
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
   * destination is being picked the Go to button reads Cancel, and gives the targeting up.
   */
  update(hasUnit: boolean, targeting: boolean): void;
}

export function createCommandBar(onPick: (button: CommandButton) => void): CommandBar {
  const element = document.createElement('div');
  element.className = 'command-bar';
  element.setAttribute('role', 'toolbar');
  element.setAttribute('aria-label', 'Commands');
  const orders: HTMLButtonElement[] = [];
  let goTo: HTMLButtonElement | null = null;
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
    element.append(b);
  }
  let shown: string | null = null;
  return {
    element,
    update(hasUnit, targeting) {
      const state = `${hasUnit}${targeting}`;
      if (shown === state) return;
      shown = state;
      for (const b of orders) b.disabled = !hasUnit;
      if (goTo) {
        const label = targeting ? CANCEL_LABEL : (COMMAND_BUTTONS.find((c) => c.id === 'goTo')?.label ?? '');
        goTo.textContent = label;
        goTo.title = targeting ? `${CANCEL_LABEL} (Esc)` : `${label} (G)`;
        goTo.disabled = !hasUnit && !targeting;
      }
    },
  };
}
