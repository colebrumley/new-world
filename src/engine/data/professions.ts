// Colonist professions, transcribed from NAMES.TXT @JOB: job name, expert name, the school
// level that can teach it (1 Schoolhouse, 2 College, 3 University, 4 never), and the Royal
// University price (null where the file has -1: not for sale).
import type { RawGood } from './terrain';

export const PROFESSION_IDS = [
  'expertFarmer', 'masterSugarPlanter', 'masterTobaccoPlanter', 'masterCottonPlanter', 'expertFurTrapper',
  'expertLumberjack', 'expertOreMiner', 'expertSilverMiner', 'expertFisherman', 'masterDistiller',
  'masterTobacconist', 'masterWeaver', 'masterFurTrader', 'masterCarpenter', 'masterBlacksmith',
  'masterGunsmith', 'firebrandPreacher', 'elderStatesman', 'expertTeacher', 'freeColonist', 'hardyPioneer',
  'veteranSoldier', 'seasonedScout', 'veteranDragoon', 'jesuitMissionary', 'indenturedServant',
  'pettyCriminal', 'indianConvert',
] as const;
export type ProfessionId = (typeof PROFESSION_IDS)[number];

export type ExpertRole = 'pioneer' | 'soldier' | 'scout' | 'dragoon' | 'missionary';

export interface ProfessionDef {
  readonly job: string;
  readonly name: string;
  readonly plural: string;
  readonly teachLevel: 1 | 2 | 3 | 4;
  readonly europePrice: number | null;
  /** Raw good this expert is skilled at producing on the land. */
  readonly expertGood: RawGood | null;
  /** Equipped role this expert is skilled in. */
  readonly expertRole: ExpertRole | null;
  /** Can be learned in a native settlement (manual p.133 asterisks). */
  readonly nativeTaught: boolean;
  /** False for the two table rows that never exist as a colonist in play. */
  readonly colonist: boolean;
}

function job(
  jobName: string, name: string, plural: string, teachLevel: 1 | 2 | 3 | 4, europePrice: number | null,
  extra: Partial<Pick<ProfessionDef, 'expertGood' | 'expertRole' | 'nativeTaught' | 'colonist'>> = {},
): ProfessionDef {
  return { job: jobName, name, plural, teachLevel, europePrice, expertGood: null, expertRole: null, nativeTaught: false, colonist: true, ...extra };
}

export const PROFESSIONS = {
  expertFarmer: job('Farmer', 'Expert Farmer', 'Expert Farmers', 1, 1100, { expertGood: 'food', nativeTaught: true }),
  masterSugarPlanter: job('Sugar Planter', 'Master Sugar Planter', 'Master Sugar Planters', 2, null, { expertGood: 'sugar', nativeTaught: true }),
  masterTobaccoPlanter: job('Tobacco Planter', 'Master Tobacco Planter', 'Master Tobacco Planters', 2, null, { expertGood: 'tobacco', nativeTaught: true }),
  masterCottonPlanter: job('Cotton Planter', 'Master Cotton Planter', 'Master Cotton Planters', 2, null, { expertGood: 'cotton', nativeTaught: true }),
  expertFurTrapper: job('Fur Trapper', 'Expert Fur Trapper', 'Expert Fur Trappers', 1, null, { expertGood: 'furs', nativeTaught: true }),
  expertLumberjack: job('Lumberjack', 'Expert Lumberjack', 'Expert Lumberjacks', 1, 700, { expertGood: 'lumber' }),
  expertOreMiner: job('Ore Miner', 'Expert Ore Miner', 'Expert Ore Miners', 1, 600, { expertGood: 'ore', nativeTaught: true }),
  expertSilverMiner: job('Silver Miner', 'Expert Silver Miner', 'Expert Silver Miners', 1, 900, { expertGood: 'silver', nativeTaught: true }),
  expertFisherman: job('Fisherman', 'Expert Fisherman', 'Expert Fishermen', 1, 1000, { expertGood: 'fish', nativeTaught: true }),
  masterDistiller: job('Distiller', 'Master Distiller', 'Master Distillers', 2, 1100),
  masterTobacconist: job('Tobacconist', 'Master Tobacconist', 'Master Tobacconists', 2, 1200),
  masterWeaver: job('Weaver', 'Master Weaver', 'Master Weavers', 2, 1300),
  masterFurTrader: job('Fur Trader', 'Master Fur Trader', 'Master Fur Traders', 2, 950),
  masterCarpenter: job('Carpenter', 'Master Carpenter', 'Master Carpenters', 1, 1000),
  masterBlacksmith: job('Blacksmith', 'Master Blacksmith', 'Master Blacksmiths', 2, 1050),
  masterGunsmith: job('Gunsmith', 'Master Gunsmith', 'Master Gunsmiths', 2, 850),
  firebrandPreacher: job('Preacher', 'Firebrand Preacher', 'Firebrand Preachers', 3, 1500),
  elderStatesman: job('Statesman', 'Elder Statesman', 'Elder Statesmen', 3, 1900),
  expertTeacher: job('Teacher', 'Expert Teacher', 'Expert Teachers', 4, null, { colonist: false }),
  freeColonist: job('Colonist', 'Free Colonist', 'Free Colonists', 4, null),
  hardyPioneer: job('Pioneer', 'Hardy Pioneer', 'Hardy Pioneers', 1, 1200, { expertRole: 'pioneer' }),
  veteranSoldier: job('Soldier', 'Veteran Soldier', 'Veteran Soldiers', 2, 2000, { expertRole: 'soldier' }),
  seasonedScout: job('Scout', 'Seasoned Scout', 'Seasoned Scouts', 1, null, { expertRole: 'scout', nativeTaught: true }),
  veteranDragoon: job('Dragoon', 'Veteran Dragoon', 'Veteran Dragoons', 2, null, { expertRole: 'dragoon', colonist: false }),
  jesuitMissionary: job('Missionary', 'Jesuit Missionary', 'Jesuit Missionaries', 3, 1400, { expertRole: 'missionary' }),
  indenturedServant: job('Ind. Servant', 'Indentured Servant', 'Indentured Servants', 4, null),
  pettyCriminal: job('Criminal', 'Petty Criminal', 'Petty Criminals', 4, null),
  indianConvert: job('Convert', 'Indian Convert', 'Indian Converts', 4, null),
} as const satisfies Record<ProfessionId, ProfessionDef>;

/** The four unskilled kinds. */
export const UNSKILLED: readonly ProfessionId[] = ['freeColonist', 'indenturedServant', 'pettyCriminal', 'indianConvert'];

/** The 22 specialists a colonist can be. */
export const SPECIALISTS: readonly ProfessionId[] = PROFESSION_IDS.filter((id) => PROFESSIONS[id].colonist && !UNSKILLED.includes(id));
