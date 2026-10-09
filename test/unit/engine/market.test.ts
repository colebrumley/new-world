import { describe, expect, it } from 'vitest';
import { applyAction, validateAction, type Action } from '../../../src/engine/actions';
import { firstTurnOfYear } from '../../../src/engine/calendar';
import { GOOD_IDS, type GoodId } from '../../../src/engine/data/goods';
import { MARKET, MARKET_MODEL } from '../../../src/engine/data/market';
import { checkInvariants } from '../../../src/engine/invariants';
import { askPrice, backTaxes, bidPrice, createMarket, evaluateMarket, saleProceeds, sellDirect, type MarketEvent } from '../../../src/engine/market';
import { createRng } from '../../../src/engine/rng';
import { OFF_MAP, type GameState, type Unit } from '../../../src/engine/state';
import { withBids, withUnit, world } from '../../helpers/world';

const ROWS = ['~~~~~~~sss', '~~..~~~sss', '~~~~~~~sss'];
const FOUR = [{ id: 'eng' }, { id: 'fra' }, { id: 'spa' }, { id: 'ned' }];
interface Spec { gold?: number; cargo?: Unit['cargo']; taxRate?: number; difficulty?: GameState['difficulty']; ai?: boolean; seed?: number; turn?: number }
/** Four powers; a merchantman of the first lies in Europe. */
function europe(spec: Spec = {}): GameState {
  const s = world({
    rows: ROWS, seed: spec.seed ?? 1, difficulty: spec.difficulty ?? 'conquistador',
    players: FOUR.map((p, i) => ({ ...p, kind: i === 0 && !spec.ai ? ('human' as const) : ('ai' as const), taxRate: i === 0 ? (spec.taxRate ?? 0) : 0 })),
  });
  const rich = { ...s, turn: spec.turn ?? 0, players: s.players.map((p) => ({ ...p, gold: spec.gold ?? 100000 })) };
  const fleet = withUnit(rich, { id: 'ship', owner: 'eng', type: 'merchantman', x: OFF_MAP, y: OFF_MAP, cargo: spec.cargo ?? {} });
  return { ...fleet, units: { ship: { ...(fleet.units['ship'] as Unit), voyage: { phase: 'inEurope', turnsLeft: 0, origin: [7, 1] } } } };
}
const code = (s: GameState, a: Action): string => {
  const v = validateAction(s, a);
  return v.ok ? 'ok' : v.error.code;
};
const act = (s: GameState, a: Action): GameState => {
  const next = applyAction(s, a).state;
  expect(checkInvariants(next)).toEqual([]);
  return next;
};
const vol = (s: GameState, p: string, g: GoodId): number => s.market.powers[p]!.volume[g];
const sell = (s: GameState, good: GoodId, amount = 100): GameState => {
  const stocked = { ...s, units: { ship: { ...(s.units['ship'] as Unit), cargo: { [good]: amount } } } };
  return act(stocked, { type: 'sellGoods', unitId: 'ship', good, amount });
};

describe('opening prices', () => {
  it('ordinary goods open inside the table range, the same for every power; processed goods open at their group level', () => {
    expect(MARKET_MODEL).toMatchSnapshot();
    for (let seed = 1; seed <= 40; seed++) {
      const m = createMarket(createRng(seed), FOUR);
      for (const g of GOOD_IDS) {
        const prices = FOUR.map((p) => m.powers[p.id]!.price[g]);
        expect(new Set(prices).size, `${g} seed ${seed}`).toBe(1);
        const price = prices[0]!;
        if ((MARKET_MODEL.processed as readonly string[]).includes(g)) {
          expect(price).toBeGreaterThanOrEqual(7);
          expect(price).toBeLessThanOrEqual(19);
        } else {
          expect(price).toBeGreaterThanOrEqual(MARKET[g].start[0]);
          expect(price).toBeLessThanOrEqual(MARKET[g].start[1]);
        }
        expect(m.shared[g]).toBeGreaterThanOrEqual(600);
        expect(m.shared[g]).toBeLessThanOrEqual(1000);
        expect(m.powers['eng']!.volume[g]).toBe(0);
      }
    }
  });

  it('the bid is one under the price and the ask is the bid plus one plus the burden', () => {
    const s = withBids(europe(), { food: 2, sugar: 5, ore: 4, lumber: 1, cloth: 11, tools: 1 }, 'eng');
    const spread = (g: GoodId): number[] => [bidPrice(s, 'eng', g), askPrice(s, 'eng', g)];
    expect(spread('food')).toEqual([2, 10]);
    expect(spread('sugar')).toEqual([5, 7]);
    expect(spread('ore')).toEqual([4, 7]);
    expect(spread('lumber')).toEqual([1, 6]);
    expect(spread('cloth')).toEqual([11, 12]);
    expect(spread('tools')).toEqual([1, 2]);
  });
});

describe('buying and selling', () => {
  it('a purchase costs the ask times the amount, with no tax, and fills the hold', () => {
    const s = withBids(europe({ gold: 1000, taxRate: 30 }), { tools: 1 }, 'eng');
    const r = applyAction(s, { type: 'buyGoods', unitId: 'ship', good: 'tools', amount: 100 });
    expect(r.state.players[0]?.gold).toBe(800);
    expect((r.state.units['ship'] as Unit).cargo).toEqual({ tools: 100 });
    expect(r.events[0]).toEqual({ type: 'goodsBought', player: 'eng', good: 'tools', amount: 100, cost: 200 });
  });

  it('a sale pays the bid less tax, rounded down, and empties the hold', () => {
    const s = withBids(europe({ gold: 0, taxRate: 23, cargo: { furs: 77 } }), { furs: 5 }, 'eng');
    expect(saleProceeds(s, 'eng', 'furs', 77)).toEqual({ gross: 385, tax: 88, net: 297 });
    const r = applyAction(s, { type: 'sellGoods', unitId: 'ship', good: 'furs', amount: 77 });
    expect(r.state.players[0]?.gold).toBe(297);
    expect((r.state.units['ship'] as Unit).cargo).toEqual({});
    expect(r.events[0]).toEqual({ type: 'goodsSold', player: 'eng', good: 'furs', amount: 77, gross: 385, tax: 88, net: 297 });
  });

  it('refuses over 100 at a time, short treasuries, full holds, missing cargo, and ships not in Europe', () => {
    const s = withBids(europe({ gold: 150, cargo: { rum: 100, cigars: 100, cloth: 100, coats: 100 } }), { tools: 1, rum: 10 }, 'eng');
    expect(code(s, { type: 'sellGoods', unitId: 'ship', good: 'rum', amount: 101 })).toBe('badAmount');
    expect(code(s, { type: 'sellGoods', unitId: 'ship', good: 'furs', amount: 1 })).toBe('notEnough');
    expect(code(s, { type: 'buyGoods', unitId: 'ship', good: 'tools', amount: 1 })).toBe('noRoom');
    expect(code(europe({ gold: 150 }), { type: 'buyGoods', unitId: 'ship', good: 'muskets', amount: 100 })).toBe('cannotAfford');
    expect(code(s, { type: 'buyGoods', unitId: 'ship', good: 'tools', amount: 0 })).toBe('badAmount');
    const atSea = withUnit(s, { id: 'far', owner: 'eng', type: 'caravel', x: 7, y: 1, cargo: { rum: 10 } });
    expect(code(atSea, { type: 'sellGoods', unitId: 'far', good: 'rum', amount: 10 })).toBe('notInEurope');
    const war = { ...s, players: s.players.map((p) => (p.id === 'eng' ? { ...p, atWar: true } : p)) };
    expect(code(war, { type: 'sellGoods', unitId: 'ship', good: 'rum', amount: 10 })).toBe('europeClosed');
  });
});

describe('traffic', () => {
  it("a sale adds to every power's traffic: the amount shifted by the good's volatility, the Dutch feeling two thirds", () => {
    const base = europe();
    const sugar = sell(base, 'sugar'); // volatility 1
    expect(vol(sugar, 'fra', 'sugar') - vol(base, 'fra', 'sugar')).toBe(200);
    expect(vol(sugar, 'spa', 'sugar')).toBe(vol(sugar, 'fra', 'sugar'));
    expect(vol(sugar, 'ned', 'sugar') - vol(base, 'ned', 'sugar')).toBe(133);
    const ore = sell(base, 'ore'); // volatility 0
    expect(vol(ore, 'fra', 'ore')).toBe(100);
    const silver = sell(base, 'silver'); // volatility 2
    expect(vol(silver, 'fra', 'silver')).toBe(400);
    expect(sugar.market.powers['eng']!.netSold.sugar).toBe(100);
    expect(sugar.market.powers['fra']!.netSold.sugar).toBe(0);
  });

  it('a purchase takes the same off everyone, the Dutch included', () => {
    const base = europe();
    const bought = act(base, { type: 'buyGoods', unitId: 'ship', good: 'muskets', amount: 100 });
    expect(vol(bought, 'fra', 'muskets')).toBe(-100);
    expect(vol(bought, 'ned', 'muskets')).toBe(-100);
    expect(bought.market.powers['eng']!.netSold.muskets).toBe(-100);
  });

  it("a human's trades weigh 16% more or less per difficulty step; an AI's always weigh least", () => {
    const weight = (spec: Spec): number => vol(sell(europe(spec), 'ore'), 'fra', 'ore');
    expect((['discoverer', 'explorer', 'conquistador', 'governor', 'viceroy'] as const).map((difficulty) => weight({ difficulty }))).toEqual([68, 84, 100, 116, 132]);
    expect(weight({ difficulty: 'viceroy', ai: true })).toBe(68);
    expect(vol(sell(europe({ difficulty: 'viceroy' }), 'sugar'), 'fra', 'sugar')).toBe(232);
  });
});

describe('price movement', () => {
  const turn = (s: GameState, player = 'eng'): { state: GameState; events: MarketEvent[] } => {
    const events: MarketEvent[] = [];
    return { state: evaluateMarket(s, player, null, events), events };
  };

  it('selling 1000 sugar drops the bid by at least two steps', () => {
    let s = withBids(europe(), { sugar: 6 }, 'eng');
    const before = bidPrice(s, 'eng', 'sugar');
    for (let i = 0; i < 10; i++) s = sell(s, 'sugar');
    expect(bidPrice(s, 'eng', 'sugar')).toBeLessThanOrEqual(before - 2);
    expect(bidPrice(s, 'eng', 'sugar')).toBeGreaterThanOrEqual(MARKET.sugar.low - 1);
  });

  it('the Dutch price falls less for the same sales', () => {
    const drop = (seller: string): number => {
      let s = withBids(withBids(europe(), { sugar: 6 }, 'fra'), { sugar: 6 }, 'ned');
      const events: MarketEvent[] = [];
      for (let i = 0; i < 9; i++) s = sellDirect(s, seller, 'sugar', 100, events);
      return 6 - bidPrice(s, seller, 'sugar');
    };
    expect(drop('fra')).toBeGreaterThan(drop('ned'));
  });

  it('a price never leaves its limits, and announces each step', () => {
    let s = withBids(europe(), { ore: 1 }, 'eng'); // price 2 = the floor
    for (let i = 0; i < 12; i++) s = sell(s, 'ore');
    expect(bidPrice(s, 'eng', 'ore')).toBe(1);
    const high = withBids(europe(), { horses: 10 }, 'eng'); // price 11 = the ceiling
    let h = high;
    for (let i = 0; i < 12; i++) h = act({ ...h, units: { ship: { ...(h.units['ship'] as Unit), cargo: {} } } }, { type: 'buyGoods', unitId: 'ship', good: 'horses', amount: 100 });
    expect(bidPrice(h, 'eng', 'horses')).toBe(10);
    const r = applyAction(withBids({ ...europe(), units: { ship: { ...(europe().units['ship'] as Unit), cargo: { ore: 100 } } } }, { ore: 4 }, 'eng'), { type: 'sellGoods', unitId: 'ship', good: 'ore', amount: 100 });
    expect(r.events.some((e) => e.type === 'priceChanged')).toBe(false); // 100 is short of the 400 it takes
  });

  it('left alone, a depressed price recovers through attrition', () => {
    // sugar: attrition -8 a turn against a rise threshold of 400, plus the weak group pull
    let s = withBids(europe(), { sugar: 2 }, 'eng');
    let turns = 0;
    while (bidPrice(s, 'eng', 'sugar') === 2 && turns < 200) {
      s = turn(s).state;
      turns++;
    }
    expect(bidPrice(s, 'eng', 'sugar')).toBe(3);
    expect(turns).toBeGreaterThan(20);
    expect(turns).toBeLessThan(60);
    const r = turn(europe());
    expect(r.state.market.powers['eng']!.volume.tradeGoods).toBe(4); // trade goods drift the other way
    expect(r.state.market.powers['eng']!.volume.lumber).toBe(0);
  });

  it('attrition is applied once a turn, not again by each trade', () => {
    const s = sell(europe(), 'ore');
    expect(vol(s, 'eng', 'ore')).toBe(100); // no -7 from the single-good evaluation
    expect(vol(turn(europe()).state, 'eng', 'ore')).toBe(-7);
  });

  it('Dutch attrition doubles on odd turns', () => {
    expect(vol(turn(europe({ turn: 2 }), 'ned').state, 'ned', 'ore')).toBe(-7);
    expect(vol(turn(europe({ turn: 3 }), 'ned').state, 'ned', 'ore')).toBe(-14);
    expect(vol(turn(europe({ turn: 3 }), 'fra').state, 'fra', 'ore')).toBe(-7);
  });

  it('only England wears down the shared volume', () => {
    const base = europe();
    expect(turn(base, 'fra').state.market.shared).toEqual(base.market.shared);
    const worn = turn(base, 'eng').state.market.shared;
    for (const g of GOOD_IDS) expect(worn[g]).toBe(base.market.shared[g] - (base.market.shared[g] >> 7));
  });

  it('is run for the power whose turn begins', () => {
    const s = europe();
    const after = applyAction(s, { type: 'endTurn' }).state; // France's turn begins
    expect(vol(after, 'fra', 'ore')).toBe(-7);
    expect(vol(after, 'eng', 'ore')).toBe(0);
  });
});

describe('the processed-goods group', () => {
  const evaluate = (s: GameState): GameState => evaluateMarket(s, 'fra', null, []);
  const level = (s: GameState): GameState => ({ ...s, market: { ...s.market, shared: { ...s.market.shared, rum: 800, cigars: 800, cloth: 800, coats: 800 } } });

  it('pulls each price one step a turn toward 3 x the group volume / its own volume (12 when all are equal)', () => {
    let s = withBids(level(europe()), { rum: 15, cigars: 8, cloth: 11, coats: 11 }, 'fra');
    s = evaluate(s);
    // cigars rise at once; rum needs a second turn, since its own attrition takes a little off the first push
    expect([bidPrice(s, 'fra', 'rum'), bidPrice(s, 'fra', 'cigars'), bidPrice(s, 'fra', 'cloth')]).toEqual([15, 9, 11]);
    expect(bidPrice(evaluate(s), 'fra', 'rum')).toBe(14);
    for (let i = 0; i < 6; i++) s = evaluate(s);
    expect([bidPrice(s, 'fra', 'rum'), bidPrice(s, 'fra', 'cigars')]).toEqual([11, 11]);
  });

  it('selling a lot of one of them lowers its level and raises the others', () => {
    let s = withBids(level(europe()), { rum: 11, cigars: 11, cloth: 11, coats: 11 }, 'fra');
    const flood = { ...s.market.powers['spa']!, netSold: { ...s.market.powers['spa']!.netSold, rum: 1600 } };
    s = { ...s, market: { ...s.market, powers: { ...s.market.powers, spa: flood } } };
    for (let i = 0; i < 12; i++) s = evaluate(s);
    // rum volume 2400 of 4800: level 6; the others 800 of 4800: level 18
    expect(bidPrice(s, 'fra', 'rum')).toBe(5);
    expect(bidPrice(s, 'fra', 'cloth')).toBe(17);
  });

  it('gives raw crops and furs only a weak pull of the same kind, with furs dearer before 1700 and dearer still before 1600', () => {
    const pull = (turn: number): number => vol(evaluateMarket(withBids(europe({ turn }), { furs: 3 }, 'fra'), 'fra', null, []), 'fra', 'furs');
    // attrition -13, group pull -12 while the price is under the level
    expect(pull(firstTurnOfYear(1550))).toBe(-25);
    const sugar = vol(evaluateMarket(withBids(europe(), { sugar: 4 }, 'fra'), 'fra', null, []), 'fra', 'sugar');
    expect(sugar).toBe(-8 - 5);
  });
});

describe('boycotts', () => {
  const boycotted = (gold = 100000): GameState => {
    const s = withBids(europe({ gold, cargo: { rum: 50 } }), { rum: 11, tools: 1 }, 'eng');
    return { ...s, players: s.players.map((p) => (p.id === 'eng' ? { ...p, boycotts: ['rum' as const] } : p)) };
  };

  it('stop both buying and selling of the good until the back taxes are paid: 500 times the ask', () => {
    const s = boycotted();
    expect(code(s, { type: 'sellGoods', unitId: 'ship', good: 'rum', amount: 50 })).toBe('boycotted');
    expect(code(s, { type: 'buyGoods', unitId: 'ship', good: 'rum', amount: 10 })).toBe('boycotted');
    expect(code(s, { type: 'buyGoods', unitId: 'ship', good: 'tools', amount: 10 })).toBe('ok');
    expect(backTaxes(s, 'eng', 'rum')).toBe(12 * 500);
    const r = applyAction(s, { type: 'payBackTaxes', good: 'rum' });
    expect(r.state.players[0]).toMatchObject({ gold: 100000 - 6000, boycotts: [] });
    expect(r.events).toEqual([{ type: 'boycottLifted', player: 'eng', good: 'rum', paid: 6000 }]);
    expect(code(r.state, { type: 'sellGoods', unitId: 'ship', good: 'rum', amount: 50 })).toBe('ok');
  });

  it('cannot be paid off without the gold, or where there is no boycott', () => {
    expect(code(boycotted(5999), { type: 'payBackTaxes', good: 'rum' })).toBe('cannotAfford');
    expect(code(boycotted(), { type: 'payBackTaxes', good: 'cloth' })).toBe('notBoycotted');
  });
});
