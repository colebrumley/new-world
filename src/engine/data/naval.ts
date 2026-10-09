// Ships in harm's way (VICEROY FUN_5000_773e, 5000:7790, FUN_2000_afc6 and the repair counters;
// docs/RULES.md "Naval combat"). Guns and hull are the last two columns of the units table.
import type { UnitTypeId } from './units';

/**
 * Repairs: a counter starts at (the ship's combat value - the victor's, or twice the victor's for
 * a fort) but not below nothing, nor below these head starts; it gains 1 a turn in Europe and 2 in
 * a drydock, and the ship is ready when it reaches the ship's own combat value.
 */
export const REPAIR_HEAD_START = { frigate: 4, manOWar: 8 } as const satisfies Partial<Record<UnitTypeId, number>>;

export const NAVAL = {
  /** Ship types that may attack. */
  warships: ['privateer', 'frigate', 'manOWar'],
  /** Fleets beyond this many merchant ships, or warships, lose ships outright rather than have them damaged. */
  bigFleet: 8,
  /** A caravel is too frail to be worth repairing from this turn on. */
  caravelExpendableFrom: 80,
  /** A power is left this many holds at least: a quarter of its colonists, within these bounds. */
  transportFloor: [3, 6],
  /** A colony needs this building to take in a damaged ship. */
  repairBuilding: 'drydock',
  /** Evasion weights: thirds of movement + base, doubled for a privateer, plus a little for a galleon, less for each hold in use. */
  evadeBase: 3,
  evadeGalleon: 3,
  evadePerCargo: 4,
  /** Each hold in use takes this many eighths off a ship's strength. */
  cargoPenalty: 1,
  /** Zone of patrol: thirds of movement a warship costs a ship that comes alongside. */
  patrolCost: { privateer: 4, frigate: 6, manOWar: 8 },
  patrolEdge: 2,
  /** A fort slows a hostile ship that ends beside it by this many thirds; a fortress stops it. */
  fortSlow: 2,
  /** Fort fire: attack 4 x level (1 fort, 2 fortress) x (1 + artillery in the colony). */
  fortFirePerLevel: 4,
  /** Infiltrating a colony: the scout is caught when a throw of 1..36 is at most 2 x (6 + fortification levels), halved for a seasoned scout. */
  infiltrateDie: 36,
  infiltrateBase: 6,
  /** A captured scout leaves the colony this many horses. */
  scoutHorses: 100,
  /** A captured colony keeps this fraction of its Sons of Liberty. */
  capturedSol: [2, 3],
  /** A drafted colonist takes up muskets with Revere if the colony has this many. */
  revereMuskets: 50,
} as const;
