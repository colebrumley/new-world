import { describe, expect, it } from 'vitest';
import { builderFor, europeanAction, playTurn } from '../../../src/ai/european';
import { parleyAction, wagonAction, wagonBuild, wagonLoad, wagonRefusal, wagonTarget } from '../../../src/ai/wagons';
import { applyAction, type Action } from '../../../src/engine/actions';
import { AI_WAGONS } from '../../../src/engine/data/ai';
import type { GoodId } from '../../../src/engine/data/goods';
import { settlementPopulation } from '../../../src/engine/data/tribes';
import { checkInvariants } from '../../../src/engine/invariants';
import type { Rng } from '../../../src/engine/rng';
import type { Colony, GameState, Goods, Settlement, TribeState, Unit } from '../../../src/engine/state';
import { setTile, withBids, withColony, withUnit, world } from '../../helpers/world';

// a mainland (x 1..10) and an island (x 13..14) with sea between and all round
const ROWS = Array.from({ length: 9 }, (_, y) => (y === 0 || y === 8 ? '~'.repeat(16) : `~${'.'.repeat(10)}~~..~`));
const village = (id: string, x: number, y: number, extra: Partial<Settlement> = {}): Settlement => ({
  id, tribe: 'cherokee', x, y, capital: false, population: settlementPopulation('cherokee', false).start, growth: 0, taught: false, tributePaid: false,
  alarm: {}, mission: null, scouted: [], lastBought: null, lastSold: null, haggleMemory: null, ...extra,
});
const tribe = (extra: Partial<TribeState> = {}): TribeState => ({ alarm: {}, goodwill: {}, met: ['a', 'b'], muskets: 0, horses: 0, breeding: 0, silver: 0, peace: ['a', 'b'], landSold: 0, grudge: [], joinedCrown: false, visited: {}, stock: {}, ...extra });
interface Opts { villages?: Settlement[]; tribe?: Partial<TribeState>; goods?: Goods; turn?: number; gold?: number }
/** A computer power's colony at (2, 4) with a village at (8, 4), early in the game. */
function land(o: Opts = {}): GameState {
  const s = world({ rows: ROWS, players: [{ id: 'a', kind: 'ai' }, { id: 'b', kind: 'ai' }] });
  const villages = o.villages ?? [village('v', 8, 4)];
  const based: GameState = {
    ...s, turn: o.turn ?? 10, settlements: Object.fromEntries(villages.map((v) => [v.id, v])), tribes: { cherokee: tribe(o.tribe) },
    players: s.players.map((p) => (p.id === 'a' ? { ...p, gold: o.gold ?? 0 } : p)),
  };
  return withColony(based, { id: 'col', x: 2, y: 4, goods: o.goods ?? {}, buildings: ['townHall', 'carpentersShop'], construction: { kind: 'building', id: 'stockade' } });
}
const colony = (s: GameState): Colony => s.colonies['col'] as Colony;
const wagon = (s: GameState, extra: Partial<Unit> & { x: number; y: number }): GameState => {
  const placed = withUnit(s, { id: 'w', type: 'wagonTrain', profession: null, x: extra.x, y: extra.y, cargo: extra.cargo ?? {} });
  return { ...placed, units: { ...placed.units, w: { ...(placed.units['w'] as Unit), ...extra } } };
};
/** Chances that never mark a price down, or that do so for the first `n` throws. */
const dice = (markdowns = 0): Rng => {
  let left = markdowns;
  return { int: () => (left-- > 0 ? 1 : AI_WAGONS.markdownOdds) } as unknown as Rng;
};
/** Price levels as the market keeps them (a level is one above the bid). */
const levels = (s: GameState, at: Partial<Record<GoodId, number>>): GameState => withBids(s, Object.fromEntries(Object.entries(at).map(([g, l]) => [g, l - 1])));
const act = (s: GameState, a: Action | null): GameState => {
  if (!a) throw new Error('no action');
  const next = applyAction(s, a).state;
  expect(checkInvariants(next)).toEqual([]);
  return next;
};

describe('wagon rule table', () => {
  it('matches the snapshot', () => {
    expect(AI_WAGONS).toMatchSnapshot();
  });
});

describe('when a colony builds a wagon train', () => {
  const WAGON: Action = { type: 'setConstruction', colonyId: 'col', item: { kind: 'unit', unit: 'wagonTrain' } };

  it('none serves it, the year is before 1600, natives live on its landmass and are calm, and nobody threatens it', () => {
    const s = land();
    expect(wagonRefusal(s, colony(s))).toBeNull();
    expect(wagonBuild(s, colony(s))).toEqual(WAGON);
    expect(europeanAction(s)).toEqual(WAGON);
    // once it is on the stocks the order is not given again
    const started = act(s, WAGON);
    expect(wagonBuild(started, colony(started))).toBeNull();
  });

  it('not when a wagon already serves it', () => {
    const s = wagon(land(), { x: 2, y: 4 });
    expect(wagonRefusal(s, colony(s))).toBe('served');
    // a wagon out on the road serves the nearest colony on its landmass all the same
    const away = wagon(land(), { x: 7, y: 4 });
    expect(wagonRefusal(away, colony(away))).toBe('served');
  });

  it('not from 1600 on', () => {
    expect(wagonRefusal(land({ turn: 107 }), colony(land()))).toBeNull();
    expect(wagonRefusal(land({ turn: 108 }), colony(land()))).toBe('tooLate');
  });

  it('not when no natives live on its landmass', () => {
    const s = land({ villages: [village('v', 13, 4)] });
    expect(wagonRefusal(s, colony(s))).toBe('noNatives');
  });

  it("not when the nearest tribe's alarm toward the power is 50 or more", () => {
    expect(wagonRefusal(land({ tribe: { alarm: { a: 49 } } }), colony(land()))).toBeNull();
    expect(wagonRefusal(land({ tribe: { alarm: { a: 50 } } }), colony(land()))).toBe('alarmed');
    // another power's standing with them is no concern of ours
    expect(wagonRefusal(land({ tribe: { alarm: { b: 90 } } }), colony(land()))).toBeNull();
  });

  it('not while an armed foreign unit it has cause to fear stands next to it', () => {
    const foe = withUnit(land(), { id: 'f', owner: 'b', type: 'soldier', x: 3, y: 4 });
    expect(wagonRefusal(foe, colony(foe))).toBe('threatened');
    const treaty = { ...foe, players: foe.players.map((p) => (p.id === 'a' ? { ...p, stance: { b: 'peace' as const } } : p)) };
    expect(wagonRefusal(treaty, colony(treaty))).toBeNull();
    const farOff = withUnit(land(), { id: 'f', owner: 'b', type: 'soldier', x: 4, y: 4 });
    expect(wagonRefusal(farOff, colony(farOff))).toBeNull();
    const unarmed = withUnit(land(), { id: 'f', owner: 'b', x: 3, y: 4 });
    expect(wagonRefusal(unarmed, colony(unarmed))).toBeNull();
  });

  it('not beyond one wagon for each colony', () => {
    // its one wagon is stranded on the island, where it serves nothing
    const s = wagon(land(), { x: 13, y: 4 });
    expect(wagonRefusal(s, colony(s))).toBe('notAvailable');
  });

  it('a wagon no longer wanted comes off the stocks', () => {
    const late = land({ turn: 120 });
    const s = { ...late, colonies: { col: { ...colony(late), construction: { kind: 'unit' as const, unit: 'wagonTrain' as const } } } };
    const next = europeanAction(s);
    expect(next).toMatchObject({ type: 'setConstruction', colonyId: 'col', item: { kind: 'building' } });
  });
});

describe('who builds what a colony has on the stocks', () => {
  const WAGON: Action = { type: 'setConstruction', colonyId: 'col', item: { kind: 'unit', unit: 'wagonTrain' } };
  const farm = (n: number): Colony['colonists'] => Array.from({ length: n }, (_, i) => ({ id: `c${i}`, profession: 'freeColonist' as const, job: { kind: 'field' as const, dx: -1, dy: i - 1, good: 'food' as const }, turns: 0 }));

  it('a colony of one fells timber until there is enough, then takes up the hammer', () => {
    let s = act(land(), WAGON);
    s = setTile(s, 3, 4, { forest: true });
    const fell = builderFor(s, colony(s));
    expect(fell).toMatchObject({ type: 'assignJob', colonyId: 'col', job: { kind: 'field', dx: 1, dy: 0, good: 'lumber' } });
    expect(europeanAction(s)).toEqual(fell);
    s = act(s, fell);
    expect(builderFor(s, colony(s))).toBeNull();
    // with lumber enough to finish it (40 hammers for a wagon train), the same hand changes over
    s = { ...s, colonies: { col: { ...colony(s), goods: { lumber: 39 } } } };
    expect(builderFor(s, colony(s))).toBeNull();
    s = { ...s, colonies: { col: { ...colony(s), goods: { lumber: 40 } } } };
    const build = builderFor(s, colony(s));
    expect(build).toMatchObject({ type: 'assignJob', job: { kind: 'work', trade: 'carpenter' } });
    s = act(s, build);
    // and stays at the bench while there is lumber to work, though it is no longer enough to finish
    s = { ...s, colonies: { col: { ...colony(s), goods: { lumber: 3 }, hammers: 10 } } };
    expect(builderFor(s, colony(s))).toBeNull();
    // out of lumber: back to the forest
    s = { ...s, colonies: { col: { ...colony(s), goods: {} } } };
    expect(builderFor(s, colony(s))).toMatchObject({ job: { kind: 'field', good: 'lumber' } });
  });

  it('it is the same for a building as for a wagon, and nothing is done when the hammers are in', () => {
    const s = setTile(land({ turn: 120 }), 3, 4, { forest: true });
    expect(colony(s).construction).toEqual({ kind: 'building', id: 'stockade' });
    expect(builderFor(s, colony(s))).toMatchObject({ job: { kind: 'field', good: 'lumber' } });
    const done = { ...s, colonies: { col: { ...colony(s), hammers: 9999 } } };
    expect(builderFor(done, colony(done))).toBeNull();
    const idle = { ...s, colonies: { col: { ...colony(s), construction: null } } };
    expect(builderFor(idle, colony(idle))).toBeNull();
  });

  it('a larger colony keeps one hand felling and one at the bench together, but takes nobody it needs for food', () => {
    let s = setTile(land({ turn: 120 }), 3, 4, { forest: true });
    s = { ...s, colonies: { col: { ...colony(s), colonists: [...farm(2), { id: 'spare', profession: 'freeColonist', job: { kind: 'idle' }, turns: 0 }], goods: { lumber: 10 } } } };
    // lumber to work, but not enough: a carpenter first, then a feller
    const first = builderFor(s, colony(s));
    expect(first).toMatchObject({ colonistId: 'spare', job: { kind: 'work', trade: 'carpenter' } });
    s = act(s, first);
    const second = builderFor(s, colony(s));
    if (second) {
      expect(second).toMatchObject({ job: { kind: 'field', good: 'lumber' } });
      s = act(s, second);
    }
    expect(builderFor(s, colony(s))).toBeNull();
    // with no forest in reach nobody can fell, and nobody is moved for nothing
    const bare = land({ turn: 120 });
    expect(builderFor(bare, colony(bare))).toBeNull();
  });
});

describe('what a wagon loads', () => {
  const stocked = (goods: Goods, at: Partial<Record<GoodId, number>> = {}): GameState => levels(land({ goods }), { food: 9, sugar: 9, tobacco: 9, cotton: 9, furs: 9, ore: 9, silver: 9, horses: 9, rum: 9, cigars: 9, cloth: 9, coats: 9, tradeGoods: 9, lumber: 1, tools: 1, muskets: 1, ...at });
  const pick = (goods: Goods, at: Partial<Record<GoodId, number>> = {}, rng = dice()): ReturnType<typeof wagonLoad> => {
    const s = stocked(goods, at);
    return wagonLoad(s, colony(s), rng);
  };

  it('never lumber, tools or muskets, however cheap and plentiful', () => {
    expect(pick({ lumber: 100, tools: 100, muskets: 100 })).toBeNull();
  });

  it('only goods with 50 or more in store, and a hundred at most', () => {
    expect(pick({ cotton: 49 }, { cotton: 2 })).toBeNull();
    expect(pick({ cotton: 50 }, { cotton: 2 })).toEqual({ good: 'cotton', amount: 50 });
    expect(pick({ cotton: 100 }, { cotton: 2 })).toEqual({ good: 'cotton', amount: 100 });
  });

  it('only goods whose price level is below 4, or below 8 for trade goods', () => {
    expect(pick({ cotton: 80 }, { cotton: 4 })).toBeNull();
    expect(pick({ cotton: 80 }, { cotton: 3 })).toEqual({ good: 'cotton', amount: 80 });
    expect(pick({ tradeGoods: 80 }, { tradeGoods: 8 })).toBeNull();
    expect(pick({ tradeGoods: 80 }, { tradeGoods: 7 })).toEqual({ good: 'tradeGoods', amount: 80 });
  });

  it('the best score wins: stock x (limit - price) + 5 x (1 - price)', () => {
    // sugar 60 x 1 - 10 = 50; cotton 80 x 2 - 5 = 155
    expect(pick({ sugar: 60, cotton: 80 }, { sugar: 3, cotton: 2 })?.good).toBe('cotton');
    // sugar 90 x 3 = 270 beats it; on a tie the earlier good keeps its place
    expect(pick({ sugar: 90, cotton: 80 }, { sugar: 1, cotton: 2 })?.good).toBe('sugar');
    expect(pick({ sugar: 80, cotton: 80 }, { sugar: 2, cotton: 2 })?.good).toBe('sugar');
  });

  it('stock counts double once it reaches the warehouse capacity, but not food', () => {
    // capacity 100: sugar 100 x 2 x 1 - 10 = 190 against cotton 90 x 2 - 5 = 175
    expect(pick({ sugar: 100, cotton: 90 }, { sugar: 3, cotton: 2 })?.good).toBe('sugar');
    expect(pick({ sugar: 99, cotton: 90 }, { sugar: 3, cotton: 2 })?.good).toBe('cotton');
    // food 100 x 1 - 10 = 90 is not doubled
    expect(pick({ food: 100, cotton: 90 }, { food: 3, cotton: 2 })?.good).toBe('cotton');
  });

  it('the price is first marked down by chance, a step at a time while it is 2 or more', () => {
    // everything else stands at 1, where no throw is made, so the throws are cotton's alone
    const ones = Object.fromEntries(['food', 'sugar', 'tobacco', 'furs', 'ore', 'silver', 'horses', 'rum', 'cigars', 'cloth', 'coats', 'tradeGoods'].map((g) => [g, 1]));
    expect(pick({ cotton: 80 }, { ...ones, cotton: 4 }, dice(1))).toEqual({ good: 'cotton', amount: 80 });
    expect(pick({ cotton: 80 }, { ...ones, cotton: 6 }, dice(2))).toBeNull();
    expect(pick({ cotton: 80 }, { ...ones, cotton: 6 }, dice(3))).toEqual({ good: 'cotton', amount: 80 });
    // at 1 there is nothing left to take off: the throw is not even made
    let thrown = 0;
    const counting = { int: () => { thrown++; return 1; } } as unknown as Rng;
    const s = stocked({ cotton: 80 }, { ...ones, cotton: 1 });
    wagonLoad(s, colony(s), counting);
    expect(thrown).toBe(0);
  });
});

describe('where a wagon goes', () => {
  it('to the nearest settlement on its landmass, a capital counting at half its distance', () => {
    const near = village('near', 5, 4);
    const farther = village('far', 9, 4);
    expect(wagonTarget(land({ villages: [farther, near] }), 2, 4)?.id).toBe('near');
    // 3 squares against 7 / 2 = 3: the one listed first keeps it
    expect(wagonTarget(land({ villages: [near, { ...farther, capital: true }] }), 2, 4)?.id).toBe('near');
    expect(wagonTarget(land({ villages: [near, { ...village('cap', 7, 4), capital: true }] }), 2, 4)?.id).toBe('cap');
    // one across the water is nowhere a wagon can go
    expect(wagonTarget(land({ villages: [village('isle', 13, 4)] }), 2, 4)).toBeNull();
  });

  it('a capital next door still counts as one square away', () => {
    const s = land({ villages: [{ ...village('cap', 3, 5), capital: true }, village('v', 3, 3)] });
    expect(wagonTarget(s, 2, 4)?.id).toBe('cap');
  });
});

describe('the round a wagon makes', () => {
  const start = (): GameState => levels(wagon(land({ goods: { tradeGoods: 100 }, gold: 5000 }), { x: 2, y: 4 }), { tradeGoods: 2 });
  const w = (s: GameState): Unit => s.units['w'] as Unit;

  it('stands by, loads the best good, goes to the settlement, sells at the first offer, buys, and comes home to unload', () => {
    let s = start();
    expect(wagonAction(s, w(s))).toEqual({ type: 'setOrders', unitId: 'w', orders: 'sentry' });
    s = act(s, wagonAction(s, w(s)));
    expect(wagonAction(s, w(s))).toEqual({ type: 'loadCargo', unitId: 'w', good: 'tradeGoods', amount: 100 });
    s = act(s, wagonAction(s, w(s)));
    expect(wagonAction(s, w(s))).toMatchObject({ type: 'goTo', unitId: 'w', x: 7 });
    // arrived beside the village with the day before it
    s = wagon(s, { x: 7, y: 4, cargo: { tradeGoods: 100 }, orders: 'none' });
    expect(wagonAction(s, w(s))).toEqual({ type: 'setOrders', unitId: 'w', orders: 'sentry' });
    s = act(s, wagonAction(s, w(s)));
    expect(wagonAction(s, w(s))).toEqual({ type: 'enterSettlement', unitId: 'w', settlementId: 'v', action: 'trade', good: 'tradeGoods' });
    s = act(s, wagonAction(s, w(s)));
    // the village names its price and it is taken without haggling
    expect(s.parley).toMatchObject({ stage: 'selling', good: 'tradeGoods' });
    const price = (s.parley as { price: number }).price;
    expect(parleyAction(s)).toEqual({ type: 'parley', reply: 'accept' });
    expect(europeanAction(s)).toEqual({ type: 'parley', reply: 'accept' });
    s = act(s, parleyAction(s));
    expect(s.players[0]?.gold).toBe(5000 + price);
    expect(w(s).cargo).toEqual({});
    // of what the village offers it takes the good dearest in Europe, at the price asked
    if (s.parley) {
      const reply = parleyAction(s) as Extract<Action, { type: 'parley' }>;
      expect(reply.reply).toBe('accept');
      s = act(s, reply);
      expect(Object.keys(w(s).cargo)).toEqual([reply.good]);
    }
    expect(s.parley).toBeNull();
    expect(wagonAction(s, w(s))).toEqual({ type: 'goTo', unitId: 'w', x: 2, y: 4 });
    // home again: what it brought comes off, and the round begins anew
    s = wagon(s, { x: 2, y: 4, orders: 'none', cargo: { furs: 100 }, movesLeft: 3 });
    expect(wagonAction(s, w(s))).toEqual({ type: 'unloadCargo', unitId: 'w', good: 'furs', amount: 100 });
    s = act(s, wagonAction(s, w(s)));
    expect(colony(s).goods.furs).toBe(100);
  });

  it('of the wares offered it buys the one with the highest price level, the first on a tie, and nothing it cannot pay for', () => {
    const base = levels(wagon(land({ gold: 500 }), { x: 7, y: 4, orders: 'sentry', movesLeft: 0 }), { furs: 3, cotton: 5, sugar: 5 });
    const offers = [{ good: 'furs' as const, price: 100 }, { good: 'cotton' as const, price: 120 }, { good: 'sugar' as const, price: 90 }];
    const talks: GameState = { ...base, parley: { stage: 'buying', player: 'a', unitId: 'w', settlementId: 'v', amount: 100, offers } };
    expect(parleyAction(talks)).toEqual({ type: 'parley', reply: 'accept', good: 'cotton' });
    const poor = { ...talks, players: talks.players.map((p) => (p.id === 'a' ? { ...p, gold: 119 } : p)) };
    expect(parleyAction(poor)).toEqual({ type: 'parley', reply: 'leave' });
    expect(parleyAction(base)).toBeNull();
  });

  it('waits beside the village when it arrives with the day spent; nothing it carries is refused', () => {
    const tired = wagon(start(), { x: 7, y: 4, cargo: { tradeGoods: 100 }, movesLeft: 0 });
    expect(wagonAction(tired, w(tired))).toBeNull();
    // what a human trader would be turned away with (they bought the same last time) is taken from a computer power
    let s = wagon(land({ villages: [village('v', 8, 4, { lastBought: 'tradeGoods' })] }), { x: 7, y: 4, cargo: { tradeGoods: 100 }, orders: 'sentry' });
    expect(wagonAction(s, w(s))).toEqual({ type: 'enterSettlement', unitId: 'w', settlementId: 'v', action: 'trade', good: 'tradeGoods' });
    s = act(s, wagonAction(s, w(s)));
    expect(s.parley).toMatchObject({ stage: 'selling', good: 'tradeGoods' });
    // and such a cargo is loaded like any other
    const home = wagon(land({ villages: [village('v', 8, 4, { lastBought: 'tradeGoods' })], goods: { tradeGoods: 100 } }), { x: 2, y: 4 });
    expect(wagonAction(home, w(home))).toEqual({ type: 'setOrders', unitId: 'w', orders: 'sentry' });
  });

  it('an empty wagon away from home goes back to its colony', () => {
    const s = wagon(land(), { x: 6, y: 2 });
    expect(wagonAction(s, w(s))).toEqual({ type: 'goTo', unitId: 'w', x: 2, y: 4 });
    const marching = wagon(land(), { x: 6, y: 2, orders: 'goto', destination: [2, 4] });
    expect(wagonAction(marching, w(marching))).toBeNull();
  });

  it('is disbanded when loaded with no settlement on its landmass, or empty with no colony there', () => {
    const noVillage = wagon(land({ villages: [] }), { x: 6, y: 4, cargo: { cotton: 100 } });
    expect(wagonAction(noVillage, w(noVillage))).toEqual({ type: 'disbandUnit', unitId: 'w' });
    const stranded = wagon(land(), { x: 13, y: 4 });
    expect(wagonAction(stranded, w(stranded))).toEqual({ type: 'disbandUnit', unitId: 'w' });
    expect(act(stranded, wagonAction(stranded, w(stranded))).units['w']).toBeUndefined();
    // loaded and with a settlement to go to, it carries on though it has no colony
    const orphan = wagon({ ...land(), colonies: {} }, { x: 5, y: 4, cargo: { cotton: 100 } });
    expect(wagonAction(orphan, w(orphan))).toMatchObject({ type: 'goTo', unitId: 'w' });
  });

  it("a whole turn of it leaves the game sound", () => {
    const turn = playTurn(start());
    expect(checkInvariants(turn.state)).toEqual([]);
    expect(turn.actions.map((a) => a.type)).toEqual(expect.arrayContaining(['loadCargo', 'goTo']));
  });
});
