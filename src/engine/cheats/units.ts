// Unit cheats (R-1059; docs/RULES.md "Cheats"): a new unit at a square, in a colony or in Europe;
// a unit moved across the map; its moves restored; a ship made sound; a soldier made a veteran.
// A unit is made the way the game's own code makes one (newDockUnit in Europe, joinColony into a
// colony), and a square must be one the unit could stand on. No cheat here meets anybody or digs up
// a rumour: that waits for the unit's next move.
import type { CheatCommand, CheatSpec, Place } from '../cheats';
import { joinColony } from '../colony';
import { CHEATS } from '../data/cheats';
import { COLONY_LIMITS } from '../data/colony';
import { PROFESSION_IDS, PROFESSIONS, type ProfessionId } from '../data/professions';
import { SIGHT } from '../data/sight';
import { NOT_CARRIED, PIONEER_TOOLS, UNIT_TYPE_IDS, UNIT_TYPES, type UnitTypeId } from '../data/units';
import { checkEuropeOpen, newDockUnit } from '../europe';
import { revealAround, sightRadius } from '../explore';
import { fullMoves, turnMoves } from '../movement';
import { settlementAt } from '../settlements';
import { cargoOf, colonyAt, hasFather, playerIndexOf, tileAt, unitsAt, type Colony, type GameState, type Player, type Unit, type UnitId } from '../state';
import { isWater, type Tile } from '../tile';
import { CHEAT_OK, onMap, refuse, squareArg, wordArg, type CheatCheck, type CheatOutcome, type CheatSink } from './shared';

type Square = { readonly x: number; readonly y: number };

export type UnitCommand =
  /** A new unit of the power. `profession` is for the types a colonist takes on; null there means a free colonist. */
  | { readonly cheat: 'spawn'; readonly unitType: UnitTypeId; readonly profession: ProfessionId | null; readonly place: Place }
  /** Move a unit on the map, and all aboard it, to a square. */
  | { readonly cheat: 'teleport'; readonly unit: UnitId; readonly to: Square }
  /** The unit's moves for the turn, again. */
  | { readonly cheat: 'moves'; readonly unit: UnitId }
  /** A damaged ship is sound. */
  | { readonly cheat: 'repair'; readonly unit: UnitId }
  /** A soldier or dragoon becomes a veteran. */
  | { readonly cheat: 'promote'; readonly unit: UnitId };

/** The types that go about under a veteran's name without being a colonist's role. */
const VETERAN_LINE: readonly UnitTypeId[] = ['continentalArmy', 'continentalCavalry'];
const PROMOTED: ProfessionId = 'veteranSoldier';
const PROMOTABLE: readonly UnitTypeId[] = ['soldier', 'dragoon'];

const isType = (type: unknown): type is UnitTypeId => (UNIT_TYPE_IDS as readonly unknown[]).includes(type);
const isProfession = (id: unknown): id is ProfessionId => (PROFESSION_IDS as readonly unknown[]).includes(id);

/** What a unit is called in a sentence: its trade for a person, with the role if it has one, else its type. */
function label(type: UnitTypeId, profession: ProfessionId | null): string {
  const def = UNIT_TYPES[type];
  if (!def.colonistRole || profession === null) return def.name;
  return type === 'colonist' ? PROFESSIONS[profession].name : `${PROFESSIONS[profession].name} (${def.name})`;
}
const called = (unit: Unit): string => `${label(unit.type, unit.profession)} ${unit.id}`;

/** The profession a spawned unit of this type has: the one asked for (a free colonist if none), or what the type always carries. */
function professionFor(type: UnitTypeId, asked: ProfessionId | null): ProfessionId | null {
  if (UNIT_TYPES[type].colonistRole) return asked ?? 'freeColonist';
  return VETERAN_LINE.includes(type) ? PROMOTED : null;
}

/**
 * Could a unit of this type, of this power, stand on this square? Land for a land unit; water, or
 * the power's own colony, for a ship; no settlement, no colony of another's, and no unit of
 * another's (`but` is the unit itself, when it is one being moved).
 */
function standing(state: GameState, player: Player, type: UnitTypeId, at: Square, but: UnitId | null = null): CheatCheck {
  if (typeof at !== 'object' || at === null || !onMap(state, at.x, at.y)) return refuse('cheatSquare', `there is no square ${String(at?.x)},${String(at?.y)} on the map`);
  const { x, y } = at;
  const where = `${x},${y}`;
  const settlement = settlementAt(state, x, y);
  if (settlement) return refuse('cheatSquare', `a native settlement stands at ${where}`);
  const colony = colonyAt(state, x, y);
  if (colony && colony.owner !== player.id) return refuse('cheatSquare', `${colony.name} at ${where} is another power's colony`);
  if (unitsAt(state, x, y).some((u) => u.owner !== player.id && u.id !== but)) return refuse('cheatSquare', `another's unit stands at ${where}`);
  const water = isWater(tileAt(state.map, x, y) as Tile);
  const name = UNIT_TYPES[type].name;
  if (UNIT_TYPES[type].domain === 'sea') return water || colony ? CHEAT_OK : refuse('cheatSquare', `a ${name} needs water or a colony of its own, and ${where} is land`);
  return water ? refuse('cheatSquare', `a ${name} cannot stand on the water at ${where}`) : CHEAT_OK;
}

/** One of the power's own units, or the refusal that says why not. */
function ownUnit(state: GameState, player: Player, id: UnitId): Unit | CheatCheck {
  const unit = typeof id === 'string' ? state.units[id] : undefined;
  if (!unit) return refuse('cheatTarget', `there is no unit "${String(id)}"`);
  return unit.owner === player.id ? unit : refuse('cheatTarget', `${called(unit)} is not a unit of ${player.name}`);
}
const isRefusal = (v: Unit | CheatCheck): v is CheatCheck => 'ok' in v;

function checkSpawn(state: GameState, player: Player, command: Extract<UnitCommand, { cheat: 'spawn' }>): CheatCheck {
  const { unitType: type, profession, place } = command;
  if (!isType(type)) return refuse('cheatTarget', `there is no unit type "${String(type)}"`);
  const def = UNIT_TYPES[type];
  if (def.native) return refuse('cheatTarget', `${def.name} are the natives' own and cannot be spawned`);
  if (type === 'damagedArtillery') return refuse('cheatTarget', `${def.name} cannot be spawned; spawn artillery`);
  if (profession !== null && profession !== undefined) {
    if (!def.colonistRole) return refuse('cheatTarget', `a ${def.name} takes no profession`);
    if (!isProfession(profession) || !PROFESSIONS[profession].colonist) return refuse('cheatTarget', `there is no profession "${String(profession)}" for a colonist`);
  }
  if (typeof place !== 'object' || place === null) return refuse('cheatSquare', 'spawn needs a place: a square, a colony or europe');
  switch (place.kind) {
    case 'square':
      return standing(state, player, type, place);
    case 'colony': {
      const colony = typeof place.colonyId === 'string' ? state.colonies[place.colonyId] : undefined;
      if (!colony) return refuse('cheatTarget', `there is no colony "${String(place.colonyId)}"`);
      if (colony.owner !== player.id) return refuse('cheatTarget', `${colony.name} is not a colony of ${player.name}`);
      if (!def.colonistRole) return standing(state, player, type, colony);
      return colony.colonists.length >= COLONY_LIMITS.maxPopulation ? refuse('cheatTarget', `${colony.name} is full, with ${colony.colonists.length} colonists`) : CHEAT_OK;
    }
    case 'europe': {
      const open = checkEuropeOpen(state, player.id);
      if (!open.ok) return refuse('cheatTarget', `Europe is closed to ${player.name}`);
      // nothing on the docks leaves but aboard a ship
      return def.domain !== 'sea' && def.size === NOT_CARRIED ? refuse('cheatTarget', `a ${def.name} could never leave Europe: no ship carries one`) : CHEAT_OK;
    }
    default:
      return refuse('cheatSquare', 'spawn needs a place: a square, a colony or europe');
  }
}

/** May this power have this cheat? Null when the command is not one of this group's. */
export function checkUnits(state: GameState, player: Player, command: CheatCommand): CheatCheck | null {
  switch (command.cheat) {
    case 'spawn':
      return checkSpawn(state, player, command);
    case 'teleport': {
      const unit = ownUnit(state, player, command.unit);
      if (isRefusal(unit)) return unit;
      if (unit.voyage !== null) return refuse('cheatTarget', `${called(unit)} is not on the map`);
      if (unit.aboard !== null) return refuse('cheatTarget', `${called(unit)} is aboard ${unit.aboard}; teleport the carrier`);
      return standing(state, player, unit.type, command.to, unit.id);
    }
    case 'moves': {
      const unit = ownUnit(state, player, command.unit);
      if (isRefusal(unit)) return unit;
      if (unit.voyage !== null) return refuse('cheatTarget', `${called(unit)} is not on the map`);
      return unit.repair > 0 ? refuse('cheatTarget', `${called(unit)} is under repair; repair her first`) : CHEAT_OK;
    }
    case 'repair': {
      const unit = ownUnit(state, player, command.unit);
      if (isRefusal(unit)) return unit;
      return unit.repair > 0 ? CHEAT_OK : refuse('cheatTarget', `${called(unit)} is not a ship under repair`);
    }
    case 'promote': {
      const unit = ownUnit(state, player, command.unit);
      if (isRefusal(unit)) return unit;
      if (!PROMOTABLE.includes(unit.type)) return refuse('cheatTarget', `${called(unit)} is neither a soldier nor a dragoon`);
      return unit.profession === PROMOTED ? refuse('cheatTarget', `${called(unit)} is a veteran already`) : CHEAT_OK;
    }
    default:
      return null;
  }
}

const withUnits = (state: GameState, changed: readonly Unit[]): GameState => ({ ...state, units: { ...state.units, ...Object.fromEntries(changed.map((u) => [u.id, u])) } });

/** The squares in the unit's sight become known to its owner, as they would had it moved there. */
function seen(state: GameState, unit: Unit): GameState {
  const radius = sightRadius(unit.type, hasFather(state, unit.owner, SIGHT.deSoto));
  return { ...state, map: revealAround(state.map, playerIndexOf(state, unit.owner), unit.x, unit.y, radius).map };
}

function spawn(state: GameState, player: Player, command: Extract<UnitCommand, { cheat: 'spawn' }>): CheatOutcome {
  const { unitType: type, place } = command;
  const profession = professionFor(type, command.profession ?? null);
  const name = label(type, profession);
  // as the docks make it; the kit a pioneer and a treasure train carry is theirs wherever they appear
  const docked: Unit = { ...newDockUnit(state, player.id, type, profession), tools: type === 'pioneer' ? PIONEER_TOOLS.max : 0, treasure: type === 'treasure' ? CHEATS.treasureGold : 0 };
  const counted: GameState = { ...state, nextId: state.nextId + 1 };
  if (place.kind === 'europe') return { state: withUnits(counted, [docked]), summary: `Spawned ${name} ${docked.id} in Europe.` };
  const colony = place.kind === 'colony' ? (state.colonies[place.colonyId] as Colony) : null;
  const { x, y } = colony ?? (place as Square);
  const ashore: Unit = { ...docked, x, y, voyage: null, orders: 'none', movesLeft: fullMoves(docked) };
  if (colony && UNIT_TYPES[type].colonistRole) {
    // through the colony's own door: the kit goes to the warehouse and the colonist to work
    return { state: joinColony(counted, ashore, []), summary: `Spawned ${PROFESSIONS[profession as ProfessionId].name} ${ashore.id} as a colonist of ${colony.name}.` };
  }
  return { state: seen(withUnits(counted, [ashore]), ashore), summary: `Spawned ${name} ${ashore.id} at ${x},${y}.` };
}

/** Apply a checked cheat of this group. Null when the command is not one of this group's. */
export function applyUnits(state: GameState, player: Player, command: CheatCommand, _events: CheatSink): CheatOutcome | null {
  switch (command.cheat) {
    case 'spawn':
      return spawn(state, player, command);
    case 'teleport': {
      const unit = state.units[command.unit] as Unit;
      const { x, y } = command.to;
      // standing orders belong to the place left behind; a carrier on a trade route keeps its route
      const moved: Unit = unit.orders === 'trade' ? { ...unit, x, y } : { ...unit, x, y, orders: 'none', destination: null, workTurns: 0 };
      const riders = cargoOf(state, unit.id).map((u) => ({ ...u, x, y }));
      const along = riders.length === 0 ? '' : ` with ${riders.length} aboard`;
      return { state: seen(withUnits(state, [moved, ...riders]), moved), summary: `Moved ${called(unit)} to ${x},${y}${along}.` };
    }
    case 'moves': {
      const unit = state.units[command.unit] as Unit;
      return { state: withUnits(state, [{ ...unit, movesLeft: turnMoves(state, unit) }]), summary: `Restored the moves of ${called(unit)}.` };
    }
    case 'repair': {
      const unit = state.units[command.unit] as Unit;
      return { state: withUnits(state, [{ ...unit, repair: 0 }]), summary: `Repaired ${called(unit)}.` };
    }
    case 'promote': {
      const unit = state.units[command.unit] as Unit;
      const veteran: Unit = { ...unit, profession: PROMOTED };
      return { state: withUnits(state, [veteran]), summary: `Promoted ${called(unit)} to ${label(veteran.type, PROMOTED)}.` };
    }
    default:
      return null;
  }
}

type Args = Parameters<CheatSpec['build']>[0];
/** The place a spawn is for. The console fills in the active unit's square when the line names none. */
function placeArg(args: Args, name: string): Place {
  const v = args[name];
  if (typeof v === 'object' && 'kind' in v) {
    if (v.kind === 'europe') return { kind: 'europe' };
    if (v.kind === 'colony' && 'colonyId' in v) return { kind: 'colony', colonyId: v.colonyId };
    if (v.kind === 'square' && 'x' in v) return { kind: 'square', x: v.x, y: v.y };
  }
  // left out, or not a place: the check refuses it in words the player can read
  return undefined as unknown as Place;
}

export const UNIT_SPECS: readonly CheatSpec[] = [
  {
    name: 'spawn',
    args: [{ name: 'unitType', kind: 'unitType' }, { name: 'profession', kind: 'profession', optional: true }, { name: 'place', kind: 'place', optional: true }],
    about: `Makes a new unit at a square (here if none is given), in a colony of yours, or in Europe. A colonist, soldier, pioneer, scout, dragoon or missionary may be given a profession and joins a colony named as one of its colonists. A treasure train carries ${CHEATS.treasureGold} gold.`,
    example: 'spawn soldier veteran here',
    build: (args) => ({ cheat: 'spawn', unitType: wordArg(args, 'unitType') as UnitTypeId, profession: (wordArg(args, 'profession') as ProfessionId | undefined) ?? null, place: placeArg(args, 'place') }),
  },
  {
    name: 'teleport',
    args: [{ name: 'unit', kind: 'unit' }, { name: 'square', kind: 'square' }],
    about: 'Moves one of your units on the map to a square it could stand on, with all aboard it. Its moves are kept.',
    example: 'teleport active 20,30',
    build: (args) => ({ cheat: 'teleport', unit: wordArg(args, 'unit') as UnitId, to: squareArg(args, 'square') as Square }),
  },
  {
    name: 'moves',
    args: [{ name: 'unit', kind: 'unit' }],
    about: 'Gives a unit its moves for the turn again.',
    example: 'moves active',
    build: (args) => ({ cheat: 'moves', unit: wordArg(args, 'unit') as UnitId }),
  },
  {
    name: 'repair',
    args: [{ name: 'unit', kind: 'unit' }],
    about: 'Makes a damaged ship sound at once.',
    example: 'repair u12',
    build: (args) => ({ cheat: 'repair', unit: wordArg(args, 'unit') as UnitId }),
  },
  {
    name: 'promote',
    args: [{ name: 'unit', kind: 'unit' }],
    about: 'Makes a soldier or a dragoon a veteran.',
    example: 'promote active',
    build: (args) => ({ cheat: 'promote', unit: wordArg(args, 'unit') as UnitId }),
  },
];
