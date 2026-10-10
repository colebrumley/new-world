// Where a computer power's colonists go (docs/RULES.md "Computer powers: founding and
// joining"): whether one goes off to found a new colony or joins one that wants colonists, and
// which.
import { coloniesOf } from '../engine/colony';
import { tribalAlarm } from '../engine/alarm';
import { AI_MUSTER, AI_SETTLE, AI_SITE } from '../engine/data/ai';
import { RESOURCES } from '../engine/data/resources';
import { TERRAIN } from '../engine/data/terrain';
import { alarmLevel, TRIBES } from '../engine/data/tribes';
import { isInlandLake } from '../engine/movement';
import { NATIONS } from '../engine/data/nations';
import { UNSKILLED } from '../engine/data/professions';
import { UNIT_TYPES } from '../engine/data/units';
import { fleetCensus } from '../engine/fleet';
import { landmassAt } from '../engine/regions';
import { tileAt, type Colony, type GameState, type Player, type Unit } from '../engine/state';
import { isWater, terrainOf, type Tile } from '../engine/tile';
import { NEIGHBORS } from '../engine/colony';
import { landmassSize, memo, peopleAt } from './campaign';
import { buildChoice } from './colony';

const far = (ax: number, ay: number, bx: number, by: number): number => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
const isPower = (state: GameState, id: string): boolean => state.players.some((p) => p.id === id);
const onLand = (state: GameState, u: Unit): number => (u.voyage !== null || u.aboard !== null ? 0 : landmassAt(state.map, u.x, u.y));

/**
 * Does the colony want colonists? Under twelve people while its people less four are fewer
 * than the squares it can work (water counts once it has docks), or under ten when it has
 * nothing left to build; never from thirty-two.
 */
export function wantsColonists(state: GameState, colony: Colony): boolean {
  // (settled once for the colony as it stands this turn: it is asked of every colony for every newcomer)
  const known = wanting.get(colony);
  if (known && known.turn === state.turn && known.seat === state.current) return known.value;
  const value = wantsNow(state, colony);
  wanting.set(colony, { turn: state.turn, seat: state.current, value });
  return value;
}

const wanting = new WeakMap<Colony, { turn: number; seat: number; value: boolean }>();

function wantsNow(state: GameState, colony: Colony): boolean {
  return memo(state, `wants:${colony.id}`, () => {
    const pop = colony.colonists.length;
    if (pop >= AI_MUSTER.most) return false;
    if (buildChoice(state, colony) === null && pop < AI_MUSTER.idleBelow) return true;
    const docks = colony.buildings.includes('docks');
    const squares = NEIGHBORS.filter(([dx, dy]) => {
      const tile = tileAt(state.map, colony.x + dx, colony.y + dy);
      return tile !== null && (docks || !isWater(tile));
    }).length;
    return AI_MUSTER.cap + 2 * AI_MUSTER.hall > pop && pop - 2 * AI_MUSTER.hall < squares;
  });
}

/** How many more colonies the power would found: 8 when none of its colonies wants colonists, otherwise by its spare people, its ships and its leader's bent. */
export function coloniesStillWanted(state: GameState, player: Player): number {
  return memo(state, `stillWanted:${player.id}`, () => {
    if (Object.keys(state.colonies).length >= AI_SETTLE.coloniesInAll) return 0;
    const mine = coloniesOf(state, player.id);
    if (mine.length === 0 || !mine.some((c) => wantsColonists(state, c))) return AI_SETTLE.wantedWhenFull;
    const bent = NATIONS[player.nation].leaderTraits.expansionist;
    const inColonies = mine.reduce((n, c) => n + c.colonists.length, 0);
    const afield = Object.values(state.units).filter((u) => u.owner === player.id && UNIT_TYPES[u.type].colonistRole).length;
    let q = Math.trunc((inColonies + afield - mine.length) / (AI_SETTLE.peoplePerColony - bent));
    const holds = fleetCensus(state, player.id).holds >> 1;
    q = holds + Math.trunc((q - holds) / 2);
    const least = AI_SETTLE.sizeLeast - AI_SETTLE.sizePerBent * bent;
    const average = Math.trunc(inColonies / mine.length);
    if (least > average) q -= (least - average + 1) * mine.length;
    return Math.max(0, q);
  });
}

/** How much a landmass draws settlers: room on it, nobody European there yet, none of ours there yet. 0 at sea. */
export function regionAppeal(state: GameState, player: Player, land: number): number {
  if (land <= 0) return 0;
  return memo(state, `appeal:${player.id}:${land}`, () => {
    const on = (at: { x: number; y: number }): boolean => landmassAt(state.map, at.x, at.y) === land;
    const colonies = Object.values(state.colonies).filter((c) => isPower(state, c.owner) && on(c));
    const used = Object.values(state.settlements).filter(on).length + colonies.length;
    const room = Math.trunc(landmassSize(state, land) / AI_SETTLE.squaresPerSite);
    return Math.sign(room - used) + (colonies.length === 0 ? AI_SETTLE.emptyBonus : 0) + (colonies.some((c) => c.owner === player.id) ? 0 : AI_SETTLE.newLandBonus);
  });
}

/** How ready this unit is to found a colony: never above 0. */
export function willingness(state: GameState, player: Player, unit: Unit): number {
  const mine = coloniesOf(state, player.id);
  const land = onLand(state, unit);
  let w = 0;
  if (mine.length > 0) {
    const near = mine.filter((c) => land === 0 || landmassAt(state.map, c.x, c.y) === land).map((c) => {
      const dx = Math.abs(c.x - unit.x);
      const dy = Math.abs(c.y - unit.y);
      return Math.max(dx, dy) + (Math.min(dx, dy) >> 1);
    });
    w = near.length === 0 ? AI_SETTLE.newLandWilling : Math.trunc(Math.min(...near) / AI_SETTLE.distancePerStep) - 1;
  }
  if (unit.type === 'pioneer') w += AI_SETTLE.pioneer;
  else if (unit.type === 'soldier') w += AI_SETTLE.soldier;
  else if (unit.type === 'dragoon') w += AI_SETTLE.dragoon;
  else if (unit.type === 'colonist') {
    w += AI_SETTLE.colonist;
    if (unit.profession !== null && !UNSKILLED.includes(unit.profession)) w += AI_SETTLE.skilled;
    if (unit.profession === 'indianConvert') w += AI_SETTLE.convert;
  }
  if (coloniesStillWanted(state, player) !== 0) w += (state.turn - Math.max(0, ...mine.map((c) => c.founded))) >> AI_SETTLE.turnsShift;
  return Math.min(0, w);
}

/**
 * May this unit go and found a colony? Colonists and pioneers, and soldiers that are no
 * veterans (dragoons only where no rival has a colony): when willingness, the land's appeal and the
 * colonies still wanted come to more than nothing. Never a colonist standing in a colony that
 * wants colonists, never a convert, never after the Declaration.
 */
export function mayFound(state: GameState, player: Player, unit: Unit): boolean {
  if (state.crownPlayer !== null || unit.profession === null || unit.profession === 'indianConvert') return false;
  const land = onLand(state, unit);
  const appeal = regionAppeal(state, player, land);
  if (unit.type === 'soldier' || unit.type === 'dragoon') {
    if (unit.profession === 'veteranSoldier') return false;
    if (unit.type === 'dragoon' && Object.values(state.colonies).some((c) => c.owner !== player.id && landmassAt(state.map, c.x, c.y) === land)) return false;
  } else if (unit.type !== 'colonist' && unit.type !== 'pioneer') return false;
  if (unit.type === 'colonist' && unit.aboard === null) {
    const here = Object.values(state.colonies).find((c) => c.x === unit.x && c.y === unit.y && c.owner === player.id);
    if (here && wantsColonists(state, here)) return false;
  }
  return willingness(state, player, unit) + appeal + coloniesStillWanted(state, player) > 0;
}

/**
 * The colony a colonist joins: one of the power's on his landmass that wants colonists (any
 * for a convert) and has fewer than ten people and units, the lowest by half the distance
 * times the room under its cap (twice the half-distance at or over the cap).
 */
export function joinTarget(state: GameState, player: Player, unit: Unit): Colony | null {
  const land = landmassAt(state.map, unit.x, unit.y);
  let best: Colony | null = null;
  let least = Infinity;
  for (const c of coloniesOf(state, player.id)) {
    if (landmassAt(state.map, c.x, c.y) !== land) continue;
    if (unit.profession !== 'indianConvert' && !wantsColonists(state, c)) continue;
    const pop = c.colonists.length;
    const standing = unit.x === c.x && unit.y === c.y ? 1 : 0;
    if (peopleAt(state, c) - standing >= AI_MUSTER.cap + AI_MUSTER.joinOver) continue;
    const half = far(c.x, c.y, unit.x, unit.y) >> 1;
    const score = pop < AI_MUSTER.cap ? half * (AI_MUSTER.cap - pop) : half * 2;
    if (score < least) {
      least = score;
      best = c;
    }
  }
  return best;
}

/**
 * The port a ship takes passengers who are to join a colony to: small colonies first, those
 * that want colonists, those on land the human shares, the nearer the better, with a little luck.
 */
export function deliveryPort(state: GameState, ship: Unit, ports: readonly Colony[], luck: (colony: Colony) => number): Colony | null {
  const human = state.players.find((p) => p.kind === 'human' && !p.withdrawn);
  let best: Colony | null = null;
  let top = -999;
  for (const c of ports) {
    if (c.x === ship.x && c.y === ship.y) continue;
    const pop = c.colonists.length;
    const land = landmassAt(state.map, c.x, c.y);
    const shared = human !== undefined && coloniesOf(state, human.id).some((h) => landmassAt(state.map, h.x, h.y) === land);
    const small = AI_SETTLE.portSizeFrom - Math.min(pop, AI_SETTLE.portSizeFrom - 1);
    const score = luck(c) + 4 * (small * small + 2) + 2 * (AI_MUSTER.cap - pop) + (shared ? AI_SETTLE.portSharedBonus : 0)
      + (wantsColonists(state, c) ? AI_SETTLE.portWantsBonus : -AI_SETTLE.portWantsBonus) - ((far(c.x, c.y, ship.x, ship.y) >> 1) + 1);
    if (score > top) {
      top = score;
      best = c;
    }
  }
  return best;
}

// --- sites ------------------------------------------------------------------------------------------

/** The colony cross: the 5 x 5 block without its corners, each square with its weight (the centre last). */
const CROSS: readonly (readonly [number, number, number])[] = (() => {
  const out: [number, number, number][] = [];
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const ax = Math.abs(dx);
      const ay = Math.abs(dy);
      if (ax === 2 && ay === 2) continue;
      const w = ax + ay === 0 ? AI_SITE.weights.centre : ax + ay === 1 ? AI_SITE.weights.beside : ax === 1 && ay === 1 ? AI_SITE.weights.corner : ax + ay === 2 ? AI_SITE.weights.two : AI_SITE.weights.knight;
      out.push([dx, dy, w]);
    }
  }
  return out;
})();

/**
 * How good a square is for a colony, 0 to 15, from the land alone: the worth of each square of
 * the cross around it (its resource, or its terrain; ocean by the land beside it; one more with
 * a river), weighted by nearness; halved away from the open sea and on hills; nothing on mountains.
 */
export function siteRating(state: GameState, x: number, y: number): number {
  const { map } = state;
  const at = (tx: number, ty: number): Tile | undefined => (tx >= 0 && ty >= 0 && tx < map.width && ty < map.height ? map.tiles[ty * map.width + tx] : undefined);
  const centre = at(x, y);
  if (!centre || isWater(centre) || centre.relief === 'mountains') return 0;
  let total = 0;
  for (const [dx, dy, w] of CROSS) {
    const tile = at(x + dx, y + dy);
    if (!tile) continue;
    let v: number;
    if (tile.resource) v = RESOURCES[tile.resource].aiValue;
    else if (tile.base === 'ocean') {
      let land = 0;
      for (const [ex, ey] of NEIGHBORS) {
        const near = at(x + dx + ex, y + dy + ey);
        if (near && !isWater(near)) land++;
      }
      v = (2 + 2 * land) >> 2;
    } else v = TERRAIN[terrainOf(tile)].aiValue;
    if (tile.river !== 'none') v += 1;
    if (tile.base === 'ocean' && Math.abs(dx) + Math.abs(dy) === 1) v = (v + 1) >> 1;
    total += (w * v) >> 1;
  }
  const port = NEIGHBORS.some(([dx, dy]) => {
    const near = at(x + dx, y + dy);
    return near !== undefined && isWater(near) && !isInlandLake(map, x + dx, y + dy);
  });
  if (!port) total >>= 1;
  if (centre.relief === 'hills') total >>= 1;
  return Math.min(AI_SITE.ratingMost, Math.max(0, Math.trunc(total / AI_SITE.ratingDivisor)));
}

/**
 * What a site is worth to a power's settler, 0 if it will not do: four times its rating, less
 * for colonies near it (never beside one, nor two squares from one of its own) and for native
 * settlements near it; more on land the power has not settled, and for a plain colonist.
 */
export function siteWorth(state: GameState, player: Player, x: number, y: number, colonist: boolean): number {
  const tile = tileAt(state.map, x, y);
  if (!tile || isWater(tile) || tile.relief === 'mountains') return 0;
  // only beside the open sea
  if (!NEIGHBORS.some(([dx, dy]) => { const near = tileAt(state.map, x + dx, y + dy); return near !== null && isWater(near) && !isInlandLake(state.map, x + dx, y + dy); })) return 0;
  const rating = siteRating(state, x, y);
  if (rating <= 0) return 0;
  const land = landmassAt(state.map, x, y);
  const settledHere = coloniesOf(state, player.id).some((c) => landmassAt(state.map, c.x, c.y) === land);
  let score = 4 * rating;
  let nearest: Colony | null = null;
  for (const c of Object.values(state.colonies)) if (!nearest || far(c.x, c.y, x, y) < far(nearest.x, nearest.y, x, y)) nearest = c;
  if (nearest) {
    const d = far(nearest.x, nearest.y, x, y);
    if (d <= 1) return 0;
    if (nearest.owner === player.id) {
      if (d === 2) return 0;
      if (d < AI_SITE.ownClear) score -= (AI_SITE.ownClear - d) ** 2;
    } else {
      const clear = settledHere ? AI_SITE.rivalClear : AI_SITE.rivalClearNewLand;
      if (d === 2) score -= AI_SITE.rivalBeside;
      if (d < clear) score -= (clear - d) ** 2;
    }
  }
  let village: (typeof state.settlements)[string] | null = null;
  for (const s of Object.values(state.settlements)) if (!village || far(s.x, s.y, x, y) < far(village.x, village.y, x, y)) village = s;
  if (village) {
    const sameLand = landmassAt(state.map, village.x, village.y) === land;
    const d = far(village.x, village.y, x, y) + (coloniesOf(state, player.id).some((c) => landmassAt(state.map, c.x, c.y) === landmassAt(state.map, (village as { x: number }).x, (village as { y: number }).y)) ? 0 : 1);
    if (d <= 0) return 0;
    if (d < AI_SITE.villageWithin) {
      let w = 2 * (TRIBES[village.tribe].tech + alarmLevel(tribalAlarm(state, village.tribe, player.id)) + 3);
      if (!sameLand) w >>= 1;
      let penalty = w >> 1;
      AI_SITE.villageSteps.forEach((within, i) => { if (d <= within) penalty += w << i; });
      if (village.capital) penalty *= 2;
      penalty = Math.trunc(penalty / (AI_SITE.villageEase[player.nation as keyof typeof AI_SITE.villageEase] ?? 1));
      if (player.fathers.includes('pocahontas')) penalty >>= 1;
      score -= Math.max(0, penalty);
    }
  }
  if (rating >= AI_SITE.goodFrom) {
    if (!settledHere) score += score >> 1;
    if (colonist) score *= 2;
  }
  return Math.max(0, score);
}
