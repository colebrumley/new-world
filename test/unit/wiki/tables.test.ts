// R-1025: every generated block in wiki/*.md is exactly what its renderer in
// test/helpers/wiki/tables.ts gives. UPDATE_FIXTURES=1 rewrites the pages instead.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { describeDifficulty, difficultyProfile } from '../../../src/engine/difficulty';
import { DIFFICULTIES } from '../../../src/engine/data/yields';
import { BLOCK, fillTables, img, mdTable, rendererFor, TABLES } from '../../helpers/wiki/tables';

const WIKI = join(import.meta.dirname, '../../../wiki');
const pages = (): Map<string, string> =>
  new Map(readdirSync(WIKI).filter((f) => f.endsWith('.md')).sort().map((f) => [f, readFileSync(join(WIKI, f), 'utf8')]));
const blocks = (text: string): { name: string; body: string }[] => [...text.matchAll(BLOCK)].map((m) => ({ name: m[2]!, body: m[3]! }));

describe('the wiki tables', () => {
  if (process.env['UPDATE_FIXTURES']) {
    for (const [file, text] of pages()) {
      const filled = fillTables(text);
      if (filled !== text) writeFileSync(join(WIKI, file), filled);
    }
  }
  const all = pages();

  it('every block is what its renderer gives', () => {
    const wrong: string[] = [];
    for (const [file, text] of all) {
      let filled: string;
      try {
        filled = fillTables(text);
      } catch (e) {
        wrong.push(`${file}: ${(e as Error).message}`);
        continue;
      }
      const want = new Map(blocks(filled).map((b, i) => [i, b.body]));
      blocks(text).forEach((b, i) => {
        if (b.body !== want.get(i)) wrong.push(`${file}: the block "${b.name}" is not what its renderer gives (run UPDATE_FIXTURES=1 npm test -- test/unit/wiki)`);
      });
    }
    expect(wrong).toEqual([]);
  });

  it('every renderer is used by a page', () => {
    const used = new Set([...all.values()].flatMap((text) => blocks(text).map((b) => b.name)));
    expect(Object.keys(TABLES).filter((name) => !used.has(name))).toEqual([]);
  });

  it.each(Object.keys(TABLES))('the renderer "%s" gives something', (name) => {
    expect(TABLES[name]!().trim()).not.toBe('');
  });

  it('Getting Started carries the difficulty levels', () => {
    expect(blocks(all.get('Getting-Started.md') ?? '').map((b) => b.name)).toContain('difficulty-levels');
  });
});

describe('the table helpers', () => {
  it('mdTable writes left-aligned columns, escapes bars and keeps numbers as given', () => {
    expect(mdTable(['A', 'B'], [['x|y', 1.5], ['z', 0]])).toBe('| A | B |\n| :--- | :--- |\n| x\\|y | 1.5 |\n| z | 0 |');
  });

  it('img writes the Markdown image form', () => {
    expect(img('images/art/goods/food.png', 'Food')).toBe('![Food](images/art/goods/food.png)');
  });

  it('fillTables replaces each body and leaves the rest alone', () => {
    const page = 'Intro.\n\n<!-- table: difficulty-levels -->\n(generated; do not edit by hand)\n<!-- /table -->\n\nAfter.\n';
    const filled = fillTables(page);
    expect(filled).toBe(`Intro.\n\n<!-- table: difficulty-levels -->\n\n${TABLES['difficulty-levels']!()}\n\n<!-- /table -->\n\nAfter.\n`);
    expect(fillTables(filled)).toBe(filled);
  });

  it('fillTables names a block with no renderer', () => {
    expect(() => fillTables('<!-- table: no-such-table -->\n<!-- /table -->')).toThrow('"no-such-table"');
    expect(() => fillTables('<!-- table: constructor -->\n<!-- /table -->')).toThrow('"constructor"');
    expect(rendererFor('toString')).toBeUndefined();
  });

  it('the difficulty table lists the five levels from difficultyProfile, with their summaries', () => {
    const rows = TABLES['difficulty-levels']!().split('\n').slice(2);
    expect(rows).toHaveLength(DIFFICULTIES.length);
    DIFFICULTIES.forEach((d, i) => {
      const p = difficultyProfile(d);
      expect(rows[i]).toContain(`| ${p.name} | ${p.startingGold} | ${p.ref.regulars} regulars`);
      expect(rows[i]).toContain(`| ${p.ratingFactor} | ${describeDifficulty(d)} |`);
    });
  });
});
