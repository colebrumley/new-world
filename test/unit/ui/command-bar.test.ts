import { describe, expect, it } from 'vitest';
import { buttonLook, COMMAND_BUTTONS, DOCK_COMMANDS, MENU_CHOICES, REPORT_CHOICES } from '../../../src/ui/command-bar';
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
        "Explore [Shift-E] unit",
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
        "End turn [Enter]",
        "Terrain [H]",
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

  it('marks the Europe button by its state, and shuts it once the game is over', () => {
    const europe = COMMAND_BUTTONS.find((b) => b.id === 'europe')!;
    const state = { hasUnit: true, targeting: false, over: false, explorer: false } as const;
    expect(buttonLook(europe, { ...state, europe: { state: 'none', note: '' } })).toEqual({ label: 'Europe', title: 'Europe (E)', disabled: false, hidden: false });
    expect(buttonLook(europe, { ...state, europe: { state: 'port', note: 'ready' } })).toMatchObject({ title: 'Europe (E): ready', europe: 'port' });
    expect(buttonLook(europe, { ...state, over: true, europe: { state: 'sea', note: '' } })).toMatchObject({ disabled: true, europe: 'sea' });
  });

  it('shows Explore only to a unit that may explore', () => {
    const explore = COMMAND_BUTTONS.find((b) => b.id === 'explore')!;
    const state = { hasUnit: true, targeting: false, over: false, explorer: false, europe: { state: 'none', note: '' } } as const;
    expect(buttonLook(explore, state).hidden).toBe(true);
    expect(buttonLook(explore, { ...state, explorer: true }).hidden).toBe(false);
    expect(buttonLook(explore, { ...state, hasUnit: false, explorer: true }).hidden).toBe(true);
  });

  it('marks the commands the dock carries, and only those', () => {
    expect(COMMAND_BUTTONS.filter((b) => DOCK_COMMANDS.includes(b.id)).map((b) => b.id)).toEqual(['wait', 'skip', 'goTo', 'fortify', 'sentry', 'buildColony', 'endTurn']);
  });

  it('lists the ten reports by function key and the seven menus by letter', () => {
    expect(REPORT_CHOICES.map((c) => c.key)).toEqual(['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10']);
    expect(REPORT_CHOICES.map((c) => c.label)).toContain('Colonial Score');
    expect(REPORT_CHOICES.every((c) => !c.label.includes(':'))).toBe(true);
    expect(MENU_CHOICES.map((c) => `${c.label}=${c.command}:${c.key}`)).toEqual([
      'Trade menu=menu:t', 'Game options=menu:g', 'Save or load a game=menu:l', 'Sound options=menu:s', 'Encyclopedia=menu:p', 'Colony report options=menu:o', 'Cheats=menu:c',
      'Declare independence=declare:i', 'Retire=retire:r',
    ]);
    for (const c of MENU_CHOICES) expect(viaKey(c.key, c.command !== 'menu', c.command === 'menu'), c.label).toBe(c.command);
  });
});
