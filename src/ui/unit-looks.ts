// Which figure a unit is drawn as: its look, read from its type and profession alone (spec unit-looks, R-1068).
// How a unit is drawn, not a rule the engine reads, so it lives here and not in src/engine/data.
import type { ProfessionId } from '../engine/data/professions';
import type { UnitTypeId } from '../engine/data/units';
import type { INK } from './pixel-art';

/** A colour of the map palette, by name. */
export type InkName = keyof typeof INK;

export interface LookDef {
  /** The unit type whose figure stands in until the look has a picture of its own, and whose shape the far zoom draws. */
  readonly type: UnitTypeId;
  /** The dominant colour of the figure's clothes, and the coat of its far-zoom piece. */
  readonly coat: InkName;
}

/**
 * Every look: one per unit type (the ordinary figures, the ships, the Crown's, the Continental and the native
 * units, whose far coat stays ink), one per profession a colonist shows unequipped, and one per role's expert.
 */
export const LOOKS = {
  colonist: { type: 'colonist', coat: 'prairie' },
  expertFarmer: { type: 'colonist', coat: 'leaf' },
  masterSugarPlanter: { type: 'colonist', coat: 'white' },
  masterTobaccoPlanter: { type: 'colonist', coat: 'savannah' },
  masterCottonPlanter: { type: 'colonist', coat: 'sand' },
  expertFurTrapper: { type: 'colonist', coat: 'wood' },
  expertLumberjack: { type: 'colonist', coat: 'red' },
  expertOreMiner: { type: 'colonist', coat: 'darkGrey' },
  expertSilverMiner: { type: 'colonist', coat: 'lightGrey' },
  expertFisherman: { type: 'colonist', coat: 'wave' },
  masterDistiller: { type: 'colonist', coat: 'purple' },
  masterTobacconist: { type: 'colonist', coat: 'earth' },
  masterWeaver: { type: 'colonist', coat: 'brightBlue' },
  masterFurTrader: { type: 'colonist', coat: 'deepForest' },
  masterCarpenter: { type: 'colonist', coat: 'hill' },
  masterBlacksmith: { type: 'colonist', coat: 'orange' },
  masterGunsmith: { type: 'colonist', coat: 'swamp' },
  firebrandPreacher: { type: 'colonist', coat: 'deepSea' },
  elderStatesman: { type: 'colonist', coat: 'parchment' },
  hardyPioneer: { type: 'colonist', coat: 'tundra' },
  veteranSoldier: { type: 'colonist', coat: 'blue' },
  seasonedScout: { type: 'colonist', coat: 'green' },
  jesuitMissionary: { type: 'colonist', coat: 'ink' },
  indenturedServant: { type: 'colonist', coat: 'grey' },
  pettyCriminal: { type: 'colonist', coat: 'marsh' },
  indianConvert: { type: 'colonist', coat: 'grass' },
  expertSoldier: { type: 'soldier', coat: 'blue' },
  expertDragoon: { type: 'dragoon', coat: 'blue' },
  expertPioneer: { type: 'pioneer', coat: 'tundra' },
  expertScout: { type: 'scout', coat: 'green' },
  expertMissionary: { type: 'missionary', coat: 'ink' },
  soldier: { type: 'soldier', coat: 'ink' },
  pioneer: { type: 'pioneer', coat: 'ink' },
  missionary: { type: 'missionary', coat: 'ink' },
  dragoon: { type: 'dragoon', coat: 'ink' },
  scout: { type: 'scout', coat: 'ink' },
  regular: { type: 'regular', coat: 'ink' },
  continentalCavalry: { type: 'continentalCavalry', coat: 'ink' },
  cavalry: { type: 'cavalry', coat: 'ink' },
  continentalArmy: { type: 'continentalArmy', coat: 'ink' },
  treasure: { type: 'treasure', coat: 'ink' },
  artillery: { type: 'artillery', coat: 'ink' },
  damagedArtillery: { type: 'damagedArtillery', coat: 'ink' },
  wagonTrain: { type: 'wagonTrain', coat: 'ink' },
  caravel: { type: 'caravel', coat: 'ink' },
  merchantman: { type: 'merchantman', coat: 'ink' },
  galleon: { type: 'galleon', coat: 'ink' },
  privateer: { type: 'privateer', coat: 'ink' },
  frigate: { type: 'frigate', coat: 'ink' },
  manOWar: { type: 'manOWar', coat: 'ink' },
  brave: { type: 'brave', coat: 'ink' },
  armedBrave: { type: 'armedBrave', coat: 'ink' },
  mountedBrave: { type: 'mountedBrave', coat: 'ink' },
  mountedWarrior: { type: 'mountedWarrior', coat: 'ink' },
} as const satisfies Record<UnitTypeId, LookDef> & Record<string, LookDef>;

export type LookId = keyof typeof LOOKS;
export const LOOK_IDS = Object.keys(LOOKS) as LookId[];

export const isLook = (name: string): name is LookId => Object.hasOwn(LOOKS, name);

/**
 * The look of a colonist with no equipment, by profession: its own figure; a free colonist and an expert
 * teacher the plain colonist; a veteran dragoon counts as a veteran soldier.
 */
export const PROFESSION_LOOKS = {
  expertFarmer: 'expertFarmer', masterSugarPlanter: 'masterSugarPlanter', masterTobaccoPlanter: 'masterTobaccoPlanter',
  masterCottonPlanter: 'masterCottonPlanter', expertFurTrapper: 'expertFurTrapper', expertLumberjack: 'expertLumberjack',
  expertOreMiner: 'expertOreMiner', expertSilverMiner: 'expertSilverMiner', expertFisherman: 'expertFisherman',
  masterDistiller: 'masterDistiller', masterTobacconist: 'masterTobacconist', masterWeaver: 'masterWeaver',
  masterFurTrader: 'masterFurTrader', masterCarpenter: 'masterCarpenter', masterBlacksmith: 'masterBlacksmith',
  masterGunsmith: 'masterGunsmith', firebrandPreacher: 'firebrandPreacher', elderStatesman: 'elderStatesman',
  expertTeacher: 'colonist', freeColonist: 'colonist', hardyPioneer: 'hardyPioneer', veteranSoldier: 'veteranSoldier',
  seasonedScout: 'seasonedScout', veteranDragoon: 'veteranSoldier', jesuitMissionary: 'jesuitMissionary',
  indenturedServant: 'indenturedServant', pettyCriminal: 'pettyCriminal', indianConvert: 'indianConvert',
} as const satisfies Record<ProfessionId, LookId>;

interface RoleExpert {
  readonly experts: readonly ProfessionId[];
  readonly look: LookId;
}

/** The roles whose expert has a figure of his own: who counts as the expert, and the look he shows in the role. */
export const ROLE_EXPERT_LOOKS: Partial<Record<UnitTypeId, RoleExpert>> = {
  soldier: { experts: ['veteranSoldier', 'veteranDragoon'], look: 'expertSoldier' },
  dragoon: { experts: ['veteranSoldier', 'veteranDragoon'], look: 'expertDragoon' },
  pioneer: { experts: ['hardyPioneer'], look: 'expertPioneer' },
  scout: { experts: ['seasonedScout'], look: 'expertScout' },
  missionary: { experts: ['jesuitMissionary'], look: 'expertMissionary' },
};

/**
 * The look a unit is drawn as (the private notes): a colonist with no equipment shows its profession; a soldier,
 * dragoon, pioneer, scout or missionary shows its role's expert figure when the unit is that expert and the
 * ordinary figure for anyone else; every other unit type has one figure, whatever the profession.
 */
export function lookOf(type: UnitTypeId, profession: ProfessionId | null): LookId {
  if (type === 'colonist') return profession === null ? 'colonist' : PROFESSION_LOOKS[profession];
  const role = ROLE_EXPERT_LOOKS[type];
  if (role && profession !== null && role.experts.includes(profession)) return role.look;
  return type;
}
