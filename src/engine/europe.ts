// The docks in Europe (R-402/R-404): who is waiting there, boarding and landing, training at
// the Royal University and buying ships and artillery. Buying and selling goods is in market.ts.
import { equipmentOf, holdsFree } from './cargo';
import { isColonistRole, PIONEER_TOOLS, ROLE_GOODS, type ColonistRole } from './data/equipment';
import { GOOD_IDS, type GoodId } from './data/goods';
import { PROFESSIONS, type ProfessionId } from './data/professions';
import { ARTILLERY_PRICE_STEP, UNIT_TYPES, type UnitTypeId } from './data/units';
import { askPrice, bidPrice, dockTrade, isBoycotted } from './market';
import { OFF_MAP, type GameState, type PlayerId, type Unit, type UnitId, type Voyage } from './state';

export type EuropeErrorCode = 'boycotted' | 'cannotEquip' | 'notInEurope' | 'notForSale' | 'cannotAfford' | 'shipFull' | 'notOnDocks' | 'europeClosed';
export type EuropeCheck = { readonly ok: true } | { readonly ok: false; readonly code: EuropeErrorCode; readonly message: string };

export type EuropeEvent =
  | { readonly type: 'unitTrained'; readonly unitId: UnitId; readonly profession: ProfessionId; readonly price: number }
  | { readonly type: 'unitPurchased'; readonly unitId: UnitId; readonly unitType: UnitTypeId; readonly price: number }
  | { readonly type: 'equippedInEurope'; readonly unitId: UnitId; readonly role: ColonistRole; readonly cost: number }
  | { readonly type: 'boardedInEurope'; readonly unitId: UnitId; readonly shipId: UnitId }
  | { readonly type: 'landedInEurope'; readonly unitId: UnitId };

const OK: EuropeCheck = { ok: true };
const no = (code: EuropeErrorCode, message: string): EuropeCheck => ({ ok: false, code, message });

const inEurope = (unit: Unit): boolean => unit.voyage?.phase === 'inEurope';
const isShip = (unit: Unit): boolean => UNIT_TYPES[unit.type].domain === 'sea';

/** Units of this power standing on the docks in Europe (not aboard a ship). */
export function docksOf(state: GameState, owner: PlayerId): Unit[] {
  return Object.values(state.units).filter((u) => u.owner === owner && inEurope(u) && u.aboard === null && !isShip(u));
}

/** Ships of this power lying in port in Europe. */
export function shipsInEurope(state: GameState, owner: PlayerId): Unit[] {
  return Object.values(state.units).filter((u) => u.owner === owner && inEurope(u) && isShip(u));
}

function goldOf(state: GameState, owner: PlayerId): number {
  return state.players.find((p) => p.id === owner)?.gold ?? 0;
}

/** Europe shuts its ports to a power that has declared independence. */
export function checkEuropeOpen(state: GameState, owner: PlayerId): EuropeCheck {
  return state.players.find((p) => p.id === owner)?.atWar ? no('europeClosed', 'Europe is closed to us while the war lasts') : OK;
}

export function dockRecord(state: GameState, owner: PlayerId): Voyage {
  const entry = state.players.find((p) => p.id === owner)?.entry ?? [0, 0];
  return { phase: 'inEurope', turnsLeft: 0, origin: entry };
}

/** A new unit of this power in Europe: a ship in port, or someone on the docks. The caller advances `nextId`. */
export function newDockUnit(state: GameState, owner: PlayerId, type: UnitTypeId, profession: ProfessionId | null): Unit {
  return {
    id: `u${state.nextId}`, owner, type, profession, x: OFF_MAP, y: OFF_MAP, movesLeft: 0,
    // people on the docks wait to board the next ship out
    orders: isShip({ type } as Unit) ? 'none' : 'sentry',
    destination: null, aboard: null, cargo: {}, tools: 0, workTurns: 0, route: null, repair: 0, treasure: 0, voyage: dockRecord(state, owner),
  };
}

function pay(state: GameState, owner: PlayerId, price: number): GameState {
  return { ...state, players: state.players.map((p) => (p.id === owner ? { ...p, gold: p.gold - price } : p)) };
}

// --- the Royal University -------------------------------------------------------------------

export function trainingPrice(profession: ProfessionId): number | null {
  return PROFESSIONS[profession].colonist ? PROFESSIONS[profession].europePrice : null;
}

export function checkTrain(state: GameState, owner: PlayerId, profession: ProfessionId): EuropeCheck {
  const open = checkEuropeOpen(state, owner);
  if (!open.ok) return open;
  const price = PROFESSIONS[profession] ? trainingPrice(profession) : null;
  if (price === null) return no('notForSale', 'the Royal University does not teach that');
  return goldOf(state, owner) >= price ? OK : no('cannotAfford', `that costs ${price} gold`);
}

export function trainUnit(state: GameState, owner: PlayerId, profession: ProfessionId, events: EuropeEvent[]): GameState {
  const price = trainingPrice(profession) as number;
  // the experts of the field trades leave the University fitted out for them
  const role = PROFESSIONS[profession].expertRole;
  const unit: Unit = { ...newDockUnit(state, owner, role ?? 'colonist', profession), tools: role === 'pioneer' ? PIONEER_TOOLS.max : 0 };
  events.push({ type: 'unitTrained', unitId: unit.id, profession, price });
  const paid = pay(state, owner, price);
  return { ...paid, nextId: state.nextId + 1, units: { ...paid.units, [unit.id]: unit } };
}

// --- ships and artillery ----------------------------------------------------------------------

export function purchasePrice(state: GameState, owner: PlayerId, type: UnitTypeId): number | null {
  const base = UNIT_TYPES[type].europePrice;
  if (base === null) return null;
  const bought = state.players.find((p) => p.id === owner)?.artilleryBought ?? 0;
  return type === 'artillery' ? base + ARTILLERY_PRICE_STEP * bought : base;
}

export function checkPurchase(state: GameState, owner: PlayerId, type: UnitTypeId): EuropeCheck {
  const open = checkEuropeOpen(state, owner);
  if (!open.ok) return open;
  const price = UNIT_TYPES[type] ? purchasePrice(state, owner, type) : null;
  if (price === null) return no('notForSale', 'that is not for sale in Europe');
  return goldOf(state, owner) >= price ? OK : no('cannotAfford', `that costs ${price} gold`);
}

export function purchaseUnit(state: GameState, owner: PlayerId, type: UnitTypeId, events: EuropeEvent[]): GameState {
  const price = purchasePrice(state, owner, type) as number;
  const unit = newDockUnit(state, owner, type, null);
  events.push({ type: 'unitPurchased', unitId: unit.id, unitType: type, price });
  const paid = pay(state, owner, price);
  const players = type === 'artillery' ? paid.players.map((p) => (p.id === owner ? { ...p, artilleryBought: p.artilleryBought + 1 } : p)) : paid.players;
  return { ...paid, players, nextId: state.nextId + 1, units: { ...paid.units, [unit.id]: unit } };
}

// --- boarding and landing on the docks ----------------------------------------------------------

export function checkBoard(state: GameState, unit: Unit, ship: Unit | undefined): EuropeCheck {
  if (!inEurope(unit) || isShip(unit) || unit.aboard !== null) return no('notOnDocks', 'only someone waiting on the docks can board');
  if (!ship || ship.owner !== unit.owner || !inEurope(ship) || !isShip(ship)) return no('notInEurope', 'that ship is not in port');
  return UNIT_TYPES[unit.type].size <= holdsFree(state, ship) ? OK : no('shipFull', 'no room aboard');
}

export function boardInEurope(state: GameState, unit: Unit, ship: Unit, events: EuropeEvent[]): GameState {
  events.push({ type: 'boardedInEurope', unitId: unit.id, shipId: ship.id });
  return { ...state, units: { ...state.units, [unit.id]: { ...unit, aboard: ship.id, orders: 'sentry' } } };
}

export function checkLand(unit: Unit): EuropeCheck {
  return inEurope(unit) && unit.aboard !== null ? OK : no('notInEurope', 'only someone aboard a ship in port can step onto the docks');
}

export function landInEurope(state: GameState, unit: Unit, events: EuropeEvent[]): GameState {
  events.push({ type: 'landedInEurope', unitId: unit.id });
  // stepping off means staying behind unless told otherwise
  return { ...state, units: { ...state.units, [unit.id]: { ...unit, aboard: null, orders: 'none' } } };
}

/** People on the docks who are waiting to board go aboard a ship that is about to sail, while it has room. */
export function embarkWaiting(state: GameState, ship: Unit, events: EuropeEvent[]): GameState {
  let next = state;
  for (const unit of docksOf(state, ship.owner)) {
    if (unit.orders !== 'sentry') continue;
    const carrier = next.units[ship.id] as Unit;
    if (UNIT_TYPES[unit.type].size > holdsFree(next, carrier)) continue;
    next = boardInEurope(next, unit, carrier, events);
  }
  return next;
}


// --- fitting out on the docks ------------------------------------------------------------------------

/** Kit each role carries when fitted out in Europe: a pioneer always takes the full hundred tools. */
function kitFor(role: ColonistRole): Partial<Record<GoodId, number>> {
  return role === 'pioneer' ? { tools: PIONEER_TOOLS.max } : ROLE_GOODS[role];
}

export interface DockEquipPlan {
  /** Goods to buy (positive) or sell back (negative). */
  readonly changes: readonly { readonly good: GoodId; readonly amount: number }[];
  /** Gold the change costs (negative when selling kit brings money in). */
  readonly cost: number;
}

/** What changing a dock unit's role would buy and sell, at this power's prices. Selling back is at the bid, untaxed. */
export function dockEquipPlan(state: GameState, unit: Unit, role: ColonistRole): DockEquipPlan {
  const have = equipmentOf(unit);
  const want = kitFor(role);
  const changes: { good: GoodId; amount: number }[] = [];
  let cost = 0;
  for (const good of GOOD_IDS) {
    const amount = (want[good] ?? 0) - (have[good] ?? 0);
    if (amount === 0) continue;
    changes.push({ good, amount });
    cost += amount > 0 ? askPrice(state, unit.owner, good) * amount : -bidPrice(state, unit.owner, good) * -amount;
  }
  return { changes, cost };
}

export function checkDockEquip(state: GameState, unit: Unit, role: ColonistRole): EuropeCheck {
  const open = checkEuropeOpen(state, unit.owner);
  if (!open.ok) return open;
  if (!docksOf(state, unit.owner).some((u) => u.id === unit.id)) return no('notOnDocks', 'only someone waiting on the docks can be fitted out');
  if (!isColonistRole(unit.type) || unit.profession === null || unit.type === role) return no('cannotEquip', 'that makes no change');
  const plan = dockEquipPlan(state, unit, role);
  if (plan.changes.some((c) => isBoycotted(state, unit.owner, c.good))) return no('boycotted', 'that kit is under boycott');
  return goldOf(state, unit.owner) >= plan.cost ? OK : no('cannotAfford', `that costs ${plan.cost} gold`);
}

export function dockEquip(state: GameState, unit: Unit, role: ColonistRole, events: EuropeEvent[]): GameState {
  const plan = dockEquipPlan(state, unit, role);
  let next = state;
  for (const change of plan.changes) next = dockTrade(next, unit.owner, change.good, Math.abs(change.amount), change.amount < 0);
  events.push({ type: 'equippedInEurope', unitId: unit.id, role, cost: plan.cost });
  const fitted: Unit = { ...(next.units[unit.id] as Unit), type: role, tools: role === 'pioneer' ? PIONEER_TOOLS.max : 0 };
  return { ...next, units: { ...next.units, [unit.id]: fitted } };
}
