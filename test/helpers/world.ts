// Tiny hand-drawn worlds for rule tests.
import { startingRef } from '../../src/engine/royal';
import { FATHER_IDS, type FatherId } from '../../src/engine/data/fathers';
import type { GoodId } from '../../src/engine/data/goods';
import type { ProfessionId } from '../../src/engine/data/professions';
import { UNIT_TYPES, type UnitTypeId } from '../../src/engine/data/units';
import { createMarket } from '../../src/engine/market';
import { createRng, seedRng } from '../../src/engine/rng';
import { MOVE_THIRDS, SCHEMA_VERSION, type Colony, type GameState, type Goods, type Unit } from '../../src/engine/state';
import { makeTile, type Tile } from '../../src/engine/tile';

const GLYPHS: Record<string, Partial<Tile>> = {
  '~': { base: 'ocean' },
  s: { base: 'seaLane' },
  '.': { base: 'plains' },
  g: { base: 'grassland' },
  f: { base: 'plains', forest: true },
  w: { base: 'swamp' },
  W: { base: 'swamp', forest: true },
  h: { base: 'plains', relief: 'hills' },
  m: { base: 'plains', relief: 'mountains' },
  a: { base: 'arctic' },
  '=': { base: 'plains', road: true },
  r: { base: 'plains', river: 'minor' },
  R: { base: 'plains', river: 'major' },
  F: { base: 'plains', forest: true, road: true },
};

/** Tests name fathers as plain strings; a misspelt one fails loudly here rather than silently doing nothing. */
function knownFathers(names: readonly string[]): FatherId[] {
  for (const name of names) if (!(FATHER_IDS as readonly string[]).includes(name)) throw new Error(`unknown father "${name}"`);
  return names as FatherId[];
}

export interface WorldSpec {
  readonly rows: readonly string[];
  readonly players?: readonly { id: string; kind?: 'human' | 'ai'; fathers?: readonly string[]; atWar?: boolean; taxRate?: number; nation?: 'england' | 'france' | 'spain' | 'netherlands' }[];
  readonly seed?: number | string;
  readonly difficulty?: GameState['difficulty'];
}

/** Build a state from rows of glyphs (see GLYPHS). Every tile starts explored by everyone. */
export function world(spec: WorldSpec): GameState {
  const width = spec.rows[0]?.length ?? 0;
  const tiles: Tile[] = [];
  for (const row of spec.rows) {
    if (row.length !== width) throw new Error(`ragged row "${row}"`);
    for (const ch of row) {
      const patch = GLYPHS[ch];
      if (!patch) throw new Error(`unknown glyph "${ch}"`);
      tiles.push(makeTile({ ...patch, explored: 0xff }));
    }
  }
  const NATIONS_IN_ORDER = ['england', 'france', 'spain', 'netherlands'] as const;
  const players = (spec.players ?? [{ id: 'a' }, { id: 'b' }]).map((p, i) => ({ id: p.id, name: p.id.toUpperCase(), kind: p.kind ?? ('human' as const), nation: p.nation ?? NATIONS_IN_ORDER[i % 4]!, gold: 0, fathers: knownFathers(p.fathers ?? []), bells: 0, fatherBells: 0, candidate: null, fatherOffer: [], crosses: 0, taxRate: p.taxRate ?? 0, pendingTax: null, royalWeddings: 0, lastRoyalEnemy: -1, boycotts: [], entry: [0, 0] as const, artilleryBought: 0, atWar: p.atWar ?? false, pool: ['indenturedServant', 'freeColonist', 'expertFarmer'] as const, recruits: 0, hadImmigrant: false, immigrantDue: false, royalMoney: 0, ref: startingRef(spec.difficulty ?? 'conquistador'), stance: {}, dealings: {}, audiencesDue: [], pendingBurial: null, fountain: 0, rumorLossSpared: false, villagesBurned: 0, demands: [], pendingTreaties: [], pendingOffer: null, scored: false, revolution: null, withdrawn: false, independent: false, independenceTalk: 0 }));
  return {
    schemaVersion: SCHEMA_VERSION,
    seed: spec.seed ?? 1,
    difficulty: spec.difficulty ?? 'conquistador',
    rng: seedRng(spec.seed ?? 1),
    turn: 0,
    current: 0,
    players,
    map: { width, height: spec.rows.length, tiles },
    units: {},
    colonies: {},
    settlements: {},
    // one tribe that has met everybody, so a tile marked as Sioux land counts as native land
    tribes: { sioux: { alarm: {}, goodwill: {}, met: players.map((p) => p.id), muskets: 0, horses: 0, breeding: 0, silver: 0, peace: players.map((p) => p.id), landSold: 0, grudge: [], joinedCrown: false, visited: {}, stock: {} } },
    tradeRoutes: {},
    market: createMarket(createRng(spec.seed ?? 1).fork('market'), players),
    nextId: 1,
    over: null,
    succession: null,
    audience: null,
    crownPlayer: null,
    rumors: { explored: 0, cibolas: 0 },
    parley: null,
  };
}

export interface UnitSpec {
  readonly id: string;
  readonly type?: UnitTypeId;
  readonly owner?: string;
  readonly x: number;
  readonly y: number;
  readonly profession?: ProfessionId | null;
  readonly aboard?: string | null;
  readonly movesLeft?: number;
  readonly orders?: Unit['orders'];
  readonly cargo?: Goods;
  readonly tools?: number;
}

export function withUnit(state: GameState, spec: UnitSpec): GameState {
  const type = spec.type ?? 'colonist';
  const person = UNIT_TYPES[type].colonistRole;
  const unit: Unit = {
    id: spec.id,
    owner: spec.owner ?? 'a',
    type,
    profession: spec.profession === undefined ? (person ? 'freeColonist' : null) : spec.profession,
    x: spec.x,
    y: spec.y,
    movesLeft: spec.movesLeft ?? UNIT_TYPES[type].moves * MOVE_THIRDS,
    orders: spec.orders ?? 'none',
    destination: null,
    aboard: spec.aboard ?? null,
    cargo: spec.cargo ?? {},
    tools: spec.tools ?? UNIT_TYPES[type].equipment.tools,
    workTurns: 0,
    route: null,
    repair: 0,
    treasure: 0,
    voyage: null,
  };
  return { ...state, units: { ...state.units, [unit.id]: unit } };
}

export function withColony(state: GameState, colony: Partial<Colony> & Pick<Colony, 'id' | 'x' | 'y'>): GameState {
  const base: Colony = {
    owner: 'a', name: colony.id, goods: {}, buildings: [],
    colonists: [{ id: `${colony.id}-settler`, profession: 'freeColonist', job: { kind: 'idle' }, turns: 0 }], founded: 0, exports: [], hammers: 0, construction: null,
    sol: { n: 0, d: 100 }, solLevel: 0, toryNoticed: false,
    ...colony,
  };
  // unless a test says otherwise, membership starts at nil with the bookkeeping sized to the population
  const full: Colony = colony.sol ? base : { ...base, sol: { n: 0, d: 100 * (base.colonists.length + 1) } };
  return { ...state, colonies: { ...state.colonies, [full.id]: full } };
}

export function setTile(state: GameState, x: number, y: number, patch: Partial<Tile>): GameState {
  const tiles = [...state.map.tiles];
  const i = y * state.map.width + x;
  tiles[i] = { ...(tiles[i] as Tile), ...patch };
  return { ...state, map: { ...state.map, tiles } };
}

/** Fix a power's Europe prices for a test. Values are bids (what Europe pays); the ask follows from the table. */
export function withBids(state: GameState, bids: Partial<Record<GoodId, number>>, player = 'a'): GameState {
  const mine = state.market.powers[player];
  if (!mine) throw new Error(`no market for ${player}`);
  const price = { ...mine.price };
  for (const [good, bid] of Object.entries(bids) as [GoodId, number][]) price[good] = bid + 1;
  return { ...state, market: { ...state.market, powers: { ...state.market.powers, [player]: { ...mine, price } } } };
}
