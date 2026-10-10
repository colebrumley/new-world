// What a computer power does next once its colonies are in order. Each colony's project and
// jobs are settled first every turn; tests about ships, soldiers and the docks look past that.
import { europeanAction } from '../../src/ai/european';
import { applyAction, type Action } from '../../src/engine/actions';
import type { GameState } from '../../src/engine/state';

const isHousekeeping = (a: Action): boolean => a.type === 'setConstruction' || a.type === 'assignJob';

/** The first action that is not colony housekeeping, with the state the housekeeping left. */
export function afterHousekeeping(state: GameState): { state: GameState; action: Action } {
  let now = state;
  for (let i = 0; i < 200; i++) {
    const action = europeanAction(now);
    if (!isHousekeeping(action)) return { state: now, action };
    now = applyAction(now, action).state;
  }
  throw new Error('colony housekeeping did not settle');
}

/** The first action that is not colony housekeeping. */
export const policy = (state: GameState): Action => afterHousekeeping(state).action;
