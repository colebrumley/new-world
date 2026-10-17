import { describe, expect, it } from 'vitest';
import { SIGHT } from '../../../src/engine/data/sight';
import type { GameState, Unit } from '../../../src/engine/state';
import { makeTile } from '../../../src/engine/tile';
import { sidebarModel } from '../../../src/ui/sidebar';
import { groundFeatures, placeTooltip, slipUnits, tileTip, TOOLTIP_DELAY_MS, TOOLTIP_GAP, TOOLTIP_UNIT_LIMIT } from '../../../src/ui/tile-tooltip';
import { setTile, withColony, withUnit, world } from '../../helpers/world';

const land = () => world({ rows: ['.....', '.....', '.....'] });

describe('tileTip', () => {
  it('names the terrain row that governs the square', () => {
    let s = land();
    s = setTile(s, 1, 1, { forest: true });
    s = setTile(s, 2, 1, { base: 'grassland', forest: true, relief: 'hills' });
    s = setTile(s, 3, 1, { base: 'grassland' });
    expect(tileTip(s, 1, 1)?.title).toBe('Mixed Forest');
    expect(tileTip(s, 2, 1)?.title).toBe('Hills');
    expect(tileTip(s, 3, 1)?.title).toBe('Grassland');
  });

  it('says what each resource does, from the bonus table', () => {
    const effect = (patch: Parameters<typeof setTile>[3]) => tileTip(setTile(land(), 1, 1, patch), 1, 1)?.features[0];
    expect(effect({ resource: 'wheat' })).toBe('Wheat: +2 Food');
    expect(effect({ base: 'tundra', resource: 'minerals' })).toBe('Minerals: +3 Ore, +1 Silver');
    expect(effect({ base: 'prairie', resource: 'primeCotton' })).toBe('Prime Cotton: doubles Cotton');
    expect(effect({ relief: 'mountains', resource: 'depletedMine' })).toBe('Depleted Mine: nothing left to dig');
    expect(effect({ base: 'ocean', resource: 'fishery' })).toBe('Fishery: +3 Fish');
  });

  it('lists the features in order: resource, river, road, plowed, rumor', () => {
    const s = setTile(land(), 1, 1, { resource: 'wheat', river: 'major', road: true, plowed: true, rumor: true });
    expect(tileTip(s, 1, 1)?.features).toEqual(['Wheat: +2 Food', 'Major River', 'Road', 'Plowed', 'Lost City Rumor']);
    expect(tileTip(setTile(land(), 1, 1, { river: 'minor' }), 1, 1)?.features).toEqual(['Minor River']);
    expect(tileTip(land(), 1, 1)?.features).toEqual([]);
  });

  it('gives what a free colonist brings in', () => {
    expect(tileTip(land(), 1, 1)?.yields).toBe('5 Food, 2 Cotton, 1 Ore');
    const timber = setTile(land(), 1, 1, { base: 'grassland', forest: true, resource: 'primeTimber' });
    expect(tileTip(timber, 1, 1)?.yields).toBe('2 Food, 1 Tobacco, 2 Furs, 10 Lumber');
    const openSea = world({ rows: ['~~~', '~~~', '~~~'] });
    expect(tileTip(openSea, 1, 1)?.yields).toBe('1 Fish');
    const coast = world({ rows: ['...', '.~.', '~~~'] });
    expect(tileTip(coast, 1, 1)?.yields).toBe('4 Fish');
    expect(tileTip(world({ rows: ['a'] }), 0, 0)?.yields).toBe('');
  });

  it('gives the move cost and the defence bonus', () => {
    expect(tileTip(land(), 1, 1)?.ground).toBe('Move 1 · Defence none');
    expect(tileTip(setTile(land(), 1, 1, { forest: true }), 1, 1)?.ground).toBe('Move 2 · Defence +50%');
    expect(tileTip(setTile(land(), 1, 1, { relief: 'hills' }), 1, 1)?.ground).toBe('Move 2 · Defence +100%');
  });

  it('is null off the map and on a square the viewer has not explored, unless all is revealed', () => {
    const s = setTile(land(), 1, 1, { explored: 0b10 });
    expect(tileTip(s, -1, 0)).toBeNull();
    expect(tileTip(s, 5, 0)).toBeNull();
    expect(tileTip(s, 1, 1)).toBeNull();
    expect(tileTip(s, 1, 1, true)?.title).toBe('Plains');
  });
});

describe('tileTip units', () => {
  const four = (rows = ['.....', '.....', '~~~~~']): GameState =>
    world({ rows, players: [{ id: 'a' }, { id: 'b', nation: 'france' }, { id: 'c', nation: 'spain' }, { id: 'd', nation: 'netherlands' }] });
  const units = (s: GameState, x: number, y: number, revealAll = false, active: string | null = null) => tileTip(s, x, y, revealAll, active)?.units;
  const lines = (s: GameState, x: number, y: number, revealAll = false, active: string | null = null) => units(s, x, y, revealAll, active)?.map((u) => u.line);
  const patch = (s: GameState, id: string, change: Partial<Unit>): GameState => ({ ...s, units: { ...s.units, [id]: { ...s.units[id]!, ...change } } });

  it('is empty on a square with no unit', () => {
    const s = withUnit(four(), { id: 'u1', type: 'soldier', x: 1, y: 1 });
    expect(units(s, 3, 0)).toEqual([]);
    expect(tileTip(s, 3, 0)).toEqual({ ...tileTip(four(), 3, 0) });
  });

  it("describes each of the viewer's units with its label, moves and orders, the top of the stack first", () => {
    let s = withUnit(four(), { id: 'u1', type: 'soldier', profession: 'veteranSoldier', x: 1, y: 1, orders: 'fortified' });
    s = withUnit(s, { id: 'u2', type: 'pioneer', profession: 'hardyPioneer', x: 1, y: 1, movesLeft: 1, orders: 'road' });
    s = withUnit(s, { id: 'u3', type: 'colonist', x: 1, y: 1 });
    s = withUnit(s, { id: 'ship', type: 'caravel', x: 1, y: 2 });
    expect(lines(s, 1, 1)).toEqual(['Veteran Soldier · Moves 1 · Fortified', 'Hardy Pioneer · Moves 1/3 · Build road', 'Free Colonist · Moves 1 · No orders']);
    expect(lines(s, 1, 2)).toEqual(['Caravel · Moves 4 · No orders']);
    // the active unit is the top, the rest keep the stack's order
    expect(lines(s, 1, 1, false, 'u2')).toEqual(['Hardy Pioneer · Moves 1/3 · Build road', 'Veteran Soldier · Moves 1 · Fortified', 'Free Colonist · Moves 1 · No orders']);
  });

  it("says what a unit of the viewer's carries, as the sidebar lists it", () => {
    let s = withUnit(four(), { id: 'ship', type: 'caravel', x: 1, y: 2, cargo: { muskets: 100 } });
    s = withUnit(s, { id: 'rider', type: 'colonist', x: 1, y: 2, aboard: 'ship' });
    s = withUnit(s, { id: 'digger', type: 'pioneer', x: 0, y: 0 });
    s = patch(withUnit(s, { id: 'gold', type: 'treasure', x: 2, y: 0 }), 'gold', { treasure: 3000 });
    s = withUnit(s, { id: 'guard', type: 'soldier', x: 4, y: 0 });
    // the colonist aboard is part of the caravel's load, not an entry of its own
    expect(units(s, 1, 2)).toEqual([{ line: 'Caravel · Moves 4 · No orders', carried: 'Carrying Free Colonist, 100 Muskets' }]);
    expect(units(s, 1, 2)?.[0]?.carried.replace('Carrying ', '').split(', ')).toEqual(sidebarModel(s, s.units['ship']!, null).aboard);
    expect(units(s, 0, 0)?.[0]?.carried).toBe('Carrying 100 Tools');
    expect(units(s, 2, 0)).toEqual([{ line: 'Treasure Train · Moves 1 · No orders', carried: 'Carrying 3000 gold' }]);
    expect(units(s, 4, 0)?.[0]?.carried).toBe('');
  });

  it("names the skill under the equipment of the viewer's own units and passengers, never another power's", () => {
    let s = withUnit(four(), { id: 'guard', type: 'soldier', profession: 'expertFarmer', x: 1, y: 1, orders: 'fortified' });
    s = withUnit(s, { id: 'vet', type: 'soldier', profession: 'veteranSoldier', x: 2, y: 1 });
    s = withUnit(s, { id: 'ship', type: 'caravel', x: 1, y: 2, cargo: { muskets: 100 } });
    s = withUnit(s, { id: 'rider', type: 'soldier', profession: 'freeColonist', x: 1, y: 2, aboard: 'ship' });
    s = withUnit(s, { id: 'f1', owner: 'b', type: 'soldier', profession: 'expertFarmer', x: 1, y: 0 });
    expect(lines(s, 1, 1)).toEqual(['Soldier (Expert Farmer) · Moves 1 · Fortified']);
    expect(lines(s, 2, 1)).toEqual(['Veteran Soldier · Moves 1 · No orders']);
    expect(units(s, 1, 2)).toEqual([{ line: 'Caravel · Moves 4 · No orders', carried: 'Carrying Soldier (Free Colonist), 100 Muskets' }]);
    // the sidebar still lists the passenger by its label
    expect(sidebarModel(s, s.units['ship']!, null).aboard).toEqual(['Soldier', '100 Muskets']);
    expect(units(s, 1, 0)).toEqual([{ line: 'French Soldier', carried: '' }]);
  });

  it('never lists a unit on a voyage', () => {
    let s = withUnit(four(), { id: 'ship', type: 'caravel', x: 1, y: 2 });
    s = patch(s, 'ship', { voyage: { phase: 'toEurope', turnsLeft: 1, origin: [1, 2] } });
    expect(units(s, 1, 2)).toEqual([]);
  });

  it("names another power's unit by its owner and kind, and says nothing of what it carries", () => {
    let s = withUnit(four(), { id: 'me', type: 'scout', x: 2, y: 1 });
    s = withUnit(s, { id: 'f1', owner: 'b', type: 'soldier', profession: 'veteranSoldier', x: 1, y: 0 });
    s = withUnit(s, { id: 'd1', owner: 'd', type: 'colonist', profession: 'masterCarpenter', x: 2, y: 0 });
    s = withUnit(s, { id: 'n1', owner: 'tribe:sioux', type: 'brave', x: 3, y: 0 });
    s = withUnit(s, { id: 'w1', owner: 'c', type: 'wagonTrain', x: 3, y: 1, cargo: { furs: 100 } });
    expect(units(s, 1, 0)).toEqual([{ line: 'French Soldier', carried: '' }]);
    expect(units(s, 2, 0)).toEqual([{ line: 'Dutch Colonist', carried: '' }]);
    expect(units(s, 3, 0)).toEqual([{ line: 'Sioux Braves', carried: '' }]);
    expect(units(s, 3, 1)).toEqual([{ line: 'Spanish Wagon Train', carried: '' }]);
  });

  it("calls the Crown's army Royal, unless the kind's name already says whose it is", () => {
    let s: GameState = { ...four(), crownPlayer: 'b' };
    s = withUnit(s, { id: 'me', type: 'scout', x: 2, y: 1 });
    s = withUnit(s, { id: 'k1', owner: 'b', type: 'artillery', x: 1, y: 0 });
    s = withUnit(s, { id: 'k2', owner: 'b', type: 'regular', x: 2, y: 0 });
    s = withUnit(s, { id: 'k3', owner: 'b', type: 'manOWar', x: 2, y: 2 });
    expect(lines(s, 1, 0)).toEqual(['Royal Artillery']);
    expect(lines(s, 2, 0)).toEqual(["King's Regular"]);
    expect(lines(s, 2, 2)).toEqual(['Royal Man-O-War · holds empty']);
  });

  it('adds the holds in use to a foreign ship', () => {
    let s = withUnit(four(), { id: 'me', type: 'caravel', x: 2, y: 2 });
    s = withUnit(s, { id: 'g', owner: 'c', type: 'galleon', x: 1, y: 2, cargo: { sugar: 150 } });
    s = withUnit(s, { id: 'p', owner: 'c', type: 'colonist', x: 1, y: 2, aboard: 'g' });
    s = withUnit(s, { id: 'c1', owner: 'b', type: 'caravel', x: 3, y: 2, cargo: { furs: 20 } });
    expect(units(s, 1, 2)).toEqual([{ line: 'Spanish Galleon · 3 holds in use', carried: '' }]);
    expect(lines(s, 3, 2)).toEqual(['French Caravel · 1 hold in use']);
    expect(lines(patch(s, 'c1', { cargo: {} }), 3, 2)).toEqual(['French Caravel · holds empty']);
  });

  it('says only "and others" of the rest of a foreign stack', () => {
    let s = withUnit(four(), { id: 'me', type: 'scout', x: 2, y: 1 });
    s = withUnit(s, { id: 'f1', owner: 'b', type: 'soldier', x: 1, y: 0 });
    s = withUnit(s, { id: 'f2', owner: 'b', type: 'dragoon', x: 1, y: 0 });
    s = withUnit(s, { id: 'f3', owner: 'b', type: 'artillery', x: 1, y: 0 });
    expect(units(s, 1, 0)).toEqual([{ line: 'French Soldier', carried: '' }, { line: 'and others', carried: '' }]);
  });

  it("leaves out a foreign unit out of sight of the viewer's units, unless all is revealed", () => {
    let s = withUnit(four(), { id: 'me', type: 'scout', x: 0, y: 0 });
    s = withUnit(s, { id: 'f1', owner: 'b', type: 'soldier', x: 0 + SIGHT.foreignUnitRange + 1, y: 0 });
    expect(units(s, s.units['f1']!.x, 0)).toEqual([]);
    expect(lines(s, s.units['f1']!.x, 0, true)).toEqual(['French Soldier']);
    expect(lines(patch(s, 'me', { x: 1 }), s.units['f1']!.x, 0)).toEqual(['French Soldier']);
  });

  it('lists only the active unit on a square with a colony', () => {
    let s = withColony(four(), { id: 'town', x: 1, y: 1 });
    s = withUnit(s, { id: 'u1', type: 'soldier', x: 1, y: 1, orders: 'fortified' });
    s = withUnit(s, { id: 'u2', type: 'colonist', x: 1, y: 1 });
    expect(units(s, 1, 1)).toEqual([]);
    expect(units(s, 1, 1, false, 'elsewhere')).toEqual([]);
    expect(lines(s, 1, 1, false, 'u2')).toEqual(['Free Colonist · Moves 1 · No orders']);
    // the active unit aboard a ship lying in the colony is the one the map draws there
    const docked = withUnit(withUnit(s, { id: 'ship', type: 'caravel', profession: null, x: 1, y: 1 }), { id: 'u3', type: 'colonist', x: 1, y: 1, aboard: 'ship' });
    expect(lines(docked, 1, 1, false, 'u3')).toEqual(['Free Colonist · Moves 1 · No orders']);
    expect(units(docked, 1, 1)).toEqual([]);
    // another power's colony, seen with the viewer's unit beside it
    let f = withColony(four(), { id: 'ville', owner: 'b', x: 3, y: 0 });
    f = withUnit(f, { id: 'f1', owner: 'b', type: 'soldier', x: 3, y: 0 });
    f = withUnit(f, { id: 'me', type: 'scout', x: 2, y: 0 });
    expect(units(f, 3, 0)).toEqual([]);
    expect(units(f, 3, 0, true, 'me')).toEqual([]);
  });

  it('is still null off the map and on an unexplored square, whatever stands there', () => {
    let s = withUnit(four(), { id: 'u1', type: 'soldier', x: 1, y: 1 });
    s = setTile(s, 1, 1, { explored: 0b10 });
    expect(tileTip(s, 1, 1, false, 'u1')).toBeNull();
    expect(tileTip(s, -1, 0, false, 'u1')).toBeNull();
  });
});

describe('slipUnits', () => {
  const entries = (n: number) => Array.from({ length: n }, (_, i) => ({ line: `unit ${i}`, carried: i === 0 ? 'Carrying 100 Tools' : '' }));
  it('keeps every entry up to the limit, and past it says how many more there are', () => {
    expect(slipUnits(entries(TOOLTIP_UNIT_LIMIT))).toEqual(entries(TOOLTIP_UNIT_LIMIT));
    expect(slipUnits([])).toEqual([]);
    const cut = slipUnits(entries(50));
    expect(cut).toHaveLength(TOOLTIP_UNIT_LIMIT);
    expect(cut.slice(0, -1)).toEqual(entries(TOOLTIP_UNIT_LIMIT - 1));
    expect(cut.at(-1)).toEqual({ line: `and ${50 - (TOOLTIP_UNIT_LIMIT - 1)} more`, carried: '' });
    expect(slipUnits(entries(4), 3).map((u) => u.line)).toEqual(['unit 0', 'unit 1', 'and 2 more']);
  });
});

describe('groundFeatures', () => {
  it('lists river, road, plowed, resource and rumor in the sidebar order', () => {
    expect(groundFeatures(makeTile({ base: 'plains', resource: 'wheat', river: 'minor', road: true, plowed: true, rumor: true })))
      .toEqual(['Minor River', 'Road', 'Plowed', 'Wheat', 'Lost City Rumor']);
    expect(groundFeatures(makeTile({ base: 'plains' }))).toEqual([]);
  });
});

describe('placeTooltip', () => {
  const slip = { width: 120, height: 60 };
  const canvas = { width: 800, height: 600 };

  it('waits 400 ms and stands 14 pixels off the pointer', () => {
    expect(TOOLTIP_DELAY_MS).toBe(400);
    expect(TOOLTIP_GAP).toBe(14);
  });

  it('puts the slip right of and below the pointer where there is room', () => {
    expect(placeTooltip({ x: 5, y: 5 }, slip, canvas)).toEqual({ x: 19, y: 19 }); // top left corner
    expect(placeTooltip({ x: 400, y: 300 }, slip, canvas)).toEqual({ x: 414, y: 314 });
    // it may touch the edges without turning over
    expect(placeTooltip({ x: 666, y: 526 }, slip, canvas)).toEqual({ x: 680, y: 540 });
  });

  it('turns to the left of the pointer at the right edge', () => {
    expect(placeTooltip({ x: 795, y: 5 }, slip, canvas)).toEqual({ x: 661, y: 19 }); // top right corner
    expect(placeTooltip({ x: 667, y: 300 }, slip, canvas)).toEqual({ x: 533, y: 314 });
  });

  it('turns above the pointer at the bottom edge', () => {
    expect(placeTooltip({ x: 5, y: 595 }, slip, canvas)).toEqual({ x: 19, y: 521 }); // bottom left corner
    expect(placeTooltip({ x: 400, y: 527 }, slip, canvas)).toEqual({ x: 414, y: 453 });
  });

  it('turns both ways in the bottom right corner', () => {
    expect(placeTooltip({ x: 795, y: 595 }, slip, canvas)).toEqual({ x: 661, y: 521 });
  });

  it('is kept on the canvas when it fits on neither side', () => {
    const small = { width: 150, height: 80 };
    // no room right of the pointer, nor left of it: held at the left edge; the same down and up
    expect(placeTooltip({ x: 100, y: 50 }, slip, small)).toEqual({ x: 0, y: 0 });
    expect(placeTooltip({ x: 140, y: 75 }, slip, small)).toEqual({ x: 6, y: 1 });
    // a slip larger than the canvas starts at its corner
    expect(placeTooltip({ x: 10, y: 10 }, { width: 300, height: 200 }, small)).toEqual({ x: 0, y: 0 });
  });
});
