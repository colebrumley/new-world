// Land combat numbers (VICEROY FUN_0000_582a, FUN_0000_593e, FUN_5000_a67e, FUN_5000_a29c;
// docs/RULES.md "Land combat"). Strengths are whole numbers of eighths of a point.
import type { ProfessionId } from './professions';
import type { UnitTypeId } from './units';

export const COMBAT = {
  /** Strength points are carried in this many parts. */
  scale: 8,
  /** Bonuses of a half: veterans, the attacker's edge, Spain against settlements. */
  halfBonus: 2,
  /** Damaged artillery fights this much below its table values. */
  damagedArtilleryPenalty: 2,
  /** Location bonuses are counted in quarters: a bare colony or a camp gives this many... */
  settledQuarters: 2,
  /** ...city peoples twice that, and a capital twice again. */
  /** Fortified adds this many quarters, but only while the place gives fewer than `fortifiedLimit`. */
  fortifiedQuarters: 2,
  fortifiedLimit: 5,
  /** An attack takes a whole move; with less left the attacker fights at that many thirds. */
  fullMove: 3,
  /** Artillery caught in the open fights at a quarter; in a colony against a raid at double. */
  artilleryOpenDivisor: 4,
  artilleryRaidFactor: 2,
  /** A human side gets (this - difficulty level) eighths for nothing. */
  humanNudgeFrom: 4,
  /** Early in the game the easier levels shield a human's colonies: before this turn... */
  shieldTurns: 80,
  /** A colony holding at least half its owner's people defends with this many more eighths per (4 - level). */
  heartlandBonus: 4,
  /** Promotion: a criminal and a servant are this much harder to promote. */
  criminalHandicap: 10,
  servantHandicap: 5,
  /** After the Declaration: the Crown's troops bombard colonies at half again, and fight this many twentieths better per difficulty level in the open. */
  refOpenPerLevel: 20,
  /** A destroyed brave's arms go home this often (one chance in). */
  armsRetentionOdds: 2,
  /** Horses returned to the tribe by a fallen rider. */
  horsesReturned: 25,
} as const;

/** What a land unit becomes when it loses and is not destroyed or captured. */
export const DEMOTION = {
  dragoon: 'soldier', soldier: 'colonist', continentalCavalry: 'continentalArmy', continentalArmy: 'colonist',
  cavalry: 'regular', artillery: 'damagedArtillery',
} as const satisfies Partial<Record<UnitTypeId, UnitTypeId>>;

/** Units that are simply destroyed when beaten. */
export const DESTROYED_WHEN_BEATEN: readonly UnitTypeId[] = ['regular', 'damagedArtillery', 'scout', 'pioneer', 'missionary', 'brave', 'armedBrave', 'mountedBrave', 'mountedWarrior'];
/** Units taken by a European victor (destroyed by a native one). */
export const CAPTURED_WHEN_BEATEN: readonly UnitTypeId[] = ['colonist', 'wagonTrain', 'treasure'];

/** The step each rank takes when promoted for valor. */
export const PROMOTION = {
  pettyCriminal: 'indenturedServant', indenturedServant: 'freeColonist', freeColonist: 'veteranSoldier',
} as const satisfies Partial<Record<ProfessionId, ProfessionId>>;

/** After the Declaration a rebel veteran who distinguishes himself joins the Continental line. */
export const CONTINENTAL = { soldier: 'continentalArmy', dragoon: 'continentalCavalry' } as const satisfies Partial<Record<UnitTypeId, UnitTypeId>>;

/** How a brave is re-equipped: with muskets, with horses. */
export const BRAVE_WITH_MUSKETS = { brave: 'armedBrave', mountedBrave: 'mountedWarrior' } as const satisfies Partial<Record<UnitTypeId, UnitTypeId>>;
export const BRAVE_WITH_HORSES = { brave: 'mountedBrave', armedBrave: 'mountedWarrior' } as const satisfies Partial<Record<UnitTypeId, UnitTypeId>>;
