// The baked unit figures (R-1069): every craftsman's and planter's look has a picture of its own, and no two
// colonist figures are near copies of one another.
import { describe, expect, it } from 'vitest';
import { FIGURE_SIZE, UNIT_ART } from '../../../src/ui/unit-art';

/** The looks of docs/specs/unit-looks.md, `expertFarmer` to `elderStatesman`, that W2 gives a picture. */
const CRAFT_LOOKS = [
  'expertFarmer', 'masterSugarPlanter', 'masterTobaccoPlanter', 'masterCottonPlanter', 'expertFurTrapper', 'expertLumberjack',
  'expertOreMiner', 'expertSilverMiner', 'expertFisherman', 'masterDistiller', 'masterTobacconist', 'masterWeaver',
  'masterFurTrader', 'masterCarpenter', 'masterBlacksmith', 'masterGunsmith', 'firebrandPreacher', 'elderStatesman',
] as const;

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

  it('keeps every pair of them and the plain colonist at least a fifth apart', () => {
    const looks = ['colonist', ...CRAFT_LOOKS];
    for (const [i, a] of looks.entries()) {
      for (const b of looks.slice(i + 1)) {
        expect(difference(UNIT_ART[a] ?? [], UNIT_ART[b] ?? []), `${a} and ${b}`).toBeGreaterThanOrEqual(0.2);
      }
    }
  });
});
