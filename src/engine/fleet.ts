// The treasury and fleet of a computer power (docs/RULES.md "Computer powers: the treasury and
// the fleet"): what it has afloat, what it wants, and the gold the Crown slips it each turn.
// The buying itself is done by the policy in src/ai, through the ordinary purchase action.
import { dateOfTurn } from './calendar';
import { coloniesOf } from './colony';
import { AI_FLEET } from './data/ai';
import { NAVAL } from './data/naval';
import { UNIT_TYPES, type UnitTypeId } from './data/units';
import { DIFFICULTIES } from './data/yields';
import { purchasePrice } from './europe';
import type { GameState, Player, PlayerId, Unit } from './state';

const isShip = (u: Unit): boolean => UNIT_TYPES[u.type].domain === 'sea';
const isWarship = (u: Unit): boolean => (NAVAL.warships as readonly UnitTypeId[]).includes(u.type);
const count = (state: GameState, owner: PlayerId, type: UnitTypeId): number => Object.values(state.units).filter((u) => u.owner === owner && u.type === type).length;
/** The powers that count: every player still in the New World, the Crown's own force apart. */
const powers = (state: GameState): Player[] => state.players.filter((p) => !p.withdrawn && p.id !== state.crownPlayer);

export interface FleetCensus {
  readonly colonies: number;
  /** People living in its colonies. */
  readonly colonists: number;
  readonly ships: number;
  readonly warships: number;
  /** Cargo holds of all its ships. */
  readonly holds: number;
  /** Its colonies with a foreign frigate near, and the people in them; and the same for any foreign warship. */
  readonly frigateBeset: { readonly colonies: number; readonly colonists: number };
  readonly warshipBeset: { readonly colonies: number; readonly colonists: number };
}

export function fleetCensus(state: GameState, playerId: PlayerId): FleetCensus {
  const mine = coloniesOf(state, playerId);
  const fleet = Object.values(state.units).filter((u) => u.owner === playerId && isShip(u));
  const prowling = Object.values(state.units).filter((u) => u.owner !== playerId && isShip(u) && UNIT_TYPES[u.type].attack > 0 && u.voyage === null && u.aboard === null);
  const near = (c: { x: number; y: number }, u: Unit): boolean => Math.max(Math.abs(u.x - c.x), Math.abs(u.y - c.y)) <= AI_FLEET.besetRange;
  const beset = (ships: readonly Unit[]): { colonies: number; colonists: number } => {
    const hit = mine.filter((c) => ships.some((u) => near(c, u)));
    return { colonies: hit.length, colonists: hit.reduce((n, c) => n + c.colonists.length, 0) };
  };
  return {
    colonies: mine.length,
    colonists: mine.reduce((n, c) => n + c.colonists.length, 0),
    ships: fleet.length,
    warships: fleet.filter(isWarship).length,
    holds: fleet.reduce((n, u) => n + UNIT_TYPES[u.type].holds, 0),
    frigateBeset: beset(prowling.filter((u) => u.type === 'frigate')),
    warshipBeset: beset(prowling),
  };
}

export interface FleetWants {
  /** It has no ship of any kind. */
  readonly noShips: boolean;
  /** It means to answer the human's frigate, or privateers, with one of its own. */
  readonly frigate: boolean;
  readonly privateer: boolean;
  /** It is behind at sea: it has fewer warships than the power with most, or nobody leads outright. */
  readonly lag: boolean;
  /** It has too little transport for its people to be buying guns. */
  readonly short: boolean;
  /** Its fleet is not already too big for it: only then does it buy at all. */
  readonly mayBuy: boolean;
}

/** What a power wants for its fleet this turn. Nothing once independence has been declared by anyone. */
export function fleetWants(state: GameState, playerId: PlayerId): FleetWants {
  const player = state.players.find((p) => p.id === playerId);
  const c = fleetCensus(state, playerId);
  const declared = state.crownPlayer !== null;
  const noShips = c.ships === 0;
  const half = (n: number): number => n >> 1;
  const short = !declared && half(half(c.colonists) + 2 * c.colonies) >= c.holds;
  if (!player || declared) return { noShips, frigate: false, privateer: false, lag: false, short, mayBuy: false };
  const others = powers(state).filter((p) => p.id !== playerId);
  const threat = Math.trunc(others.reduce((n, p) => n + count(state, p.id, 'privateer') + AI_FLEET.threatPerFrigate * count(state, p.id, 'frigate'), 0) / AI_FLEET.threatDivisor);
  const human = state.players.find((p) => p.kind === 'human' && p.id !== playerId && !p.withdrawn);
  const has = (type: UnitTypeId): boolean => human !== undefined && count(state, human.id, type) > 0;
  const beset = (hit: { colonies: number; colonists: number }, late: readonly [number, number]): boolean =>
    half(c.colonies) <= hit.colonies || half(c.colonists) <= hit.colonists || (state.turn > late[0] && player.gold >= late[1]);
  const alarmed = (c.frigateBeset.colonies > 0 || c.warshipBeset.colonies > 0) && threat !== 0;
  const frigate = alarmed && beset(c.frigateBeset, AI_FLEET.frigateLate) && count(state, playerId, 'frigate') === 0 && has('frigate');
  const privateer = alarmed && !frigate && beset(c.warshipBeset, AI_FLEET.privateerLate) && count(state, playerId, 'privateer') < AI_FLEET.privateersAnswering && has('privateer');
  const navies = powers(state).map((p) => Object.values(state.units).filter((u) => u.owner === p.id && isWarship(u)).length);
  const most = Math.max(0, ...navies);
  const lag = frigate || c.warships < most || navies.filter((n) => n === most).length > 1;
  return { noShips, frigate, privateer, lag, short, mayBuy: half(c.colonists) + c.colonies >= c.holds };
}

/** The gold a computer power is given this turn: more with the years, with its colonies and with the difficulty level. */
export function subsidy(state: GameState, playerId: PlayerId): number {
  if (state.turn < AI_FLEET.subsidyFromTurn) return 0;
  const year = dateOfTurn(state.turn).year;
  let base = Math.trunc((year - AI_FLEET.subsidyBaseYear) / AI_FLEET.subsidyYears) + coloniesOf(state, playerId).length;
  if (year >= AI_FLEET.subsidyDoubledFrom) base *= 2;
  const level = DIFFICULTIES.indexOf(state.difficulty);
  return AI_FLEET.subsidyTimes * ((level * base * (AI_FLEET.subsidyHalves[level] as number)) >> 1);
}

/**
 * A computer power's treasury at the start of its turn: the subsidy comes in, and if it has no
 * ship, or means to answer the human's privateers or frigate, its gold is made up to the price.
 */
export function computerTreasury(state: GameState, playerId: PlayerId): GameState {
  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.kind !== 'ai' || player.withdrawn) return state;
  let gold = player.gold + subsidy(state, playerId);
  const wants = fleetWants({ ...state, players: state.players.map((p) => (p.id === playerId ? { ...p, gold } : p)) }, playerId);
  const atLeast = (type: UnitTypeId): void => { gold = Math.max(gold, purchasePrice(state, playerId, type) ?? 0); };
  if (wants.noShips) atLeast('caravel');
  if (wants.privateer) atLeast('privateer');
  if (wants.frigate) atLeast('frigate');
  return gold === player.gold ? state : { ...state, players: state.players.map((p) => (p.id === playerId ? { ...p, gold } : p)) };
}
