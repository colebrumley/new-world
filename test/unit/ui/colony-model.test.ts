import { describe, expect, it } from 'vitest';
import { CALENDAR } from '../../../src/engine/calendar';
import type { Action } from '../../../src/engine/actions';
import type { Colonist, GameState, Job } from '../../../src/engine/state';
import { abandonQuestion, colonyView, dropVerdict, homeOf, jobChoices, leaveAction } from '../../../src/ui/colony-model';
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

  it('says whose colony it is, and which power they play, for the flag at its head', () => {
    const state = town();
    const owner = state.colonies['col']!.owner;
    expect(v.owner).toBe(owner);
    expect(v.nation).toBe(state.players.find((p) => p.id === owner)!.nation);
    const orphan = { ...state, players: state.players.filter((p) => p.id !== owner) };
    expect(colonyView(orphan, 'col')!.nation).toBeNull();
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
    expect(v.construction).toMatchObject({ item: 'Stable', hammers: 12, hammersNeeded: 64, tools: 0, toolsNeeded: 0, buyPrice: 52 * 13, built: false });
    const labels = v.construction.choices.map((c) => c.label);
    expect(labels).toContain('Stable (64 hammers)');
    expect(labels).toContain('Printing Press (52 hammers, 20 tools)');
    expect(labels).toContain('Wagon Train (40 hammers)');
  });

  it('marks a project the colony has already built, so the player is told to choose another', () => {
    const s = town();
    const done = { ...s, colonies: { ...s.colonies, col: { ...s.colonies['col']!, construction: { kind: 'building' as const, id: 'docks' as const }, hammers: 0 } } };
    expect(colonyView(done, 'col')!.construction).toMatchObject({ item: 'Docks', built: true });
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


describe('drop verdicts', () => {
  function port(): GameState {
    let s = withColony(world({ rows: ROWS }), {
      id: 'col', x: 2, y: 2, name: 'Plymouth', buildings: HOUSES, goods: { furs: 40, muskets: 0 },
      colonists: [who('a', { kind: 'field', dx: -1, dy: -1, good: 'food' }), who('b', { kind: 'work', trade: 'statesman' }), who('c', { kind: 'idle' })],
    });
    s = withUnit(s, { id: 'ship', type: 'galleon', x: 2, y: 2, cargo: { furs: 100 } });
    s = withUnit(s, { id: 'p', x: 2, y: 2, aboard: 'ship' });
    s = withUnit(s, { id: 'wagon', type: 'wagonTrain', x: 2, y: 2 });
    s = withUnit(s, { id: 'sol', type: 'soldier', x: 2, y: 2, profession: 'veteranSoldier' });
    return s;
  }

  /** A refusal that writes down what it was asked and says no to one type of action; a jobFor that
   *  reads a place as a job the plain way and finds nothing to raise on the square at 1,1. */
  function probes(state: GameState, refused: Action['type'] | null = null) {
    const asked: Action[] = [];
    const refusal = (action: Action): string | null => {
      asked.push(action);
      return action.type === refused ? 'No.' : null;
    };
    const jobFor = (target: string): Job | null => {
      const [kind, rest] = target.split(':');
      if (kind === 'idle') return { kind: 'idle' };
      if (kind === 'trade') return { kind: 'work', trade: rest as Extract<Job, { kind: 'work' }>['trade'] };
      if (kind !== 'field' || rest === '1,1') return null;
      const [dx, dy] = rest!.split(',').map(Number) as [number, number];
      return { kind: 'field', dx, dy, good: 'food' };
    };
    const verdict = (source: string, target: string) => dropVerdict(state, 'col', source, target, refusal, jobFor);
    /** The verdict, and the one action asked about to reach it (null if none was). */
    const one = (source: string, target: string) => {
      asked.length = 0;
      const v = verdict(source, target);
      expect(asked.length).toBeLessThanOrEqual(1);
      return [v, asked[0] ?? null] as const;
    };
    return { asked, verdict, one };
  }

  it('says where each kind of token stands now', () => {
    const s = port();
    const home = (source: string) => homeOf(s, 'col', source);
    expect(home('colonist:a')).toBe('field:-1,-1');
    expect(home('colonist:b')).toBe('trade:statesman');
    expect(home('colonist:c')).toBe('idle');
    expect(home('unit:p')).toBe('carrier:ship');
    expect(home('unit:sol')).toBe('outside');
    expect(home('good:furs')).toBe('warehouse');
    expect(home('cargo:ship:furs')).toBe('carrier:ship');
    expect(home('carrier:ship')).toBeNull();
    expect(home('colonist:ghost')).toBeNull();
    expect(home('unit:ghost')).toBeNull();
  });

  it('calls the place a token came from its home, and asks the game nothing', () => {
    const { asked, verdict } = probes(port());
    for (const [source, target] of [
      ['colonist:a', 'field:-1,-1'], ['colonist:b', 'trade:statesman'], ['colonist:c', 'idle'], ['unit:p', 'carrier:ship'],
      ['unit:sol', 'outside'], ['good:furs', 'warehouse'], ['cargo:ship:furs', 'carrier:ship'],
    ] as const) expect(verdict(source, target), `${source} on ${target}`).toBe('home');
    expect(asked).toEqual([]);
  });

  it('asks whether a colonist may leave, or take the job the place means', () => {
    const { one } = probes(port());
    expect(one('colonist:a', 'outside')).toEqual(['ok', { type: 'leaveColony', colonyId: 'col', colonistId: 'a' }]);
    expect(one('colonist:a', 'idle')).toEqual(['ok', { type: 'assignJob', colonyId: 'col', colonistId: 'a', job: { kind: 'idle' } }]);
    expect(one('colonist:c', 'trade:statesman')).toEqual(['ok', { type: 'assignJob', colonyId: 'col', colonistId: 'c', job: { kind: 'work', trade: 'statesman' } }]);
    expect(one('colonist:c', 'field:0,-1')).toEqual(['ok', { type: 'assignJob', colonyId: 'col', colonistId: 'c', job: { kind: 'field', dx: 0, dy: -1, good: 'food' } }]);
    // a square where nothing can be raised, and the places that are not for people, without asking
    expect(one('colonist:c', 'field:1,1')).toEqual(['bad', null]);
    expect(one('colonist:c', 'warehouse')).toEqual(['bad', null]);
    expect(one('colonist:c', 'carrier:ship')).toEqual(['bad', null]);

    const strict = probes(port(), 'assignJob');
    expect(strict.one('colonist:c', 'trade:statesman')[0]).toBe('bad');
    expect(strict.one('colonist:c', 'field:0,-1')[0]).toBe('bad');
    expect(strict.one('colonist:a', 'outside')[0]).toBe('ok');
    expect(probes(port(), 'leaveColony').one('colonist:a', 'outside')[0]).toBe('bad');
  });

  it('asks whether the colony may be abandoned when the last colonist is dragged outside', () => {
    const s = port();
    const alone = { ...s, colonies: { col: { ...s.colonies['col']!, colonists: s.colonies['col']!.colonists.filter((c) => c.id === 'a') } } };
    expect(probes(alone).one('colonist:a', 'outside')).toEqual(['ok', { type: 'abandonColony', colonyId: 'col' }]);
    expect(probes(alone, 'abandonColony').one('colonist:a', 'outside')[0]).toBe('bad');
    // refusing to let anyone leave does not turn the last one back: that is not what is asked
    expect(probes(alone, 'leaveColony').one('colonist:a', 'outside')[0]).toBe('ok');
  });

  it('allows a colonist onto native land without asking, since the drop offers to buy it or take it', () => {
    const { one } = probes(setTile(port(), 3, 2, { homeland: 'sioux' }), 'assignJob');
    expect(one('colonist:c', 'field:1,0')).toEqual(['ok', null]);
  });

  it('asks whether a unit may join, or step ashore, and refuses it the warehouse and the holds', () => {
    const { one } = probes(port());
    expect(one('unit:sol', 'warehouse')).toEqual(['bad', null]);
    expect(one('unit:sol', 'carrier:ship')).toEqual(['bad', null]);
    expect(one('unit:p', 'carrier:wagon')).toEqual(['bad', null]);
    expect(one('unit:p', 'warehouse')).toEqual(['bad', null]);
    expect(one('unit:p', 'outside')).toEqual(['ok', { type: 'goAshore', unitId: 'p' }]);
    for (const target of ['idle', 'trade:statesman', 'field:0,-1', 'field:1,1']) expect(one('unit:sol', target), target).toEqual(['ok', { type: 'joinColony', unitId: 'sol' }]);
    expect(one('unit:p', 'idle')).toEqual(['ok', { type: 'joinColony', unitId: 'p' }]);
    expect(probes(port(), 'goAshore').one('unit:p', 'outside')[0]).toBe('bad');
    expect(probes(port(), 'joinColony').one('unit:sol', 'trade:statesman')[0]).toBe('bad');
  });

  it('asks whether a hold takes what a plain drop would load, and sends a good nowhere else', () => {
    const { one } = probes(port());
    expect(one('good:furs', 'carrier:wagon')).toEqual(['ok', { type: 'loadCargo', unitId: 'wagon', good: 'furs', amount: 40 }]);
    expect(one('good:muskets', 'carrier:wagon')).toEqual(['bad', null]); // none to load
    for (const target of ['trade:statesman', 'field:0,-1', 'idle', 'outside']) expect(one('good:furs', target), target).toEqual(['bad', null]);
    expect(probes(port(), 'loadCargo').one('good:furs', 'carrier:ship')[0]).toBe('bad');
    // more than a hold of it in the warehouse: a plain drop loads one hold
    const s = port();
    const rich = { ...s, colonies: { col: { ...s.colonies['col']!, goods: { furs: 250 } } } };
    expect(probes(rich).one('good:furs', 'carrier:wagon')[1]).toMatchObject({ amount: 100 });
  });

  it('asks whether a lot may be unloaded or moved to another hold, whole, and sends it nowhere else', () => {
    const { one } = probes(port());
    expect(one('cargo:ship:furs', 'warehouse')).toEqual(['ok', { type: 'unloadCargo', unitId: 'ship', good: 'furs', amount: 100 }]);
    expect(one('cargo:ship:furs', 'carrier:wagon')).toEqual(['ok', { type: 'transferCargo', unitId: 'ship', toId: 'wagon', good: 'furs', amount: 100 }]);
    for (const target of ['trade:statesman', 'field:0,-1', 'idle', 'outside']) expect(one('cargo:ship:furs', target), target).toEqual(['bad', null]);
    // a lot that is not aboard moves nothing
    expect(one('cargo:ship:muskets', 'warehouse')).toEqual(['bad', null]);
    expect(one('cargo:ship:muskets', 'carrier:wagon')).toEqual(['bad', null]);
    expect(probes(port(), 'unloadCargo').one('cargo:ship:furs', 'warehouse')[0]).toBe('bad');
    expect(probes(port(), 'transferCargo').one('cargo:ship:furs', 'carrier:wagon')[0]).toBe('bad');
  });

  it('refuses a carrier token everywhere, and a token of no known kind', () => {
    const { one } = probes(port());
    expect(one('carrier:ship', 'warehouse')).toEqual(['bad', null]);
    expect(one('carrier:ship', 'carrier:wagon')).toEqual(['bad', null]);
    expect(one('nothing:x', 'idle')).toEqual(['bad', null]);
  });
});

describe('leaving and abandoning', () => {
  const alone = (): GameState => withColony(world({ rows: ROWS }), { id: 'col', x: 2, y: 2, name: 'Plymouth', colonists: [who('a', { kind: 'idle' })] });

  it('sending a colonist outside is leaving, and for the last one abandoning', () => {
    expect(leaveAction(town(), 'col', 'a')).toEqual({ type: 'leaveColony', colonyId: 'col', colonistId: 'a' });
    expect(leaveAction(alone(), 'col', 'a')).toEqual({ type: 'abandonColony', colonyId: 'col' });
    // somebody who is not there, or no colony at all, is left for the game to refuse
    expect(leaveAction(alone(), 'col', 'ghost')).toEqual({ type: 'leaveColony', colonyId: 'col', colonistId: 'ghost' });
    expect(leaveAction(alone(), 'nope', 'a')).toEqual({ type: 'leaveColony', colonyId: 'nope', colonistId: 'a' });
  });

  it('the question names the colony, counts who walks out and says what is lost', () => {
    const two = withColony(town(), { id: 'other', x: 4, y: 1, name: 'Boston' });
    const inland = { ...two, units: { far: two.units['far']! } };
    expect(abandonQuestion(inland, 'col')).toBe('Abandon Plymouth? Its 3 colonists will walk out and stand on the square. The buildings and everything in the warehouse are lost.');
    expect(abandonQuestion(inland, 'other')).toBe('Abandon Boston? Its one colonist will walk out and stand on the square. The buildings and everything in the warehouse are lost.');
    expect(abandonQuestion(inland, 'nope')).toBeNull();
  });

  it('adds what becomes of our ships in port, and of nobody else', () => {
    const two = withColony(town(), { id: 'other', x: 4, y: 1, name: 'Boston' });
    expect(abandonQuestion(two, 'col')).toContain('lost. Our ship in port leaves damaged and loses its cargo.');
    const fleet = withUnit(two, { id: 'ship2', type: 'merchantman', x: 2, y: 2 });
    expect(abandonQuestion(fleet, 'col')).toMatch(/Our 2 ships in port leave damaged and lose their cargo[.]$/);
    // a wagon train is no ship; nor is a ship elsewhere, or another power's
    let none: GameState = { ...two, units: { far: two.units['far']! } };
    none = withUnit(none, { id: 'wagon', type: 'wagonTrain', x: 2, y: 2 });
    none = withUnit(none, { id: 'away', type: 'caravel', x: 1, y: 2 });
    none = withUnit(none, { id: 'theirs', type: 'caravel', x: 2, y: 2, owner: 'b' });
    expect(abandonQuestion(none, 'col')).not.toContain('ship');
  });

  it('warns that the only colony is the charter, from the charter year on', () => {
    const warning = `This is our only colony: from ${CALENDAR.charterYear} on, holding no colony loses the charter.`;
    expect(abandonQuestion(alone(), 'col')).toBe(`Abandon Plymouth? Its one colonist will walk out and stand on the square. The buildings and everything in the warehouse are lost. ${warning}`);
    // another power's colony does not keep our charter; a second one of ours does
    expect(abandonQuestion(withColony(alone(), { id: 'theirs', x: 4, y: 3, owner: 'b' }), 'col')).toContain(warning);
    expect(abandonQuestion(withColony(alone(), { id: 'ours', x: 4, y: 3 }), 'col')).not.toContain('charter');
  });
});
