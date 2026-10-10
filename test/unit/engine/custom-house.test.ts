import { describe, expect, it } from 'vitest';
import { applyAction, validateAction, type Action, type GameEvent } from '../../../src/engine/actions';
import { customHouseSales, isBlockaded, type CustomHouseEvent } from '../../../src/engine/custom-house';
import { CUSTOM_HOUSE } from '../../../src/engine/data/custom-house';
import type { GoodId } from '../../../src/engine/data/goods';
import { checkInvariants } from '../../../src/engine/invariants';
import { bidPrice, priceLevel } from '../../../src/engine/market';
import type { Colony, GameState, Goods } from '../../../src/engine/state';
import { withColony, withUnit, world } from '../../helpers/world';

const ROWS = ['~~~~~~~~~~', '~~..~~~~~~', '~~..~~~~~~', '~~~~~~~~~~', '~~~~~~~~~~', '~~~~~~~~~~', '~~~~~~~~~~', '~~~~~~~~~~'];

function port(goods: Goods, exports: readonly GoodId[], opts: { tax?: number; atWar?: boolean; kind?: 'human' | 'ai'; house?: boolean; boycotts?: GoodId[] } = {}): GameState {
  const s = world({ rows: ROWS, players: [{ id: 'a', kind: opts.kind ?? 'human', atWar: opts.atWar ?? false }, { id: 'b' }] });
  const taxed = { ...s, players: s.players.map((p) => (p.id === 'a' ? { ...p, gold: 0, taxRate: opts.tax ?? 0, boycotts: opts.boycotts ?? [] } : p)) };
  const built = withColony(taxed, { id: 'col', x: 2, y: 1, name: 'Port', goods, buildings: opts.house === false ? [] : ['customHouse'] });
  return { ...built, colonies: { col: { ...(built.colonies['col'] as Colony), exports } } };
}
const sell = (s: GameState): { state: GameState; events: CustomHouseEvent[] } => {
  const events: CustomHouseEvent[] = [];
  return { state: customHouseSales(s, 'col', events), events };
};
const stock = (s: GameState, good: GoodId): number => s.colonies['col']?.goods[good] ?? 0;
const gold = (s: GameState): number => s.players[0]?.gold ?? 0;
const code = (s: GameState, a: Action): string => {
  const v = validateAction(s, a);
  return v.ok ? 'ok' : v.error.code;
};

describe('Custom House data', () => {
  it('matches the snapshot', () => {
    expect(CUSTOM_HOUSE).toMatchInlineSnapshot(`
      {
        "blockadeRadius": 5,
        "building": "customHouse",
        "keep": 50,
        "sellAt": 100,
      }
    `);
  });
});

describe('export list', () => {
  it('is set good by good, kept in goods order, and needs the building', () => {
    let s = port({}, []);
    const r = applyAction(s, { type: 'setExport', colonyId: 'col', good: 'rum', on: true });
    expect(r.events).toEqual([{ type: 'exportSet', colonyId: 'col', good: 'rum', on: true }]);
    s = applyAction(r.state, { type: 'setExport', colonyId: 'col', good: 'furs', on: true }).state;
    expect(s.colonies['col']?.exports).toEqual(['furs', 'rum']);
    expect(checkInvariants(s)).toEqual([]);
    const again = applyAction(s, { type: 'setExport', colonyId: 'col', good: 'furs', on: true });
    expect(again.events).toEqual([]);
    s = applyAction(s, { type: 'setExport', colonyId: 'col', good: 'furs', on: false }).state;
    expect(s.colonies['col']?.exports).toEqual(['rum']);
    expect(code(port({}, [], { house: false }), { type: 'setExport', colonyId: 'col', good: 'rum', on: true })).toBe('noCustomHouse');
    expect(code(s, { type: 'setExport', colonyId: 'nowhere', good: 'rum', on: true })).toBe('noColony');
    expect(code(s, { type: 'setExport', colonyId: 'col', good: 'gems' as GoodId, on: true })).toBe('noSuchGood');
  });
});

describe('sales', () => {
  it('sells a flagged good down to 50 once there are 100, at the bid less tax', () => {
    const s = port({ furs: 130, rum: 99, cloth: 100, ore: 300 }, ['furs', 'rum', 'cloth'], { tax: 20 });
    const { state, events } = sell(s);
    expect([stock(state, 'furs'), stock(state, 'rum'), stock(state, 'cloth'), stock(state, 'ore')]).toEqual([50, 99, 50, 300]);
    const furs = 80 * bidPrice(s, 'a', 'furs');
    const cloth = 50 * bidPrice(s, 'a', 'cloth');
    const tax = (g: number): number => Math.trunc((g * 20) / 100);
    expect(events).toEqual([
      { type: 'customHouseSold', colonyId: 'col', player: 'a', good: 'furs', amount: 80, gross: furs, tax: tax(furs), net: furs - tax(furs) },
      { type: 'customHouseSold', colonyId: 'col', player: 'a', good: 'cloth', amount: 50, gross: cloth, tax: tax(cloth), net: cloth - tax(cloth) },
    ]);
    expect(gold(state)).toBe(furs - tax(furs) + cloth - tax(cloth));
    expect(checkInvariants(state)).toEqual([]);
  });

  it('moves the market: the traffic is recorded but the price waits for the next evaluation', () => {
    const s = port({ furs: 250 }, ['furs']);
    const { state } = sell(s);
    expect(bidPrice(state, 'a', 'furs')).toBe(bidPrice(s, 'a', 'furs'));
    expect(state.market).not.toEqual(s.market);
  });

  it('does nothing without the building or the flag', () => {
    expect(sell(port({ furs: 200 }, ['furs'], { house: false })).events).toEqual([]);
    const idle = port({ furs: 200 }, []);
    expect(sell(idle).state).toBe(idle);
  });

  it('a computer power\'s colony sells what it has no room for, where it lies, at the price level and untaxed; with a Custom House it exports its set list too', () => {
    const ai = port({ furs: 120, food: 300, cloth: 100, lumber: 130 }, [], { kind: 'ai', house: false });
    const sold = sell(ai);
    // furs and lumber down to the warehouse's hundred; cloth is not over; never its food
    expect(stock(sold.state, 'furs')).toBe(100);
    expect(stock(sold.state, 'lumber')).toBe(100);
    expect(stock(sold.state, 'cloth')).toBe(100);
    expect(stock(sold.state, 'food')).toBe(300);
    expect(sold.events).toEqual([
      { type: 'customHouseSold', colonyId: 'col', player: 'a', good: 'furs', amount: 20, gross: 20 * priceLevel(ai, 'a', 'furs'), tax: 0, net: 20 * priceLevel(ai, 'a', 'furs') },
      { type: 'customHouseSold', colonyId: 'col', player: 'a', good: 'lumber', amount: 30, gross: 30 * priceLevel(ai, 'a', 'lumber'), tax: 0, net: 30 * priceLevel(ai, 'a', 'lumber') },
    ]);
    expect(gold(sold.state)).toBe(20 * priceLevel(ai, 'a', 'furs') + 30 * priceLevel(ai, 'a', 'lumber'));
    // a human's colony without a Custom House sells nothing
    expect(sell(port({ furs: 120 }, [], { kind: 'human', house: false })).state.players[0]?.gold).toBe(0);
    // with the building, the list goes down to the usual fifty
    const housed = sell(port({ furs: 120 }, [], { kind: 'ai' }));
    expect(stock(housed.state, 'furs')).toBe(CUSTOM_HOUSE.keep);
    // it sells every good but food, lumber, horses, tools and muskets, whatever flags are set; ore only while it works none of it
    const all = sell(port({ food: 150, lumber: 100, horses: 100, tools: 100, muskets: 100, sugar: 100, tradeGoods: 100, ore: 100 }, [], { kind: 'ai' }));
    expect(['food', 'lumber', 'horses', 'tools', 'muskets', 'sugar', 'tradeGoods', 'ore'].map((g) => stock(all.state, g as GoodId))).toEqual([150, 100, 100, 100, 100, 50, 50, 50]);
    const smithy = port({ ore: 100 }, [], { kind: 'ai' });
    const armed = { ...smithy, colonies: { col: { ...smithy.colonies['col']!, buildings: [...smithy.colonies['col']!.buildings, 'armory'] } } };
    expect(stock(sell(armed).state, 'ore')).toBe(100);
  });

  it('muskets beyond its room go to the power\'s reserve in Europe by the fifty, and horses singly', () => {
    const { state, events } = sell(port({ muskets: 230, horses: 107 }, [], { kind: 'ai', house: false }));
    expect(stock(state, 'muskets')).toBe(100);
    expect(stock(state, 'horses')).toBe(100);
    expect(state.players[0]?.reserve).toEqual({ muskets: 2, horses: 7 });
    expect(events.filter((e) => e.type === 'reserveStocked')).toEqual([
      { type: 'reserveStocked', colonyId: 'col', player: 'a', good: 'horses', amount: 7 },
      { type: 'reserveStocked', colonyId: 'col', player: 'a', good: 'muskets', amount: 100 },
    ]);
    // the odd thirty muskets are sold
    expect(events.filter((e) => e.type === 'customHouseSold')).toMatchObject([{ good: 'muskets', amount: 30 }]);
  });

  it('ignores boycotts', () => {
    const { state, events } = sell(port({ furs: 200 }, ['furs'], { boycotts: ['furs'] }));
    expect(events).toHaveLength(1);
    expect(stock(state, 'furs')).toBe(50);
  });

  it('pays the whole price once independence is declared', () => {
    const s = port({ furs: 150 }, ['furs'], { tax: 40, atWar: true });
    const { state, events } = sell(s);
    expect(events[0]).toMatchObject({ amount: 100, tax: 0, net: 100 * bidPrice(s, 'a', 'furs') });
    expect(gold(state)).toBe(100 * bidPrice(s, 'a', 'furs'));
  });

  it('happens during the colony turn, before the warehouse is trimmed', () => {
    const s = port({ furs: 180 }, ['furs']);
    const r = applyAction(applyAction(s, { type: 'endTurn' }).state, { type: 'endTurn' });
    const all: GameEvent[] = [...applyAction(s, { type: 'endTurn' }).events, ...r.events];
    expect(all.filter((e) => e.type === 'customHouseSold')).toHaveLength(1);
    expect(all.some((e) => e.type === 'goodsSpoiled')).toBe(false);
    expect(stock(r.state, 'furs')).toBe(50);
  });
});

describe('blockade', () => {
  const ship = (s: GameState, type: 'frigate' | 'caravel', owner: string, x: number, y: number): GameState => withUnit(s, { id: 'w', type, owner, x, y });
  it('a foreign warship within five squares stops a human power selling', () => {
    const s = port({ furs: 200 }, ['furs']);
    const near = ship(s, 'frigate', 'b', 7, 6);
    expect(isBlockaded(near, near.colonies['col'] as Colony)).toBe(true);
    expect(sell(near).events).toEqual([]);
    expect(stock(sell(near).state, 'furs')).toBe(200);
    for (const clear of [ship(s, 'frigate', 'b', 8, 6), ship(s, 'frigate', 'b', 7, 7), ship(s, 'caravel', 'b', 4, 1), ship(s, 'frigate', 'a', 4, 1)]) {
      expect(isBlockaded(clear, clear.colonies['col'] as Colony)).toBe(false);
    }
  });

  it('does not trouble a computer power', () => {
    const s = ship(port({ furs: 200 }, ['furs'], { kind: 'ai' }), 'frigate', 'b', 4, 1);
    expect(sell(s).events.length).toBeGreaterThan(0);
  });
});

