import { describe, expect, it } from 'vitest';
import { cargoPort, colonyAsks, powerWants } from '../../../src/ai/supply';
import { playTurn } from '../../../src/ai/european';
import { AI_DOCKS, AI_SUPPLY } from '../../../src/engine/data/ai';
import { applyAction, validateAction } from '../../../src/engine/actions';
import { dockEquipPlan, purchasePrice } from '../../../src/engine/europe';
import { recruitPrice } from '../../../src/engine/immigration';
import { checkInvariants } from '../../../src/engine/invariants';
import { bidPrice } from '../../../src/engine/market';
import { OFF_MAP, type Colonist, type Colony, type GameState, type Player, type Unit } from '../../../src/engine/state';
import { policy } from '../../helpers/policy';
import { withColony, withUnit, world } from '../../helpers/world';

// a mainland with a west shore; hills inland (no ground a plow can better without a road)
const ROWS = Array.from({ length: 9 }, (_, y) => (y === 0 || y === 8 ? 's' + '~'.repeat(13) : `s~~${'.'.repeat(10)}~`));
const people = (n: number, p: string): Colonist[] => Array.from({ length: n }, (_, i) => ({ id: `${p}${i}`, profession: 'freeColonist' as const, job: { kind: 'idle' as const }, turns: 0 }));
type Nation = 'england' | 'france' | 'spain' | 'netherlands';
const base = (nation: Nation = 'england', turn = 20): GameState => ({ ...world({ rows: ROWS, players: [{ id: 'a', kind: 'ai', nation }, { id: 'b', kind: 'ai', nation: 'france' }] }), turn });
const me = (s: GameState): Player => s.players[0] as Player;
const c = (s: GameState, id: string): Colony => s.colonies[id] as Colony;
const u = (s: GameState, id: string): Unit => s.units[id] as Unit;
const col = (s: GameState, id: string, y: number, pop: number, goods: Colony['goods'] = {}): GameState =>
  withColony(s, { id, x: 3, y, colonists: people(pop, `${id}-`), goods, construction: { kind: 'building', id: 'stockade' } });
const asks = (s: GameState, id = 'home'): string | null => colonyAsks(s, c(s, id));
/** Everything a colony might ask for, in store. */
const FULL = { muskets: 100, horses: 50, tools: 20 };

describe('supply and docks rule tables', () => {
  it('match the snapshots', () => {
    expect(AI_SUPPLY).toMatchSnapshot();
    expect(AI_DOCKS).toMatchSnapshot();
  });
});

describe('what a colony asks to be sent', () => {
  it('nothing when it has muskets, horses and tools', () => {
    expect(asks(col(base(), 'home', 4, 1, FULL))).toBeNull();
  });

  it('muskets under fifty for each two, three or one by its leader\'s temper', () => {
    const of = (nation: Nation, muskets: number): string | null => asks(col(base(nation), 'home', 4, 1, { ...FULL, muskets }));
    expect(of('netherlands', 49)).toBe('muskets'); // peaceable: one lot
    expect(of('netherlands', 50)).toBeNull();
    expect(of('france', 99)).toBe('muskets');
    expect(of('france', 100)).toBeNull();
    // aggressive: three lots, but never more than the warehouse holds
    expect(of('england', 99)).toBe('muskets');
    expect(of('england', 100)).toBeNull();
  });

  it('horses while it has none to breed from, and tools under twenty while it has ground to improve: the later want is the one it voices', () => {
    expect(asks(col(base('france'), 'home', 4, 1, { ...FULL, horses: 1 }))).toBe('horses');
    expect(asks(col(base('france'), 'home', 4, 1, { ...FULL, horses: 49 }))).toBeNull(); // it breeds its own
    expect(asks(col(base('france'), 'home', 4, 1, { ...FULL, tools: 19 }))).toBe('tools');
    expect(asks(col(base('france'), 'home', 4, 1, { muskets: 60, horses: 0, tools: 0 }))).toBe('tools');
  });

  it('muskets it needs now, for a colony short of defenders, come before everything', () => {
    // five people want two defenders and have none
    expect(asks(col(base('france'), 'home', 4, 5, { muskets: 0, horses: 0, tools: 0 }))).toBe('muskets');
  });

  it('a power wants each good by its colonies asking, muskets twice over; and once more for every colony with no muskets, horses or tools', () => {
    let s = col(col(base('france'), 'home', 2, 1, { horses: 50, tools: 20 }), 'second', 6, 1, { ...FULL, horses: 0 });
    expect(powerWants(s, me(s))).toMatchObject({ muskets: 3, tools: 0, tradeGoods: 0, horses: 2, coats: 0 });
    s = col(s, 'third', 4, 1, FULL);
    expect(powerWants(s, me(s))).toMatchObject({ muskets: 3, tools: 0, tradeGoods: 0, horses: 2 });
  });
});

describe('where a ship takes her cargo', () => {
  it('to the port with most room for it, the one that asks for it before others, the nearer the better; never where she lies', () => {
    let s = col(col(base('france'), 'north', 2, 1, FULL), 'south', 6, 1, { horses: 50, tools: 20 });
    s = withUnit(s, { id: 'ship', type: 'caravel', profession: null, x: 2, y: 4, cargo: { muskets: 100 } });
    const ports = [c(s, 'north'), c(s, 'south')];
    expect(cargoPort(s, u(s, 'ship'), ports)?.id).toBe('south');
    const lying = withUnit(s, { id: 'ship', type: 'caravel', profession: null, x: 3, y: 6, cargo: { muskets: 100 } });
    expect(cargoPort(lying, u(lying, 'ship'), ports)?.id).toBe('north');
    // nothing of the kind aboard: nowhere
    const empty = withUnit(s, { id: 'ship', type: 'caravel', profession: null, x: 2, y: 4 });
    expect(cargoPort(empty, u(empty, 'ship'), ports)).toBeNull();
  });

  it('she sails there, and in port everything in her hold goes ashore', () => {
    let s = col(col(base('france'), 'north', 2, 1, FULL), 'south', 6, 1, { horses: 50, tools: 20 });
    s = withUnit(s, { id: 'ship', type: 'caravel', profession: null, x: 2, y: 4, cargo: { muskets: 100 } });
    expect(policy(s)).toEqual({ type: 'goTo', unitId: 'ship', x: 3, y: 6 });
    const there = withUnit(s, { id: 'ship', type: 'caravel', profession: null, x: 3, y: 6, cargo: { muskets: 100 } });
    expect(policy(there)).toEqual({ type: 'unloadCargo', unitId: 'ship', good: 'muskets', amount: 100 });
  });
});

describe('a warship with supplies aboard', () => {
  it('unloads in her own port before she takes up a station there', () => {
    // a foreign frigate three squares off makes the port a station, and our frigate is on it already
    let s = col(base('france'), 'home', 4, 1, FULL);
    s = withUnit(s, { id: 'ship', type: 'frigate', profession: null, x: 3, y: 4, cargo: { muskets: 100 } });
    s = withUnit(s, { id: 'foe', owner: 'b', type: 'frigate', profession: null, x: 1, y: 2 });
    expect(policy(s)).toEqual({ type: 'unloadCargo', unitId: 'ship', good: 'muskets', amount: 100 });
  });
});

describe('on the docks', () => {
  const inEurope = (s: GameState, id: string): GameState => ({ ...s, units: { ...s.units, [id]: { ...u(s, id), x: OFF_MAP, y: OFF_MAP, voyage: { phase: 'inEurope', turnsLeft: 0, origin: [0, 4] } } } });
  const docked = (turn: number, gold: number, goods: Colony['goods'] = { horses: 50, tools: 20 }): GameState => {
    const s = withUnit(col({ ...base('france'), turn }, 'home', 4, 1, goods), { id: 'ship', type: 'merchantman', profession: null, x: 0, y: 0 });
    return { ...inEurope(s, 'ship'), players: s.players.map((p) => (p.id === 'a' ? { ...p, gold } : p)) };
  };
  const bought = (s: GameState): string[] => playTurn(s).actions.flatMap((a) => (a.type === 'buyGoods' ? [a.good] : []));

  it('on a cargo turn (every third) a lot of each good is bought, muskets first, while gold and holds last, wanted or not; then every ship sails', () => {
    const turn = playTurn(docked(21, 5000));
    expect(turn.actions.flatMap((a) => (a.type === 'buyGoods' ? [`${a.good} ${a.amount}`] : []))).toEqual(['muskets 100', 'tools 100', 'tradeGoods 100', 'coats 100']);
    expect(turn.actions.some((a) => a.type === 'sailFromEurope')).toBe(true);
    expect(checkInvariants(turn.state)).toEqual([]);
    expect(turn.state.units['ship']?.cargo).toEqual({ muskets: 100, tools: 100, tradeGoods: 100, coats: 100 });
  });

  it('on other turns only what at least as many colonies want as there are people on the docks (one more on odd turns)', () => {
    // a missionary waits (nobody is recruited while the docks are not empty, and he is not fitted out)
    const waiting = (turn: number, goods?: Colony['goods']): GameState => inEurope(withUnit(docked(turn, 5000, goods), { id: 'w', type: 'missionary', x: 0, y: 0, orders: 'sentry' }), 'w');
    // the colony has no muskets: that counts three; nothing else is wanted
    expect(bought(waiting(22))).toEqual(['muskets']);
    expect(bought(waiting(23))).toEqual(['muskets']);
    expect(bought(waiting(22, FULL))).toEqual([]);
    // and he sails with them
    expect(playTurn(waiting(22)).state.units['w']?.aboard).toBe('ship');
  });

  it('nothing without the gold, and nothing by a power whose fleet is too small for its people', () => {
    expect(bought(docked(21, 0))).toEqual([]);
    expect(bought(docked(21, 600)).length).toBeGreaterThan(0);
    const crowded = docked(21, 600);
    const many = { ...crowded, colonies: { home: { ...c(crowded, 'home'), colonists: people(20, 'm') } } };
    expect(bought(many)).toEqual([]);
  });
});

describe('the terms a computer power has in Europe', () => {
  const inEurope = (s: GameState, id: string): GameState => ({ ...s, units: { ...s.units, [id]: { ...u(s, id), x: OFF_MAP, y: OFF_MAP, voyage: { phase: 'inEurope', turnsLeft: 0, origin: [0, 4] } } } });
  const with_ = (s: GameState, change: Partial<Player>): GameState => ({ ...s, players: s.players.map((p) => (p.id === 'a' ? { ...p, ...change } : p)) });
  const human = (s: GameState): GameState => with_(s, { kind: 'human' });

  it('its fare falls with the level instead of rising, has no floor, and does not rise with each one paid', () => {
    const s = with_(base('france'), { gold: 5000, recruits: 3 });
    // conquistador is the third level (2): 20 x (3 - 2 + 7) against a human's 20 x (3 + 2 + 7)
    expect(recruitPrice(s, 'a')).toBe(160);
    expect(recruitPrice(human(s), 'a')).toBe(240);
    const after = applyAction(s, { type: 'recruit', slot: 0 }).state;
    expect(after.players[0]).toMatchObject({ gold: 5000 - 160, recruits: 3 });
    // with an armed man on the docks it is raising dragoons: by half the level, and from turn 100 a tenth off for each level
    const armed = inEurope(withUnit(s, { id: 'g', type: 'soldier', x: 0, y: 0 }), 'g');
    expect(recruitPrice(armed, 'a')).toBe(20 * (3 + 7 - 1));
    expect(recruitPrice({ ...armed, turn: 100 }, 'a')).toBe(180 - 36);
  });

  it('a man is armed from its reserve when that holds a kit, and bought for otherwise', () => {
    const s = inEurope(withUnit(with_(base('france'), { gold: 5000 }), { id: 'w', x: 0, y: 0 }), 'w');
    expect(dockEquipPlan(s, u(s, 'w'), 'soldier').cost).toBeGreaterThan(0);
    const stocked = with_(s, { reserve: { muskets: 1, horses: 49 } });
    expect(dockEquipPlan(stocked, u(stocked, 'w'), 'soldier')).toMatchObject({ cost: 0, changes: [], fromReserve: { muskets: 50, horses: 0 } });
    // a dragoon's horses are bought while the reserve has under fifty
    expect(dockEquipPlan(stocked, u(stocked, 'w'), 'dragoon')).toMatchObject({ changes: [{ good: 'horses', amount: 50 }], fromReserve: { muskets: 50, horses: 0 } });
    const armed = applyAction(stocked, { type: 'equipInEurope', unitId: 'w', role: 'soldier' }).state;
    expect(armed.units['w']?.type).toBe('soldier');
    expect(armed.players[0]).toMatchObject({ gold: 5000, reserve: { muskets: 0, horses: 49 } });
    // a human has no reserve to draw on
    expect(dockEquipPlan(human(stocked), u(stocked, 'w'), 'soldier').cost).toBeGreaterThan(0);
  });

  it('muskets and horses its ships bring home go to the reserve; the rest is sold untaxed', () => {
    const s0 = withUnit(with_(base('france'), { taxRate: 30 }), { id: 'ship', type: 'merchantman', profession: null, x: 0, y: 0, cargo: { muskets: 70, horses: 30, furs: 100 } });
    let s = inEurope(s0, 'ship');
    for (const [good, amount] of [['muskets', 70], ['horses', 30], ['furs', 100]] as const) s = applyAction(s, { type: 'sellGoods', unitId: 'ship', good, amount }).state;
    expect(s.players[0]?.reserve).toEqual({ muskets: 2, horses: 30 });
    expect(s.players[0]?.gold).toBe(100 * bidPrice(s0, 'a', 'furs'));
    expect(s.units['ship']?.cargo).toEqual({});
  });

  it('a colonist it makes a pioneer in a colony is given tools for one job', () => {
    const s = withUnit(col(base('france'), 'home', 4, 1), { id: 'x', x: 3, y: 4 });
    const made = applyAction(s, { type: 'equip', unitId: 'x', role: 'pioneer' }).state;
    expect(made.units['x']).toMatchObject({ type: 'pioneer', tools: 20 });
    expect(c(made, 'home').goods.tools ?? 0).toBe(0);
    expect(validateAction(human(s), { type: 'equip', unitId: 'x', role: 'pioneer' }).ok).toBe(false);
  });

  it('a skilled man it arms leaves his trade in the pool for an unskilled one\'s; with a college he may be a veteran', () => {
    const s = inEurope(withUnit(with_(base('france'), { gold: 5000, pool: ['expertFarmer', 'pettyCriminal', 'freeColonist'] }), { id: 'w', x: 0, y: 0, profession: 'masterBlacksmith' }), 'w');
    const armed = applyAction(s, { type: 'equipInEurope', unitId: 'w', role: 'soldier' }).state;
    expect(armed.units['w']).toMatchObject({ type: 'soldier', profession: 'pettyCriminal' });
    expect(armed.players[0]?.pool).toEqual(['expertFarmer', 'masterBlacksmith', 'freeColonist']);
    // with no unskilled man in the pool he is a free colonist and the trade is lost
    const none = applyAction(with_(s, { pool: ['expertFarmer', 'expertFisherman', 'masterCarpenter'] }), { type: 'equipInEurope', unitId: 'w', role: 'soldier' }).state;
    expect(none.units['w']?.profession).toBe('freeColonist');
    // a power with a college and no troops yet: the one chance in one comes up
    const schooled = withColony(s, { id: 'col', x: 3, y: 4, buildings: ['townHall', 'college'] });
    expect(applyAction(schooled, { type: 'equipInEurope', unitId: 'w', role: 'soldier' }).state.units['w']?.profession).toBe('veteranSoldier');
    // a human's recruit keeps his trade
    expect(applyAction(human(s), { type: 'equipInEurope', unitId: 'w', role: 'soldier' }).state.units['w']?.profession).toBe('masterBlacksmith');
  });

  it('raising dragoons with an armed man already waiting: a horse is found even when it cannot be paid for', () => {
    let s = inEurope(withUnit(with_(base('france'), { gold: 0 }), { id: 'g', type: 'soldier', x: 0, y: 0 }), 'g');
    s = inEurope(withUnit(s, { id: 'w', type: 'soldier', x: 0, y: 0 }), 'w');
    const mounted = applyAction(s, { type: 'equipInEurope', unitId: 'w', role: 'dragoon' }).state;
    expect(mounted.units['w']?.type).toBe('dragoon');
    expect(mounted.players[0]?.gold).toBe(0);
    // the first armed man, with nobody armed beside him, must pay
    const alone = { ...s, units: Object.fromEntries(Object.entries(s.units).filter(([id]) => id !== 'g')) };
    expect(validateAction(alone, { type: 'equipInEurope', unitId: 'w', role: 'dragoon' }).ok).toBe(false);
  });

  it('a gun built in one of its colonies earns it one in Europe at no cost', () => {
    const s = with_(base('france'), { gold: 0, gunCredit: 1 });
    expect(purchasePrice(s, 'a', 'artillery')).toBe(0);
    const bought = applyAction(s, { type: 'purchaseUnit', unit: 'artillery' }).state;
    expect(bought.players[0]).toMatchObject({ gold: 0, gunCredit: 0, artilleryBought: 0 });
    expect(purchasePrice(bought, 'a', 'artillery')).toBeGreaterThan(0);
    expect(purchasePrice(human(s), 'a', 'artillery')).toBeGreaterThan(0);
  });
});
