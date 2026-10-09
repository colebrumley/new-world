import { describe, expect, it } from 'vitest';
import { STARTING_GOLD } from '../../../src/engine/data/europe';
import { createGame } from '../../../src/engine/game';
import { recruitPrice } from '../../../src/engine/immigration';
import { askPrice, bidPrice } from '../../../src/engine/market';
import { OFF_MAP, type GameState, type Unit } from '../../../src/engine/state';
import { dockOptions, europeView } from '../../../src/ui/europe-model';
import { withUnit, world } from '../../helpers/world';

const ROWS = ['~~~~~~~sss', '~~..~~~sss', '~~..~~~sss', '~~~~~~~sss'];
const voyage = (phase: 'inEurope' | 'toEurope' | 'toNewWorld', turnsLeft: number) => ({ phase, turnsLeft, origin: [7, 1] } as const);

function port(): GameState {
  let s = world({ rows: ROWS, players: [{ id: 'a' }, { id: 'b' }] });
  s = { ...s, players: s.players.map((p) => (p.id === 'a' ? { ...p, gold: 900, taxRate: 7, boycotts: ['rum' as const] } : p)) };
  const off = { x: OFF_MAP, y: OFF_MAP };
  s = withUnit(s, { id: 'ship', type: 'merchantman', ...off, cargo: { furs: 100, tools: 30 } });
  s = withUnit(s, { id: 'in', type: 'caravel', ...off });
  s = withUnit(s, { id: 'out', type: 'galleon', ...off });
  s = withUnit(s, { id: 'rider', ...off, aboard: 'ship' });
  s = withUnit(s, { id: 'man', ...off, orders: 'sentry' });
  s = withUnit(s, { id: 'idler', type: 'soldier', profession: 'veteranSoldier', ...off });
  s = withUnit(s, { id: 'theirs', owner: 'b', type: 'caravel', ...off });
  const set = (id: string, v: Unit['voyage']): void => {
    s = { ...s, units: { ...s.units, [id]: { ...(s.units[id] as Unit), voyage: v } } };
  };
  for (const id of ['ship', 'rider', 'man', 'idler', 'theirs']) set(id, voyage('inEurope', 0));
  set('in', voyage('toEurope', 2));
  set('out', voyage('toNewWorld', 1));
  return s;
}

describe('europeView', () => {
  it('sorts ships into the two sea lanes and the harbour, and lists who waits on the docks', () => {
    const s = port();
    const v = europeView(s, 'a')!;
    expect(v).toMatchObject({ port: 'London', gold: 900, taxRate: 7 });
    expect(v.expected).toEqual([{ id: 'in', label: 'Caravel', turns: 2 }]);
    expect(v.outbound).toEqual([{ id: 'out', label: 'Galleon', turns: 1 }]);
    expect(v.inPort).toHaveLength(1);
    expect(v.inPort[0]).toMatchObject({ id: 'ship', label: 'Merchantman', holds: 4, used: 3, passengers: [{ id: 'rider', label: 'Free Colonist' }] });
    expect(v.inPort[0]?.cargo.map((c) => [c.good, c.amount])).toEqual([['furs', 100], ['tools', 30]]);
    expect(v.docks.map((d) => [d.id, d.boarding])).toEqual([['man', true], ['idler', false]]);
    expect(europeView(s, 'nobody')).toBeNull();
  });

  it('quotes bid and ask for all sixteen goods and marks the boycotted', () => {
    const s = port();
    const v = europeView(s, 'a')!;
    expect(v.prices).toHaveLength(16);
    for (const p of v.prices) expect([p.bid, p.ask]).toEqual([bidPrice(s, 'a', p.good), askPrice(s, 'a', p.good)]);
    expect(v.prices.filter((p) => p.boycotted).map((p) => p.good)).toEqual(['rum']);
  });

  it('lists what can be trained, cheapest first, and what can be bought', () => {
    const v = europeView(port(), 'a')!;
    expect(v.pool).toEqual([{ slot: 0, label: 'Indentured Servant' }, { slot: 1, label: 'Free Colonist' }, { slot: 2, label: 'Expert Farmer' }]);
    expect(v.recruitPrice).toBe(recruitPrice(port(), 'a'));
    expect(v.train).toHaveLength(17);
    expect(v.train[0]?.price).toBeLessThanOrEqual(v.train[16]?.price ?? 0);
    expect(v.purchase.map((p) => [p.unit, p.price])).toEqual([['artillery', 500], ['caravel', 1000], ['merchantman', 2000], ['galleon', 3000], ['privateer', 2000], ['frigate', 5000]]);
  });
});

describe('dockOptions', () => {
  it('offers each affordable change of kit with its price, and money back for selling', () => {
    const s = port();
    const tools = 100 * askPrice(s, 'a', 'tools');
    const roles = dockOptions(s, 'man');
    expect(roles.find((r) => r.role === 'pioneer')).toEqual({ role: 'pioneer', label: `Equip with tools (${tools} gold)`, cost: tools });
    expect(roles.find((r) => r.role === 'missionary')?.label).toBe('Bless as a missionary');
    expect(roles.some((r) => r.role === 'colonist')).toBe(false);
    const back = dockOptions(s, 'idler').find((r) => r.role === 'colonist');
    expect(back).toEqual({ role: 'colonist', label: `Sell the equipment (+${50 * bidPrice(s, 'a', 'muskets')} gold)`, cost: -50 * bidPrice(s, 'a', 'muskets') });
    expect(dockOptions(s, 'ship')).toEqual([]);
  });
});

describe('starting treasury', () => {
  it('depends on the difficulty for a human and is nothing for the others', () => {
    expect(STARTING_GOLD).toEqual({ discoverer: 1000, explorer: 300, conquistador: 0, governor: 0, viceroy: 0 });
    const players = [{ id: 'h', name: 'H', kind: 'human' }, { id: 'c', name: 'C', kind: 'ai' }] as const;
    expect(createGame({ seed: 1, players, difficulty: 'discoverer' }).players.map((p) => p.gold)).toEqual([1000, 0]);
    expect(createGame({ seed: 1, players, difficulty: 'explorer' }).players.map((p) => p.gold)).toEqual([300, 0]);
    expect(createGame({ seed: 1, players }).players.map((p) => p.gold)).toEqual([0, 0]);
  });
});
