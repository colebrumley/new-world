import { describe, expect, it } from 'vitest';
import { coloniesStillWanted, deliveryPort, joinTarget, mayFound, regionAppeal, wantsColonists, willingness } from '../../../src/ai/settle';
import { AI_SETTLE } from '../../../src/engine/data/ai';
import { landmassAt } from '../../../src/engine/regions';
import type { Colonist, Colony, GameState, Player, Unit } from '../../../src/engine/state';
import { policy } from '../../helpers/policy';
import { withColony, withUnit, world } from '../../helpers/world';

// a mainland (x 1..10, y 1..7: 70 squares) and an island (x 14..17: 28 squares)
const ROWS = Array.from({ length: 9 }, (_, y) => (y === 0 || y === 8 ? '~'.repeat(20) : `~${'.'.repeat(10)}~~~....~~`));
const people = (n: number, p: string, profession: Colonist['profession'] = 'freeColonist'): Colonist[] =>
  Array.from({ length: n }, (_, i) => ({ id: `${p}${i}`, profession, job: { kind: 'idle' as const }, turns: 0 }));
type Nation = 'england' | 'france' | 'spain' | 'netherlands';
const base = (nation: Nation = 'netherlands', turn = 20): GameState => ({ ...world({ rows: ROWS, players: [{ id: 'a', kind: 'ai', nation }, { id: 'b', kind: 'ai', nation: nation === 'spain' ? 'france' : 'spain' }] }), turn });
const me = (s: GameState): Player => s.players[0] as Player;
const u = (s: GameState, id: string): Unit => s.units[id] as Unit;
const c = (s: GameState, id: string): Colony => s.colonies[id] as Colony;
/** A colony with a stockade on the stocks (so that it has something to build). */
const col = (s: GameState, id: string, x: number, y: number, pop: number, extra: Partial<Parameters<typeof withColony>[1]> = {}): GameState =>
  withColony(s, { id, x, y, name: id, colonists: people(pop, `${id}-`), founded: 0, ...extra });

describe('founding and joining rule table', () => {
  it('matches the snapshot', () => {
    expect(AI_SETTLE).toMatchSnapshot();
  });
});

describe('a colony wants colonists', () => {
  it('under twelve people while its people less four are fewer than the squares it can work', () => {
    // inland: eight land squares
    const wants = (pop: number): boolean => { const s = col(base(), 'home', 5, 4, pop); return wantsColonists(s, c(s, 'home')); };
    expect([1, 8, 11].map(wants)).toEqual([true, true, true]);
    expect(wants(12)).toBe(false);
  });

  it('water counts only once it has docks', () => {
    // on the west shore: three of its eight squares are sea
    const shore = (pop: number, buildings: string[]): boolean => { const s = col(base(), 'home', 1, 4, pop, { buildings }); return wantsColonists(s, c(s, 'home')); };
    expect(shore(8, ['townHall'])).toBe(true); // 8 - 4 < 5
    expect(shore(10, ['townHall'])).toBe(false); // 10 - 4 is not under 5...
    expect(shore(10, ['townHall', 'docks'])).toBe(true); // ...but is under 8
  });
});

describe('colonies still wanted', () => {
  it('eight with no colony, or when none of its colonies wants colonists', () => {
    expect(coloniesStillWanted(base(), me(base()))).toBe(8);
    const full = col(base(), 'home', 5, 4, 12);
    expect(coloniesStillWanted(full, me(full))).toBe(8);
  });

  it('none once the world holds forty-eight', () => {
    let s = base();
    for (let i = 0; i < 48; i++) s = col(s, `c${i}`, 1 + (i % 10), 1 + Math.floor(i / 10), 1, { owner: 'b' });
    expect(coloniesStillWanted(s, me(s))).toBe(0);
  });

  it('otherwise by its spare people, its holds and its leader: nothing while its colonies are small', () => {
    // the Dutch (no bent), one colony of three, two colonists afield, a merchantman of four holds:
    // q = (5 - 1) / 4 = 1, half way to 2 holds = 2, less (7 - 3 + 1) x 1 = -3: none
    const dutch = (pop: number): GameState => {
      let s = col(base('netherlands'), 'home', 5, 4, pop);
      s = withUnit(withUnit(s, { id: 'u1', x: 6, y: 4 }), { id: 'u2', x: 6, y: 5 });
      return withUnit(s, { id: 'ship', type: 'merchantman', profession: null, x: 0, y: 4 });
    };
    expect(coloniesStillWanted(dutch(3), me(dutch(3)))).toBe(0);
    // at seven the average is no longer under 7: q = (9 - 1) / 4 = 2, half way to 2 = 2
    expect(coloniesStillWanted(dutch(7), me(dutch(7)))).toBe(2);
    // the French are content with colonies of four, the English hold out for ten
    const of = (nation: Nation, pop: number): number => {
      const s = withUnit(col(base(nation), 'home', 5, 4, pop), { id: 'ship', type: 'merchantman', profession: null, x: 0, y: 4 });
      return coloniesStillWanted(s, me(s));
    };
    expect(of('france', 3)).toBe(0);
    expect(of('france', 4)).toBeGreaterThan(0);
    expect(of('england', 9)).toBe(0);
    expect(of('england', 10)).toBeGreaterThan(0);
  });
});

describe('who founds', () => {
  it('the appeal of a landmass: room on it, +2 where no European has settled, +4 where the power has not', () => {
    const s = col(base(), 'home', 5, 4, 3);
    const main = landmassAt(s.map, 5, 4);
    const isle = landmassAt(s.map, 15, 4);
    expect(regionAppeal(s, me(s), main)).toBe(1); // 70 / 12 = 5 sites against one colony
    expect(regionAppeal(s, me(s), isle)).toBe(1 + 2 + 4);
    expect(regionAppeal(s, me(s), 0)).toBe(0);
    const theirs = col(s, 'theirs', 15, 4, 3, { owner: 'b' });
    expect(regionAppeal(theirs, me(theirs), isle)).toBe(1 + 4);
  });

  it('willingness is never above nothing: the distance to its nearest colony, what the unit is, and the turns since it last founded', () => {
    const s = withUnit(col(base(), 'home', 2, 4, 3), { id: 'x', x: 3, y: 4 });
    const will = (unit: Partial<Unit>): number => { const t = withUnit(s, { id: 'x', x: 3, y: 4, ...unit }); return willingness(t, me(t), u(t, 'x')); };
    expect(will({})).toBe(-1 - 2); // within four squares, a colonist
    expect(will({ profession: 'expertFarmer' })).toBe(-1 - 2 - 2);
    expect(will({ type: 'pioneer' })).toBe(0); // -1 + 2 would be above nothing
    expect(will({ type: 'soldier' })).toBe(-1 - 2);
    expect(will({ type: 'dragoon' })).toBe(-1 - 3);
    expect(will({ x: 9, y: 4 })).toBe(0 - 2); // seven squares off: 7 / 5 - 1 = 0
    // on land where it has no colony: +2
    expect(will({ x: 15, y: 4 })).toBe(0);
  });

  it('a colonist goes to found when willingness, appeal and the colonies wanted come to more than nothing', () => {
    const found = (s: GameState, id = 'x'): boolean => mayFound(s, me(s), u(s, id));
    // no colony yet: 8 colonies wanted outweigh everything
    expect(found(withUnit(base(), { id: 'x', x: 3, y: 4 }))).toBe(true);
    // beside its one small colony: -3 + 1 + 0
    const home = col(base(), 'home', 2, 4, 3);
    expect(found(withUnit(home, { id: 'x', x: 3, y: 4 }))).toBe(false);
    // on an island it has not settled: 0 + 7 + 0
    expect(found(withUnit(home, { id: 'x', x: 15, y: 4 }))).toBe(true);
    // when no colony of its wants colonists, it founds beside home too
    const full = col(base(), 'home', 2, 4, 12);
    expect(found(withUnit(full, { id: 'x', x: 3, y: 4 }))).toBe(true);
    // never a convert, never a veteran under arms, never after the Declaration
    expect(found(withUnit(full, { id: 'x', x: 3, y: 4, profession: 'indianConvert' }))).toBe(false);
    expect(found(withUnit(full, { id: 'x', x: 3, y: 4, type: 'soldier', profession: 'veteranSoldier' }))).toBe(false);
    expect(found(withUnit(full, { id: 'x', x: 3, y: 4, type: 'soldier' }))).toBe(true);
    expect(found({ ...withUnit(full, { id: 'x', x: 3, y: 4 }), crownPlayer: 'crown' })).toBe(false);
  });
});

describe('who joins which colony', () => {
  it('one on his landmass that wants colonists and has fewer than ten people and units; the lowest half-distance x room under eight', () => {
    let s = col(col(base(), 'near', 2, 4, 3), 'far', 9, 4, 7);
    s = col(s, 'isle', 15, 4, 1);
    const target = (x: number, y: number, state = s, profession: Unit['profession'] = 'freeColonist'): string | undefined => {
      const t = withUnit(state, { id: 'x', x, y, profession });
      return joinTarget(t, me(t), u(t, 'x'))?.id;
    };
    // from (6, 4): near is 4 off, 2 x (8 - 3) = 10; far is 3 off, 1 x (8 - 7) = 1
    expect(target(6, 4)).toBe('far');
    // from (4, 4): near 2 off, 1 x 5 = 5; far 5 off, 2 x 1 = 2
    expect(target(4, 4)).toBe('far');
    // right beside near: half of one is nothing
    expect(target(3, 4)).toBe('near');
    // a colony with ten people and units takes no more
    const crowded = withUnit(withUnit(withUnit(s, { id: 'g1', x: 9, y: 4 }), { id: 'g2', x: 9, y: 4 }), { id: 'g3', x: 9, y: 4 });
    expect(target(6, 4, crowded)).toBe('near');
    // one that does not want colonists takes only converts
    const grown = col(base(), 'home', 5, 4, 12);
    expect(target(6, 4, grown)).toBeUndefined();
  });

  it('a newcomer walks to the colony that wants him, and one whom none has room for goes to found', () => {
    const s = withUnit(col(col(base(), 'near', 2, 4, 3), 'far', 9, 4, 7), { id: 'x', x: 6, y: 4 });
    expect(policy(s)).toEqual({ type: 'goTo', unitId: 'x', x: 9, y: 4 });
    const at = withUnit(col(base(), 'near', 2, 4, 3), { id: 'x', x: 2, y: 4 });
    expect(policy(at)).toEqual({ type: 'joinColony', unitId: 'x' });
  });

  it('one whom no colony on his land has room for, standing in a colony, is made a pioneer to be shipped where there is room', () => {
    // the English want no new colony while theirs average under ten; the big one wants nobody, the one that does is over the water
    const s = withUnit(col(col(base('england'), 'home', 5, 4, 12), 'isle', 15, 4, 1), { id: 'x', x: 5, y: 4 });
    expect(coloniesStillWanted(s, me(s))).toBe(0);
    expect(mayFound(s, me(s), u(s, 'x'))).toBe(false);
    expect(policy(s)).toEqual({ type: 'equip', unitId: 'x', role: 'pioneer' });
  });

  it('a ship takes passengers who are to join to a small colony that wants colonists', () => {
    let s = col(col(base(), 'small', 1, 2, 2), 'large', 1, 6, 9);
    s = withUnit(s, { id: 'ship', type: 'caravel', profession: null, x: 0, y: 4 });
    const ports = [c(s, 'small'), c(s, 'large')];
    expect(deliveryPort(s, u(s, 'ship'), ports, () => 0)?.id).toBe('small');
    // (17 - 2)^2 x 4 against (17 - 9)^2 x 4: luck of 8 at most does not turn it
    expect(deliveryPort(s, u(s, 'ship'), ports, (colony) => (colony.id === 'large' ? 8 : 0))?.id).toBe('small');
    // never the port she lies in
    const inPort = withUnit(s, { id: 'ship', type: 'caravel', profession: null, x: 1, y: 2 });
    expect(deliveryPort(inPort, u(inPort, 'ship'), ports, () => 0)?.id).toBe('large');
  });
});
