import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { KEYMAP, mapCommandFor, renderKeysDoc } from '../../../src/ui/keymap';

const DOC = join(import.meta.dirname, '../../../docs/KEYS.md');
const key = (k: string, extra: Partial<{ code: string; shiftKey: boolean; altKey: boolean }> = {}) =>
  mapCommandFor({ key: k, code: extra.code ?? '', shiftKey: extra.shiftKey ?? false, altKey: extra.altKey ?? false });

describe('keyboard map', () => {
  it('docs/KEYS.md is exactly what the table generates', () => {
    if (process.env['UPDATE_FIXTURES'] || !existsSync(DOC)) writeFileSync(DOC, renderKeysDoc());
    expect(readFileSync(DOC, 'utf8')).toBe(renderKeysDoc());
  });

  it('covers every map key of Appendix K', () => {
    const map = KEYMAP.filter((k) => k.context === 'map').map((k) => k.keys).join(' | ');
    for (const want of ['Arrows', 'numpad', 'A', 'W', 'Space', 'F', 'S', 'B', 'P', 'R', 'G', 'L', 'U', 'O', 'T', 'Shift-D', 'V', 'M', 'E', 'Z / X', 'H', 'C', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'Alt+T', 'Alt+G', 'Alt+O', 'Esc']) {
      expect(map, want).toContain(want);
    }
    const colony = KEYMAP.filter((k) => k.context === 'colony').map((k) => k.keys);
    expect(colony).toEqual(['Tab', 'Arrows', 'Enter', 'L / = / +', 'U / - / _', 'M', '1 / 2 / 3', 'N', 'C', 'B', 'X', 'F1', 'Esc', 'Drag (Shift-drag for part)']);
    const europe = KEYMAP.filter((k) => k.context === 'europe').map((k) => k.keys);
    expect(europe).toEqual(['R or 1', 'P or 2', 'T or 3', 'L / = / +', 'U / - / _', 'Arrows', 'Esc or E']);
  });

  it('maps key presses to commands', () => {
    const letters: Record<string, string> = {
      a: 'activate', w: 'wait', ' ': 'skip', f: 'fortify', s: 'sentry', b: 'buildColony', p: 'plow', r: 'road', g: 'goTo',
      l: 'load', u: 'unload', o: 'dump', t: 'tradeRoute', v: 'viewMode', m: 'moveMode', e: 'europe', z: 'zoomIn',
      x: 'zoomOut', h: 'hiddenTerrain', c: 'center', Enter: 'endTurn', Escape: 'cancel',
    };
    for (const [k, command] of Object.entries(letters)) {
      expect(key(k), k).toBe(command);
      if (k.length === 1 && k !== ' ') expect(key(k.toUpperCase()), k).toBe(command === 'activate' || k !== 'd' ? command : 'disband');
    }
    expect(key('D', { shiftKey: true })).toBe('disband');
    expect(key('d')).toBeNull();
    expect(key('F1')).toBe('report');
    expect(key('F10')).toBe('report');
    expect(key('F11')).toBeNull();
    expect(key('g', { altKey: true, code: 'KeyG' })).toBe('menu');
    expect(key('ArrowUp', { altKey: true, code: 'ArrowUp' })).toBeNull();
    expect(key('q')).toBeNull();
  });

  it('every map command a binding names has a key that reaches it', () => {
    const reachable = new Set(['move']);
    for (const k of ['a', 'w', ' ', 'f', 's', 'b', 'p', 'r', 'g', 'l', 'u', 'o', 't', 'v', 'm', 'e', 'z', 'x', 'h', 'c', 'Enter', 'Escape', 'F1']) {
      const c = key(k);
      if (c) reachable.add(c);
    }
    reachable.add(key('D', { shiftKey: true }) ?? '');
    reachable.add(key('I', { shiftKey: true }) ?? '');
    reachable.add(key('R', { shiftKey: true }) ?? '');
    reachable.add(key('g', { altKey: true, code: 'KeyG' }) ?? '');
    for (const b of KEYMAP) if (b.command) expect(reachable, b.keys).toContain(b.command);
  });
});
