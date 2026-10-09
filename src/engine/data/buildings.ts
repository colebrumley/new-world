import type { FatherId } from './fathers';

// Colony buildings, transcribed from NAMES.TXT @BUILDING in file order:
//   name, hammers, tools (x10), class, minimum population, upkeep.
// Buildings come in chains (house -> shop -> factory); a later link replaces the one before it
// and needs it first. Chain membership and special requirements are from the manual's building
// chart and the original's encyclopedia.

export const BUILDING_IDS = [
  'stockade', 'fort', 'fortress', 'armory', 'magazine', 'arsenal', 'docks', 'drydock', 'shipyard',
  'townHall', 'townHall2', 'townHall3', 'schoolhouse', 'college', 'university', 'warehouse',
  'warehouseExpansion', 'stable', 'customHouse', 'printingPress', 'newspaper', 'weaversHouse',
  'weaversShop', 'textileMill', 'tobacconistsHouse', 'tobacconistsShop', 'cigarFactory',
  'rumDistillersHouse', 'rumDistillery', 'rumFactory', 'capitol', 'capitolExpansion', 'furTradersHouse',
  'furTradingPost', 'furFactory', 'carpentersShop', 'lumberMill', 'church', 'cathedral',
  'blacksmithsHouse', 'blacksmithsShop', 'ironWorks',
] as const;
export type BuildingId = (typeof BUILDING_IDS)[number];

export const BUILDING_CHAINS = {
  fortification: ['stockade', 'fort', 'fortress'],
  armory: ['armory', 'magazine', 'arsenal'],
  docks: ['docks', 'drydock', 'shipyard'],
  townHall: ['townHall'],
  school: ['schoolhouse', 'college', 'university'],
  warehouse: ['warehouse', 'warehouseExpansion'],
  stable: ['stable'],
  customHouse: ['customHouse'],
  press: ['printingPress', 'newspaper'],
  weaver: ['weaversHouse', 'weaversShop', 'textileMill'],
  tobacconist: ['tobacconistsHouse', 'tobacconistsShop', 'cigarFactory'],
  distiller: ['rumDistillersHouse', 'rumDistillery', 'rumFactory'],
  furTrader: ['furTradersHouse', 'furTradingPost', 'furFactory'],
  carpenter: ['carpentersShop', 'lumberMill'],
  church: ['church', 'cathedral'],
  blacksmith: ['blacksmithsHouse', 'blacksmithsShop', 'ironWorks'],
} as const satisfies Record<string, readonly BuildingId[]>;
export type BuildingChain = keyof typeof BUILDING_CHAINS;

export const TOOLS_PER_BUILDING_COST = 10;

export interface BuildingDef {
  readonly name: string;
  readonly hammers: number;
  /** Tools needed, already multiplied out (the table stores tens). */
  readonly tools: number;
  /** Third table column, stored as found. */
  readonly tableClass: number;
  readonly minPopulation: number;
  /** Upkeep value from the table. Stored; not charged (see Appendix E). */
  readonly upkeep: number;
  readonly chain: BuildingChain | null;
  /** Position in its chain: 1 house, 2 shop, 3 factory. */
  readonly level: number;
  /** Founding Father needed to build it. */
  readonly needsFather: FatherId | null;
  /** Needs the colony to border the sea. */
  readonly coastal: boolean;
  /** Present in the data but never offered in play. */
  readonly unused: boolean;
}

function chainOf(id: BuildingId): { chain: BuildingChain | null; level: number } {
  for (const [chain, ids] of Object.entries(BUILDING_CHAINS) as [BuildingChain, readonly BuildingId[]][]) {
    const at = ids.indexOf(id);
    if (at >= 0) return { chain, level: at + 1 };
  }
  return { chain: null, level: 1 };
}

function b(id: BuildingId, name: string, hammers: number, tools: number, tableClass: number, minPopulation: number, upkeep: number, extra: Partial<Pick<BuildingDef, 'needsFather' | 'coastal' | 'unused'>> = {}): BuildingDef {
  return { name, hammers, tools: tools * TOOLS_PER_BUILDING_COST, tableClass, minPopulation, upkeep, ...chainOf(id), needsFather: null, coastal: false, unused: false, ...extra };
}

const SMITH = { needsFather: 'adamSmith' } as const;
const COAST = { coastal: true } as const;
const UNUSED = { unused: true } as const;

export const BUILDINGS = {
  stockade: b('stockade', 'Stockade', 64, 0, 3, 3, 0),
  fort: b('fort', 'Fort', 120, 10, 3, 3, 10),
  fortress: b('fortress', 'Fortress', 320, 20, 3, 8, 15),
  armory: b('armory', 'Armory', 52, 0, 1, 1, 5),
  magazine: b('magazine', 'Magazine', 120, 5, 1, 8, 10),
  arsenal: b('arsenal', 'Arsenal', 240, 10, 1, 8, 15, SMITH),
  docks: b('docks', 'Docks', 52, 0, 4, 1, 5, COAST),
  drydock: b('drydock', 'Drydock', 80, 5, 4, 4, 10, COAST),
  shipyard: b('shipyard', 'Shipyard', 240, 10, 4, 8, 15, COAST),
  townHall: b('townHall', 'Town Hall', 64, 0, 2, 1, 0),
  townHall2: b('townHall2', 'Town Hall', 64, 5, 2, 4, 10, UNUSED),
  townHall3: b('townHall3', 'Town Hall', 120, 10, 2, 8, 15, UNUSED),
  schoolhouse: b('schoolhouse', 'Schoolhouse', 64, 0, 1, 4, 5),
  college: b('college', 'College', 160, 5, 1, 8, 10),
  university: b('university', 'University', 200, 10, 1, 10, 15),
  warehouse: b('warehouse', 'Warehouse', 80, 0, 1, 1, 5),
  warehouseExpansion: b('warehouseExpansion', 'Warehouse Expansion', 80, 2, 1, 1, 5),
  stable: b('stable', 'Stable', 64, 0, 0, 1, 5),
  customHouse: b('customHouse', 'Custom House', 160, 5, 0, 1, 15, { needsFather: 'peterStuyvesant' }),
  printingPress: b('printingPress', 'Printing Press', 52, 2, 0, 1, 5),
  newspaper: b('newspaper', 'Newspaper', 120, 5, 0, 4, 10),
  weaversHouse: b('weaversHouse', "Weaver's House", 64, 0, 0, 1, 0),
  weaversShop: b('weaversShop', "Weaver's Shop", 64, 2, 0, 1, 5),
  textileMill: b('textileMill', 'Textile Mill', 160, 10, 0, 8, 15, SMITH),
  tobacconistsHouse: b('tobacconistsHouse', "Tobacconist's House", 64, 0, 0, 1, 0),
  tobacconistsShop: b('tobacconistsShop', "Tobacconist's Shop", 64, 2, 0, 1, 5),
  cigarFactory: b('cigarFactory', 'Cigar Factory', 160, 10, 0, 8, 15, SMITH),
  rumDistillersHouse: b('rumDistillersHouse', "Rum Distiller's House", 64, 0, 0, 1, 0),
  rumDistillery: b('rumDistillery', 'Rum Distillery', 64, 2, 0, 1, 5),
  rumFactory: b('rumFactory', 'Rum Factory', 160, 10, 0, 8, 15, SMITH),
  capitol: b('capitol', 'Capitol', 400, 10, 2, 16, 20, UNUSED),
  capitolExpansion: b('capitolExpansion', 'Capitol Expansion', 400, 10, 2, 16, 10, UNUSED),
  furTradersHouse: b('furTradersHouse', "Fur Trader's House", 56, 0, 0, 1, 0),
  furTradingPost: b('furTradingPost', 'Fur Trading Post', 56, 2, 0, 1, 5),
  furFactory: b('furFactory', 'Fur Factory', 160, 10, 0, 6, 15, SMITH),
  carpentersShop: b('carpentersShop', "Carpenter's Shop", 39, 0, 1, 1, 0),
  lumberMill: b('lumberMill', 'Lumber Mill', 52, 0, 1, 3, 10),
  church: b('church', 'Church', 64, 0, 2, 3, 5),
  cathedral: b('cathedral', 'Cathedral', 176, 10, 2, 8, 15),
  blacksmithsHouse: b('blacksmithsHouse', "Blacksmith's House", 64, 0, 0, 1, 0),
  blacksmithsShop: b('blacksmithsShop', "Blacksmith's Shop", 64, 2, 0, 1, 5),
  ironWorks: b('ironWorks', 'Iron Works', 240, 10, 0, 8, 15, SMITH),
} as const satisfies Record<BuildingId, BuildingDef>;

/** The building a colony has in a chain: the highest link present, or null. */
export function chainLevel(buildings: readonly string[], chain: BuildingChain): number {
  const ids: readonly string[] = BUILDING_CHAINS[chain];
  let level = 0;
  ids.forEach((id, i) => {
    if (buildings.includes(id)) level = i + 1;
  });
  return level;
}
