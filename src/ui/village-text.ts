// What the player is told when a scout has spoken with a chief: one text, whether the player sent
// the scout in or it went on its own under the Explore order.
import { GOOD_NAMES } from '../engine/data/goods';
import { PROFESSIONS } from '../engine/data/professions';
import type { GameEvent } from '../engine/actions';

export type ChiefSpoke = Extract<GameEvent, { type: 'chiefSpoke' }>;

const OUTCOME: Readonly<Record<ChiefSpoke['outcome'], (e: ChiefSpoke) => string>> = {
  killed: () => 'The scout was put to death as a spy.',
  nothing: () => 'The chief had little to say.',
  promotion: () => 'The chief taught our scout the ways of the land: a Seasoned Scout.',
  tales: () => 'The chief told tales of the lands around, now marked on our map.',
  gift: (e) => `The chief sent us away with gifts worth ${e.gold} gold.`,
};

/** The result of a talk with a chief, then (unless the scout was killed) what his people want and teach. */
export function chiefSpokeText(e: ChiefSpoke): string {
  const result = OUTCOME[e.outcome](e);
  if (e.outcome === 'killed') return result;
  const wants = e.wants.map((g) => GOOD_NAMES[g]).join(', ');
  return `${result}${wants ? ` His people would trade for ${wants}.` : ''} They can teach the trade of the ${PROFESSIONS[e.skill].name}.`;
}
