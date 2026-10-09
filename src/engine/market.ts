// The Europe market (R-400). Each power has its own price and traffic per good; every trade by
// anyone moves everyone's traffic, and the four processed goods are priced against one another
// through a volume shared by all powers. Written from docs/RULES.md "Market".
import { dateOfTurn } from './calendar';
import { addGoods, amountOf, roomFor } from './cargo';
import { GOOD_IDS, type GoodId } from './data/goods';
import { ASK_OVER_BID, MARKET, MARKET_MODEL } from './data/market';
import { UNIT_TYPES } from './data/units';
import { DIFFICULTIES } from './data/yields';
import type { Rng } from './rng';
import type { GameState, MarketState, Player, PlayerId, PowerMarket, Unit } from './state';

type PerGood = Record<GoodId, number>;
const zero = (): PerGood => Object.fromEntries(GOOD_IDS.map((g) => [g, 0])) as PerGood;
const sign = (n: number): number => (n > 0 ? 1 : n < 0 ? -1 : 0);
const isProcessed = (g: GoodId): boolean => (MARKET_MODEL.processed as readonly GoodId[]).includes(g);
const isRaw = (g: GoodId): boolean => (MARKET_MODEL.raw as readonly GoodId[]).includes(g);

export type MarketEvent =
  | { readonly type: 'priceChanged'; readonly player: PlayerId; readonly good: GoodId; readonly bid: number; readonly rose: boolean }
  | { readonly type: 'goodsSold'; readonly player: PlayerId; readonly good: GoodId; readonly amount: number; readonly gross: number; readonly tax: number; readonly net: number }
  | { readonly type: 'goodsBought'; readonly player: PlayerId; readonly good: GoodId; readonly amount: number; readonly cost: number }
  | { readonly type: 'boycottLifted'; readonly player: PlayerId; readonly good: GoodId; readonly paid: number };

// --- reading prices ---------------------------------------------------------------------------

const power = (state: GameState, id: PlayerId): PowerMarket | undefined => state.market.powers[id];

/** What Europe pays this power per unit. */
export function bidPrice(state: GameState, player: PlayerId, good: GoodId): number {
  return Math.max(0, (power(state, player)?.price[good] ?? MARKET[good].start[0]) - 1);
}

/** What Europe charges this power per unit. */
export function askPrice(state: GameState, player: PlayerId, good: GoodId): number {
  return Math.max(0, (power(state, player)?.price[good] ?? MARKET[good].start[0]) - 1 + ASK_OVER_BID + MARKET[good].burden);
}

export function isBoycotted(state: GameState, player: PlayerId, good: GoodId): boolean {
  return state.players.find((p) => p.id === player)?.boycotts.includes(good) ?? false;
}

// --- the group equilibrium ----------------------------------------------------------------------

/** Volume that counts for a good: the shared part plus whatever each power has sold on balance. */
function totals(market: MarketState): PerGood {
  const t = zero();
  for (const g of GOOD_IDS) {
    t[g] = market.shared[g];
    for (const p of Object.values(market.powers)) t[g] += Math.max(0, p.netSold[g]);
  }
  return t;
}

/** Price at which a processed good sits level with the other three. */
function processedEquilibrium(t: PerGood, good: GoodId): number {
  let sum = 0;
  for (const g of MARKET_MODEL.processed) sum += t[g];
  return Math.trunc((MARKET_MODEL.groupFactor * Math.max(1, sum)) / Math.max(1, t[good]));
}

function rawEquilibrium(t: PerGood, good: GoodId, year: number): number {
  const vol = (g: GoodId): number => (g === 'furs' ? t[g] >> 1 : t[g]);
  let sum = 0;
  for (const g of MARKET_MODEL.raw) sum += vol(g);
  let eq = Math.trunc((MARKET_MODEL.groupFactor * Math.max(1, sum)) / Math.max(1, vol(good)));
  if (good === 'furs') for (const y of MARKET_MODEL.fursFashionYears) if (year < y) eq += 1;
  return eq;
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

// --- set-up ---------------------------------------------------------------------------------------

/** Opening market: every power starts with the same prices. */
export function createMarket(rng: Rng, players: readonly Pick<Player, 'id'>[]): MarketState {
  const shared = zero();
  const price = zero();
  for (const g of GOOD_IDS) {
    price[g] = MARKET[g].start[0] + rng.int(0, MARKET[g].start[1] - MARKET[g].start[0]);
    shared[g] = rng.int(MARKET_MODEL.sharedVolume[0], MARKET_MODEL.sharedVolume[1]);
  }
  // the four processed goods open at their group equilibrium instead of the table's start
  for (const g of MARKET_MODEL.processed) price[g] = clamp(processedEquilibrium(shared, g), MARKET[g].low, MARKET[g].high);
  const powers: Record<PlayerId, PowerMarket> = {};
  for (const p of players) powers[p.id] = { price: { ...price }, volume: zero(), netSold: zero() };
  return { shared, powers };
}

// --- evaluation -------------------------------------------------------------------------------------

/**
 * Re-evaluate one power's prices: all goods at the start of its turn, or just the good it has
 * just traded. Each good moves at most one step up and one step down per call.
 */
export function evaluateMarket(state: GameState, playerId: PlayerId, only: GoodId | null, events: MarketEvent[]): GameState {
  const player = state.players.find((p) => p.id === playerId);
  const mine = power(state, playerId);
  if (!player || !mine) return state;
  const t = totals(state.market);
  let shared = state.market.shared;
  // England's evaluations wear the shared volume down, so sales count for more as the game goes on
  if (player.nation === 'england') {
    const worn = { ...shared };
    for (const g of GOOD_IDS) worn[g] = shared[g] - (t[g] >> MARKET_MODEL.sharedDecayShift);
    shared = worn;
  }
  const price = { ...mine.price };
  const volume = { ...mine.volume };
  const { year } = dateOfTurn(state.turn);
  const ai = player.kind === 'ai';
  const d = DIFFICULTIES.indexOf(state.difficulty);
  const dutch = player.nation === 'netherlands';

  for (const g of GOOD_IDS) {
    const def = MARKET[g];
    const k = Math.trunc((def.rise + def.fall) / 2);
    if (isProcessed(g)) volume[g] += MARKET_MODEL.thresholdScale * k * sign(price[g] - processedEquilibrium(t, g));
    else if (isRaw(g)) volume[g] += k * sign(price[g] - rawEquilibrium(t, g, year));
  }

  for (const g of GOOD_IDS) {
    if (only !== null && g !== only) continue;
    const def = MARKET[g];
    let cap: number = def.high;
    if (ai && (g === 'tools' || g === 'muskets')) {
      cap += 2 * (d - 4) + Math.trunc((state.turn - 600) / 100);
      if (only === null && price[g] > cap) volume[g] += def.fall * MARKET_MODEL.thresholdScale;
    }
    const attrition = dutch && state.turn % 2 === 1 ? def.attrition * 2 : def.attrition;
    volume[g] += attrition;
    const before = price[g];
    if (volume[g] <= -def.rise * MARKET_MODEL.thresholdScale) {
      volume[g] += def.rise * MARKET_MODEL.thresholdScale;
      if (price[g] < cap) price[g] += 1;
    }
    if (volume[g] >= def.fall * MARKET_MODEL.thresholdScale) {
      volume[g] -= def.fall * MARKET_MODEL.thresholdScale;
      if (price[g] > def.low) price[g] -= 1;
    }
    if (only !== null) volume[g] -= attrition; // attrition is a once-a-turn thing
    if (ai && (g === 'muskets' || g === 'tools' || g === 'horses')) price[g] = Math.min(price[g], 3 + (((4 - d) * 3) >> 1));
    if (price[g] !== before) events.push({ type: 'priceChanged', player: playerId, good: g, bid: Math.max(0, price[g] - 1), rose: price[g] > before });
  }
  return { ...state, market: { shared, powers: { ...state.market.powers, [playerId]: { ...mine, price, volume } } } };
}

/** Record a trade of `amount` units by `trader` and let every power's traffic feel it. */
function recordTraffic(state: GameState, trader: Player, good: GoodId, amount: number, sale: boolean): GameState {
  const d = trader.kind === 'human' ? DIFFICULTIES.indexOf(state.difficulty) : 0;
  const adjust = Math.trunc((MARKET_MODEL.difficultyStepPercent * (d - MARKET_MODEL.middleDifficulty) * amount) / 100);
  const delta = (amount << MARKET[good].volatility) + adjust;
  const powers: Record<PlayerId, PowerMarket> = {};
  for (const p of state.players) {
    const m = state.market.powers[p.id];
    if (!m) continue;
    let change = sale ? delta : -delta;
    if (sale && p.nation === 'netherlands') change = Math.trunc((delta * MARKET_MODEL.dutchSaleShare[0]) / MARKET_MODEL.dutchSaleShare[1]);
    const netSold = p.id === trader.id ? { ...m.netSold, [good]: m.netSold[good] + (sale ? amount : -amount) } : m.netSold;
    powers[p.id] = { ...m, volume: { ...m.volume, [good]: m.volume[good] + change }, netSold };
  }
  return { ...state, market: { ...state.market, powers } };
}

// --- buying and selling in Europe ---------------------------------------------------------------------

export type MarketErrorCode = 'notInEurope' | 'badAmount' | 'boycotted' | 'cannotAfford' | 'noRoom' | 'notEnough' | 'notBoycotted';
export type MarketCheck = { readonly ok: true } | { readonly ok: false; readonly code: MarketErrorCode; readonly message: string };
const no = (code: MarketErrorCode, message: string): MarketCheck => ({ ok: false, code, message });

const dockedShip = (unit: Unit | undefined): unit is Unit => unit !== undefined && unit.voyage?.phase === 'inEurope' && UNIT_TYPES[unit.type].domain === 'sea';
const lotOk = (good: GoodId, amount: number): boolean => GOOD_IDS.includes(good) && Number.isInteger(amount) && amount > 0 && amount <= MARKET_MODEL.lot;
const gold = (state: GameState, id: PlayerId): number => state.players.find((p) => p.id === id)?.gold ?? 0;

export function checkBuyGoods(state: GameState, ship: Unit | undefined, good: GoodId, amount: number): MarketCheck {
  if (!dockedShip(ship)) return no('notInEurope', 'goods are bought onto a ship lying in Europe');
  if (!lotOk(good, amount)) return no('badAmount', `buy 1 to ${MARKET_MODEL.lot} of a tradeable good at a time`);
  if (isBoycotted(state, ship.owner, good)) return no('boycotted', 'that good is under boycott until the back taxes are paid');
  if (roomFor(state, ship, good) < amount) return no('noRoom', 'the holds are full');
  const cost = askPrice(state, ship.owner, good) * amount;
  return gold(state, ship.owner) >= cost ? { ok: true } : no('cannotAfford', `that would cost ${cost} gold`);
}

export function checkSellGoods(state: GameState, ship: Unit | undefined, good: GoodId, amount: number): MarketCheck {
  if (!dockedShip(ship)) return no('notInEurope', 'goods are sold from a ship lying in Europe');
  if (!lotOk(good, amount)) return no('badAmount', `sell 1 to ${MARKET_MODEL.lot} of a tradeable good at a time`);
  if (isBoycotted(state, ship.owner, good)) return no('boycotted', 'that good is under boycott until the back taxes are paid');
  return amountOf(ship.cargo, good) >= amount ? { ok: true } : no('notEnough', 'not that much aboard');
}

/** Change a treasury; any `tax` named goes to the Crown's war chest (it is already left out of `change`). */
const withGold = (state: GameState, id: PlayerId, change: number, tax = 0): GameState => ({
  ...state, players: state.players.map((p) => (p.id === id ? { ...p, gold: p.gold + change, royalMoney: p.royalMoney + tax } : p)),
});

export function buyGoods(state: GameState, ship: Unit, good: GoodId, amount: number, events: MarketEvent[]): GameState {
  const trader = state.players.find((p) => p.id === ship.owner) as Player;
  const cost = askPrice(state, trader.id, good) * amount;
  let next = withGold(state, trader.id, -cost);
  next = { ...next, units: { ...next.units, [ship.id]: { ...ship, cargo: addGoods(ship.cargo, good, amount) } } };
  events.push({ type: 'goodsBought', player: trader.id, good, amount, cost });
  return evaluateMarket(recordTraffic(next, trader, good, amount, false), trader.id, good, events);
}

/** Proceeds of selling: gross at the bid, tax on sales only (rounded down), and the rest to the treasury. */
export function saleProceeds(state: GameState, player: PlayerId, good: GoodId, amount: number): { gross: number; tax: number; net: number } {
  const rate = state.players.find((p) => p.id === player)?.taxRate ?? 0;
  const gross = bidPrice(state, player, good) * amount;
  const tax = Math.trunc((gross * rate) / 100);
  return { gross, tax, net: gross - tax };
}

export function sellGoods(state: GameState, ship: Unit, good: GoodId, amount: number, events: MarketEvent[]): GameState {
  const trader = state.players.find((p) => p.id === ship.owner) as Player;
  const sale = saleProceeds(state, trader.id, good, amount);
  let next = withGold(state, trader.id, sale.net, sale.tax);
  next = { ...next, units: { ...next.units, [ship.id]: { ...ship, cargo: addGoods(ship.cargo, good, -amount) } } };
  events.push({ type: 'goodsSold', player: trader.id, good, amount, ...sale });
  return evaluateMarket(recordTraffic(next, trader, good, amount, true), trader.id, good, events);
}

/**
 * Kit bought or sold on the docks: at the ask or the bid, with no tax either way, and the
 * traffic recorded but no price evaluation on the spot.
 */
export function dockTrade(state: GameState, playerId: PlayerId, good: GoodId, amount: number, sale: boolean): GameState {
  const trader = state.players.find((p) => p.id === playerId) as Player;
  const value = (sale ? bidPrice(state, playerId, good) : -askPrice(state, playerId, good)) * amount;
  return recordTraffic(withGold(state, playerId, value), trader, good, amount, sale);
}

/**
 * A sale made from the colonies (the Custom House): the bid, tax unless `taxed` is false, the usual
 * traffic, and no price step until the market is next looked at.
 */
export function exportSale(state: GameState, playerId: PlayerId, good: GoodId, amount: number, taxed: boolean): { state: GameState; gross: number; tax: number; net: number } {
  const trader = state.players.find((p) => p.id === playerId) as Player;
  const quote = saleProceeds(state, playerId, good, amount);
  const sale = taxed ? quote : { gross: quote.gross, tax: 0, net: quote.gross };
  return { state: recordTraffic(withGold(state, playerId, sale.net, sale.tax), trader, good, amount, true), ...sale };
}

/** Selling without a ship in Europe (Custom House, AI colonies): same traffic and the same evaluation, no cargo moved. */
export function sellDirect(state: GameState, playerId: PlayerId, good: GoodId, amount: number, events: MarketEvent[]): GameState {
  const trader = state.players.find((p) => p.id === playerId) as Player;
  return evaluateMarket(recordTraffic(state, trader, good, amount, true), playerId, good, events);
}

export function backTaxes(state: GameState, player: PlayerId, good: GoodId): number {
  return askPrice(state, player, good) * MARKET_MODEL.backTaxUnits;
}

export function checkPayBackTaxes(state: GameState, player: PlayerId, good: GoodId): MarketCheck {
  if (!isBoycotted(state, player, good)) return no('notBoycotted', 'that good is not under boycott');
  const owed = backTaxes(state, player, good);
  return gold(state, player) >= owed ? { ok: true } : no('cannotAfford', `the back taxes come to ${owed} gold`);
}

export function payBackTaxes(state: GameState, player: PlayerId, good: GoodId, events: MarketEvent[]): GameState {
  const paid = backTaxes(state, player, good);
  events.push({ type: 'boycottLifted', player, good, paid });
  return {
    ...state,
    players: state.players.map((p) => (p.id === player ? { ...p, gold: p.gold - paid, royalMoney: p.royalMoney + paid, boycotts: p.boycotts.filter((g) => g !== good) } : p)),
  };
}
