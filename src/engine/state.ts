// The whole game as one plain JSON value: no classes, no Maps, no undefined (R-003).
// Later phases widen these types; anything added here must survive JSON.parse(JSON.stringify()).
import type { BuildingId } from './data/buildings';
import type { BuildableUnit } from './data/construction';
import type { FatherId } from './data/fathers';
import type { GoodId } from './data/goods';
import type { NationId } from './data/nations';
import type { TradeId } from './data/production';
import type { ProfessionId } from './data/professions';
import type { TribeId } from './data/tribes';
import type { RawGood } from './data/terrain';
import type { Difficulty } from './data/yields';
import type { UnitTypeId } from './data/units';
import type { RngState } from './rng';
import type { Tile } from './tile';

export const SCHEMA_VERSION = 1;

export type PlayerId = string;
export type UnitId = string;

/** Amounts of goods; a good that is absent counts as zero and zero amounts are never stored. */
export type Goods = Readonly<Partial<Record<GoodId, number>>>;
export type ColonyId = string;

export interface Player {
  /** Computer powers only: arms kept in Europe for fitting out recruits (muskets in lots of 50, horses singly). */
  readonly reserve?: { readonly muskets: number; readonly horses: number };
  /** Computer powers only: native peoples it has made up its mind to fight, whatever their mood. */
  readonly tribeWars?: readonly string[];
  /** Computer powers only: guns its colonies have built, each good for one piece of artillery in Europe at no cost. */
  readonly gunCredit?: number;
  readonly id: PlayerId;
  readonly name: string;
  readonly kind: 'human' | 'ai';
  readonly nation: NationId;
  readonly gold: number;
  /** Founding Fathers in this player's Congress, by id (R-700 fills this). */
  readonly fathers: readonly FatherId[];
  /** Liberty bells rung in all colonies so far (feeds the Continental Congress, R-701). */
  readonly bells: number;
  /** Bells gathered toward the next Founding Father (reset when one joins). */
  readonly fatherBells: number;
  /** The Founding Father the Congress is working toward. */
  readonly candidate: FatherId | null;
  /** Candidates put before a human power, awaiting its choice (one from each field that has any). */
  readonly fatherOffer: readonly FatherId[];
  /** Crosses gathered toward the next immigrant (R-405). */
  readonly crosses: number;
  /** Tax rate in Europe, percent (R-401). */
  readonly taxRate: number;
  /** A tax rise the player has yet to answer: accept, or hold a party over this good in this colony. */
  readonly pendingTax: PendingTax | null;
  /** How many times the King has married (each wedding is a reason for a tax). */
  readonly royalWeddings: number;
  /** Index of the enemy named in the King's last war, or -1. */
  readonly lastRoyalEnemy: number;
  /** Goods Europe will not trade with this power until the back taxes are paid. */
  readonly boycotts: readonly GoodId[];
  /** Sea square where ships of this power arrive from Europe when they have no departure square of their own. */
  readonly entry: readonly [number, number];
  /** Artillery bought in Europe so far (each purchase raises the price). */
  readonly artilleryBought: number;
  /** Fighting the War of Independence (set by R-900). */
  readonly atWar: boolean;
  /** The three would-be immigrants waiting in Europe. */
  readonly pool: readonly ProfessionId[];
  /** Passages paid for so far; each makes the next dearer. */
  readonly recruits: number;
  /** Whether anyone has yet come over from the pool. */
  readonly hadImmigrant: boolean;
  /** Crosses have brought an immigrant and this power is to choose which (Brewster). */
  readonly immigrantDue: boolean;
  /** Taxes paid and royal savings not yet spent on the Expeditionary Force. */
  readonly royalMoney: number;
  /** The force the Crown holds ready against this power. */
  readonly ref: RefForce;
  /** Relations with the other powers met so far; no entry means no contact. */
  readonly stance: Readonly<Record<PlayerId, 'peace' | 'war'>>;
  /** Burial mounds a party has found and not yet decided about. */
  readonly pendingBurial: { readonly unitId: UnitId; readonly x: number; readonly y: number; readonly q: number; readonly skill: number } | null;
  /** Immigrants still owed by a Fountain of Youth. */
  readonly fountain: number;
  /** The first party this power would have lost to a rumor found burial mounds instead; that grace is used. */
  readonly rumorLossSpared: boolean;
  /** Native settlements this power has destroyed (counts against the final score). */
  readonly villagesBurned: number;
  /** What braves at the gates are asking for, awaiting an answer. */
  readonly demands: readonly NativeDemand[];
  /** Tribes newly met whose offer of a treaty awaits an answer. */
  readonly pendingTreaties: readonly TribeId[];
  /** What lies behind the plain war-or-peace of `stance`, for each power met. */
  readonly dealings: Readonly<Record<PlayerId, Dealing>>;
  /** Powers that wish to speak with this (human) power. */
  readonly audiencesDue: readonly PlayerId[];
  /** An offer from the Crown awaiting an answer. */
  readonly pendingOffer: RoyalOffer | null;
  /** The game has been scored and play went on: the calendar no longer ends it. */
  readonly scored: boolean;
  /** The War of Independence, once declared (R-900); null before. */
  readonly revolution: Revolution | null;
  /** Gone from the New World (absorbed in the War of Succession); takes no more turns. */
  readonly withdrawn: boolean;
  /** Granted independence by its own Crown (computer powers). */
  readonly independent: boolean;
  /** The rebel strength last remarked upon in talk of this power's independence. */
  readonly independenceTalk: number;
}

/** One power's memory of another. */
export interface Dealing {
  /** It holds a grudge: a treaty was broken, or others were set upon it. */
  readonly grudge: boolean;
  /** Its ships have been attacked by the other's privateers. */
  readonly piracy: boolean;
  /** It means to break its treaty with the other when it can. */
  readonly intent: boolean;
  /** Turns for which it has bound itself to keep the peace. */
  readonly truce: number;
  /** Turn of the last audience between the two, or -1. */
  readonly lastTalk: number;
  /** Until this turn the two are in a war their Crowns ordered (0 if none). */
  readonly kingsWarUntil: number;
}

/** A talk in progress between a human power and a computer power. */
export interface Audience {
  readonly human: PlayerId;
  readonly ai: PlayerId;
  /** The question now before the human. */
  readonly stage: 'piracy' | 'sieges' | 'tribute' | 'worthy' | 'cash' | 'menu' | 'withdraw';
  /** Gold the computer power thinks itself owed. */
  readonly demand: number;
  /** How much it fears the human power. */
  readonly fear: number;
  /** Whether it is taking a hard line now, and whether it began so. */
  readonly hostile: boolean;
  readonly cameHostile: boolean;
  readonly tributeRefused: boolean;
  /** Gold on the table in the present question (tribute asked, cash offered, the price of withdrawing). */
  readonly gold: number;
  /** The human's fighting strength beside the computer power's colonies. */
  readonly pressure: number;
}

/** A power's War of Independence: what was settled when it declared, and how the war stands. */
export interface Revolution {
  readonly declaredTurn: number;
  /** National rebel sentiment on the day, per cent; it is not reckoned again. */
  readonly sentiment: number;
  /** The foreign power that may come in on the rebels' side, and the one whose King hires out soldiers. */
  readonly friend: PlayerId | null;
  readonly patron: PlayerId | null;
  /** What the friend would send, fixed from its strength at the Declaration. */
  readonly force: { readonly infantry: number; readonly cavalry: number; readonly artillery: number; readonly ships: number };
  /** Liberty bells rung since the Declaration (since the intervention, once it has come). */
  readonly bells: number;
  /** The rebels have been told what intervention will take. */
  readonly considered: boolean;
  /** The Continental Army has been mustered. */
  readonly mustered: boolean;
  readonly intervened: boolean;
  /** The rebels have beaten the King's troops in a fight at least once (it loosens what victory asks). */
  readonly refBeaten: boolean;
  /** Colonies that have already had their Tory uprising. */
  readonly uprisings: readonly string[];
}

export interface RefForce {
  readonly regulars: number;
  readonly cavalry: number;
  readonly artillery: number;
  readonly ships: number;
}

export type RoyalOffer =
  | { readonly kind: 'frigate'; readonly tax: number }
  | { readonly kind: 'mercenaries'; readonly from: NationId; readonly dragoons: number; readonly artillery: number; readonly price: number }
  /** Wartime: a foreign King hires out trained troops to the rebels. */
  | { readonly kind: 'continentals'; readonly from: NationId; readonly army: number; readonly cavalry: number; readonly artillery: number; readonly price: number };

/** One power's view of the Europe market: prices on the table's scale (bid + 1), traffic, and net sales. */
export interface PowerMarket {
  readonly price: Readonly<Record<GoodId, number>>;
  readonly volume: Readonly<Record<GoodId, number>>;
  readonly netSold: Readonly<Record<GoodId, number>>;
}

export interface MarketState {
  /** Volume common to all powers, per good. */
  readonly shared: Readonly<Record<GoodId, number>>;
  readonly powers: Readonly<Record<PlayerId, PowerMarket>>;
}

export interface PendingTax {
  readonly increase: number;
  readonly good: GoodId;
  readonly colonyId: ColonyId;
}

export type GameOverReason = 'retired' | 'retiredEarly' | 'warLost' | 'noColonies' | 'independence' | 'crownVictory';

export interface GameOver {
  readonly reason: GameOverReason;
  readonly turn: number;
  /** Whose game it ended: the player the rule applied to. */
  readonly player: PlayerId;
}

export interface GameMap {
  readonly width: number;
  readonly height: number;
  /** Row-major, length width * height. */
  readonly tiles: readonly Tile[];
}

/** Standing orders, by their order letters: - S G F F P R T. */
export type UnitOrders = 'none' | 'sentry' | 'goto' | 'fortify' | 'fortified' | 'plow' | 'road' | 'trade';

/** Movement is counted in thirds of a move so that roads (one third) stay integral. */
export const MOVE_THIRDS = 3;

export interface Unit {
  readonly id: UnitId;
  readonly owner: PlayerId;
  readonly type: UnitTypeId;
  /** What the person is skilled at; null for ships, wagons, artillery, treasure and natives. */
  readonly profession: ProfessionId | null;
  readonly x: number;
  readonly y: number;
  /** Movement left this turn, in thirds of a move. */
  readonly movesLeft: number;
  readonly orders: UnitOrders;
  /** Where a Go To order is headed. */
  readonly destination: readonly [number, number] | null;
  /** The ship or wagon carrying this unit; a carried unit shares its carrier's position. */
  readonly aboard: UnitId | null;
  /** Goods in the holds of a ship or wagon. */
  readonly cargo: Goods;
  /** Tools a pioneer still carries. */
  readonly tools: number;
  /** Turns already put into the current pioneer job. */
  readonly workTurns: number;
  /** The trade route this carrier is running and the stop it is making for. */
  readonly route: { readonly routeId: string; readonly stop: number } | null;
  /** Set while the unit is off the map on the Atlantic or in Europe; its x and y are then -1. */
  /** Turns of repair a damaged ship still needs before it can sail (0 when sound). */
  readonly repair: number;
  /** Gold a treasure train carries (0 for everything else). */
  readonly treasure: number;
  readonly voyage: Voyage | null;
}

export interface Voyage {
  readonly phase: 'toEurope' | 'inEurope' | 'toNewWorld';
  /** Owner's turn starts still to pass before arrival (0 while in Europe). */
  readonly turnsLeft: number;
  /** Sea square the ship left from, where it comes back. */
  readonly origin: readonly [number, number];
}

/** Coordinate given to units that are not on the map. */
export const OFF_MAP = -1;

/** Where a colonist works: a square next to the colony (dx, dy from it) producing one good, a building, or nowhere yet. */
export type Job =
  | { readonly kind: 'field'; readonly dx: number; readonly dy: number; readonly good: RawGood }
  /** Indoor work in the building that houses the trade. */
  | { readonly kind: 'work'; readonly trade: TradeId }
  | { readonly kind: 'idle' };

/** Someone living and working inside a colony. Stepping outside turns them back into a unit with the same id. */
export interface Colonist {
  readonly id: UnitId;
  readonly profession: ProfessionId;
  readonly job: Job;
  /** Turns spent in the present job (capped); a teacher graduates a pupil when it reaches his term. */
  readonly turns: number;
}

/** One call on a trade route: where, what to put ashore and what to take aboard. */
export interface RouteStop {
  readonly colonyId: ColonyId;
  readonly unload: readonly GoodId[];
  readonly load: readonly GoodId[];
}

export interface TradeRoute {
  readonly id: string;
  readonly owner: PlayerId;
  readonly name: string;
  readonly kind: 'land' | 'sea';
  readonly stops: readonly RouteStop[];
}

/** Something a colony can build: a building, or a unit. */
export type BuildItem =
  | { readonly kind: 'building'; readonly id: BuildingId }
  | { readonly kind: 'unit'; readonly unit: BuildableUnit };

/** A European settlement. */
export interface Colony {
  readonly id: ColonyId;
  readonly owner: PlayerId;
  readonly name: string;
  readonly x: number;
  readonly y: number;
  /** The warehouse. */
  readonly goods: Goods;
  /** Building ids present (data table arrives with R-303). */
  readonly buildings: readonly string[];
  readonly colonists: readonly Colonist[];
  /** Hammers put by toward the current building project. */
  readonly hammers: number;
  /** Sons of Liberty membership as a fraction: percent = 100 * n / d. */
  readonly sol: { readonly n: number; readonly d: number };
  /** Production bonus earned from membership: 0, 1 (majority reached) or 2 (unanimous). */
  readonly solLevel: number;
  /** Whether the Tory inefficiency notice has been given and not yet lifted. */
  readonly toryNoticed: boolean;
  /** What the carpenters are working toward. */
  readonly construction: BuildItem | null;
  /** Turn the colony was founded. */
  readonly founded: number;
  /** Goods the Custom House sells on its own, in goods order. */
  readonly exports: readonly GoodId[];
  /** Computer powers only: turns since the colony last had land improved or a colonist schooled for it. */
  readonly waited?: number;
}

/** A native settlement. What it wants, sells and teaches is worked out from its surroundings when asked. */
export interface Settlement {
  readonly id: string;
  readonly tribe: TribeId;
  readonly x: number;
  readonly y: number;
  /** The tribe's chief settlement: it can grow larger and matters more. */
  readonly capital: boolean;
  readonly population: number;
  /** Counts up by the population each turn toward a new brave or another inhabitant. */
  readonly growth: number;
  /** Has taught a colonist its skill (only capitals teach again). */
  readonly taught: boolean;
  readonly tributePaid: boolean;
  /** Alarm at each European power, by player id. */
  readonly alarm: Readonly<Record<PlayerId, number>>;
  readonly mission: { readonly owner: PlayerId; readonly expert: boolean } | null;
  /** Powers whose scouts have spoken with the chief. */
  readonly scouted: readonly PlayerId[];
  readonly lastBought: GoodId | null;
  readonly lastSold: GoodId | null;
  /** A good it will not be offered again after a failed haggle, or 'noSale' when it will sell nothing; cleared by the next sale or gift. */
  readonly haggleMemory: GoodId | 'noSale' | null;
}

/** A brave at a colony asking for food (begging) or for goods in reparation. */
export interface NativeDemand {
  readonly kind: 'beg' | 'demand';
  readonly settlementId: string;
  readonly colonyId: ColonyId;
  readonly good: GoodId;
  readonly amount: number;
}

/** Trade talks under way between a carrier and a settlement. */
export type Parley =
  | { readonly stage: 'selling'; readonly player: PlayerId; readonly unitId: UnitId; readonly settlementId: string; readonly good: GoodId; readonly amount: number; readonly price: number; readonly goodwill: number; readonly haggled: boolean }
  | { readonly stage: 'buying'; readonly player: PlayerId; readonly unitId: UnitId; readonly settlementId: string; readonly amount: number; readonly offers: readonly { readonly good: GoodId; readonly price: number }[] };

/** What a tribe as a whole remembers. */
export interface TribeState {
  /** Tribal alarm at each European power, 0..100. */
  readonly alarm: Readonly<Record<PlayerId, number>>;
  /** Small kindnesses and slights that have not yet moved the alarm. */
  readonly goodwill: Readonly<Record<PlayerId, number>>;
  /** Powers the tribe has met. */
  readonly met: readonly PlayerId[];
  readonly muskets: number;
  /** Horse herds, and the breeding stock that makes new mounts. */
  readonly horses: number;
  readonly breeding: number;
  /** Silver in the tribe's hills (set when the world is made). */
  readonly silver: number;
  /** Powers the tribe has a treaty of peace with. */
  readonly peace: readonly PlayerId[];
  /** Tiles of its land sold to Europeans so far (each makes the next dearer). */
  readonly landSold: number;
  /** Powers that have destroyed one of its settlements; not forgotten. */
  readonly grudge: readonly PlayerId[];
  /** Has sided with the Crown against the rebels. */
  readonly joinedCrown: boolean;
  /** How its braves have called on each power's colonies this turn: 1 a demand was made, 2 a visit was paid. */
  readonly visited: Readonly<Record<PlayerId, number>>;
  /** Recent trade in each good: positive when the tribe has been sold a lot of it. */
  readonly stock: Goods;
}

export interface GameState {
  readonly schemaVersion: number;
  readonly seed: number | string;
  readonly difficulty: Difficulty;
  readonly rng: RngState;
  /** 0-based turn counter; the calendar (R-206) maps it to a year and season. */
  readonly turn: number;
  /** Index into `players` of whoever is moving now. */
  readonly current: number;
  readonly players: readonly Player[];
  readonly map: GameMap;
  readonly units: Readonly<Record<UnitId, Unit>>;
  readonly colonies: Readonly<Record<ColonyId, Colony>>;
  readonly tradeRoutes: Readonly<Record<string, TradeRoute>>;
  readonly settlements: Readonly<Record<string, Settlement>>;
  /** Tribes that still have a settlement, or had one. */
  readonly tribes: Readonly<Partial<Record<TribeId, TribeState>>>;
  readonly market: MarketState;
  readonly nextId: number;
  /** Set once the game has ended; no further actions are accepted. */
  readonly over: GameOver | null;
  /** The player slot the Crown's army fights under once independence is declared (R-900); null before. */
  readonly crownPlayer: PlayerId | null;
  /** Lost City Rumors looked into so far by anyone, and how many proved to be Cities of Gold. */
  readonly rumors: { readonly explored: number; readonly cibolas: number };
  /** An audience between a human and a computer power, part way through. */
  readonly audience: Audience | null;
  /** Trade talks with a native settlement awaiting the current power's answer. */
  readonly parley: Parley | null;
  /** The War of Succession, once it has happened. */
  readonly succession: { readonly loser: PlayerId; readonly heir: PlayerId } | null;
}

export function tileIndex(map: GameMap, x: number, y: number): number {
  return y * map.width + x;
}

export function inBounds(map: GameMap, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < map.width && y < map.height;
}

export function tileAt(map: GameMap, x: number, y: number): Tile | null {
  return inBounds(map, x, y) ? (map.tiles[tileIndex(map, x, y)] ?? null) : null;
}

export function currentPlayer(state: GameState): Player {
  const p = state.players[state.current];
  if (!p) throw new Error(`state.current ${state.current} is out of range`);
  return p;
}

export function colonyAt(state: GameState, x: number, y: number): Colony | null {
  for (const colony of Object.values(state.colonies)) if (colony.x === x && colony.y === y) return colony;
  return null;
}

export function unitsAt(state: GameState, x: number, y: number): Unit[] {
  return Object.values(state.units).filter((u) => u.x === x && u.y === y);
}

/** Units riding on the given carrier. */
export function cargoOf(state: GameState, carrierId: UnitId): Unit[] {
  return Object.values(state.units).filter((u) => u.aboard === carrierId);
}

export function hasFather(state: GameState, playerId: PlayerId, father: FatherId): boolean {
  return state.players.find((p) => p.id === playerId)?.fathers.includes(father) ?? false;
}

export function playerIndexOf(state: GameState, id: PlayerId): number {
  return state.players.findIndex((p) => p.id === id);
}
