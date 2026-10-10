import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FATHER_IDS } from '../../../src/engine/data/fathers';
import { INK, PALETTE } from '../../../src/ui/pixel-art';
import { PORTRAIT_ART, PORTRAIT_CODES, PORTRAIT_COLORS, PORTRAIT_SIZE } from '../../../src/ui/portrait-art';
import { ADVISER_IDS, COAT, PORTRAIT_IDS, adviserFor, portraitCells, portraitRgba } from '../../../src/ui/portraits';

const root = join(__dirname, '../../..');
const hex = (rgba: Uint8ClampedArray, at: number): string => `#${[rgba[at], rgba[at + 1], rgba[at + 2]].map((c) => (c as number).toString(16).padStart(2, '0')).join('')}`;

describe('portraits', () => {
  it('has one for each adviser, the King and every founding father, and no others', () => {
    expect(PORTRAIT_IDS).toEqual(['advisers', 'congress', 'foreign', 'score', 'king', ...FATHER_IDS]);
    expect(Object.keys(PORTRAIT_ART).sort()).toEqual([...PORTRAIT_IDS].sort());
    for (const id of PORTRAIT_IDS) expect(existsSync(join(root, 'art/portraits', `${id}.png`)), id).toBe(true);
  });

  it('is 64 x 64, every one', () => {
    expect(PORTRAIT_SIZE).toBe(64);
    for (const id of PORTRAIT_IDS) {
      const rows = PORTRAIT_ART[id] as readonly string[];
      expect(rows, id).toHaveLength(64);
      for (const row of rows) expect(row, id).toHaveLength(64);
      expect(portraitCells(id)).toHaveLength(64 * 64);
    }
  });

  it('is drawn in colours of the map palette and no others', () => {
    expect(new Set(PORTRAIT_COLORS).size).toBe(PORTRAIT_COLORS.length);
    expect(PORTRAIT_CODES).toHaveLength(PORTRAIT_COLORS.length);
    for (const colour of PORTRAIT_COLORS) expect(PALETTE as readonly string[]).toContain(colour);
    const letters = new Set(PORTRAIT_IDS.flatMap((id) => (PORTRAIT_ART[id] as readonly string[]).flatMap((row) => [...row])));
    letters.delete('*');
    expect([...letters].sort()).toEqual([...PORTRAIT_CODES].sort());
    for (const id of PORTRAIT_IDS) for (const cell of portraitCells(id)) expect(cell === COAT || cell < PALETTE.length).toBe(true);
  });

  it('keeps a coat to colour for the advisers alone', () => {
    for (const id of PORTRAIT_IDS) {
      const coat = portraitCells(id).filter((cell) => cell === COAT).length;
      if ((ADVISER_IDS as readonly string[]).includes(id)) expect(coat, id).toBeGreaterThan(200);
      else expect(coat, id).toBe(0);
    }
  });

  it('becomes opaque pixels, each one a palette colour, the coat in the colour asked for', () => {
    const palette = new Set<string>(PALETTE);
    for (const id of PORTRAIT_IDS) {
      const rgba = portraitRgba(id, INK.purple);
      expect(rgba).toHaveLength(64 * 64 * 4);
      const cells = portraitCells(id);
      for (let n = 0; n < cells.length; n++) {
        expect(rgba[n * 4 + 3]).toBe(255);
        const colour = hex(rgba, n * 4);
        if (cells[n] === COAT) expect(colour).toBe(PALETTE[INK.purple]);
        else if (!palette.has(colour)) throw new Error(`${id}: ${colour} is not in the palette`);
      }
    }
    // without a colour the coat is sealing-wax red, and a number that is no palette entry is taken for it
    const plain = portraitRgba('advisers');
    const at = portraitCells('advisers').indexOf(COAT) * 4;
    expect(hex(plain, at)).toBe(PALETTE[INK.red]);
    expect(hex(portraitRgba('advisers', 99), at)).toBe(PALETTE[INK.red]);
  });

  it('gives each report its adviser', () => {
    expect(adviserFor('congress')).toBe('congress');
    expect(adviserFor('foreign')).toBe('foreign');
    expect(adviserFor('score')).toBe('score');
    expect(adviserFor('hall')).toBe('score');
    for (const id of ['terrain', 'religion', 'labor', 'economy', 'colonies', 'naval', 'indians', 'anything']) expect(adviserFor(id)).toBe('advisers');
  });
});
