// Special resources. Names and AI values are transcribed from NAMES.TXT @RESOURCE; the terrain
// each may sit on and its production effect are from docs/RULES.md "Tile yield".
import type { RawGood, TerrainId } from './terrain';

// The table lists Prime Timber twice (two icon slots); one entry is enough here.

export const RESOURCE_IDS = [
  'depletedMine', 'oasis', 'wheat', 'primeCotton', 'primeTobacco', 'primeSugar', 'minerals',
  'fishery', 'beaver', 'game', 'primeTimber', 'silverDeposit', 'oreDeposit',
] as const;
export type ResourceId = (typeof RESOURCE_IDS)[number];

export interface ResourceDef {
  readonly name: string;
  /** Relative strength the AI gives a site with this resource. */
  readonly aiValue: number;
}

export const RESOURCES = {
  depletedMine: { name: 'Depleted Mine', aiValue: 6 },
  oasis: { name: 'Oasis', aiValue: 3 },
  wheat: { name: 'Wheat', aiValue: 4 },
  primeCotton: { name: 'Prime Cotton', aiValue: 6 },
  primeTobacco: { name: 'Prime Tobacco', aiValue: 6 },
  primeSugar: { name: 'Prime Sugar', aiValue: 7 },
  minerals: { name: 'Minerals', aiValue: 4 },
  fishery: { name: 'Fishery', aiValue: 5 },
  beaver: { name: 'Beaver', aiValue: 6 },
  game: { name: 'Game', aiValue: 6 },
  primeTimber: { name: 'Prime Timber', aiValue: 6 },
  silverDeposit: { name: 'Silver Deposit', aiValue: 12 },
  oreDeposit: { name: 'Ore Deposit', aiValue: 6 },
} as const satisfies Record<ResourceId, ResourceDef>;

/** Terrain rows (see terrainOf) each resource may sit on. Arctic and Sea Lane never carry one. */
export const RESOURCE_TERRAINS = {
  depletedMine: ['mountains'],
  oasis: ['desert', 'scrub'],
  wheat: ['plains'],
  primeCotton: ['prairie'],
  primeTobacco: ['grassland'],
  primeSugar: ['savannah'],
  minerals: ['tundra', 'marsh', 'swamp', 'wetland', 'rain'],
  fishery: ['ocean'],
  beaver: ['mixed'],
  game: ['boreal', 'broadleaf'],
  primeTimber: ['conifer', 'tropical'],
  silverDeposit: ['mountains'],
  oreDeposit: ['hills'],
} as const satisfies Record<ResourceId, readonly TerrainId[]>;

/** `double` multiplies the running figure by 2; `add` adds n for a non-expert and 2n for an expert. */
export type ResourceBonus = { readonly kind: 'double' } | { readonly kind: 'add'; readonly n: number };

export const RESOURCE_BONUS = {
  depletedMine: {},
  oasis: { food: { kind: 'add', n: 2 } },
  wheat: { food: { kind: 'add', n: 2 } },
  primeCotton: { cotton: { kind: 'double' } },
  primeTobacco: { tobacco: { kind: 'double' } },
  primeSugar: { sugar: { kind: 'double' } },
  minerals: { ore: { kind: 'add', n: 3 }, silver: { kind: 'add', n: 1 } },
  fishery: { fish: { kind: 'add', n: 3 } },
  beaver: { furs: { kind: 'add', n: 3 } },
  game: { food: { kind: 'add', n: 2 }, furs: { kind: 'add', n: 2 } },
  primeTimber: { lumber: { kind: 'add', n: 2 } },
  silverDeposit: { silver: { kind: 'add', n: 2 } },
  oreDeposit: { ore: { kind: 'add', n: 2 } },
} as const satisfies Record<ResourceId, Partial<Record<RawGood, ResourceBonus>>>;
