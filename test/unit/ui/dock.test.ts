import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buttonLook, CANCEL_LABEL, COMMAND_BUTTONS, type BarState } from '../../../src/ui/command-bar';
import { DOCK_BUTTONS, MORE_LABEL, moreLook, SHEET_BUTTONS } from '../../../src/ui/dock';
import { END_BUTTON } from '../../../src/ui/end-page';
import type { EuropeCall } from '../../../src/ui/europe-model';

// The dock (R-1072, docs/specs/phone-play.md W2).

const EUROPE: readonly EuropeCall[] = [
  { state: 'none', note: '' },
  { state: 'port', note: 'a ship is ready to sail' },
  { state: 'sea', note: '1 ship at sea' },
];
/** Every state the bar can be told. */
const STATES: readonly BarState[] = [false, true].flatMap((hasUnit) => [false, true].flatMap((targeting) => [false, true].flatMap((over) => [false, true].flatMap((explorer) => EUROPE.map((europe) => ({ hasUnit, targeting, over, explorer, europe }))))));

describe('the dock', () => {
  it('carries Wait, Skip, Go to, Fortify, Sentry, Build and End turn, then More', () => {
    expect([...DOCK_BUTTONS.map((b) => b.label), MORE_LABEL]).toEqual(['Wait', 'Skip', 'Go to', 'Fortify', 'Sentry', 'Build', 'End turn', 'More']);
  });

  it('leaves every other command of the bar to the More sheet, and none to both', () => {
    expect(SHEET_BUTTONS.map((b) => b.id)).toEqual(['explore', 'plow', 'road', 'tradeRoute', 'load', 'unload', 'dump', 'center', 'disband', 'hiddenTerrain', 'europe', 'zoomIn', 'zoomOut', 'reports', 'menus']);
    expect([...DOCK_BUTTONS, ...SHEET_BUTTONS].map((b) => b.id).sort()).toEqual(COMMAND_BUTTONS.map((b) => b.id).sort());
  });

  it('relabels Go to as Cancel while a destination is picked, and End turn as The end once the game is over', () => {
    const goTo = DOCK_BUTTONS.find((b) => b.id === 'goTo')!;
    const endTurn = DOCK_BUTTONS.find((b) => b.id === 'endTurn')!;
    const plain: BarState = { hasUnit: true, targeting: false, over: false, explorer: false, europe: EUROPE[0]! };
    expect(buttonLook(goTo, plain).label).toBe('Go to');
    expect(buttonLook(goTo, { ...plain, targeting: true })).toMatchObject({ label: CANCEL_LABEL, disabled: false });
    expect(buttonLook(goTo, { ...plain, hasUnit: false, targeting: true }).disabled).toBe(false);
    expect(buttonLook(goTo, { ...plain, hasUnit: false }).disabled).toBe(true);
    expect(buttonLook(endTurn, plain)).toMatchObject({ label: 'End turn', disabled: false });
    expect(buttonLook(endTurn, { ...plain, over: true })).toMatchObject({ label: END_BUTTON, disabled: false });
  });

  it('shuts the orders when no unit waits or the game is over, and opens them otherwise', () => {
    for (const state of STATES) {
      for (const b of DOCK_BUTTONS) {
        if (b.id === 'goTo' || b.id === 'endTurn') continue;
        expect(buttonLook(b, state).disabled, `${b.id} ${JSON.stringify(state)}`).toBe(!state.hasUnit || state.over);
        expect(buttonLook(b, state).hidden).toBe(false);
      }
    }
  });

  it("marks More with the Europe button's data-europe in every state, and says why as it does", () => {
    const europe = COMMAND_BUTTONS.find((b) => b.id === 'europe')!;
    for (const state of STATES) {
      const look = buttonLook(europe, state);
      expect(moreLook(state.europe).europe).toBe(look.europe);
      expect(moreLook(state.europe).title).toBe(look.title.replace('Europe (E)', MORE_LABEL));
    }
    expect(moreLook(EUROPE[0]!)).toEqual({ title: 'More' });
    expect(moreLook(EUROPE[2]!)).toEqual({ title: 'More: 1 ship at sea', europe: 'sea' });
  });
});

describe('the dock in the stylesheet', () => {
  const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'src', 'ui', 'style.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const rule = (selector: string): string => {
    const at = css.indexOf(`${selector} {`);
    expect(at, selector).toBeGreaterThanOrEqual(0);
    return css.slice(at, css.indexOf('}', at));
  };

  it('makes every dock button and every command in the sheet at least a finger high', () => {
    expect(rule('.dock-commands button')).toMatch(/min-width: var\(--tap\);[\s\S]*min-height: var\(--tap\);/);
    expect(rule(":root[data-layout='compact'] .sidebar .command-bar button")).toContain('min-height: var(--tap)');
    expect(rule(":root[data-layout='compact'] .sheet-close")).toContain('min-height: var(--tap)');
  });

  it('marks More the way the Europe button is marked', () => {
    for (const state of ['port', 'sea']) expect(css).toContain(`.command-bar [data-europe="${state}"],\n.dock-commands [data-europe="${state}"]`);
  });

  it('writes the compact layout against the attributes on <html>, never a media query on the window', () => {
    const section = css.slice(css.indexOf('.sheet { display: contents; }'), css.indexOf('.dialog-backdrop {'));
    expect(section).not.toMatch(/@media/);
    expect(section).toContain(":root[data-layout='compact'] .dock {");
  });
});
