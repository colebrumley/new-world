import { describe, expect, it } from 'vitest';
import { applyAction, validateAction, type Action } from '../../../src/engine/actions';
import { IMMIGRATION, SKILLED_IMMIGRANTS, STARTING_POOL } from '../../../src/engine/data/immigration';
import { PROFESSIONS, type ProfessionId } from '../../../src/engine/data/professions';
import { DIFFICULTIES } from '../../../src/engine/data/yields';
import { docksOf } from '../../../src/engine/europe';
import { createGame } from '../../../src/engine/game';
import { brewsterPool, crossesNeeded, drawImmigrant, headcount, immigrantUnit, immigrationTurn, recruitPrice, startingPool, type ImmigrationEvent } from '../../../src/engine/immigration';
import { checkInvariants } from '../../../src/engine/invariants';
import { createRng } from '../../../src/engine/rng';
import type { GameState, Player, Unit } from '../../../src/engine/state';
import { withColony, withUnit, world } from '../../helpers/world';

const ROWS = ['~~~~~~~sss', '~~..~~~sss', '~~..~~~sss', '~~~~~~~sss'];
const human = { kind: 'human', fathers: [] } as const;
const brewster = { kind: 'human', fathers: ['williamBrewster'] } as const;
const ai = { kind: 'ai', fathers: [] } as const;
const EMPTY: ProfessionId[] = [];

function tally(draw: (i: number) => ProfessionId, n = 6000): Record<string, number> {
  const seen: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    const p = draw(i);
    seen[p] = (seen[p] ?? 0) + 1;
  }
  return seen;
}
const patch = (s: GameState, id: string, change: Partial<Player>): GameState => ({ ...s, players: s.players.map((p) => (p.id === id ? { ...p, ...change } : p)) });
const code = (s: GameState, a: Action): string => {
  const v = validateAction(s, a);
  return v.ok ? 'ok' : v.error.code;
};

describe('immigration tables', () => {
  it('match the snapshot', () => {
    expect(IMMIGRATION).toMatchSnapshot();
    expect(SKILLED_IMMIGRANTS).toMatchSnapshot();
    expect(STARTING_POOL).toMatchSnapshot();
    expect(Object.values(SKILLED_IMMIGRANTS).reduce((a, b) => a + b, 0)).toBe(25);
  });
});

describe('drawing a pool member', () => {
  it('a forced skilled draw gives only the eighteen skilled callings, the carpenter most often', () => {
    const rng = createRng(5);
    const seen = tally(() => drawImmigrant(rng, human, 'conquistador', EMPTY, true));
    expect(Object.keys(seen).sort()).toEqual(Object.keys(SKILLED_IMMIGRANTS).sort());
    expect(seen['masterCarpenter']! / 6000).toBeCloseTo(3 / 25, 1);
    expect(seen['expertFarmer']! / 6000).toBeCloseTo(2 / 25, 1);
    expect(seen['jesuitMissionary']! / 6000).toBeCloseTo(1 / 25, 1);
  });

  it('the unskilled come more often on the harder levels', () => {
    const share = (difficulty: (typeof DIFFICULTIES)[number], who = human as { kind: 'human' | 'ai'; fathers: readonly never[] }): number[] => {
      const rng = createRng(9);
      const seen = tally(() => drawImmigrant(rng, who, difficulty, EMPTY, false), 12000);
      return ['pettyCriminal', 'indenturedServant', 'freeColonist'].map((p) => (seen[p] ?? 0) / 12000);
    };
    const easy = share('discoverer');
    expect(easy[0]).toBeCloseTo(1 / 15, 1);
    expect(easy[1]).toBeCloseTo((14 / 15) * (1 / 10), 1);
    expect(easy[2]).toBeCloseTo((14 / 15) * (9 / 10) * (1 / 8), 1);
    const hard = share('viceroy');
    expect(hard[0]).toBeCloseTo(3 / 15, 1);
    expect(hard[1]).toBeCloseTo((12 / 15) * (3 / 10), 1);
    expect(hard[2]).toBeCloseTo((12 / 15) * (7 / 10) * (3 / 8), 1);
    // a computer power always draws as on the second level
    expect(share('viceroy', ai)[0]).toBeCloseTo(2 / 15, 1);
  });

  it('never repeats a skilled calling already waiting, and an all-skilled pool gets a free colonist', () => {
    const rng = createRng(3);
    const seen = tally(() => drawImmigrant(rng, human, 'discoverer', ['masterCarpenter', 'freeColonist', 'expertFarmer'], true), 2000);
    expect(seen['masterCarpenter']).toBeUndefined();
    expect(seen['expertFarmer']).toBeUndefined();
    expect(drawImmigrant(rng, human, 'discoverer', ['masterCarpenter', 'seasonedScout', 'expertFarmer'], true)).toBe('freeColonist');
  });

  it('with Brewster, criminals and servants come as free colonists', () => {
    const rng = createRng(4);
    const seen = tally(() => drawImmigrant(rng, brewster, 'viceroy', EMPTY, false));
    expect(seen['pettyCriminal']).toBeUndefined();
    expect(seen['indenturedServant']).toBeUndefined();
    expect(seen['freeColonist']! / 6000).toBeGreaterThan(0.5);
  });
});

describe('the first pool', () => {
  const pool = (difficulty: (typeof DIFFICULTIES)[number], nation: 'england' | 'spain' = 'england', kind: 'human' | 'ai' = 'human', seed = 1): ProfessionId[] =>
    startingPool(createRng(seed), { kind, fathers: [], nation }, difficulty);

  it('is fixed on the easiest level and opens with a servant, or a criminal on the hardest', () => {
    expect(pool('discoverer')).toEqual(['masterCarpenter', 'expertFarmer', 'seasonedScout']);
    expect(pool('explorer')).toEqual(['indenturedServant', 'expertFarmer', 'seasonedScout']);
    for (let seed = 0; seed < 40; seed++) {
      const mid = pool('conquistador', 'england', 'human', seed);
      expect(mid[0]).toBe('indenturedServant');
      expect(Object.keys(SKILLED_IMMIGRANTS)).toContain(mid[1]);
      expect(Object.keys(SKILLED_IMMIGRANTS)).toContain(mid[2]);
      expect(mid[1]).not.toBe(mid[2]);
      const hard = pool('viceroy', 'england', 'human', seed);
      expect(hard[0]).toBe('pettyCriminal');
      expect(Object.keys(SKILLED_IMMIGRANTS)).toContain(hard[2]);
      expect(pool('viceroy', 'england', 'ai', seed)[0]).toBe('pettyCriminal');
      expect(pool('discoverer', 'england', 'ai', seed)[0]).toBe('indenturedServant');
    }
  });

  it('Spain always starts with a Jesuit first in line', () => {
    expect(pool('discoverer', 'spain')).toEqual(['jesuitMissionary', 'expertFarmer', 'seasonedScout']);
    expect(pool('viceroy', 'spain', 'ai')[0]).toBe('jesuitMissionary');
  });

  it('is dealt to every power in a new game', () => {
    const g = createGame({ seed: 3, players: [{ id: 'h', name: 'H', kind: 'human' }, { id: 'c', name: 'C', kind: 'ai', nation: 'spain' }] });
    expect(g.players.map((p) => p.pool.length)).toEqual([3, 3]);
    expect(g.players[1]?.pool[0]).toBe('jesuitMissionary');
    expect(g.players[0]).toMatchObject({ recruits: 0, hadImmigrant: false, immigrantDue: false });
  });
});

describe('stepping ashore', () => {
  it('the field experts come fitted out; a veteran soldier is sometimes mounted', () => {
    const rng = createRng(2);
    expect(immigrantUnit(rng, human, 'viceroy', 'hardyPioneer')).toEqual({ type: 'pioneer', tools: 100 });
    expect(immigrantUnit(rng, human, 'viceroy', 'jesuitMissionary')).toEqual({ type: 'missionary', tools: 0 });
    expect(immigrantUnit(rng, human, 'viceroy', 'seasonedScout')).toEqual({ type: 'scout', tools: 0 });
    expect(immigrantUnit(rng, human, 'viceroy', 'masterWeaver')).toEqual({ type: 'colonist', tools: 0 });
    expect(immigrantUnit(rng, human, 'viceroy', 'pettyCriminal')).toEqual({ type: 'colonist', tools: 0 });
    let mounted = 0;
    for (let i = 0; i < 6000; i++) if (immigrantUnit(rng, human, 'discoverer', 'veteranSoldier').type === 'dragoon') mounted++;
    expect(mounted / 6000).toBeCloseTo(1 / 5, 1);
    mounted = 0;
    for (let i = 0; i < 6000; i++) if (immigrantUnit(rng, human, 'viceroy', 'veteranSoldier').type === 'dragoon') mounted++;
    expect(mounted / 6000).toBeCloseTo(1 / 9, 1);
  });
});

describe('recruiting', () => {
  const base = (difficulty: (typeof DIFFICULTIES)[number] = 'discoverer', gold = 5000): GameState =>
    patch(world({ rows: ROWS, players: [{ id: 'a', nation: 'france' }, { id: 'b' }], difficulty }), 'a', { gold });

  it('counts heads: colonists in colonies and every unit', () => {
    let s = withColony(base(), { id: 'col', x: 2, y: 1, name: 'P' });
    s = withUnit(withUnit(s, { id: 'u1', x: 3, y: 2 }), { id: 'ship', type: 'caravel', x: 0, y: 0 });
    s = withUnit(s, { id: 'other', owner: 'b', x: 3, y: 1 });
    expect(headcount(s, 'a')).toBe(3);
    expect(crossesNeeded(s, 'a')).toBe(14);
  });

  it('prices passage at 20 x (paid recruits + level + 7), sliding to the floor as crosses build', () => {
    expect(DIFFICULTIES.map((d) => recruitPrice(base(d), 'a'))).toEqual([140, 160, 180, 200, 220]);
    expect(recruitPrice(patch(base(), 'a', { recruits: 3 }), 'a')).toBe(200);
    // nobody about: 8 crosses needed, so each cross takes (140 - 100) / 9 off, rounded down
    expect(recruitPrice(patch(base(), 'a', { crosses: 4 }), 'a')).toBe(140 - Math.trunc((40 * 4) / 9));
    expect(recruitPrice(patch(base(), 'a', { crosses: 8 }), 'a')).toBe(140 - 35);
    expect(recruitPrice(patch(base(), 'a', { crosses: 1000 }), 'a')).toBe(10);
    // far along, the floor is a fifth of the starting price rather than 100
    expect(recruitPrice(patch(base(), 'a', { recruits: 40, crosses: 9 }), 'a')).toBe(940 - (940 - 188));
    expect(recruitPrice(patch(base(), 'a', { recruits: 500 }), 'a')).toBe(20 * 187);
  });

  it('brings the chosen one to the docks, refills the slot, resets crosses and raises the price', () => {
    const s = patch(base(), 'a', { crosses: 5 });
    const price = recruitPrice(s, 'a');
    const r = applyAction(s, { type: 'recruit', slot: 2 });
    const player = r.state.players[0] as Player;
    const arrived = docksOf(r.state, 'a');
    expect(arrived).toHaveLength(1);
    expect(arrived[0]).toMatchObject({ type: 'colonist', profession: 'expertFarmer', orders: 'sentry', aboard: null });
    expect(player).toMatchObject({ gold: 5000 - price, crosses: 0, recruits: 1, hadImmigrant: true });
    expect(player.pool.slice(0, 2)).toEqual(['indenturedServant', 'freeColonist']);
    expect(r.events).toEqual([{ type: 'immigrantArrived', player: 'a', unitId: (arrived[0] as Unit).id, profession: 'expertFarmer', unitType: 'colonist', slot: 2, replacement: player.pool[2], price }]);
    expect(recruitPrice(r.state, 'a')).toBe(160);
    expect(checkInvariants(r.state)).toEqual([]);
    expect(r.state.rng).not.toEqual(s.rng);
  });

  it('refuses a bad slot, an empty purse, and a power at war with the Crown', () => {
    expect(code(base(), { type: 'recruit', slot: 3 })).toBe('notForSale');
    expect(code(base(), { type: 'recruit', slot: 0.5 })).toBe('notForSale');
    expect(code(base('discoverer', 139), { type: 'recruit', slot: 0 })).toBe('cannotAfford');
    expect(code(base('discoverer', 140), { type: 'recruit', slot: 0 })).toBe('ok');
    expect(code(patch(base(), 'a', { atWar: true }), { type: 'recruit', slot: 0 })).toBe('europeClosed');
  });
});

describe('Royal University graduates', () => {
  it('pioneers, soldiers and missionaries leave fitted out', () => {
    const s = patch(world({ rows: ROWS, players: [{ id: 'a' }, { id: 'b' }] }), 'a', { gold: 9000 });
    const trained = (profession: ProfessionId): Unit => {
      const r = applyAction(s, { type: 'trainUnit', profession });
      return docksOf(r.state, 'a')[0] as Unit;
    };
    expect(trained('hardyPioneer')).toMatchObject({ type: 'pioneer', tools: 100, profession: 'hardyPioneer' });
    expect(trained('veteranSoldier')).toMatchObject({ type: 'soldier', profession: 'veteranSoldier' });
    expect(trained('jesuitMissionary')).toMatchObject({ type: 'missionary' });
    expect(trained('masterWeaver')).toMatchObject({ type: 'colonist', tools: 0 });
    expect(PROFESSIONS.hardyPioneer.europePrice).toBe(1200);
  });
});

describe('crosses', () => {
  const base = (nation: 'england' | 'france' = 'france', kind: 'human' | 'ai' = 'human', fathers: string[] = [], difficulty: (typeof DIFFICULTIES)[number] = 'conquistador'): GameState =>
    world({ rows: ROWS, players: [{ id: 'a', nation, kind, fathers }, { id: 'b' }], difficulty });
  const crowd = (s: GameState, n: number): GameState => {
    let next = s;
    for (let i = 0; i < n; i++) next = withUnit(next, { id: `m${i}`, x: 3, y: 2 });
    return next;
  };
  const turn = (s: GameState): { state: GameState; events: ImmigrationEvent[] } => {
    const events: ImmigrationEvent[] = [];
    return { state: immigrationTurn(s, 'a', events), events };
  };
  const me = (s: GameState): Player => s.players[0] as Player;
  const onDocks = (s: GameState, id: string): GameState => {
    const placed = withUnit(s, { id, x: -1, y: -1 });
    return { ...placed, units: { ...placed.units, [id]: { ...(placed.units[id] as Unit), voyage: { phase: 'inEurope', turnsLeft: 0, origin: [7, 1] } } } };
  };

  it('the threshold is 8 plus 2 a head, two thirds of that for England, and less for a computer power', () => {
    expect(crossesNeeded(base(), 'a')).toBe(8);
    expect(crossesNeeded(crowd(base(), 5), 'a')).toBe(18);
    expect(crossesNeeded(crowd(base('england'), 5), 'a')).toBe(12);
    expect(crossesNeeded(crowd(base('england'), 6), 'a')).toBe(13);
    expect(crossesNeeded(crowd(base('france', 'ai'), 5), 'a')).toBe((6 * 18) >> 3);
    expect(crossesNeeded(crowd(base('france', 'ai', [], 'viceroy'), 5), 'a')).toBe(9);
    expect(crossesNeeded(crowd(base('france', 'human', [], 'viceroy'), 5), 'a')).toBe(18);
    const many = { ...base(), colonies: {}, units: Object.fromEntries(Array.from({ length: 2100 }, (_, i) => [`x${i}`, { ...(withUnit(base(), { id: `x${i}`, x: 3, y: 2 }).units[`x${i}`] as Unit) }])) };
    expect(crossesNeeded(many, 'a')).toBe(4000);
  });

  it('empty docks add 2 a turn; nobody comes until the threshold is passed', () => {
    const r = turn(patch(base(), 'a', { crosses: 3 }));
    expect(me(r.state).crosses).toBe(5);
    expect(r.events).toEqual([]);
    expect(turn(patch(base(), 'a', { crosses: 6 })).events).toEqual([]); // 8 is not more than 8
  });

  it('passing the threshold brings one of the three by lot, free, and crosses start again', () => {
    const s = patch(base(), 'a', { crosses: 7, gold: 50 });
    const r = turn(s);
    expect(r.events).toHaveLength(1);
    const e = r.events[0] as Extract<ImmigrationEvent, { type: 'immigrantArrived' }>;
    expect(e).toMatchObject({ type: 'immigrantArrived', player: 'a', price: null });
    expect(e.profession).toBe(me(s).pool[e.slot]);
    expect(me(r.state)).toMatchObject({ crosses: 0, gold: 50, recruits: 0, hadImmigrant: true, immigrantDue: false });
    expect(me(r.state).pool[e.slot]).toBe(e.replacement);
    expect(docksOf(r.state, 'a')).toHaveLength(1);
    expect(docksOf(r.state, 'a')[0]).toMatchObject({ orders: 'sentry' });
    expect(checkInvariants(r.state)).toEqual([]);
    const slots = new Set<number>();
    for (let seed = 0; seed < 30; seed++) {
      const again = turn(patch(world({ rows: ROWS, players: [{ id: 'a', nation: 'france' }, { id: 'b' }], seed }), 'a', { crosses: 7 }));
      slots.add((again.events[0] as { slot: number }).slot);
    }
    expect([...slots].sort()).toEqual([0, 1, 2]);
  });

  it('every fourth turn the vacancy is filled by a skilled hand', () => {
    for (let seed = 0; seed < 25; seed++) {
      const s = { ...patch(world({ rows: ROWS, players: [{ id: 'a', nation: 'france' }, { id: 'b' }], seed, difficulty: 'viceroy' }), 'a', { crosses: 7 }), turn: 8 };
      const e = turn(s).events[0] as Extract<ImmigrationEvent, { type: 'immigrantArrived' }>;
      expect(Object.keys(SKILLED_IMMIGRANTS)).toContain(e.replacement);
    }
  });

  it('people kept waiting on the docks cost 2 crosses each, once anyone has come over', () => {
    const waiting = onDocks(onDocks(patch(base(), 'a', { crosses: 5, hadImmigrant: true }), 'w1'), 'w2');
    expect(me(turn(waiting).state).crosses).toBe(1);
    expect(me(turn(turn(waiting).state).state).crosses).toBe(0);
    const fresh = onDocks(patch(base(), 'a', { crosses: 5 }), 'w1');
    expect(me(turn(fresh).state).crosses).toBe(5);
  });

  it('England reaches the threshold sooner', () => {
    const french = crowd(patch(base('france'), 'a', { crosses: 12 }), 5);
    const english = crowd(patch(base('england'), 'a', { crosses: 12 }), 5);
    expect(turn(french).events).toEqual([]);
    expect(turn(english).events).toHaveLength(1);
  });

  it('nothing happens once Europe is closed', () => {
    const s = patch(base(), 'a', { crosses: 50, atWar: true });
    expect(turn(s).state).toBe(s);
  });

  describe('with Brewster', () => {
    const due = (): GameState => turn(patch(base('france', 'human', ['williamBrewster']), 'a', { crosses: 9 })).state;

    it('a human power is asked whom, and nothing moves until it answers', () => {
      const r = turn(patch(base('france', 'human', ['williamBrewster']), 'a', { crosses: 9 }));
      expect(r.events).toEqual([{ type: 'immigrantChoice', player: 'a' }]);
      expect(me(r.state)).toMatchObject({ immigrantDue: true, crosses: 11 });
      expect(docksOf(r.state, 'a')).toEqual([]);
      expect(turn(r.state).state).toBe(r.state);
    });

    it('the chosen one comes free and crosses start again', () => {
      const s = due();
      expect(code(s, { type: 'chooseImmigrant', slot: 5 })).toBe('notForSale');
      expect(code(patch(s, 'a', { immigrantDue: false }), { type: 'chooseImmigrant', slot: 0 })).toBe('notForSale');
      const r = applyAction(s, { type: 'chooseImmigrant', slot: 2 });
      expect(r.events[0]).toMatchObject({ type: 'immigrantArrived', profession: 'expertFarmer', slot: 2, price: null });
      expect(r.state.players[0]).toMatchObject({ crosses: 0, immigrantDue: false, recruits: 0, gold: 0 });
      expect(docksOf(r.state, 'a')[0]).toMatchObject({ profession: 'expertFarmer' });
    });

    it('a choice left unmade at the end of the turn is settled by lot', () => {
      const r = applyAction(due(), { type: 'endTurn' });
      expect(r.events.filter((e) => e.type === 'immigrantArrived')).toHaveLength(1);
      expect(r.state.players[0]).toMatchObject({ immigrantDue: false, crosses: 0 });
    });

    it('a computer power just takes one by lot', () => {
      const r = turn(patch(base('france', 'ai', ['williamBrewster']), 'a', { crosses: 9 }));
      expect(r.events[0]).toMatchObject({ type: 'immigrantArrived' });
    });

    it('clears the criminals and servants already waiting', () => {
      expect(brewsterPool(['pettyCriminal', 'indenturedServant', 'masterWeaver'])).toEqual(['freeColonist', 'freeColonist', 'masterWeaver']);
    });
  });

  it('runs in the Europe phase of each turn', () => {
    const s = patch(base(), 'a', { crosses: 7 });
    const r = applyAction(applyAction(s, { type: 'endTurn' }).state, { type: 'endTurn' });
    expect(r.events.some((e) => e.type === 'immigrantArrived')).toBe(true);
    expect(checkInvariants(r.state)).toEqual([]);
  });
});
