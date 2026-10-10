// What a computer power's ships carry away from its colonies, and where an empty ship goes
// (docs/RULES.md "Computer powers: freight").
import { holdsFree, holdsUsed } from '../engine/cargo';
import { coloniesOf } from '../engine/colony';
import { landWork } from '../engine/computer';
import { AI_FREIGHT, AI_SUPPLY } from '../engine/data/ai';
import { GOOD_IDS, type GoodId } from '../engine/data/goods';
import { UNIT_TYPES } from '../engine/data/units';
import { colonyProduction } from '../engine/economy';
import { docksOf } from '../engine/europe';
import { fleetCensus } from '../engine/fleet';
import { priceLevel } from '../engine/market';
import { warehouseCapacity } from '../engine/pioneer';
import { landmassAt } from '../engine/regions';
import { colonyAt, type Colony, type GameState, type Player, type Unit } from '../engine/state';
import { garrisons, isTroop, memo, regionState } from './campaign';
import { privateersCarry } from './navy';

const far = (ax: number, ay: number, bx: number, by: number): number => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
const stock = (colony: Colony, good: GoodId): number => colony.goods[good] ?? 0;
const isShip = (u: Unit): boolean => UNIT_TYPES[u.type].domain === 'sea';

/**
 * May this ship take goods aboard? Never a man-of-war; a frigate only while the fleet's other
 * holds are few; a privateer only while its power's ports are beset (see "warships and privateers").
 */
export function mayLoad(state: GameState, player: Player, ship: Unit): boolean {
  if (ship.type === 'manOWar') return false;
  if (ship.type === 'privateer') return privateersCarry(state, player);
  if (ship.type !== 'frigate') return true;
  const mine = Object.values(state.units).filter((u) => u.owner === player.id);
  const frigates = mine.filter((u) => u.type === 'frigate').length;
  const privateers = mine.filter((u) => u.type === 'privateer').length;
  return fleetCensus(state, player.id).holds - AI_FREIGHT.frigateHolds * frigates - privateers < AI_FREIGHT.transportsEnough;
}

/** What a good in a colony's stores counts for, to a ship thinking of loading it: 0 if she would not. */
export function freightWorth(state: GameState, colony: Colony, good: GoodId): number {
  if ((AI_FREIGHT.neverLoaded as readonly GoodId[]).includes(good)) return 0;
  const capacity = warehouseCapacity(colony);
  let s = stock(colony, good);
  if (good === 'tools' || good === 'muskets') {
    // only from a colony that makes them, and only what it has beyond a hundred
    if (colonyProduction(state, colony).produced[good] <= 0) return 0;
    s -= AI_FREIGHT.madeKept;
  }
  if (stock(colony, good) >= capacity) s *= AI_FREIGHT.fullTimes;
  else if (good === 'horses') s = s + AI_FREIGHT.horsesMargin - capacity - 2;
  return s > 0 ? priceLevel(state, colony.owner, good) * s : 0;
}

/** The good a ship in one of her power's ports loads next, a hundred at most, or null when nothing there is worth a hold. */
export function loadChoice(state: GameState, colony: Colony): { good: GoodId; amount: number } | null {
  let best: GoodId | null = null;
  let top = 0;
  for (const good of GOOD_IDS) {
    const worth = freightWorth(state, colony, good);
    if (worth > top) {
      top = worth;
      best = good;
    }
  }
  return best ? { good: best, amount: Math.min(stock(colony, best), AI_SUPPLY.lot) } : null;
}

/** Units standing in a colony that a transport would take off: pioneers, and troops beyond the garrison where the land is settled and quiet. */
export function awaitingPassage(state: GameState, player: Player, colony: Colony): Unit[] {
  const quiet = regionState(state, player, landmassAt(state.map, colony.x, colony.y)) === 0;
  const kept = garrisons(state, player);
  return Object.values(state.units).filter((u) => u.owner === player.id && u.voyage === null && u.aboard === null && u.x === colony.x && u.y === colony.y
    && (u.type === 'pioneer' || (quiet && isTroop(u) && !kept.has(u.id))));
}

export interface Pickup {
  readonly colony: Colony;
  readonly value: number;
  readonly troops: boolean;
}

/** The power's ports with something to fetch: units to take off, or a good at 75 or more. */
export function pickups(state: GameState, player: Player): Pickup[] {
  return memo(state, `pickups:${player.id}`, () => {
    const out: Pickup[] = [];
    for (const colony of coloniesOf(state, player.id)) {
      const waiting = awaitingPassage(state, player, colony);
      const pioneers = landWork(state, colony) === null ? waiting.filter((u) => u.type === 'pioneer').length : 0;
      const troops = waiting.filter(isTroop).length;
      let value = AI_FREIGHT.pioneerValue * pioneers + AI_FREIGHT.troopValue * troops;
      let ready = pioneers + troops > 0;
      for (const good of GOOD_IDS) {
        if (freightWorth(state, colony, good) <= 0) continue;
        value += priceLevel(state, player.id, good) * Math.min(stock(colony, good), AI_SUPPLY.lot);
        if (stock(colony, good) >= AI_FREIGHT.readyFrom) ready = true;
      }
      if (ready) out.push({ colony, value, troops: troops > 0 });
    }
    return out;
  });
}

/** The port an empty ship goes to fetch from: the most value for the distance; never the one she lies in. */
export function pickupFor(state: GameState, player: Player, ship: Unit, reachable: (colony: Colony) => boolean): Colony | null {
  const goods = mayLoad(state, player, ship);
  let best: Colony | null = null;
  let top = 0;
  for (const p of pickups(state, player)) {
    if ((p.colony.x === ship.x && p.colony.y === ship.y) || (!goods && !p.troops) || !reachable(p.colony)) continue;
    const score = Math.trunc(p.value / ((far(p.colony.x, p.colony.y, ship.x, ship.y) >> 2) + 1));
    if (score > top) {
      top = score;
      best = p.colony;
    }
  }
  return best;
}

/** The one ship a power with several keeps on the run to Europe: its first merchantman if it has two of those or galleons, else its first caravel of two. */
export function europeShip(state: GameState, player: Player): string | null {
  const mine = Object.values(state.units).filter((u) => u.owner === player.id && isShip(u)).sort((a, b) => (a.id < b.id ? -1 : 1));
  const of = (type: Unit['type']): Unit[] => mine.filter((u) => u.type === type);
  if (of('merchantman').length + of('galleon').length >= 2 && of('merchantman')[0]) return (of('merchantman')[0] as Unit).id;
  return of('caravel').length >= 2 ? (of('caravel')[0] as Unit).id : null;
}

/**
 * Should a ship with nobody to deliver make for Europe? With a cargo that is not supplies, when
 * she is full or has more than one hold of it; empty, while more people wait on the docks than
 * ships are there or on the way; and with nothing to fetch, if she is the Europe ship, or on
 * her one turn in thirty-two.
 */
export function europeBound(state: GameState, player: Player, ship: Unit, nothingToFetch: boolean): boolean {
  const supplies = AI_SUPPLY.goods.some((g) => (ship.cargo[g] ?? 0) > 0);
  if (supplies) return true; // (with no port to take them, back they go to be sold)
  // people waiting on the docks come before anything else she might fetch
  const bound = Object.values(state.units).filter((u) => u.owner === player.id && isShip(u) && u.voyage !== null && u.voyage.phase !== 'toNewWorld').length;
  if (docksOf(state, player.id).length > bound) return true;
  const used = holdsUsed(state, ship);
  if (used > 0) return holdsFree(state, ship) <= 0 || used > 1;
  if (!nothingToFetch) return false;
  const turnOf = [...ship.id].reduce((n, ch) => n + ch.charCodeAt(0), 0);
  return europeShip(state, player) === ship.id || (turnOf + state.turn) % AI_FREIGHT.homeEvery === 0;
}

/** Is the ship lying in one of her power's own colonies? */
export const inOwnPort = (state: GameState, ship: Unit): Colony | null => {
  const here = colonyAt(state, ship.x, ship.y);
  return here && here.owner === ship.owner ? here : null;
};
