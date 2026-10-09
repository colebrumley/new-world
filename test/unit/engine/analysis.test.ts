import { describe, expect, it } from 'vitest';
import { analyseAttack } from '../../../src/engine/analysis';
import { settlementPopulation } from '../../../src/engine/data/tribes';
import type { GameState, Settlement, Unit } from '../../../src/engine/state';
import { setTile, withColony, withUnit, world } from '../../helpers/world';

const ROWS = ['~~~~~~~~~~', '~........~', '~...h....~', '~........~', '~~~~~~~~~~'];
const base = (fathers: string[] = [], theirs: string[] = []): GameState =>
  world({ rows: ROWS, difficulty: 'viceroy', players: [{ id: 'a', fathers }, { id: 'b', kind: 'ai', fathers: theirs }] });
const me = (s: GameState, type: Unit['type'] = 'soldier', x = 3, y = 2): GameState => withUnit(s, { id: 'me', type, x, y, ...(type === 'soldier' ? {} : { profession: null }) });
const village = (tribe: Settlement['tribe'], x: number, y: number): Settlement => ({
  id: 'v', tribe, x, y, capital: false, population: settlementPopulation(tribe, false).start, growth: 0, taught: false, tributePaid: false,
  alarm: {}, mission: null, scouted: [], lastBought: null, lastSold: null, haggleMemory: null,
});
const look = (s: GameState, dx = 1, dy = 0): ReturnType<typeof analyseAttack> => analyseAttack(s, s.units['me']!, dx, dy);

describe('combat analysis', () => {
  it('sets out a land attack: names, table values, modifiers, strengths in points, and the chance', () => {
    const s = withUnit(me(base()), { id: 'foe', owner: 'b', type: 'soldier', x: 4, y: 2, orders: 'fortified' });
    expect(look(s)).toEqual({
      attacker: { name: 'Soldier', base: 2, strength: 3, lines: [{ label: 'Attack Bonus', percent: 50 }] },
      defender: { name: 'Soldier', base: 2, strength: 5, lines: [{ label: 'Terrain', percent: 100 }, { label: 'Fortified', percent: 50 }] },
      chance: 38,
      mayEvade: false,
    });
  });

  it('is nothing when there is nothing to attack', () => {
    expect(look(me(base()))).toBeNull();
    expect(look(withUnit(me(base()), { id: 'foe', owner: 'a', type: 'soldier', x: 4, y: 2 }))).toBeNull();
    expect(look(withUnit(me(base(), 'pioneer'), { id: 'foe', owner: 'b', type: 'soldier', x: 4, y: 2 }))).toBeNull();
  });

  it('names a native settlement and its stand-in defenders', () => {
    const s: GameState = { ...me(base()), settlements: { v: village('aztec', 4, 2) }, tribes: { aztec: { alarm: {}, goodwill: {}, met: [], muskets: 1, horses: 0, breeding: 0, silver: 0, peace: [], landSold: 0, grudge: [], joinedCrown: false, visited: {}, stock: {} } } };
    const a = look(s)!;
    expect(a.defender.name).toBe('Aztec City');
    expect(a.defender.base).toBe(2); // armed braves
    expect(a.defender.lines).toEqual([{ label: 'Settlement', percent: 100 }]);
    expect(a.defender.strength).toBe(4);
  });

  it('shows a colony\'s garrison, or its militia when there is none', () => {
    const town = withColony(me(base(), 'soldier', 5, 3), { id: 'col', owner: 'b', x: 6, y: 3, name: 'Quebec', buildings: ['stockade'] });
    const militia = look(town)!;
    expect(militia.defender).toMatchObject({ name: 'Quebec militia', base: 1, lines: [{ label: 'Stockade', percent: 100 }] });
    const garrisoned = look(withUnit(town, { id: 'g', owner: 'b', type: 'artillery', profession: null, x: 6, y: 3 }))!;
    expect(garrisoned.defender).toMatchObject({ name: 'Artillery', base: 5, strength: 10 });
    const revere = withColony(me(base([], ['paulRevere']), 'soldier', 5, 3), { id: 'col', owner: 'b', x: 6, y: 3, name: 'Quebec', goods: { muskets: 50 } });
    expect(look(revere)!.defender.base).toBe(2);
  });

  it('sets out a fight at sea, with Drake and the chance of the quarry running', () => {
    let s = base(['francisDrake']);
    for (let x = 1; x <= 8; x++) s = setTile(s, x, 1, { base: 'ocean' });
    s = withUnit(withUnit(s, { id: 'me', type: 'privateer', profession: null, x: 3, y: 1 }), { id: 'foe', owner: 'b', type: 'merchantman', profession: null, x: 4, y: 1, cargo: { furs: 200 } });
    expect(look(s, 1, 0)).toEqual({
      attacker: { name: 'Privateer', base: 8, strength: 18, lines: [{ label: 'Drake', percent: 50 }, { label: 'Attack Bonus', percent: 50 }] },
      defender: { name: 'Merchantman', base: 6, strength: 5.75, lines: [] },
      chance: 76,
      mayEvade: true,
    });
    const peer = withUnit(s, { id: 'foe', owner: 'b', type: 'privateer', profession: null, x: 4, y: 1 });
    expect(look(peer, 1, 0)!.mayEvade).toBe(false);
  });
});
