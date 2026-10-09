import { describe, expect, it } from 'vitest';
import { COMMAND_BUTTONS, MENU_CHOICES, REPORT_CHOICES } from '../../../src/ui/command-bar';
import { KEYMAP, mapCommandFor } from '../../../src/ui/keymap';

/** The command the keyboard gives for a button's key, as the button's table writes it. */
const viaKey = (key: string, shiftKey = false, altKey = false): string | null =>
  mapCommandFor({ key, code: altKey ? `Key${key.toUpperCase()}` : '', shiftKey, altKey });

describe('command bar', () => {
  it('is this set of buttons', () => {
    expect(COMMAND_BUTTONS.map((b) => `${b.label} [${b.keys}]${b.needsUnit ? ' unit' : ''}`)).toMatchInlineSnapshot(`
      [
        "Wait [W] unit",
        "Skip [Space] unit",
        "Go to [G] unit",
        "Fortify [F] unit",
        "Sentry [S] unit",
        "Build [B] unit",
        "Plow [P] unit",
        "Road [R] unit",
        "Route [T] unit",
        "Load [L] unit",
        "Unload [U] unit",
        "Dump [O] unit",
        "Centre [C] unit",
        "Disband [Shift-D] unit",
        "Terrain [H]",
        "End turn [Enter]",
        "Europe [E]",
        "Zoom + [Z]",
        "Zoom − [X]",
        "Reports… [F1-F10]",
        "Menu… [Alt+letter]",
      ]
    `);
    expect(new Set(COMMAND_BUTTONS.map((b) => b.id)).size).toBe(COMMAND_BUTTONS.length);
  });

  it('every button runs the command its key runs', () => {
    for (const b of COMMAND_BUTTONS) {
      if (typeof b.run === 'string') continue;
      expect(viaKey(b.run.key, b.keys.startsWith('Shift-')), b.label).toBe(b.run.command);
    }
  });

  it('between the buttons and the two lists, every command of the keyboard table can be had with the mouse', () => {
    const reachable = new Set<string>([...REPORT_CHOICES, ...MENU_CHOICES].map((c) => c.command));
    for (const b of COMMAND_BUTTONS) if (typeof b.run !== 'string') reachable.add(b.run.command);
    // the map itself answers these: a click moves or wakes a unit, and no mode needs choosing or cancelling
    for (const byPointer of ['move', 'activate', 'viewMode', 'moveMode', 'cancel']) reachable.add(byPointer);
    for (const binding of KEYMAP) if (binding.command) expect(reachable, binding.keys).toContain(binding.command);
  });

  it('lists the ten reports by function key and the six menus by letter', () => {
    expect(REPORT_CHOICES.map((c) => c.key)).toEqual(['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10']);
    expect(REPORT_CHOICES.map((c) => c.label)).toContain('Colonial Score');
    expect(REPORT_CHOICES.every((c) => !c.label.includes(':'))).toBe(true);
    expect(MENU_CHOICES.map((c) => `${c.label}=${c.command}:${c.key}`)).toEqual([
      'Trade menu=menu:t', 'Game options=menu:g', 'Save or load a game=menu:l', 'Sound options=menu:s', 'Encyclopedia=menu:p', 'Colony report options=menu:o',
      'Declare independence=declare:i', 'Retire=retire:r',
    ]);
    for (const c of MENU_CHOICES) expect(viaKey(c.key, c.command !== 'menu', c.command === 'menu'), c.label).toBe(c.command);
  });
});
