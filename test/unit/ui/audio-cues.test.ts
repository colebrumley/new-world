import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../../../src/engine/actions';
import type { GameState } from '../../../src/engine/state';
import { ambientPhrase, cueLength, CUE_IDS, CUES, cuesFor } from '../../../src/ui/audio-cues';
import { withColony, withUnit, world } from '../../helpers/world';

const ROWS = ['~~~~~~~~', '~......~', '~......~', '~~~~~~~~'];
function base(): GameState {
  let s = world({ rows: ROWS, players: [{ id: 'a' }, { id: 'b', kind: 'ai' }] });
  s = withColony(s, { id: 'mine', x: 2, y: 1, name: 'Mine' });
  s = withColony(s, { id: 'theirs', owner: 'b', x: 5, y: 2, name: 'Theirs' });
  s = withUnit(s, { id: 'u', x: 3, y: 1 });
  return withUnit(s, { id: 'foe', owner: 'b', type: 'soldier', x: 4, y: 2 });
}
const cues = (...events: GameEvent[]): string[] => cuesFor(events, base(), 'a');

describe('sound cues', () => {
  it('are defined for each of the six moments, every tone audible and in range', () => {
    expect(Object.keys(CUES).sort()).toEqual([...CUE_IDS].sort());
    for (const id of CUE_IDS) {
      expect(CUES[id].tones.length).toBeGreaterThan(0);
      for (const t of CUES[id].tones) {
        expect(t.gain).toBeGreaterThan(0);
        expect(t.gain).toBeLessThanOrEqual(0.4);
        expect(t.duration).toBeGreaterThan(0);
        expect(t.frequency === 0 || (t.frequency >= 40 && t.frequency <= 4000)).toBe(true);
      }
      expect(cueLength(id)).toBeLessThan(2);
    }
    expect(CUES).toMatchSnapshot();
  });

  it('a move of ours sounds a footfall; a move of theirs is silent', () => {
    expect(cues({ type: 'unitMoved', unitId: 'u', from: [2, 1], to: [3, 1] })).toEqual(['move']);
    expect(cues({ type: 'unitMoved', unitId: 'foe', from: [4, 1], to: [4, 2] })).toEqual([]);
    expect(cues({ type: 'unitLanded', unitId: 'u', carrierId: 'ship', to: [3, 1] })).toEqual(['move']);
  });

  it('a fight we are in sounds gunfire, whoever began it, even if our unit did not survive it', () => {
    const battle = (attackerId: string, defenderId: string): GameEvent => ({ type: 'battle', attackerId, defenderId, x: 4, y: 2, attack: 8, defense: 8, attackerWon: true });
    expect(cues(battle('u', 'foe'))).toEqual(['combat']);
    expect(cues(battle('foe', 'u'))).toEqual(['combat']);
    expect(cues(battle('foe', 'gone'))).toEqual([]);
    expect(cues(battle('foe', 'gone'), { type: 'unitLost', unitId: 'gone', owner: 'a', fate: 'destroyed', became: null, lost: {} })).toEqual(['combat']);
    expect(cues({ type: 'colonyRaided', colonyId: 'mine', tribe: 'sioux', outcome: 'nothing', good: null, amount: 0, building: null } as GameEvent)).toEqual(['combat']);
    expect(cues({ type: 'colonyRaided', colonyId: 'theirs', tribe: 'sioux', outcome: 'nothing', good: null, amount: 0, building: null } as GameEvent)).toEqual([]);
  });

  it('something finished in a colony of ours, an immigrant for us, our turn beginning', () => {
    expect(cues({ type: 'buildingCompleted', colonyId: 'mine', building: 'stockade', tools: 0 })).toEqual(['buildComplete']);
    expect(cues({ type: 'buildingCompleted', colonyId: 'theirs', building: 'stockade', tools: 0 })).toEqual([]);
    expect(cues({ type: 'unitBuilt', colonyId: 'mine', unitId: 'w', unitType: 'wagonTrain', tools: 0 })).toEqual(['buildComplete']);
    expect(cues({ type: 'immigrantArrived', player: 'a', unitId: 'i', profession: 'freeColonist' } as GameEvent)).toEqual(['immigrant']);
    expect(cues({ type: 'immigrantArrived', player: 'b', unitId: 'i', profession: 'freeColonist' } as GameEvent)).toEqual([]);
    expect(cues({ type: 'playerTurnStarted', player: 'a', turn: 3 })).toEqual(['newTurn']);
    expect(cues({ type: 'playerTurnStarted', player: 'b', turn: 3 })).toEqual([]);
  });

  it('drums when a people turns to war against us, burns a colony of ours, or sides with the Crown', () => {
    expect(cues({ type: 'attitudeChanged', tribe: 'sioux', player: 'a', from: 2, to: 3 })).toEqual(['drums']);
    expect(cues({ type: 'attitudeChanged', tribe: 'sioux', player: 'a', from: 1, to: 2 })).toEqual([]);
    expect(cues({ type: 'attitudeChanged', tribe: 'sioux', player: 'a', from: 3, to: 2 })).toEqual([]);
    expect(cues({ type: 'attitudeChanged', tribe: 'sioux', player: 'b', from: 2, to: 3 })).toEqual([]);
    expect(cues({ type: 'tribeJoinedCrown', tribe: 'sioux', against: 'a' })).toEqual(['drums']);
  });

  it('each cue once, the gravest first', () => {
    expect(cues(
      { type: 'playerTurnStarted', player: 'a', turn: 3 },
      { type: 'unitMoved', unitId: 'u', from: [2, 1], to: [3, 1] },
      { type: 'unitMoved', unitId: 'u', from: [3, 1], to: [4, 1] },
      { type: 'buildingCompleted', colonyId: 'mine', building: 'stockade', tools: 0 },
      { type: 'attitudeChanged', tribe: 'sioux', player: 'a', from: 2, to: 3 },
    )).toEqual(['drums', 'buildComplete', 'newTurn', 'move']);
    expect(cues()).toEqual([]);
  });

  it('the music switch is not a cue category', () => {
    for (const id of CUE_IDS) expect(['eventMusic', 'soundEffects']).toContain(CUES[id].category);
  });
});

describe('ambient music', () => {
  it('a phrase is sixteen beats of melody in the mode over a drone, ending on the home note', () => {
    const { tones, length } = ambientPhrase(7);
    expect(length).toBeCloseTo(16 * 0.42);
    const melody = tones.filter((t) => t.wave === 'triangle');
    const drone = tones.filter((t) => t.wave === 'sine');
    expect(drone).toHaveLength(2);
    for (const d of drone) expect(d.duration).toBeCloseTo(length);
    expect(melody.length).toBeGreaterThanOrEqual(8);
    expect(melody.at(-1)?.frequency).toBe(293.66);
    for (const t of melody) expect(t.at + t.duration).toBeLessThanOrEqual(length + 1e-9);
  });

  it('is the same for the same seed and different for another', () => {
    expect(ambientPhrase(3)).toEqual(ambientPhrase(3));
    expect(ambientPhrase(3).tones.map((t) => t.frequency)).not.toEqual(ambientPhrase(4).tones.map((t) => t.frequency));
  });
});
