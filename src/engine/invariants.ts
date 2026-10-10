// Structural invariants that must hold after every action. The sim harness (test/sim) asserts
// these each turn; phases that add colonies, goods and cargo extend this list.
import { holdsUsed } from './cargo';
import { COLONY_LIMITS } from './data/colony';
import { GOOD_IDS } from './data/goods';
import { MAX_SETTLEMENTS } from './data/tribes';
import { tribeOfOwner } from './settlements';
import { UNIT_TYPES } from './data/units';
import { colonyAt, inBounds, OFF_MAP, tileAt, type GameState, type Goods } from './state';
import { isWater, type Tile } from './tile';

export const MAX_COLONY_POPULATION = 32;

export function checkInvariants(state: GameState): string[] {
  const problems: string[] = [];
  const { map } = state;

  if (map.tiles.length !== map.width * map.height) problems.push(`map has ${map.tiles.length} tiles, expected ${map.width * map.height}`);
  if (!Number.isInteger(state.turn) || state.turn < 0) problems.push(`bad turn ${state.turn}`);
  if (!state.players[state.current]) problems.push(`current player index ${state.current} out of range`);

  const owners = new Set(state.players.map((p) => p.id));
  if (owners.size !== state.players.length) problems.push('duplicate player ids');
  if (Object.keys(state.colonies).length > COLONY_LIMITS.maxColonies) problems.push(`there are ${Object.keys(state.colonies).length} colonies`);
  for (const p of state.players) {
    if (!Number.isInteger(p.gold)) problems.push(`player ${p.id} gold ${p.gold} is not an integer`);
  }

  for (const [key, u] of Object.entries(state.units)) {
    if (u.id !== key) problems.push(`unit key ${key} holds unit ${u.id}`);
    if (!owners.has(u.owner) && tribeOfOwner(u.owner) === null) problems.push(`unit ${u.id} has unknown owner ${u.owner}`);
    if (u.voyage) {
      if (u.x !== OFF_MAP || u.y !== OFF_MAP) problems.push(`unit ${u.id} is on a voyage but still on the map`);
      if (!Number.isInteger(u.voyage.turnsLeft) || u.voyage.turnsLeft < 0) problems.push(`unit ${u.id} has a bad voyage timer`);
      if ((u.voyage.phase === 'inEurope') !== (u.voyage.turnsLeft === 0)) problems.push(`unit ${u.id} voyage phase and timer disagree`);
      const ship = u.aboard === null ? u : state.units[u.aboard];
      const onDocks = u.aboard === null && u.voyage.phase === 'inEurope';
      if (!onDocks && (!ship || UNIT_TYPES[ship.type].domain !== 'sea' || !ship.voyage)) problems.push(`unit ${u.id} is on a voyage without a ship`);
      continue;
    }
    if (!Number.isInteger(u.x) || !Number.isInteger(u.y) || !inBounds(map, u.x, u.y)) {
      problems.push(`unit ${u.id} is out of bounds at ${u.x},${u.y}`);
      continue;
    }
    if (!Number.isInteger(u.movesLeft) || u.movesLeft < 0) problems.push(`unit ${u.id} has negative moves`);
    const tile = tileAt(map, u.x, u.y) as Tile;
    const carrier = u.aboard === null ? null : (state.units[u.aboard] ?? null);
    if (u.aboard !== null) {
      if (!carrier) problems.push(`unit ${u.id} is aboard missing unit ${u.aboard}`);
      else if (carrier.x !== u.x || carrier.y !== u.y) problems.push(`unit ${u.id} is not where its carrier ${carrier.id} is`);
      else if (carrier.owner !== u.owner) problems.push(`unit ${u.id} rides a foreign carrier`);
    }
    const inColony = colonyAt(state, u.x, u.y) !== null;
    if (UNIT_TYPES[u.type].domain === 'sea') {
      if (!isWater(tile) && !inColony) problems.push(`ship ${u.id} is on impassable terrain at ${u.x},${u.y}`);
    } else if (isWater(tile) && !carrier) {
      problems.push(`unit ${u.id} is on impassable terrain at ${u.x},${u.y}`);
    }
    if (u.orders === 'goto' && !u.destination) problems.push(`unit ${u.id} has a Go To order without a destination`);
    if ((u.orders === 'trade') !== (u.route !== null)) problems.push(`unit ${u.id} trade orders and route disagree`);
    if (u.route && !state.tradeRoutes[u.route.routeId]) problems.push(`unit ${u.id} follows a route that does not exist`);
  }
  const badGoods = (goods: Goods): string | null => {
    for (const [good, amount] of Object.entries(goods)) {
      if (!(GOOD_IDS as readonly string[]).includes(good)) return `unknown good ${good}`;
      if (!Number.isInteger(amount) || amount <= 0) return `bad amount ${amount} of ${good}`;
    }
    return null;
  };
  for (const carrier of Object.values(state.units)) {
    const load = holdsUsed(state, carrier);
    if (load > UNIT_TYPES[carrier.type].holds) problems.push(`carrier ${carrier.id} is overloaded (${load})`);
    const bad = badGoods(carrier.cargo);
    if (bad) problems.push(`unit ${carrier.id} cargo: ${bad}`);
    if (!Number.isInteger(carrier.tools) || carrier.tools < 0) problems.push(`unit ${carrier.id} has bad tools ${carrier.tools}`);
    if (carrier.type !== 'pioneer' && carrier.tools !== 0) problems.push(`unit ${carrier.id} carries tools without being a pioneer`);
  }
  const settlements = Object.values(state.settlements);
  if (settlements.length > MAX_SETTLEMENTS) problems.push(`there are ${settlements.length} native settlements`);
  for (const [key, s] of Object.entries(state.settlements)) {
    if (s.id !== key) problems.push(`settlement key ${key} holds ${s.id}`);
    const tile = tileAt(map, s.x, s.y);
    if (!tile || isWater(tile)) problems.push(`settlement ${s.id} is not on land`);
    if (!Number.isInteger(s.population) || s.population < 1) problems.push(`settlement ${s.id} has population ${s.population}`);
    if (!state.tribes[s.tribe]) problems.push(`settlement ${s.id} belongs to a tribe with no record`);
    if (colonyAt(state, s.x, s.y)) problems.push(`settlement ${s.id} shares its square with a colony`);
    for (const other of settlements) {
      if (other.id < s.id && Math.max(Math.abs(other.x - s.x), Math.abs(other.y - s.y)) <= 1) problems.push(`settlements ${other.id} and ${s.id} are adjacent`);
    }
  }
  for (const colony of Object.values(state.colonies)) {
    const bad = badGoods(colony.goods);
    if (bad) problems.push(`colony ${colony.id} goods: ${bad}`);
    if (!owners.has(colony.owner)) problems.push(`colony ${colony.id} has unknown owner ${colony.owner}`);
    if (colony.exports.some((g, i) => !GOOD_IDS.includes(g) || colony.exports.indexOf(g) !== i)) problems.push(`colony ${colony.id} has a bad export list`);
    const pop = colony.colonists.length;
    if (pop < 1) problems.push(`colony ${colony.id} has no colonists`);
    if (pop > MAX_COLONY_POPULATION) problems.push(`colony ${colony.id} has ${pop} colonists`);
    const tile = tileAt(map, colony.x, colony.y);
    if (!tile || isWater(tile) || tile.relief === 'mountains') problems.push(`colony ${colony.id} stands on impossible ground`);
    const squares = new Set<string>();
    for (const c of colony.colonists) {
      if (state.units[c.id]) problems.push(`colonist ${c.id} of ${colony.id} is also a unit`);
      if (c.job.kind !== 'field') continue;
      const key = `${c.job.dx},${c.job.dy}`;
      if (squares.has(key)) problems.push(`colony ${colony.id} has two colonists on square ${key}`);
      squares.add(key);
      if (Math.max(Math.abs(c.job.dx), Math.abs(c.job.dy)) !== 1) problems.push(`colonist ${c.id} works outside the colony's reach`);
    }
    for (const other of Object.values(state.colonies)) {
      if (other.id < colony.id && Math.max(Math.abs(other.x - colony.x), Math.abs(other.y - colony.y)) <= 1) problems.push(`colonies ${other.id} and ${colony.id} are adjacent`);
    }
  }
  if (Object.keys(state.colonies).length > COLONY_LIMITS.maxColonies) problems.push(`there are ${Object.keys(state.colonies).length} colonies`);
  return problems;
}
