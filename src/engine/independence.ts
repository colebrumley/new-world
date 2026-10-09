// The Declaration of Independence (R-900) and what follows at once: other powers leave, the
// Crown seizes what lies in Europe, the Continental Army musters, the Expeditionary Force lands
// wave by wave, and Tories rise where the rebels are weak. Rules in docs/RULES.md
// "Declaration of Independence".
import { equipmentOf } from './cargo';
import { coloniesOf } from './colony';
import { isPortColony } from './construction';
import { INDEPENDENCE as I } from './data/independence';
import { UNIT_TYPES, type UnitTypeId } from './data/units';
import { DIFFICULTIES } from './data/yields';
import { rebelSentiment, solPercent } from './liberty';
import { isInlandLake } from './movement';
import { createRng, type Rng } from './rng';
import { powerSize, succession, type RoyalEvent } from './royal';
import { settlementAt } from './settlements';
import { sinkShip, type ShipEvent } from './ships';
import { colonyAt, tileAt, unitsAt, type Colony, type GameState, type Goods, type Player, type PlayerId, type RefForce, type Revolution, type Unit } from './state';
import { isLand, isWater } from './tile';

export type IndependenceEvent =
  | { readonly type: 'independenceDeclared'; readonly player: PlayerId; readonly crown: PlayerId; readonly friend: PlayerId | null; readonly sentiment: number }
  /** A power left the New World when another declared. */
  | { readonly type: 'powerWithdrew'; readonly player: PlayerId; readonly units: number; readonly lost: Goods }
  /** The Crown took what the rebels had in Europe or on the ocean. `lost` is everything that went with them. */
  | { readonly type: 'unitsSeized'; readonly player: PlayerId; readonly ships: readonly UnitTypeId[]; readonly others: number; readonly lost: Goods }
  | { readonly type: 'continentalsMustered'; readonly player: PlayerId; readonly colonyId: string; readonly unitIds: readonly string[] }
  /** The rebels learn what it will take to bring a foreign power in. */
  | { readonly type: 'interventionConsidered'; readonly player: PlayerId; readonly friend: PlayerId; readonly bells: number }
  /** Enough bells have rung: the friend declares war on the Crown. */
  | { readonly type: 'interventionBegan'; readonly player: PlayerId; readonly friend: PlayerId }
  | { readonly type: 'refLanded'; readonly player: PlayerId; readonly colonyId: string; readonly shipId: string; readonly unitIds: readonly string[]; readonly last: boolean }
  /** A rebel unit caught where the King's men came ashore. */
  | { readonly type: 'unitOverrun'; readonly unitId: string; readonly owner: PlayerId; readonly lost: Goods }
  | { readonly type: 'toryUprising'; readonly player: PlayerId; readonly colonyId: string; readonly unitIds: readonly string[] };

export type IndependenceErrorCode = 'tooTory' | 'alreadyDeclared' | 'europeClosed' | 'noColoniesInWar';
export type IndependenceCheck = { readonly ok: true } | { readonly ok: false; readonly code: IndependenceErrorCode; readonly message: string };

/** Anything these events can be pushed onto. */
export interface IndependenceSink {
  push(...events: (IndependenceEvent | RoyalEvent | ShipEvent)[]): unknown;
}

const DIRS = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]] as const;
const playerOf = (state: GameState, id: string): Player | undefined => state.players.find((p) => p.id === id);
const patch = (state: GameState, id: PlayerId, change: Partial<Player>): GameState => ({ ...state, players: state.players.map((p) => (p.id === id ? { ...p, ...change } : p)) });
const level = (state: GameState): number => DIFFICULTIES.indexOf(state.difficulty);
const isShip = (u: Unit): boolean => UNIT_TYPES[u.type].domain === 'sea';
const isVeteran = (u: Unit): boolean => u.profession === 'veteranSoldier' || u.profession === 'veteranDragoon';
const isArmed = (u: Unit): boolean => UNIT_TYPES[u.type].domain === 'land' && UNIT_TYPES[u.type].attack > 1;
const near = (a: { x: number; y: number }, b: { x: number; y: number }): boolean => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= 1;
const sumGoods = (a: Goods, b: Goods): Goods => {
  const total: Record<string, number> = { ...a };
  for (const [good, amount] of Object.entries(b)) if ((amount ?? 0) > 0) total[good] = (total[good] ?? 0) + (amount ?? 0);
  return total as Goods;
};
/** Open land a unit could be put down on: no colony, no native settlement. */
const openLand = (state: GameState, x: number, y: number): boolean => {
  const tile = tileAt(state.map, x, y);
  return tile !== null && isLand(tile) && !colonyAt(state, x, y) && !settlementAt(state, x, y);
};

/** May this power declare? Half its colonists must be for it; nothing else is asked. */
export function checkDeclare(state: GameState, playerId: PlayerId): IndependenceCheck {
  const player = playerOf(state, playerId);
  if (!player || player.atWar) return { ok: false, code: 'alreadyDeclared', message: 'independence has already been declared' };
  const sentiment = rebelSentiment(state, playerId);
  if (sentiment < I.sentimentNeeded) return { ok: false, code: 'tooTory', message: `only ${sentiment}% of our colonists favour independence; ${I.sentimentNeeded}% are needed` };
  return { ok: true };
}

/** A power's land strength as the Crown's clerks reckon it: defence, half as much again for veterans. */
function landStrength(state: GameState, owner: PlayerId, fieldOnly: boolean): number {
  let total = 0;
  for (const u of Object.values(state.units)) {
    if (u.owner !== owner || UNIT_TYPES[u.type].domain !== 'land' || u.voyage !== null) continue;
    if (fieldOnly && colonyAt(state, u.x, u.y)) continue;
    total += Math.floor(UNIT_TYPES[u.type].defense * I.force.strengthScale * (isVeteran(u) ? 1.5 : 1));
  }
  return Math.min(I.force.strengthMost, total);
}

/** What a friendly power would send, from its strength today. */
export function interventionForce(state: GameState, friend: PlayerId | null): Revolution['force'] {
  const f = I.force;
  const d = level(state);
  const spare = (f.spare - d) >> 1;
  const colonists = friend === null ? 0 : coloniesOf(state, friend).reduce((n, c) => n + c.colonists.length, 0);
  const warships = friend === null ? 0 : Object.values(state.units).filter((u) => u.owner === friend && (u.type === 'privateer' || u.type === 'frigate')).length;
  const field = friend === null ? 0 : landStrength(state, friend, true);
  const whole = friend === null ? 0 : landStrength(state, friend, false);
  const half = (raw: number): number => (raw + 1) >> 1;
  const ships = half(spare + f.ships + warships);
  const artillery = Math.min(half(spare + f.artillery + ((whole + 1) >> f.artilleryShift)), f.supportPerShip * ships);
  const cavalry = Math.min(half(spare + f.cavalry + ((field + 1) >> f.cavalryShift)), f.supportPerShip * ships);
  const infantry = Math.max(0, Math.min(half(f.infantry - d + Math.floor(colonists / f.colonistsPerInfantry)), f.unitsPerShip * ships - artillery - cavalry));
  return { infantry, cavalry, artillery, ships };
}

/** Bells the rebels must ring before a foreign power comes in. */
export function interventionBells(state: GameState): number {
  return I.interventionBells[0] + I.interventionBells[1] * level(state);
}

/**
 * Declare independence. The War of Succession is settled first if it has not been; the power it
 * removed lends its place to the Crown's army (with nobody to remove, a place is made). Every
 * other power leaves the New World, whatever the rebels have in Europe or on the ocean is
 * seized, and the rebels' units are done for the turn. The caller ends the turn.
 */
export function declareIndependence(state: GameState, playerId: PlayerId, events: IndependenceSink): GameState {
  const sentiment = rebelSentiment(state, playerId);
  let next = state.succession ? state : succession(state, playerId, events as RoyalEvent[], true);
  let crown = next.succession?.loser ?? null;
  if (crown === null || crown === playerId) {
    // nobody to stand in for the King: his army gets a place of its own at the end of the table
    const rebel = playerOf(next, playerId) as Player;
    crown = 'crown';
    const slot: Player = {
      ...rebel, id: crown, name: 'The Crown', kind: 'ai', gold: 0, fathers: [], bells: 0, fatherBells: 0, candidate: null, fatherOffer: [], crosses: 0, taxRate: 0, pendingTax: null,
      boycotts: [], pool: [], immigrantDue: false, stance: {}, dealings: {}, audiencesDue: [], pendingBurial: null, fountain: 0, demands: [], pendingTreaties: [], pendingOffer: null,
      revolution: null, withdrawn: true, independent: false, atWar: false,
    };
    next = { ...next, players: [...next.players, slot] };
  }
  const crownId = crown;

  // the two powers left: the smaller may come to the rebels' aid, the larger hires out soldiers
  const others = next.players.filter((p) => p.id !== playerId && p.id !== crownId && !p.withdrawn).map((p) => ({ p, size: powerSize(next, p.id) })).sort((a, b) => a.size - b.size);
  const friend = others[0]?.p.id ?? null;
  const patron = others[others.length - 1]?.p.id ?? null;
  const force = interventionForce(next, friend);

  // they all go home
  const units: Record<string, Unit> = {};
  const gone = new Map<string, number>();
  const taken = new Map<string, Goods>();
  const seizedShips: UnitTypeId[] = [];
  let seizedOthers = 0;
  let seizedGoods: Goods = {};
  for (const u of Object.values(next.units)) {
    if (others.some((o) => o.p.id === u.owner)) {
      gone.set(u.owner, (gone.get(u.owner) ?? 0) + 1);
      taken.set(u.owner, sumGoods(taken.get(u.owner) ?? {}, sumGoods(equipmentOf(u), u.cargo)));
    }
    else if (u.owner === playerId && u.voyage !== null) {
      // in port in Europe, on the docks, or on the ocean: the Crown has it
      if (isShip(u)) seizedShips.push(u.type);
      else seizedOthers++;
      seizedGoods = sumGoods(seizedGoods, sumGoods(equipmentOf(u), u.cargo));
    } else units[u.id] = u.owner === playerId ? { ...u, movesLeft: 0 } : u;
  }
  for (const o of others) events.push({ type: 'powerWithdrew', player: o.p.id, units: gone.get(o.p.id) ?? 0, lost: taken.get(o.p.id) ?? {} });
  if (seizedShips.length + seizedOthers > 0) events.push({ type: 'unitsSeized', player: playerId, ships: seizedShips, others: seizedOthers, lost: seizedGoods });

  // the King's army sees what the rebels have seen
  const rebelBit = 1 << next.players.findIndex((p) => p.id === playerId);
  const crownBit = 1 << next.players.findIndex((p) => p.id === crownId);
  const tiles = next.map.tiles.map((t) => {
    const explored = t.explored & rebelBit ? t.explored | crownBit : t.explored & ~crownBit;
    return explored === t.explored ? t : { ...t, explored };
  });

  const revolution: Revolution = { declaredTurn: state.turn, sentiment, friend, patron, force, bells: 0, considered: false, mustered: false, intervened: false, refBeaten: false, uprisings: [] };
  const players = next.players.map((p): Player => {
    if (p.id === playerId) return { ...p, atWar: true, revolution, stance: { ...Object.fromEntries(others.map((o) => [o.p.id, 'peace' as const])), [crownId]: 'war' }, audiencesDue: [], pendingOffer: null, pendingTax: null, immigrantDue: false };
    if (p.id === crownId) return { ...p, kind: 'ai', withdrawn: true, stance: { ...Object.fromEntries(others.map((o) => [o.p.id, 'peace' as const])), [playerId]: 'war' } };
    if (others.some((o) => o.p.id === p.id)) return { ...p, withdrawn: true, stance: { ...p.stance, [playerId]: 'peace', [crownId]: 'peace' }, audiencesDue: [] };
    return p;
  });
  events.push({ type: 'independenceDeclared', player: playerId, crown: crownId, friend, sentiment });
  return { ...next, players, units, map: { ...next.map, tiles }, crownPlayer: crownId, audience: null };
}

/**
 * The Continental Army, once, as the rebels' first turn after the Declaration begins: in every
 * colony where the Sons of Liberty are at least half, veteran soldiers and dragoons standing in
 * it take Continental colours, more of them the stronger the membership.
 */
export function musterContinentals(state: GameState, playerId: PlayerId, events: IndependenceSink): GameState {
  const player = playerOf(state, playerId);
  if (!player?.revolution || player.revolution.mustered) return state;
  const units = { ...state.units };
  for (const colony of coloniesOf(state, playerId)) {
    const sol = solPercent(state, colony);
    if (sol < I.musterFrom) continue;
    const people = colony.colonists.length;
    const most = Math.max(1, Math.min(Math.floor((people * (sol - I.musterFrom)) / I.musterSpan), Math.floor(people / I.musterShare)));
    const chosen = unitsAt(state, colony.x, colony.y).filter((u) => u.owner === playerId && isVeteran(u) && (u.type === 'soldier' || u.type === 'dragoon')).slice(0, most);
    if (chosen.length === 0) continue;
    for (const u of chosen) units[u.id] = { ...u, type: u.type === 'soldier' ? 'continentalArmy' : 'continentalCavalry' };
    events.push({ type: 'continentalsMustered', player: playerId, colonyId: colony.id, unitIds: chosen.map((u) => u.id) });
  }
  return patch({ ...state, units }, playerId, { revolution: { ...player.revolution, mustered: true } });
}

/** Bells rung after the Declaration count toward bringing a foreign power in; the first time, the rebels are told how many it will take. */
export function warBells(state: GameState, playerId: PlayerId, bells: number, events: { push(...events: IndependenceEvent[]): unknown }): GameState {
  const player = playerOf(state, playerId);
  const war = player?.revolution;
  if (!war || bells <= 0) return state;
  if (!war.considered && war.friend !== null && !war.intervened) events.push({ type: 'interventionConsidered', player: playerId, friend: war.friend, bells: interventionBells(state) });
  const rung = war.bells + bells;
  if (!war.intervened && war.friend !== null && rung >= interventionBells(state)) {
    // the count starts again; from here on it is only a tally of bells rung after help came
    events.push({ type: 'interventionBegan', player: playerId, friend: war.friend });
    return patch(state, playerId, { revolution: { ...war, bells: 0, considered: true, intervened: true } });
  }
  return patch(state, playerId, { revolution: { ...war, bells: rung, considered: true } });
}

// --- the Expeditionary Force -------------------------------------------------------------------

const stockLeft = (ref: RefForce): number => ref.regulars + (ref.cavalry > 0 ? 1 : 0) + (ref.artillery > 0 ? 1 : 0);

/** What it would take to carry this colony: its muskets, its garrison and its works, less the King's men already at its gates. */
export function landingNeed(state: GameState, colony: Colony, crown: PlayerId): number {
  let need = 1 + Math.floor(((colony.goods.muskets ?? 0) + I.musketRound) / I.musketsPerPoint);
  for (const u of unitsAt(state, colony.x, colony.y)) {
    if (UNIT_TYPES[u.type].domain !== 'land') continue;
    need += Math.floor(UNIT_TYPES[u.type].defense * I.force.strengthScale * (isVeteran(u) ? 1.5 : 1)) >> I.needShift;
  }
  const works = colony.buildings.includes('fortress') ? I.fortressFactor : colony.buildings.includes('fort') ? I.fortFactor : 1;
  need = Math.max(1, Math.floor(need * works));
  return need - Object.values(state.units).filter((u) => u.owner === crown && isArmed(u) && near(u, colony) && !(u.x === colony.x && u.y === colony.y)).length;
}

/** Where a Man-of-War would lie to put men ashore beside this colony, and the squares they would land on. */
function anchorage(state: GameState, colony: Colony): { x: number; y: number; beach: (readonly [number, number])[] } | null {
  let best: { x: number; y: number; beach: (readonly [number, number])[]; land: number } | null = null;
  for (const [dx, dy] of DIRS) {
    const x = colony.x + dx;
    const y = colony.y + dy;
    const tile = tileAt(state.map, x, y);
    if (!tile || !isWater(tile) || isInlandLake(state.map, x, y)) continue;
    const around = DIRS.map(([ex, ey]) => [x + ex, y + ey] as const).filter(([lx, ly]) => openLand(state, lx, ly));
    const beach = around.filter(([lx, ly]) => near({ x: lx, y: ly }, colony));
    if (beach.length === 0) continue;
    if (!best || around.length > best.land) best = { x, y, beach, land: around.length };
  }
  return best;
}

function putAshore(state: GameState, owner: PlayerId, type: UnitTypeId, profession: Unit['profession'], x: number, y: number): { state: GameState; id: string } {
  const id = `u${state.nextId}`;
  const unit: Unit = {
    id, owner, type, profession, x, y, aboard: null, orders: 'none', destination: null, movesLeft: 0,
    cargo: {}, tools: 0, workTurns: 0, route: null, repair: 0, treasure: 0, voyage: null,
  };
  return { state: { ...state, nextId: state.nextId + 1, units: { ...state.units, [id]: unit } }, id };
}

/** Rebel units standing where the King's men come ashore are swept away. */
function overrun(state: GameState, x: number, y: number, crown: PlayerId, events: IndependenceSink): GameState {
  let next = state;
  for (const u of unitsAt(state, x, y)) {
    if (u.owner === crown || !next.units[u.id]) continue;
    if (isShip(u)) next = sinkShip(next, u.id, events as ShipEvent[]);
    else {
      const units = { ...next.units };
      delete units[u.id];
      next = { ...next, units };
      events.push({ type: 'unitOverrun', unitId: u.id, owner: u.owner, lost: sumGoods(equipmentOf(u), u.cargo) });
    }
  }
  return next;
}

/** One landing, if the Crown has a ship to make it with. */
function landing(state: GameState, rebel: Player, crown: PlayerId, events: IndependenceSink): GameState {
  const ref = rebel.ref;
  const afloat = Object.values(state.units).filter((u) => u.owner === crown && u.type === 'manOWar');
  if (ref.ships <= 0) {
    // with no ship in hand and none at sea another is fitted out; nothing lands this turn
    return afloat.length === 0 ? patch(state, rebel.id, { ref: { ...ref, ships: 1 } }) : state;
  }
  const last = ref.regulars + ref.cavalry + ref.artillery + ref.ships < I.lastWaveBelow;
  const ports = coloniesOf(state, rebel.id).filter((c) => isPortColony(state, c)).slice(0, I.portsWeighed);
  const weighed = ports
    .map((colony) => {
      const tory = 100 - solPercent(state, colony);
      const defenders = unitsAt(state, colony.x, colony.y).filter(isArmed).length;
      return { colony, key: Math.max(tory, colony.colonists.length * (tory + I.toryBonus) - I.perDefender * defenders), need: landingNeed(state, colony, crown), berth: anchorage(state, colony) };
    })
    .filter((t) => t.berth !== null)
    .sort((a, b) => b.key - a.key);
  if (weighed.length === 0) return state;
  const support = (need: number): number => (ref.cavalry + ref.artillery <= ref.regulars ? 1 : Math.max(1, need >> I.supportShift));
  const strength = (need: number): number => ref.regulars + Math.min(ref.cavalry, support(need)) + Math.min(ref.artillery, support(need));
  const target = weighed.find((t) => t.need <= strength(t.need)) ?? weighed.find((t) => Math.min(t.need, I.needEnough) <= strength(t.need)) ?? weighed[0];
  if (!target?.berth) return state;
  const { colony, berth } = target;

  // the ship takes her station, and anything of the rebels' lying there is lost
  let next = overrun(state, berth.x, berth.y, crown, events);
  const ship = putAshore(next, crown, 'manOWar', null, berth.x, berth.y);
  next = ship.state;
  let stock: RefForce = { ...ref, ships: ref.ships - 1 };

  const size = Math.max(I.waveLeast, Math.min(I.waveMost, target.need));
  const cap = stock.regulars >= 2 ? Math.min(I.supportMost, support(target.need)) : support(target.need);
  let horse = 0;
  let guns = 0;
  const landed: string[] = [];
  const held = (x: number, y: number): number => unitsAt(next, x, y).filter((u) => u.owner === crown).length;
  for (let round = 0; round < I.waveMost && landed.length < size; round++) {
    let placed = false;
    const fewest = Math.min(...berth.beach.map(([x, y]) => held(x, y)));
    for (const [x, y] of berth.beach) {
      if (landed.length >= size) break;
      const occupied = held(x, y) > 0;
      // fresh ground is taken by foot first, and evenly; ground already held is stiffened with horse and guns
      if (!occupied && held(x, y) > fewest) continue;
      const horseOk = stock.cavalry > 0 && horse < cap;
      const gunsOk = stock.artillery > 0 && guns < cap;
      const support = horseOk ? 'cavalry' : gunsOk ? 'artillery' : null;
      const foot = stock.regulars > 0 ? 'regulars' : null;
      const kind: 'regulars' | 'cavalry' | 'artillery' | null = occupied ? support ?? foot : foot ?? support;
      if (kind === null) continue;
      next = overrun(next, x, y, crown, events);
      const type: UnitTypeId = kind === 'regulars' ? 'regular' : kind === 'cavalry' ? 'cavalry' : 'artillery';
      const put = putAshore(next, crown, type, null, x, y);
      next = put.state;
      landed.push(put.id);
      stock = { ...stock, [kind]: stock[kind] - 1 };
      if (kind === 'cavalry') horse++;
      if (kind === 'artillery') guns++;
      placed = true;
    }
    if (!placed) break;
  }
  // the last wave: a handful left over, or nothing but ships, is not worth another voyage
  const done = last || stock.regulars + stock.cavalry + stock.artillery === 0;
  if (done) stock = { regulars: 0, cavalry: 0, artillery: 0, ships: 0 };
  events.push({ type: 'refLanded', player: rebel.id, colonyId: colony.id, shipId: ship.id, unitIds: landed, last: done });
  return patch(next, rebel.id, { ref: stock });
}

/** With nothing left to land, loyal colonists may take up arms outside a colony where the rebels are weak. */
function toryUprising(state: GameState, rebel: Player, crown: PlayerId, rng: Rng, events: IndependenceSink): GameState {
  const war = rebel.revolution as Revolution;
  const d = level(state);
  const roll = (): boolean => rng.int(0, d + 1) <= d;
  if (!roll()) return state;
  let best: { colony: Colony; n: number; free: (readonly [number, number])[] } | null = null;
  for (const colony of coloniesOf(state, rebel.id)) {
    if (war.uprisings.includes(colony.id)) continue;
    const around = DIRS.map(([dx, dy]) => [colony.x + dx, colony.y + dy] as const).filter(([x, y]) => openLand(state, x, y));
    if (around.some(([x, y]) => unitsAt(state, x, y).some((u) => u.owner === crown))) continue;
    const free = around.filter(([x, y]) => unitsAt(state, x, y).length === 0);
    if (free.length === 0) continue;
    const guard = unitsAt(state, colony.x, colony.y).reduce((sum, u) => sum + UNIT_TYPES[u.type].defense, 0);
    const n = Math.floor((I.toryWeight * colony.colonists.length * (100 - solPercent(state, colony))) / 100) + d + 1 - guard;
    if (n > 0 && (!best || n > best.n)) best = { colony, n, free };
  }
  if (!best) return state;
  let next = state;
  const risen: string[] = [];
  for (let i = 0; i < best.n; i++) {
    const [x, y] = best.free[i % best.free.length] as readonly [number, number];
    // mostly raw militia; now and then a man who has seen service, or one with a horse
    const veteran = i % 2 === 1 && roll();
    const mounted = i % 3 === 0 && roll();
    const put = putAshore(next, crown, mounted ? 'dragoon' : 'soldier', veteran ? 'veteranSoldier' : 'freeColonist', x, y);
    next = put.state;
    risen.push(put.id);
  }
  events.push({ type: 'toryUprising', player: rebel.id, colonyId: best.colony.id, unitIds: risen });
  return patch(next, rebel.id, { revolution: { ...war, uprisings: [...war.uprisings, best.colony.id] } });
}

/**
 * The Crown's move against a power in revolt, made as that power's turn ends: a Man-of-War that
 * has put its men ashore goes home for more, and then either another wave lands or, with nothing
 * left to send, the Tories may rise.
 */
export function crownTurn(state: GameState, rebelId: PlayerId, events: IndependenceSink): GameState {
  const rebel = playerOf(state, rebelId);
  const crown = state.crownPlayer;
  if (!rebel?.revolution || crown === null || state.over) return state;
  const rng = createRng(state.rng);
  // a King's ship crippled in a fight limps home and is out of the campaign
  const fit = Object.fromEntries(Object.entries(state.units).filter(([, u]) => !(u.owner === crown && u.type === 'manOWar' && (u.repair > 0 || u.voyage !== null))));
  const afloat: GameState = Object.keys(fit).length === Object.keys(state.units).length ? state : { ...state, units: fit };
  const home = Object.values(afloat.units).filter((u) => u.owner === crown && u.type === 'manOWar');
  let next = stockLeft(rebel.ref) > 0 ? landing(afloat, rebel, crown, events) : toryUprising(afloat, rebel, crown, rng, events);
  if (home.length > 0 && stockLeft((playerOf(next, rebelId) as Player).ref) > 0) {
    // ships that landed their men on an earlier turn sail back to fetch the next wave
    const units = { ...next.units };
    let back = 0;
    for (const ship of home) {
      if (!units[ship.id]) continue;
      delete units[ship.id];
      back++;
    }
    const ref = (playerOf(next, rebelId) as Player).ref;
    next = patch({ ...next, units }, rebelId, { ref: { ...ref, ships: ref.ships + back } });
  }
  return { ...next, rng: rng.state() };
}
