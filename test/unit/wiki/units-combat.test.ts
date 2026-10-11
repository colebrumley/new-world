// R-1029: the generated tables of the Units and Combat pages cover what the game has: every unit
// type, every specialist, every ship, and every modifier the Combat Analysis dialog can list.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SPECIALISTS, PROFESSIONS } from '../../../src/engine/data/professions';
import { UNIT_TYPE_IDS, UNIT_TYPES } from '../../../src/engine/data/units';
import { TABLES } from '../../helpers/wiki/tables';

const ROOT = join(import.meta.dirname, '../../..');
const rows = (name: string): string[] => TABLES[name]!().split('\n').slice(2);

describe('the Units and Combat tables', () => {
  it('units: one row per unit type, in table order, each with its sprite and a way to get it', () => {
    const lines = rows('units');
    expect(lines).toHaveLength(UNIT_TYPE_IDS.length);
    UNIT_TYPE_IDS.forEach((id, i) => {
      const u = UNIT_TYPES[id];
      expect(lines[i]).toContain(`](images/art/units/${id}.png) | ${u.name} | ${u.domain === 'sea' ? 'Sea' : 'Land'} | ${u.moves} | ${u.attack} | ${u.defense} | ${u.holds} | `);
      expect(lines[i]).not.toMatch(/\|\s*\|$/);
    });
  });

  it('professions: one row per specialist, with the school its teach level names', () => {
    const lines = rows('professions');
    expect(lines).toHaveLength(SPECIALISTS.length);
    SPECIALISTS.forEach((id, i) => {
      const p = PROFESSIONS[id];
      expect(lines[i]).toMatch(new RegExp(`^\\| ${p.name} \\| .+ \\| ${['', 'Schoolhouse', 'College', 'University', 'Never'][p.teachLevel]} \\| ${p.nativeTaught ? 'Yes' : 'No'} \\|$`));
    });
  });

  it('ship repairs: one row per ship', () => {
    expect(rows('ship-repairs')).toHaveLength(UNIT_TYPE_IDS.filter((id) => UNIT_TYPES[id].domain === 'sea').length);
  });

  it('combat modifiers: every label the engine gives the Combat Analysis dialog has a row', () => {
    const source = ['src/engine/combat.ts', 'src/engine/analysis.ts'].map((f) => readFileSync(join(ROOT, f), 'utf8')).join('\n');
    const labels = new Set([...source.matchAll(/label: '([^']+)'/g)].map((m) => m[1]!));
    // the four places of a colony are picked from a list by fortification level
    for (const m of source.matchAll(/label: \[([^\]]+)\]/g)) for (const l of m[1]!.matchAll(/'([^']+)'/g)) labels.add(l[1]!);
    // and the two unrest lines by side
    for (const m of source.matchAll(/label: \w+ \? '([^']+)' : '([^']+)'/g)) labels.add(m[1]!).add(m[2]!);
    const named = new Set(rows('combat-modifiers').map((r) => r.split(' | ')[0]!.replace(/^\| /, '')));
    expect(labels.size).toBeGreaterThan(10);
    expect([...labels].filter((l) => !named.has(l))).toEqual([]);
    expect([...named].filter((l) => !labels.has(l))).toEqual([]);
  });
});
