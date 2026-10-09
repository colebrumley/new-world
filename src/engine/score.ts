// The colonial score (R-902): what a power's colonies, Congress, treasury and conduct are
// worth, the rating that scales it by difficulty, and the honour that goes with the rating.
// Rules in docs/RULES.md "Score".
import { dateOfTurn } from './calendar';
import { UNSKILLED, type ProfessionId } from './data/professions';
import { HONOURS, SCORE } from './data/score';
import { UNIT_TYPES } from './data/units';
import { DIFFICULTIES } from './data/yields';
import { rebelSentiment } from './liberty';
import type { GameState, Player, PlayerId } from './state';

export interface ScoreBreakdown {
  /** Colonists in colonies and afield, counted by kind. */
  readonly experts: number;
  readonly free: number;
  readonly lowly: number;
  readonly population: number;
  readonly fathers: number;
  readonly gold: number;
  /** Never positive: the price of native settlements destroyed. */
  readonly natives: number;
  readonly sentiment: number;
  /** For a war of independence declared early and won. */
  readonly early: number;
  /** For bells rung after foreign intervention. */
  readonly bells: number;
  /** Sum of the above. */
  readonly subtotal: number;
  /** Independence won: 100, 50, 25 or 12 by how many powers were free first; 0 otherwise. */
  readonly bonusPercent: number;
  readonly total: number;
}

export interface Rating {
  /** The score scaled by difficulty. */
  readonly weighted: number;
  /** The Colonial Rating, per cent. */
  readonly percent: number;
  /** Index into HONOURS, or null when nothing is named after the player. */
  readonly rank: number | null;
}

const pointsFor = (profession: ProfessionId): 'experts' | 'free' | 'lowly' => (profession === 'freeColonist' ? 'free' : UNSKILLED.includes(profession) ? 'lowly' : 'experts');

/** Did this power win its independence by arms? */
export function wonIndependence(state: GameState, playerId: PlayerId): boolean {
  return state.over?.reason === 'independence' && state.over.player === playerId;
}

export function scoreOf(state: GameState, playerId: PlayerId): ScoreBreakdown {
  const player = state.players.find((p) => p.id === playerId) as Player | undefined;
  const zero: ScoreBreakdown = { experts: 0, free: 0, lowly: 0, population: 0, fathers: 0, gold: 0, natives: 0, sentiment: 0, early: 0, bells: 0, subtotal: 0, bonusPercent: 0, total: 0 };
  if (!player) return zero;
  const war = player.revolution;
  const counts = { experts: 0, free: 0, lowly: 0 };
  for (const colony of Object.values(state.colonies)) {
    // colonies the King has taken in the war still count as the rebels' people
    if (colony.owner !== playerId && !(war && colony.owner === state.crownPlayer)) continue;
    for (const c of colony.colonists) counts[pointsFor(c.profession)]++;
  }
  for (const unit of Object.values(state.units)) {
    if (unit.owner !== playerId || unit.profession === null || UNIT_TYPES[unit.type].domain !== 'land') continue;
    counts[pointsFor(unit.profession)]++;
  }
  const population = SCORE.expert * counts.experts + SCORE.free * counts.free + SCORE.lowly * counts.lowly;
  const fathers = SCORE.perFather * player.fathers.length;
  const gold = player.gold >= SCORE.goldPerPoint ? Math.floor(player.gold / SCORE.goldPerPoint) : 0;
  const natives = -(DIFFICULTIES.indexOf(state.difficulty) + 1) * player.villagesBurned;
  const sentiment = war ? war.sentiment : rebelSentiment(state, playerId);
  const won = wonIndependence(state, playerId);
  const declaredYear = war ? dateOfTurn(war.declaredTurn).year : 0;
  const early = won && war && declaredYear < SCORE.earlyBefore ? SCORE.earlyPerYear * (SCORE.earlyBefore - declaredYear) : 0;
  const bells = war?.intervened && war.bells >= SCORE.bellsPerPoint ? Math.min(SCORE.bellsCap, Math.floor(war.bells / SCORE.bellsPerPoint)) : 0;
  const subtotal = population + fathers + gold + natives + sentiment + early + bells;
  const ahead = state.players.filter((p) => p.id !== playerId && p.independent).length;
  const bonusPercent = won ? 100 >> ahead : 0;
  const total = won ? (subtotal * (SCORE.independenceBase + (SCORE.independenceBase >> ahead))) >> 3 : subtotal;
  return { ...counts, population, fathers, gold, natives, sentiment, early, bells, subtotal, bonusPercent, total };
}

/** The rating and the honour for a score at this difficulty. */
export function ratingOf(difficulty: GameState['difficulty'], score: number): Rating {
  const factor = SCORE.difficultyFactor[DIFFICULTIES.indexOf(difficulty)] ?? SCORE.difficultyFactor[0];
  const weighted = score <= 0 ? 0 : Math.floor((factor * score) / 100);
  let rank: number | null = null;
  for (let k = 1; k <= SCORE.ranks; k++) if (Math.floor((k * k) / 3) < weighted) rank = k - 1;
  return { weighted, percent: Math.floor(weighted / 2), rank };
}

/** What is named after the player at this rank. */
export function honourFor(rank: number | null): string | null {
  return rank === null ? null : HONOURS[Math.min(rank, HONOURS.length - 1)] ?? null;
}
