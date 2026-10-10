// Cargo and equipment (R-202): holds, moving goods between carriers and a colony's warehouse,
// and fitting colonists out as soldiers, dragoons, scouts, pioneers and missionaries.
import { isColonistRole, MISSIONARY_BUILDINGS, PIONEER_TOOLS, ROLE_GOODS, type ColonistRole } from './data/equipment';
import { GOOD_IDS, HOLD_CAPACITY, NOT_AUTO_LOADED, type GoodId } from './data/goods';
import { UNIT_TYPES } from './data/units';
import { cargoOf, colonyAt, MOVE_THIRDS, type Colony, type GameState, type Goods, type Unit } from './state';

export type CargoErrorCode =
  | 'notCarrier'
  | 'notInColony'
  | 'badAmount'
  | 'notEnough'
  | 'noRoom'
  | 'notSameColony'
  | 'cannotEquip'
  | 'needsChurch'
  | 'nothingToLoad';

export type CargoCheck = { readonly ok: true } | { readonly ok: false; readonly code: CargoErrorCode; readonly message: string };

const OK: CargoCheck = { ok: true };
const no = (code: CargoErrorCode, message: string): CargoCheck => ({ ok: false, code, message });

export const amountOf = (goods: Goods, good: GoodId): number => goods[good] ?? 0;

/** Add (or with a negative amount, remove) goods, dropping entries that reach zero. */
export function addGoods(goods: Goods, good: GoodId, amount: number): Goods {
  const next = amountOf(goods, good) + amount;
  if (next < 0) throw new RangeError(`cannot take ${-amount} ${good} from ${amountOf(goods, good)}`);
  const { [good]: _old, ...rest } = goods;
  return next === 0 ? rest : { ...rest, [good]: next };
}

/** Holds a load of goods fills: every started hundred of each good takes one. */
export function holdsForGoods(goods: Goods): number {
  let holds = 0;
  for (const good of GOOD_IDS) holds += Math.ceil(amountOf(goods, good) / HOLD_CAPACITY);
  return holds;
}

export function holdsUsed(state: GameState, carrier: Unit): number {
  return holdsForGoods(carrier.cargo) + cargoOf(state, carrier.id).reduce((sum, u) => sum + UNIT_TYPES[u.type].size, 0);
}

export function holdsFree(state: GameState, carrier: Unit): number {
  return UNIT_TYPES[carrier.type].holds - holdsUsed(state, carrier);
}

/** How many more of `good` the carrier can take: the slack in a part-full hold plus its empty holds. */
export function roomFor(state: GameState, carrier: Unit, good: GoodId): number {
  const have = amountOf(carrier.cargo, good);
  const slack = (HOLD_CAPACITY - (have % HOLD_CAPACITY)) % HOLD_CAPACITY;
  return slack + Math.max(0, holdsFree(state, carrier)) * HOLD_CAPACITY;
}

function carrierInColony(state: GameState, carrier: Unit | undefined): { colony: Colony } | CargoCheck {
  if (!carrier || UNIT_TYPES[carrier.type].holds === 0) return no('notCarrier', 'only ships and wagon trains carry goods');
  const colony = colonyAt(state, carrier.x, carrier.y);
  if (!colony || colony.owner !== carrier.owner) return no('notInColony', 'goods change hands only in one of your colonies');
  return { colony };
}

const badAmount = (amount: number): boolean => !Number.isInteger(amount) || amount <= 0;

export function checkLoad(state: GameState, carrier: Unit | undefined, good: GoodId, amount: number): CargoCheck {
  const where = carrierInColony(state, carrier);
  if ('ok' in where) return where;
  if (!GOOD_IDS.includes(good) || badAmount(amount)) return no('badAmount', 'load a whole, positive amount of a tradeable good');
  if (amountOf(where.colony.goods, good) < amount) return no('notEnough', `the warehouse holds only ${amountOf(where.colony.goods, good)}`);
  if (roomFor(state, carrier as Unit, good) < amount) return no('noRoom', 'the holds are full');
  return OK;
}

export function checkUnload(state: GameState, carrier: Unit | undefined, good: GoodId, amount: number): CargoCheck {
  const where = carrierInColony(state, carrier);
  if ('ok' in where) return where;
  if (!GOOD_IDS.includes(good) || badAmount(amount)) return no('badAmount', 'unload a whole, positive amount of a tradeable good');
  if (amountOf((carrier as Unit).cargo, good) < amount) return no('notEnough', 'not that much aboard');
  return OK;
}

export function checkTransfer(state: GameState, from: Unit | undefined, to: Unit | undefined, good: GoodId, amount: number): CargoCheck {
  const a = carrierInColony(state, from);
  if ('ok' in a) return a;
  const b = carrierInColony(state, to);
  if ('ok' in b) return b;
  if (a.colony.id !== b.colony.id || (from as Unit).id === (to as Unit).id) return no('notSameColony', 'both carriers must be in the same colony');
  if (!GOOD_IDS.includes(good) || badAmount(amount)) return no('badAmount', 'move a whole, positive amount of a tradeable good');
  if (amountOf((from as Unit).cargo, good) < amount) return no('notEnough', 'not that much aboard');
  if (roomFor(state, to as Unit, good) < amount) return no('noRoom', 'the holds are full');
  return OK;
}

function putUnit(state: GameState, unit: Unit): GameState {
  return { ...state, units: { ...state.units, [unit.id]: unit } };
}

function putColony(state: GameState, colony: Colony): GameState {
  return { ...state, colonies: { ...state.colonies, [colony.id]: colony } };
}

export function loadCargo(state: GameState, carrier: Unit, good: GoodId, amount: number): GameState {
  const colony = colonyAt(state, carrier.x, carrier.y) as Colony;
  return putUnit(putColony(state, { ...colony, goods: addGoods(colony.goods, good, -amount) }), { ...carrier, cargo: addGoods(carrier.cargo, good, amount) });
}

export function unloadCargo(state: GameState, carrier: Unit, good: GoodId, amount: number): GameState {
  const colony = colonyAt(state, carrier.x, carrier.y) as Colony;
  return putUnit(putColony(state, { ...colony, goods: addGoods(colony.goods, good, amount) }), { ...carrier, cargo: addGoods(carrier.cargo, good, -amount) });
}

export function transferCargo(state: GameState, from: Unit, to: Unit, good: GoodId, amount: number): GameState {
  return putUnit(putUnit(state, { ...from, cargo: addGoods(from.cargo, good, -amount) }), { ...to, cargo: addGoods(to.cargo, good, amount) });
}

/**
 * The lot "load most valuable" would take: the dearest good in the warehouse (leaving horses,
 * tools and muskets alone), as much as fits in one hold.
 */
export function mostValuableLoad(state: GameState, carrier: Unit, valueOf: (good: GoodId) => number): { good: GoodId; amount: number } | null {
  const colony = colonyAt(state, carrier.x, carrier.y);
  if (!colony) return null;
  let best: { good: GoodId; amount: number; worth: number } | null = null;
  for (const good of GOOD_IDS) {
    if (NOT_AUTO_LOADED.includes(good)) continue;
    const amount = Math.min(amountOf(colony.goods, good), HOLD_CAPACITY, roomFor(state, carrier, good));
    if (amount <= 0) continue;
    const worth = amount * valueOf(good);
    if (!best || worth > best.worth) best = { good, amount, worth };
  }
  return best ? { good: best.good, amount: best.amount } : null;
}

// --- equipment -----------------------------------------------------------------------------

/** Everything a unit is carrying as equipment, as goods. */
export function equipmentOf(unit: Unit): Goods {
  if (!isColonistRole(unit.type)) return {};
  const fixed: Goods = ROLE_GOODS[unit.type];
  return unit.type === 'pioneer' && unit.tools > 0 ? { ...fixed, tools: unit.tools } : fixed;
}

/** Tools a new pioneer would draw from a stock: as many whole lots as there are, up to the full kit. */
export function pioneerKit(available: number): number {
  return Math.min(PIONEER_TOOLS.max, Math.floor(available / PIONEER_TOOLS.perAction) * PIONEER_TOOLS.perAction);
}

export interface EquipPlan {
  /** Net change to the warehouse, good by good (negative = taken). */
  readonly delta: Goods;
  readonly tools: number;
}

/** What switching `unit` to `role` in `colony` would do, or why it cannot be done. */
export function planEquip(colony: Colony, unit: Unit, role: ColonistRole, given = false): CargoCheck | { ok: true; plan: EquipPlan } {
  if (!isColonistRole(unit.type) || unit.profession === null) return no('cannotEquip', 'only colonists change roles');
  if (unit.type === role) return no('cannotEquip', `already a ${role}`);
  if (role === 'missionary' && !colony.buildings.some((b) => MISSIONARY_BUILDINGS.includes(b))) {
    return no('needsChurch', 'a missionary is ordained in a church');
  }
  // Hand everything back, then draw the new kit from the combined stock.
  const stock: Partial<Record<GoodId, number>> = { ...colony.goods };
  for (const good of GOOD_IDS) stock[good] = amountOf(colony.goods, good) + amountOf(equipmentOf(unit), good);
  const need: Partial<Record<GoodId, number>> = { ...ROLE_GOODS[role] };
  let tools = 0;
  if (role === 'pioneer' && given) {
    // a computer power's colonist turned pioneer is simply given tools for one job
    tools = PIONEER_TOOLS.min;
    need.tools = 0;
  } else if (role === 'pioneer') {
    tools = pioneerKit(stock.tools ?? 0);
    if (tools < PIONEER_TOOLS.min) return no('notEnough', `a pioneer needs at least ${PIONEER_TOOLS.min} tools`);
    need.tools = tools;
  }
  const delta: Partial<Record<GoodId, number>> = {};
  for (const good of GOOD_IDS) {
    const left = (stock[good] ?? 0) - (need[good] ?? 0);
    if (left < 0) return no('notEnough', `not enough ${good}`);
    const change = left - amountOf(colony.goods, good);
    if (change !== 0) delta[good] = change;
  }
  return { ok: true, plan: { delta, tools } };
}

export function checkEquip(state: GameState, unit: Unit | undefined, role: ColonistRole): CargoCheck {
  if (!unit) return no('cannotEquip', 'no such unit');
  const colony = colonyAt(state, unit.x, unit.y);
  if (!colony || colony.owner !== unit.owner) return no('notInColony', 'roles change only in one of your colonies');
  const plan = planEquip(colony, unit, role, state.players.find((p) => p.id === unit.owner)?.kind === 'ai');
  return plan.ok ? OK : plan;
}

export function equip(state: GameState, unit: Unit, role: ColonistRole): GameState {
  const colony = colonyAt(state, unit.x, unit.y) as Colony;
  const planned = planEquip(colony, unit, role, state.players.find((p) => p.id === unit.owner)?.kind === 'ai');
  if (!('plan' in planned)) throw new Error('equip called without a valid plan');
  let goods = colony.goods;
  for (const good of GOOD_IDS) {
    const change = amountOf(planned.plan.delta, good);
    if (change !== 0) goods = addGoods(goods, good, change);
  }
  const changed: Unit = {
    ...unit, type: role, tools: planned.plan.tools, workTurns: 0,
    movesLeft: Math.min(unit.movesLeft, UNIT_TYPES[role].moves * MOVE_THIRDS),
    orders: unit.orders === 'sentry' ? 'sentry' : 'none',
  };
  return putUnit(putColony(state, { ...colony, goods }), changed);
}

/**
 * Use up tools for a finished pioneer job. A pioneer left with less than one job's worth has
 * nothing left and goes back to being a plain colonist.
 */
export function spendTools(unit: Unit, amount: number = PIONEER_TOOLS.perAction): { unit: Unit; reverted: boolean } {
  const left = unit.tools - amount;
  if (left < PIONEER_TOOLS.perAction) return { unit: { ...unit, type: 'colonist', tools: 0, workTurns: 0 }, reverted: true };
  return { unit: { ...unit, tools: left }, reverted: false };
}

/** Every tradeable good in the game, wherever it is: warehouses, holds, and kit in use. */
export function totalGoods(state: GameState): Record<GoodId, number> {
  const total = Object.fromEntries(GOOD_IDS.map((g) => [g, 0])) as Record<GoodId, number>;
  const add = (goods: Goods): void => {
    for (const good of GOOD_IDS) total[good] += amountOf(goods, good);
  };
  for (const colony of Object.values(state.colonies)) add(colony.goods);
  for (const unit of Object.values(state.units)) {
    add(unit.cargo);
    add(equipmentOf(unit));
  }
  return total;
}
