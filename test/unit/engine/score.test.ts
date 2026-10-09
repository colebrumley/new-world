import { describe, expect, it } from 'vitest';
import { applyAction, listValidActions, validateAction } from '../../../src/engine/actions';
import { firstTurnOfYear } from '../../../src/engine/calendar';
import { HONOURS, SCORE } from '../../../src/engine/data/score';
import { honourFor, ratingOf, scoreOf, wonIndependence } from '../../../src/engine/score';
import type { Colonist, GameState, Player, Revolution } from '../../../src/engine/state';
import { withColony, withUnit, world } from '../../helpers/world';

const ROWS = ['~~~~~~~~', '~......~', '~......~', '~......~', '~~~~~~~~'];
const patch = (s: GameState, change: Partial<Player>, id = 'a'): GameState => ({ ...s, players: s.players.map((p) => (p.id === id ? { ...p, ...change } : p)) });
const folk = (...jobs: Colonist['profession'][]): Colonist[] => jobs.map((profession, i) => ({ id: `p${i}`, profession, job: { kind: 'idle' as const }, turns: 0 }));
const base = (difficulty: GameState['difficulty'] = 'conquistador'): GameState => world({ rows: ROWS, difficulty, players: [{ id: 'a' }, { id: 'b', kind: 'ai' }, { id: 'c', kind: 'ai' }, { id: 'd', kind: 'ai' }] });
const WAR: Revolution = { declaredTurn: firstTurnOfYear(1776), sentiment: 64, friend: null, patron: null, force: { infantry: 0, cavalry: 0, artillery: 0, ships: 0 }, bells: 0, considered: true, mustered: true, intervened: false, refBeaten: true, uprisings: [] };

describe('score tables', () => {
  it('match the snapshot', () => {
    expect(SCORE).toMatchSnapshot();
    expect(HONOURS).toHaveLength(SCORE.ranks);
    expect(new Set(HONOURS).size).toBe(HONOURS.length);
  });
});

describe('the score', () => {
  it('counts every colonist by kind, in colonies and afield', () => {
    let s = withColony(base(), { id: 'col', x: 2, y: 2, name: 'C', colonists: folk('expertFarmer', 'elderStatesman', 'freeColonist', 'indenturedServant', 'pettyCriminal', 'indianConvert'), sol: { n: 0, d: 700 } });
    expect(scoreOf(s, 'a')).toMatchObject({ experts: 2, free: 1, lowly: 3, population: 13, total: 13 });
    // a veteran under arms, a free colonist as a pioneer, a servant walking: 4 + 2 + 1
    s = withUnit(s, { id: 'v', type: 'dragoon', profession: 'veteranSoldier', x: 3, y: 2 });
    s = withUnit(s, { id: 'p', type: 'pioneer', x: 3, y: 2 });
    s = withUnit(s, { id: 'w', profession: 'indenturedServant', x: 3, y: 2 });
    // things that are nobody: guns, wagons, ships
    s = withUnit(s, { id: 'g', type: 'artillery', profession: null, x: 3, y: 2 });
    s = withUnit(s, { id: 't', type: 'wagonTrain', profession: null, x: 3, y: 2 });
    s = withUnit(s, { id: 'ship', type: 'caravel', profession: null, x: 0, y: 2 });
    expect(scoreOf(s, 'a')).toMatchObject({ experts: 3, free: 2, lowly: 4, population: 20 });
    // other people's colonists are not ours
    expect(scoreOf(withColony(s, { id: 'theirs', owner: 'b', x: 5, y: 2, name: 'T', colonists: folk('expertFarmer') }), 'a').population).toBe(20);
  });

  it('adds five for each Founding Father and one for each thousand in gold', () => {
    const s = world({ rows: ROWS, players: [{ id: 'a', fathers: ['adamSmith', 'peterMinuit', 'thomasPaine'] }] });
    expect(scoreOf(s, 'a')).toMatchObject({ fathers: 15, gold: 0, total: 15 });
    expect(scoreOf(patch(s, { gold: 999 }), 'a').gold).toBe(0);
    expect(scoreOf(patch(s, { gold: 1000 }), 'a').gold).toBe(1);
    expect(scoreOf(patch(s, { gold: 12999 }), 'a')).toMatchObject({ gold: 12, total: 27 });
  });

  it('takes off for native settlements destroyed, more on the harder levels', () => {
    expect(scoreOf(patch(base('discoverer'), { villagesBurned: 3 }), 'a')).toMatchObject({ natives: -3, total: -3 });
    expect(scoreOf(patch(base('conquistador'), { villagesBurned: 3 }), 'a').natives).toBe(-9);
    expect(scoreOf(patch(base('viceroy'), { villagesBurned: 3 }), 'a').natives).toBe(-15);
  });

  it('adds the rebel sentiment: as it stands, or as it stood at the Declaration', () => {
    const s = withColony(base(), { id: 'col', x: 2, y: 2, name: 'C', colonists: folk('freeColonist', 'freeColonist'), sol: { n: 120, d: 300 } });
    expect(scoreOf(s, 'a')).toMatchObject({ population: 4, sentiment: 40, total: 44 });
    expect(scoreOf(patch(s, { atWar: true, revolution: WAR }), 'a').sentiment).toBe(64);
  });

  it('during the war, colonies the King has taken still count', () => {
    let s = withColony(base(), { id: 'col', x: 2, y: 2, name: 'C', colonists: folk('freeColonist'), sol: { n: 0, d: 200 } });
    s = withColony(s, { id: 'lost', owner: 'b', x: 5, y: 2, name: 'L', colonists: folk('expertFarmer', 'expertFarmer') });
    expect(scoreOf(s, 'a').population).toBe(2);
    expect(scoreOf({ ...patch(s, { atWar: true, revolution: WAR }), crownPlayer: 'b' }, 'a').population).toBe(10);
  });

  describe('independence', () => {
    const won = (change: Partial<Revolution> = {}, others = 0): GameState => {
      let s = withColony(base(), { id: 'col', x: 2, y: 2, name: 'C', colonists: folk('freeColonist', 'freeColonist', 'freeColonist') });
      s = patch(s, { atWar: true, revolution: { ...WAR, sentiment: 50, ...change } });
      ['b', 'c', 'd'].slice(0, others).forEach((id) => {
        s = patch(s, { independent: true }, id);
      });
      return { ...s, over: { reason: 'independence', turn: 500, player: 'a' } };
    };

    it('won first doubles the score; behind one power it is half as much again, behind two a quarter', () => {
      // 6 for the people + 50 sentiment + 8 for declaring in 1776
      expect(scoreOf(won(), 'a')).toMatchObject({ population: 6, sentiment: 50, early: 8, subtotal: 64, bonusPercent: 100, total: 128 });
      expect(scoreOf(won({}, 1), 'a')).toMatchObject({ bonusPercent: 50, total: 96 });
      expect(scoreOf(won({}, 2), 'a')).toMatchObject({ bonusPercent: 25, total: 80 });
      expect(scoreOf(won({}, 3), 'a')).toMatchObject({ bonusPercent: 12, total: 72 });
      expect(wonIndependence(won(), 'a')).toBe(true);
    });

    it('the earlier the Declaration the better, but only before 1780 and only if the war is won', () => {
      expect(scoreOf(won({ declaredTurn: firstTurnOfYear(1700) }), 'a').early).toBe(160);
      expect(scoreOf(won({ declaredTurn: firstTurnOfYear(1780) }), 'a').early).toBe(0);
      expect(scoreOf(won({ declaredTurn: firstTurnOfYear(1790) }), 'a').early).toBe(0);
      const fighting = { ...won(), over: null };
      expect(scoreOf(fighting, 'a')).toMatchObject({ early: 0, bonusPercent: 0, total: 56 });
      const lost: GameState = { ...won(), over: { reason: 'crownVictory', turn: 500, player: 'a' } };
      expect(scoreOf(lost, 'a')).toMatchObject({ early: 0, bonusPercent: 0, total: 56 });
    });

    it('bells rung after the intervention count a point a hundred, to a hundred points', () => {
      expect(scoreOf(won({ intervened: true, bells: 99 }), 'a').bells).toBe(0);
      expect(scoreOf(won({ intervened: true, bells: 2550 }), 'a').bells).toBe(25);
      expect(scoreOf(won({ intervened: true, bells: 99999 }), 'a').bells).toBe(100);
      expect(scoreOf(won({ intervened: false, bells: 2550 }), 'a').bells).toBe(0);
    });
  });

  it('is nothing for nobody', () => {
    expect(scoreOf(base(), 'zz').total).toBe(0);
  });
});

describe('the rating', () => {
  it('scales the score by the difficulty', () => {
    expect((['discoverer', 'explorer', 'conquistador', 'governor', 'viceroy'] as const).map((d) => ratingOf(d, 1000).weighted)).toEqual([40, 50, 60, 80, 100]);
    expect(ratingOf('conquistador', 1000)).toEqual({ weighted: 60, percent: 30, rank: 12 });
  });

  it('awards an honour by rank: the thresholds rise as the square', () => {
    // rank r needs a weighted score above floor((r + 1)^2 / 3)
    const least = (rank: number): number => Math.floor(((rank + 1) * (rank + 1)) / 3) + 1;
    expect([0, 1, 2, 3, 4, 5, 23].map(least)).toEqual([1, 2, 4, 6, 9, 13, 193]);
    for (let rank = 0; rank < 24; rank++) {
      // on Viceroy the weighted score is a tenth of the score
      expect(ratingOf('viceroy', least(rank) * 10).rank).toBe(rank);
      expect(ratingOf('viceroy', least(rank) * 10 - 10).rank).toBe(rank === 0 ? null : rank - 1);
    }
    expect(ratingOf('viceroy', 99999).rank).toBe(23);
  });

  it('gives nothing for nothing', () => {
    expect(ratingOf('viceroy', 0)).toEqual({ weighted: 0, percent: 0, rank: null });
    expect(ratingOf('viceroy', -50)).toEqual({ weighted: 0, percent: 0, rank: null });
    expect(ratingOf('discoverer', 24)).toEqual({ weighted: 0, percent: 0, rank: null });
    expect(honourFor(null)).toBeNull();
    expect(honourFor(0)).toBe(HONOURS[0]);
    expect(honourFor(23)).toBe(HONOURS[23]);
  });
});

describe('when the game is scored', () => {
  const eve = (): GameState => {
    const s = withUnit(withColony(base(), { id: 'col', x: 2, y: 2, name: 'C' }), { id: 'u', x: 3, y: 2 });
    // the last power's turn in the last year before 1800
    return { ...s, turn: firstTurnOfYear(1800) - 1, current: 3 };
  };

  it('in 1800 the game stops; the player may play on, and is never stopped by the calendar again', () => {
    const ended = applyAction(eve(), { type: 'endTurn' });
    expect(ended.state.over).toMatchObject({ reason: 'retired', player: 'a' });
    expect(validateAction(ended.state, { type: 'endTurn' }).ok).toBe(false);
    expect(validateAction(ended.state, { type: 'continuePlaying' }).ok).toBe(true);
    const on = applyAction(ended.state, { type: 'continuePlaying' });
    expect(on.state.over).toBeNull();
    expect(on.state.players[0]?.scored).toBe(true);
    expect(on.events.some((e) => e.type === 'playerTurnStarted' && e.player === 'a')).toBe(true);
    expect(on.state.units['u']?.movesLeft).toBeGreaterThan(0);
    // many years later it is still going
    let s = on.state;
    for (let i = 0; i < 4 * 120; i++) s = applyAction(s, { type: 'endTurn' }).state;
    expect(s.over).toBeNull();
    expect(validateAction(s, { type: 'continuePlaying' }).ok).toBe(false);
  });

  it('retiring ends it at once and for good', () => {
    const s = withColony(base(), { id: 'col', x: 2, y: 2, name: 'C' });
    const done = applyAction(s, { type: 'retire' });
    expect(done.state.over).toEqual({ reason: 'retiredEarly', turn: 0, player: 'a' });
    expect(done.events).toEqual([{ type: 'gameEnded', reason: 'retiredEarly', player: 'a', turn: 0, year: 1492 }]);
    expect(validateAction(done.state, { type: 'continuePlaying' }).ok).toBe(false);
    expect(validateAction(done.state, { type: 'retire' }).ok).toBe(false);
  });

  it('the computer is never offered either', () => {
    const types = listValidActions(base()).map((a) => a.type);
    expect(types).not.toContain('retire');
    expect(types).not.toContain('continuePlaying');
  });
});
