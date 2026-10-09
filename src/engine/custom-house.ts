// The Custom House (R-403): a colony that has one sells flagged goods straight to Europe
// during its own turn, without a ship. Rules in docs/RULES.md "Custom House".
import { AI_PLAN, AI_WAGONS } from './data/ai';
import { CUSTOM_HOUSE } from './data/custom-house';
import { GOOD_IDS, type GoodId } from './data/goods';
import { UNIT_TYPES } from './data/units';
import { amountOf, addGoods } from './cargo';
import { askPrice, dockTrade, exportSale, isBoycotted, priceLevel } from './market';
import { wagonHomes } from './wagons';
import type { Colony, GameState } from './state';

export type CustomHouseEvent =
  | { readonly type: 'exportSet'; readonly colonyId: string; readonly good: GoodId; readonly on: boolean }
  /** Goods sold through the Custom House. `tax` is 0 once independence has been declared. */
  | { readonly type: 'customHouseSold'; readonly colonyId: string; readonly player: string; readonly good: GoodId; readonly amount: number; readonly gross: number; readonly tax: number; readonly net: number }
  /** A computer power's colony has had goods sent out to it: trade goods for its wagon train, or lumber when it has nobody to fell any. */
  | { readonly type: 'colonySupplied'; readonly colonyId: string; readonly player: string; readonly good: GoodId; readonly amount: number; readonly cost: number };

export type CustomHouseErrorCode = 'noColony' | 'noCustomHouse' | 'noSuchGood';
export type CustomHouseCheck = { readonly ok: true } | { readonly ok: false; readonly code: CustomHouseErrorCode; readonly message: string };
const no = (code: CustomHouseErrorCode, message: string): CustomHouseCheck => ({ ok: false, code, message });

export const hasCustomHouse = (colony: Colony): boolean => colony.buildings.includes(CUSTOM_HOUSE.building);

export function checkSetExport(colony: Colony | undefined, good: GoodId): CustomHouseCheck {
  if (!colony) return no('noColony', 'there is no such colony');
  if (!hasCustomHouse(colony)) return no('noCustomHouse', `${colony.name} has no Custom House`);
  return GOOD_IDS.includes(good) ? { ok: true } : no('noSuchGood', 'no such good');
}

export function setExport(state: GameState, colony: Colony, good: GoodId, on: boolean, events: CustomHouseEvent[]): GameState {
  if (colony.exports.includes(good) === on) return state;
  const exports = GOOD_IDS.filter((g) => (g === good ? on : colony.exports.includes(g)));
  events.push({ type: 'exportSet', colonyId: colony.id, good, on });
  return { ...state, colonies: { ...state.colonies, [colony.id]: { ...colony, exports } } };
}

/** Is a warship of another power close enough to stop the exports? Only human powers are troubled. */
export function isBlockaded(state: GameState, colony: Colony): boolean {
  if (state.players.find((p) => p.id === colony.owner)?.kind !== 'human') return false;
  const r = CUSTOM_HOUSE.blockadeRadius;
  return Object.values(state.units).some((u) => {
    const type = UNIT_TYPES[u.type];
    return u.owner !== colony.owner && type.domain === 'sea' && type.attack > 0 && u.voyage === null
      && Math.abs(u.x - colony.x) <= r && Math.abs(u.y - colony.y) <= r;
  });
}

/** The colony's exports for this turn: every flagged good with a full hundred in store is sold down to the reserve. */
export function customHouseSales(state: GameState, colonyId: string, events: CustomHouseEvent[]): GameState {
  const colony = state.colonies[colonyId];
  if (!colony) return state;
  // a computer power's colonies sell their surplus without being told, building or no building
  const ai = state.players.find((p) => p.id === colony.owner)?.kind === 'ai';
  const exports: readonly GoodId[] = ai ? AI_PLAN.colonyExports : colony.exports;
  if ((!ai && !hasCustomHouse(colony)) || exports.length === 0 || isBlockaded(state, colony)) return state;
  const taxed = !state.players.find((p) => p.id === colony.owner)?.atWar;
  let next = state;
  let goods = colony.goods;
  for (const good of exports) {
    const stock = amountOf(goods, good);
    if (stock < CUSTOM_HOUSE.sellAt) continue;
    const amount = stock - CUSTOM_HOUSE.keep;
    const sale = exportSale(next, colony.owner, good, amount, taxed);
    next = sale.state;
    goods = addGoods(goods, good, -amount);
    events.push({ type: 'customHouseSold', colonyId, player: colony.owner, good, amount, gross: sale.gross, tax: sale.tax, net: sale.net });
  }
  return goods === colony.goods ? state : { ...next, colonies: { ...next.colonies, [colonyId]: { ...(next.colonies[colonyId] as Colony), goods } } };
}

/**
 * A computer power's colony that a wagon train serves sends for trade goods while it is short of
 * them and they are cheap: a full cargo at Europe's asking price, if the treasury can pay.
 */
export function wagonSupplies(state: GameState, colonyId: string, events: CustomHouseEvent[]): GameState {
  const colony = state.colonies[colonyId];
  const owner = state.players.find((p) => p.id === colony?.owner);
  if (!colony || owner?.kind !== 'ai') return state;
  const good: GoodId = 'tradeGoods';
  if (amountOf(colony.goods, good) >= AI_WAGONS.tradeGoodsBelow || priceLevel(state, owner.id, good) > AI_WAGONS.tradeGoodsPriceMost || isBoycotted(state, owner.id, good)) return state;
  if (!Object.values(wagonHomes(state, owner.id)).includes(colony.id)) return state;
  const amount = AI_WAGONS.cargo;
  const cost = askPrice(state, owner.id, good) * amount;
  if (owner.gold < cost + AI_PLAN.goldReserve) return state;
  const paid = dockTrade(state, owner.id, good, amount, false);
  events.push({ type: 'colonySupplied', colonyId, player: owner.id, good, amount, cost });
  return { ...paid, colonies: { ...paid.colonies, [colonyId]: { ...colony, goods: addGoods(colony.goods, good, amount) } } };
}
