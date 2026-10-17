import { describe, expect, it } from 'vitest';
import { PROFESSION_IDS, type ProfessionId } from '../../../src/engine/data/professions';
import { UNIT_TYPE_IDS, type UnitTypeId } from '../../../src/engine/data/units';
import { at, detailedPieceArt, figureArt, hasPicture, INK, pieceArt, type InkId, type Sprite } from '../../../src/ui/pixel-art';
import { LOOK_IDS, LOOKS, lookOf, PROFESSION_LOOKS, ROLE_EXPERT_LOOKS, type LookId } from '../../../src/ui/unit-looks';

const far = (look: LookId, color: InkId = INK.red): Sprite => pieceArt({ look, color, label: '-', stacked: false });
const text = (s: Sprite): string => [...s.cells].join(',');

/** The looks of a colonist with no equipment: the plain colonist and one per profession that shows its own. */
const UNEQUIPPED = LOOK_IDS.filter((l) => LOOKS[l].type === 'colonist');
const EXPERTS = ['expertSoldier', 'expertDragoon', 'expertPioneer', 'expertScout', 'expertMissionary'] as const;

describe('lookOf', () => {
  it('matches the snapshot of the look table', () => {
    expect({ LOOKS, PROFESSION_LOOKS, ROLE_EXPERT_LOOKS }).toMatchSnapshot();
  });

  it('gives every unit type and profession a look of that unit type', () => {
    for (const type of UNIT_TYPE_IDS) {
      for (const profession of [...PROFESSION_IDS, null]) {
        const look = lookOf(type, profession);
        expect(LOOK_IDS, `${type} ${profession}`).toContain(look);
        expect(LOOKS[look].type, `${type} ${profession}`).toBe(type);
      }
    }
  });

  it('shows a colonist\'s trade unequipped and hides it under arms, unless he is the role\'s expert', () => {
    const cases: [UnitTypeId, ProfessionId | null, LookId][] = [
      // an expert farmer as colonist and as soldier
      ['colonist', 'expertFarmer', 'expertFarmer'], ['soldier', 'expertFarmer', 'soldier'],
      // a veteran soldier and a veteran dragoon as colonist, soldier and dragoon
      ['colonist', 'veteranSoldier', 'veteranSoldier'], ['soldier', 'veteranSoldier', 'expertSoldier'], ['dragoon', 'veteranSoldier', 'expertDragoon'],
      ['colonist', 'veteranDragoon', 'veteranSoldier'], ['soldier', 'veteranDragoon', 'expertSoldier'], ['dragoon', 'veteranDragoon', 'expertDragoon'],
      // each role's expert, and a free colonist, in each role
      ['pioneer', 'hardyPioneer', 'expertPioneer'], ['scout', 'seasonedScout', 'expertScout'], ['missionary', 'jesuitMissionary', 'expertMissionary'],
      ['soldier', 'freeColonist', 'soldier'], ['dragoon', 'freeColonist', 'dragoon'], ['pioneer', 'freeColonist', 'pioneer'],
      ['scout', 'freeColonist', 'scout'], ['missionary', 'freeColonist', 'missionary'],
      // another role's expert is no expert here
      ['pioneer', 'seasonedScout', 'pioneer'], ['scout', 'hardyPioneer', 'scout'], ['missionary', 'veteranSoldier', 'missionary'],
      // the role's experts unequipped
      ['colonist', 'hardyPioneer', 'hardyPioneer'], ['colonist', 'seasonedScout', 'seasonedScout'], ['colonist', 'jesuitMissionary', 'jesuitMissionary'],
      // an expert teacher, a free colonist and no profession as colonist
      ['colonist', 'expertTeacher', 'colonist'], ['colonist', 'freeColonist', 'colonist'], ['colonist', null, 'colonist'],
      ['colonist', 'pettyCriminal', 'pettyCriminal'], ['colonist', 'indianConvert', 'indianConvert'],
    ];
    for (const [type, profession, look] of cases) expect(lookOf(type, profession), `${type} ${profession}`).toBe(look);
  });

  it('draws the Continental and Crown troops, ships and the natives as their type, whatever the profession', () => {
    for (const type of ['continentalArmy', 'continentalCavalry', 'regular', 'cavalry', 'caravel', 'galleon', 'artillery', 'wagonTrain', 'treasure', 'brave', 'mountedWarrior'] as const) {
      for (const profession of [...PROFESSION_IDS, null]) expect(lookOf(type, profession), `${type} ${profession}`).toBe(type);
    }
  });
});

describe('the far zoom by look', () => {
  it('gives the 26 unequipped looks 26 coats, and an expert in his role the coat he wears unequipped', () => {
    expect(UNEQUIPPED).toHaveLength(26);
    expect(new Set(UNEQUIPPED.map((l) => LOOKS[l].coat)).size).toBe(26);
    expect(EXPERTS.map((l) => LOOKS[l].coat)).toEqual(['blue', 'blue', 'tundra', 'green', 'ink']);
    expect(LOOKS.veteranSoldier.coat).toBe('blue');
    expect(LOOKS.hardyPioneer.coat).toBe('tundra');
    expect(LOOKS.seasonedScout.coat).toBe('green');
    expect(LOOKS.jesuitMissionary.coat).toBe('ink');
  });

  it('fills the coat of a colonist\'s piece and of each expert\'s with the look\'s coat', () => {
    // the coat: rows 2 and 3 of the person (drawn at x 6 for a colonist, x 5 for a soldier, pioneer and missionary), rows 1 and 2 of the rider
    const coat = (look: LookId): number[] => {
      const s = far(look);
      const type = LOOKS[look].type;
      if (type === 'dragoon' || type === 'scout') return [at(s, 7, 5), at(s, 8, 5), ...[6, 7, 8, 9].map((x) => at(s, x, 6))];
      const x0 = type === 'colonist' ? 6 : 5;
      return [7, 8].flatMap((y) => [0, 1, 2, 3].map((dx) => at(s, x0 + dx, y)));
    };
    for (const look of [...UNEQUIPPED, ...EXPERTS]) for (const cell of coat(look)) expect(cell - 1, look).toBe(INK[LOOKS[look].coat]);
    // the ordinary roles keep their ink coats
    for (const look of ['soldier', 'dragoon', 'pioneer', 'scout', 'missionary'] as const) for (const cell of coat(look)) expect(cell - 1, look).toBe(INK.ink);
  });

  it('tells the 26 unequipped looks apart, and each expert from his ordinary role, in any owner\'s colour', () => {
    for (const color of [INK.red, INK.blue, INK.white]) {
      expect(new Set(UNEQUIPPED.map((l) => text(far(l, color)))).size).toBe(26);
      // the Jesuit keeps the ordinary missionary's ink cassock, so at the far zoom the two are one piece; the near zoom tells them apart
      for (const expert of EXPERTS) {
        const same = expect(text(far(expert, color)), expert);
        if (expert === 'expertMissionary') same.toBe(text(far('missionary', color)));
        else same.not.toBe(text(far(LOOKS[expert].type, color)));
      }
    }
  });
});

describe('the near zoom by look', () => {
  it('draws a look with no picture yet as its unit type\'s figure', () => {
    for (const look of LOOK_IDS) {
      const piece = { look, color: INK.red, label: 'F', stacked: false } as const;
      if (hasPicture(look)) continue;
      expect(text(detailedPieceArt(piece) as Sprite), look).toBe(text(detailedPieceArt({ ...piece, look: LOOKS[look].type }) as Sprite));
      expect(text(figureArt(look) as Sprite), look).toBe(text(figureArt(LOOKS[look].type) as Sprite));
    }
    // every unit type has a picture of its own today
    for (const type of UNIT_TYPE_IDS) expect(hasPicture(type), type).toBe(true);
  });
});
