// The command bar: a button in the sidebar for every map command, for play with the mouse.
// Each button runs the same command as its key; the lists of reports and menus come from the keyboard table.
// The dock (src/ui/dock.ts) is made of the same buttons, standing by the same rules.
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

/** The commands the dock carries in the compact layout (docs/specs/phone-play.md W2); the rest are under its More. */
export const DOCK_COMMANDS: readonly string[] = ['wait', 'skip', 'goTo', 'fortify', 'sentry', 'buildColony', 'endTurn'];

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

/** What the bar is told at each drawing; see `buttonLook`. */
export interface BarState {
  readonly hasUnit: boolean;
  readonly targeting: boolean;
  readonly europe: EuropeCall;
  readonly over: boolean;
  readonly explorer: boolean;
}

/** How a button stands in a state of the bar, wherever it is shown: the sidebar or the dock. */
export interface ButtonLook {
  readonly label: string;
  readonly title: string;
  readonly disabled: boolean;
  readonly hidden: boolean;
  /** The Europe button's `data-europe`: absent in the plain state. */
  readonly europe?: 'sea' | 'port';
}

/** A title naming `name`, then what the Europe button has to say, if anything. */
export const europeTitle = (name: string, europe: EuropeCall): string => (europe.note ? `${name}: ${europe.note}` : name);

/**
 * The orders are disabled unless a unit is waiting for them. While a Go To destination is being
 * picked the Go to button reads Cancel, and gives the targeting up. The Europe button shows whether
 * a ship in port is ready, or ships are at sea or under repair, by its `data-europe` and its title.
 * Once the game is `over` no order can be given: the orders, End turn's own work and Europe are
 * shut, and the End turn button reads The end and brings the end page back; looking (the terrain,
 * the zoom, the reports and the menus) goes on. The Explore button is shown only while the active
 * unit is one that may explore (a scout or a ship).
 */
export function buttonLook(button: CommandButton, { hasUnit, targeting, europe, over, explorer }: BarState): ButtonLook {
  const plain: ButtonLook = { label: button.label, title: `${button.label} (${button.keys})`, disabled: button.needsUnit && (!hasUnit || over), hidden: false };
  switch (button.id) {
    case 'explore':
      return { ...plain, hidden: !(hasUnit && explorer) };
    case 'endTurn': {
      const label = over ? END_BUTTON : button.label;
      return { ...plain, label, title: `${label} (Enter)` };
    }
    case 'goTo':
      return targeting
        ? { ...plain, label: CANCEL_LABEL, title: `${CANCEL_LABEL} (Esc)`, disabled: over }
        : { ...plain, disabled: over || !hasUnit };
    case 'europe':
      return { ...plain, title: europeTitle('Europe (E)', europe), disabled: over, ...(europe.state === 'none' ? {} : { europe: europe.state }) };
    default:
      return plain;
  }
}

export interface CommandBar {
  readonly element: HTMLElement;
  /** Show each button as `buttonLook` says for this state. */
  update(hasUnit: boolean, targeting: boolean, europe?: EuropeCall, over?: boolean, explorer?: boolean): void;
}

export interface BarOptions {
  /** Only these commands, in the bar's own order; every one when left out. */
  readonly only?: readonly string[];
  readonly className?: string;
  readonly label?: string;
  /** The data attribute (by its dataset name) each button carries its command in. */
  readonly attribute?: string;
}

export function createCommandBar(onPick: (button: CommandButton) => void, { only, className = 'command-bar', label = 'Commands', attribute = 'command' }: BarOptions = {}): CommandBar {
  const element = document.createElement('div');
  element.className = className;
  element.setAttribute('role', 'toolbar');
  element.setAttribute('aria-label', label);
  const made: [CommandButton, HTMLButtonElement][] = [];
  for (const button of COMMAND_BUTTONS) {
    if (only && !only.includes(button.id)) continue;
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = button.label;
    b.title = `${button.label} (${button.keys})`;
    b.dataset[attribute] = button.id;
    // the compact layout keeps these in the dock, and shows the rest under its More
    if (DOCK_COMMANDS.includes(button.id)) b.dataset['docked'] = '';
    if (button.wide) b.className = 'command-wide';
    // the map keeps the keyboard: a press on a button must not take the focus from it
    b.addEventListener('mousedown', (event) => event.preventDefault());
    b.addEventListener('click', () => onPick(button));
    made.push([button, b]);
    element.append(b);
  }
  let shown: string | null = null;
  return {
    element,
    update(hasUnit, targeting, europe = { state: 'none', note: '' }, over = false, explorer = false) {
      const state = `${hasUnit}|${targeting}|${europe.state}|${europe.note}|${over}|${explorer}`;
      if (shown === state) return;
      shown = state;
      for (const [button, b] of made) {
        const look = buttonLook(button, { hasUnit, targeting, europe, over, explorer });
        if (b.textContent !== look.label) b.textContent = look.label;
        b.title = look.title;
        b.disabled = look.disabled;
        b.hidden = look.hidden;
        if (look.europe) b.dataset['europe'] = look.europe;
        else delete b.dataset['europe'];
      }
    },
  };
}
