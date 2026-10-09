import { describe, expect, it } from 'vitest';
import { applyAction, validateAction, type Action } from '../../../src/engine/actions';
import { PROFESSION_IDS, PROFESSIONS } from '../../../src/engine/data/professions';
import { dockEquipPlan, docksOf, purchasePrice, shipsInEurope, trainingPrice } from '../../../src/engine/europe';
import { askPrice, bidPrice } from '../../../src/engine/market';
import { checkInvariants } from '../../../src/engine/invariants';
import { OFF_MAP, type GameState, type Unit } from '../../../src/engine/state';
import { withUnit, world } from '../../helpers/world';

const ROWS = ['~~~~~~~sss', '~~..~~~sss', '~~..~~~sss', '~~~~~~~sss'];
const DOCKED = { phase: 'inEurope', turnsLeft: 0, origin: [7, 1] } as const;
function europe(gold = 10000, atWar = false): GameState {
  const s = world({ rows: ROWS, players: [{ id: 'a', atWar }, { id: 'b' }] });
  const rich = { ...s, players: s.players.map((p) => (p.id === 'a' ? { ...p, gold, entry: [7, 1] as const } : p)) };
  const withShip = withUnit(rich, { id: 'ship', type: 'caravel', x: OFF_MAP, y: OFF_MAP });
  return { ...withShip, units: { ship: { ...(withShip.units['ship'] as Unit), voyage: DOCKED } } };
}
const u = (s: GameState, id: string): Unit => s.units[id] as Unit;
const code = (s: GameState, a: Action): string => {
  const v = validateAction(s, a);
  return v.ok ? 'ok' : v.error.code;
};
const act = (s: GameState, a: Action): GameState => {
  const next = applyAction(s, a).state;
  expect(checkInvariants(next)).toEqual([]);
  return next;
};
const newest = (s: GameState): Unit => Object.values(s.units).at(-1) as Unit;
const round = (s: GameState): GameState => act(act(s, { type: 'endTurn' }), { type: 'endTurn' });

describe('Royal University', () => {
  it('sells the specialists that have a price, at that price, and delivers them to the docks', () => {
    expect(trainingPrice('expertFarmer')).toBe(1100);
    expect(trainingPrice('elderStatesman')).toBe(1900);
    expect(trainingPrice('veteranSoldier')).toBe(2000);
    expect(PROFESSION_IDS.filter((p) => trainingPrice(p) !== null)).toHaveLength(17);
    const r = applyAction(europe(), { type: 'trainUnit', profession: 'expertOreMiner' });
    const miner = newest(r.state);
    expect(miner).toMatchObject({ type: 'colonist', profession: 'expertOreMiner', owner: 'a', x: OFF_MAP, aboard: null, orders: 'sentry' });
    expect(miner.voyage).toEqual(DOCKED);
    expect(r.state.players[0]?.gold).toBe(10000 - PROFESSIONS.expertOreMiner.europePrice!);
    expect(r.events).toEqual([{ type: 'unitTrained', unitId: miner.id, profession: 'expertOreMiner', price: 600 }]);
    expect(docksOf(r.state, 'a').map((x) => x.id)).toEqual([miner.id]);
  });

  it('refuses what it does not teach, and anything the treasury cannot cover', () => {
    for (const p of ['masterSugarPlanter', 'expertFurTrapper', 'seasonedScout', 'freeColonist', 'indianConvert', 'expertTeacher'] as const) {
      expect(code(europe(), { type: 'trainUnit', profession: p }), p).toBe('notForSale');
    }
    expect(code(europe(1099), { type: 'trainUnit', profession: 'expertFarmer' })).toBe('cannotAfford');
    expect(code(europe(1100), { type: 'trainUnit', profession: 'expertFarmer' })).toBe('ok');
    expect(code(europe(), { type: 'trainUnit', profession: 'wizard' as 'expertFarmer' })).toBe('notForSale');
  });
});

describe('purchasing', () => {
  it('ships lie in port and artillery waits on the docks', () => {
    let s = act(europe(), { type: 'purchaseUnit', unit: 'merchantman' });
    expect(newest(s)).toMatchObject({ type: 'merchantman', profession: null, orders: 'none' });
    expect(s.players[0]?.gold).toBe(8000);
    expect(shipsInEurope(s, 'a').map((x) => x.type)).toEqual(['caravel', 'merchantman']);
    s = act(s, { type: 'purchaseUnit', unit: 'artillery' });
    expect(docksOf(s, 'a').map((x) => x.type)).toEqual(['artillery']);
  });

  it('artillery costs 100 more with each one bought; ship prices stay put', () => {
    let s = europe(100000);
    expect(purchasePrice(s, 'a', 'artillery')).toBe(500);
    s = act(s, { type: 'purchaseUnit', unit: 'artillery' });
    expect(purchasePrice(s, 'a', 'artillery')).toBe(600);
    s = act(s, { type: 'purchaseUnit', unit: 'artillery' });
    expect(s.players[0]?.gold).toBe(100000 - 500 - 600);
    expect(purchasePrice(s, 'a', 'artillery')).toBe(700);
    expect(purchasePrice(s, 'b', 'artillery')).toBe(500);
    s = act(s, { type: 'purchaseUnit', unit: 'caravel' });
    expect(purchasePrice(s, 'a', 'caravel')).toBe(1000);
    expect([purchasePrice(s, 'a', 'galleon'), purchasePrice(s, 'a', 'privateer'), purchasePrice(s, 'a', 'frigate')]).toEqual([3000, 2000, 5000]);
  });

  it('refuses what is not sold and what cannot be afforded', () => {
    for (const t of ['manOWar', 'wagonTrain', 'colonist', 'regular', 'treasure'] as const) expect(code(europe(), { type: 'purchaseUnit', unit: t }), t).toBe('notForSale');
    expect(code(europe(4999), { type: 'purchaseUnit', unit: 'frigate' })).toBe('cannotAfford');
    expect(code(europe(), { type: 'purchaseUnit', unit: 'zeppelin' as 'frigate' })).toBe('notForSale');
  });

  it('Europe is closed to a power at war for its independence', () => {
    expect(code(europe(10000, true), { type: 'purchaseUnit', unit: 'caravel' })).toBe('europeClosed');
    expect(code(europe(10000, true), { type: 'trainUnit', profession: 'expertFarmer' })).toBe('europeClosed');
  });
});

describe('the docks', () => {
  const trained = (n: number): GameState => {
    let s = europe(100000);
    for (let i = 0; i < n; i++) s = act(s, { type: 'trainUnit', profession: 'expertFarmer' });
    return s;
  };
  const ids = (s: GameState): string[] => docksOf(s, 'a').map((x) => x.id);

  it('people board a ship in port and step off again', () => {
    let s = trained(1);
    const [who] = ids(s) as [string];
    s = act(s, { type: 'boardInEurope', unitId: who, shipId: 'ship' });
    expect(u(s, who)).toMatchObject({ aboard: 'ship', orders: 'sentry' });
    expect(ids(s)).toEqual([]);
    expect(code(s, { type: 'boardInEurope', unitId: who, shipId: 'ship' })).toBe('notOnDocks');
    s = act(s, { type: 'landInEurope', unitId: who });
    expect(u(s, who)).toMatchObject({ aboard: null, orders: 'none' }); // stays behind unless told otherwise
    expect(code(s, { type: 'landInEurope', unitId: who })).toBe('notInEurope');
  });

  it('a caravel takes two and no more; a ship not in port takes nobody', () => {
    let s = trained(3);
    const [a, b, c] = ids(s) as [string, string, string];
    s = act(act(s, { type: 'boardInEurope', unitId: a, shipId: 'ship' }), { type: 'boardInEurope', unitId: b, shipId: 'ship' });
    expect(code(s, { type: 'boardInEurope', unitId: c, shipId: 'ship' })).toBe('shipFull');
    expect(code(s, { type: 'boardInEurope', unitId: c, shipId: 'nope' })).toBe('notInEurope');
    const atSea = withUnit(s, { id: 'far', type: 'caravel', x: 7, y: 2 });
    expect(code(atSea, { type: 'boardInEurope', unitId: c, shipId: 'far' })).toBe('notInEurope');
  });

  it('those waiting board the next ship to sail, in order, while there is room; the rest stay', () => {
    let s = trained(3);
    const [a, b, c] = ids(s) as [string, string, string];
    s = act(s, { type: 'setBoarding', unitId: a, board: false });
    expect(u(s, a).orders).toBe('none');
    const r = applyAction(s, { type: 'sailFromEurope', unitId: 'ship' });
    expect(r.events.filter((e) => e.type === 'boardedInEurope').map((e) => (e as { unitId: string }).unitId)).toEqual([b, c]);
    expect(u(r.state, a).voyage?.phase).toBe('inEurope');
    expect(u(r.state, b)).toMatchObject({ aboard: 'ship' });
    expect(u(r.state, b).voyage?.phase).toBe('toNewWorld');
    expect(checkInvariants(r.state)).toEqual([]);
    // two turns later they are in the New World, at the square the power's ships use
    const arrived = round(round(r.state));
    expect(u(arrived, b)).toMatchObject({ x: 7, y: 1, voyage: null, aboard: 'ship' });
    expect(u(arrived, a).voyage?.phase).toBe('inEurope');
    expect(code(arrived, { type: 'setBoarding', unitId: b, board: true })).toBe('notOnDocks');
  });

  it('a ship bought in Europe sails out to where the power last left the New World', () => {
    let s = act(europe(), { type: 'purchaseUnit', unit: 'caravel' });
    const bought = newest(s);
    s = round(round(act(s, { type: 'sailFromEurope', unitId: bought.id })));
    expect(u(s, bought.id)).toMatchObject({ x: 7, y: 1, voyage: null });
    // and that square follows the latest departure
    const out = act(withUnit(europe(), { id: 'second', type: 'caravel', x: 7, y: 2 }), { type: 'moveUnit', unitId: 'second', dx: 1, dy: 0, sail: true });
    expect(out.players[0]?.entry).toEqual([7, 2]);
  });
});

describe('fitting out on the docks', () => {
  const docked = (gold = 10000, type: Unit['type'] = 'colonist'): GameState => {
    const s = withUnit(europe(gold), { id: 'man', type, profession: 'freeColonist', x: OFF_MAP, y: OFF_MAP });
    return { ...s, units: { ...s.units, man: { ...u(s, 'man'), voyage: DOCKED, tools: type === 'pioneer' ? 100 : 0 } } };
  };

  it('charges the asking price for 50 muskets, 50 horses or 100 tools, untaxed', () => {
    const s = docked();
    expect(dockEquipPlan(s, u(s, 'man'), 'soldier')).toEqual({ changes: [{ good: 'muskets', amount: 50 }], cost: 50 * askPrice(s, 'a', 'muskets') });
    expect(dockEquipPlan(s, u(s, 'man'), 'dragoon').cost).toBe(50 * askPrice(s, 'a', 'muskets') + 50 * askPrice(s, 'a', 'horses'));
    expect(dockEquipPlan(s, u(s, 'man'), 'missionary')).toEqual({ changes: [], cost: 0 });
    const r = applyAction(s, { type: 'equipInEurope', unitId: 'man', role: 'pioneer' });
    const cost = 100 * askPrice(s, 'a', 'tools');
    expect(u(r.state, 'man')).toMatchObject({ type: 'pioneer', tools: 100, profession: 'freeColonist' });
    expect(r.state.players[0]?.gold).toBe(10000 - cost);
    expect(r.events).toEqual([{ type: 'equippedInEurope', unitId: 'man', role: 'pioneer', cost }]);
    expect(checkInvariants(r.state)).toEqual([]);
  });

  it('buys the kit back at the bid with no tax taken', () => {
    const base = docked(0, 'pioneer');
    const s = { ...base, players: base.players.map((p) => (p.id === 'a' ? { ...p, taxRate: 50 } : p)) };
    const r = act(s, { type: 'equipInEurope', unitId: 'man', role: 'colonist' });
    expect(r.players[0]?.gold).toBe(100 * bidPrice(s, 'a', 'tools'));
    expect(u(r, 'man')).toMatchObject({ type: 'colonist', tools: 0 });
  });

  it('refuses the unaffordable, the boycotted, the pointless and anyone not on the docks', () => {
    const s = docked(10);
    expect(code(s, { type: 'equipInEurope', unitId: 'man', role: 'soldier' })).toBe('cannotAfford');
    expect(code(s, { type: 'equipInEurope', unitId: 'man', role: 'missionary' })).toBe('ok');
    expect(code(s, { type: 'equipInEurope', unitId: 'man', role: 'colonist' })).toBe('cannotEquip');
    expect(code(s, { type: 'equipInEurope', unitId: 'ship', role: 'soldier' })).not.toBe('ok');
    const rich = docked();
    const banned = { ...rich, players: rich.players.map((p) => (p.id === 'a' ? { ...p, boycotts: ['muskets' as const] } : p)) };
    expect(code(banned, { type: 'equipInEurope', unitId: 'man', role: 'soldier' })).toBe('boycotted');
    expect(code(banned, { type: 'equipInEurope', unitId: 'man', role: 'scout' })).toBe('ok');
  });
});
