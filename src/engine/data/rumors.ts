// Lost City Rumors (docs/RULES.md "Lost City Rumors").
import type { OpenTerrain } from './terrain';

/** The nine things a rumor may turn out to be, each as likely as the next before the conditions are applied. */
export const RUMOR_ROLLS = ['fountain', 'cibola', 'ruins', 'burial', 'vanished', 'nothing', 'gift', 'shrines', 'survivors'] as const;
export type RumorOutcome = (typeof RUMOR_ROLLS)[number];

export const RUMORS = {
  /** The second throw is 1..100 plus this much per step of the explorer's skill (0 plain, 1 scout, 2 seasoned scout; De Soto adds one for scouts). */
  skillBonus: 10,
  /** A find that cannot be: at or under this the party vanishes instead; under `shrinesUnder` (Cibola only) it finds shrines. */
  vanishUnder: 10,
  shrinesUnder: 25,
  /** The Fountain of Youth is found only after this many rumors have been explored, and brings this many immigrants. */
  fountainAfter: 4,
  fountainImmigrants: 8,
  /** Cibola: only after one rumor, at most this many in a game; with De Soto one time in three anywhere. */
  cibolaAfter: 1,
  cibolaMost: 7,
  cibolaSotoOdds: 3,
  /** Its treasure: (a throw of 1..20 + 10 x (skill + 2)) hundreds. */
  cibolaDie: 20,
  cibolaPerSkill: 10,
  /** Ruins and trinkets: 10 x 3 x a throw of 1..8, times (skill + 2) / 2 for scouts at ruins. */
  ruinsDie: 8,
  ruinsUnit: 30,
  /** A friendly village: 8 x a throw of 1..10. */
  giftDie: 10,
  giftUnit: 8,
  /** A power this small is spared the loss of its party: at most this many colonists and this many colonies. */
  spareColonists: 4,
  spareColonies: 2,
  /** A pioneer of a power with at most this many colonists is spared half the time. */
  sparePioneerColonists: 8,
  /** Shrines anger the nearest tribe by a throw of 1..6 + 5 x (level - skill + 1), if its settlement is within this distance. */
  shrineDie: 6,
  shrinePerLevel: 5,
  shrineRange: 2,
  /** Burial mounds are sacred when a throw of 1..(distance + 5) x 2^skill is at most this. */
  sacredAtMost: 3,
  sacredBase: 5,
  sacredAlarm: 100,
  /** In the mounds: under the first figure nothing; under the second (third if not sacred) trinkets; otherwise treasure. */
  burialEmptyUnder: 25,
  burialTrinketsUnder: 50,
  burialTrinketsUnderPlain: 65,
  /** Mound treasure: 2 x (a throw of 1..8 + 2 x (skill + 5)) hundreds. */
  burialDie: 8,
  burialSkillBase: 5,
} as const;

/** Ground where the Fountain of Youth may be found (wooded or not). */
export const FOUNTAIN_TERRAIN = ['grassland', 'savannah', 'marsh', 'swamp'] as const satisfies readonly OpenTerrain[];
