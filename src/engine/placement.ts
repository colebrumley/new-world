// Where a colonist is put when nobody says (R-309): on joining a colony, and for colonies the
// AI runs. Food first when the colony is hungry, otherwise the most valuable work, with a
// carpenter as soon as there is something to build and enough to eat.
import { amountOf } from './cargo';
import { NEIGHBORS } from './colony';
import { chainLevel } from './data/buildings';
import type { GoodId } from './data/goods';
import { PLACEMENT } from './data/placement';
import { TRADES } from './data/production';
import { PROFESSIONS } from './data/professions';
import { RAW_GOODS, type RawGood } from './data/terrain';
import { colonyProduction, tradeCapacity, workersIn } from './economy';
import { fieldOutput, squareStatus } from './jobs';
import { bidPrice } from './market';
import { warehouseCapacity } from './pioneer';
import type { Colonist, Colony, GameState, Job } from './state';

const storable = (good: RawGood): GoodId => (good === 'fish' ? 'food' : good);

/** The job a colonist of this profession should take in the colony as it stands (he is not yet counted in it). */
export function suggestPlacement(state: GameState, colony: Colony, profession: Colonist['profession']): Job {
  const report = colonyProduction(state, colony);
  // counting the newcomer's own two food
  const hungry = report.produced.food < report.consumed.food + 2;
  const carpenters = workersIn(colony, 'carpenter').length;
  const canBuild = chainLevel(colony.buildings, TRADES.carpenter.chain) > 0 && carpenters < tradeCapacity(colony, 'carpenter');
  if (!hungry && colony.colonists.length + 1 >= PLACEMENT.carpenterFromPopulation && colony.construction !== null && carpenters === 0 && canBuild) {
    return { kind: 'work', trade: 'carpenter' };
  }

  const expertGood = PROFESSIONS[profession].expertGood;
  const capacity = warehouseCapacity(colony);
  let best: { job: Job; score: number } | null = null;
  for (const [dx, dy] of NEIGHBORS) {
    if (squareStatus(state, colony, dx, dy) !== 'free') continue;
    for (const good of RAW_GOODS) {
      let amount = fieldOutput(state, colony, profession, dx, dy, good);
      if (amount <= 0) continue;
      const stored = storable(good);
      // no point piling up what the warehouse cannot keep (food is never capped)
      if (stored !== 'food') amount = Math.min(amount, Math.max(1, capacity - amountOf(colony.goods, stored)));
      let score = amount * PLACEMENT.yieldWeight + PLACEMENT.closeness - Math.abs(dx) - Math.abs(dy);
      if (good === expertGood) score *= PLACEMENT.expertMultiplier;
      const foodlike = stored === 'food';
      if (hungry) {
        if (foodlike) score *= PLACEMENT.hungerMultiplier;
      } else {
        const worth = foodlike ? 1 : Math.max(1, bidPrice(state, colony.owner, stored));
        // lumber is worth getting only while there is none to hand
        const haveLumber = good === 'lumber' && (amountOf(colony.goods, 'lumber') > 0 || report.produced.lumber > 0);
        score *= haveLumber ? 2 * worth : 2 * worth + 1;
      }
      if (!best || score > best.score) best = { job: { kind: 'field', dx, dy, good }, score };
    }
  }
  if (best) return best.job;
  // nothing to work outdoors: build, if there is a workshop with room
  return canBuild ? { kind: 'work', trade: 'carpenter' } : { kind: 'idle' };
}

/** Put every idle colonist of a colony to work, one after another. Used for colonies the AI manages. */
export function placeIdle(state: GameState, colonyId: string): GameState {
  let next = state;
  for (const colonist of state.colonies[colonyId]?.colonists ?? []) {
    if (colonist.job.kind !== 'idle') continue;
    const colony = next.colonies[colonyId] as Colony;
    const without: Colony = { ...colony, colonists: colony.colonists.filter((c) => c.id !== colonist.id) };
    const job = suggestPlacement({ ...next, colonies: { ...next.colonies, [colonyId]: without } }, without, colonist.profession);
    const colonists = colony.colonists.map((c) => (c.id === colonist.id ? { ...c, job, turns: 0 } : c));
    next = { ...next, colonies: { ...next.colonies, [colonyId]: { ...colony, colonists } } };
  }
  return next;
}
