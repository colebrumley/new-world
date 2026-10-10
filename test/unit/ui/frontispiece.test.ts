import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { paintingRgba, unpackRow } from '../../../src/ui/frontispiece';
import { PALETTE } from '../../../src/ui/pixel-art';
import { PAINTING } from '../../../src/ui/title';
import { TITLE_ART, TITLE_CODES, TITLE_COLORS, TITLE_HEIGHT, TITLE_WIDTH } from '../../../src/ui/title-art';

const root = join(__dirname, '../../..');

describe('the painting behind the title screen', () => {
  it('is 320 x 200, the size the title screen makes room for', () => {
    expect([TITLE_WIDTH, TITLE_HEIGHT]).toEqual([320, 200]);
    expect([PAINTING.width, PAINTING.height]).toEqual([TITLE_WIDTH, TITLE_HEIGHT]);
    expect(TITLE_ART).toHaveLength(TITLE_HEIGHT);
    for (const row of TITLE_ART) expect(unpackRow(row)).toHaveLength(TITLE_WIDTH);
  });

  it('is drawn in colours of the map palette and no others', () => {
    expect(TITLE_COLORS.length).toBeLessThanOrEqual(PALETTE.length);
    expect(new Set(TITLE_COLORS).size).toBe(TITLE_COLORS.length);
    for (const colour of TITLE_COLORS) expect(PALETTE as readonly string[]).toContain(colour);
    const used = new Set(TITLE_ART.flatMap(unpackRow));
    expect([...used].sort((a, b) => a - b)).toEqual(TITLE_COLORS.map((_, i) => i));
  });

  it('unpacks a row of letters and counts', () => {
    expect(unpackRow('a3bc2')).toEqual([0, 0, 0, 1, 2, 2]);
    expect(unpackRow(`${TITLE_CODES[27]}12a`)).toEqual([...Array.from({ length: 12 }, () => 27), 0]);
    expect(unpackRow('')).toEqual([]);
  });

  it('becomes opaque pixels, each one a palette colour', () => {
    const rgba = paintingRgba();
    expect(rgba).toHaveLength(TITLE_WIDTH * TITLE_HEIGHT * 4);
    const palette = new Set<string>(PALETTE);
    const seen = new Set<string>();
    for (let i = 0; i < rgba.length; i += 4) {
      expect(rgba[i + 3]).toBe(255);
      seen.add(`#${[rgba[i], rgba[i + 1], rgba[i + 2]].map((c) => (c as number).toString(16).padStart(2, '0')).join('')}`);
    }
    for (const colour of seen) expect(palette.has(colour), colour).toBe(true);
    // a picture, not a flat ground: sky, sea, wood and ship between them use most of what the bake kept
    expect(seen.size).toBe(TITLE_COLORS.length);
    expect(seen.size).toBeGreaterThanOrEqual(12);
  });

  it('has sky above and sea below', () => {
    const rgba = paintingRgba();
    const at = (x: number, y: number): string => `#${[0, 1, 2].map((c) => (rgba[(y * TITLE_WIDTH + x) * 4 + c] as number).toString(16).padStart(2, '0')).join('')}`;
    expect(at(160, 2)).toBe(PALETTE[11]); // the pale top of the sky
    expect([PALETTE[7], PALETTE[8], PALETTE[9]]).toContain(at(150, 190)); // open water at the foot
  });

  it('is kept with its source, which is our own', () => {
    expect(existsSync(join(root, 'art/title/frontispiece.png'))).toBe(true);
    expect(readFileSync(join(root, 'scripts/bake-art.py'), 'utf8')).toContain("painting('art/title/frontispiece.png', 320, 200)");
  });

  it('is not part of the entry script: nothing the title screen needs imports it, and the shell asks for it afterwards', () => {
    const source = (path: string): string => readFileSync(join(root, path), 'utf8');
    for (const file of ['src/main.ts', 'src/app/shell.ts', 'src/ui/title.ts']) {
      expect(source(file), file).not.toMatch(/^import .*(frontispiece|title-art|pixel-art)/m);
    }
    expect(source('src/app/shell.ts')).toContain("import('../ui/frontispiece')");
    // and the painting brings nothing with it but its own picture
    expect(source('src/ui/frontispiece.ts').match(/^import .*$/gm)).toEqual(["import { TITLE_ART, TITLE_CODES, TITLE_COLORS, TITLE_HEIGHT, TITLE_WIDTH } from './title-art';"]);
  });
});
