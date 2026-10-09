// Placeholder AI: a random valid action. Real decision-makers replace it phase by phase.
import { listValidActions, type Action } from '../engine/actions';
import type { Rng } from '../engine/rng';
import type { GameState } from '../engine/state';

export function randomAction(state: GameState, rng: Rng): Action {
  return rng.pick(listValidActions(state));
}
