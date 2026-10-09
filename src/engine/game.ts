import { STARTING_GOLD } from './data/europe';
import { MAPGEN, type WorldOptions } from './data/mapgen';
import { NATION_IDS, STARTING_FORCE, type NationId } from './data/nations';
import type { ProfessionId } from './data/professions';
import { UNIT_TYPES, type UnitTypeId } from './data/units';
import { NATIVES, TRIBE_IDS, TRIBES, type TribeId } from './data/tribes';
import { DEFAULT_DIFFICULTY, DIFFICULTIES, type Difficulty } from './data/yields';
import { revealAround, sightRadius } from './explore';
import { createMarket } from './market';
import { americaMap, americaStarts } from './mapgen/america';
import { generateWorld } from './mapgen/generate';
import { placeAmericaSettlements, placeRandomSettlements } from './mapgen/settlements';
import { placeBraves } from './braves';
import { startingPool } from './immigration';
import { fullMoves } from './movement';
import { createRng, type Rng } from './rng';
import { startingRef } from './royal';
import { markHomelands } from './settlements';
import { SCHEMA_VERSION, type GameMap, type GameState, type Player, type Settlement, type TribeState, type Unit } from './state';
import { isLand, isWater, makeTile, type Tile } from './tile';

export interface NewGameOptions {
  readonly seed: number | string;
  /** A player without a nation takes the next one free, in the order England, France, Spain, Netherlands. */
  readonly players?: readonly (Pick<Player, 'id' | 'name' | 'kind'> & { readonly nation?: NationId })[];
  readonly width?: number;
  readonly height?: number;
  /** Generate a full random New World with these settings instead of the small test map. */
  readonly world?: WorldOptions;
  /** Defaults to the middle level. */
  readonly difficulty?: Difficulty;
  /** Play on the fixed America map; takes precedence over `world`. */
  readonly scenario?: 'america';
}

const DEFAULT_PLAYERS: NewGameOptions['players'] = [{ id: 'p0', name: 'Player', kind: 'human' }];

// Placeholder world until the Phase 1 generator lands: a land block ringed by ocean, with one
// unit per player placed on a random land tile.
function placeholderMap(width: number, height: number): GameMap {
  const tiles: Tile[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const edge = x < 2 || y < 2 || x >= width - 2 || y >= height - 2;
      tiles.push(makeTile({ base: edge ? 'ocean' : 'plains' }));
    }
  }
  return { width, height, tiles };
}

/** Starting sea squares on a random map: the inner edge of the eastern Sea Lane, spread north to south. */
function randomStarts(map: GameMap, rng: Rng, count: number): [number, number][] {
  const x = map.width - 1 - MAPGEN.eastLaneColumns;
  const top = Math.floor(map.height * 0.2);
  const band = Math.floor((map.height * 0.6) / count);
  const starts: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    let y = top + i * band + rng.int(0, Math.max(0, band - 1));
    // slide along the lane until the square is open water
    for (let tries = 0; tries < map.height && !isWater(map.tiles[y * map.width + x] as Tile); tries++) y = (y % (map.height - 2)) + 1;
    starts.push([x, y]);
  }
  return starts;
}

export function createGame(options: NewGameOptions): GameState {
  const width = options.width ?? 12;
  const height = options.height ?? 12;
  if (width < 5 || height < 5) throw new RangeError('map must be at least 5x5');
  const rng = createRng(options.seed);
  const setup = rng.fork('setup');
  const asked = options.players ?? DEFAULT_PLAYERS ?? [];
  const free = NATION_IDS.filter((n) => !asked.some((p) => p.nation === n));
  const players: Player[] = asked.map((p): Player => ({
    id: p.id, name: p.name, kind: p.kind, nation: p.nation ?? free.shift() ?? 'england',
    gold: p.kind === 'human' ? STARTING_GOLD[options.difficulty ?? DEFAULT_DIFFICULTY] : 0, fathers: [], bells: 0, fatherBells: 0, candidate: null, fatherOffer: [], crosses: 0, taxRate: 0, pendingTax: null, royalWeddings: 0, lastRoyalEnemy: -1, boycotts: [], entry: [0, 0], artilleryBought: 0, atWar: false, pool: [], recruits: 0, hadImmigrant: false, immigrantDue: false,
    royalMoney: 0, ref: startingRef(options.difficulty ?? DEFAULT_DIFFICULTY), stance: {}, dealings: {}, audiencesDue: [], pendingBurial: null, fountain: 0, rumorLossSpared: false, villagesBurned: 0, demands: [], pendingTreaties: [], pendingOffer: null, scored: false, revolution: null, withdrawn: false, independent: false, independenceTalk: 0,
  })).map((p) => ({ ...p, pool: startingPool(rng.fork(`immigrants:${p.id}`), p, options.difficulty ?? DEFAULT_DIFFICULTY) }));
  if (players.length === 0) throw new RangeError('a game needs at least one player');

  let map =
    options.scenario === 'america'
      ? americaMap(rng.fork('world'))
      : options.world
        ? generateWorld(rng.fork('world'), options.world)
        : placeholderMap(width, height);

  const units: Record<string, Unit> = {};
  let nextId = 1;
  const add = (owner: string, type: UnitTypeId, profession: ProfessionId | null, x: number, y: number, aboard: string | null): Unit => {
    const id = `u${nextId++}`;
    const base: Unit = {
      id, owner, type, profession, x, y, aboard, orders: aboard ? 'sentry' : 'none', destination: null, movesLeft: 0,
      cargo: {}, tools: UNIT_TYPES[type].equipment.tools, workTurns: 0, route: null, repair: 0, treasure: 0, voyage: null,
    };
    const unit: Unit = { ...base, movesLeft: fullMoves(base) };
    units[id] = unit;
    return unit;
  };

  if (options.world || options.scenario) {
    // A full game: each power arrives by sea with soldiers and pioneers aboard one ship.
    const america = options.scenario === 'america' ? americaStarts() : null;
    const random = america ? [] : randomStarts(map, setup, players.length);
    players.forEach((p, index) => {
      const [x, y] = america ? america[p.nation] : (random[index] as [number, number]);
      players[index] = { ...p, entry: [x, y] };
      const ship = add(p.id, STARTING_FORCE.ship[p.nation], null, x, y, null);
      const veteran = (STARTING_FORCE.veteranSoldier as readonly NationId[]).includes(p.nation)
        || (p.kind === 'human' && DIFFICULTIES.indexOf(options.difficulty ?? DEFAULT_DIFFICULTY) < STARTING_FORCE.humanVeteranBelowLevel);
      add(p.id, 'soldier', veteran ? 'veteranSoldier' : 'freeColonist', x, y, ship.id);
      add(p.id, 'pioneer', (STARTING_FORCE.hardyPioneer as readonly NationId[]).includes(p.nation) ? 'hardyPioneer' : 'freeColonist', x, y, ship.id);
      map = revealAround(map, index, x, y, sightRadius(ship.type, false)).map;
    });
  } else {
    // The small test map: one colonist per player on open land.
    const spots: number[] = [];
    map.tiles.forEach((t, i) => {
      if (isLand(t) && t.relief === 'flat' && t.base !== 'arctic') spots.push(i);
    });
    players.forEach((p, index) => {
      const spot = setup.pick(spots);
      const unit = add(p.id, 'colonist', 'freeColonist', spot % map.width, Math.floor(spot / map.width), null);
      map = revealAround(map, index, unit.x, unit.y, sightRadius(unit.type, false)).map;
    });
  }

  // the peoples already living there
  let settlements: Settlement[] = [];
  if (options.scenario === 'america') settlements = placeAmericaSettlements(map, rng.fork('natives'));
  else if (options.world) settlements = placeRandomSettlements(map, rng.fork('natives'));
  map = markHomelands(map, settlements);
  const wary = rng.fork('alarm');
  const tribes: Partial<Record<TribeId, TribeState>> = {};
  for (const tribe of TRIBE_IDS) {
    if (!settlements.some((s) => s.tribe === tribe)) continue;
    const alarm: Record<string, number> = {};
    for (const p of players) alarm[p.id] = wary.int(0, NATIVES.startAlarmSpread) + (p.kind === 'human' ? NATIVES.startAlarmPerLevel * DIFFICULTIES.indexOf(options.difficulty ?? DEFAULT_DIFFICULTY) : 0);
    // silver in the hills: a little for every mountain near each settlement, more for the advanced peoples
    let silver = 0;
    for (const s of settlements) {
      if (s.tribe !== tribe) continue;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) if (map.tiles[(s.y + dy) * map.width + s.x + dx]?.relief === 'mountains') silver += TRIBES[tribe].tech;
      }
    }
    tribes[tribe] = { alarm, goodwill: {}, met: [], muskets: 0, horses: 0, breeding: 0, silver, peace: [], landSold: 0, grudge: [], joinedCrown: false, visited: {}, stock: {} };
  }

  const made: GameState = {
    schemaVersion: SCHEMA_VERSION,
    seed: options.seed,
    difficulty: options.difficulty ?? DEFAULT_DIFFICULTY,
    rng: rng.state(),
    turn: 0,
    current: 0,
    players,
    map,
    units,
    colonies: {},
    settlements: Object.fromEntries(settlements.map((s) => [s.id, s])),
    tribes,
    tradeRoutes: {},
    market: createMarket(rng.fork('market'), players),
    nextId,
    over: null,
    succession: null,
    audience: null,
    crownPlayer: null,
    rumors: { explored: 0, cibolas: 0 },
    parley: null,
  };
  // each settlement sends out its first band of braves
  return settlements.length > 0 ? placeBraves(made, rng.fork('braves')) : made;
}
