// The baked unit figures (R-1069, R-1070): every craftsman's and planter's look, every unskilled colonist's and every
// role's expert has a picture of its own; no two colonist figures are near copies of one another, and each expert
// differs from his role's ordinary figure.
import { describe, expect, it } from 'vitest';
import { FIGURE_SIZE, UNIT_ART } from '../../../src/ui/unit-art';

/** The looks of docs/specs/unit-looks.md, `expertFarmer` to `elderStatesman`, that W2 gives a picture. */
const CRAFT_LOOKS = [
  'expertFarmer', 'masterSugarPlanter', 'masterTobaccoPlanter', 'masterCottonPlanter', 'expertFurTrapper', 'expertLumberjack',
  'expertOreMiner', 'expertSilverMiner', 'expertFisherman', 'masterDistiller', 'masterTobacconist', 'masterWeaver',
  'masterFurTrader', 'masterCarpenter', 'masterBlacksmith', 'masterGunsmith', 'firebrandPreacher', 'elderStatesman',
] as const;

/** The unequipped looks W3 (R-1070) gives a picture: the role experts off duty and the unskilled. */
const UNSKILLED_LOOKS = [
  'hardyPioneer', 'veteranSoldier', 'seasonedScout', 'jesuitMissionary', 'indenturedServant', 'pettyCriminal', 'indianConvert',
] as const;

/** Each role's expert look and the ordinary figure of that role. */
const EXPERTS = [
  ['expertSoldier', 'soldier'], ['expertDragoon', 'dragoon'], ['expertPioneer', 'pioneer'], ['expertScout', 'scout'],
  ['expertMissionary', 'missionary'],
] as const;

const NEW_LOOKS = [...UNSKILLED_LOOKS, ...EXPERTS.map(([expert]) => expert)];

/**
 * How much two figures differ: of the cells where either is opaque, the share where their letters differ (one
 * see-through counts as different). One folder shares one palette, so one letter is one colour.
 */
function difference(a: readonly string[], b: readonly string[]): number {
  let union = 0;
  let differ = 0;
  for (let y = 0; y < FIGURE_SIZE; y++) {
    for (let x = 0; x < FIGURE_SIZE; x++) {
      const p = a[y]?.[x] ?? '.';
      const q = b[y]?.[x] ?? '.';
      if (p === '.' && q === '.') continue;
      union++;
      if (p !== q) differ++;
    }
  }
  return union === 0 ? 0 : differ / union;
}

describe('unit figures', () => {
  it('has a picture for every craftsman and planter', () => {
    for (const look of CRAFT_LOOKS) expect(Object.hasOwn(UNIT_ART, look), look).toBe(true);
  });

  it('draws each on the figure grid', () => {
    for (const look of CRAFT_LOOKS) {
      const rows = UNIT_ART[look] ?? [];
      expect(rows.length, look).toBe(FIGURE_SIZE);
      for (const row of rows) expect(row.length, look).toBe(FIGURE_SIZE);
    }
  });

  it('has a picture for every unskilled colonist and every role expert', () => {
    for (const look of NEW_LOOKS) expect(Object.hasOwn(UNIT_ART, look), look).toBe(true);
    for (const look of NEW_LOOKS) {
      const rows = UNIT_ART[look] ?? [];
      expect(rows.length, look).toBe(FIGURE_SIZE);
      for (const row of rows) expect(row.length, look).toBe(FIGURE_SIZE);
    }
  });

  it('keeps each expert at least a fifth from his role\'s ordinary figure', () => {
    for (const [expert, ordinary] of EXPERTS) {
      expect(difference(UNIT_ART[expert] ?? [], UNIT_ART[ordinary] ?? []), `${expert} and ${ordinary}`).toBeGreaterThanOrEqual(0.2);
    }
  });

  it('keeps each unskilled look at least a fifth from every other colonist figure', () => {
    const colonists = ['colonist', ...CRAFT_LOOKS, ...UNSKILLED_LOOKS];
    for (const a of UNSKILLED_LOOKS) {
      for (const b of colonists) {
        if (a === b) continue;
        expect(difference(UNIT_ART[a] ?? [], UNIT_ART[b] ?? []), `${a} and ${b}`).toBeGreaterThanOrEqual(0.2);
      }
    }
  });

  it('keeps every pair of them and the plain colonist at least a fifth apart', () => {
    const looks = ['colonist', ...CRAFT_LOOKS];
    for (const [i, a] of looks.entries()) {
      for (const b of looks.slice(i + 1)) {
        expect(difference(UNIT_ART[a] ?? [], UNIT_ART[b] ?? []), `${a} and ${b}`).toBeGreaterThanOrEqual(0.2);
      }
    }
  });
});
