import { describe, expect, it } from 'vitest';
import { applyAction, validateAction, type Action } from '../../../../src/engine/actions';
import { checkCheat, type CheatArgValue, type CheatCommand } from '../../../../src/engine/cheats';
import { MAP_SPECS } from '../../../../src/engine/cheats/map';
import { CHEATS } from '../../../../src/engine/data/cheats';
import { RESOURCE_IDS, RESOURCE_TERRAINS } from '../../../../src/engine/data/resources';
import { FOREST_TERRAINS, OPEN_TERRAINS, TERRAIN_IDS, type TerrainId } from '../../../../src/engine/data/terrain';
import { revealAround } from '../../../../src/engine/explore';
import { checkInvariants } from '../../../../src/engine/invariants';
import { tileAt, type GameState, type Settlement } from '../../../../src/engine/state';
import { isWater, terrainOf, type Tile } from '../../../../src/engine/tile';
import { deepFreeze } from '../../../helpers/freeze';
import { setTile, withColony, withUnit, world } from '../../../helpers/world';

const ROWS = Array.from({ length: 12 }, (_, y) => (y % 5 === 0 ? '~'.repeat(15) : `~${'.'.repeat(13)}~`));
/** A world nobody has seen any of, but for one square the second power knows. */
function dark(): GameState {
  const lit = world({ rows: ROWS, players: [{ id: 'a' }, { id: 'b', kind: 'ai' }, { id: 'c', kind: 'ai' }] });
  const tiles = lit.map.tiles.map((t, i) => ({ ...t, explored: i === 0 ? 0b010 : 0 }));
  return deepFreeze({ ...lit, map: { ...lit.map, tiles } });
}
const cheat = (command: CheatCommand, player?: string): Action => (player === undefined ? { type: 'cheat', command } : { type: 'cheat', player, command });
const bits = (state: GameState): number[] => state.map.tiles.map((t) => t.explored);
const reveal = (at: { x: number; y: number } | null, radius: number = CHEATS.revealRadius): CheatCommand => ({ cheat: 'reveal', at, radius });

describe('reveal', () => {
  it('with no square makes every square known to the power, and to no other', () => {
    const state = dark();
    const { state: next, events } = applyAction(state, cheat(reveal(null)));
    expect(bits(next)).toEqual(bits(state).map((b) => b | 0b001));
    expect(next.map.tiles.every((t) => (t.explored & 0b001) !== 0)).toBe(true);
    expect(events).toEqual([{ type: 'cheatApplied', player: 'a', summary: 'Revealed the whole map.' }]);
    // nothing else about the squares changed
    expect(next.map.tiles.map((t) => ({ ...t, explored: 0 }))).toEqual(state.map.tiles.map((t) => ({ ...t, explored: 0 })));
  });

  it('for another power sets that power\'s bit', () => {
    const state = dark();
    const { state: next } = applyAction(state, cheat(reveal(null), 'c'));
    expect(bits(next)).toEqual(bits(state).map((b) => b | 0b100));
    expect(next.players.map((p) => p.cheated)).toEqual([true, undefined, true]);
  });

  it('covers a map taller than it is wide, and wider than it is tall', () => {
    for (const rows of [['~.', '..', '..', '..', '..', '..', '.~'], ['~......~']]) {
      const lit = world({ rows });
      const state: GameState = { ...lit, map: { ...lit.map, tiles: lit.map.tiles.map((t) => ({ ...t, explored: 0 })) } };
      const { state: next } = applyAction(state, cheat(reveal(null)));
      expect(bits(next)).toEqual(bits(state).map(() => 0b01));
    }
  });

  it('with a square and a radius marks exactly the squares revealAround would', () => {
    const state = dark();
    const { state: next, events } = applyAction(state, cheat(reveal({ x: 13, y: 2 }, 2)));
    const want = revealAround(state.map, 0, 13, 2, 2);
    expect(next.map).toEqual(want.map);
    // clipped at the edge of the map: 4 columns by 5 rows
    expect(want.revealed).toHaveLength(20);
    expect(bits(next).filter((b) => b & 1)).toHaveLength(20);
    expect(events).toEqual([{ type: 'cheatApplied', player: 'a', summary: 'Revealed the country within 2 squares of 13,2.' }]);
    const one = applyAction(state, cheat(reveal({ x: 5, y: 5 }, 0)));
    expect(bits(one.state).filter((b) => b & 1)).toHaveLength(1);
    expect(applyAction(state, cheat(reveal({ x: 5, y: 5 }, 1))).events[0]).toMatchObject({ summary: 'Revealed the country within 1 square of 5,5.' });
  });

  it('with a square alone takes the radius from the table', () => {
    const state = dark();
    const spec = MAP_SPECS.find((s) => s.name === 'reveal');
    const command = spec?.build({ square: { x: 6, y: 6 } }) as CheatCommand;
    expect(command).toEqual({ cheat: 'reveal', at: { x: 6, y: 6 }, radius: CHEATS.revealRadius });
    const { state: next } = applyAction(state, cheat(command));
    expect(next.map).toEqual(revealAround(state.map, 0, 6, 6, CHEATS.revealRadius).map);
    const side = 2 * CHEATS.revealRadius + 1;
    expect(bits(next).filter((b) => b & 1)).toHaveLength(side * side);
    expect(spec?.build({})).toEqual({ cheat: 'reveal', at: null, radius: CHEATS.revealRadius });
  });

  it('is refused for a square off the map, and for a radius that is no count', () => {
    const state = dark();
    for (const [x, y] of [[-1, 0], [0, -1], [15, 0], [0, 12], [1.5, 2]] as const) {
      const check = validateAction(state, cheat(reveal({ x, y })));
      expect(check, `${x},${y}`).toEqual({ ok: false, error: { code: 'cheatSquare', message: `there is no square ${x},${y} on the map` } });
    }
    expect(validateAction(state, cheat(reveal({ x: 14, y: 11 }))).ok).toBe(true);
    // a command with no word about where is refused, not taken for the whole map
    for (const at of [undefined, 7]) {
      const check = validateAction(state, cheat({ cheat: 'reveal', at, radius: 1 } as unknown as CheatCommand));
      expect(check, String(at)).toEqual({ ok: false, error: { code: 'cheatSquare', message: 'reveal takes a square, or none for the whole map' } });
    }
    for (const radius of [-1, 0.5, Number.NaN]) {
      const check = validateAction(state, cheat(reveal({ x: 3, y: 3 }, radius)));
      expect(check, String(radius)).toEqual({ ok: false, error: { code: 'cheatAmount', message: 'a radius is a whole number of zero or more' } });
    }
  });

  it('leaves the map as it is when there is nothing new to show', () => {
    const lit = world({ rows: ROWS });
    expect(applyAction(lit, cheat(reveal(null))).state.map).toBe(lit.map);
  });
});

//              0123456
const GROUND = ['~~~~~~~',
                '~.fhm.~',
                '~.=r..~',
                '~.a.s.~',
                '~~~~~~~'];
const VILLAGE: Settlement = { id: 'v', tribe: 'sioux', x: 5, y: 1, capital: false, population: 3, growth: 0, taught: false, tributePaid: false, alarm: {}, mission: null, scouted: [], lastBought: null, lastSold: null, haggleMemory: null };
/**
 * Plains but for: forest at 2,1, hills at 3,1, mountains at 4,1, a road at 2,2, a river at 3,2,
 * arctic at 2,3 and a sea lane at 4,3. Jamestown at 1,1, a village at 5,1; a soldier at 5,2, a
 * caravel at 3,0 with a colonist aboard, and another power's soldier at 5,3.
 */
function country(): GameState {
  let s = world({ rows: GROUND, players: [{ id: 'a' }, { id: 'b', kind: 'ai' }] });
  s = withColony(s, { id: 'c1', name: 'Jamestown', x: 1, y: 1 });
  s = withUnit(s, { id: 'm1', type: 'soldier', x: 5, y: 2 });
  s = withUnit(s, { id: 's1', type: 'caravel', x: 3, y: 0 });
  s = withUnit(s, { id: 'p1', x: 3, y: 0, aboard: 's1' });
  s = withUnit(s, { id: 'f1', type: 'soldier', owner: 'b', x: 5, y: 3 });
  return deepFreeze({ ...s, settlements: { v: VILLAGE } });
}
const tile = (state: GameState, x: number, y: number): Tile => tileAt(state.map, x, y) as Tile;
type SquareCommand = CheatCommand & { readonly at: { readonly x: number; readonly y: number } };
/** Apply a cheat that must be accepted; the state is sound after it and only the one square differs. */
function run(state: GameState, command: SquareCommand): { state: GameState; tile: Tile; said: string } {
  expect(validateAction(state, cheat(command))).toEqual({ ok: true });
  const { state: next, events } = applyAction(state, cheat(command));
  expect(checkInvariants(next)).toEqual([]);
  const { x, y } = command.at;
  expect(setTile(next, x, y, tile(state, x, y))).toEqual({ ...state, players: next.players });
  expect(events).toHaveLength(1);
  return { state: next, tile: tile(next, x, y), said: (events[0] as { summary: string }).summary };
}
function refusal(state: GameState, command: CheatCommand): { code: string; message: string } {
  const check = validateAction(state, cheat(command));
  if (check.ok) throw new Error(`expected a refusal of ${JSON.stringify(command)}`);
  return check.error;
}
const terrain = (x: number, y: number, id: TerrainId): SquareCommand => ({ cheat: 'terrain', at: { x, y }, terrain: id });

describe('terrain', () => {
  it('sets base and forest for the open and the forest kinds, on flat ground', () => {
    for (const id of [...OPEN_TERRAINS, ...FOREST_TERRAINS]) {
      // over hills, so that the relief is seen to go
      const made = run(country(), terrain(3, 1, id));
      expect(terrainOf(made.tile), id).toBe(id);
      expect(made.tile, id).toMatchObject({ relief: 'flat', forest: (FOREST_TERRAINS as readonly string[]).includes(id) });
    }
    const forest = run(country(), terrain(1, 2, 'broadleaf'));
    expect(forest.tile).toEqual({ ...tile(country(), 1, 2), base: 'prairie', forest: true });
    expect(terrainOf(forest.tile)).toBe('broadleaf');
    expect(run(country(), terrain(2, 1, 'desert')).tile).toEqual({ ...tile(country(), 2, 1), base: 'desert', forest: false });
    expect(run(country(), terrain(1, 2, 'grassland')).said).toBe('Made 1,2 grassland.');
  });

  it('raises hills and mountains on the ground that is there', () => {
    const hills = run(country(), terrain(2, 1, 'hills'));
    expect(hills.tile).toEqual({ ...tile(country(), 2, 1), relief: 'hills' });
    expect(terrainOf(hills.tile)).toBe('hills');
    expect(hills.said).toBe('Made 2,1 hills.');
    expect(run(country(), terrain(3, 1, 'mountains')).tile).toMatchObject({ base: 'plains', relief: 'mountains' });
    expect(terrainOf(run(country(), terrain(2, 3, 'hills')).tile)).toBe('hills');
    // and flat again with any other ground
    expect(run(country(), terrain(4, 1, 'plains')).tile).toMatchObject({ base: 'plains', relief: 'flat' });
    expect(refusal(country(), terrain(3, 4, 'hills'))).toEqual({ code: 'cheatSquare', message: '3,4 is water: give it a ground of its own before hills' });
    expect(refusal(country(), terrain(4, 3, 'mountains')).code).toBe('cheatSquare');
  });

  it('sets arctic, ocean and sea lane as the base', () => {
    expect(run(country(), terrain(2, 1, 'arctic')).tile).toMatchObject({ base: 'arctic', forest: false, relief: 'flat' });
    expect(run(country(), terrain(3, 1, 'ocean')).tile).toMatchObject({ base: 'ocean', forest: false, relief: 'flat' });
    expect(run(country(), terrain(1, 0, 'seaLane')).tile).toMatchObject({ base: 'seaLane' });
    expect(run(country(), terrain(4, 3, 'ocean')).tile).toMatchObject({ base: 'ocean' });
    // water made land
    expect(run(country(), terrain(1, 4, 'grassland')).tile).toMatchObject({ base: 'grassland', forest: false, relief: 'flat' });
  });

  it('leaves a square turned to water bare of road, plow, river, resource and rumour', () => {
    const rich = setTile(country(), 3, 3, { road: true, plowed: true, river: 'major', resource: 'wheat', rumor: true, claim: 'a' });
    for (const id of ['ocean', 'seaLane'] as const) {
      const sunk = run(rich, terrain(3, 3, id));
      expect(isWater(sunk.tile)).toBe(true);
      expect(sunk.tile, id).toEqual({ ...tile(rich, 3, 3), base: id, road: false, plowed: false, river: 'none', resource: null, rumor: false });
    }
    // land made other land keeps them, but a plow lies only on open land
    expect(run(rich, terrain(3, 3, 'prairie')).tile).toEqual({ ...tile(rich, 3, 3), base: 'prairie' });
    for (const id of ['mixed', 'hills', 'mountains', 'arctic'] as const) {
      expect(run(rich, terrain(3, 3, id)).tile, id).toMatchObject({ road: true, plowed: false, river: 'major', resource: 'wheat', rumor: true });
    }
  });

  it('is refused under a colony or a settlement, off the map, and for a terrain there is not', () => {
    const state = country();
    expect(refusal(state, terrain(1, 1, 'grassland'))).toEqual({ code: 'cheatSquare', message: 'Jamestown stands at 1,1' });
    expect(refusal(state, terrain(5, 1, 'ocean'))).toEqual({ code: 'cheatSquare', message: 'a native settlement stands at 5,1' });
    expect(refusal(state, terrain(7, 1, 'ocean'))).toEqual({ code: 'cheatSquare', message: 'there is no square 7,1 on the map' });
    expect(refusal(state, terrain(1, 2, 'lava' as TerrainId))).toEqual({ code: 'cheatTarget', message: 'there is no terrain "lava"' });
    expect(refusal(state, { cheat: 'terrain', terrain: 'ocean' } as unknown as CheatCommand).code).toBe('cheatSquare');
  });

  it('is refused under a unit the new ground cannot carry', () => {
    const state = country();
    expect(refusal(state, terrain(3, 0, 'plains'))).toEqual({ code: 'cheatSquare', message: 'Caravel s1 lies at 3,0 and cannot lie on land' });
    expect(refusal(state, terrain(5, 2, 'ocean'))).toEqual({ code: 'cheatSquare', message: 'Soldier m1 stands at 5,2 and cannot stand on water' });
    expect(refusal(state, terrain(5, 3, 'seaLane')).message).toBe('Soldier f1 stands at 5,3 and cannot stand on water');
    // the ground may change under a unit it still carries: land under the soldier, water under the ship and those aboard her
    expect(run(state, terrain(5, 2, 'mountains')).tile.relief).toBe('mountains');
    expect(run(state, terrain(3, 0, 'seaLane')).tile.base).toBe('seaLane');
  });

  it('takes every row of the terrain table somewhere', () => {
    for (const id of TERRAIN_IDS) expect(validateAction(country(), cheat(terrain(1, 2, id))).ok, id).toBe(true);
  });
});

describe('the feature cheats', () => {
  const at = { x: 1, y: 2 };

  it('road lays a road on land and takes it up', () => {
    const laid = run(country(), { cheat: 'road', at, on: true });
    expect(laid.tile).toEqual({ ...tile(country(), 1, 2), road: true });
    expect(laid.said).toBe('Laid a road at 1,2.');
    const lifted = run(country(), { cheat: 'road', at: { x: 2, y: 2 }, on: false });
    expect(lifted.tile.road).toBe(false);
    expect(lifted.said).toBe('Took up the road at 2,2.');
    // on any land: mountains, arctic, under a colony
    for (const [x, y] of [[4, 1], [2, 3], [1, 1]] as const) expect(run(country(), { cheat: 'road', at: { x, y }, on: true }).tile.road).toBe(true);
    expect(refusal(country(), { cheat: 'road', at: { x: 3, y: 4 }, on: true })).toEqual({ code: 'cheatSquare', message: '3,4 is water, and a road needs land' });
    expect(refusal(country(), { cheat: 'road', at: { x: 3, y: 4 }, on: false }).code).toBe('cheatSquare');
    expect(refusal(country(), { cheat: 'road', at: { x: 1, y: 9 }, on: true }).message).toBe('there is no square 1,9 on the map');
    expect(refusal(country(), { cheat: 'road', at } as unknown as CheatCommand)).toEqual({ code: 'cheatTarget', message: 'a road is on or off' });
  });

  it('plow needs open land', () => {
    const plowed = run(country(), { cheat: 'plow', at, on: true });
    expect(plowed.tile).toEqual({ ...tile(country(), 1, 2), plowed: true });
    expect(plowed.said).toBe('Plowed 1,2.');
    const back = run(plowed.state, { cheat: 'plow', at, on: false });
    expect(back.tile.plowed).toBe(false);
    expect(back.said).toBe('Let the plowed land go back at 1,2.');
    expect(refusal(country(), { cheat: 'plow', at: { x: 2, y: 1 }, on: true }).message).toMatch(/^only open land takes a plow, and 2,1 is /);
    for (const [x, y] of [[2, 1], [3, 1], [4, 1], [2, 3]] as const) expect(refusal(country(), { cheat: 'plow', at: { x, y }, on: true }).code, `${x},${y}`).toBe('cheatSquare');
    expect(refusal(country(), { cheat: 'plow', at: { x: 3, y: 4 }, on: true })).toEqual({ code: 'cheatSquare', message: '3,4 is water, and a plow needs land' });
    // taking a plow off needs no open land
    expect(validateAction(country(), cheat({ cheat: 'plow', at: { x: 3, y: 1 }, on: false })).ok).toBe(true);
  });

  it('river sets none, minor or major', () => {
    const major = run(country(), { cheat: 'river', at, river: 'major' });
    expect(major.tile).toEqual({ ...tile(country(), 1, 2), river: 'major' });
    expect(major.said).toBe('Ran a major river through 1,2.');
    expect(run(country(), { cheat: 'river', at, river: 'minor' }).tile.river).toBe('minor');
    const dry = run(country(), { cheat: 'river', at: { x: 3, y: 2 }, river: 'none' });
    expect(dry.tile.river).toBe('none');
    expect(dry.said).toBe('Dried up the river at 3,2.');
    expect(refusal(country(), { cheat: 'river', at: { x: 3, y: 4 }, river: 'minor' })).toEqual({ code: 'cheatSquare', message: '3,4 is water, and a river needs land' });
    expect(refusal(country(), { cheat: 'river', at, river: 'mighty' } as unknown as CheatCommand)).toEqual({ code: 'cheatTarget', message: 'a river is none, minor or major' });
  });

  it('resource must suit the ground, and none clears it', () => {
    const wheat = run(country(), { cheat: 'resource', at, resource: 'wheat' });
    expect(wheat.tile).toEqual({ ...tile(country(), 1, 2), resource: 'wheat' });
    expect(wheat.said).toBe('Put Wheat at 1,2.');
    const cleared = run(wheat.state, { cheat: 'resource', at, resource: null });
    expect(cleared.tile.resource).toBeNull();
    expect(cleared.said).toBe('Cleared the resource at 1,2.');
    // each on the ground the table gives it, water too
    expect(run(country(), { cheat: 'resource', at: { x: 3, y: 4 }, resource: 'fishery' }).tile.resource).toBe('fishery');
    expect(run(country(), { cheat: 'resource', at: { x: 2, y: 1 }, resource: 'beaver' }).tile.resource).toBe('beaver');
    expect(run(country(), { cheat: 'resource', at: { x: 3, y: 1 }, resource: 'oreDeposit' }).tile.resource).toBe('oreDeposit');
    expect(run(country(), { cheat: 'resource', at: { x: 4, y: 1 }, resource: 'silverDeposit' }).tile.resource).toBe('silverDeposit');
    for (const id of RESOURCE_IDS) {
      const suits = (RESOURCE_TERRAINS[id] as readonly string[]).includes('plains');
      expect(validateAction(country(), cheat({ cheat: 'resource', at, resource: id })).ok, id).toBe(suits);
    }
    expect(refusal(country(), { cheat: 'resource', at, resource: 'oasis' }).message).toMatch(/^Oasis is found on desert or .+, and 1,2 is plains$/);
    expect(refusal(country(), { cheat: 'resource', at, resource: 'oasis' }).code).toBe('cheatSquare');
    expect(refusal(country(), { cheat: 'resource', at: { x: 4, y: 3 }, resource: 'fishery' }).code).toBe('cheatSquare');
    expect(refusal(country(), { cheat: 'resource', at, resource: 'gold' } as unknown as CheatCommand)).toEqual({ code: 'cheatTarget', message: 'there is no resource "gold"' });
    expect(refusal(country(), { cheat: 'resource', at: { x: -1, y: 0 }, resource: null }).message).toBe('there is no square -1,0 on the map');
  });

  it('rumor starts one on land, never under a colony or a settlement, and lays it to rest', () => {
    const started = run(country(), { cheat: 'rumor', at, on: true });
    expect(started.tile).toEqual({ ...tile(country(), 1, 2), rumor: true });
    expect(started.said).toBe('Started a rumour at 1,2.');
    const rested = run(started.state, { cheat: 'rumor', at, on: false });
    expect(rested.tile.rumor).toBe(false);
    expect(rested.said).toBe('Laid the rumour to rest at 1,2.');
    expect(refusal(country(), { cheat: 'rumor', at: { x: 1, y: 1 }, on: true })).toEqual({ code: 'cheatSquare', message: 'Jamestown stands at 1,1' });
    expect(refusal(country(), { cheat: 'rumor', at: { x: 5, y: 1 }, on: true })).toEqual({ code: 'cheatSquare', message: 'a native settlement stands at 5,1' });
    expect(refusal(country(), { cheat: 'rumor', at: { x: 3, y: 4 }, on: true })).toEqual({ code: 'cheatSquare', message: '3,4 is water, and a rumour needs land' });
    expect(validateAction(country(), cheat({ cheat: 'rumor', at: { x: 1, y: 1 }, on: false })).ok).toBe(true);
  });
});

describe('the map specs', () => {
  const square = { x: 2, y: 3 };
  const ARGS: Record<string, Record<string, CheatArgValue>> = {
    reveal: { square, radius: 4 },
    terrain: { square, terrain: 'grassland' },
    road: { square, to: 'on' },
    plow: { square, to: 'on' },
    river: { square, river: 'major' },
    resource: { square, resource: { kind: 'resource', value: 'wheat' } },
    rumor: { square, to: 'on' },
  };

  it('are the seven of this group', () => {
    expect(MAP_SPECS.map((s) => s.name)).toEqual(['reveal', 'terrain', 'road', 'plow', 'river', 'resource', 'rumor']);
  });

  it('build what the words say', () => {
    const build = (name: string, args: Record<string, CheatArgValue>): CheatCommand => MAP_SPECS.find((s) => s.name === name)!.build(args);
    expect(build('terrain', { square, terrain: 'grassland' })).toEqual({ cheat: 'terrain', at: square, terrain: 'grassland' });
    expect(build('road', { square, to: 'on' })).toEqual({ cheat: 'road', at: square, on: true });
    expect(build('road', { square, to: 'off' })).toEqual({ cheat: 'road', at: square, on: false });
    expect(build('plow', { square, to: 'off' })).toEqual({ cheat: 'plow', at: square, on: false });
    expect(build('rumor', { square, to: 'on' })).toEqual({ cheat: 'rumor', at: square, on: true });
    expect(build('river', { square, river: 'none' })).toEqual({ cheat: 'river', at: square, river: 'none' });
    expect(build('resource', { square, resource: { kind: 'resource', value: 'wheat' } })).toEqual({ cheat: 'resource', at: square, resource: 'wheat' });
    expect(build('resource', { square, resource: { kind: 'word', value: 'none' } })).toEqual({ cheat: 'resource', at: square, resource: null });
  });

  it.each(MAP_SPECS.map((s) => [s.name, s] as const))('%s builds a command the check accepts', (name, spec) => {
    const args = ARGS[name];
    if (!args) throw new Error(`no test arguments for the cheat "${name}"`);
    expect(Object.keys(args).sort()).toEqual(spec.args.map((a) => a.name).sort());
    const state = dark();
    const command = spec.build(args);
    expect(checkCheat(state, 'a', command)).toEqual({ ok: true });
    expect(() => applyAction(state, cheat(command))).not.toThrow();
    const required = Object.fromEntries(spec.args.filter((a) => !a.optional).map((a) => [a.name, args[a.name]]));
    expect(checkCheat(state, 'a', spec.build(required))).toEqual({ ok: true });
  });
});
