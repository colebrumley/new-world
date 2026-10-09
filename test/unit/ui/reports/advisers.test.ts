import { describe, expect, it } from 'vitest';
import type { Colonist, GameState, Player, Settlement } from '../../../../src/engine/state';
import { OFF_MAP } from '../../../../src/engine/state';
import { colonyReport, economicReport, indianReport, laborReport, navalReport, religiousReport, terrainReport } from '../../../../src/ui/reports/advisers';
import type { Report } from '../../../../src/ui/report';
import { setTile, withBids, withColony, withUnit, world } from '../../../helpers/world';

const ROWS = ['~~~~~~~~~~', '~........~', '~........~', '~........~', '~~~~~~~~~~'];
const folk = (...jobs: Colonist['profession'][]): Colonist[] => jobs.map((profession, i) => ({ id: `p${i}`, profession, job: { kind: 'idle' as const }, turns: 0 }));
const patch = (s: GameState, change: Partial<Player>): GameState => ({ ...s, players: s.players.map((p) => (p.id === 'a' ? { ...p, ...change } : p)) });
const section = (r: Report, heading: RegExp): Report['sections'][number] => r.sections.find((x) => heading.test(x.heading))!;
const village = (id: string, x: number, y: number, extra: Partial<Settlement> = {}): Settlement => ({ id, tribe: 'sioux', x, y, capital: false, population: 3, growth: 0, taught: false, tributePaid: false, alarm: {}, mission: null, scouted: [], lastBought: null, lastSold: null, haggleMemory: null, ...extra });

function base(): GameState {
  let s = world({ rows: ROWS, players: [{ id: 'a' }, { id: 'b', kind: 'ai' }] });
  s = withColony(s, { id: 'james', x: 2, y: 2, name: 'Jamestown', colonists: folk('expertFarmer', 'freeColonist', 'freeColonist'), goods: { food: 120, furs: 40 }, construction: { kind: 'building', id: 'stockade' }, sol: { n: 100, d: 400 } });
  s = withColony(s, { id: 'ply', x: 6, y: 2, name: 'Plymouth', colonists: folk('freeColonist'), goods: { tools: 15 }, construction: { kind: 'unit', unit: 'wagonTrain' } });
  return s;
}

describe('Terrain Information (F1)', () => {
  it('sets out the terrain table: every kind of land with its cost, cover and yields', () => {
    const r = terrainReport();
    expect(r.sections.map((s) => s.heading)).toEqual(['Open land', 'Forest', 'Other', 'Notes']);
    expect(r.sections[0]?.rows).toHaveLength(9);
    expect(r.sections[1]?.rows).toHaveLength(9);
    expect(r.sections[2]?.rows).toHaveLength(6);
    expect(r.sections[0]?.rows[0]).toEqual(['Terrain', 'Move', 'Defence', 'Food', 'Sugar', 'Tobacco', 'Cotton', 'Furs', 'Lumber', 'Ore', 'Silver', 'Fish']);
    expect(r).toMatchSnapshot();
  });
});

describe('Religious Adviser (F2)', () => {
  it('counts the crosses toward the next immigrant and names who is waiting', () => {
    const r = religiousReport(patch(base(), { crosses: 12 }), 'a');
    const rows = section(r, /unrest/).rows;
    expect(rows[0]?.[0]).toBe('Crosses');
    expect(rows[0]?.[1]).toMatch(/^12 of \d+$/);
    expect(rows[1]?.[0]).toBe('Crosses each turn');
    expect(section(r, /docks/).rows).toEqual([['Indentured Servant'], ['Free Colonist'], ['Expert Farmer']]);
    expect(section(r, /Missions/)).toMatchObject({ heading: 'Missions (0)', rows: [], empty: 'We keep no mission among the native peoples.' });
  });

  it('lists our missions with their squares, and says nobody comes in wartime', () => {
    const s = { ...base(), settlements: { v1: village('v1', 4, 3, { mission: { owner: 'a', expert: true } }), v2: village('v2', 7, 3, { capital: true, mission: { owner: 'a', expert: false } }), v3: village('v3', 8, 1, { mission: { owner: 'b', expert: false } }) } };
    const m = section(religiousReport(s, 'a'), /Missions/);
    expect(m.heading).toBe('Missions (2)');
    expect(m.rows).toEqual([['Sioux settlement', '(4, 3)', 'Jesuit mission'], ['Sioux capital', '(7, 3)', 'Mission']]);
    expect(m.zoom).toEqual([[4, 3], [7, 3]]);
    expect(section(religiousReport(patch(s, { atWar: true }), 'a'), /unrest/).rows).toEqual([['Nobody crosses from Europe while the war lasts.']]);
  });
});

describe('Labor Adviser (F4)', () => {
  it('counts colonists by occupation and says where they are', () => {
    let s = withUnit(base(), { id: 'scout', type: 'scout', x: 4, y: 2 });
    s = withUnit(s, { id: 'vet', type: 'soldier', profession: 'veteranSoldier', x: 5, y: 3 });
    s = withUnit(s, { id: 'ship', type: 'caravel', profession: null, x: 0, y: 2 });
    const sec = laborReport(s, 'a').sections[0]!;
    expect(sec.heading).toBe('Colonists by occupation (6)');
    expect(sec.rows).toEqual([
      ['Occupation', 'Number', 'Where'],
      ['Expert Farmer', '1', 'Jamestown 1'],
      ['Free Colonists', '4', 'Jamestown 2, Plymouth 1, outside colonies 1'],
      ['Veteran Soldier', '1', 'outside colonies 1'],
    ]);
    expect(sec.zoom).toEqual([null, [2, 2], [2, 2], [5, 3]]);
    expect(laborReport(world({ rows: ROWS, players: [{ id: 'a' }] }), 'a').sections[0]).toMatchObject({ rows: [], empty: 'We have no colonists in the New World.' });
  });
});

describe('Economic Adviser (F5)', () => {
  it('shows the treasury, and for each cargo the prices, what we have sold and what we hold', () => {
    let s = withBids(patch(base(), { gold: 1234, taxRate: 7, boycotts: ['rum'] }), { furs: 5, rum: 11 });
    s = withUnit(s, { id: 'ship', type: 'caravel', profession: null, x: 0, y: 2, cargo: { furs: 60 } });
    const r = economicReport(s, 'a');
    expect(section(r, /Treasury/).rows).toEqual([['Gold', '1234'], ['Tax rate', '7%'], ['Boycotts', 'Rum']]);
    const trade = section(r, /Trade/).rows;
    expect(trade[0]).toEqual(['Cargo', 'Europe pays', 'Europe asks', 'Net sold to date', 'In our stores and holds', 'Change each turn']);
    expect(trade).toHaveLength(17);
    const furs = trade.find((row) => row[0] === 'Furs')!;
    expect(furs.slice(0, 2)).toEqual(['Furs', '5']);
    expect(furs[4]).toBe('100'); // 40 in Jamestown and 60 aboard
    expect(trade.find((row) => row[0] === 'Rum')?.[1]).toBe('boycott');
    expect(section(economicReport(patch(s, { atWar: true }), 'a'), /Treasury/).rows[1]).toEqual(['Tax rate', 'none: we pay the Crown nothing']);
  });
});

describe('Colony Adviser (F6)', () => {
  it('lists every colony with its people, membership and work, and its warehouse', () => {
    const s = withUnit(base(), { id: 'guard', type: 'soldier', x: 2, y: 2 });
    const r = colonyReport(s, 'a');
    expect(section(r, /Colonies/).rows).toEqual([
      ['Colony', 'People', 'Sons of Liberty', 'Building', 'Units here'],
      ['Jamestown', '3', '25%', 'Stockade', '1'],
      ['Plymouth', '1', '0%', 'Wagon Train', '0'],
    ]);
    expect(section(r, /Colonies/).zoom).toEqual([null, [2, 2], [6, 2]]);
    const store = section(r, /Warehouses/).rows;
    expect(store[0]).toHaveLength(17);
    expect(store[1]?.[0]).toBe('Jamestown');
    expect(store[1]?.[1]).toBe('120'); // food
    expect(store[2]?.filter((cell) => cell === '15')).toHaveLength(1);
    expect(colonyReport(world({ rows: ROWS, players: [{ id: 'a' }] }), 'a').sections[0]?.empty).toBe('We have founded no colony yet.');
  });
});

describe('Naval Adviser (F7)', () => {
  it('says where each ship is, where she is bound and what she carries', () => {
    let s = withUnit(base(), { id: 'inPort', type: 'merchantman', profession: null, x: 2, y: 2, cargo: { furs: 100, tools: 20 } });
    s = withUnit(s, { id: 'atSea', type: 'caravel', profession: null, x: 0, y: 3 });
    s = withUnit(s, { id: 'rider', type: 'soldier', x: 0, y: 3, aboard: 'atSea' });
    s = withUnit(s, { id: 'away', type: 'galleon', profession: null, x: 0, y: 0 });
    s = { ...s, units: { ...s.units, atSea: { ...s.units['atSea']!, orders: 'goto', destination: [6, 2] }, away: { ...s.units['away']!, x: OFF_MAP, y: OFF_MAP, voyage: { phase: 'toEurope', turnsLeft: 2, origin: [8, 2] } } } };
    const sec = navalReport(s, 'a').sections[0]!;
    expect(sec.heading).toBe('Ships (3)');
    expect(sec.rows).toEqual([
      ['Ship', 'Where', 'Bound for', 'Carrying'],
      ['Merchantman', 'in Jamestown', '-', '100 furs, 20 tools'],
      ['Caravel', 'at sea (0, 3)', 'Plymouth', 'Soldier'],
      ['Galleon', 'bound for Europe (2 turns)', '-', 'empty'],
    ]);
    expect(sec.zoom).toEqual([null, [2, 2], [0, 3], null]);
    expect(navalReport(base(), 'a').sections[0]).toMatchObject({ rows: [], empty: 'We have no ships.' });
  });
});

describe('Indian Adviser (F9)', () => {
  it('lists the peoples we have met with their mood, what we know of them, and our missions', () => {
    let s: GameState = { ...base(), settlements: { v1: village('v1', 4, 3, { mission: { owner: 'a', expert: false } }), v2: village('v2', 7, 3, { capital: true, alarm: { a: 60 } }) } };
    s = { ...s, tribes: { sioux: { ...s.tribes.sioux!, alarm: { a: 55 } } } };
    const sec = indianReport(s, 'a').sections[0]!;
    expect(sec.rows).toEqual([
      ['People', 'Relations', 'Mood', 'Settlements', 'Our missions', ''],
      ['Sioux', 'at peace', 'angry', '2 known', '1 missions', 'a settlement is close to violence'],
    ]);
    expect(sec.zoom).toEqual([null, [7, 3]]); // the capital
    // a settlement in the dark is not counted
    const dark = setTile(s, 7, 3, { explored: 0 });
    expect(indianReport(dark, 'a').sections[0]?.rows[1]?.[3]).toBe('1 known');
    expect(indianReport(dark, 'a').sections[0]?.zoom).toEqual([null, [4, 3]]);
  });

  it('says so when we have met nobody, or are at war', () => {
    const s = base();
    const unmet = { ...s, tribes: { sioux: { ...s.tribes.sioux!, met: [] } } };
    expect(indianReport(unmet, 'a').sections[0]).toMatchObject({ rows: [], empty: 'We have met none of the native peoples yet.' });
    const war = { ...s, tribes: { sioux: { ...s.tribes.sioux!, peace: [] } } };
    expect(indianReport(war, 'a').sections[0]?.rows[1]?.[1]).toBe('at war');
  });
});
