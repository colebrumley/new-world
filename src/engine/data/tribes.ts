// Native nations (name, adjective, treasure, tech level, colour index), and what each tech
// level is called and what its settlements are. Populations, land radius and the alarm scale
// are in docs/RULES.md "Tribes".

export const TRIBE_IDS = ['inca', 'aztec', 'arawak', 'iroquois', 'cherokee', 'apache', 'sioux', 'tupi'] as const;
export type TribeId = (typeof TRIBE_IDS)[number];

export const TECH_LEVELS = [
  { name: 'Semi-Nomadic', settlement: 'Camp', plural: 'Camps' },
  { name: 'Agrarian', settlement: 'Village', plural: 'Villages' },
  { name: 'Advanced', settlement: 'City', plural: 'Cities' },
  { name: 'Civilized', settlement: 'City', plural: 'Cities' },
] as const;
/** What a tribe's chief settlement is called, whatever its level. */
export const CAPITAL_NAME = { settlement: 'Capital', plural: 'Capitals' } as const;

export interface TribeDef {
  readonly name: string;
  readonly adjective: string;
  /** What their treasure is called when a settlement is plundered. */
  readonly treasure: string;
  /** Index into TECH_LEVELS. */
  readonly tech: 0 | 1 | 2 | 3;
  /** A palette index (not used for drawing; our colours are our own). */
  readonly colorIndex: number;
  /** How far from a settlement its land reaches, in the distance measure max + min/2. */
  readonly landRadius: number;
}

export const TRIBES = {
  inca: { name: 'Incas', adjective: 'Inca', treasure: 'Jewelled Relics', tech: 3, colorIndex: 97, landRadius: 3 },
  aztec: { name: 'Aztecs', adjective: 'Aztec', treasure: 'Gold Bars', tech: 2, colorIndex: 149, landRadius: 2 },
  arawak: { name: 'Arawaks', adjective: 'Arawak', treasure: 'Bone Jewelry', tech: 1, colorIndex: 54, landRadius: 1 },
  iroquois: { name: 'Iroquois', adjective: 'Iroquois', treasure: 'Wood Carvings', tech: 1, colorIndex: 87, landRadius: 1 },
  cherokee: { name: 'Cherokee', adjective: 'Cherokee', treasure: 'Turquoise', tech: 1, colorIndex: 67, landRadius: 1 },
  apache: { name: 'Apache', adjective: 'Apache', treasure: 'Beads', tech: 0, colorIndex: 111, landRadius: 1 },
  sioux: { name: 'Sioux', adjective: 'Sioux', treasure: 'Beads', tech: 0, colorIndex: 118, landRadius: 1 },
  tupi: { name: 'Tupi', adjective: 'Tupi', treasure: 'Gems', tech: 0, colorIndex: 71, landRadius: 1 },
} as const satisfies Record<TribeId, TribeDef>;

/** Numbers every tribe shares. */
export const NATIVES = {
  /** A settlement starts with base + perTech x tech people; a capital may grow by tech + capitalExtra more. */
  populationBase: 3,
  populationPerTech: 2,
  capitalExtra: 1,
  /** A settlement's growth counter gains its population each turn; at this it replaces its brave or grows by one. */
  growthAt: 20,
  /** Each settlement keeps at most this many braves abroad. */
  bravesPerSettlement: 1,
  /** Tribal alarm runs 0..max; the attitude level steps up at each of these. */
  alarmMax: 100,
  alarmLevels: [25, 50, 75],
  /** Settlement alarm at which it turns ships away, and at which its brave turns hostile. */
  settlementWary: 64,
  settlementHostile: 128,
  /** Tribal alarm at the start: 0..startAlarmSpread, plus startAlarmPerLevel x difficulty for a human; at most contactAlarmCap on first meeting. */
  startAlarmSpread: 14,
  startAlarmPerLevel: 2,
  contactAlarmCap: 20,
} as const;

/** People in a new settlement of this tribe, and the most it can hold (more in the capital). */
export function settlementPopulation(tribe: TribeId, capital: boolean): { start: number; max: number } {
  const tech = TRIBES[tribe].tech;
  const start = NATIVES.populationBase + NATIVES.populationPerTech * tech;
  return { start, max: capital ? start + tech + NATIVES.capitalExtra : start };
}

/** Attitude level for a tribal alarm value: 0 content .. 3 hostile. */
export function alarmLevel(alarm: number): 0 | 1 | 2 | 3 {
  return NATIVES.alarmLevels.filter((mark) => alarm >= mark).length as 0 | 1 | 2 | 3;
}

/** How a tribe or settlement feels about a European power, mildest first (NAMES @ATTITUDE). */
export const ATTITUDES = ['Content', 'Uneasy', 'Restless', 'Angry', 'War'] as const;
/** Adverbs of intensity, strongest first (NAMES @ATTITUDINAL). */
export const ATTITUDE_ADVERBS = ['Extremely', 'Very', 'Rather', 'Somewhat', 'Slightly'] as const;

/** Other native nations named in the table, used for flavour only. */
export const OTHER_TRIBE_NAMES = [
  'Maya', 'Toltec', 'Kiowa', 'Huron', 'Hopi', 'Navajo', 'Cheyenne', 'Cree', 'Algonquin', 'Powhatan', 'Delaware',
  'Shawnee', 'Illinois', 'Chickasaw', 'Choctaw', 'Seminole', 'Mohican', 'Zapotec',
] as const;

/** A map never holds more native settlements than this (map editor limit). */
export const MAX_SETTLEMENTS = 84;
