import { describe, expect, it } from 'vitest';
import { applyAction, listValidActions, validateAction, type Action, type GameEvent } from '../../../src/engine/actions';
import { tribalAlarm } from '../../../src/engine/alarm';
import { EUROPE_PRICED, MADE_GOODS, NATIVE_TRADE, RAW_PRICED } from '../../../src/engine/data/native-trade';
import type { GoodId } from '../../../src/engine/data/goods';
import { settlementPopulation } from '../../../src/engine/data/tribes';
import type { DIFFICULTIES } from '../../../src/engine/data/yields';
import { checkInvariants } from '../../../src/engine/invariants';
import { settlementEconomy } from '../../../src/engine/native-economy';
import { fadeTradeMemory, quoteSale, wares, type NativeTradeEvent } from '../../../src/engine/native-trade';
import { createRng } from '../../../src/engine/rng';
import type { GameState, Goods, Parley, Settlement, TribeState } from '../../../src/engine/state';
import { setTile, withUnit, world } from '../../helpers/world';

type Level = (typeof DIFFICULTIES)[number];
type Result = { state: GameState; events: readonly GameEvent[] };
const ROWS = Array.from({ length: 12 }, (_, y) => (y === 0 || y === 11 ? '~'.repeat(14) : `~${'.'.repeat(12)}~`));
const village = (extra: Partial<Settlement> = {}): Settlement => ({
  id: 'v', tribe: 'cherokee', x: 6, y: 6, capital: false, population: settlementPopulation('cherokee', false).start, growth: 0, taught: false, tributePaid: false,
  alarm: {}, mission: null, scouted: [], lastBought: null, lastSold: null, haggleMemory: null, ...extra,
});
const record = (extra: Partial<TribeState> = {}): TribeState => ({ alarm: {}, goodwill: {}, met: ['a', 'b'], muskets: 0, horses: 0, breeding: 0, silver: 0, peace: ['a', 'b'], landSold: 0, grudge: [], joinedCrown: false, visited: {}, stock: {}, ...extra });
interface Opts { seed?: number; difficulty?: Level; record?: Partial<TribeState>; village?: Partial<Settlement>; cargo?: Goods; gold?: number; ship?: boolean }
function land(o: Opts = {}): GameState {
  let s = world({ rows: ROWS, seed: o.seed ?? 1, difficulty: o.difficulty ?? 'conquistador', players: [{ id: 'a' }, { id: 'b' }] });
  s = { ...s, settlements: { v: village(o.village) }, tribes: { cherokee: record(o.record) }, players: s.players.map((p) => (p.id === 'a' ? { ...p, gold: o.gold ?? 0 } : p)) };
  if (o.ship) {
    for (let x = 1; x <= 5; x++) s = setTile(s, x, 6, { base: 'ocean' });
    return withUnit(s, { id: 'w', type: 'caravel', profession: null, x: 5, y: 6, cargo: o.cargo ?? {} });
  }
  return withUnit(s, { id: 'w', type: 'wagonTrain', profession: null, x: 5, y: 6, cargo: o.cargo ?? {} });
}
const offer = (s: GameState, good?: GoodId, action: 'trade' | 'enterHostile' = 'trade'): Result =>
  applyAction(s, { type: 'enterSettlement', unitId: 'w', settlementId: 'v', action, ...(good ? { good } : {}) });
const say = (s: GameState, reply: 'accept' | 'haggle' | 'gift' | 'leave', good?: GoodId): Result => applyAction(s, { type: 'parley', reply, ...(good ? { good } : {}) });
const code = (s: GameState, a: Action): string => {
  const v = validateAction(s, a);
  return v.ok ? 'ok' : v.error.code;
};
const event = <K extends NativeTradeEvent['type']>(r: Result, type: K): Extract<NativeTradeEvent, { type: K }> => r.events.find((e) => e.type === type) as Extract<NativeTradeEvent, { type: K }>;
const T = (s: GameState): number => tribalAlarm(s, 'cherokee', 'a');
const demandOf = (s: GameState, good: GoodId): number => settlementEconomy(s, s.settlements['v']!).demand[good];

describe('native trade tables', () => {
  it('match the snapshot', () => {
    expect({ NATIVE_TRADE, MADE_GOODS, RAW_PRICED, EUROPE_PRICED }).toMatchSnapshot();
  });
});

describe('offering a cargo', () => {
  it('the settlement names a price within what its keenness and demand allow', () => {
    const s = land({ cargo: { cloth: 100 } });
    const d = demandOf(s, 'cloth');
    expect(d).toBeGreaterThan(0);
    for (let seed = 0; seed < 60; seed++) {
      const q = quoteSale(s, s.units['w']!, s.settlements['v']!, 'cloth', createRng(seed));
      // r in 1..5, keenness 7, middle level (2), no grudge: m = 2 x (7 - 2 + r + 4)
      const low = Math.trunc((5 + 2 * 10 * d) / 2);
      const high = Math.trunc((25 + 2 * 14 * d) / 2);
      expect(q.amount).toBe(100);
      expect(q.price).toBeGreaterThanOrEqual(low);
      expect(q.price).toBeLessThanOrEqual(high);
      expect([(d + 4) >> 2, ((d + 4) >> 2) + 1]).toContain(q.goodwill);
    }
  });

  it('pays less on harder levels, to a power it resents, and for part loads in proportion', () => {
    const price = (o: Opts, good: GoodId = 'cloth'): number => {
      const s = land({ cargo: { [good]: 100 }, ...o });
      return quoteSale(s, s.units['w']!, s.settlements['v']!, good, createRng(7)).price;
    };
    expect(price({ difficulty: 'discoverer' })).toBeGreaterThan(price({ difficulty: 'viceroy' }));
    expect(price({})).toBeGreaterThan(price({ record: { alarm: { a: 60 } } }));
    expect(price({ cargo: { cloth: 50 } })).toBeLessThanOrEqual(Math.ceil(price({}) / 2));
  });

  it('prizes muskets and horses until the tribe has them', () => {
    const price = (o: Opts, good: GoodId): number => {
      const s = land({ cargo: { [good]: 100 }, ...o });
      return quoteSale(s, s.units['w']!, s.settlements['v']!, good, createRng(3)).price;
    };
    expect(price({}, 'muskets')).toBeGreaterThan(price({ record: { muskets: 4 } }, 'muskets'));
    expect(price({}, 'horses')).toBeGreaterThan(price({ record: { horses: 4 } }, 'horses'));
  });

  it('opens talks and uses up the carrier\'s turn', () => {
    const r = offer(land({ cargo: { cloth: 100 } }), 'cloth');
    const e = event(r, 'nativeOffer');
    expect(e).toMatchObject({ settlementId: 'v', unitId: 'w', good: 'cloth', amount: 100 });
    expect(r.state.parley).toMatchObject({ stage: 'selling', player: 'a', good: 'cloth', amount: 100, price: e.price, haggled: false });
    expect(r.state.units['w']?.movesLeft).toBe(0);
    expect(listValidActions(r.state).filter((a) => a.type === 'parley').map((a) => (a as { reply: string }).reply)).toEqual(['accept', 'haggle', 'gift', 'leave']);
  });

  it('is refused for what they just bought or sold, do not want, or were haggled out of', () => {
    const act = (good: GoodId): Action => ({ type: 'enterSettlement', unitId: 'w', settlementId: 'v', action: 'trade', good });
    expect(code(land({ cargo: { cloth: 100 } }), act('cloth'))).toBe('ok');
    expect(code(land({ cargo: { cloth: 100 }, village: { lastBought: 'cloth' } }), act('cloth'))).toBe('unwanted');
    expect(code(land({ cargo: { cloth: 100 }, village: { lastSold: 'cloth' } }), act('cloth'))).toBe('unwanted');
    expect(code(land({ cargo: { cloth: 100 }, village: { haggleMemory: 'cloth' } }), act('cloth'))).toBe('haggledOut');
    expect(code(land({ cargo: { food: 100 } }), act('food'))).toBe('unwanted'); // they grow plenty
    // a computer power's cargo is never turned down: the price is simply poor where there is no demand
    const computer = (o: Opts): GameState => { const s = land(o); return { ...s, players: s.players.map((p) => (p.id === 'a' ? { ...p, kind: 'ai' as const } : p)) }; };
    expect(code(computer({ cargo: { cloth: 100 }, village: { lastBought: 'cloth' } }), act('cloth'))).toBe('ok');
    expect(code(computer({ cargo: { cloth: 100 }, village: { haggleMemory: 'cloth' } }), act('cloth'))).toBe('ok');
    expect(code(computer({ cargo: { food: 100 } }), act('food'))).toBe('ok');
    const cheap = offer(computer({ cargo: { food: 100 } }), 'food');
    expect(event(cheap, 'nativeOffer').price).toBeGreaterThanOrEqual(1);
    expect(event(cheap, 'nativeOffer').price).toBeLessThanOrEqual(12); // (5 x a throw of 1..5) / 2 for a full cargo
    expect(code(computer({ cargo: {} }), act('cloth'))).toBe('noCargo');
    expect(code(land({ cargo: { cloth: 100 } }), act('rum'))).toBe('noCargo');
    expect(code(land({ cargo: { cloth: 100 } }), { type: 'enterSettlement', unitId: 'w', settlementId: 'v', action: 'trade' })).toBe('noCargo');
  });

  it('an empty wagon is only told what they want', () => {
    const r = offer(land());
    expect(event(r, 'nativesWant').wants).toHaveLength(3);
    expect(r.state.parley).toBeNull();
  });
});

describe('answering their price', () => {
  const talks = (o: Opts = {}): GameState => offer(land({ cargo: { cloth: 100 }, record: { alarm: { a: 30 } }, village: { alarm: { a: 150 } }, ...o }), 'cloth').state;

  it('accepting hands over the cargo for gold, pleases the tribe and calms the settlement', () => {
    const s = talks();
    const parley = s.parley as Extract<Parley, { stage: 'selling' }>;
    const r = say(s, 'accept');
    expect(r.state.players[0]?.gold).toBe(parley.price);
    expect(r.state.units['w']?.cargo.cloth ?? 0).toBe(0);
    expect(event(r, 'nativeSale')).toMatchObject({ good: 'cloth', amount: 100, price: parley.price, gift: false });
    expect(T(r.state)).toBe(30 - 2 * parley.goodwill);
    expect(r.state.settlements['v']).toMatchObject({ lastBought: 'cloth', alarm: { a: 0 } });
    expect(r.state.tribes.cherokee?.stock).toEqual({ cloth: 100 });
    expect(checkInvariants(r.state)).toEqual([]);
  });

  it('a part load calms the settlement by its size', () => {
    const s = offer(land({ cargo: { cloth: 40 }, village: { alarm: { a: 150 } } }), 'cloth').state;
    expect(say(s, 'accept').state.settlements['v']?.alarm['a']).toBe(110);
    expect(say(s, 'gift').state.settlements['v']?.alarm['a']).toBe(70);
  });

  it('a gift earns no gold but twice the gratitude, and leaves no glut in the tribe\'s memory', () => {
    const s = talks();
    const parley = s.parley as Extract<Parley, { stage: 'selling' }>;
    const r = say(s, 'gift');
    expect(r.state.players[0]?.gold).toBe(0);
    expect(event(r, 'nativeSale')).toMatchObject({ gift: true, price: 0 });
    expect(T(r.state)).toBe(Math.max(0, 30 - 4 * (parley.goodwill + 1)));
    expect(r.state.tribes.cherokee?.stock).toEqual({});
  });

  it('haggling either raises the price (once goodwill is spent no more) or ends the talks with ill feeling', () => {
    let raised = 0;
    let failed = 0;
    for (let seed = 0; seed < 300; seed++) {
      const s = talks({ seed });
      const before = s.parley as Extract<Parley, { stage: 'selling' }>;
      const r = say(s, 'haggle');
      const e = event(r, 'nativeHaggle');
      if (e.success) {
        raised++;
        const after = r.state.parley as Extract<Parley, { stage: 'selling' }>;
        expect(after.price).toBeGreaterThan(before.price);
        expect(after).toMatchObject({ goodwill: before.goodwill - 1, haggled: true });
        expect(code(r.state, { type: 'parley', reply: 'gift' })).toBe('badReply');
      } else {
        failed++;
        expect(r.state.parley).toBeNull();
        expect(r.state.settlements['v']?.haggleMemory).toBe('cloth');
        expect(T(r.state)).toBeGreaterThan(30);
        expect(r.state.units['w']?.cargo.cloth).toBe(100);
      }
    }
    expect(raised).toBeGreaterThan(200);
    expect(failed).toBeGreaterThan(0);
  });

  it('walking away ends the talks and changes nothing else', () => {
    const s = talks();
    const r = say(s, 'leave');
    expect(r.state.parley).toBeNull();
    expect(r.state.units['w']?.cargo.cloth).toBe(100);
    expect(code(r.state, { type: 'parley', reply: 'accept' })).toBe('noParley');
  });

  it('muskets and horses arm and mount the tribe', () => {
    const sell = (cargo: Goods, good: GoodId, reply: 'accept' | 'gift' = 'accept'): TribeState => say(offer(land({ cargo }), good).state, reply).state.tribes.cherokee!;
    expect(sell({ muskets: 100 }, 'muskets').muskets).toBe(2);
    expect(sell({ muskets: 30 }, 'muskets').muskets).toBe(1);
    expect(sell({ muskets: 20 }, 'muskets').muskets).toBe(0);
    expect(sell({ muskets: 20 }, 'muskets', 'gift').muskets).toBe(1);
    expect(sell({ horses: 60 }, 'horses')).toMatchObject({ horses: 2, breeding: 15 });
  });

  it('talks lapse at the end of the turn', () => {
    expect(applyAction(talks(), { type: 'endTurn' }).state.parley).toBeNull();
  });
});

describe('buying from them', () => {
  const sold = (o: Opts = {}): Result => say(offer(land({ cargo: { cloth: 100 }, gold: 5000, ...o }), 'cloth').state, 'accept');

  it('after a sale they offer up to three goods they have most of, never food, trade goods, tools or muskets', () => {
    const r = sold();
    const w = event(r, 'nativeWares');
    expect(w.amount).toBe(100);
    expect(w.offers.length).toBeGreaterThan(0);
    expect(w.offers.length).toBeLessThanOrEqual(3);
    for (const o of w.offers) {
      expect(['food', 'tradeGoods', 'tools', 'muskets']).not.toContain(o.good);
      expect(o.price).toBeGreaterThanOrEqual(50);
    }
    expect(w.offers.map((o) => o.good)).toContain('coats'); // stands in for the food they have most of
    expect(r.state.parley).toMatchObject({ stage: 'buying', amount: 100 });
  });

  it('a ship is offered a quarter as much', () => {
    expect(event(sold({ ship: true }), 'nativeWares').amount).toBe(25);
  });

  it('asks more from a power it is wary of and on harder levels', () => {
    const ask = (o: Opts): number => {
      const s = land(o);
      return wares(s, s.units['w']!, s.settlements['v']!, 100, createRng(5))[0]!.price;
    };
    expect(ask({ record: { alarm: { a: 40 } } })).toBe(ask({}) + 160);
    expect(ask({ difficulty: 'viceroy' })).toBeGreaterThan(ask({ difficulty: 'discoverer' }));
  });

  it('buying takes the gold, loads the goods and is remembered', () => {
    const r = sold();
    const pick = (r.state.parley as Extract<Parley, { stage: 'buying' }>).offers[0]!;
    const gold = r.state.players[0]!.gold;
    const bought = say(r.state, 'accept', pick.good);
    expect(bought.state.players[0]?.gold).toBe(gold - pick.price);
    expect(bought.state.units['w']?.cargo[pick.good]).toBe(100);
    expect(bought.state.settlements['v']?.lastSold).toBe(pick.good);
    expect(bought.state.tribes.cherokee?.stock[pick.good]).toBe(-100);
    expect(bought.state.parley).toBeNull();
    expect(event(bought, 'nativePurchase')).toMatchObject({ good: pick.good, amount: 100, price: pick.price });
    expect(checkInvariants(bought.state)).toEqual([]);
  });

  it('needs the gold and a good they offered', () => {
    const r = sold();
    const pick = (r.state.parley as Extract<Parley, { stage: 'buying' }>).offers[0]!;
    const poor = { ...r.state, players: r.state.players.map((p) => (p.id === 'a' ? { ...p, gold: pick.price - 1 } : p)) };
    expect(code(poor, { type: 'parley', reply: 'accept', good: pick.good })).toBe('cannotAfford');
    expect(code(r.state, { type: 'parley', reply: 'accept', good: 'muskets' })).toBe('badReply');
    expect(code(r.state, { type: 'parley', reply: 'gift', good: pick.good })).toBe('badReply');
    expect(code(r.state, { type: 'parley', reply: 'leave' })).toBe('ok');
  });

  it('haggling knocks a quarter off or sours them on selling until the next sale', () => {
    let cheaper = 0;
    let soured = 0;
    for (let seed = 0; seed < 200; seed++) {
      const r = sold({ seed });
      const pick = (r.state.parley as Extract<Parley, { stage: 'buying' }>).offers[0]!;
      const h = say(r.state, 'haggle', pick.good);
      if (event(h, 'nativeHaggle').success) {
        cheaper++;
        const now = (h.state.parley as Extract<Parley, { stage: 'buying' }>).offers.find((o) => o.good === pick.good)!;
        expect(now.price).toBe(Math.max(10, pick.price - Math.max(1, Math.trunc(pick.price / 4))));
      } else {
        soured++;
        expect(h.state.parley).toBeNull();
        expect(h.state.settlements['v']?.haggleMemory).toBe('noSale');
      }
    }
    expect(cheaper).toBeGreaterThan(100);
    expect(soured).toBeGreaterThan(5);
    const sour = say(offer(land({ cargo: { rum: 100 }, village: { haggleMemory: 'noSale' } }), 'rum').state, 'accept');
    expect(sour.state.settlements['v']?.haggleMemory).toBeNull(); // a sale clears the memory...
    expect(event(sour, 'nativeWares').offers.length).toBeGreaterThan(0); // ...so they sell again
  });

  it('nothing is offered when the lot was too small to match, and the talks end', () => {
    const tiny = say(offer(land({ cargo: { cloth: 3 }, ship: true }), 'cloth').state, 'accept');
    expect(event(tiny, 'nativeWares')).toMatchObject({ amount: 0, offers: [] });
    expect(tiny.state.parley).toBeNull();
  });
});

describe('a hostile village', () => {
  it('may destroy the carrier, turn it away, or let it trade', () => {
    const seen: Record<string, number> = {};
    for (let seed = 0; seed < 1000; seed++) {
      const s = land({ seed, cargo: { cloth: 100 }, record: { alarm: { a: 100 } } });
      const r = offer(s, 'cloth', 'enterHostile');
      const e = event(r, 'hostileEntry');
      seen[e.outcome] = (seen[e.outcome] ?? 0) + 1;
      if (e.outcome === 'destroyed') {
        expect(r.state.units['w']).toBeUndefined();
        expect(e.lost).toEqual({ cloth: 100 });
      } else if (e.outcome === 'turnedAway') {
        expect(r.state.units['w']).toMatchObject({ movesLeft: 0, cargo: { cloth: 100 } });
        expect(r.state.parley).toBeNull();
      } else expect(r.state.parley).toMatchObject({ stage: 'selling', good: 'cloth' });
    }
    expect(seen['destroyed']! / 1000).toBeCloseTo(101 / 501, 1);
    expect(seen['turnedAway']! / 1000).toBeCloseTo(100 / 501, 1);
    expect(seen['admitted']! / 1000).toBeCloseTo(300 / 501, 1);
  });

  it('is the only way in once the tribe is at war', () => {
    const s = land({ cargo: { cloth: 100 }, record: { alarm: { a: 80 } } });
    expect(code(s, { type: 'enterSettlement', unitId: 'w', settlementId: 'v', action: 'trade', good: 'cloth' })).toBe('notAllowed');
    expect(code(s, { type: 'enterSettlement', unitId: 'w', settlementId: 'v', action: 'enterHostile', good: 'cloth' })).toBe('ok');
  });
});

describe('the tribe\'s memory of trade', () => {
  it('fades by tech + 1 a turn toward nothing', () => {
    const s = land({ record: { stock: { cloth: 100, furs: -3, rum: 1 } } });
    const faded = fadeTradeMemory(s);
    expect(faded.tribes.cherokee?.stock).toEqual({ cloth: 98, furs: -1 });
    expect(fadeTradeMemory(fadeTradeMemory(faded)).tribes.cherokee?.stock).toEqual({ cloth: 94 });
    const idle = land();
    expect(fadeTradeMemory(idle)).toBe(idle);
  });
});
