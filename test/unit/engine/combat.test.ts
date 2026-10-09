import { describe, expect, it } from 'vitest';
import { combatOdds, earnsPromotion, fortLevel, pickDefender, promotedProfession, rollCombat, unitStrength, type Fighter } from '../../../src/engine/combat';
import { BRAVE_WITH_HORSES, BRAVE_WITH_MUSKETS, CAPTURED_WHEN_BEATEN, COMBAT, CONTINENTAL, DEMOTION, DESTROYED_WHEN_BEATEN, PROMOTION } from '../../../src/engine/data/combat';
import { settlementPopulation } from '../../../src/engine/data/tribes';
import type { DIFFICULTIES } from '../../../src/engine/data/yields';
import { createRng } from '../../../src/engine/rng';
import type { GameState, Settlement, Unit } from '../../../src/engine/state';
import { setTile, withColony, withUnit, world } from '../../helpers/world';

type Level = (typeof DIFFICULTIES)[number];
const ROWS = ['~~~~~~~~~~', '~........~', '~..fhm...~', '~...w....~', '~........~', '~~~~~~~~~~'];
// viceroy has no hidden nudge for humans, which keeps the visible arithmetic plain
const base = (difficulty: Level = 'viceroy', nation: 'england' | 'spain' = 'england'): GameState =>
  world({ rows: ROWS, difficulty, players: [{ id: 'a', nation }, { id: 'b', kind: 'ai' }] });
const f = (type: Unit['type'], extra: Partial<Fighter> = {}): Fighter => ({ type, profession: type === 'artillery' ? null : 'freeColonist', owner: 'a', orders: 'none', x: 1, y: 1, movesLeft: 3, ...extra });
const brave = (type: Unit['type'] = 'brave', extra: Partial<Fighter> = {}): Fighter => f(type, { owner: 'tribe:sioux', profession: null, ...extra });
const village = (tribe: Settlement['tribe'], x: number, y: number, capital = false): Settlement => ({
  id: 'v', tribe, x, y, capital, population: settlementPopulation(tribe, capital).start, growth: 0, taught: false, tributePaid: false,
  alarm: {}, mission: null, scouted: [], lastBought: null, lastSold: null, haggleMemory: null,
});
const withVillage = (s: GameState, v: Settlement): GameState => ({ ...s, settlements: { v } });

describe('combat tables', () => {
  it('match the snapshot', () => {
    expect({ COMBAT, DEMOTION, DESTROYED_WHEN_BEATEN, CAPTURED_WHEN_BEATEN, PROMOTION, CONTINENTAL, BRAVE_WITH_MUSKETS, BRAVE_WITH_HORSES }).toMatchSnapshot();
  });
});

describe('a unit\'s own strength', () => {
  it('is its table value in eighths, with half again for a veteran under arms', () => {
    expect(unitStrength(f('soldier'), 'attack')).toBe(16);
    expect(unitStrength(f('dragoon'), 'defense')).toBe(24);
    expect(unitStrength(f('artillery'), 'attack')).toBe(56);
    expect(unitStrength(f('artillery'), 'defense')).toBe(40);
    expect(unitStrength(f('damagedArtillery'), 'attack')).toBe(40);
    expect(unitStrength(f('colonist'), 'attack')).toBe(0);
    expect(unitStrength(f('soldier', { profession: 'veteranSoldier' }), 'attack')).toBe(24);
    expect(unitStrength(f('dragoon', { profession: 'veteranSoldier' }), 'defense')).toBe(36);
    expect(unitStrength(f('colonist', { profession: 'veteranSoldier' }), 'defense')).toBe(8);
    expect(unitStrength(f('scout', { profession: 'veteranSoldier' }), 'attack')).toBe(8);
  });
});

describe('attack and defence', () => {
  it('every attacker has half again; a soldier against a soldier in the open is 24 to 16', () => {
    const odds = combatOdds(base(), f('soldier'), f('soldier', { owner: 'b', x: 2, y: 1 }));
    expect([odds.attack, odds.defense]).toEqual([24, 16]);
    expect(odds.attackLines).toEqual([{ label: 'Attack Bonus', percent: 50 }]);
  });

  it('the defender has the ground: forest +50%, hills +100%, mountains +150%, swamp +25%', () => {
    const at = (x: number, y: number): number => combatOdds(base(), f('soldier'), f('soldier', { owner: 'b', x, y })).defense;
    expect(at(3, 2)).toBe(24);
    expect(at(4, 2)).toBe(32);
    expect(at(5, 2)).toBe(40);
    expect(at(4, 3)).toBe(20);
  });

  it('fortified adds +50% to the ground, but nothing where the ground already gives +150%', () => {
    const at = (x: number, y: number, orders: Unit['orders']): number => combatOdds(base(), f('soldier'), f('soldier', { owner: 'b', x, y, orders })).defense;
    expect(at(2, 1, 'fortified')).toBe(24);
    expect(at(2, 1, 'fortify')).toBe(16); // not yet dug in
    expect(at(4, 2, 'fortified')).toBe(40);
    expect(at(5, 2, 'fortified')).toBe(40);
  });

  it('a colony gives +50%, and a stockade, fort and fortress +100%, +150%, +200%', () => {
    const at = (buildings: string[], orders: Unit['orders'] = 'none'): number => {
      const s = withColony(base(), { id: 'col', owner: 'b', x: 6, y: 3, name: 'C', buildings });
      return combatOdds(s, f('soldier'), f('soldier', { owner: 'b', x: 6, y: 3, orders })).defense;
    };
    expect([at([]), at(['stockade']), at(['stockade', 'fort']), at(['stockade', 'fort', 'fortress'])]).toEqual([24, 32, 40, 48]);
    expect(at([], 'fortified')).toBe(32);
    expect(at(['stockade', 'fort'], 'fortified')).toBe(40);
    expect(fortLevel(withColony(base(), { id: 'col', x: 6, y: 3, name: 'C', buildings: ['stockade', 'fort'] }), 6, 3)).toBe(2);
    expect(fortLevel(base(), 6, 3)).toBe(0);
  });

  it('a native settlement gives +50%, a city +100%, and a capital twice as much', () => {
    const at = (tribe: Settlement['tribe'], capital = false): number =>
      combatOdds(withVillage(base(), village(tribe, 6, 3, capital)), f('soldier'), brave('brave', { x: 6, y: 3, owner: `tribe:${tribe}` })).defense;
    // a brave's 8, raised by the place, then halved because a soldier is a real fighting unit and a brave hardly armed
    expect([at('sioux'), at('cherokee'), at('aztec'), at('inca', true), at('sioux', true)]).toEqual([6, 6, 8, 12, 8]);
    const armed = (tribe: Settlement['tribe']): number => combatOdds(withVillage(base(), village(tribe, 6, 3)), f('soldier'), brave('armedBrave', { x: 6, y: 3 })).defense;
    expect([armed('sioux'), armed('aztec')]).toEqual([24, 32]);
  });

  it('natives falling on a unit in the open have the ground themselves, unless it is fortified', () => {
    const odds = combatOdds(base(), brave('brave', { x: 3, y: 1 }), f('soldier', { x: 4, y: 2 }));
    // brave 8, ambush in hills +100% = 16, attack bonus = 24; the soldier gets no ground
    expect([odds.attack, odds.defense]).toEqual([24, 16]);
    expect(odds.attackLines.map((l) => l.label)).toEqual(['Ambush', 'Attack Bonus']);
    const dug = combatOdds(base(), brave('brave', { x: 3, y: 1 }), f('soldier', { x: 4, y: 2, orders: 'fortified' }));
    expect([dug.attack, dug.defense]).toEqual([12, 24]);
    // the other way round the brave has the hills
    expect(combatOdds(base(), f('soldier', { x: 3, y: 1 }), brave('armedBrave', { x: 4, y: 2 })).defense).toBe(32);
  });

  it('a tired attacker fights at a third for each third of a move left', () => {
    const attack = (movesLeft: number): number => combatOdds(base(), f('soldier', { movesLeft }), f('soldier', { owner: 'b', x: 2, y: 1 })).attack;
    expect([attack(3), attack(2), attack(1), attack(0)]).toEqual([24, 16, 8, 0]);
    expect(combatOdds(base(), f('dragoon', { movesLeft: 12 }), f('soldier', { owner: 'b', x: 2, y: 1 })).attack).toBe(36);
  });

  it('a fighting unit halves the defence of one that is hardly armed', () => {
    expect(combatOdds(base(), f('soldier'), f('colonist', { owner: 'b', x: 2, y: 1 })).defense).toBe(4);
    expect(combatOdds(base(), f('scout'), f('colonist', { owner: 'b', x: 2, y: 1 })).defense).toBe(8);
    expect(combatOdds(base(), f('soldier'), brave('brave', { x: 2, y: 1 })).defense).toBe(4);
  });

  it('artillery in the open fights at a quarter, attacking or defending, unless the defender is dug in', () => {
    const gun = combatOdds(base(), f('artillery'), f('soldier', { owner: 'b', x: 2, y: 1 }));
    expect(gun.attack).toBe(Math.trunc(84 / 4));
    expect(combatOdds(base(), f('artillery'), f('soldier', { owner: 'b', x: 2, y: 1, orders: 'fortified' })).attack).toBe(84);
    expect(combatOdds(base(), f('soldier'), f('artillery', { owner: 'b', x: 2, y: 1 })).defense).toBe(10);
    expect(combatOdds(base(), f('soldier'), f('artillery', { owner: 'b', x: 2, y: 1, orders: 'fortify' })).defense).toBe(40);
    const s = withColony(base(), { id: 'col', owner: 'a', x: 6, y: 3, name: 'C' });
    expect(combatOdds(s, f('soldier', { owner: 'b' }), f('artillery', { x: 6, y: 3 })).defense).toBe(60);
    // against a raid it is worth double
    expect(combatOdds(s, brave(), f('artillery', { x: 6, y: 3 })).defense).toBe(120);
  });

  it('Spain has half again against settlements, not against braves in the open', () => {
    const spain = withVillage(base('viceroy', 'spain'), village('sioux', 6, 3));
    expect(combatOdds(spain, f('soldier'), brave('brave', { x: 6, y: 3 })).attack).toBe(36);
    expect(combatOdds(spain, f('soldier'), brave('brave', { x: 2, y: 1 })).attack).toBe(24);
    expect(combatOdds(withVillage(base(), village('sioux', 6, 3)), f('soldier'), brave('brave', { x: 6, y: 3 })).attack).toBe(24);
  });

  it('a human side gets a small hidden edge on the easier levels', () => {
    const odds = combatOdds(base('discoverer'), f('soldier'), f('soldier', { owner: 'b', x: 2, y: 1 }));
    expect([odds.attack, odds.defense]).toEqual([28, 16]);
    const other = combatOdds(base('discoverer'), f('soldier', { owner: 'b' }), f('soldier', { x: 2, y: 1 }));
    expect([other.attack, other.defense]).toEqual([24, 20]);
  });

  it('when it is for real the easiest level doubles a human\'s attack and shields its colonies', () => {
    expect(combatOdds(base('discoverer'), f('soldier'), f('soldier', { owner: 'b', x: 2, y: 1 }), true).attack).toBe(56);
    let s = withColony(base('discoverer'), { id: 'col', owner: 'a', x: 6, y: 3, name: 'C' });
    s = withColony(s, { id: 'col2', owner: 'a', x: 8, y: 1, name: 'D' });
    // early raid on an undefended colony: no chance at all
    expect(combatOdds(s, brave(), f('colonist', { x: 6, y: 3 }), true, true).attack).toBe(0);
    expect(combatOdds({ ...s, turn: 100 }, brave(), f('colonist', { x: 6, y: 3 }), true, true).attack).toBe(12);
    // a power's last colony never falls to natives
    const last = withColony(base(), { id: 'col', owner: 'a', x: 6, y: 3, name: 'C' });
    expect(combatOdds(last, brave(), f('colonist', { x: 6, y: 3 }), true, true).attack).toBe(0);
    expect(combatOdds(last, brave(), f('colonist', { x: 6, y: 3 }), false, true).attack).toBe(12);
  });
});

describe('one throw decides', () => {
  it('the attacker wins in proportion to its share of the two strengths', () => {
    const s = base();
    const a = f('soldier');
    const d = f('soldier', { owner: 'b', x: 2, y: 1 });
    const odds = combatOdds(s, a, d);
    const rng = createRng(4);
    let wins = 0;
    for (let i = 0; i < 4000; i++) if (rollCombat(s, a, d, odds, rng)) wins++;
    expect(wins / 4000).toBeCloseTo(24 / 40, 1);
    expect(rollCombat(s, a, d, { ...odds, attack: 0 }, rng)).toBe(false);
    expect(rollCombat(s, a, d, { ...odds, attack: 0, defense: 0 }, rng)).toBe(false);
  });

  it('plain braves never beat a human\'s artillery', () => {
    const s = base();
    const gun = f('artillery', { x: 2, y: 1 });
    const rng = createRng(1);
    for (let i = 0; i < 200; i++) expect(rollCombat(s, brave(), gun, { attack: 1000, defense: 1, attackLines: [], defenseLines: [] }, rng)).toBe(false);
    expect(rollCombat(s, brave('armedBrave'), gun, { attack: 1000, defense: 0, attackLines: [], defenseLines: [] }, rng)).toBe(true);
  });
});

describe('who defends a stack', () => {
  it('the best defender stands forward; among equals the weaker in itself', () => {
    let s = withUnit(base(), { id: 'col', owner: 'b', x: 2, y: 1 });
    s = withUnit(s, { id: 'sol', owner: 'b', type: 'soldier', x: 2, y: 1 });
    s = withUnit(s, { id: 'vet', owner: 'b', type: 'soldier', profession: 'veteranSoldier', x: 2, y: 1 });
    expect(pickDefender(s, 2, 1, f('soldier'))?.id).toBe('vet');
    expect(pickDefender(s, 3, 1, f('soldier'))).toBeNull();
    expect(pickDefender(s, 2, 1, f('soldier', { owner: 'b' }))).toBeNull();
  });

  it('unready artillery in the open hides behind the infantry; in a colony only the armed are considered', () => {
    let s = withUnit(base(), { id: 'gun', owner: 'b', type: 'artillery', profession: null, x: 2, y: 1 });
    s = withUnit(s, { id: 'sol', owner: 'b', type: 'soldier', x: 2, y: 1 });
    expect(pickDefender(s, 2, 1, f('soldier'))?.id).toBe('sol');
    let town = withColony(base(), { id: 'c', owner: 'b', x: 6, y: 3, name: 'C' });
    town = withUnit(town, { id: 'idle', owner: 'b', x: 6, y: 3 });
    expect(pickDefender(town, 6, 3, f('soldier'))).toBeNull();
    town = withUnit(town, { id: 'scout', owner: 'b', type: 'scout', x: 6, y: 3 });
    expect(pickDefender(town, 6, 3, f('soldier'))?.id).toBe('scout');
    expect(setTile(town, 1, 1, {}).units['scout']).toBeDefined();
  });
});

describe('promotion', () => {
  it('goes criminal to servant to free colonist to veteran, and no further', () => {
    expect(promotedProfession('pettyCriminal')).toBe('indenturedServant');
    expect(promotedProfession('indenturedServant')).toBe('freeColonist');
    expect(promotedProfession('freeColonist')).toBe('veteranSoldier');
    expect(promotedProfession('veteranSoldier')).toBe('veteranSoldier');
    expect(promotedProfession('expertFarmer')).toBe('expertFarmer');
  });

  it('comes to a winning soldier or dragoon with chance loser / (winner + loser +/- level)', () => {
    const rate = (who: Fighter, s: GameState, w = 24, l = 16): number => {
      const rng = createRng(11);
      let n = 0;
      for (let i = 0; i < 4000; i++) if (earnsPromotion(s, who, w, l, rng)) n++;
      return n / 4000;
    };
    expect(rate(f('soldier'), base('viceroy'))).toBeCloseTo(16 / 44, 1);
    expect(rate(f('soldier'), base('discoverer'))).toBeCloseTo(16 / 40, 1);
    expect(rate(f('soldier', { owner: 'b' }), base('viceroy'))).toBeCloseTo(16 / 36, 1);
    expect(rate(f('soldier', { profession: 'pettyCriminal' }), base('viceroy'))).toBeCloseTo(16 / 34, 1);
    expect(rate(f('soldier', { profession: 'indenturedServant' }), base('viceroy'))).toBeCloseTo(16 / 39, 1);
    expect(rate(f('soldier', { profession: 'veteranSoldier' }), base())).toBe(0);
    expect(rate(f('soldier', { profession: 'expertFarmer' }), base())).toBe(0);
    expect(rate(f('artillery'), base())).toBe(0);
    expect(rate(f('scout'), base())).toBe(0);
    const washington = world({ rows: ROWS, players: [{ id: 'a', fathers: ['georgeWashington'] }, { id: 'b' }] });
    expect(rate(f('dragoon'), washington)).toBe(1);
  });
});

describe('once independence is declared', () => {
  const war = (sol: [number, number], difficulty: Level = 'viceroy'): GameState => {
    const s = world({ rows: ROWS, difficulty, players: [{ id: 'a', atWar: true }, { id: 'crown', kind: 'ai' }] });
    const town = withColony(s, { id: 'col', owner: 'a', x: 6, y: 3, name: 'C', sol: { n: sol[0], d: sol[1] } });
    return { ...town, crownPlayer: 'crown' };
  };
  const regular = (extra: Partial<Fighter> = {}): Fighter => f('regular', { owner: 'crown', profession: null, ...extra });

  it('the Crown bombards colonies at half again, and gains by the Tories in them', () => {
    // regulars 5: 40, attack bonus 60, bombard 90, then + 75% for a colony that is one quarter rebel
    const odds = combatOdds(war([1, 4]), regular(), f('soldier', { x: 6, y: 3 }));
    expect(odds.attack).toBe(90 + Math.trunc((90 * 75) / 100));
    expect(odds.attackLines.map((l) => [l.label, l.percent])).toEqual([['Attack Bonus', 50], ['Bombard', 50], ['Tory Unrest', 75]]);
    expect(combatOdds(war([4, 4]), regular(), f('soldier', { x: 6, y: 3 })).attack).toBe(90);
  });

  it('rebels retaking a colony gain by its Sons of Liberty instead', () => {
    const s = war([3, 4]);
    const held = { ...s, colonies: { col: { ...s.colonies['col']!, owner: 'crown' } } };
    const odds = combatOdds(held, f('soldier'), regular({ x: 6, y: 3 }));
    // 16 x 1.5 = 24, + 75%
    expect(odds.attack).toBe(42);
    expect(odds.attackLines.at(-1)).toEqual({ label: 'Rebel Unrest', percent: 75 });
  });

  it('in the open the Crown fights 5% better per difficulty level, and the rebels ambush from the countryside', () => {
    expect(combatOdds(war([0, 4], 'viceroy'), regular(), f('soldier', { x: 2, y: 1 })).attack).toBe(60 + 12);
    expect(combatOdds(war([0, 4], 'discoverer'), regular(), f('soldier', { x: 2, y: 1 })).attack).toBe(60);
    // a rebel soldier attacking regulars who stand in the hills takes the hills for himself
    const ambush = combatOdds(war([0, 4]), f('soldier', { x: 3, y: 1 }), regular({ x: 4, y: 2 }));
    expect([ambush.attack, ambush.defense]).toEqual([48, 40]);
    // before the Declaration the defender would have had them
    const before = world({ rows: ROWS, difficulty: 'viceroy', players: [{ id: 'a' }, { id: 'crown', kind: 'ai' }] });
    expect(combatOdds(before, f('soldier', { x: 3, y: 1 }), regular({ x: 4, y: 2 })).defense).toBe(80);
  });

  it('a rebel veteran who wins may join the Continental line', () => {
    const s = war([0, 4]);
    const rng = createRng(3);
    let n = 0;
    for (let i = 0; i < 2000; i++) if (earnsPromotion(s, f('soldier', { profession: 'veteranSoldier' }), 24, 16, rng)) n++;
    expect(n / 2000).toBeCloseTo(16 / 44, 1);
    expect(earnsPromotion(s, f('soldier', { profession: 'veteranSoldier', owner: 'crown' }), 24, 16, rng)).toBe(false);
  });
});

