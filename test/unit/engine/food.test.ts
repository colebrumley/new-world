import { describe, expect, it } from 'vitest';
import { firstTurnOfYear } from '../../../src/engine/calendar';
import { FOOD, HORSES } from '../../../src/engine/data/food';
import { colonyProduction, colonyTurn, type EconomyEvent } from '../../../src/engine/economy';
import { checkInvariants } from '../../../src/engine/invariants';
import type { Colonist, Colony, GameState, Goods } from '../../../src/engine/state';
import { withColony, withUnit, world } from '../../helpers/world';

// Colony on arctic ice (the square yields no food) with plains to the east and south.
const ROWS = ['~~~~~~', '~~~~~~', '~~a..~', '~~...~', '~~~~~~'];
const farmer = (id: string, dx: number, dy: number): Colonist => ({ id, profession: 'freeColonist', job: { kind: 'field', dx, dy, good: 'food' }, turns: 0 });
const idle = (id: string): Colonist => ({ id, profession: 'freeColonist', job: { kind: 'idle' }, turns: 0 });
const SPOTS: [number, number][] = [[1, 0], [0, 1], [1, 1]];
/** `farmers` on plains (5 food each) and `idlers` eating without producing. */
function town(farmers: number, idlers: number, goods: Goods = {}, extra: { buildings?: string[]; difficulty?: GameState['difficulty']; ai?: boolean; turn?: number; seed?: number } = {}): GameState {
  const colonists = [
    ...Array.from({ length: farmers }, (_, i) => farmer(`f${i}`, SPOTS[i]![0], SPOTS[i]![1])),
    ...Array.from({ length: idlers }, (_, i) => idle(`i${i}`)),
  ];
  const s = world({ rows: ROWS, difficulty: extra.difficulty ?? 'conquistador', seed: extra.seed ?? 1, players: [{ id: 'a', kind: extra.ai ? 'ai' : 'human' }, { id: 'b' }] });
  return withColony({ ...s, turn: extra.turn ?? 0 }, { id: 'col', x: 2, y: 2, colonists, goods, buildings: extra.buildings ?? [] });
}
const col = (s: GameState): Colony | undefined => s.colonies['col'];
const turn = (s: GameState): { state: GameState; events: EconomyEvent[] } => {
  const events: EconomyEvent[] = [];
  const state = colonyTurn(s, 'col', events);
  expect(checkInvariants(state)).toEqual([]);
  return { state, events };
};
const types = (events: EconomyEvent[]): string[] => events.map((e) => e.type);

describe('eating and saving', () => {
  it('each colonist eats 2; the rest of the harvest is stored', () => {
    expect({ FOOD, HORSES }).toMatchSnapshot();
    const r = colonyProduction(town(1, 0), col(town(1, 0))!);
    expect([r.produced.food, r.consumed.food, r.delta.food]).toEqual([5, 2, 3]);
    expect(col(turn(town(1, 0, { food: 10 })).state)?.goods.food).toBe(13);
    expect(col(turn(town(2, 1, { food: 10 })).state)?.goods.food).toBe(14); // 10 made, 6 eaten
  });

  it('food is not capped by the warehouse', () => {
    expect(col(turn(town(3, 0, { food: 150 })).state)?.goods.food).toBe(159);
  });
});

describe('growth', () => {
  it('at 200 food a free colonist appears outside the colony and 200 is used up', () => {
    const { state, events } = turn(town(3, 0, { food: 195 }));
    expect(col(state)?.goods.food).toBe(4); // 195 + 9 - 200
    expect(col(state)?.colonists).toHaveLength(3);
    const born = events.find((e) => e.type === 'colonistBorn');
    expect(born).toMatchObject({ colonyId: 'col', food: 200 });
    const unit = Object.values(state.units)[0];
    expect(unit).toMatchObject({ type: 'colonist', profession: 'freeColonist', x: 2, y: 2, owner: 'a', movesLeft: 0 });
    expect(state.nextId).toBe(2);
  });

  it('does not happen at 199, and only once a turn', () => {
    expect(types(turn(town(1, 0, { food: 196 })).events)).not.toContain('colonistBorn');
    const rich = turn(town(1, 0, { food: 450 }));
    expect(types(rich.events).filter((t) => t === 'colonistBorn')).toHaveLength(1);
    expect(col(rich.state)?.goods.food).toBe(253);
  });
});

describe('hunger', () => {
  it('warns when the store will run out within four turns', () => {
    // 1 farmer feeding 4: 5 made, 8 eaten, 3 short each turn
    const comfortable = turn(town(1, 3, { food: 30 }));
    expect(types(comfortable.events)).not.toContain('foodLow');
    const low = turn(town(1, 3, { food: 14 }));
    expect(low.events).toContainEqual({ type: 'foodLow', colonyId: 'col', turnsLeft: 3 }); // 11 left, under 12
    expect(col(low.state)?.goods.food).toBe(11);
  });

  it('when the store runs dry everyone goes hungry once before anyone dies', () => {
    const first = turn(town(1, 3, { food: 2 }));
    expect(types(first.events)).toContain('foodDepleted');
    expect(col(first.state)?.colonists).toHaveLength(4);
    expect(col(first.state)?.goods.food ?? 0).toBe(0);
    const second = turn(first.state);
    expect(types(second.events)).toContain('colonistStarved');
    expect(col(second.state)?.colonists).toHaveLength(3);
    // 1 farmer feeding 3 is still 1 short, with nothing stored: another dies
    const third = turn(second.state);
    expect(col(third.state)?.colonists).toHaveLength(2);
    // 5 food for 2 mouths (or 0 for 2 if the farmer was the one who died)
    expect(checkInvariants(third.state)).toEqual([]);
  });

  it('at most one colonist starves per turn, chosen by the dice', () => {
    const victims = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const r = turn(town(0, 4, {}, { seed }));
      const dead = r.events.filter((e) => e.type === 'colonistStarved');
      expect(dead).toHaveLength(1);
      victims.add((dead[0] as { colonistId: string }).colonistId);
      expect(r.state.rng).not.toEqual(town(0, 4, {}, { seed }).rng);
    }
    expect(victims.size).toBe(4);
  });

  it('the colony vanishes with its stores when its last colonist starves', () => {
    const { state, events } = turn(town(0, 1, { furs: 30 }));
    expect(col(state)).toBeUndefined();
    expect(events).toContainEqual({ type: 'colonistStarved', colonyId: 'col', colonistId: 'i0' });
    expect(events).toContainEqual({ type: 'colonyVanished', colonyId: 'col', name: 'col', lost: { furs: 30 } });
    expect(state.map.tiles[2 * 6 + 2]?.claim).toBeNull();
  });

  it('a ship in port when the colony starves out is not left standing on land', () => {
    const port = withUnit(town(0, 1), { id: 'ship', type: 'caravel', x: 2, y: 2, cargo: { furs: 20 } });
    const { state, events } = turn(port); // turn() checks the invariants
    expect(col(state)).toBeUndefined();
    expect(state.units['ship']).toMatchObject({ voyage: { phase: 'inEurope' }, cargo: {} });
    expect(state.units['ship']?.repair).toBeGreaterThan(0);
    expect(events).toContainEqual(expect.objectContaining({ type: 'shipDamaged', unitId: 'ship', to: 'europe', lost: { furs: 20 } }));
  });

  it('on Discoverer and Explorer nobody starves before 1520, and later only sometimes', () => {
    for (const difficulty of ['discoverer', 'explorer'] as const) {
      const early = turn(town(0, 3, {}, { difficulty, turn: firstTurnOfYear(1519) }));
      expect(types(early.events)).not.toContain('colonistStarved');
      let deaths = 0;
      for (let seed = 1; seed <= 300; seed++) {
        if (types(turn(town(0, 3, {}, { difficulty, turn: firstTurnOfYear(1520), seed })).events).includes('colonistStarved')) deaths++;
      }
      const odds = difficulty === 'discoverer' ? 3 : 2;
      expect(deaths).toBeGreaterThan(300 / odds - 40);
      expect(deaths).toBeLessThan(300 / odds + 40);
    }
    expect(types(turn(town(0, 3, {}, { difficulty: 'viceroy' })).events)).toContain('colonistStarved');
  });

  it('AI colonies ignore a shortfall under 3 and get a little free food on harder levels', () => {
    // 1 farmer feeding 3: 1 short. A human colony starves; an AI colony does not.
    expect(types(turn(town(1, 2, {})).events)).toContain('colonistStarved');
    expect(types(turn(town(1, 2, {}, { ai: true })).events)).not.toContain('colonistStarved');
    expect(types(turn(town(0, 2, {}, { ai: true })).events)).toContain('colonistStarved'); // 4 short
    expect(col(turn(town(1, 0, { food: 10 }, { ai: true, difficulty: 'viceroy' })).state)?.goods.food).toBe(15); // +2 free
    expect(col(turn(town(1, 0, { food: 10 }, { ai: true, difficulty: 'conquistador' })).state)?.goods.food).toBe(14);
    expect(col(turn(town(1, 0, { food: 10 }, { ai: true, difficulty: 'governor' })).state)?.goods.food).toBe(14);
    expect(col(turn(town(1, 0, { food: 10 }, { difficulty: 'viceroy' })).state)?.goods.food).toBe(13); // a human colony gets none
  });
});

describe('horses', () => {
  const horses = (s: GameState): number => col(turn(s).state)?.goods.horses ?? 0;

  it('need a pair and a food surplus; two per started fifty, each horse eating one food', () => {
    // 3 farmers: 15 food, 6 eaten, surplus 9
    expect(horses(town(3, 0, { horses: 1 }))).toBe(1);
    const pair = turn(town(3, 0, { horses: 2, food: 10 }));
    expect(col(pair.state)?.goods).toMatchObject({ horses: 4, food: 17 }); // 9 surplus less 2 for the new horses
    expect(horses(town(3, 0, { horses: 50 }))).toBe(52);
    expect(horses(town(3, 0, { horses: 51 }))).toBe(55);
    const r = colonyProduction(town(3, 0, { horses: 51 }), col(town(3, 0, { horses: 51 }))!);
    expect([r.potential.horses, r.produced.horses, r.consumed.food]).toEqual([4, 4, 10]);
  });

  it('are limited by half the surplus (rounded up), and get nothing from stored food', () => {
    // 1 farmer, 1 idler: 5 made, 4 eaten, surplus 1 -> one horse
    expect(horses(town(1, 1, { horses: 60, food: 150 }))).toBe(61);
    // no surplus at all: none, however full the larder
    expect(horses(town(1, 2, { horses: 60, food: 150 }))).toBe(60);
    // surplus 3 -> two horses
    expect(horses(town(1, 0, { horses: 99 }, { buildings: ['warehouse'] }))).toBe(101);
  });

  it('a Stable doubles the breeding rate', () => {
    expect(horses(town(3, 0, { horses: 50 }, { buildings: ['stable', 'warehouse'] }))).toBe(54);
    expect(horses(town(3, 0, { horses: 26 }, { buildings: ['stable'] }))).toBe(30);
    // for example: 60 horses with a Stable and surplus 3 can breed 6 but food allows 2
    expect(horses(town(1, 0, { horses: 60 }, { buildings: ['stable'] }))).toBe(62);
  });

  it('stop at the warehouse limit', () => {
    expect(horses(town(3, 0, { horses: 99 }))).toBe(100);
    expect(horses(town(3, 0, { horses: 100 }))).toBe(100);
    expect(horses(town(3, 0, { horses: 199 }, { buildings: ['warehouse'] }))).toBe(200);
  });
});
