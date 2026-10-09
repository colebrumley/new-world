import { describe, expect, it } from 'vitest';
import type { Colonist, GameState } from '../../../src/engine/state';
import { colonyView, jobChoices } from '../../../src/ui/colony-model';
import { setTile, withColony, withUnit, world } from '../../helpers/world';

const ROWS = ['~~~~~~', '~.f..~', '~~.g.~', '~....~', '~~~~~~'];
const HOUSES = ['townHall', 'carpentersShop', 'blacksmithsHouse', 'tobacconistsHouse', 'weaversHouse', 'rumDistillersHouse', 'furTradersHouse'];
const who = (id: string, job: Colonist['job'], profession: Colonist['profession'] = 'freeColonist'): Colonist => ({ id, profession, job, turns: 0 });

function town(): GameState {
  let s = withColony(world({ rows: ROWS }), {
    id: 'col', x: 2, y: 2, name: 'Plymouth', buildings: [...HOUSES, 'weaversShop', 'docks'], goods: { food: 40, cotton: 30, furs: 120 }, hammers: 12,
    construction: { kind: 'building', id: 'stable' },
    colonists: [
      who('a', { kind: 'field', dx: -1, dy: -1, good: 'food' }, 'expertFarmer'),
      who('b', { kind: 'work', trade: 'weaver' }, 'masterWeaver'),
      who('c', { kind: 'idle' }, 'pettyCriminal'),
    ],
  });
  s = withUnit(s, { id: 'ship', type: 'caravel', x: 2, y: 2, cargo: { tools: 60 } });
  s = withUnit(s, { id: 'p', x: 2, y: 2, aboard: 'ship' });
  s = withUnit(s, { id: 'sol', type: 'soldier', x: 2, y: 2, profession: 'veteranSoldier' });
  s = withUnit(s, { id: 'far', x: 4, y: 3 });
  return s;
}

describe('colonyView', () => {
  const v = colonyView(town(), 'col')!;

  it('heads the screen with name, population and membership', () => {
    expect(v).toMatchObject({ id: 'col', name: 'Plymouth', population: 3, solPercent: 0, toryPercent: 100, capacity: 100 });
    expect(colonyView(town(), 'nope')).toBeNull();
  });

  it('shows the top building of each chain with the people working in it', () => {
    expect(v.buildings.map((b) => b.name)).toEqual([
      'Docks', 'Town Hall', "Weaver's Shop", "Tobacconist's House", "Rum Distiller's House", "Fur Trader's House", "Carpenter's Shop", "Blacksmith's House",
    ]);
    const weaver = v.buildings.find((b) => b.chain === 'weaver')!;
    expect(weaver).toMatchObject({ id: 'weaversShop', trade: 'weaver', capacity: 3 });
    expect(weaver.workers).toEqual([{ id: 'b', label: 'Master Weaver', doing: '12 Cloth' }]);
    expect(v.buildings.find((b) => b.id === 'docks')).toMatchObject({ trade: null, capacity: 0, workers: [] });
  });

  it('lays out the nine squares with who works them and what the colony square yields', () => {
    expect(v.squares.map((s) => `${s.dx},${s.dy}`)).toEqual(['-1,-1', '0,-1', '1,-1', '-1,0', '0,0', '1,0', '-1,1', '0,1', '1,1']);
    expect(v.squares[0]).toMatchObject({ status: 'worked', worker: { id: 'a', label: 'Expert Farmer', doing: '7 Food' } });
    expect(v.squares[4]).toMatchObject({ status: 'center', note: '3 Food, 2 Cotton', worker: null });
    expect(v.squares[1]).toMatchObject({ status: 'free', worker: null });
    const native = colonyView(setTile(town(), 3, 2, { homeland: 'sioux' }), 'col')!;
    expect(native.squares[5]?.status).toBe('nativeLand');
  });

  it('separates the idle, the units outside, and the carriers with their holds', () => {
    expect(v.idle).toEqual([{ id: 'c', label: 'Petty Criminal', doing: 'Idle' }]);
    expect(v.outside).toEqual([{ id: 'sol', label: 'Veteran Soldier', doing: '' }]);
    expect(v.carriers).toEqual([{
      id: 'ship', label: 'Caravel', holds: 2, used: 2,
      cargo: [{ good: 'tools', name: 'Tools', amount: 60 }],
      passengers: [{ id: 'p', label: 'Free Colonist', doing: '' }],
    }]);
  });

  it('lists the warehouse, the food line and the production table', () => {
    expect(v.warehouse).toHaveLength(16);
    expect(v.warehouse.find((g) => g.good === 'furs')).toEqual({ good: 'furs', name: 'Furs', amount: 120, exported: false });
    expect(v.food).toEqual({ made: 10, eaten: 6, surplus: 4, stored: 40 });
    const line = (good: string) => v.production.find((l) => l.good === good);
    expect(line('cloth')).toMatchObject({ made: 12, used: 0, net: 12 });
    expect(line('cotton')).toMatchObject({ made: 2, used: 12, net: -10 });
    expect(line('bells')).toMatchObject({ made: 1 });
    expect(line('crosses')).toMatchObject({ made: 1 });
    expect(line('sugar')).toBeUndefined();
  });

  it('describes the project, its progress, the price to buy it and what else could be built', () => {
    expect(v.construction).toMatchObject({ item: 'Stable', hammers: 12, hammersNeeded: 64, tools: 0, toolsNeeded: 0, buyPrice: 52 * 13 });
    const labels = v.construction.choices.map((c) => c.label);
    expect(labels).toContain('Stable (64 hammers)');
    expect(labels).toContain('Printing Press (52 hammers, 20 tools)');
    expect(labels).toContain('Wagon Train (40 hammers)');
  });
});

describe('jobChoices', () => {
  it('offers outdoor work with here / best figures and the indoor trades with their output', () => {
    const labels = jobChoices(town(), 'col', 'a').map((c) => c.label);
    expect(labels).toContain('Farmer (7 here / 7 best)');
    expect(labels).toContain('Lumberjack (0 here / 6 best)');
    expect(labels).toContain('Fisherman (0 here / 4 best)');
    expect(labels).toContain('Weaver (6 Cloth)');
    expect(labels).toContain('Statesman (3 Liberty Bells)');
    expect(labels).toContain('Carpenter (3 Hammers)');
    expect(labels.some((l) => l.startsWith('Silver Miner'))).toBe(false);
    expect(labels.some((l) => l.startsWith('Teacher') || l.startsWith('Preacher') || l.startsWith('Gunsmith'))).toBe(false);
  });

  it('keeps a field worker on his square when it offers the work, and sends him to the best one otherwise', () => {
    const choices = jobChoices(town(), 'col', 'a');
    expect(choices.find((c) => c.label.startsWith('Farmer'))?.job).toEqual({ kind: 'field', dx: -1, dy: -1, good: 'food' });
    expect(choices.find((c) => c.label.startsWith('Lumberjack'))?.job).toEqual({ kind: 'field', dx: 0, dy: -1, good: 'lumber' });
    expect(jobChoices(town(), 'col', 'ghost')).toEqual([]);
  });

  it('leaves out a building that is full unless the colonist already works there', () => {
    let s = town();
    const colony = s.colonies['col']!;
    const extra = ['x', 'y'].map((id) => who(id, { kind: 'work', trade: 'weaver' }));
    s = { ...s, colonies: { col: { ...colony, colonists: [...colony.colonists, ...extra] } } };
    expect(jobChoices(s, 'col', 'c').some((c) => c.label.startsWith('Weaver'))).toBe(false);
    expect(jobChoices(s, 'col', 'b').some((c) => c.label.startsWith('Weaver'))).toBe(true);
  });
});

describe('Custom House in the view', () => {
  it('marks exported goods and says whether there is a Custom House', () => {
    const plain = colonyView(town(), 'col')!;
    expect(plain.customHouse).toBe(false);
    expect(plain.warehouse.every((g) => !g.exported)).toBe(true);
    const s = town();
    const col = s.colonies['col']!;
    const withHouse = { ...s, colonies: { col: { ...col, buildings: [...col.buildings, 'customHouse'], exports: ['furs' as const] } } };
    const v = colonyView(withHouse, 'col')!;
    expect(v.customHouse).toBe(true);
    expect(v.warehouse.filter((g) => g.exported).map((g) => g.good)).toEqual(['furs']);
  });
});

