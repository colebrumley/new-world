import { describe, expect, it } from 'vitest';
import { DEFAULT_WORLD } from '../../../../src/engine/data/mapgen';
import { NATION_IDS, NATIONS, STARTING_FORCE } from '../../../../src/engine/data/nations';
import { DIFFICULTIES } from '../../../../src/engine/data/yields';
import { createGame } from '../../../../src/engine/game';
import { checkInvariants } from '../../../../src/engine/invariants';
import type { GameState, Unit } from '../../../../src/engine/state';

type Level = (typeof DIFFICULTIES)[number];
const four = (difficulty: Level, human: (typeof NATION_IDS)[number] = 'england'): GameState =>
  createGame({
    seed: 4, scenario: 'america', difficulty,
    players: NATION_IDS.map((nation) => ({ id: nation, name: nation, kind: nation === human ? 'human' as const : 'ai' as const, nation })),
  });
const fleet = (s: GameState, nation: string): Unit[] => Object.values(s.units).filter((u) => u.owner === nation);
const aboard = (s: GameState, nation: string, type: Unit['type']): Unit => fleet(s, nation).find((u) => u.type === type) as Unit;

describe('nations table', () => {
  it('matches the snapshot', () => {
    expect({ NATIONS, STARTING_FORCE }).toMatchSnapshot();
    expect(NATION_IDS).toEqual(['england', 'france', 'spain', 'netherlands']);
  });

  it('names home ports, colonial names, independent names and leaders as the rules file does', () => {
    expect(NATION_IDS.map((n) => NATIONS[n].homePort)).toEqual(['London', 'La Rochelle', 'Seville', 'Amsterdam']);
    expect(NATION_IDS.map((n) => NATIONS[n].colonyName)).toEqual(['New England', 'New France', 'New Spain', 'New Netherlands']);
    expect(NATION_IDS.map((n) => NATIONS[n].independentName)).toEqual(['United States of America', 'Republic of Quebec', 'Republic of Mexico', 'Republic of Surinam']);
    expect(NATION_IDS.map((n) => [NATIONS[n].leader, ...Object.values(NATIONS[n].leaderTraits)])).toEqual([
      ['Walter Raleigh', 1, -1, 0], ['Jacques Cartier', 0, 1, 0], ['Christopher Columbus', 1, 0, -1], ['Michiel De Ruyter', -1, 0, 1],
    ]);
    expect(new Set(NATION_IDS.map((n) => NATIONS[n].color)).size).toBe(4);
  });
});

describe('what each power lands with', () => {
  it('one ship carrying soldiers and pioneers with a hundred tools, on the sea lane', () => {
    const s = four('conquistador');
    for (const nation of NATION_IDS) {
      const units = fleet(s, nation);
      expect(units.map((u) => u.type).sort(), nation).toEqual([STARTING_FORCE.ship[nation], 'pioneer', 'soldier'].sort());
      const ship = aboard(s, nation, STARTING_FORCE.ship[nation]);
      expect(aboard(s, nation, 'soldier').aboard).toBe(ship.id);
      expect(aboard(s, nation, 'pioneer')).toMatchObject({ aboard: ship.id, tools: 100 });
      expect(ship.cargo).toEqual({});
    }
    expect(checkInvariants(s)).toEqual([]);
  });

  it('the Dutch come in a merchantman, the others in caravels', () => {
    const s = four('conquistador');
    expect(NATION_IDS.map((n) => fleet(s, n).find((u) => u.aboard === null)?.type)).toEqual(['caravel', 'caravel', 'caravel', 'merchantman']);
  });

  it('the French pioneer is a hardy one; Spain\'s soldier is always a veteran', () => {
    const s = four('viceroy');
    expect(NATION_IDS.map((n) => aboard(s, n, 'pioneer').profession)).toEqual(['freeColonist', 'hardyPioneer', 'freeColonist', 'freeColonist']);
    expect(NATION_IDS.map((n) => aboard(s, n, 'soldier').profession)).toEqual(['freeColonist', 'freeColonist', 'veteranSoldier', 'freeColonist']);
  });

  it('a human also gets a veteran soldier on the two easiest levels', () => {
    const veteran = (difficulty: Level, human: (typeof NATION_IDS)[number]): string | null => aboard(four(difficulty, human), human, 'soldier').profession;
    expect(DIFFICULTIES.map((d) => veteran(d, 'england'))).toEqual(['veteranSoldier', 'veteranSoldier', 'freeColonist', 'freeColonist', 'freeColonist']);
    expect(aboard(four('discoverer', 'england'), 'france', 'soldier').profession).toBe('freeColonist'); // not the computer powers
    expect(veteran('viceroy', 'spain')).toBe('veteranSoldier');
  });

  it('holds on a generated world too', () => {
    const s = createGame({ seed: 9, world: DEFAULT_WORLD, players: [{ id: 'd', name: 'D', kind: 'human', nation: 'netherlands' }] });
    expect(fleet(s, 'd').map((u) => u.type).sort()).toEqual(['merchantman', 'pioneer', 'soldier']);
  });
});
