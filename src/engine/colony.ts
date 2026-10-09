// Founding, joining, leaving and abandoning colonies (R-300).
import { isNativeLand, settlementAt } from './settlements';
import { addGoods, equipmentOf } from './cargo';
import { COLONY_LIMITS, COLONY_NAMES, STARTING_BUILDINGS } from './data/colony';
import { GOOD_IDS } from './data/goods';
import { LIBERTY } from './data/liberty';
import { PROFESSIONS } from './data/professions';
import type { RawGood } from './data/terrain';
import { UNIT_TYPES } from './data/units';
import { firstProject } from './construction';
import { revealAround } from './explore';
import { isInlandLake } from './movement';
import { suggestPlacement } from './placement';
import {
  colonyAt, hasFather, playerIndexOf, tileAt, type Colonist, type Colony, type ColonyId, type GameState, type Goods, type Job, type PlayerId,
  type Unit, type UnitId,
} from './state';
import { hasForest, isWater, terrainOf, type Tile } from './tile';
import { countWaterNeighbors, tileYield, type OutdoorWorker } from './yields';

export type ColonyErrorCode =
  | 'underSiege'
  | 'notColonist'
  | 'atSeaSite'
  | 'tooMountainous'
  | 'tooNear'
  | 'tooManyColonies'
  | 'atWarNoFounding'
  | 'noColonyHere'
  | 'colonyFull'
  | 'keepStockade'
  | 'noSuchColonist'
  | 'badName';

export type ColonyEvent =
  | { readonly type: 'colonyFounded'; readonly colonyId: ColonyId; readonly owner: PlayerId; readonly name: string; readonly x: number; readonly y: number }
  | { readonly type: 'colonistJoined'; readonly colonyId: ColonyId; readonly colonistId: UnitId }
  | { readonly type: 'colonistLeft'; readonly colonyId: ColonyId; readonly colonistId: UnitId }
  | { readonly type: 'colonyAbandoned'; readonly colonyId: ColonyId; readonly name: string }
  | { readonly type: 'colonyRenamed'; readonly colonyId: ColonyId; readonly name: string };

export type ColonyCheck = { readonly ok: true } | { readonly ok: false; readonly code: ColonyErrorCode; readonly message: string };

const OK: ColonyCheck = { ok: true };
const no = (code: ColonyErrorCode, message: string): ColonyCheck => ({ ok: false, code, message });

export const NEIGHBORS: readonly (readonly [number, number])[] = [
  [-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1],
];

export function coloniesOf(state: GameState, owner: PlayerId): Colony[] {
  return Object.values(state.colonies).filter((c) => c.owner === owner);
}

export function isFortified(colony: Colony): boolean {
  return colony.buildings.some((b) => (COLONY_LIMITS.fortifications as readonly string[]).includes(b));
}

/** May this unit settle? Any colonist (whatever it is equipped as) except an Indian Convert. */
function isSettler(unit: Unit): boolean {
  return UNIT_TYPES[unit.type].colonistRole && unit.profession !== null && unit.profession !== 'indianConvert';
}

/** Can a colony stand on this square at all, whoever asks? */
export function checkColonySite(state: GameState, x: number, y: number): ColonyCheck {
  const tile = tileAt(state.map, x, y);
  if (!tile || isWater(tile)) return no('atSeaSite', 'a colony needs dry land under it');
  if (tile.relief === 'mountains') return no('tooMountainous', 'mountains are no place for a colony');
  if (settlementAt(state, x, y)) return no('tooNear', 'a native settlement stands here');
  for (const [dx, dy] of [[0, 0], ...NEIGHBORS] as const) {
    const near = colonyAt(state, x + dx, y + dy);
    if (near) return no('tooNear', `${near.name} stands too close to this spot`);
  }
  return OK;
}

export function checkFound(state: GameState, unit: Unit): ColonyCheck {
  if (!isSettler(unit) || unit.aboard !== null) return no('notColonist', 'only colonists ashore can found a colony');
  const site = checkColonySite(state, unit.x, unit.y);
  if (!site.ok) return site;
  if (state.players.find((p) => p.id === unit.owner)?.atWar) return no('atWarNoFounding', 'no new colony can be started while the war for independence lasts');
  if (Object.keys(state.colonies).length >= COLONY_LIMITS.maxColonies || coloniesOf(state, unit.owner).length >= COLONY_LIMITS.maxColoniesPerPower) {
    return no('tooManyColonies', 'the New World has no room for another colony of ours');
  }
  return OK;
}

export type SiteWarning = 'noPort' | 'fewSpaces' | 'noForest';

/**
 * Reasons to think twice about a legal site. No access to the ocean is always raised; little
 * workable land and no forest alongside only on the two easiest levels.
 */
export function siteWarnings(state: GameState, x: number, y: number, owner: PlayerId | null = null): SiteWarning[] {
  const around = NEIGHBORS.map(([dx, dy]) => ({ x: x + dx, y: y + dy, tile: tileAt(state.map, x + dx, y + dy) })).filter(
    (n): n is { x: number; y: number; tile: Tile } => n.tile !== null,
  );
  const warnings: SiteWarning[] = [];
  if (!around.some((n) => isWater(n.tile) && !isInlandLake(state.map, n.x, n.y))) warnings.push('noPort');
  if (!(COLONY_LIMITS.tutorialLevels as readonly string[]).includes(state.difficulty)) return warnings;
  // one point for each neighbour worth working and free of another owner, one more for a special resource
  let points = 0;
  for (const { tile } of around) {
    const usable = !isWater(tile) && tile.base !== 'desert' && tile.base !== 'arctic';
    const free = tile.claim === null || tile.claim === owner;
    if (usable && free && !isNativeLand(state, tile, owner)) points++;
    if (tile.resource !== null) points++;
  }
  if (points < COLONY_LIMITS.fewSpacesBelow) warnings.push('fewSpaces');
  if (!around.some((n) => hasForest(n.tile))) warnings.push('noForest');
  return warnings;
}

/** The next unused name from the owner's list, numbering the list round again when it runs out. */
export function nextColonyName(state: GameState, owner: PlayerId): string {
  const list = COLONY_NAMES[state.players.find((p) => p.id === owner)?.nation ?? 'england'];
  const taken = new Set(Object.values(state.colonies).map((c) => c.name));
  for (let round = 1; round < 100; round++) {
    for (const base of list) {
      const name = round === 1 ? base : `${base} ${round}`;
      if (!taken.has(name)) return name;
    }
  }
  return `Colony ${Object.keys(state.colonies).length + 1}`;
}

export function checkName(state: GameState, name: string, except: ColonyId | null = null): ColonyCheck {
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > 24) return no('badName', 'a colony name has 1 to 24 characters');
  if (Object.values(state.colonies).some((c) => c.name === trimmed && c.id !== except)) return no('badName', 'that name is taken');
  return OK;
}

function workerOf(profession: Colonist['profession']): OutdoorWorker {
  return { expertGood: PROFESSIONS[profession].expertGood, convert: profession === 'indianConvert' };
}

/** Squares around a colony that one of its colonists is already working. */
function workedSquares(colony: Colony): Set<string> {
  const worked = new Set<string>();
  for (const c of colony.colonists) if (c.job.kind === 'field') worked.add(`${c.job.dx},${c.job.dy}`);
  return worked;
}

/** The free square around the colony where this colonist would raise the most food (fish counts), if any raises some. */
export function bestFoodJob(state: GameState, colony: Colony, profession: Colonist['profession']): Job {
  const worked = workedSquares(colony);
  const worker = workerOf(profession);
  let best: { job: Job; amount: number } | null = null;
  for (const [dx, dy] of NEIGHBORS) {
    if (worked.has(`${dx},${dy}`)) continue;
    const x = colony.x + dx;
    const y = colony.y + dy;
    const tile = tileAt(state.map, x, y);
    if (!tile || colonyAt(state, x, y)) continue;
    const good: RawGood = isWater(tile) ? 'fish' : 'food';
    const amount = tileYield(tile, good, worker, {
      waterNeighbors: countWaterNeighbors(state.map, x, y),
      hasDocks: colony.buildings.includes('docks'),
    });
    if (amount > (best?.amount ?? 0)) best = { job: { kind: 'field', dx, dy, good }, amount };
  }
  return best?.job ?? { kind: 'idle' };
}

function removeUnit(state: GameState, unitId: UnitId): GameState {
  const { [unitId]: _gone, ...units } = state.units;
  return { ...state, units };
}

/** Kit a unit hands in when it settles down: muskets, horses, tools. */
function handIn(goods: Goods, unit: Unit): Goods {
  let next = goods;
  const kit = equipmentOf(unit);
  for (const good of GOOD_IDS) {
    const amount = kit[good] ?? 0;
    if (amount > 0) next = addGoods(next, good, amount);
  }
  return next;
}

export function foundColony(state: GameState, unit: Unit, name: string, events: ColonyEvent[]): GameState {
  const id: ColonyId = `c${state.nextId}`;
  const shell: Colony = {
    id, owner: unit.owner, name, x: unit.x, y: unit.y,
    goods: handIn({}, unit), buildings: [...STARTING_BUILDINGS], colonists: [], founded: state.turn, exports: [], hammers: 0, construction: firstProject(state, unit),
    sol: { n: 0, d: LIBERTY.initialDenominator + LIBERTY.perColonist }, solLevel: 0, toryNoticed: false,
  };
  const founder: Colonist = { id: unit.id, profession: unit.profession ?? 'freeColonist', job: suggestPlacement(state, shell, unit.profession ?? 'freeColonist'), turns: 0 };
  const colony: Colony = { ...shell, colonists: [founder] };
  let next: GameState = { ...removeUnit(state, unit.id), colonies: { ...state.colonies, [id]: colony }, nextId: state.nextId + 1 };
  // The colony owns its square and sees one square around itself.
  const tiles = [...next.map.tiles];
  const i = unit.y * next.map.width + unit.x;
  tiles[i] = { ...(tiles[i] as Tile), claim: unit.owner, rumor: false };
  next = { ...next, map: revealAround({ ...next.map, tiles }, playerIndexOf(next, unit.owner), unit.x, unit.y, 1).map };
  events.push({ type: 'colonyFounded', colonyId: id, owner: unit.owner, name, x: unit.x, y: unit.y });
  return next;
}

export function checkJoin(state: GameState, unit: Unit): ColonyCheck {
  if (!UNIT_TYPES[unit.type].colonistRole || unit.profession === null) return no('notColonist', 'only colonists can join a colony');
  const colony = colonyAt(state, unit.x, unit.y);
  if (!colony || colony.owner !== unit.owner) return no('noColonyHere', 'there is no colony of ours here');
  if (colony.colonists.length >= COLONY_LIMITS.maxPopulation) return no('colonyFull', `${colony.name} is far too crowded`);
  return OK;
}

export function joinColony(state: GameState, unit: Unit, events: ColonyEvent[]): GameState {
  const colony = colonyAt(state, unit.x, unit.y) as Colony;
  const profession = unit.profession ?? 'freeColonist';
  const colonist: Colonist = { id: unit.id, profession, job: suggestPlacement(state, colony, profession), turns: 0 };
  const colonists = [...colony.colonists, colonist];
  // La Salle: a colony that reaches three colonists is given a Stockade.
  const stockade = colonists.length >= COLONY_LIMITS.stockadeMinPopulation && !isFortified(colony) && hasFather(state, colony.owner, COLONY_LIMITS.freeStockadeFather);
  const joined: Colony = {
    ...colony, goods: handIn(colony.goods, unit), colonists, sol: { n: colony.sol.n, d: colony.sol.d + LIBERTY.perColonist },
    buildings: stockade ? [...colony.buildings, 'stockade'] : colony.buildings,
  };
  events.push({ type: 'colonistJoined', colonyId: colony.id, colonistId: unit.id });
  return { ...removeUnit(state, unit.id), colonies: { ...state.colonies, [colony.id]: joined } };
}

/** May this colonist step outside? The last one may not (that is abandoning), nor may a fortified colony drop below three. */
export function checkLeave(colony: Colony | undefined, colonistId: UnitId): ColonyCheck {
  if (!colony) return no('noColonyHere', 'no such colony');
  if (!colony.colonists.some((c) => c.id === colonistId)) return no('noSuchColonist', 'no such colonist in that colony');
  if (isFortified(colony) && colony.colonists.length <= COLONY_LIMITS.stockadeMinPopulation) {
    return no('keepStockade', `a colony behind a stockade or stronger works keeps at least ${COLONY_LIMITS.stockadeMinPopulation} colonists`);
  }
  if (colony.colonists.length <= 1) return no('noSuchColonist', 'the last colonist leaves only by abandoning the colony');
  return OK;
}

function asUnit(colony: Colony, colonist: Colonist): Unit {
  return {
    id: colonist.id, owner: colony.owner, type: 'colonist', profession: colonist.profession, x: colony.x, y: colony.y,
    movesLeft: 0, orders: 'none', destination: null, aboard: null, cargo: {}, tools: 0, workTurns: 0, route: null, repair: 0, treasure: 0, voyage: null,
  };
}

export function leaveColony(state: GameState, colony: Colony, colonistId: UnitId, events: ColonyEvent[]): GameState {
  const colonist = colony.colonists.find((c) => c.id === colonistId) as Colonist;
  const left: Colony = { ...colony, colonists: colony.colonists.filter((c) => c.id !== colonistId), sol: withoutOne(colony.sol) };
  events.push({ type: 'colonistLeft', colonyId: colony.id, colonistId });
  return { ...state, colonies: { ...state.colonies, [colony.id]: left }, units: { ...state.units, [colonist.id]: asUnit(colony, colonist) } };
}

/** Membership bookkeeping after one colonist is gone (left or died). */
export function withoutOne(sol: Colony['sol']): Colony['sol'] {
  const d = sol.d - LIBERTY.perColonist;
  return { n: Math.max(0, Math.min(sol.n, d)), d };
}

export function checkAbandon(colony: Colony | undefined): ColonyCheck {
  if (!colony) return no('noColonyHere', 'no such colony');
  if (isFortified(colony)) return no('keepStockade', 'a colony behind a stockade or stronger works cannot be abandoned');
  return OK;
}

/** Give the colony up: its people walk out as units; buildings and stores are lost. */
export function abandonColony(state: GameState, colony: Colony, events: ColonyEvent[]): GameState {
  const { [colony.id]: _gone, ...colonies } = state.colonies;
  const units = { ...state.units };
  for (const colonist of colony.colonists) units[colonist.id] = asUnit(colony, colonist);
  const tiles = [...state.map.tiles];
  const i = colony.y * state.map.width + colony.x;
  tiles[i] = { ...(tiles[i] as Tile), claim: null };
  events.push({ type: 'colonyAbandoned', colonyId: colony.id, name: colony.name });
  return { ...state, colonies, units, map: { ...state.map, tiles } };
}

/** Terrain row of the colony's own square, for callers that describe it. */
export function colonyTerrain(state: GameState, colony: Colony): string {
  return terrainOf(tileAt(state.map, colony.x, colony.y) as Tile);
}
