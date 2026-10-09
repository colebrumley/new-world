// The tax rate (R-401): the King's periodic changes, and the colonists' answer to a rise:
// pay up, or throw a cargo in the harbor and live with the boycott.
import { dateOfTurn } from './calendar';
import { addGoods, amountOf } from './cargo';
import { coloniesOf } from './colony';
import { isPortColony } from './construction';
import { GOOD_IDS, type GoodId } from './data/goods';
import { TAX, TAX_BANDS, type TaxReason } from './data/tax';
import { DIFFICULTIES } from './data/yields';
import { rebelSentiment } from './liberty';
import { createRng, type Rng } from './rng';
import type { Colony, GameState, PendingTax, Player, PlayerId } from './state';

export type TaxEvent =
  | { readonly type: 'taxChanged'; readonly player: PlayerId; readonly from: number; readonly to: number; readonly reason: TaxReason; readonly detail: string }
  /** The colonists may answer the rise with a party in this colony over this good. */
  | { readonly type: 'partyOffered'; readonly player: PlayerId; readonly colonyId: string; readonly good: GoodId }
  | { readonly type: 'partyHeld'; readonly player: PlayerId; readonly colonyId: string; readonly good: GoodId; readonly destroyed: number; readonly taxRate: number };

/** Turns between tax events at this date and difficulty. */
export function taxPeriod(state: GameState): number {
  const { year } = dateOfTurn(state.turn);
  let era = 0;
  for (const y of TAX.periodEraYears) if (year > y) era++;
  return (TAX.period[era] as number) - TAX.periodStepPerDifficulty * (DIFFICULTIES.indexOf(state.difficulty) - 2);
}

const ordinal = (n: number): string => {
  const tail = n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${tail}`;
};

/**
 * The good and colony a party would be held over: among goods not already boycotted that some
 * port colony holds, one picked in proportion to how much of it the power has traded, held in
 * the colony with the largest stock of it.
 */
export function partyCandidate(state: GameState, player: Player, rng: Rng): { good: GoodId; colony: Colony } | null {
  const net = state.market.powers[player.id]?.netSold;
  const ports = coloniesOf(state, player.id).filter((c) => isPortColony(state, c));
  const candidates: { good: GoodId; colony: Colony; weight: number }[] = [];
  for (const good of GOOD_IDS) {
    if (player.boycotts.includes(good)) continue;
    let best: Colony | null = null;
    for (const c of ports) if (amountOf(c.goods, good) > (best ? amountOf(best.goods, good) : 0)) best = c;
    if (!best) continue;
    let weight = Math.trunc(Math.abs(net?.[good] ?? 0) / 100);
    if (good === 'food' || good === 'tools') weight >>= 1;
    if (good === 'horses' || good === 'muskets') weight >>= 2;
    candidates.push({ good, colony: best, weight });
  }
  if (candidates.length === 0) return null;
  const total = candidates.reduce((sum, c) => sum + c.weight, 0);
  if (total === 0) return candidates[0] ?? null;
  let roll = rng.int(1, total);
  for (const c of candidates) {
    roll -= c.weight;
    if (roll <= 0) return c;
  }
  return candidates[candidates.length - 1] ?? null;
}

/** Change a power's tax rate (kept within 0..75). A rise gives a human power the chance of a party. */
export function changeTax(state: GameState, playerId: PlayerId, change: number, reason: TaxReason, detail: string, rng: Rng, events: TaxEvent[]): GameState {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return state;
  const to = Math.min(TAX.max, Math.max(0, player.taxRate + change));
  const applied = to - player.taxRate;
  if (applied === 0) return state;
  events.push({ type: 'taxChanged', player: playerId, from: player.taxRate, to, reason, detail });
  let pending: PendingTax | null = null;
  if (applied > 0 && player.kind === 'human') {
    const pick = partyCandidate(state, player, rng);
    if (pick) {
      pending = { increase: applied, good: pick.good, colonyId: pick.colony.id };
      events.push({ type: 'partyOffered', player: playerId, colonyId: pick.colony.id, good: pick.good });
    }
  }
  return { ...state, players: state.players.map((p) => (p.id === playerId ? { ...p, taxRate: to, pendingTax: pending } : p)) };
}

/** The once-in-a-while tax event for the power whose turn is beginning. Human powers only. */
export function taxEvent(state: GameState, playerId: PlayerId, events: TaxEvent[]): GameState {
  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.kind !== 'human' || player.atWar) return state;
  if (state.turn < TAX.firstTurn || coloniesOf(state, playerId).length === 0) return state;
  if (state.turn % taxPeriod(state) !== 0) return state;

  const rng = createRng(state.rng);
  // the more gold and rebels, and the lower the tax so far, the harsher the roll
  const goodwill = Math.min(100, 20 * player.fathers.length);
  const roll = rng.int(1, 1000) + Math.trunc(player.gold / 100) + 5 * (2 * goodwill - player.taxRate) + rebelSentiment(state, playerId) + Math.trunc(state.turn / 30);
  let band = TAX_BANDS.find((b) => roll < b.under) ?? TAX_BANDS[TAX_BANDS.length - 1]!;
  if (band.reason === 'wedding' && player.royalWeddings >= TAX.maxWeddings) band = TAX_BANDS[2];
  const change = rng.int(band.min, band.max);
  let next: GameState = { ...state, rng: rng.state() };
  let detail = '';
  if (band.reason === 'wedding') {
    detail = ordinal(player.royalWeddings + 1);
    next = { ...next, players: next.players.map((p) => (p.id === playerId ? { ...p, royalWeddings: p.royalWeddings + 1 } : p)) };
  } else if (band.reason === 'war' || band.reason === 'victory') {
    // never the same enemy twice running
    let enemy = rng.int(0, TAX.enemies.length - 1);
    if (band.reason === 'war' && enemy === player.lastRoyalEnemy) enemy = (enemy + 1) % TAX.enemies.length;
    detail = TAX.enemies[enemy] as string;
    next = { ...next, rng: rng.state(), players: next.players.map((p) => (p.id === playerId ? { ...p, lastRoyalEnemy: enemy } : p)) };
  }
  const changed = changeTax(next, playerId, change, band.reason, detail, rng, events);
  return { ...changed, rng: rng.state() };
}

export type TaxErrorCode = 'noTaxPending';

/** Answer a tax rise: accept it, or hold the party it provoked. */
export function answerTax(state: GameState, playerId: PlayerId, party: boolean, events: TaxEvent[]): GameState {
  const player = state.players.find((p) => p.id === playerId) as Player;
  const pending = player.pendingTax as PendingTax;
  const cleared = (extra: Partial<Player> = {}): GameState => ({
    ...state, players: state.players.map((p) => (p.id === playerId ? { ...p, pendingTax: null, ...extra } : p)),
  });
  const colony = state.colonies[pending.colonyId];
  if (!party || !colony) return cleared();
  // the rise is refused, the cargo goes into the harbor, the colony's patriots take heart, and Europe stops trading that good
  const destroyed = Math.min(TAX.partyAmount, amountOf(colony.goods, pending.good));
  const taxRate = Math.max(0, player.taxRate - pending.increase);
  const roused: Colony = {
    ...colony,
    goods: destroyed > 0 ? addGoods(colony.goods, pending.good, -destroyed) : colony.goods,
    sol: { n: Math.min(colony.sol.d, colony.sol.n + destroyed), d: colony.sol.d },
  };
  events.push({ type: 'partyHeld', player: playerId, colonyId: colony.id, good: pending.good, destroyed, taxRate });
  const next = cleared({ taxRate, boycotts: [...player.boycotts, pending.good] });
  return { ...next, colonies: { ...next.colonies, [colony.id]: roused } };
}

/** Fugger: every boycott is lifted, nothing owed. */
export function liftAllBoycotts(state: GameState, playerId: PlayerId): GameState {
  return { ...state, players: state.players.map((p) => (p.id === playerId ? { ...p, boycotts: [] } : p)) };
}
