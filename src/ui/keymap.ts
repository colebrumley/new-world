// The keyboard map (Appendix K). One table drives the key handlers and docs/KEYS.md.

export type KeyContext = 'map' | 'colony' | 'europe' | 'dialog';

export type MapCommand =
  | 'move' | 'activate' | 'wait' | 'skip' | 'fortify' | 'sentry' | 'buildColony' | 'plow' | 'road' | 'goTo'
  | 'load' | 'unload' | 'dump' | 'tradeRoute' | 'disband' | 'declare' | 'retire' | 'viewMode' | 'moveMode' | 'europe' | 'zoomIn'
  | 'zoomOut' | 'hiddenTerrain' | 'center' | 'endTurn' | 'report' | 'menu' | 'cancel';

export interface KeyBinding {
  readonly context: KeyContext;
  /** How the key is written in the documentation. */
  readonly keys: string;
  readonly action: string;
  /** Map commands only: what the handler runs. */
  readonly command?: MapCommand;
  /** Requirement that brings the feature, for keys documented ahead of it. */
  readonly arrivesWith?: string;
}

export const KEYMAP: readonly KeyBinding[] = [
  { context: 'map', keys: 'Arrows, numpad 1-9, Home/End/PgUp/PgDn', action: 'Move the active unit one square (view mode: pan the view)', command: 'move' },
  { context: 'map', keys: 'A', action: 'Activate: clear the orders of the unit under the cursor or the active unit', command: 'activate' },
  { context: 'map', keys: 'W', action: 'Wait: go on to the next unit and come back to this one later', command: 'wait' },
  { context: 'map', keys: 'Space', action: 'No orders: skip this unit for the turn', command: 'skip' },
  { context: 'map', keys: 'F', action: 'Fortify', command: 'fortify' },
  { context: 'map', keys: 'S', action: 'Sentry', command: 'sentry' },
  { context: 'map', keys: 'B', action: 'Build a colony, or join the colony on this square', command: 'buildColony' },
  { context: 'map', keys: 'P', action: 'Pioneer: clear forest or plow', command: 'plow' },
  { context: 'map', keys: 'R', action: 'Pioneer: build a road', command: 'road' },
  { context: 'map', keys: 'G', action: 'Go to: choose a colony from the list (a ship that can reach the Sea Lane is offered Europe first), or pick a square with the arrows or the mouse and Enter', command: 'goTo' },
  { context: 'map', keys: 'L', action: 'Load the most valuable cargo in this colony', command: 'load' },
  { context: 'map', keys: 'U', action: 'Unload cargo into this colony', command: 'unload' },
  { context: 'map', keys: 'O', action: 'Dump cargo overboard', command: 'dump' },
  { context: 'map', keys: 'T', action: 'Begin a trade route', command: 'tradeRoute' },
  { context: 'map', keys: 'Shift-D', action: 'Disband the active unit', command: 'disband' },
  { context: 'map', keys: 'Shift-R', action: 'Retire: end the game now and have it scored (asks first)', command: 'retire' },
  { context: 'map', keys: 'Shift-I', action: 'Declare independence (asks first; needs half the colonists behind it)', command: 'declare' },
  { context: 'map', keys: 'V', action: 'View mode: move a cursor instead of a unit', command: 'viewMode' },
  { context: 'map', keys: 'M', action: 'Move mode', command: 'moveMode' },
  { context: 'map', keys: 'E', action: 'Open the Europe screen', command: 'europe' },
  { context: 'map', keys: 'Z / X', action: 'Zoom in / zoom out (15x12, 30x24, 60x48, 120x96 squares)', command: 'zoomIn' },
  { context: 'map', keys: 'H', action: 'Show hidden terrain until the next key', command: 'hiddenTerrain' },
  { context: 'map', keys: 'C', action: 'Centre the view on the active unit', command: 'center' },
  { context: 'map', keys: 'Enter', action: 'End the turn', command: 'endTurn' },
  { context: 'map', keys: 'F1', action: 'Terrain Information', command: 'report' },
  { context: 'map', keys: 'F2', action: 'Religious Adviser: crosses, who is waiting to come over, missions', command: 'report' },
  { context: 'map', keys: 'F3', action: 'Continental Congress report', command: 'report' },
  { context: 'map', keys: 'F4', action: 'Labor Adviser: colonists by occupation and where they are', command: 'report' },
  { context: 'map', keys: 'F5', action: 'Economic Adviser: treasury, prices and trade', command: 'report' },
  { context: 'map', keys: 'F6', action: 'Colony Adviser: every colony and its warehouse', command: 'report' },
  { context: 'map', keys: 'F7', action: 'Naval Adviser: ships, where bound, cargo', command: 'report' },
  { context: 'map', keys: 'F8', action: 'Foreign Affairs report', command: 'report' },
  { context: 'map', keys: 'F9', action: 'Indian Adviser: the native peoples and their mood', command: 'report' },
  { context: 'map', keys: 'F10', action: 'Colonial Score', command: 'report' },
  { context: 'map', keys: 'Alt+T', action: 'Trade menu: create, edit or delete a trade route', command: 'menu' },
  { context: 'map', keys: 'Alt+G', action: 'Game options: foreign and native moves, end of turn, autosave, combat analysis, hints', command: 'menu' },
  { context: 'map', keys: 'Alt+L', action: 'Save or load a game: ten slots, export to a file, import from one', command: 'menu' },
  { context: 'map', keys: 'Alt+S', action: 'Sound options: background music, event music, sound effects', command: 'menu' },
  { context: 'map', keys: 'Alt+P', action: 'Encyclopedia', command: 'menu' },
  { context: 'map', keys: 'Right-click', action: 'Open the encyclopedia at whatever is under the pointer (a unit, the terrain, a building, a cargo, a colonist)' },
  { context: 'map', keys: 'Alt+O', action: 'Colony report options: labels, and which colony news is reported', command: 'menu' },
  { context: 'map', keys: 'Esc', action: 'Cancel (Go To targeting, panels)', command: 'cancel' },
  { context: 'map', keys: 'Click / drag / pointer at edge', action: 'Centre on a square (or open your colony there) / pan / scroll the view' },
  { context: 'map', keys: 'Click on your unit', action: 'Make it the active unit, waking it if it has orders (a list if several stand there)' },
  { context: 'map', keys: 'Click beside the active unit', action: 'Move it one square' },
  { context: 'map', keys: 'Drag from the active unit', action: 'Send it to the square where the button is let go: one step if adjacent, Go To if farther' },
  { context: 'map', keys: 'Wheel', action: 'Zoom in / zoom out about the pointer' },
  { context: 'map', keys: 'Sidebar buttons', action: 'Every order, End Turn, Europe, zoom, the reports and the menus, for play without the keyboard' },
  { context: 'map', keys: 'Enter (view mode, on your colony)', action: 'Open the colony' },
  { context: 'map', keys: 'Click on the New World view', action: 'Centre the view there' },

  { context: 'dialog', keys: 'Arrows', action: 'Move the highlight' },
  { context: 'dialog', keys: 'Enter', action: 'Choose the highlighted answer' },
  { context: 'dialog', keys: 'Esc', action: 'Take the cautious answer' },

  { context: 'colony', keys: 'Tab', action: 'Cycle through the views' },
  { context: 'colony', keys: 'Arrows', action: 'Move the highlight' },
  { context: 'colony', keys: 'Enter', action: 'Jobs and orders menu' },
  { context: 'colony', keys: 'L / = / +', action: 'Load the most valuable cargo / a hold of the selected good / some of it' },
  { context: 'colony', keys: 'U / - / _', action: 'Unload the first cargo / all of the selected cargo / some of it' },
  { context: 'colony', keys: 'M', action: 'Step the multi-function view on' },
  { context: 'colony', keys: '1 / 2 / 3', action: 'Production / units / construction view' },
  { context: 'colony', keys: 'N', action: 'Production numbers' },
  { context: 'colony', keys: 'C', action: 'Construction menu' },
  { context: 'colony', keys: 'B', action: 'Buy the item under construction' },
  { context: 'colony', keys: 'X', action: 'Custom House exports' },
  { context: 'colony', keys: 'F1', action: 'Information' },
  { context: 'colony', keys: 'Esc', action: 'Leave the colony' },
  { context: 'colony', keys: 'Drag (Shift-drag for part)', action: 'Move people between squares, buildings and the gates; goods between warehouse and holds' },

  { context: 'europe', keys: 'R or 1', action: 'Recruit' },
  { context: 'europe', keys: 'P or 2', action: 'Purchase' },
  { context: 'europe', keys: 'T or 3', action: 'Train' },
  { context: 'europe', keys: 'L / = / +', action: 'Buy a hold of the selected good (+ asks how many)' },
  { context: 'europe', keys: 'U / - / _', action: 'Sell the selected cargo, or the first aboard (_ asks how many)' },
  { context: 'europe', keys: 'Arrows', action: 'Move the highlight' },
  { context: 'europe', keys: 'Esc or E', action: 'Leave Europe' },
];

const TITLES: Readonly<Record<KeyContext, string>> = { map: 'Map', dialog: 'Pop-up questions', colony: 'Colony screen', europe: 'Europe screen' };

/** The text of docs/KEYS.md. */
export function renderKeysDoc(): string {
  const lines = [
    '# Keyboard map',
    '',
    'Generated from `src/ui/keymap.ts` (the table the key handlers use). Do not edit by hand:',
    'run `UPDATE_FIXTURES=1 npm test` after changing the table.',
  ];
  for (const context of ['map', 'dialog', 'colony', 'europe'] as const) {
    lines.push('', `## ${TITLES[context]}`, '', '| Key | Action | Status |', '|---|---|---|');
    for (const b of KEYMAP.filter((k) => k.context === context)) {
      lines.push(`| ${b.keys} | ${b.action} | ${b.arrivesWith ? `arrives with ${b.arrivesWith}` : 'works'} |`);
    }
  }
  return `${lines.join('\n')}\n`;
}

/** Map a key event to a map command. */
export function mapCommandFor(event: { key: string; code: string; shiftKey: boolean; altKey: boolean }): MapCommand | null {
  if (event.altKey) return /^Key[A-Z]$/.test(event.code) ? 'menu' : null;
  if (/^F([1-9]|10)$/.test(event.key)) return 'report';
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (event.shiftKey && key === 'd') return 'disband';
  if (event.shiftKey && key === 'i') return 'declare';
  if (event.shiftKey && key === 'r') return 'retire';
  switch (key) {
    case 'a': return 'activate';
    case 'w': return 'wait';
    case ' ': return 'skip';
    case 'f': return 'fortify';
    case 's': return 'sentry';
    case 'b': return 'buildColony';
    case 'p': return 'plow';
    case 'r': return 'road';
    case 'g': return 'goTo';
    case 'l': return 'load';
    case 'u': return 'unload';
    case 'o': return 'dump';
    case 't': return 'tradeRoute';
    case 'v': return 'viewMode';
    case 'm': return 'moveMode';
    case 'e': return 'europe';
    case 'z': return 'zoomIn';
    case 'x': return 'zoomOut';
    case 'h': return 'hiddenTerrain';
    case 'c': return 'center';
    case 'Enter': return 'endTurn';
    case 'Escape': return 'cancel';
    default: return null;
  }
}
