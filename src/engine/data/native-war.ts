// War and dealings between natives and colonists (docs/RULES.md "Natives at war").
import type { BuildingId } from './buildings';

export const NATIVE_WAR = {
  /** Attacking natives angers the tribe by this plus the difficulty level; doubly for a settlement, six times for a capital. */
  attackAlarm: 5,
  settlementFactor: 2,
  capitalFactor: 6,
  /** The settlement attacked turns hostile at once. */
  attackedSettlementAlarm: 256,
  /** A settlement's stand-in defenders ride if the tribe's breeding stock is at least this. */
  mountedDefenderBreeding: 25,
  /** After its capital falls a tribe is cowed to this alarm at most. */
  cowedAlarm: 15,

  /** A new brave rides if breeding stock allows (and uses it up). */
  mountBreeding: 50,

  /** How a tribe feels after its brave has won: over a unit, over a colony's defender, after burning a colony. */
  wonUnitAlarm: -5,
  wonColonyAlarm: -10,
  burnedColonyAlarm: -50,

  /** Raid: a throw of 0..12, less one; under 3 x fortification + 1 nothing happens. */
  raidDie: 12,
  raidPerFort: 3,
  /** On the two easiest levels early raids spare buildings and ships (turn limits by level). */
  raidMercyTurns: [80, 40],
  /** Stolen goods: only stocks of at least this, and between a tenth-or-half and half of the stock. */
  raidStockMinimum: 10,
  raidHorsesBreeding: 25,
  raidGoldMinimum: 50,
  /** Tribal alarm after each kind of raid. */
  raidAlarm: { goods: -4, gold: -8, building: -12, ship: -16 },

  /** A visit is friendly when 4 x (alarm above 25) + settlement alarm is within a throw of 1..this. */
  friendlyDie: 328,
  friendlyAlarmFrom: 25,
  /** Begging needs this much food in the colony, and asks for half of it. */
  begFoodAtLeast: 75,
  begRelief: 5,
  /** After a gift or reparations tribal alarm is brought down to this at most, five at a time. */
  appeasedAlarm: 70,
  /** A food gift tops a hungry colony up to this, if it has no more than the second figure. */
  foodGiftUpTo: 75,
  foodGiftWhenAtMost: 25,
  /** A goods gift: 100 / (European price + 1), within these bounds. */
  giftLeast: 5,
  giftMost: 100,
  giftFloor: 2,
  /** Refusing a demand turns the settlement hostile by this much. */
  refusalAlarm: 128,
  /** Horses handed over add this to breeding if the brave already rides. */
  reparationBreeding: 50,
  /** Converts come with a friendly visit (see missions). */
} as const;

/** Buildings a raid never burns. */
export const RAID_SPARES: readonly BuildingId[] = [
  'stockade', 'fort', 'fortress', 'townHall', 'carpentersShop', 'weaversHouse', 'tobacconistsHouse', 'rumDistillersHouse', 'furTradersHouse', 'blacksmithsHouse',
];

/** Treasure from a destroyed settlement, by tribe level. Amounts are in gold. */
export const TREASURE = {
  /** Camps: one chance in `odds` (Spain `spainOdds`), always from a capital or with Cortes; a throw of low..high hundreds. */
  camp: { odds: 7, spainOdds: 4, low: 2, high: 4, unit: 100 },
  village: { odds: 3, spainOdds: 3, low: 3, high: 8, unit: 100 },
  /** Cities always yield. Aztec: (a throw, larger for the capital, + Cortes + Spain) thousands. */
  aztec: { low: 2, high: 6, capitalLow: 4, capitalHigh: 10, cortes: 6, spain: 3, unit: 1000 },
  /** Inca: a throw of low..high times (base, more for the capital, + Cortes + Spain) hundreds. */
  inca: { low: 2, high: 6, base: 16, capitalBase: 25, cortes: 10, spain: 5, unit: 100 },
  capitalFactor: 2,
  /** Cortes adds half again to what camps and villages yield. */
  cortesHalf: 2,
} as const;
