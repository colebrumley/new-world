// The `father` cheat hands the Congress a generator, as the turn code does. No Father's arrival
// throws it today, so this file stands one in that does, to hold the cheat to keeping the throw.
import { describe, expect, it, vi } from 'vitest';
import { applyAction } from '../../../../src/engine/actions';
import type * as Congress from '../../../../src/engine/congress';
import { createRng } from '../../../../src/engine/rng';
import { world } from '../../../helpers/world';

vi.mock('../../../../src/engine/congress', async (importOriginal) => {
  const real = await importOriginal<typeof Congress>();
  const join: typeof real.join = (state, playerId, father, rng, events) => {
    rng.int(1, 6);
    return real.join(state, playerId, father, rng, events);
  };
  return { ...real, join };
});

describe('father, when his arrival throws the dice it was handed', () => {
  it('leaves the state with the dice as thrown', () => {
    const state = world({ rows: ['~..', '...'], players: [{ id: 'a' }, { id: 'b', kind: 'ai' }] });
    const thrown = createRng(state.rng);
    thrown.int(1, 6);
    const next = applyAction(state, { type: 'cheat', command: { cheat: 'father', father: 'adamSmith' } }).state;
    expect(next.rng).toEqual(thrown.state());
    expect(next.rng).not.toEqual(state.rng);
    expect(next.players[0]?.fathers).toEqual(['adamSmith']);
  });
});
