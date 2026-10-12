// Map cheats (R-1058, R-1059; docs/RULES.md "Cheats"): lifting the fog, for the whole map or around
// one square, where the squares become known to the power as squares a unit of its own had seen;
// and changing a square itself, its ground or one of its features. The game has no path of its own
// for that, so the square is written and the rules read it from there.
import type { CheatArgValue, CheatCommand, CheatSpec } from '../cheats';
import { CHEATS } from '../data/cheats';
import { RESOURCE_IDS, RESOURCE_TERRAINS, RESOURCES, type ResourceId } from '../data/resources';
import { CLEARED_FROM, OPEN_TERRAINS, TERRAIN, TERRAIN_IDS, type ForestTerrain, type OpenTerrain, type TerrainId } from '../data/terrain';
import { UNIT_TYPES } from '../data/units';
import { revealAround } from '../explore';
import { settlementAt } from '../settlements';
import { colonyAt, tileAt, tileIndex, unitsAt, type GameState, type Player } from '../state';
import { isWater, terrainOf, type River, type Tile } from '../tile';
import { CHEAT_OK, isCount, numberArg, onMap, refuse, squareArg, wordArg, type CheatCheck, type CheatOutcome, type CheatSink } from './shared';

type Square = { readonly x: number; readonly y: number };

export type MapCommand =
  /** Make squares known to the power: all of them (`at` null), or those within `radius` of a square. */
  | { readonly cheat: 'reveal'; readonly at: Square | null; readonly radius: number }
  /** Set the ground of a square to a row of the terrain table. */
  | { readonly cheat: 'terrain'; readonly at: Square; readonly terrain: TerrainId }
  | { readonly cheat: 'road'; readonly at: Square; readonly on: boolean }
  | { readonly cheat: 'plow'; readonly at: Square; readonly on: boolean }
  | { readonly cheat: 'river'; readonly at: Square; readonly river: River }
  /** Put a special resource on a square, or with null take away the one there. */
  | { readonly cheat: 'resource'; readonly at: Square; readonly resource: ResourceId | null }
  | { readonly cheat: 'rumor'; readonly at: Square; readonly on: boolean };

const RIVERS: readonly River[] = ['none', 'minor', 'major'];
const isOpen = (terrain: TerrainId): terrain is OpenTerrain => (OPEN_TERRAINS as readonly string[]).includes(terrain);
const named = (terrain: TerrainId): string => TERRAIN[terrain].name.toLowerCase();

/** The square as the terrain cheat leaves it, or null when the ground asked for cannot be laid on it. */
function ground(tile: Tile, terrain: TerrainId): Tile | null {
  let next: Tile;
  if (terrain === 'hills' || terrain === 'mountains') {
    // relief lies over a ground of its own, and water has none to give it
    if (isWater(tile)) return null;
    next = { ...tile, relief: terrain };
  } else if (TERRAIN[terrain].kind === 'forest') {
    next = { ...tile, base: CLEARED_FROM[terrain as ForestTerrain], forest: true, relief: 'flat' };
  } else {
    next = { ...tile, base: terrain as Tile['base'], forest: false, relief: 'flat' };
  }
  if (isWater(next)) return { ...next, road: false, plowed: false, river: 'none', resource: null, rumor: false };
  // a plow lies only on open land
  return isOpen(terrainOf(next)) ? next : { ...next, plowed: false };
}

/** The square a cheat is for, or the refusal: off the map, or water where `land` (the feature, in words) needs land. */
function squareFor(state: GameState, at: Square, land: string | null): Tile | CheatCheck {
  if (typeof at !== 'object' || at === null || !onMap(state, at.x, at.y)) return refuse('cheatSquare', `there is no square ${String(at?.x)},${String(at?.y)} on the map`);
  const tile = tileAt(state.map, at.x, at.y) as Tile;
  return land !== null && isWater(tile) ? refuse('cheatSquare', `${at.x},${at.y} is water, and ${land} needs land`) : tile;
}
const isRefusal = (v: Tile | CheatCheck): v is CheatCheck => 'ok' in v;

function checkTerrain(state: GameState, at: Square, terrain: TerrainId): CheatCheck {
  const tile = squareFor(state, at, null);
  if (isRefusal(tile)) return tile;
  if (!(TERRAIN_IDS as readonly unknown[]).includes(terrain)) return refuse('cheatTarget', `there is no terrain "${String(terrain)}"`);
  const where = `${at.x},${at.y}`;
  const colony = colonyAt(state, at.x, at.y);
  if (colony) return refuse('cheatSquare', `${colony.name} stands at ${where}`);
  if (settlementAt(state, at.x, at.y)) return refuse('cheatSquare', `a native settlement stands at ${where}`);
  const after = ground(tile, terrain);
  if (!after) return refuse('cheatSquare', `${where} is water: give it a ground of its own before ${named(terrain)}`);
  const water = isWater(after);
  for (const unit of unitsAt(state, at.x, at.y)) {
    const ship = UNIT_TYPES[unit.type].domain === 'sea';
    if (water && !ship && unit.aboard === null) return refuse('cheatSquare', `${UNIT_TYPES[unit.type].name} ${unit.id} stands at ${where} and cannot stand on water`);
    if (!water && ship) return refuse('cheatSquare', `${UNIT_TYPES[unit.type].name} ${unit.id} lies at ${where} and cannot lie on land`);
  }
  return CHEAT_OK;
}

/** May this power have this cheat? Null when the command is not one of this group's. */
export function checkMap(state: GameState, _player: Player, command: CheatCommand): CheatCheck | null {
  switch (command.cheat) {
    case 'reveal':
      if (command.at === null) return CHEAT_OK;
      if (typeof command.at !== 'object') return refuse('cheatSquare', 'reveal takes a square, or none for the whole map');
      if (!onMap(state, command.at.x, command.at.y)) return refuse('cheatSquare', `there is no square ${command.at.x},${command.at.y} on the map`);
      return isCount(command.radius) ? CHEAT_OK : refuse('cheatAmount', 'a radius is a whole number of zero or more');
    case 'terrain':
      return checkTerrain(state, command.at, command.terrain);
    case 'road': {
      const tile = squareFor(state, command.at, 'a road');
      if (isRefusal(tile)) return tile;
      return typeof command.on === 'boolean' ? CHEAT_OK : refuse('cheatTarget', 'a road is on or off');
    }
    case 'plow': {
      const tile = squareFor(state, command.at, 'a plow');
      if (isRefusal(tile)) return tile;
      if (typeof command.on !== 'boolean') return refuse('cheatTarget', 'a plow is on or off');
      return !command.on || isOpen(terrainOf(tile)) ? CHEAT_OK : refuse('cheatSquare', `only open land takes a plow, and ${command.at.x},${command.at.y} is ${named(terrainOf(tile))}`);
    }
    case 'river': {
      const tile = squareFor(state, command.at, 'a river');
      if (isRefusal(tile)) return tile;
      return RIVERS.includes(command.river) ? CHEAT_OK : refuse('cheatTarget', 'a river is none, minor or major');
    }
    case 'resource': {
      const tile = squareFor(state, command.at, null);
      if (isRefusal(tile)) return tile;
      const { resource } = command;
      if (resource === null) return CHEAT_OK;
      if (!(RESOURCE_IDS as readonly unknown[]).includes(resource)) return refuse('cheatTarget', `there is no resource "${String(resource)}"`);
      const suits: readonly TerrainId[] = RESOURCE_TERRAINS[resource];
      const terrain = terrainOf(tile);
      return suits.includes(terrain) ? CHEAT_OK : refuse('cheatSquare', `${RESOURCES[resource].name} is found on ${suits.map(named).join(' or ')}, and ${command.at.x},${command.at.y} is ${named(terrain)}`);
    }
    case 'rumor': {
      const tile = squareFor(state, command.at, 'a rumour');
      if (isRefusal(tile)) return tile;
      if (typeof command.on !== 'boolean') return refuse('cheatTarget', 'a rumour is on or off');
      if (!command.on) return CHEAT_OK;
      const { x, y } = command.at;
      const colony = colonyAt(state, x, y);
      if (colony) return refuse('cheatSquare', `${colony.name} stands at ${x},${y}`);
      return settlementAt(state, x, y) ? refuse('cheatSquare', `a native settlement stands at ${x},${y}`) : CHEAT_OK;
    }
    default:
      return null;
  }
}

/** The state with one square changed. */
function withTile(state: GameState, at: Square, change: Partial<Tile>): GameState {
  const tiles = [...state.map.tiles];
  const i = tileIndex(state.map, at.x, at.y);
  tiles[i] = { ...(tiles[i] as Tile), ...change };
  return { ...state, map: { ...state.map, tiles } };
}

/** Apply a checked cheat of this group. Null when the command is not one of this group's. */
export function applyMap(state: GameState, player: Player, command: CheatCommand, _events: CheatSink): CheatOutcome | null {
  switch (command.cheat) {
    case 'reveal': {
      const index = state.players.findIndex((p) => p.id === player.id);
      if (command.at === null) {
        // a radius as long as the map is, from its corner, takes in every square
        const reach = Math.max(state.map.width, state.map.height);
        return { state: { ...state, map: revealAround(state.map, index, 0, 0, reach).map }, summary: 'Revealed the whole map.' };
      }
      const { x, y } = command.at;
      const squares = command.radius === 1 ? 'square' : 'squares';
      return { state: { ...state, map: revealAround(state.map, index, x, y, command.radius).map }, summary: `Revealed the country within ${command.radius} ${squares} of ${x},${y}.` };
    }
    case 'terrain': {
      const { x, y } = command.at;
      const after = ground(tileAt(state.map, x, y) as Tile, command.terrain) as Tile;
      return { state: withTile(state, command.at, after), summary: `Made ${x},${y} ${named(terrainOf(after))}.` };
    }
    case 'road':
      return { state: withTile(state, command.at, { road: command.on }), summary: `${command.on ? 'Laid a road at' : 'Took up the road at'} ${command.at.x},${command.at.y}.` };
    case 'plow':
      return { state: withTile(state, command.at, { plowed: command.on }), summary: `${command.on ? 'Plowed' : 'Let the plowed land go back at'} ${command.at.x},${command.at.y}.` };
    case 'river': {
      const where = `${command.at.x},${command.at.y}`;
      return { state: withTile(state, command.at, { river: command.river }), summary: command.river === 'none' ? `Dried up the river at ${where}.` : `Ran a ${command.river} river through ${where}.` };
    }
    case 'resource': {
      const where = `${command.at.x},${command.at.y}`;
      const { resource } = command;
      return { state: withTile(state, command.at, { resource }), summary: resource === null ? `Cleared the resource at ${where}.` : `Put ${RESOURCES[resource].name} at ${where}.` };
    }
    case 'rumor':
      return { state: withTile(state, command.at, { rumor: command.on }), summary: `${command.on ? 'Started a rumour at' : 'Laid the rumour to rest at'} ${command.at.x},${command.at.y}.` };
    default:
      return null;
  }
}

type Args = Readonly<Record<string, CheatArgValue | undefined>>;
const ON_OFF = { oneOf: ['on', 'off'] } as const;
const at = (args: Args): Square => squareArg(args, 'square') as Square;
const isOn = (args: Args): boolean => wordArg(args, 'to') === 'on';
/** The resource named, or null for the word `none`: an argument of two alternatives says which one matched. */
function resourceArg(args: Args, name: string): ResourceId | null {
  const v = args[name];
  if (typeof v === 'object' && 'kind' in v && 'value' in v && v.kind === 'resource' && typeof v.value === 'string') return v.value as ResourceId;
  return null;
}

export const MAP_SPECS: readonly CheatSpec[] = [
  {
    name: 'reveal',
    args: [{ name: 'square', kind: 'square', optional: true }, { name: 'radius', kind: 'count', optional: true }],
    about: `Makes the whole map known, or with a square the country around it (${CHEATS.revealRadius} squares each way if no radius is given).`,
    example: 'reveal 20,30 5',
    build: (args) => ({ cheat: 'reveal', at: squareArg(args, 'square') ?? null, radius: numberArg(args, 'radius') ?? CHEATS.revealRadius }),
  },
  {
    name: 'terrain',
    args: [{ name: 'square', kind: 'square' }, { name: 'terrain', kind: 'terrain' }],
    about: 'Changes the ground of a square. Hills and mountains are raised on the land that is there; a square turned to water loses its road, plow, river, resource and rumour. Refused under a colony or a settlement, and under a unit that could not stay.',
    example: 'terrain 20,30 grassland',
    build: (args) => ({ cheat: 'terrain', at: at(args), terrain: wordArg(args, 'terrain') as TerrainId }),
  },
  {
    name: 'road',
    args: [{ name: 'square', kind: 'square' }, { name: 'to', kind: ON_OFF }],
    about: 'Lays a road on a square of land, or takes it up.',
    example: 'road 20,30 on',
    build: (args) => ({ cheat: 'road', at: at(args), on: isOn(args) }),
  },
  {
    name: 'plow',
    args: [{ name: 'square', kind: 'square' }, { name: 'to', kind: ON_OFF }],
    about: 'Plows a square of open land, or lets it go back.',
    example: 'plow 20,30 on',
    build: (args) => ({ cheat: 'plow', at: at(args), on: isOn(args) }),
  },
  {
    name: 'river',
    args: [{ name: 'square', kind: 'square' }, { name: 'river', kind: { oneOf: RIVERS } }],
    about: 'Runs a minor or a major river through a square of land, or dries it up.',
    example: 'river 20,30 major',
    build: (args) => ({ cheat: 'river', at: at(args), river: wordArg(args, 'river') as River }),
  },
  {
    name: 'resource',
    args: [{ name: 'square', kind: 'square' }, { name: 'resource', kind: { anyOf: ['resource', { oneOf: ['none'] }] } }],
    about: 'Puts a special resource on a square whose ground suits it, or takes away the one there.',
    example: 'resource 20,30 wheat',
    build: (args) => ({ cheat: 'resource', at: at(args), resource: resourceArg(args, 'resource') }),
  },
  {
    name: 'rumor',
    args: [{ name: 'square', kind: 'square' }, { name: 'to', kind: ON_OFF }],
    about: 'Starts a rumour of a lost city on a square of land, or lays it to rest. None can start under a colony or a settlement.',
    example: 'rumor 20,30 on',
    build: (args) => ({ cheat: 'rumor', at: at(args), on: isOn(args) }),
  },
];
