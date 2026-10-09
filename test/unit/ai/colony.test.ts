import { describe, expect, it } from 'vitest';
import { buildAction, buildChoice, jobAction, jobPlan } from '../../../src/ai/colony';
import { playTurn } from '../../../src/ai/european';
import { applyAction } from '../../../src/engine/actions';
import { AI_COLONY } from '../../../src/engine/data/ai';
import type { BuildingId } from '../../../src/engine/data/buildings';
import { colonyProduction } from '../../../src/engine/economy';
import { computerTreasury } from '../../../src/engine/fleet';
import { checkInvariants } from '../../../src/engine/invariants';
import type { Colonist, Colony, GameState, Goods, Job } from '../../../src/engine/state';
import { setTile, withBids, withColony, withUnit, world } from '../../helpers/world';

// plains all round the colony at (4, 4), sea to the west of the map
const ROWS = Array.from({ length: 9 }, (_, y) => (y === 0 || y === 8 ? '~'.repeat(11) : `~~${'.'.repeat(8)}~`));
type Kind = Colonist['profession'];
const folk = (kinds: Kind[]): Colonist[] => kinds.map((profession, i) => ({ id: `p${i}`, profession, job: { kind: 'idle' as const }, turns: 0 }));
interface Opts { kinds?: Kind[]; buildings?: BuildingId[]; goods?: Goods; turn?: number; construction?: Colony['construction']; forest?: [number, number][] }
const START: BuildingId[] = ['townHall', 'carpentersShop', 'blacksmithsHouse', 'tobacconistsHouse', 'weaversHouse', 'rumDistillersHouse', 'furTradersHouse'];
function settled(o: Opts = {}): GameState {
  let s: GameState = { ...world({ rows: ROWS, players: [{ id: 'a', kind: 'ai' }, { id: 'b', kind: 'ai' }] }), turn: o.turn ?? 120 };
  for (const [x, y] of o.forest ?? []) s = setTile(s, x, y, { forest: true });
  return withColony(s, { id: 'col', x: 4, y: 4, colonists: folk(o.kinds ?? ['freeColonist']), buildings: o.buildings ?? START, goods: o.goods ?? { food: 100 }, construction: o.construction === undefined ? { kind: 'building', id: 'stockade' } : o.construction });
}
const col = (s: GameState): Colony => s.colonies['col'] as Colony;
const jobs = (s: GameState): (Job | undefined)[] => col(s).colonists.map((c) => jobPlan(s, col(s)).get(c.id));
const kindOf = (j: Job | undefined): string => (!j ? '?' : j.kind === 'field' ? j.good : j.kind === 'work' ? j.trade : 'idle');
const plan = (o: Opts): string[] => jobs(settled(o)).map(kindOf);
/** Apply the policy's job changes until the colony matches its plan. */
const arranged = (s: GameState): GameState => {
  let now = s;
  for (let i = 0; i < 50; i++) {
    const a = jobAction(now, col(now));
    if (!a) return now;
    now = applyAction(now, a).state;
    expect(checkInvariants(now)).toEqual([]);
  }
  throw new Error('jobs did not settle');
};

describe('colony rule table', () => {
  it('matches the snapshot', () => {
    expect(AI_COLONY).toMatchSnapshot();
  });
});

describe('who does what', () => {
  it('expert farmers and fishermen first, to their own trade; a fisherman only where there are docks', () => {
    expect(plan({ kinds: ['expertFarmer'] })).toEqual(['food']);
    const coast = (buildings: BuildingId[]): string[] => jobs(setTile(settled({ kinds: ['expertFisherman'], buildings }), 3, 4, { base: 'ocean' })).map(kindOf);
    expect(coast([...START, 'docks'])).toEqual(['fish']);
    expect(coast(START)).not.toEqual(['fish']);
  });

  it('the unskilled go where the automatic placement puts them, on squares worth working', () => {
    // plains give five food and cotton besides: nobody is left idle
    const all = plan({ kinds: ['freeColonist', 'indenturedServant', 'pettyCriminal'], construction: null });
    expect(all).toHaveLength(3);
    expect(all).not.toContain('idle');
    expect(all).not.toContain('carpenter');
  });

  it('with something to build: one lumberjack while lumber is under 10, then one carpenter once there is lumber', () => {
    const forest: [number, number][] = [[5, 4]];
    const kinds: Kind[] = ['freeColonist', 'freeColonist', 'freeColonist', 'freeColonist'];
    const bare = plan({ kinds, forest });
    expect(bare.filter((j) => j === 'lumber')).toHaveLength(1);
    // he fells this very turn, so the bench is manned at once
    expect(bare.filter((j) => j === 'carpenter')).toHaveLength(1);
    // with lumber in store nobody fells, and one man builds
    const stocked = plan({ kinds, forest, goods: { food: 100, lumber: 40 } });
    expect(stocked.filter((j) => j === 'lumber')).toHaveLength(0);
    expect(stocked.filter((j) => j === 'carpenter')).toHaveLength(1);
    // with nothing to build neither is wanted
    const idle = plan({ kinds, forest, construction: null });
    expect(idle).not.toContain('carpenter');
    // an expert lumberjack and a master carpenter are the ones chosen
    const experts = plan({ kinds: ['freeColonist', 'expertLumberjack', 'masterCarpenter', 'freeColonist'], forest });
    expect(experts[1]).toBe('lumber');
    expect(experts[2]).toBe('carpenter');
  });

  it('experts of the land go to their own crop unless the warehouse is full of it; experts of the workshops to their bench when there is something to work', () => {
    expect(plan({ kinds: ['masterCottonPlanter'], construction: null })).toEqual(['cotton']);
    expect(plan({ kinds: ['masterCottonPlanter'], construction: null, goods: { food: 100, cotton: 101 } })).not.toEqual(['cotton']);
    expect(plan({ kinds: ['masterWeaver'], construction: null, goods: { food: 100, cotton: 50 } })).toEqual(['weaver']);
    // no sugar in store and none grown: a distiller is no use at the still
    expect(plan({ kinds: ['masterDistiller'], construction: null, goods: { food: 100, sugar: 50 } })).toEqual(['distiller']);
    expect(plan({ kinds: ['masterDistiller'], construction: null })).not.toEqual(['distiller']);
    // a statesman needs nothing but the hall
    expect(plan({ kinds: ['elderStatesman'], construction: null })).toEqual(['statesman']);
  });

  it('the rest take whatever pays best, bench or land, and a seat in the Town Hall while one is due', () => {
    // cloth is dear and cotton is piled up: an unskilled hand weaves rather than farm
    // (on good land the unskilled are farming already: here the country round is all mountain)
    let rocky = settled({ kinds: ['freeColonist'], construction: null, goods: { food: 100, cotton: 100 } });
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) rocky = setTile(rocky, 4 + dx, 4 + dy, { relief: 'mountains' });
    const dear = withBids(rocky, { cloth: 19, cotton: 1, sugar: 1, tobacco: 1, furs: 1, ore: 1 });
    expect(jobs(dear).map(kindOf)).toEqual(['weaver']);
    // a colony of three that feeds itself keeps one statesman
    const three = plan({ kinds: ['expertFarmer', 'expertFarmer', 'freeColonist'], construction: null });
    expect(three.filter((j) => j === 'statesman')).toHaveLength(1);
  });

  it('the plan is the same whatever the colonists were doing, and the policy carries it out', () => {
    const s = settled({ kinds: ['freeColonist', 'expertFarmer', 'freeColonist', 'masterCarpenter'], forest: [[5, 4]] });
    const wanted = jobs(s).map(kindOf);
    const done = arranged(s);
    expect(col(done).colonists.map((c) => kindOf(c.job))).toEqual(wanted);
    expect(jobs(done).map(kindOf)).toEqual(wanted);
    expect(jobAction(done, col(done))).toBeNull();
    // two who must change places manage it
    const swapped = { ...done, colonies: { col: { ...col(done), colonists: col(done).colonists.map((c, i, all) => ({ ...c, job: (all[(i + 1) % all.length] as Colonist).job })) } } };
    expect(col(arranged(swapped)).colonists.map((c) => kindOf(c.job))).toEqual(wanted);
    // a colony so arranged feeds itself
    const r = colonyProduction(done, col(done));
    expect(r.produced.food).toBeGreaterThanOrEqual(r.consumed.food);
  });
});

describe('what it builds', () => {
  const choice = (o: Opts): string | null => {
    const item = buildChoice(settled(o), col(settled(o)));
    return item === null ? null : item.kind === 'building' ? item.id : item.unit;
  };
  const many = (n: number, first: Kind[] = []): Kind[] => [...first, ...Array.from({ length: n - first.length }, () => 'freeColonist' as const)];

  it('a stockade first, when it has the people for one; a stable once it has horses; under four people nothing else', () => {
    expect(choice({ kinds: many(3) })).toBe('stockade');
    expect(choice({ kinds: many(2) })).toBeNull();
    expect(choice({ kinds: many(2), goods: { horses: 2 } })).toBe('stable');
    expect(choice({ kinds: many(3), buildings: [...START, 'stockade'] })).toBeNull();
  });

  it('docks when its land is no more than its people, or it wants them and has water', () => {
    const crowded = settled({ kinds: many(8), buildings: [...START, 'stockade'] });
    expect(buildChoice(setTile(crowded, 3, 4, { base: 'ocean' }), col(crowded))).toEqual({ kind: 'building', id: 'docks' });
  });

  it('then by the list: warehouse, wagon train aside, lumber mill, fort, and so on up', () => {
    const base = [...START, 'stockade'] as BuildingId[];
    // six people and no warehouse
    expect(choice({ kinds: many(6), buildings: base })).toBe('warehouse');
    // with a warehouse: the lumber mill (no natives about, so no wagon train; nobody to teach, no preacher)
    expect(choice({ kinds: many(4), buildings: [...base, 'warehouse'] })).toBe('lumberMill');
    expect(choice({ kinds: many(4), buildings: [...base, 'warehouse', 'lumberMill'] })).toBe('fort');
    // an expert whose trade can be taught calls for a schoolhouse before the mill; a preacher, after that, for a church
    expect(choice({ kinds: many(4, ['expertFarmer']), buildings: [...base, 'warehouse'] })).toBe('schoolhouse');
    expect(choice({ kinds: many(4, ['firebrandPreacher']), buildings: [...base, 'warehouse'] })).toBe('schoolhouse');
    expect(choice({ kinds: many(4, ['firebrandPreacher']), buildings: [...base, 'warehouse', 'schoolhouse'] })).toBe('church');
  });

  it('a colony under eight stops at the middle of the list', () => {
    const middling = [...START, 'stockade', 'fort', 'warehouse', 'warehouseExpansion', 'lumberMill'] as BuildingId[];
    expect(choice({ kinds: many(7), buildings: middling })).toBeNull();
    // eight people go on to a church
    expect(choice({ kinds: many(8), buildings: middling })).toBe('church');
  });

  it('asking for a building it cannot have yet gets the level below it', () => {
    // six people making bells want a newspaper: without a press it is the press
    const s = settled({ kinds: many(6, ['elderStatesman', 'elderStatesman']), buildings: [...START, 'stockade', 'fort', 'warehouse', 'lumberMill', 'schoolhouse'] });
    const seated = { ...s, colonies: { col: { ...col(s), colonists: col(s).colonists.map((c, i) => (i < 2 ? { ...c, job: { kind: 'work' as const, trade: 'statesman' as const } } : c)) } } };
    expect(colonyProduction(seated, col(seated)).produced.bells).toBeGreaterThanOrEqual(AI_COLONY.newspaperBells);
    expect(buildChoice(seated, col(seated))).toEqual({ kind: 'building', id: 'printingPress' });
  });

  it('the choice is made afresh every turn and put on the stocks, hammers and all', () => {
    const s = settled({ kinds: many(3), construction: { kind: 'building', id: 'docks' } });
    expect(buildAction(s, col(s))).toEqual({ type: 'setConstruction', colonyId: 'col', item: { kind: 'building', id: 'stockade' } });
    const set = applyAction({ ...s, colonies: { col: { ...col(s), hammers: 30 } } }, buildAction(s, col(s))!).state;
    expect(col(set)).toMatchObject({ construction: { kind: 'building', id: 'stockade' }, hammers: 30 });
    expect(buildAction(set, col(set))).toBeNull();
    // nothing to build: the stocks are cleared
    const small = settled({ kinds: many(1), construction: { kind: 'building', id: 'docks' } });
    expect(buildAction(small, col(small))).toEqual({ type: 'setConstruction', colonyId: 'col', item: null });
    const cleared = applyAction(small, buildAction(small, col(small))!).state;
    expect(buildAction(cleared, col(cleared))).toBeNull();
  });

  it('a whole turn of it leaves the game sound, and the colony at work', () => {
    const s = withUnit(settled({ kinds: many(4), forest: [[5, 4]] }), { id: 'g', type: 'soldier', x: 4, y: 4, orders: 'fortified' });
    const turn = playTurn(s);
    expect(checkInvariants(turn.state)).toEqual([]);
    expect(col(turn.state).colonists.filter((c) => c.job.kind === 'idle')).toHaveLength(0);
  });
});

describe('lumber for a colony with nobody to fell it', () => {
  const short = (o: Opts & { gold?: number }): GameState => {
    const s = settled({ turn: 120, ...o });
    return { ...s, difficulty: 'discoverer', players: s.players.map((p) => (p.id === 'a' ? { ...p, gold: o.gold ?? 0 } : p)) };
  };
  const lumber = (s: GameState): number => col(computerTreasury(s, 'a')).goods.lumber ?? 0;
  const gold = (s: GameState): number => computerTreasury(s, 'a').players[0]!.gold;

  it('a hundred on every eighth turn while it has something to build, under 2 lumber and no lumberjack; 200 gold if the treasury has it', () => {
    // (a caravel, so that no gold is made up for want of a ship)
    const fleet = (s: GameState): GameState => withUnit(s, { id: 'ship', type: 'caravel', profession: null, x: 1, y: 4 });
    expect(lumber(fleet(short({})))).toBe(100);
    const events: Parameters<typeof computerTreasury>[2] = [];
    computerTreasury(fleet(short({ gold: 500 })), 'a', events);
    expect(events).toEqual([{ type: 'colonySupplied', colonyId: 'col', player: 'a', good: 'lumber', amount: 100, cost: 200 }]);
    expect(gold(fleet(short({ gold: 500 })))).toBe(300);
    expect(gold(fleet(short({ gold: 199 })))).toBe(199);
    expect(lumber(fleet(short({ turn: 121 })))).toBe(0);
    expect(lumber(fleet(short({ goods: { lumber: 2 } })))).toBe(2);
    expect(lumber(fleet(short({ construction: null })))).toBe(0);
    const felling = short({ forest: [[5, 4]] });
    const busy = { ...felling, colonies: { col: { ...col(felling), colonists: col(felling).colonists.map((c) => ({ ...c, job: { kind: 'field' as const, dx: 1, dy: 0, good: 'lumber' as const } })) } } };
    expect(lumber(fleet(busy))).toBe(0);
  });
});
