// Construction rule numbers (R-303; docs/RULES.md "Construction").
import type { BuildingId } from './buildings';
import type { UnitTypeId } from './units';

export const CONSTRUCTION = {
  /** Gold per hammer still missing when a project is bought. */
  goldPerHammer: 13,
  /** Added to the market price of tools for each tool still missing. */
  toolSurcharge: 4,
  /** The price doubles when no hammers at all have been put toward the project. */
  noProgressMultiplier: 2,
  /** What a new colony starts building. */
  firstProject: 'warehouse',
  firstProjectPort: 'docks',
} as const;

/** Units a colony can build, with the building each needs (null = none). */
export const BUILDABLE_UNITS = {
  wagonTrain: null,
  artillery: 'armory',
  caravel: 'shipyard',
  merchantman: 'shipyard',
  galleon: 'shipyard',
  privateer: 'shipyard',
  frigate: 'shipyard',
} as const satisfies Partial<Record<UnitTypeId, BuildingId | null>>;
export type BuildableUnit = keyof typeof BUILDABLE_UNITS;
