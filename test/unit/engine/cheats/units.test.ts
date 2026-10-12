import { describe, expect, it } from 'vitest';
import { applyAction, validateAction, type Action, type GameEvent } from '../../../../src/engine/actions';
import { CHEAT_SPECS, checkCheat, type CheatArgValue, type CheatCommand, type Place } from '../../../../src/engine/cheats';
import { UNIT_SPECS } from '../../../../src/engine/cheats/units';
import { CHEATS } from '../../../../src/engine/data/cheats';
import { COLONY_LIMITS } from '../../../../src/engine/data/colony';
import type { ProfessionId } from '../../../../src/engine/data/professions';
import { PIONEER_TOOLS, UNIT_TYPES, type UnitTypeId } from '../../../../src/engine/data/units';
import { newDockUnit } from '../../../../src/engine/europe';
import { revealAround } from '../../../../src/engine/explore';
import { checkInvariants } from '../../../../src/engine/invariants';
import { fullMoves, turnMoves } from '../../../../src/engine/movement';
import { MOVE_THIRDS, OFF_MAP, type Colonist, type GameState, type Settlement, type Unit } from '../../../../src/engine/state';
import { deepFreeze } from '../../../helpers/freeze';
import { setTile, withColony, withUnit, world } from '../../../helpers/world';

//             01234567
const ROWS = ['~~~~~~~~',
              '~......~',
              '~..m...~',
              '~......~',
              '~......~',
              '~~~~~~~~'];
const VILLAGE: Settlement = { id: 'v', tribe: 'sioux', x: 5, y: 1, capital: false, population: 3, growth: 0, taught: false, tributePaid: false, alarm: {}, mission: null, scouted: [], lastBought: null, lastSold: null, haggleMemory: null };

/**
 * Jamestown (a's) at 2,2 and Quebec (b's) at 5,4; a village at 5,1; b's soldier at 4,3. Of a's own:
 * a caravel at 1,0 with a colonist aboard, a fortified soldier at 1,4, a damaged caravel in
 * Jamestown and a galleon in port in Europe.
 */
function land(options: { atWar?: boolean; fathers?: readonly string[] } = {}): GameState {
  let s = world({ rows: ROWS, players: [{ id: 'a', atWar: options.atWar, fathers: options.fathers }, { id: 'b', kind: 'ai' }] });
  s = withColony(s, { id: 'c1', name: 'Jamestown', x: 2, y: 2 });
  s = withColony(s, { id: 'c2', name: 'Quebec', x: 5, y: 4, owner: 'b' });
  s = withUnit(s, { id: 'f1', owner: 'b', type: 'soldier', x: 4, y: 3 });
  s = withUnit(s, { id: 's1', type: 'caravel', x: 1, y: 0, movesLeft: 5 });
  s = withUnit(s, { id: 'p1', x: 1, y: 0, aboard: 's1', orders: 'sentry' });
  s = withUnit(s, { id: 'm1', type: 'soldier', x: 1, y: 4, movesLeft: 0, orders: 'fortified' });
  s = withUnit(s, { id: 'd1', type: 'caravel', x: 2, y: 2, movesLeft: 0 });
  s = withUnit(s, { id: 'e1', type: 'galleon', x: OFF_MAP, y: OFF_MAP, movesLeft: 0 });
  const units = { ...s.units, d1: { ...(s.units.d1 as Unit), repair: 3 }, e1: { ...(s.units.e1 as Unit), voyage: { phase: 'inEurope' as const, turnsLeft: 0, origin: [1, 0] as const } } };
  return deepFreeze({ ...s, units, settlements: { v: VILLAGE }, nextId: 20 });
}

const cheat = (command: CheatCommand, player?: string): Action => (player === undefined ? { type: 'cheat', command } : { type: 'cheat', player, command });
const at = (x: number, y: number): Place => ({ kind: 'square', x, y });
const spawn = (unitType: UnitTypeId, place: Place, profession: ProfessionId | null = null): CheatCommand => ({ cheat: 'spawn', unitType, profession, place });
const summary = (events: readonly GameEvent[]): string => (events.find((e) => e.type === 'cheatApplied') as { summary: string }).summary;
/** Apply a cheat that must be accepted, and see the state is still a sound one. */
function run(state: GameState, command: CheatCommand, player?: string): { state: GameState; said: string } {
  expect(validateAction(state, cheat(command, player))).toEqual({ ok: true });
  const { state: next, events } = applyAction(state, cheat(command, player));
  expect(checkInvariants(next)).toEqual([]);
  return { state: next, said: summary(events) };
}
function refusal(state: GameState, command: CheatCommand, player?: string): { code: string; message: string } {
  const check = validateAction(state, cheat(command, player));
  if (check.ok) throw new Error(`expected a refusal of ${JSON.stringify(command)}`);
  return check.error;
}

describe('spawn at a square', () => {
  it('puts a land unit on land: full moves, no orders, the power as owner, the next id', () => {
    const state = land();
    const { state: next, said } = run(state, spawn('soldier', at(3, 3)));
    const unit = next.units.u20 as Unit;
    expect(unit).toEqual({
      id: 'u20', owner: 'a', type: 'soldier', profession: 'freeColonist', x: 3, y: 3, movesLeft: fullMoves(unit), orders: 'none',
      destination: null, aboard: null, cargo: {}, tools: 0, workTurns: 0, route: null, repair: 0, treasure: 0, voyage: null,
    });
    expect(unit.movesLeft).toBe(UNIT_TYPES.soldier.moves * MOVE_THIRDS);
    expect(next.nextId).toBe(21);
    expect(Object.keys(next.units)).toHaveLength(Object.keys(state.units).length + 1);
    expect(said).toBe('Spawned Free Colonist (Soldier) u20 at 3,3.');
    // nothing but the new unit and the counter changed
    expect({ ...next, units: state.units, nextId: 20, players: state.players }).toEqual(state);
  });

  it('takes the profession given, and the next id each time', () => {
    const once = run(land(), spawn('colonist', at(3, 3), 'expertFarmer'));
    expect(once.state.units.u20).toMatchObject({ type: 'colonist', profession: 'expertFarmer' });
    expect(once.said).toBe('Spawned Expert Farmer u20 at 3,3.');
    const twice = run(once.state, spawn('scout', at(3, 3), 'seasonedScout'));
    expect(twice.state.units.u21).toMatchObject({ type: 'scout', profession: 'seasonedScout', movesLeft: 4 * MOVE_THIRDS });
    expect(twice.state.nextId).toBe(22);
  });

  it('puts a ship on water, or on the square of the power\'s own colony', () => {
    const atSea = run(land(), spawn('frigate', at(3, 0)));
    expect(atSea.state.units.u20).toMatchObject({ type: 'frigate', profession: null, x: 3, y: 0, owner: 'a', orders: 'none', movesLeft: UNIT_TYPES.frigate.moves * MOVE_THIRDS });
    expect(atSea.said).toBe('Spawned Frigate u20 at 3,0.');
    const inPort = run(land(), spawn('caravel', at(2, 2)));
    expect(inPort.state.units.u20).toMatchObject({ type: 'caravel', x: 2, y: 2 });
    // beside a ship of the power's own
    expect(run(land(), spawn('caravel', at(1, 0))).state.units.u20).toMatchObject({ x: 1, y: 0, aboard: null });
  });

  it('makes the squares in the unit\'s sight known to its owner and to nobody else', () => {
    const lit = land();
    const dark: GameState = { ...lit, map: { ...lit.map, tiles: lit.map.tiles.map((t) => ({ ...t, explored: 0 })) } };
    const soldier = run(dark, spawn('soldier', at(3, 3))).state;
    expect(soldier.map).toEqual(revealAround(dark.map, 0, 3, 3, 1).map);
    expect(soldier.map.tiles.filter((t) => t.explored === 0b01)).toHaveLength(9);
    const scout = run(dark, spawn('scout', at(3, 3))).state;
    expect(scout.map).toEqual(revealAround(dark.map, 0, 3, 3, 2).map);
    // de Soto lengthens it, as he does for a unit that moves
    const farther = { ...dark, players: dark.players.map((p) => (p.id === 'a' ? { ...p, fathers: ['hernandoDeSoto' as const] } : p)) };
    expect(run(farther, spawn('soldier', at(3, 3))).state.map).toEqual(revealAround(dark.map, 0, 3, 3, 2).map);
    // for another power, that power's bit
    const theirs = run(dark, spawn('soldier', at(5, 4)), 'b').state;
    expect(theirs.units.u20).toMatchObject({ owner: 'b', x: 5, y: 4 });
    expect(theirs.map).toEqual(revealAround(dark.map, 1, 5, 4, 1).map);
  });

  it('is refused on the wrong ground and off the map', () => {
    const state = land();
    expect(refusal(state, spawn('caravel', at(3, 3)))).toEqual({ code: 'cheatSquare', message: 'a Caravel needs water or a colony of its own, and 3,3 is land' });
    expect(refusal(state, spawn('soldier', at(3, 0)))).toEqual({ code: 'cheatSquare', message: 'a Soldier cannot stand on the water at 3,0' });
    // a land unit cannot be put aboard: the ship's square is water
    expect(refusal(state, spawn('soldier', at(1, 0))).code).toBe('cheatSquare');
    for (const [x, y] of [[-1, 2], [8, 2], [3, 6], [3, -1], [2.5, 2]] as const) {
      expect(refusal(state, spawn('soldier', at(x, y))), `${x},${y}`).toEqual({ code: 'cheatSquare', message: `there is no square ${x},${y} on the map` });
    }
    // mountains are land
    expect(run(state, spawn('soldier', at(3, 2))).state.units.u20).toMatchObject({ x: 3, y: 2 });
  });

  it('is refused on a settlement, on another power\'s colony and on a square holding a foreign unit', () => {
    const state = land();
    expect(refusal(state, spawn('soldier', at(5, 1)))).toEqual({ code: 'cheatSquare', message: 'a native settlement stands at 5,1' });
    expect(refusal(state, spawn('soldier', at(5, 4)))).toEqual({ code: 'cheatSquare', message: 'Quebec at 5,4 is another power\'s colony' });
    expect(refusal(state, spawn('caravel', at(5, 4))).code).toBe('cheatSquare');
    expect(refusal(state, spawn('soldier', at(4, 3)))).toEqual({ code: 'cheatSquare', message: 'another\'s unit stands at 4,3' });
    // each power's own ground is the other's foreign ground
    expect(refusal(state, spawn('soldier', at(2, 2)), 'b').message).toBe('Jamestown at 2,2 is another power\'s colony');
    expect(refusal(state, spawn('soldier', at(1, 4)), 'b').message).toBe('another\'s unit stands at 1,4');
    expect(validateAction(state, cheat(spawn('soldier', at(4, 3)), 'b')).ok).toBe(true);
  });

  it('is refused for the natives\' types, for damaged artillery and for a type there is not', () => {
    const state = land();
    for (const type of ['brave', 'armedBrave', 'mountedBrave', 'mountedWarrior'] as const) {
      expect(refusal(state, spawn(type, at(3, 3))), type).toEqual({ code: 'cheatTarget', message: `${UNIT_TYPES[type].name} are the natives' own and cannot be spawned` });
    }
    expect(refusal(state, spawn('damagedArtillery', at(3, 3)))).toEqual({ code: 'cheatTarget', message: 'Damaged Artillery cannot be spawned; spawn artillery' });
    expect(refusal(state, spawn('dreadnought' as UnitTypeId, at(3, 3)))).toEqual({ code: 'cheatTarget', message: 'there is no unit type "dreadnought"' });
    expect(refusal(state, { cheat: 'spawn', unitType: 'soldier', profession: null } as unknown as CheatCommand)).toEqual({ code: 'cheatSquare', message: 'spawn needs a place: a square, a colony or europe' });
  });

  it('is refused for a profession on a type that takes none, and for one no colonist has', () => {
    const state = land();
    for (const type of ['artillery', 'caravel', 'wagonTrain', 'treasure', 'regular', 'continentalArmy'] as const) {
      expect(refusal(state, spawn(type, at(3, 3), 'expertFarmer')), type).toEqual({ code: 'cheatTarget', message: `a ${UNIT_TYPES[type].name} takes no profession` });
    }
    for (const profession of ['veteranDragoon', 'expertTeacher', 'wizard'] as ProfessionId[]) {
      expect(refusal(state, spawn('soldier', at(3, 3), profession)), profession).toEqual({ code: 'cheatTarget', message: `there is no profession "${profession}" for a colonist` });
    }
  });

  it('gives a treasure train its gold, a pioneer his tools, and the line troops their veteran\'s name', () => {
    const treasure = run(land(), spawn('treasure', at(3, 3))).state.units.u20 as Unit;
    expect(treasure).toMatchObject({ type: 'treasure', profession: null, treasure: CHEATS.treasureGold, tools: 0 });
    const pioneer = run(land(), spawn('pioneer', at(3, 3), 'hardyPioneer')).state.units.u20 as Unit;
    expect(pioneer).toMatchObject({ type: 'pioneer', profession: 'hardyPioneer', tools: PIONEER_TOOLS.max, treasure: 0 });
    expect(run(land(), spawn('artillery', at(3, 3))).state.units.u20).toMatchObject({ profession: null, tools: 0, treasure: 0 });
    // as the game's own code raises them
    expect(run(land(), spawn('continentalArmy', at(3, 3))).state.units.u20).toMatchObject({ profession: 'veteranSoldier' });
    expect(run(land(), spawn('continentalCavalry', at(3, 3))).state.units.u20).toMatchObject({ profession: 'veteranSoldier' });
    expect(run(land(), spawn('regular', at(3, 3))).state.units.u20).toMatchObject({ profession: null });
  });
});

describe('spawn in a colony', () => {
  const jamestown: Place = { kind: 'colony', colonyId: 'c1' };

  it('makes a colonist of a colonist\'s type, with the profession given and the kit in the warehouse', () => {
    const state = land();
    const { state: next, said } = run(state, spawn('soldier', jamestown, 'veteranSoldier'));
    const colony = next.colonies.c1!;
    expect(colony.colonists).toHaveLength(2);
    expect(colony.colonists[1]).toMatchObject({ id: 'u20', profession: 'veteranSoldier', turns: 0 });
    expect(colony.goods).toEqual({ muskets: UNIT_TYPES.soldier.equipment.muskets });
    expect(next.units.u20).toBeUndefined();
    expect(next.units).toEqual(state.units);
    expect(next.nextId).toBe(21);
    expect(colony.sol.d).toBeGreaterThan(state.colonies.c1!.sol.d);
    expect(said).toBe('Spawned Veteran Soldier u20 as a colonist of Jamestown.');
  });

  it('defaults to a free colonist, and hands in a pioneer\'s tools and a dragoon\'s horses', () => {
    const plain = run(land(), spawn('colonist', jamestown)).state.colonies.c1!;
    expect(plain.colonists[1]).toMatchObject({ id: 'u20', profession: 'freeColonist' });
    expect(plain.goods).toEqual({});
    expect(run(land(), spawn('pioneer', jamestown)).state.colonies.c1!.goods).toEqual({ tools: PIONEER_TOOLS.max });
    expect(run(land(), spawn('dragoon', jamestown)).state.colonies.c1!.goods).toEqual({ muskets: 50, horses: 50 });
  });

  it('is refused when the colony is full, is not the power\'s, or does not exist', () => {
    const state = land();
    const crowd: Colonist[] = Array.from({ length: COLONY_LIMITS.maxPopulation }, (_, i) => ({ id: `x${i}`, profession: 'freeColonist', job: { kind: 'idle' }, turns: 0 }));
    const full: GameState = { ...state, colonies: { ...state.colonies, c1: { ...state.colonies.c1!, colonists: crowd } } };
    expect(refusal(full, spawn('colonist', jamestown))).toEqual({ code: 'cheatTarget', message: `Jamestown is full, with ${COLONY_LIMITS.maxPopulation} colonists` });
    const almost: GameState = { ...state, colonies: { ...state.colonies, c1: { ...state.colonies.c1!, colonists: crowd.slice(1) } } };
    expect(validateAction(almost, cheat(spawn('colonist', jamestown))).ok).toBe(true);
    // a full colony still has room on its square
    expect(validateAction(full, cheat(spawn('artillery', jamestown))).ok).toBe(true);
    expect(refusal(state, spawn('colonist', { kind: 'colony', colonyId: 'c2' }))).toEqual({ code: 'cheatTarget', message: 'Quebec is not a colony of A' });
    expect(refusal(state, spawn('colonist', jamestown), 'b')).toEqual({ code: 'cheatTarget', message: 'Jamestown is not a colony of B' });
    expect(refusal(state, spawn('colonist', { kind: 'colony', colonyId: 'c9' }))).toEqual({ code: 'cheatTarget', message: 'there is no colony "c9"' });
  });

  it('leaves a soldier spawned on the colony\'s own square standing there', () => {
    const state = land();
    const { state: next } = run(state, spawn('soldier', at(2, 2)));
    expect(next.units.u20).toMatchObject({ type: 'soldier', x: 2, y: 2, aboard: null, movesLeft: fullMoves(next.units.u20 as Unit) });
    expect(next.colonies).toEqual(state.colonies);
  });

  it('stands any other type on the colony\'s square', () => {
    const state = land();
    const gun = run(state, spawn('artillery', jamestown));
    expect(gun.state.units.u20).toMatchObject({ type: 'artillery', x: 2, y: 2, orders: 'none', movesLeft: MOVE_THIRDS });
    expect(gun.state.colonies).toEqual(state.colonies);
    expect(gun.said).toBe('Spawned Artillery u20 at 2,2.');
    expect(run(state, spawn('merchantman', jamestown)).state.units.u20).toMatchObject({ type: 'merchantman', x: 2, y: 2 });
  });
});

describe('spawn in Europe', () => {
  const europe: Place = { kind: 'europe' };

  it('lays a ship in port and stands a person on the docks, as the docks make them', () => {
    const state = land();
    const { state: next, said } = run(state, spawn('caravel', europe));
    expect(next.units.u20).toEqual(newDockUnit(state, 'a', 'caravel', null));
    expect(next.units.u20).toMatchObject({ x: OFF_MAP, y: OFF_MAP, movesLeft: 0, orders: 'none', voyage: { phase: 'inEurope', turnsLeft: 0 } });
    expect(next.nextId).toBe(21);
    expect(next.map).toBe(state.map);
    expect(said).toBe('Spawned Caravel u20 in Europe.');
    const farmer = run(state, spawn('colonist', europe, 'expertFarmer')).state.units.u20;
    expect(farmer).toEqual(newDockUnit(state, 'a', 'colonist', 'expertFarmer'));
    expect(farmer).toMatchObject({ orders: 'sentry' });
    expect(run(state, spawn('pioneer', europe)).state.units.u20).toMatchObject({ tools: PIONEER_TOOLS.max, profession: 'freeColonist' });
  });

  it('is refused when Europe is closed to the power, and for what no ship could carry away', () => {
    expect(refusal(land({ atWar: true }), spawn('caravel', europe))).toEqual({ code: 'cheatTarget', message: 'Europe is closed to A' });
    expect(validateAction(land({ atWar: true }), cheat(spawn('caravel', at(3, 0)))).ok).toBe(true);
    expect(refusal(land(), spawn('wagonTrain', europe))).toEqual({ code: 'cheatTarget', message: 'a Wagon Train could never leave Europe: no ship carries one' });
    expect(validateAction(land(), cheat(spawn('treasure', europe))).ok).toBe(true);
  });
});

describe('teleport', () => {
  const teleport = (unit: string, x: number, y: number): CheatCommand => ({ cheat: 'teleport', unit, to: { x, y } });

  it('moves the unit and every unit aboard it, keeping its moves', () => {
    const state = land();
    const { state: next, said } = run(state, teleport('s1', 6, 5));
    expect(next.units.s1).toEqual({ ...state.units.s1, x: 6, y: 5 });
    expect(next.units.p1).toEqual({ ...state.units.p1, x: 6, y: 5 });
    expect(next.units.s1!.movesLeft).toBe(5);
    expect(said).toBe('Moved Caravel s1 to 6,5 with 1 aboard.');
    expect({ ...next, units: state.units, players: state.players }).toEqual(state);
  });

  it('brings a ship into the power\'s own colony, and a land unit onto land', () => {
    const state = land();
    expect(run(state, teleport('s1', 2, 2)).state.units.p1).toMatchObject({ x: 2, y: 2, aboard: 's1' });
    const { state: next, said } = run(state, teleport('m1', 6, 1));
    // the orders it stood under belonged to the square it left
    expect(next.units.m1).toEqual({ ...state.units.m1, x: 6, y: 1, orders: 'none' });
    expect(said).toBe('Moved Free Colonist (Soldier) m1 to 6,1.');
    // and where it stands already
    expect(validateAction(state, cheat(teleport('m1', 1, 4))).ok).toBe(true);
  });

  it('makes the squares in its sight known to the owner', () => {
    const lit = land();
    const dark: GameState = { ...lit, map: { ...lit.map, tiles: lit.map.tiles.map((t) => ({ ...t, explored: 0 })) } };
    expect(run(dark, teleport('m1', 6, 1)).state.map).toEqual(revealAround(dark.map, 0, 6, 1, 1).map);
  });

  it('digs up no rumour and meets nobody by itself', () => {
    const state = setTile(land(), 6, 1, { rumor: true });
    const { state: next } = run(state, teleport('m1', 6, 1));
    expect(next.map.tiles[1 * next.map.width + 6]).toMatchObject({ rumor: true });
    expect(next.rumors).toEqual(state.rumors);
    const spawned = run(state, spawn('scout', at(6, 1))).state;
    expect(spawned.map.tiles[1 * spawned.map.width + 6]).toMatchObject({ rumor: true });
  });

  it('is refused for a unit on a voyage or aboard a carrier', () => {
    const state = land();
    expect(refusal(state, teleport('e1', 3, 0))).toEqual({ code: 'cheatTarget', message: 'Galleon e1 is not on the map' });
    expect(refusal(state, teleport('p1', 3, 3))).toEqual({ code: 'cheatTarget', message: 'Free Colonist p1 is aboard s1; teleport the carrier' });
  });

  it('is refused for a square the unit could not stand on', () => {
    const state = land();
    expect(refusal(state, teleport('s1', 3, 3)).code).toBe('cheatSquare');
    expect(refusal(state, teleport('m1', 3, 0)).code).toBe('cheatSquare');
    expect(refusal(state, teleport('m1', 5, 1)).message).toBe('a native settlement stands at 5,1');
    expect(refusal(state, teleport('m1', 5, 4)).message).toBe('Quebec at 5,4 is another power\'s colony');
    expect(refusal(state, teleport('m1', 4, 3)).message).toBe('another\'s unit stands at 4,3');
    expect(refusal(state, teleport('m1', 9, 9)).message).toBe('there is no square 9,9 on the map');
    expect(refusal(state, { cheat: 'teleport', unit: 'm1' } as unknown as CheatCommand).code).toBe('cheatSquare');
  });

  it('is refused for a unit of another power, by name, and for one there is not', () => {
    const state = land();
    expect(refusal(state, teleport('f1', 3, 3))).toEqual({ code: 'cheatTarget', message: 'Free Colonist (Soldier) f1 is not a unit of A' });
    expect(refusal(state, teleport('zz', 3, 3))).toEqual({ code: 'cheatTarget', message: 'there is no unit "zz"' });
    // a name every object answers to is still no unit, and no colony
    for (const id of ['constructor', 'toString', '__proto__']) {
      expect(refusal(state, teleport(id, 3, 3)), id).toEqual({ code: 'cheatTarget', message: `there is no unit "${id}"` });
      expect(refusal(state, spawn('colonist', { kind: 'colony', colonyId: id })), id).toEqual({ code: 'cheatTarget', message: `there is no colony "${id}"` });
    }
    expect(run(state, teleport('f1', 3, 3), 'b').state.units.f1).toMatchObject({ x: 3, y: 3 });
  });
});

describe('moves, repair and promote', () => {
  const on = (name: 'moves' | 'repair' | 'promote', unit: string): CheatCommand => ({ cheat: name, unit });

  it('moves restores the unit\'s moves for the turn', () => {
    const state = land();
    const { state: next, said } = run(state, on('moves', 'm1'));
    expect(next.units.m1).toEqual({ ...state.units.m1, movesLeft: MOVE_THIRDS });
    expect(said).toBe('Restored the moves of Free Colonist (Soldier) m1.');
    // a ship's are what the turn would give her, Magellan's move and all
    const magellan = land({ fathers: ['ferdinandMagellan'] });
    const ship = run(magellan, on('moves', 's1')).state.units.s1 as Unit;
    expect(ship.movesLeft).toBe(turnMoves(magellan, ship));
    expect(ship.movesLeft).toBeGreaterThan(fullMoves(ship));
    expect(run(state, on('moves', 'p1')).state.units.p1).toMatchObject({ movesLeft: MOVE_THIRDS, aboard: 's1' });
  });

  it('moves is refused for a unit off the map, a ship under repair and another\'s unit', () => {
    const state = land();
    expect(refusal(state, on('moves', 'e1'))).toEqual({ code: 'cheatTarget', message: 'Galleon e1 is not on the map' });
    expect(refusal(state, on('moves', 'd1'))).toEqual({ code: 'cheatTarget', message: 'Caravel d1 is under repair; repair her first' });
    expect(refusal(state, on('moves', 'f1')).message).toBe('Free Colonist (Soldier) f1 is not a unit of A');
    expect(refusal(state, on('moves', 'zz')).message).toBe('there is no unit "zz"');
  });

  it('repair makes a damaged ship sound, on the map or in Europe', () => {
    const state = land();
    const { state: next, said } = run(state, on('repair', 'd1'));
    expect(next.units.d1).toEqual({ ...state.units.d1, repair: 0 });
    expect(said).toBe('Repaired Caravel d1.');
    const abroad: GameState = { ...state, units: { ...state.units, e1: { ...(state.units.e1 as Unit), repair: 4 } } };
    expect(run(abroad, on('repair', 'e1')).state.units.e1).toMatchObject({ repair: 0, voyage: { phase: 'inEurope' } });
    // and then she may have her moves
    expect(validateAction(next, cheat(on('moves', 'd1'))).ok).toBe(true);
  });

  it('repair is refused for anything but a ship under repair', () => {
    const state = land();
    expect(refusal(state, on('repair', 's1'))).toEqual({ code: 'cheatTarget', message: 'Caravel s1 is not a ship under repair' });
    expect(refusal(state, on('repair', 'm1')).message).toBe('Free Colonist (Soldier) m1 is not a ship under repair');
    expect(refusal(state, on('repair', 'f1')).message).toBe('Free Colonist (Soldier) f1 is not a unit of A');
  });

  it('promote makes a soldier or a dragoon a veteran', () => {
    const state = land();
    const { state: next, said } = run(state, on('promote', 'm1'));
    expect(next.units.m1).toEqual({ ...state.units.m1, profession: 'veteranSoldier' });
    expect(said).toBe('Promoted Free Colonist (Soldier) m1 to Veteran Soldier (Soldier).');
    const mounted = withUnit(state, { id: 'h1', type: 'dragoon', x: 1, y: 1, profession: 'expertFarmer' });
    expect(run(mounted, on('promote', 'h1')).state.units.h1).toMatchObject({ type: 'dragoon', profession: 'veteranSoldier' });
  });

  it('promote is refused for anything else, and for one already a veteran', () => {
    const state = land();
    expect(refusal(next(state), on('promote', 'm1'))).toEqual({ code: 'cheatTarget', message: 'Veteran Soldier (Soldier) m1 is a veteran already' });
    expect(refusal(state, on('promote', 'p1'))).toEqual({ code: 'cheatTarget', message: 'Free Colonist p1 is neither a soldier nor a dragoon' });
    expect(refusal(state, on('promote', 's1')).message).toBe('Caravel s1 is neither a soldier nor a dragoon');
    // the dragoons a mercenary offer lands fight as veterans already
    const hired = withUnit(state, { id: 'h1', type: 'dragoon', x: 1, y: 1, profession: 'veteranDragoon' });
    expect(refusal(hired, on('promote', 'h1'))).toEqual({ code: 'cheatTarget', message: 'Veteran Dragoon (Dragoon) h1 is a veteran already' });
    const line = withUnit(state, { id: 'l1', type: 'continentalArmy', x: 1, y: 1, profession: 'veteranSoldier' });
    expect(refusal(line, on('promote', 'l1')).message).toBe('Continental Army l1 is neither a soldier nor a dragoon');
    expect(refusal(state, on('promote', 'f1')).message).toBe('Free Colonist (Soldier) f1 is not a unit of A');
    function next(s: GameState): GameState {
      return applyAction(s, cheat(on('promote', 'm1'))).state;
    }
  });
});

describe('the unit specs', () => {
  // arguments as the parser would hand them over, by spec and argument name
  const ARGS: Record<string, Record<string, CheatArgValue>> = {
    spawn: { unitType: 'soldier', profession: 'veteranSoldier', place: { kind: 'square', x: 3, y: 3 } },
    teleport: { unit: 'm1', square: { x: 6, y: 1 } },
    moves: { unit: 'm1' },
    repair: { unit: 'd1' },
    promote: { unit: 'm1' },
  };

  it('are the five of this group, listed after the map\'s', () => {
    expect(UNIT_SPECS.map((s) => s.name)).toEqual(['spawn', 'teleport', 'moves', 'repair', 'promote']);
    const names = CHEAT_SPECS.map((s) => s.name);
    expect(names.slice(names.indexOf('spawn'), names.indexOf('spawn') + 5)).toEqual(UNIT_SPECS.map((s) => s.name));
    expect(names.indexOf('spawn')).toBeGreaterThan(names.indexOf('rumor'));
  });

  it.each(UNIT_SPECS.map((s) => [s.name, s] as const))('%s builds a command the check accepts', (name, spec) => {
    const args = ARGS[name];
    if (!args) throw new Error(`no test arguments for the cheat "${name}"`);
    expect(Object.keys(args).sort()).toEqual(spec.args.map((a) => a.name).sort());
    const state = land();
    const command = spec.build(args);
    expect(checkCheat(state, 'a', command)).toEqual({ ok: true });
    expect(() => applyAction(state, cheat(command))).not.toThrow();
    // a place left out is filled in by the console (the active unit's square) before the build
    const required = Object.fromEntries(spec.args.filter((a) => !a.optional || a.kind === 'place').map((a) => [a.name, args[a.name]]));
    expect(checkCheat(state, 'a', spec.build(required))).toEqual({ ok: true });
  });

  it('spawn builds each kind of place, and a line with no place is refused in words', () => {
    const spec = UNIT_SPECS.find((s) => s.name === 'spawn')!;
    expect(spec.build({ unitType: 'caravel', place: { kind: 'europe' } })).toEqual({ cheat: 'spawn', unitType: 'caravel', profession: null, place: { kind: 'europe' } });
    expect(spec.build({ unitType: 'colonist', profession: 'expertFarmer', place: { kind: 'colony', colonyId: 'c1' } })).toEqual({ cheat: 'spawn', unitType: 'colonist', profession: 'expertFarmer', place: { kind: 'colony', colonyId: 'c1' } });
    expect(spec.build({ unitType: 'galleon', place: { kind: 'square', x: 3, y: 0 } })).toEqual({ cheat: 'spawn', unitType: 'galleon', profession: null, place: { kind: 'square', x: 3, y: 0 } });
    expect(checkCheat(land(), 'a', spec.build({ unitType: 'soldier' }))).toEqual({ ok: false, code: 'cheatSquare', message: 'spawn needs a place: a square, a colony or europe' });
  });
});
