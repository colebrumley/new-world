import { describe, expect, it } from 'vitest';
import { BUILDING_IDS } from '../../../src/engine/data/buildings';
import { FATHER_IDS } from '../../../src/engine/data/fathers';
import { GOOD_IDS } from '../../../src/engine/data/goods';
import { PROFESSION_IDS } from '../../../src/engine/data/professions';
import { TERRAIN_IDS } from '../../../src/engine/data/terrain';
import { UNIT_TYPE_IDS } from '../../../src/engine/data/units';
import { CONCEPT_IDS, PEDIA_CATEGORIES, pediaIds, pediaIndex, pediaPage } from '../../../src/ui/pedia';

describe('the encyclopedia', () => {
  it('has a page for every row of every table, and for the twelve concepts', () => {
    expect(pediaIds('cargo')).toEqual(GOOD_IDS);
    expect(pediaIds('units')).toEqual(UNIT_TYPE_IDS);
    expect(pediaIds('terrain')).toEqual(TERRAIN_IDS);
    expect(pediaIds('skills')).toEqual(PROFESSION_IDS);
    expect(pediaIds('buildings')).toEqual(BUILDING_IDS);
    expect(pediaIds('fathers')).toEqual(FATHER_IDS);
    expect(CONCEPT_IDS).toHaveLength(12);
    let pages = 0;
    for (const category of PEDIA_CATEGORIES) {
      for (const id of pediaIds(category)) {
        const page = pediaPage(category, id);
        expect(page, `${category}:${id}`).not.toBeNull();
        expect(page!.title.length, `${category}:${id}`).toBeGreaterThan(0);
        expect(page!.prose.length, `${category}:${id}`).toBeGreaterThan(0);
        for (const text of page!.prose) expect(text.length).toBeGreaterThan(20);
        for (const [label, value] of page!.facts) {
          expect(label.length).toBeGreaterThan(0);
          expect(value.length, `${category}:${id} ${label}`).toBeGreaterThan(0);
        }
        pages++;
      }
    }
    expect(pages).toBe(GOOD_IDS.length + UNIT_TYPE_IDS.length + TERRAIN_IDS.length + PROFESSION_IDS.length + BUILDING_IDS.length + FATHER_IDS.length + 12);
  });

  it('the index lists them all under their categories', () => {
    const index = pediaIndex();
    expect(index.map((g) => g.title)).toEqual(['Cargo', 'Units', 'Terrain', 'Skills', 'Buildings', 'Founding Fathers', 'Concepts']);
    expect(index[0]?.entries[0]).toEqual({ id: 'food', title: 'Food' });
    expect(index[6]?.entries.map((e) => e.title)).toEqual(['Disband', 'Fortify', 'Plowing', 'Roads', 'Sentry', 'Trade Route', 'Veteran Units', 'Prices', 'Taxes', 'Liberty Bells', 'Crosses', 'Hammers']);
  });

  it('reads its facts from the tables', () => {
    const rum = pediaPage('cargo', 'rum')!;
    expect(rum.facts).toContainEqual(['Made from', 'Sugar by a Distiller']);
    expect(pediaPage('cargo', 'sugar')!.facts).toContainEqual(['Made into', 'Rum by a Distiller']);
    expect(pediaPage('cargo', 'furs')!.facts.find(([label]) => label === 'Found on')?.[1]).toContain('Forest');
    const frigate = pediaPage('units', 'frigate')!;
    expect(frigate.facts.slice(0, 3)).toEqual([['Moves', '6'], ['Attack', '16'], ['Defence', '16']]);
    expect(pediaPage('units', 'soldier')!.facts).toContainEqual(['Carries', '50 muskets']);
    expect(pediaPage('units', 'dragoon')!.facts).toContainEqual(['Carries', '50 muskets and 50 horses']);
    expect(pediaPage('terrain', 'hills')!.facts).toContainEqual(['Defence bonus', '+100%']);
    expect(pediaPage('buildings', 'fort')!.facts).toContainEqual(['Cost', '120 hammers and 100 tools']);
    expect(pediaPage('buildings', 'fort')!.facts).toContainEqual(['Line', 'Stockade, then Fort, then Fortress']);
    expect(pediaPage('fathers', 'janDeWitt')!.facts[0]).toEqual(['Field', 'Trade']);
    expect(pediaPage('skills', 'expertFarmer')!.facts).toContainEqual(['Expert at producing', 'Food']);
    expect(pediaPage('skills', 'masterDistiller')!.facts).toContainEqual(['Expert at making', 'Rum from sugar']);
  });

  it('has nothing to say about what does not exist', () => {
    expect(pediaPage('units', 'dreadnought')).toBeNull();
    expect(pediaPage('cargo', 'soldier')).toBeNull();
  });

  it('matches the snapshot', () => {
    expect(PEDIA_CATEGORIES.flatMap((c) => pediaIds(c).map((id) => pediaPage(c, id)))).toMatchSnapshot();
  });
});
