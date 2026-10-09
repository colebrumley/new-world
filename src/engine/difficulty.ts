// The five difficulty levels (R-1004). The rules that depend on the level each read their own
// table; this module gathers the headline numbers in one place, for the game-setup screen and
// for a test that the levels really do differ as documented (docs/RULES.md "Difficulty").
import { COMBAT } from './data/combat';
import { CONGRESS } from './data/congress';
import { STARTING_GOLD } from './data/europe';
import { INDEPENDENCE } from './data/independence';
import { LIBERTY } from './data/liberty';
import { ROYAL } from './data/royal';
import { SCORE } from './data/score';
import { NATIVES } from './data/tribes';
import { DIFFICULTIES, type Difficulty } from './data/yields';
import { startingRef } from './royal';
import type { RefForce } from './state';

export const DIFFICULTY_NAMES: Readonly<Record<Difficulty, string>> = { discoverer: 'Discoverer', explorer: 'Explorer', conquistador: 'Conquistador', governor: 'Governor', viceroy: 'Viceroy' };

export interface DifficultyProfile {
  readonly level: number;
  readonly name: string;
  /** Gold a human power starts with. */
  readonly startingGold: number;
  /** Tories in a colony that cost each worker one unit of production. */
  readonly toryThreshold: number;
  /** Liberty bells for a human's first Founding Father, in the first years. */
  readonly firstFatherBells: number;
  /** A computer power's, for comparison: it gets cheaper as the level rises. */
  readonly rivalFirstFatherBells: number;
  /** The Royal Expeditionary Force as the game opens. */
  readonly ref: RefForce;
  /** What the Crown sets aside each turn toward enlarging it, before the later doublings. */
  readonly royalMoneyPerTurn: number;
  /** How wary every native people is of a human power from the outset. */
  readonly nativeAlarmAtStart: number;
  /** Extra strength of the King's troops attacking in the open, per cent. */
  readonly refOpenBonus: number;
  /** Liberty bells that bring a foreign power into the War of Independence. */
  readonly interventionBells: number;
  /** Points lost for each native settlement destroyed. */
  readonly villagePenalty: number;
  /** The score is multiplied by this over a hundred for the rating. */
  readonly ratingFactor: number;
}

export function difficultyProfile(difficulty: Difficulty): DifficultyProfile {
  const d = DIFFICULTIES.indexOf(difficulty);
  const first = (base: number): number => (base + 1) >> 1;
  return {
    level: d,
    name: DIFFICULTY_NAMES[difficulty],
    startingGold: STARTING_GOLD[difficulty],
    toryThreshold: LIBERTY.toryThreshold[difficulty],
    firstFatherBells: first(CONGRESS.humanBase * (d + CONGRESS.humanLevelOffset)),
    rivalFirstFatherBells: first(CONGRESS.aiBase * (CONGRESS.aiLevelFrom - d)),
    ref: startingRef(difficulty),
    royalMoneyPerTurn: ROYAL.moneyBase + ROYAL.moneyPerLevel * d,
    nativeAlarmAtStart: NATIVES.startAlarmPerLevel * d,
    refOpenBonus: Math.trunc((100 * d) / COMBAT.refOpenPerLevel),
    interventionBells: INDEPENDENCE.interventionBells[0] + INDEPENDENCE.interventionBells[1] * d,
    villagePenalty: d + 1,
    ratingFactor: SCORE.difficultyFactor[d] ?? 0,
  };
}

/** One line for the setup screen: what choosing this level means. */
export function describeDifficulty(difficulty: Difficulty): string {
  const p = difficultyProfile(difficulty);
  const force = p.ref.regulars + p.ref.cavalry + p.ref.artillery;
  const scale = (p.ratingFactor / (SCORE.difficultyFactor[0] ?? 1)).toFixed(2).replace(/\.?0+$/, '');
  return `${p.name}: ${p.startingGold} gold to start; the King keeps ${force} troops and ${p.ref.ships} warships ready; the rating counts ${scale} times what it would on ${DIFFICULTY_NAMES.discoverer}.`;
}
