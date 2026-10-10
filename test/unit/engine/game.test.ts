import { describe, expect, it } from 'vitest';
import { NATION_IDS, NATIONS } from '../../../src/engine/data/nations';
import { DIFFICULTIES } from '../../../src/engine/data/yields';
import { createGame, landingParty, leaderName, standardPowers } from '../../../src/engine/game';
import type { Unit } from '../../../src/engine/state';

describe('standardPowers', () => {
  it('seats the human first under the name given, then the other powers in order for the computer', () => {
    expect(standardPowers('france', 'X')).toEqual([
      { id: 'p0', name: 'X', kind: 'human', nation: 'france' },
      { id: 'england', name: 'England', kind: 'ai', nation: 'england' },
      { id: 'spain', name: 'Spain', kind: 'ai', nation: 'spain' },
      { id: 'netherlands', name: 'Netherlands', kind: 'ai', nation: 'netherlands' },
    ]);
    expect(standardPowers('england', 'Walter Raleigh').map((p) => p.id)).toEqual(['p0', 'france', 'spain', 'netherlands']);
  });

  it('gives a human France a Caravel with a Soldier and a Hardy Pioneer', () => {
    const s = createGame({ seed: 4, scenario: 'america', difficulty: 'conquistador', players: standardPowers('france', 'X') });
    const mine = Object.values(s.units).filter((u) => u.owner === 'p0');
    expect(s.players[0]).toMatchObject({ id: 'p0', name: 'X', kind: 'human', nation: 'france' });
    expect(mine.map((u) => [u.type, u.profession]).sort()).toEqual([['caravel', null], ['pioneer', 'hardyPioneer'], ['soldier', 'freeColonist']]);
  });
});

describe('landingParty', () => {
  it('matches the units createGame places, for every power at every level, human and computer', () => {
    for (const difficulty of DIFFICULTIES) {
      for (const human of NATION_IDS) {
        const s = createGame({ seed: 4, scenario: 'america', difficulty, players: standardPowers(human, 'X') });
        for (const p of s.players) {
          const units = Object.values(s.units).filter((u) => u.owner === p.id);
          const ship = units.find((u) => u.aboard === null) as Unit;
          const soldier = units.find((u) => u.type === 'soldier') as Unit;
          const pioneer = units.find((u) => u.type === 'pioneer') as Unit;
          expect({ ship: ship.type, soldier: soldier.profession, pioneer: pioneer.profession }, `${p.nation} ${p.kind} ${difficulty}`).toEqual(landingParty(p.nation, p.kind, difficulty));
        }
      }
    }
  });

  it('a veteran for Spain always, for a human on the two easiest levels; a hardy pioneer for France; a merchantman for the Dutch', () => {
    expect(landingParty('spain', 'ai', 'viceroy').soldier).toBe('veteranSoldier');
    expect(DIFFICULTIES.map((d) => landingParty('england', 'human', d).soldier)).toEqual(['veteranSoldier', 'veteranSoldier', 'freeColonist', 'freeColonist', 'freeColonist']);
    expect(landingParty('england', 'ai', 'discoverer').soldier).toBe('freeColonist');
    expect(landingParty('france', 'ai').pioneer).toBe('hardyPioneer');
    expect(landingParty('netherlands', 'human')).toEqual({ ship: 'merchantman', soldier: 'freeColonist', pioneer: 'freeColonist' });
  });
});

describe('leaderName', () => {
  it("is the human's own name, the leader's for a computer power, and the leader's for a human named only Player", () => {
    expect(leaderName({ name: 'Cortes', kind: 'human', nation: 'spain' })).toBe('Cortes');
    expect(leaderName({ name: 'France', kind: 'ai', nation: 'france' })).toBe(NATIONS.france.leader);
    expect(leaderName({ name: 'Player', kind: 'human', nation: 'england' })).toBe('Walter Raleigh');
  });
});
