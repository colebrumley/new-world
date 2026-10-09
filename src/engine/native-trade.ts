// Trade with a native settlement (R-505). A wagon train or ship offers one cargo; the settlement
// names a price; the trader accepts, haggles or makes a gift of it; then the settlement offers up
// to three of its own goods. The talks in progress are kept in `state.parley`.
import { adjustTribalAlarm, attitude, tribalAlarm, type AlarmEvent, type AlarmSink } from './alarm';
import { addGoods, amountOf, equipmentOf, holdsFree } from './cargo';
import { GOOD_IDS, type GoodId } from './data/goods';
import { EUROPE_PRICED, MADE_GOODS, NATIVE_TRADE as N, RAW_PRICED } from './data/native-trade';
import { TRIBES } from './data/tribes';
import { UNIT_TYPES } from './data/units';
import { DIFFICULTIES } from './data/yields';
import { bidPrice } from './market';
import { settlementEconomy, wantedGoods } from './native-economy';
import { createRng, type Rng } from './rng';
import { cargoOf, type GameState, type Goods, type Parley, type Player, type PlayerId, type Settlement, type TribeState, type Unit } from './state';

export type NativeTradeEvent =
  | AlarmEvent
  /** The settlement has named its price for the cargo offered. */
  | { readonly type: 'nativeOffer'; readonly settlementId: string; readonly unitId: string; readonly good: GoodId; readonly amount: number; readonly price: number; readonly value: number }
  | { readonly type: 'nativeSale'; readonly settlementId: string; readonly unitId: string; readonly good: GoodId; readonly amount: number; readonly price: number; readonly gift: boolean }
  | { readonly type: 'nativeHaggle'; readonly settlementId: string; readonly unitId: string; readonly good: GoodId; readonly success: boolean; readonly price: number; readonly buying: boolean }
  /** What the settlement will sell, after a sale or gift. Empty when it has nothing or will not deal. */
  | { readonly type: 'nativeWares'; readonly settlementId: string; readonly unitId: string; readonly amount: number; readonly offers: readonly { readonly good: GoodId; readonly price: number }[] }
  | { readonly type: 'nativePurchase'; readonly settlementId: string; readonly unitId: string; readonly good: GoodId; readonly amount: number; readonly price: number }
  /** A carrier went into a hostile village: lost with all aboard, sent packing, or let in to trade. */
  | { readonly type: 'hostileEntry'; readonly settlementId: string; readonly unitId: string; readonly outcome: 'destroyed' | 'turnedAway' | 'admitted'; readonly lost: Goods }
  | { readonly type: 'nativesWant'; readonly settlementId: string; readonly unitId: string; readonly wants: readonly GoodId[] };

export type NativeTradeErrorCode = 'noCargo' | 'unwanted' | 'haggledOut' | 'noParley' | 'badReply' | 'cannotAfford' | 'noRoom';
export type NativeTradeCheck = { readonly ok: true } | { readonly ok: false; readonly code: NativeTradeErrorCode; readonly message: string };
const no = (code: NativeTradeErrorCode, message: string): NativeTradeCheck => ({ ok: false, code, message });

export type ParleyReply = 'accept' | 'haggle' | 'gift' | 'leave';

const playerOf = (state: GameState, id: PlayerId): Player | undefined => state.players.find((p) => p.id === id);
const level = (state: GameState, playerId: PlayerId): number => (playerOf(state, playerId)?.kind === 'human' ? DIFFICULTIES.indexOf(state.difficulty) : 0);
const isShip = (unit: Unit): boolean => UNIT_TYPES[unit.type].domain === 'sea';
const putSettlement = (state: GameState, s: Settlement): GameState => ({ ...state, settlements: { ...state.settlements, [s.id]: s } });
const putTribe = (state: GameState, s: Settlement, change: (t: TribeState) => TribeState): GameState => {
  const record = state.tribes[s.tribe];
  return record ? { ...state, tribes: { ...state.tribes, [s.tribe]: change(record) } } : state;
};
/** The tribe's trade memory runs both ways, so unlike a cargo it may go below nothing. */
const remember = (stock: Goods, good: GoodId, change: number): Goods => {
  const { [good]: _old, ...rest } = stock;
  const now = amountOf(stock, good) + change;
  return now === 0 ? rest : { ...rest, [good]: now };
};
const pay = (state: GameState, playerId: PlayerId, gold: number): GameState => ({ ...state, players: state.players.map((p) => (p.id === playerId ? { ...p, gold: p.gold + gold } : p)) });
const takeCargo = (state: GameState, unit: Unit, good: GoodId, amount: number): GameState => ({ ...state, units: { ...state.units, [unit.id]: { ...(state.units[unit.id] as Unit), cargo: addGoods((state.units[unit.id] as Unit).cargo, good, -amount) } } });

/** How ill feeling counts against a good: twice the attitude level, nothing for arms and mounts, half where demand is strong. */
function grudge(state: GameState, settlement: Settlement, playerId: PlayerId, good: GoodId, demand: number): number {
  const a = good === 'muskets' || good === 'horses' ? 0 : 2 * attitude(state, settlement.tribe, playerId);
  return demand >= N.strongDemand ? a >> 1 : a;
}

/** Can this cargo be offered here at all? */
export function checkOffer(state: GameState, unit: Unit, settlement: Settlement, good: GoodId | undefined): NativeTradeCheck {
  if (good === undefined || amountOf(unit.cargo, good) <= 0) return no('noCargo', 'there is no such cargo to offer');
  if (settlement.haggleMemory === good) return no('haggledOut', 'they remember our last haggling over that and will not hear of it');
  const { demand } = settlementEconomy(state, settlement);
  if (good === settlement.lastBought || good === settlement.lastSold || demand[good] === 0) return no('unwanted', 'they have no use for that just now');
  return { ok: true };
}

/** The settlement's price for a cargo, with how well disposed it is to the deal (goodwill) and its word for the goods. */
export function quoteSale(state: GameState, unit: Unit, settlement: Settlement, good: GoodId, rng: Rng): { amount: number; price: number; goodwill: number; value: number } {
  const tribe = state.tribes[settlement.tribe];
  const { demand } = settlementEconomy(state, settlement);
  const d = demand[good];
  const amount = Math.min(N.fullLot, amountOf(unit.cargo, good));
  const r = rng.int(1, N.moodDie);
  let k: number = MADE_GOODS.includes(good) ? N.keennessMade : N.keenness;
  if (good === 'tradeGoods') k -= rng.int(0, N.tradeGoodsDrop);
  if (good === 'muskets') k += N.musketsFrom - (tribe?.muskets ?? 0);
  if (good === 'horses') k += N.horsesFrom - (tribe?.horses ?? 0);
  if (good === 'tools') k += N.toolsBonus;
  const a = grudge(state, settlement, unit.owner, good, d);
  const m = 2 * (k - level(state, unit.owner) - a + r + 4);
  const price = Math.max(1, Math.trunc(Math.trunc(((5 * r + Math.max(0, m * d)) * amount) / 100) / 2));
  const goodwill = rng.int(0, 1) + ((d - a + 4) >> 2);
  const value = Math.max(0, Math.min(N.values.length - 1, Math.trunc((d - a + 4) / 10)));
  return { amount, price, goodwill, value };
}

/** Open the talks: the settlement names its price. A carrier with nothing aboard is only told what is wanted. */
export function openTrade(state: GameState, unit: Unit, settlement: Settlement, good: GoodId | undefined, events: NativeTradeEvent[]): GameState {
  const spent: GameState = { ...state, units: { ...state.units, [unit.id]: { ...unit, movesLeft: 0 } } };
  if (good === undefined) {
    events.push({ type: 'nativesWant', settlementId: settlement.id, unitId: unit.id, wants: wantedGoods(state, settlement) });
    return spent;
  }
  const rng = createRng(state.rng);
  const quote = quoteSale(state, unit, settlement, good, rng);
  events.push({ type: 'nativeOffer', settlementId: settlement.id, unitId: unit.id, good, amount: quote.amount, price: quote.price, value: quote.value });
  const parley: Parley = { stage: 'selling', player: unit.owner, unitId: unit.id, settlementId: settlement.id, good, amount: quote.amount, price: quote.price, goodwill: quote.goodwill, haggled: false };
  return { ...spent, rng: rng.state(), parley };
}

/** Into a hostile village with goods: the bolder the tribe's anger, the likelier the carrier is lost or sent away. */
export function enterHostile(state: GameState, unit: Unit, settlement: Settlement, good: GoodId | undefined, events: NativeTradeEvent[]): GameState {
  const rng = createRng(state.rng);
  const t = tribalAlarm(state, settlement.tribe, unit.owner);
  const roll = rng.int(0, N.hostileDie);
  const rolled: GameState = { ...state, rng: rng.state() };
  if (roll <= t) {
    const units = { ...rolled.units };
    // everything aboard goes with it, the riders' own kit included
    let lost: Goods = unit.cargo;
    for (const rider of cargoOf(state, unit.id)) {
      const kit = equipmentOf(rider);
      for (const g of GOOD_IDS) if ((kit[g] ?? 0) > 0) lost = addGoods(lost, g, kit[g] ?? 0);
      delete units[rider.id];
    }
    delete units[unit.id];
    events.push({ type: 'hostileEntry', settlementId: settlement.id, unitId: unit.id, outcome: 'destroyed', lost });
    return { ...rolled, units };
  }
  if (roll <= 2 * t) {
    events.push({ type: 'hostileEntry', settlementId: settlement.id, unitId: unit.id, outcome: 'turnedAway', lost: {} });
    return { ...rolled, units: { ...rolled.units, [unit.id]: { ...unit, movesLeft: 0 } } };
  }
  events.push({ type: 'hostileEntry', settlementId: settlement.id, unitId: unit.id, outcome: 'admitted', lost: {} });
  return openTrade(rolled, unit, settlement, good, events);
}

/** The three goods a settlement has most of to sell, with what it asks for `amount` of each. */
export function wares(state: GameState, unit: Unit, settlement: Settlement, amount: number, rng: Rng): { good: GoodId; price: number }[] {
  const { supply } = settlementEconomy(state, settlement);
  const t = TRIBES[settlement.tribe].tech;
  const d = level(state, unit.owner);
  const ranked = GOOD_IDS.filter((g) => supply[g] > 0 && g !== 'tradeGoods' && g !== 'tools' && g !== 'muskets').sort((a, b) => supply[b] - supply[a]).slice(0, N.offered);
  const goods = ranked.map((g) => (g === 'food' ? 'coats' : g)).filter((g, i, all) => all.indexOf(g) === i);
  return goods.map((good) => {
    let base: number = RAW_PRICED.includes(good) ? N.rawPrice : (8 - t) * N.madePriceStep;
    if (EUROPE_PRICED.includes(good)) base += (bidPrice(state, unit.owner, good) + 1) * (2 * d + N.europeFactor);
    base += rng.int(0, base) - N.supplyDiscount * supply[good] + N.alarmSurcharge * tribalAlarm(state, settlement.tribe, unit.owner);
    return { good, price: Math.max(N.buyMinimum, Math.trunc((base * amount) / 100) + 10 * (d + rng.int(0, 2))) };
  });
}

function showWares(state: GameState, unit: Unit, settlement: Settlement, amount: number, rng: Rng, events: NativeTradeEvent[]): GameState {
  const carrier = state.units[unit.id] as Unit;
  const quantity = isShip(carrier) ? Math.trunc(amount / N.shipDivisor) : amount;
  const willing = settlement.haggleMemory !== 'noSale' && quantity > 0 && holdsFree(state, carrier) > 0;
  const offers = willing ? wares(state, carrier, settlement, quantity, rng) : [];
  events.push({ type: 'nativeWares', settlementId: settlement.id, unitId: unit.id, amount: quantity, offers });
  if (offers.length === 0) return { ...state, parley: null };
  return { ...state, parley: { stage: 'buying', player: unit.owner, unitId: unit.id, settlementId: settlement.id, amount: quantity, offers } };
}

export function checkParley(state: GameState, playerId: PlayerId, reply: ParleyReply, good: GoodId | undefined): NativeTradeCheck {
  const parley = state.parley;
  if (!parley || parley.player !== playerId || !state.units[parley.unitId] || !state.settlements[parley.settlementId]) return no('noParley', 'no trade is being discussed');
  if (reply === 'leave') return { ok: true };
  if (parley.stage === 'selling') return reply === 'gift' && parley.haggled ? no('badReply', 'it is too late to make a gift of it') : { ok: true };
  if (reply === 'gift') return no('badReply', 'that is not an answer to their offer');
  const offer = parley.offers.find((o) => o.good === good);
  if (!offer) return no('badReply', 'they are not offering that');
  if (reply === 'accept' && (playerOf(state, playerId)?.gold ?? 0) < offer.price) return no('cannotAfford', `they ask ${offer.price} gold`);
  return { ok: true };
}

/** Selling arms or mounts changes what the tribe can field. */
function armTribe(state: GameState, settlement: Settlement, good: GoodId, amount: number, gift: boolean): GameState {
  if (good !== 'muskets' && good !== 'horses') return state;
  const steps = gift ? 1 : amount >= N.armsLots[1] ? 2 : amount >= N.armsLots[0] ? 1 : 0;
  return putTribe(state, settlement, (t) => (good === 'muskets'
    ? { ...t, muskets: t.muskets + steps }
    : { ...t, horses: t.horses + steps, breeding: t.breeding + Math.trunc(amount / N.breedingDivisor) }));
}

function calm(state: GameState, settlement: Settlement, playerId: PlayerId, by: number, amount: number): GameState {
  const now = state.settlements[settlement.id] as Settlement;
  const alarm = amount >= N.fullLot ? 0 : Math.max(0, (now.alarm[playerId] ?? 0) - by);
  return putSettlement(state, { ...now, alarm: { ...now.alarm, [playerId]: alarm } });
}

/** Answer the settlement: take the price, press for more, give the cargo away, or walk off. */
export function answerParley(state: GameState, reply: ParleyReply, good: GoodId | undefined, events: NativeTradeEvent[]): GameState {
  const parley = state.parley as Parley;
  const unit = state.units[parley.unitId] as Unit;
  const settlement = state.settlements[parley.settlementId] as Settlement;
  const rng = createRng(state.rng);
  const sink = events as AlarmSink;
  const d = level(state, parley.player);
  const done = (next: GameState): GameState => ({ ...next, rng: rng.state() });
  if (reply === 'leave') return { ...state, parley: null };

  if (parley.stage === 'selling') {
    const { demand } = settlementEconomy(state, settlement);
    const a = grudge(state, settlement, parley.player, parley.good, demand[parley.good]);
    if (reply === 'haggle') {
      const success = parley.goodwill > 0 && rng.int(1, 8 * parley.goodwill) > d;
      if (!success) {
        events.push({ type: 'nativeHaggle', settlementId: settlement.id, unitId: unit.id, good: parley.good, success: false, price: parley.price, buying: false });
        let next = putSettlement({ ...state, parley: null }, { ...settlement, haggleMemory: parley.good });
        next = adjustTribalAlarm(next, settlement.tribe, parley.player, (a >> 1) + 1, rng, sink);
        return done(next);
      }
      const dd = demand[parley.good];
      const price = parley.price + Math.max(1, Math.trunc((rng.int((dd >> 1) + 1, 2 * dd + 1) * parley.amount) / 100));
      events.push({ type: 'nativeHaggle', settlementId: settlement.id, unitId: unit.id, good: parley.good, success: true, price, buying: false });
      return done({ ...state, parley: { ...parley, price, goodwill: parley.goodwill - 1, haggled: true } });
    }
    const gift = reply === 'gift';
    const w = parley.goodwill + (gift ? 1 : 0);
    let next = takeCargo(state, unit, parley.good, parley.amount);
    if (!gift) {
      next = pay(next, parley.player, parley.price);
      next = putTribe(next, settlement, (t) => ({ ...t, stock: remember(t.stock, parley.good, parley.amount) }));
    }
    next = armTribe(next, settlement, parley.good, parley.amount, gift);
    next = putSettlement(next, { ...(next.settlements[settlement.id] as Settlement), lastBought: parley.good, haggleMemory: null });
    events.push({ type: 'nativeSale', settlementId: settlement.id, unitId: unit.id, good: parley.good, amount: parley.amount, price: gift ? 0 : parley.price, gift });
    if (gift || w > 0) {
      next = adjustTribalAlarm(next, settlement.tribe, parley.player, -(gift ? 4 : 2) * w, rng, sink);
      next = calm(next, settlement, parley.player, (gift ? 2 : 1) * parley.amount, parley.amount);
    }
    return done(showWares(next, unit, next.settlements[settlement.id] as Settlement, parley.amount, rng, events));
  }

  const offer = parley.offers.find((o) => o.good === good) as { good: GoodId; price: number };
  const { supply } = settlementEconomy(state, settlement);
  if (reply === 'haggle') {
    const success = offer.price > N.haggleFloor && rng.int(0, Math.trunc(supply[offer.good] / 25) + 8) > d + 1;
    if (!success) {
      events.push({ type: 'nativeHaggle', settlementId: settlement.id, unitId: unit.id, good: offer.good, success: false, price: offer.price, buying: true });
      let next = putSettlement({ ...state, parley: null }, { ...settlement, haggleMemory: 'noSale' });
      next = adjustTribalAlarm(next, settlement.tribe, parley.player, 2, rng, sink);
      return done(next);
    }
    const price = Math.max(N.haggleFloor, offer.price - Math.max(1, Math.trunc(offer.price / N.haggleDivisor)));
    events.push({ type: 'nativeHaggle', settlementId: settlement.id, unitId: unit.id, good: offer.good, success: true, price, buying: true });
    let next: GameState = { ...state, parley: { ...parley, offers: parley.offers.map((o) => (o.good === offer.good ? { ...o, price } : o)) } };
    if (rng.int(0, 7 - d) === 0) next = adjustTribalAlarm(next, settlement.tribe, parley.player, 1, rng, sink);
    return done(next);
  }
  let next = pay({ ...state, parley: null }, parley.player, -offer.price);
  next = { ...next, units: { ...next.units, [unit.id]: { ...unit, cargo: addGoods(unit.cargo, offer.good, parley.amount) } } };
  next = putTribe(next, settlement, (t) => ({ ...t, stock: remember(t.stock, offer.good, -parley.amount) }));
  if (offer.good !== 'rum') next = putSettlement(next, { ...settlement, lastSold: offer.good });
  events.push({ type: 'nativePurchase', settlementId: settlement.id, unitId: unit.id, good: offer.good, amount: parley.amount, price: offer.price });
  next = adjustTribalAlarm(next, settlement.tribe, parley.player, -rng.int(0, Math.trunc(offer.price / 25) + 1), rng, sink);
  return done(next);
}

/** The tribe's memory of trade fades a little every turn. */
export function fadeTradeMemory(state: GameState): GameState {
  let next = state;
  for (const [tribe, record] of Object.entries(state.tribes)) {
    if (!record || Object.keys(record.stock).length === 0) continue;
    const step = TRIBES[tribe as keyof typeof TRIBES].tech + 1;
    const stock: Record<string, number> = {};
    for (const g of GOOD_IDS) {
      const s = amountOf(record.stock, g);
      const faded = s > 0 ? Math.max(0, s - step) : Math.min(0, s + step);
      if (faded !== 0) stock[g] = faded;
    }
    next = { ...next, tribes: { ...next.tribes, [tribe]: { ...record, stock } } };
  }
  return next;
}
