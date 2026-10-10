import { describe, expect, it } from 'vitest';
import { applyAction, validateAction, type Action } from '../../../src/engine/actions';
import { BUILDING_CHAINS, BUILDING_IDS, BUILDINGS, chainLevel } from '../../../src/engine/data/buildings';
import { CROSSES } from '../../../src/engine/data/crosses';
import { CONVERSION_ORDER, PRODUCTION, TRADE_IDS, TRADES, type TradeId } from '../../../src/engine/data/production';
import { PROFESSION_IDS } from '../../../src/engine/data/professions';
import { colonyProduction, colonyTurn, indoorOutput, tradeCapacity, type EconomyEvent } from '../../../src/engine/economy';
import { checkInvariants } from '../../../src/engine/invariants';
import type { Colonist, Colony, GameState, Goods } from '../../../src/engine/state';
import { withColony, world } from '../../helpers/world';

// A colony on arctic ice ringed by water: the square itself yields nothing, so only the workers count.
const ICE = ['~~~~~', '~~~~~', '~~a~~', '~~~~~', '~~~~~'];
// A colony on plains with hills to the north (ore 4) and forest to the west.
const LAND = ['~~~~~~', '~.h..~', '~f...~', '~....~', '~~~~~~'];

const HOUSES = ['townHall', 'carpentersShop', 'blacksmithsHouse', 'tobacconistsHouse', 'weaversHouse', 'rumDistillersHouse', 'furTradersHouse'];
let seq = 0;
const worker = (trade: TradeId, profession: Colonist['profession'] = 'freeColonist'): Colonist => ({ id: `w${seq++}`, profession, job: { kind: 'work', trade } , turns: 0 });
const town = (colonists: Colonist[], goods: Goods = {}, buildings: string[] = HOUSES, rows = ICE): GameState =>
  withColony(world({ rows }), { id: 'col', x: 2, y: 2, colonists, goods: { food: 50, ...goods }, buildings });
const col = (s: GameState): Colony => s.colonies['col'] as Colony;
/** The warehouse without the larder (every test colony is given food so nobody starves mid-test). */
const stock = (s: GameState, id = 'col'): Goods => {
  const { food: _food, ...rest } = (s.colonies[id] as Colony).goods;
  return rest;
};
const report = (s: GameState) => colonyProduction(s, col(s));
const turn = (s: GameState): { state: GameState; events: EconomyEvent[] } => {
  const events: EconomyEvent[] = [];
  const state = colonyTurn(s, 'col', events);
  expect(checkInvariants(state)).toEqual([]);
  return { state, events };
};
const code = (s: GameState, a: Action): string => {
  const v = validateAction(s, a);
  return v.ok ? 'ok' : v.error.code;
};
const at = (level: number, sol = 0, hasPenn = false) => ({ level, sol, hasPenn });

describe('tables', () => {
  it('match their snapshots', () => {
    expect({ BUILDINGS, BUILDING_CHAINS, TRADES, PRODUCTION, CONVERSION_ORDER }).toMatchSnapshot();
  });

  it('every building has complete data, sits in at most one chain, and every trade has its building and expert', () => {
    expect(BUILDING_IDS).toHaveLength(42);
    for (const id of BUILDING_IDS) {
      const b = BUILDINGS[id];
      expect(b.name.length, id).toBeGreaterThan(0);
      for (const f of ['hammers', 'tools', 'minPopulation', 'upkeep', 'level'] as const) expect(Number.isInteger(b[f]) && b[f] >= 0, `${id}.${f}`).toBe(true);
      expect(b.tools % 10, id).toBe(0);
    }
    const chained = Object.values(BUILDING_CHAINS).flat();
    expect(new Set(chained).size).toBe(chained.length);
    expect(BUILDING_IDS.filter((id) => BUILDINGS[id].chain === null)).toEqual(['townHall2', 'townHall3', 'capitol', 'capitolExpansion']);
    expect(BUILDING_IDS.filter((id) => BUILDINGS[id].unused)).toEqual(['townHall2', 'townHall3', 'capitol', 'capitolExpansion']);
    for (const trade of TRADE_IDS) {
      expect(BUILDING_CHAINS[TRADES[trade].chain].length).toBeGreaterThan(0);
      expect(PROFESSION_IDS).toContain(TRADES[trade].expert);
    }
  });

  it('carries the costs of the cheap shops and the fortifications', () => {
    const cost = (id: keyof typeof BUILDINGS): number[] => [BUILDINGS[id].hammers, BUILDINGS[id].tools, BUILDINGS[id].minPopulation];
    expect(cost('fort')).toEqual([120, 100, 3]);
    expect(cost('drydock')).toEqual([80, 50, 4]);
    expect(cost('printingPress')).toEqual([52, 20, 1]);
    expect(cost('weaversShop')).toEqual([64, 20, 1]);
    expect(cost('furFactory')).toEqual([160, 100, 6]);
    expect(cost('cathedral')).toEqual([176, 100, 8]);
    expect(cost('carpentersShop')).toEqual([39, 0, 1]);
    expect(BUILDING_IDS.filter((id) => BUILDINGS[id].needsFather === 'adamSmith').sort()).toEqual(
      ['arsenal', 'cigarFactory', 'furFactory', 'ironWorks', 'rumFactory', 'textileMill'],
    );
    expect(BUILDINGS.customHouse.needsFather).toBe('peterStuyvesant');
    expect(chainLevel(['weaversHouse', 'weaversShop'], 'weaver')).toBe(2);
    expect(chainLevel([], 'weaver')).toBe(0);
  });
});

describe('output of one indoor worker', () => {
  const kinds = ['pettyCriminal', 'indianConvert', 'indenturedServant', 'freeColonist'] as const;

  it('house 1/1/2/3 and expert 6; shop doubles; factory is half again', () => {
    expect(kinds.map((k) => indoorOutput('weaver', k, at(1)))).toEqual([1, 1, 2, 3]);
    expect(kinds.map((k) => indoorOutput('weaver', k, at(2)))).toEqual([2, 2, 4, 6]);
    expect(kinds.map((k) => indoorOutput('weaver', k, at(3)))).toEqual([3, 3, 6, 9]);
    expect([1, 2, 3].map((level) => indoorOutput('weaver', 'masterWeaver', at(level)))).toEqual([6, 12, 18]);
    for (const trade of ['distiller', 'tobacconist', 'furTrader', 'blacksmith', 'gunsmith'] as const) {
      expect([1, 2, 3].map((level) => indoorOutput(trade, 'freeColonist', at(level))), trade).toEqual([3, 6, 9]);
      expect(indoorOutput(trade, TRADES[trade].expert, at(2)), trade).toBe(12);
    }
  });

  it('an expert outside his trade works like a free colonist', () => {
    expect(indoorOutput('weaver', 'masterDistiller', at(1))).toBe(3);
    expect(indoorOutput('carpenter', 'expertFarmer', at(1))).toBe(3);
    expect(indoorOutput('statesman', 'firebrandPreacher', at(1))).toBe(3);
  });

  it('carpenters: 1/1/2/3, master 6, all doubled by a Lumber Mill', () => {
    expect(kinds.map((k) => indoorOutput('carpenter', k, at(1)))).toEqual([1, 1, 2, 3]);
    expect(kinds.map((k) => indoorOutput('carpenter', k, at(2)))).toEqual([2, 2, 4, 6]);
    expect([1, 2].map((level) => indoorOutput('carpenter', 'masterCarpenter', at(level)))).toEqual([6, 12]);
  });

  it('preachers: the Church does not multiply, the Cathedral doubles, Penn adds half', () => {
    expect(kinds.map((k) => indoorOutput('preacher', k, at(1)))).toEqual([1, 1, 2, 3]);
    expect(indoorOutput('preacher', 'firebrandPreacher', at(1))).toBe(6);
    expect(kinds.map((k) => indoorOutput('preacher', k, at(2)))).toEqual([2, 2, 4, 6]);
    expect(indoorOutput('preacher', 'firebrandPreacher', at(2))).toBe(12);
    expect([...kinds, 'firebrandPreacher' as const].slice(1).map((k) => indoorOutput('preacher', k, at(1, 0, true)))).toEqual([1, 3, 4, 9]);
    expect(indoorOutput('preacher', 'firebrandPreacher', at(2, 0, true))).toBe(18);
    expect(indoorOutput('carpenter', 'freeColonist', at(1, 0, true))).toBe(3); // Penn is for preachers only
  });

  it('statesmen: base, doubled for an Elder Statesman, whatever the building; teachers make nothing', () => {
    expect(kinds.map((k) => indoorOutput('statesman', k, at(1)))).toEqual([1, 1, 2, 3]);
    expect(indoorOutput('statesman', 'elderStatesman', at(1))).toBe(6);
    expect(indoorOutput('teacher', 'masterCarpenter', at(3))).toBe(0);
  });

  it('the Sons of Liberty term is added before a craftsman doubles, after for carpenters and preachers, and never drives output below zero', () => {
    expect(indoorOutput('weaver', 'freeColonist', at(1, 1))).toBe(4);
    expect(indoorOutput('weaver', 'masterWeaver', at(1, 1))).toBe(8);
    expect(indoorOutput('weaver', 'masterWeaver', at(3, 2))).toBe(24); // (3+2+3) + 4 = 12, doubled
    expect(indoorOutput('carpenter', 'masterCarpenter', at(1, 1))).toBe(7);
    expect(indoorOutput('carpenter', 'masterCarpenter', at(2, 1))).toBe(14);
    expect(indoorOutput('preacher', 'firebrandPreacher', at(1, 2))).toBe(8);
    expect(indoorOutput('statesman', 'elderStatesman', at(1, 1))).toBe(8);
    expect(indoorOutput('weaver', 'pettyCriminal', at(1, -3))).toBe(0);
    expect(indoorOutput('weaver', 'freeColonist', at(2, -1))).toBe(5);
  });
});

describe('turning raw materials into goods', () => {
  it('one worker converts input one for one', () => {
    const { state, events } = turn(town([worker('weaver')], { cotton: 10 }));
    expect(stock(state)).toEqual({ cotton: 7, cloth: 3 });
    expect(events.filter((e) => e.type !== 'congressConvened')).toEqual([{ type: 'colonyProduced', colonyId: 'col', delta: { food: -2, cotton: -3, cloth: 3 }, hammers: 0 }]);
  });

  it('with too little input, makes only what the input allows and uses it all', () => {
    const r = report(town([worker('weaver'), worker('weaver', 'masterWeaver')], { cotton: 5 }));
    expect(r.potential.cloth).toBe(9);
    expect(r.produced.cloth).toBe(5);
    expect(r.consumed.cotton).toBe(5);
    expect(r.shortfall.cotton).toBe(4);
    expect(r.ranOut).toEqual([]); // something was still made
    const { state } = turn(town([worker('weaver'), worker('weaver', 'masterWeaver')], { cotton: 5 }));
    expect(stock(state)).toEqual({ cloth: 5 });
  });

  it('with no input at all nothing is made and the shortage is reported', () => {
    const { state, events } = turn(town([worker('tobacconist')]));
    expect(stock(state)).toEqual({});
    expect(events).toContainEqual({ type: 'ranOutOf', colonyId: 'col', good: 'tobacco' });
  });

  it("this turn's raw output feeds this turn's workshop before stock is touched", () => {
    // a free colonist mines 4 ore on the hills, a blacksmith makes 3 tools: stock of ore rises by 1
    const miner: Colonist = { id: 'm', profession: 'freeColonist', job: { kind: 'field', dx: 0, dy: -1, good: 'ore' }, turns: 0 };
    const s = town([miner, worker('blacksmith')], { ore: 20 }, HOUSES, LAND);
    const r = report(s);
    expect([r.produced.ore, r.produced.tools, r.consumed.ore]).toEqual([4, 3, 3]);
    expect(col(turn(s).state).goods).toMatchObject({ ore: 21, tools: 3 }); // the stock was not drawn on
  });

  it('chains ore to tools to muskets within one turn', () => {
    const miner: Colonist = { id: 'm', profession: 'expertOreMiner', job: { kind: 'field', dx: 0, dy: -1, good: 'ore' }, turns: 0 };
    const s = town([miner, worker('blacksmith', 'masterBlacksmith'), worker('gunsmith')], {}, [...HOUSES, 'armory'], LAND);
    const r = report(s);
    expect(r.produced.ore).toBe(8);
    expect(r.produced.tools).toBe(6);
    expect(r.produced.muskets).toBe(3);
    expect(col(turn(s).state).goods).toMatchObject({ ore: 2, tools: 3, muskets: 3 });
  });

  it('a shortage upstream limits everything downstream', () => {
    // 2 ore in stock: the master blacksmith makes 2 tools, so the gunsmith makes 2 muskets
    const s = town([worker('blacksmith', 'masterBlacksmith'), worker('gunsmith')], { ore: 2 }, [...HOUSES, 'armory']);
    expect(stock(turn(s).state)).toEqual({ muskets: 2 });
    // tools already in stock keep the gunsmith going when the smithy is idle
    const stocked = town([worker('gunsmith')], { tools: 50 }, [...HOUSES, 'armory']);
    expect(stock(turn(stocked).state)).toEqual({ tools: 47, muskets: 3 });
  });

  it('a factory makes half again as much from the same input', () => {
    const mill = [...HOUSES, 'weaversShop', 'textileMill'];
    const r = report(town([worker('weaver')], { cotton: 100 }, mill));
    expect([r.produced.cloth, r.consumed.cotton]).toEqual([9, 6]);
    const expert = report(town([worker('weaver', 'masterWeaver')], { cotton: 100 }, mill));
    expect([expert.produced.cloth, expert.consumed.cotton]).toEqual([18, 12]);
    // short of input: 4 cotton is two thirds of 6 cloth
    const short = report(town([worker('weaver')], { cotton: 4 }, mill));
    expect([short.produced.cloth, short.consumed.cotton, short.shortfall.cotton]).toEqual([6, 4, 2]);
    const none = report(town([worker('weaver')], {}, mill));
    expect([none.produced.cloth, none.ranOut]).toEqual([0, ['cotton']]);
  });

  it('carpenters turn lumber into hammers, which pile up with or without a project', () => {
    let s = town([worker('carpenter', 'masterCarpenter')], { lumber: 10 });
    s = turn(s).state;
    expect([col(s).hammers, col(s).goods.lumber]).toEqual([6, 4]);
    s = turn(s).state;
    expect([col(s).hammers, col(s).goods.lumber ?? 0]).toEqual([10, 0]);
    const last = turn(s);
    expect(col(last.state).hammers).toBe(10);
    expect(last.events).toContainEqual({ type: 'ranOutOf', colonyId: 'col', good: 'lumber' });
  });

  it('counts the colony square and field workers, and fish as food', () => {
    const farmer: Colonist = { id: 'f', profession: 'freeColonist', job: { kind: 'field', dx: 1, dy: 0, good: 'food' }, turns: 0 };
    const fisher: Colonist = { id: 'g', profession: 'expertFisherman', job: { kind: 'field', dx: -2 + 1, dy: 1, good: 'food' }, turns: 0 };
    const s = town([farmer, { ...fisher, job: { kind: 'field', dx: 0, dy: 1, good: 'food' }, turns: 0 }], {}, [...HOUSES, 'docks'], LAND);
    const r = report(s);
    // colony square on plains: 3 food and 2 cotton; two plains farmers at 5 each
    expect(r.produced.food).toBe(13);
    expect(r.produced.cotton).toBe(2);
    const sea = town([{ id: 'g', profession: 'expertFisherman', job: { kind: 'field', dx: 1, dy: 0, good: 'fish' }, turns: 0 }], {}, [...HOUSES, 'docks']);
    expect(report(sea).produced.food).toBe(4); // open sea all round: 2, plus 2 for the expert
  });
});

describe('who may work where', () => {
  it('three to a building, and only where the building stands', () => {
    const three = town([worker('weaver'), worker('weaver'), worker('weaver'), { id: 'x', profession: 'freeColonist', job: { kind: 'idle' }, turns: 0 }]);
    expect(code(three, { type: 'assignJob', colonyId: 'col', colonistId: 'x', job: { kind: 'work', trade: 'weaver' } })).toBe('buildingFull');
    expect(code(three, { type: 'assignJob', colonyId: 'col', colonistId: 'x', job: { kind: 'work', trade: 'distiller' } })).toBe('ok');
    expect(code(three, { type: 'assignJob', colonyId: 'col', colonistId: 'x', job: { kind: 'work', trade: 'gunsmith' } })).toBe('noBuilding');
    expect(code(three, { type: 'assignJob', colonyId: 'col', colonistId: 'x', job: { kind: 'work', trade: 'preacher' } })).toBe('noBuilding');
    expect(code(three, { type: 'assignJob', colonyId: 'col', colonistId: 'x', job: { kind: 'work', trade: 'smelter' as 'weaver' } })).toBe('badJob');
    const first = col(three).colonists[0]!.id;
    expect(code(three, { type: 'assignJob', colonyId: 'col', colonistId: first, job: { kind: 'work', trade: 'weaver' } })).toBe('ok'); // already there
    const moved = applyAction(three, { type: 'assignJob', colonyId: 'col', colonistId: 'x', job: { kind: 'work', trade: 'statesman' } }).state;
    expect(col(moved).colonists[3]?.job).toEqual({ kind: 'work', trade: 'statesman' });
  });

  it('a worker whose building is gone makes nothing and uses nothing', () => {
    const gunsmith = town([worker('gunsmith', 'masterGunsmith')], { tools: 50 });
    expect(report(gunsmith).potential.muskets).toBe(0);
    expect(report(gunsmith).produced.muskets).toBe(0);
    expect(report(gunsmith).consumed.tools).toBe(0);
    expect(report(gunsmith).ranOut).toEqual([]);
    expect(stock(turn(gunsmith).state)).toEqual({ tools: 50 });
    const armed = town([worker('gunsmith')], { tools: 50 }, [...HOUSES, 'armory']);
    expect(stock(turn(armed).state)).toEqual({ tools: 47, muskets: 3 });

    const preacher = town([worker('preacher', 'firebrandPreacher')]);
    expect(report(preacher).produced.crosses).toBe(CROSSES.perColony);
    const church = town([worker('preacher')], {}, [...HOUSES, 'church']);
    expect(report(church).produced.crosses).toBeGreaterThan(CROSSES.perColony + CROSSES.perChurchLevel);
  });

  it('teachers are limited by the school: 1, 2, 3', () => {
    const base = town([]);
    const cap = (buildings: string[]): number => tradeCapacity({ ...col(base), buildings }, 'teacher');
    expect(cap(HOUSES)).toBe(0);
    expect(cap([...HOUSES, 'schoolhouse'])).toBe(1);
    expect(cap([...HOUSES, 'schoolhouse', 'college'])).toBe(2);
    expect(cap([...HOUSES, 'schoolhouse', 'college', 'university'])).toBe(3);
    expect(tradeCapacity(col(base), 'weaver')).toBe(3);
    expect(tradeCapacity(col(base), 'gunsmith')).toBe(0);
  });
});

describe('the colony phase of a turn', () => {
  it("runs every colony of the player whose turn begins, and nobody else's", () => {
    const rows = ['~~~~~~~', '~~a~a~~', '~~~~~~~'];
    let s = withColony(world({ rows }), { id: 'col', x: 2, y: 1, colonists: [worker('weaver')], goods: { food: 50, cotton: 10 }, buildings: HOUSES });
    s = withColony(s, { id: 'other', x: 4, y: 1, owner: 'b', colonists: [worker('weaver')], goods: { food: 50, cotton: 10 }, buildings: HOUSES });
    const r = applyAction(s, { type: 'endTurn' }); // b's turn begins
    expect(stock(r.state, 'other')).toEqual({ cotton: 7, cloth: 3 });
    expect(stock(r.state)).toEqual({ cotton: 10 });
    const back = applyAction(r.state, { type: 'endTurn' });
    expect(stock(back.state)).toEqual({ cotton: 7, cloth: 3 });
    expect(back.events.map((e) => e.type)).toContain('colonyProduced');
  });
});
