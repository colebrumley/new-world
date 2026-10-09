import { describe, expect, it } from 'vitest';
import { fatherCost } from '../../../src/engine/congress';
import { DIFFICULTIES, type Difficulty } from '../../../src/engine/data/yields';
import { describeDifficulty, DIFFICULTY_NAMES, difficultyProfile } from '../../../src/engine/difficulty';
import { createGame } from '../../../src/engine/game';
import { interventionBells } from '../../../src/engine/independence';
import { toryPenalty } from '../../../src/engine/liberty';
import { royalIncome } from '../../../src/engine/royal';
import { ratingOf, scoreOf } from '../../../src/engine/score';
import type { Colonist, GameState } from '../../../src/engine/state';
import { withColony, world } from '../../helpers/world';

const ROWS = ['~~~~~~', '~....~', '~....~', '~~~~~~'];
const at = (difficulty: Difficulty): GameState => world({ rows: ROWS, difficulty, players: [{ id: 'a' }, { id: 'b', kind: 'ai' }] });
const each = <T>(pick: (d: Difficulty) => T): T[] => DIFFICULTIES.map(pick);
const people = (n: number): Colonist[] => Array.from({ length: n }, (_, i) => ({ id: `c${i}`, profession: 'freeColonist' as const, job: { kind: 'idle' as const }, turns: 0 }));

describe('the five levels', () => {
  it('are named and ordered from easiest to hardest', () => {
    expect(each((d) => DIFFICULTY_NAMES[d])).toEqual(['Discoverer', 'Explorer', 'Conquistador', 'Governor', 'Viceroy']);
    expect(each((d) => difficultyProfile(d).level)).toEqual([0, 1, 2, 3, 4]);
  });

  it('the profile table', () => {
    expect(each(difficultyProfile)).toMatchSnapshot();
  });

  it('starting gold falls away', () => {
    expect(each((d) => difficultyProfile(d).startingGold)).toEqual([1000, 300, 0, 0, 0]);
    // and a new game really starts a human with it, a computer power with none
    for (const d of DIFFICULTIES) {
      const game = createGame({ seed: 1, difficulty: d, players: [{ id: 'h', name: 'H', kind: 'human' }, { id: 'c', name: 'C', kind: 'ai' }] });
      expect(game.players.map((p) => p.gold)).toEqual([difficultyProfile(d).startingGold, 0]);
      expect(game.players[0]?.ref).toEqual(difficultyProfile(d).ref);
    }
  });

  it('fewer Tories are needed to hold a colony back', () => {
    expect(each((d) => difficultyProfile(d).toryThreshold)).toEqual([10, 9, 8, 7, 6]);
    // eight Tories: no penalty until the threshold comes down to them
    const colony = (d: Difficulty): GameState => withColony(at(d), { id: 'col', x: 2, y: 1, name: 'C', colonists: people(8), sol: { n: 0, d: 900 } });
    expect(each((d) => toryPenalty(colony(d), colony(d).colonies['col']!))).toEqual([0, 0, 1, 1, 1]);
  });

  it('Founding Fathers cost a human more and a computer power less', () => {
    expect(each((d) => difficultyProfile(d).firstFatherBells)).toEqual([24, 32, 40, 48, 56]);
    expect(each((d) => difficultyProfile(d).rivalFirstFatherBells)).toEqual([56, 52, 48, 44, 40]);
    expect(each((d) => fatherCost(at(d), 'a'))).toEqual([24, 32, 40, 48, 56]);
    expect(each((d) => fatherCost(at(d), 'b'))).toEqual([56, 52, 48, 44, 40]);
  });

  it('the Royal Expeditionary Force is larger and grows faster', () => {
    expect(each((d) => Object.values(difficultyProfile(d).ref))).toEqual([[15, 5, 2, 2], [23, 10, 8, 5], [31, 15, 14, 8], [39, 20, 20, 11], [47, 25, 26, 14]]);
    expect(each((d) => difficultyProfile(d).royalMoneyPerTurn)).toEqual([10, 18, 26, 34, 42]);
    expect(each((d) => royalIncome(at(d)))).toEqual([10, 18, 26, 34, 42]);
    expect(each((d) => difficultyProfile(d).refOpenBonus)).toEqual([0, 5, 10, 15, 20]);
  });

  it('the native peoples are warier of a human from the start', () => {
    expect(each((d) => difficultyProfile(d).nativeAlarmAtStart)).toEqual([0, 2, 4, 6, 8]);
  });

  it('foreign help in the War of Independence takes more bells', () => {
    expect(each((d) => difficultyProfile(d).interventionBells)).toEqual([2000, 3500, 5000, 6500, 8000]);
    expect(each((d) => interventionBells(at(d)))).toEqual([2000, 3500, 5000, 6500, 8000]);
  });

  it('destroying a native settlement costs more points, and the same score rates higher', () => {
    expect(each((d) => difficultyProfile(d).villagePenalty)).toEqual([1, 2, 3, 4, 5]);
    const burned = (d: Difficulty): GameState => ({ ...at(d), players: at(d).players.map((p) => ({ ...p, villagesBurned: 2 })) });
    expect(each((d) => scoreOf(burned(d), 'a').natives)).toEqual([-2, -4, -6, -8, -10]);
    expect(each((d) => difficultyProfile(d).ratingFactor)).toEqual([4, 5, 6, 8, 10]);
    expect(each((d) => ratingOf(d, 500).percent)).toEqual([10, 12, 15, 20, 25]);
  });

  it('each has a line for the setup screen', () => {
    expect(describeDifficulty('discoverer')).toBe('Discoverer: 1000 gold to start; the King keeps 22 troops and 2 warships ready; the rating counts 1 times what it would on Discoverer.');
    expect(describeDifficulty('viceroy')).toBe('Viceroy: 0 gold to start; the King keeps 98 troops and 14 warships ready; the rating counts 2.5 times what it would on Discoverer.');
  });
});
