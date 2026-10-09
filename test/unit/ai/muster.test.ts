import { describe, expect, it } from 'vitest';
import { musterAction, musterOf, sendOut, takeIn } from '../../../src/ai/muster';
import { applyAction, type Action } from '../../../src/engine/actions';
import { AI_MUSTER } from '../../../src/engine/data/ai';
import { checkInvariants } from '../../../src/engine/invariants';
import { createRng, seedRng } from '../../../src/engine/rng';
import type { Colonist, Colony, GameState, Unit } from '../../../src/engine/state';
import { withColony, withUnit, world } from '../../helpers/world';

// a mainland (x 1..10, y 1..7: 70 squares) and an island (x 14..17: 28 squares)
const ROWS = Array.from({ length: 9 }, (_, y) => (y === 0 || y === 8 ? '~'.repeat(20) : `~${'.'.repeat(10)}~~~....~~`));
const man = (id: string, profession: Colonist['profession'] = 'freeColonist'): Colonist => ({ id, profession, job: { kind: 'idle' }, turns: 0 });
const people = (n: number): Colonist[] => Array.from({ length: n }, (_, i) => man(`p${i}`));
type Nation = 'england' | 'france' | 'spain' | 'netherlands';
const base = (nation: Nation = 'england', turn = 20): GameState => ({ ...world({ rows: ROWS, players: [{ id: 'a', kind: 'ai', nation }, { id: 'b', kind: 'ai', nation: 'france' }] }), turn });
const home = (s: GameState): Colony => s.colonies['home'] as Colony;
const town = (colonists: Colonist[], goods: Colony['goods'] = {}, nation: Nation = 'england'): GameState =>
  withColony(base(nation), { id: 'home', x: 5, y: 4, colonists, goods, construction: { kind: 'building', id: 'stockade' } });
const soldier = (s: GameState, id: string, x = 5, y = 4, extra: Partial<Parameters<typeof withUnit>[1]> = {}): GameState => withUnit(s, { id, type: 'soldier', x, y, ...extra });
const rng = () => createRng(seedRng(7));

describe('muster rule table', () => {
  it('matches the snapshot', () => {
    expect(AI_MUSTER).toMatchSnapshot();
  });
});

describe('how a colony stands for defenders', () => {
  it('what it wants first, and how much of that is not yet standing in it', () => {
    expect(musterOf(town(people(5)), home(town(people(5))))).toMatchObject({ wanted: 2, unmet: 2 });
    const one = soldier(town(people(5)), 'g'); // six people now: (6 - 1) / 2
    expect(musterOf(one, home(one))).toMatchObject({ wanted: 2, unmet: 1 });
  });

  it('beyond that: nothing on land with neither natives nor rivals that still has room', () => {
    const s = town(people(8));
    expect(musterOf(s, home(s)).extra).toBe(0);
  });

  it('beyond that, with a rival on the land: (3 x people / 2 - bent - turn / 128) / (bent + 5, one more while the first want is unmet)', () => {
    const rival = (nation: Nation, pop = 8): GameState => withColony(town(people(pop), {}, nation), { id: 'theirs', owner: 'b', x: 9, y: 6 });
    // the English (no bent either way): 12 / (5 + 1) = 2
    expect(musterOf(rival('england'), home(rival('england'))).extra).toBe(2);
    // the Dutch (civil): (12 - 1) / (1 + 5 + 1) = 1; the Spanish (warlike): (12 + 1) / (-1 + 5 + 1) = 2
    expect(musterOf(rival('netherlands'), home(rival('netherlands'))).extra).toBe(1);
    expect(musterOf(rival('spain'), home(rival('spain'))).extra).toBe(2);
    // troops beyond the first want are its surplus: short while that is under the extra it wants, over when well above
    const armed = (n: number): GameState => { let s = rival('england'); for (let i = 0; i < n; i++) s = soldier(s, `g${i}`); return s; };
    expect(musterOf(armed(0), home(armed(0)))).toMatchObject({ surplus: 0, short: true, over: false });
    // five soldiers among thirteen people: six wanted first, none over
    expect(musterOf(armed(5), home(armed(5)))).toMatchObject({ wanted: 6, unmet: 1, surplus: 0 });
  });

  it('troops within eight squares on its land belong to the colony nearest them', () => {
    let s = withColony(town(people(3)), { id: 'theirs', owner: 'b', x: 9, y: 6 });
    s = soldier(soldier(s, 'in'), 'out', 7, 4);
    // four people: one wanted, and he is there; the man outside is one over
    expect(musterOf(s, home(s))).toMatchObject({ wanted: 1, unmet: 0, surplus: 1 });
    const second = withColony(s, { id: 'other', x: 8, y: 4, colonists: [man('q')] });
    expect(musterOf(second, home(second)).surplus).toBe(0);
  });
});

describe('sending one colonist out armed', () => {
  const crew = [man('free'), man('servant', 'indenturedServant'), man('criminal', 'pettyCriminal'), man('farmer', 'expertFarmer'), man('convert', 'indianConvert')];
  const pick = (s: GameState): string | undefined => { const c = sendOut(s, home(s), false); return c ? `${c.colonist.id}:${c.role}${c.unlearn ? ':unlearn' : ''}` : undefined; };

  it('only with fifty muskets in store, and only while it is short of defenders', () => {
    expect(pick(town(crew))).toBeUndefined();
    expect(pick(town(crew, { muskets: 49 }))).toBeUndefined();
    expect(pick(town(crew, { muskets: 50 }))).toBe('criminal:soldier');
    // with the three defenders eight people call for standing in it, and nothing more wanted, nobody goes
    const guarded = soldier(soldier(soldier(town(crew, { muskets: 50 }), 'g1'), 'g2'), 'g3');
    expect(musterOf(guarded, home(guarded))).toMatchObject({ unmet: 0, short: false });
    expect(pick(guarded)).toBeUndefined();
  });

  it('criminals before servants before free colonists; a veteran before all; a man with a trade last and only while the first want is unmet', () => {
    expect(pick(town(crew.filter((c) => c.id !== 'criminal'), { muskets: 50 }))).toBe('servant:soldier');
    expect(pick(town([man('free'), man('farmer', 'expertFarmer'), man('convert', 'indianConvert')], { muskets: 50 }))).toBe('free:soldier');
    expect(pick(town([...crew, man('vet', 'veteranSoldier')], { muskets: 50 }))).toBe('vet:soldier');
    // only experts left: one gives up his trade
    expect(pick(town([man('farmer', 'expertFarmer'), man('fisher', 'expertFisherman'), man('smith', 'masterBlacksmith')], { muskets: 50 }))).toBe('smith:soldier:unlearn');
    // converts never
    expect(pick(town([man('c1', 'indianConvert'), man('c2', 'indianConvert'), man('c3', 'indianConvert')], { muskets: 50 }))).toBeUndefined();
    // never from a colony of one
    expect(pick(town([man('free')], { muskets: 50 }))).toBeUndefined();
  });

  it('he rides as a dragoon when the colony has fifty-two horses', () => {
    expect(pick(town(crew, { muskets: 50, horses: 51 }))).toBe('criminal:soldier');
    expect(pick(town(crew, { muskets: 50, horses: 52 }))).toBe('criminal:dragoon');
  });

  it('carried out as a human would: his trade given up, out of the gate, armed from the stores', () => {
    let s = town([man('farmer', 'expertFarmer'), man('fisher', 'expertFisherman'), man('smith', 'masterBlacksmith')], { muskets: 60 });
    const done = new Set<string>();
    const steps: Action['type'][] = [];
    for (let i = 0; i < 6; i++) {
      const action = musterAction(s, home(s), done, rng());
      if (!action) break;
      steps.push(action.type);
      s = applyAction(s, action).state;
      expect(checkInvariants(s)).toEqual([]);
    }
    expect(steps).toEqual(['clearSpecialty', 'leaveColony', 'equip']);
    expect(s.units['smith']).toMatchObject({ type: 'soldier', profession: 'freeColonist', x: 5, y: 4 });
    expect(home(s).goods.muskets).toBe(10);
    expect(home(s).colonists.map((c) => c.id)).toEqual(['farmer', 'fisher']);
    // one a turn
    expect(musterAction(s, home(s), done, rng())).toBeNull();
  });
});

describe('taking units back in', () => {
  const id = (u: Unit | null): string | undefined => u?.id;

  it('a plain colonist standing in a colony that wants colonists', () => {
    const s = withUnit(town(people(3)), { id: 'x', x: 5, y: 4 });
    expect(id(takeIn(s, home(s)))).toBe('x');
    // not by one that wants none
    const full = withUnit(town(people(12)), { id: 'x', x: 5, y: 4 });
    expect(takeIn(full, home(full))).toBeNull();
  });

  it('a soldier when it has more troops than it wants; a skilled one changes places with an unskilled man inside', () => {
    // a colony of one with two soldiers: three people, one wanted, one over and nothing more wanted
    const over = soldier(soldier(town(people(1)), 'g1'), 'g2');
    expect(musterOf(over, home(over)).over).toBe(true);
    expect(id(takeIn(over, home(over)))).toBe('g1');
    // only one for that reason in a turn
    expect(takeIn(over, home(over), true)).toBeNull();
    // five people, two wanted: its two soldiers stay
    const kept = soldier(soldier(town(people(3)), 'g1'), 'g2');
    expect(takeIn(kept, home(kept))).toBeNull();
    // but an expert under arms comes in while a free colonist works inside
    const expert = soldier(soldier(town(people(3)), 'g1'), 'g2', 5, 4, { profession: 'expertFarmer' });
    expect(id(takeIn(expert, home(expert)))).toBe('g2');
    const allSkilled = soldier(soldier(town([man('a1', 'expertFarmer'), man('a2', 'expertFarmer'), man('a3', 'expertFarmer')]), 'g1'), 'g2', 5, 4, { profession: 'expertFarmer' });
    expect(takeIn(allSkilled, home(allSkilled))).toBeNull();
  });

  it('a scout when the colony is short of horses, a pioneer when it has no tools', () => {
    const scout = withUnit(town(people(3), { horses: 60 }), { id: 'sc', type: 'scout', x: 5, y: 4 });
    expect(takeIn(scout, home(scout))).toBeNull();
    const lame = withUnit(town(people(3), { horses: 10 }), { id: 'sc', type: 'scout', x: 5, y: 4 });
    expect(id(takeIn(lame, home(lame)))).toBe('sc');
    const pioneer = withUnit(town(people(3)), { id: 'pi', type: 'pioneer', x: 5, y: 4 });
    expect(id(takeIn(pioneer, home(pioneer)))).toBe('pi');
    const tooled = withUnit(town(people(3), { tools: 20 }), { id: 'pi', type: 'pioneer', x: 5, y: 4 });
    expect(takeIn(tooled, home(tooled))).toBeNull();
  });
});
