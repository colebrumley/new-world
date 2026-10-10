// Unit types. Each row:
//   name, icon, movement, attack, combat, cargo, size, cost, tools, guns, hull, AI role bits.
// Build cost in a colony is cost x 32 hammers and tools x 10 tools.
import { SIGHT } from './sight';

export const UNIT_TYPE_IDS = [
  'colonist', 'soldier', 'pioneer', 'missionary', 'dragoon', 'scout', 'regular', 'continentalCavalry',
  'cavalry', 'continentalArmy', 'treasure', 'artillery', 'damagedArtillery', 'wagonTrain', 'caravel',
  'merchantman', 'galleon', 'privateer', 'frigate', 'manOWar', 'brave', 'armedBrave', 'mountedBrave',
  'mountedWarrior',
] as const;
export type UnitTypeId = (typeof UNIT_TYPE_IDS)[number];

export const AI_ROLES = ['invade', 'settle', 'explore', 'attack', 'defend', 'escort', 'transport', 'naval'] as const;
export type AiRole = (typeof AI_ROLES)[number];

export const HAMMERS_PER_COST = 32;
export const TOOLS_PER_COST = 10;
/** Size value the table uses for units that can never be carried. */
export const NOT_CARRIED = 99;

export interface Equipment {
  readonly muskets: number;
  readonly horses: number;
  readonly tools: number;
}

export interface UnitTypeDef {
  readonly name: string;
  readonly domain: 'land' | 'sea';
  readonly moves: number;
  readonly attack: number;
  readonly defense: number;
  /** Cargo holds. */
  readonly holds: number;
  /** Holds this unit fills aboard a carrier: 1 for people, 6 for treasure, 99 = cannot be carried, 0 for natives. */
  readonly size: number;
  /** Raw "cost", "tools", "guns" and "hull" columns. Guns and hull are stored but unused. */
  readonly cost: number;
  readonly toolsCost: number;
  readonly guns: number;
  readonly hull: number;
  /** What it takes to build one in a colony, or null if it cannot be built. */
  readonly build: { readonly hammers: number; readonly tools: number } | null;
  /** Purchase price on the Europe docks, or null if not sold. */
  readonly europePrice: number | null;
  /** Goods a colonist carries to be this unit. */
  readonly equipment: Equipment;
  /** True for the colonist and the five roles a colonist takes on by equipping. */
  readonly colonistRole: boolean;
  readonly native: boolean;
  readonly aiRoles: readonly AiRole[];
  readonly sight: number;
}

const NONE: Equipment = { muskets: 0, horses: 0, tools: 0 };

function roles(bits: string): AiRole[] {
  return AI_ROLES.filter((_, i) => bits[i] === '1');
}

function unit(
  id: string, name: string, moves: number, attack: number, defense: number, holds: number, size: number,
  cost: number, toolsCost: number, guns: number, hull: number, bits: string,
  extra: Partial<Pick<UnitTypeDef, 'domain' | 'build' | 'europePrice' | 'equipment' | 'colonistRole' | 'native'>> = {},
): UnitTypeDef {
  return {
    name, domain: 'land', moves, attack, defense, holds, size, cost, toolsCost, guns, hull,
    build: null, europePrice: null, equipment: NONE, colonistRole: false, native: false,
    aiRoles: roles(bits),
    sight: (SIGHT.extendedUnits as readonly string[]).includes(id) ? SIGHT.extended : SIGHT.default,
    ...extra,
  };
}

const built = (cost: number, toolsCost: number): UnitTypeDef['build'] => ({ hammers: cost * HAMMERS_PER_COST, tools: toolsCost * TOOLS_PER_COST });

/** Wagon Train hammers: the table's cost 1 would give 32; the game charges 40 (see FIDELITY.md). */
export const WAGON_TRAIN_HAMMERS = 40;

/** Artillery price in Europe rises by this much with each purchase. */
export const ARTILLERY_PRICE_STEP = 100;

export const UNIT_TYPES = {
  colonist: unit('colonist', 'Colonist', 1, 0, 1, 0, 1, 1, 0, 0, 0, '01000000', { colonistRole: true }),
  soldier: unit('soldier', 'Soldier', 1, 2, 2, 0, 1, 2, 0, 0, 0, '00011100', { colonistRole: true, equipment: { muskets: 50, horses: 0, tools: 0 } }),
  pioneer: unit('pioneer', 'Pioneer', 1, 0, 1, 0, 1, 2, 0, 0, 0, '01000000', { colonistRole: true, equipment: { muskets: 0, horses: 0, tools: 100 } }),
  missionary: unit('missionary', 'Missionary', 2, 0, 1, 0, 1, 1, 0, 0, 0, '00100000', { colonistRole: true }),
  dragoon: unit('dragoon', 'Dragoon', 4, 3, 3, 0, 1, 3, 0, 0, 0, '00111100', { colonistRole: true, equipment: { muskets: 50, horses: 50, tools: 0 } }),
  scout: unit('scout', 'Scout', 4, 1, 1, 0, 1, 2, 0, 0, 0, '01100100', { colonistRole: true, equipment: { muskets: 0, horses: 50, tools: 0 } }),
  regular: unit('regular', "King's Regular", 1, 5, 5, 0, 1, 3, 0, 0, 0, '00011100'),
  continentalCavalry: unit('continentalCavalry', 'Continental Cavalry', 4, 5, 5, 0, 1, 3, 0, 0, 0, '00011100'),
  cavalry: unit('cavalry', "King's Cavalry", 4, 6, 6, 0, 1, 4, 0, 0, 0, '00011100'),
  continentalArmy: unit('continentalArmy', 'Continental Army', 1, 4, 4, 0, 1, 3, 0, 0, 0, '00011100'),
  treasure: unit('treasure', 'Treasure Train', 1, 0, 0, 0, 6, 4, 0, 0, 0, '00000000'),
  artillery: unit('artillery', 'Artillery', 1, 7, 5, 0, 1, 6, 4, 0, 0, '00011000', { build: built(6, 4), europePrice: 500 }),
  // Not a table row: artillery that lost a battle.
  damagedArtillery: unit('damagedArtillery', 'Damaged Artillery', 1, 5, 3, 0, 1, 6, 4, 0, 0, '00011000'),
  wagonTrain: unit('wagonTrain', 'Wagon Train', 2, 0, 1, 2, NOT_CARRIED, 1, 0, 0, 0, '00000000', { build: { hammers: WAGON_TRAIN_HAMMERS, tools: 0 } }),
  caravel: unit('caravel', 'Caravel', 4, 0, 2, 2, NOT_CARRIED, 4, 4, 0, 4, '10100010', { domain: 'sea', build: built(4, 4), europePrice: 1000 }),
  merchantman: unit('merchantman', 'Merchantman', 5, 0, 6, 4, NOT_CARRIED, 6, 8, 1, 8, '10000010', { domain: 'sea', build: built(6, 8), europePrice: 2000 }),
  galleon: unit('galleon', 'Galleon', 6, 0, 10, 6, NOT_CARRIED, 10, 10, 4, 20, '10000010', { domain: 'sea', build: built(10, 10), europePrice: 3000 }),
  privateer: unit('privateer', 'Privateer', 8, 8, 8, 2, NOT_CARRIED, 8, 12, 4, 12, '00000001', { domain: 'sea', build: built(8, 12), europePrice: 2000 }),
  frigate: unit('frigate', 'Frigate', 6, 16, 16, 4, NOT_CARRIED, 16, 20, 12, 32, '10000001', { domain: 'sea', build: built(16, 20), europePrice: 5000 }),
  manOWar: unit('manOWar', 'Man-O-War', 5, 24, 24, 6, NOT_CARRIED, 32, 90, 32, 64, '10000001', { domain: 'sea' }),
  brave: unit('brave', 'Braves', 1, 1, 1, 0, 0, 1, 0, 0, 0, '00111000', { native: true }),
  armedBrave: unit('armedBrave', 'Armed Braves', 1, 2, 2, 0, 0, 2, 0, 0, 0, '00111000', { native: true, equipment: { muskets: 50, horses: 0, tools: 0 } }),
  mountedBrave: unit('mountedBrave', 'Mounted Braves', 4, 2, 2, 0, 0, 2, 0, 0, 0, '00111000', { native: true, equipment: { muskets: 0, horses: 50, tools: 0 } }),
  mountedWarrior: unit('mountedWarrior', 'Mounted Warriors', 4, 3, 3, 0, 0, 3, 0, 0, 0, '00111000', { native: true, equipment: { muskets: 50, horses: 50, tools: 0 } }),
} as const satisfies Record<UnitTypeId, UnitTypeDef>;

export function isShip(type: UnitTypeId): boolean {
  return UNIT_TYPES[type].domain === 'sea';
}

/** Pioneers carry tools in lots of 20, from one lot up to the full equipment. */
export const PIONEER_TOOLS = { min: 20, max: 100, perAction: 20 } as const;
