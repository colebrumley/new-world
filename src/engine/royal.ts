// The Crown (R-406): the growing Expeditionary Force, a war in Europe with aid for the colonies,
// the offer of a frigate, mercenaries for hire, the royal cut of a treasure, the War of
// Succession, and independence granted to rival powers. Rules in docs/RULES.md "Royal events".
import { dateOfTurn } from './calendar';
import { equipmentOf } from './cargo';
import { coloniesOf } from './colony';
import { NATION_IDS, type NationId } from './data/nations';
import { ROYAL, type RefUnit } from './data/royal';
import { UNIT_TYPES, type UnitTypeId } from './data/units';
import { DIFFICULTIES } from './data/yields';
import { newDockUnit } from './europe';
import { rebelSentiment } from './liberty';
import { fullMoves } from './movement';
import { createRng } from './rng';
import type { Colony, GameState, Goods, Player, PlayerId, RefForce, RoyalOffer, Unit } from './state';
import { changeTax, type TaxEvent } from './tax';
import { sailForNewWorld, type VoyageEvent } from './voyage';

export type RoyalEvent =
  | { readonly type: 'refGrew'; readonly player: PlayerId; readonly unit: RefUnit; readonly force: RefForce }
  /** The King has gone to war with a rival's Crown, and sends help. */
  | { readonly type: 'kingDeclaredWar'; readonly player: PlayerId; readonly enemy: PlayerId; readonly gold: number; readonly soldiers: number }
  | { readonly type: 'royalOffer'; readonly player: PlayerId; readonly offer: RoyalOffer }
  | { readonly type: 'royalOfferAnswered'; readonly player: PlayerId; readonly offer: RoyalOffer; readonly accepted: boolean; readonly unitIds: readonly string[] }
  | { readonly type: 'frigateGranted'; readonly player: PlayerId; readonly unitId: string }
  /** The War of Succession ends: one power leaves the New World and another inherits what it had. */
  | { readonly type: 'succession'; readonly loser: PlayerId; readonly heir: PlayerId; readonly colonies: number; readonly units: number; readonly lost: Goods }
  | { readonly type: 'independenceTalk'; readonly player: PlayerId; readonly rebels: number; readonly rising: boolean }
  | { readonly type: 'independenceGranted'; readonly player: PlayerId };

const level = (state: GameState): number => DIFFICULTIES.indexOf(state.difficulty);
const playerOf = (state: GameState, id: PlayerId): Player | undefined => state.players.find((p) => p.id === id);
const patch = (state: GameState, id: PlayerId, change: Partial<Player>): GameState => ({ ...state, players: state.players.map((p) => (p.id === id ? { ...p, ...change } : p)) });
const isWarship = (u: Unit): boolean => UNIT_TYPES[u.type].domain === 'sea' && UNIT_TYPES[u.type].attack > 0;
const active = (p: Player): boolean => !p.withdrawn;

// --- the Expeditionary Force ---------------------------------------------------------------------

export function startingRef(difficulty: GameState['difficulty']): RefForce {
  const d = DIFFICULTIES.indexOf(difficulty);
  const of = (unit: RefUnit): number => ROYAL.refStart[unit][0] + ROYAL.refStart[unit][1] * d;
  return { regulars: of('regulars'), cavalry: of('cavalry'), artillery: of('artillery'), ships: of('ships') };
}

/** What the Crown sets aside each turn regardless of trade. */
export function royalIncome(state: GameState): number {
  const { year } = dateOfTurn(state.turn);
  let income = ROYAL.moneyBase + ROYAL.moneyPerLevel * level(state);
  for (const y of ROYAL.moneyDoublingYears) if (year >= y) income *= 2;
  return income;
}

/** Which arm the next addition goes to: kept in proportion, ships and guns taking precedence. */
export function nextRefUnit(force: RefForce): RefUnit {
  let unit: RefUnit = force.cavalry < Math.trunc((force.regulars + 2) / 3) ? 'cavalry' : 'regulars';
  if (force.artillery < Math.trunc(force.regulars / 4)) unit = 'artillery';
  if (force.ships < Math.trunc((force.regulars + force.cavalry + force.artillery + 5) / 10)) unit = 'ships';
  return unit;
}

/** Tax paid to the Crown: it leaves nothing in the treasury and goes toward the Expeditionary Force. */
export function payCrown(state: GameState, playerId: PlayerId, amount: number): GameState {
  const player = playerOf(state, playerId);
  return player && amount > 0 ? patch(state, playerId, { royalMoney: player.royalMoney + amount }) : state;
}

export function growRef(state: GameState, playerId: PlayerId, events: RoyalEvent[]): GameState {
  const player = playerOf(state, playerId);
  if (!player || player.kind !== 'human' || player.atWar) return state;
  let money = player.royalMoney + royalIncome(state);
  let force = player.ref;
  while (money >= ROYAL.unitCost) {
    money -= ROYAL.unitCost;
    const unit = nextRefUnit(force);
    force = { ...force, [unit]: force[unit] + 1 };
    events.push({ type: 'refGrew', player: playerId, unit, force });
  }
  return patch(state, playerId, { royalMoney: money, ref: force });
}

// --- war in Europe ---------------------------------------------------------------------------------

/** Rough military weight of a power: the attack values of everything it has under arms. */
export function militaryStrength(state: GameState, playerId: PlayerId): number {
  return Object.values(state.units).reduce((sum, u) => sum + (u.owner === playerId ? UNIT_TYPES[u.type].attack : 0), 0);
}

function grantUnits(state: GameState, playerId: PlayerId, type: UnitTypeId, profession: Unit['profession'], count: number, place: Colony | null): { state: GameState; ids: string[] } {
  let next = state;
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const docked = newDockUnit(next, playerId, type, profession);
    const unit: Unit = place ? { ...docked, x: place.x, y: place.y, voyage: null, orders: 'none' } : docked;
    const ready: Unit = place ? { ...unit, movesLeft: fullMoves(unit) } : unit;
    ids.push(ready.id);
    next = { ...next, nextId: next.nextId + 1, units: { ...next.units, [ready.id]: ready } };
  }
  return { state: next, ids };
}

/** The King may pick a quarrel with a rival Crown the player is at peace with, and send aid. Human powers only. */
export function kingsWar(state: GameState, playerId: PlayerId, events: RoyalEvent[]): GameState {
  const player = playerOf(state, playerId);
  if (!player || player.kind !== 'human' || player.atWar || player.fathers.includes('benjaminFranklin')) return state;
  const d = level(state);
  if ((d + 2) * state.turn < ROYAL.warMinimum) return state;
  const rivals = state.players.filter((p) => p.id !== playerId && active(p));
  const atPeace = rivals.filter((p) => player.stance[p.id] === 'peace');
  if (atPeace.length === 0 || rivals.some((p) => player.stance[p.id] === 'war')) return state;
  const rng = createRng(state.rng);
  const fires = rng.int(0, (4 - atPeace.length) * ROYAL.warRollStep) <= d;
  if (!fires) return { ...state, rng: rng.state() };
  const enemy = rng.pick(atPeace);
  const lead = militaryStrength(state, enemy.id) - militaryStrength(state, playerId);
  let soldiers = 1;
  let gold = ROYAL.warGold * (d + 1);
  if (lead > 0) {
    soldiers = (lead >> ROYAL.warSoldiersShift) + 1;
    gold += ROYAL.warGoldPerLead * lead;
  }
  soldiers = Math.min(soldiers, ROYAL.warSoldiersCap - d);
  gold = Math.min(gold, ROYAL.warGoldCap * (5 - d));
  let next: GameState = {
    ...state,
    rng: rng.state(),
    players: state.players.map((p) =>
      p.id === playerId ? { ...p, gold: p.gold + gold, stance: { ...p.stance, [enemy.id]: 'war' as const } }
      : p.id === enemy.id ? { ...p, stance: { ...p.stance, [playerId]: 'war' as const } }
      : p),
  };
  // for a time the war is the Crowns' affair and the rival will not be talked out of it
  const until = state.turn + ROYAL.kingsWarTurns;
  const blank = { grudge: false, piracy: false, intent: false, truce: 0, lastTalk: -1, kingsWarUntil: 0 };
  next = { ...next, players: next.players.map((p) => (p.id === enemy.id ? { ...p, dealings: { ...p.dealings, [playerId]: { ...(p.dealings[playerId] ?? blank), kingsWarUntil: until, lastTalk: state.turn } } } : p)) };
  next = grantUnits(next, playerId, 'soldier', 'veteranSoldier', soldiers, null).state;
  events.push({ type: 'kingDeclaredWar', player: playerId, enemy: enemy.id, gold, soldiers });
  return next;
}

// --- the King's frigate ------------------------------------------------------------------------------

function foreignShipsNear(state: GameState, colony: Colony, want: (u: Unit) => boolean): boolean {
  const r = ROYAL.threatRadius;
  return Object.values(state.units).some((u) => u.owner !== colony.owner && u.voyage === null && want(u) && Math.abs(u.x - colony.x) <= r && Math.abs(u.y - colony.y) <= r);
}

/** Are this power's colonies preyed upon badly enough for the King to offer a frigate? */
export function frigateWarranted(state: GameState, playerId: PlayerId): boolean {
  const player = playerOf(state, playerId);
  if (!player || player.atWar || state.turn % ROYAL.frigatePeriod !== 0) return false;
  if (Object.values(state.units).some((u) => u.owner === playerId && u.type === 'frigate')) return false;
  const colonies = coloniesOf(state, playerId);
  if (colonies.some((c) => foreignShipsNear(state, c, (u) => u.type === 'frigate'))) return true;
  return colonies.filter((c) => foreignShipsNear(state, c, isWarship)).length > ROYAL.frigateColonies;
}

export function sendFrigate(state: GameState, playerId: PlayerId, events: (RoyalEvent | VoyageEvent)[]): { state: GameState; id: string } {
  const made = grantUnits(state, playerId, 'frigate', null, 1, null);
  const id = made.ids[0] as string;
  events.push({ type: 'frigateGranted', player: playerId, unitId: id });
  return { state: sailForNewWorld(made.state, id, events as VoyageEvent[]), id };
}

export function frigateOffer(state: GameState, playerId: PlayerId, events: (RoyalEvent | VoyageEvent)[]): GameState {
  const player = playerOf(state, playerId);
  if (!player || player.pendingOffer || !frigateWarranted(state, playerId)) return state;
  // a computer power simply gets the ship, with no tax
  if (player.kind === 'ai') return sendFrigate(state, playerId, events).state;
  const offer: RoyalOffer = { kind: 'frigate', tax: ROYAL.frigateTax };
  events.push({ type: 'royalOffer', player: playerId, offer });
  return patch(state, playerId, { pendingOffer: offer });
}

// --- mercenaries -------------------------------------------------------------------------------------

/** Now and then a Crown at peace with the player offers a band of mercenaries, all or nothing, if the treasury can pay. */
export function mercenaryOffer(state: GameState, playerId: PlayerId, events: RoyalEvent[]): GameState {
  const player = playerOf(state, playerId);
  if (!player || player.kind !== 'human' || player.atWar || player.pendingOffer || coloniesOf(state, playerId).length === 0) return state;
  const rng = createRng(state.rng);
  const rolled: GameState = { ...state, rng: rng.state() };
  if (rng.int(0, ROYAL.mercenaryOdds - 1) !== 0) return { ...state, rng: rng.state() };
  const from: NationId = rng.pick(NATION_IDS);
  const king = state.players.find((p) => p.nation === from && active(p));
  const friendly = from === player.nation || (king !== undefined && player.stance[king.id] === 'peace');
  let dragoons = rng.int(1, 3);
  let artillery = 0;
  if (rng.int(0, 1) === 0) dragoons += 1;
  else artillery = rng.int(0, 1) === 0 ? 2 : 1;
  const price = (2 * (level(state) + ROYAL.mercenaryLevelOffset) + rng.int(0, ROYAL.mercenarySpread)) * 100 * (dragoons + ROYAL.mercenaryArtilleryWeight * artillery);
  const after: GameState = { ...rolled, rng: rng.state() };
  if (!friendly || player.gold < price) return after;
  const offer: RoyalOffer = { kind: 'mercenaries', from, dragoons, artillery, price };
  events.push({ type: 'royalOffer', player: playerId, offer });
  return patch(after, playerId, { pendingOffer: offer });
}

export type RoyalErrorCode = 'noOfferPending' | 'cannotAfford';
export type RoyalCheck = { readonly ok: true } | { readonly ok: false; readonly code: RoyalErrorCode; readonly message: string };

export function checkAnswerOffer(state: GameState, playerId: PlayerId, accept: boolean): RoyalCheck {
  const offer = playerOf(state, playerId)?.pendingOffer;
  if (!offer) return { ok: false, code: 'noOfferPending', message: 'the Crown has made no offer' };
  if (accept && offer.kind !== 'frigate' && (playerOf(state, playerId)?.gold ?? 0) < offer.price) return { ok: false, code: 'cannotAfford', message: `that costs ${offer.price} gold` };
  return { ok: true };
}

/** The colony hired soldiers are sent to: the most populous, the oldest among equals. */
function musterColony(state: GameState, playerId: PlayerId): Colony | null {
  return coloniesOf(state, playerId).reduce<Colony | null>((best, c) => (!best || c.colonists.length > best.colonists.length ? c : best), null);
}

export function answerOffer(state: GameState, playerId: PlayerId, accept: boolean, events: (RoyalEvent | TaxEvent | VoyageEvent)[]): GameState {
  const player = playerOf(state, playerId) as Player;
  const offer = player.pendingOffer as RoyalOffer;
  let next = patch(state, playerId, { pendingOffer: null });
  const ids: string[] = [];
  if (accept && offer.kind === 'frigate') {
    const sent = sendFrigate(next, playerId, events as (RoyalEvent | VoyageEvent)[]);
    ids.push(sent.id);
    const rng = createRng(sent.state.rng);
    next = changeTax(sent.state, playerId, offer.tax, 'frigate', '', rng, events as TaxEvent[]);
    next = { ...next, rng: rng.state() };
  } else if (accept && offer.kind === 'mercenaries') {
    const place = musterColony(next, playerId);
    next = patch(next, playerId, { gold: player.gold - offer.price });
    const riders = grantUnits(next, playerId, 'dragoon', 'veteranDragoon', offer.dragoons, place);
    const guns = grantUnits(riders.state, playerId, 'artillery', null, offer.artillery, place);
    ids.push(...riders.ids, ...guns.ids);
    next = guns.state;
  } else if (accept && offer.kind === 'continentals') {
    const place = musterColony(next, playerId);
    next = patch(next, playerId, { gold: player.gold - offer.price });
    const foot = grantUnits(next, playerId, 'continentalArmy', 'veteranSoldier', offer.army, place);
    const horse = grantUnits(foot.state, playerId, 'continentalCavalry', 'veteranSoldier', offer.cavalry, place);
    const guns = grantUnits(horse.state, playerId, 'artillery', null, offer.artillery, place);
    ids.push(...foot.ids, ...horse.ids, ...guns.ids);
    next = guns.state;
  }
  events.push({ type: 'royalOfferAnswered', player: playerId, offer, accepted: accept, unitIds: ids });
  return next;
}

// --- treasure ----------------------------------------------------------------------------------------

/** Percent of a treasure the Crown keeps for shipping it home. Nothing once independence is declared. */
export function royalTransportCut(state: GameState, playerId: PlayerId): number {
  const player = playerOf(state, playerId);
  if (!player || player.atWar) return 0;
  const cut = player.fathers.includes('hernanCortes') ? player.taxRate : Math.max(2 * player.taxRate, ROYAL.transportBase + ROYAL.transportStep * level(state));
  return Math.min(ROYAL.transportCap, cut);
}

export function royalTransport(state: GameState, playerId: PlayerId, value: number): { fee: number; net: number } {
  const fee = Math.trunc((value * royalTransportCut(state, playerId)) / 100);
  return { fee, net: value - fee };
}

// --- the War of Succession ---------------------------------------------------------------------------

/** How large a power looms in the New World, for deciding who is squeezed out. */
export function powerSize(state: GameState, playerId: PlayerId): number {
  const w = ROYAL.successionWeights;
  const ships = Object.values(state.units).filter((u) => u.owner === playerId && UNIT_TYPES[u.type].domain === 'sea').length;
  const colonies = coloniesOf(state, playerId);
  return w.ships * ships + w.colonies * colonies.length + w.colonists * colonies.reduce((n, c) => n + c.colonists.length, 0);
}

/**
 * Once, when the lone human power's rebel sentiment first reaches half (or `force`d at the
 * Declaration), the smallest computer power is absorbed by the next smallest and leaves the game.
 */
export function succession(state: GameState, playerId: PlayerId, events: RoyalEvent[], force = false): GameState {
  const player = playerOf(state, playerId);
  if (!player || player.kind !== 'human' || state.succession) return state;
  if (state.players.filter((p) => p.kind === 'human').length !== 1) return state;
  if (!force && rebelSentiment(state, playerId) < ROYAL.successionSentiment) return state;
  const ranked = state.players.filter((p) => p.kind === 'ai' && active(p)).map((p) => ({ p, size: powerSize(state, p.id) })).sort((a, b) => a.size - b.size);
  const loser = ranked[0]?.p;
  const heir = ranked[1]?.p;
  if (!loser || !heir) return state;
  const loserIndex = state.players.indexOf(loser);
  const heirIndex = state.players.indexOf(heir);
  const colonies: Record<string, Colony> = {};
  let moved = 0;
  for (const c of Object.values(state.colonies)) {
    if (c.owner === loser.id) moved++;
    colonies[c.id] = c.owner === loser.id ? { ...c, owner: heir.id, sol: { n: 0, d: c.sol.d }, solLevel: 0, toryNoticed: false, exports: [] } : c;
  }
  const units: Record<string, Unit> = {};
  let marched = 0;
  const lost: Record<string, number> = {};
  for (const u of Object.values(state.units)) {
    if (u.owner !== loser.id) units[u.id] = u;
    else if (u.voyage !== null) {
      for (const goods of [equipmentOf(u), u.cargo]) for (const [good, amount] of Object.entries(goods)) lost[good] = (lost[good] ?? 0) + (amount ?? 0);
    } else {
      // those in Europe or on the ocean are simply gone
      units[u.id] = { ...u, owner: heir.id, route: null };
      marched++;
    }
  }
  const tiles = state.map.tiles.map((t) => {
    const seen = t.explored & (1 << loserIndex) ? t.explored | (1 << heirIndex) : t.explored;
    const claim = t.claim === loser.id ? heir.id : t.claim;
    return seen === t.explored && claim === t.claim ? t : { ...t, explored: seen, claim };
  });
  const tradeRoutes = Object.fromEntries(Object.entries(state.tradeRoutes).filter(([, r]) => r.owner !== loser.id));
  events.push({ type: 'succession', loser: loser.id, heir: heir.id, colonies: moved, units: marched, lost: lost as Goods });
  return {
    ...state, colonies, units, tradeRoutes, map: { ...state.map, tiles },
    succession: { loser: loser.id, heir: heir.id },
    players: state.players.map((p) => (p.id === loser.id ? { ...p, withdrawn: true, pendingTax: null, pendingOffer: null, immigrantDue: false } : p)),
  };
}

// --- independence for the others --------------------------------------------------------------------

/** A computer power whose colonies are rebellious enough is let go by its Crown, with talk of it beforehand. */
export function foreignIndependence(state: GameState, playerId: PlayerId, events: RoyalEvent[]): GameState {
  const player = playerOf(state, playerId);
  if (!player || player.kind !== 'ai' || !active(player) || player.independent) return state;
  if (state.players.some((p) => p.kind === 'human' && p.atWar)) return state;
  const people = coloniesOf(state, playerId).reduce((n, c) => n + c.colonists.length, 0);
  const rebels = Math.min(100, Math.trunc((rebelSentiment(state, playerId) * people) / 100));
  const mark = ROYAL.independenceStep * (ROYAL.independenceLevels - level(state));
  if (rebels >= mark) {
    events.push({ type: 'independenceGranted', player: playerId });
    return patch(state, playerId, { independent: true, independenceTalk: rebels });
  }
  if (rebels >= mark - ROYAL.independenceNear && rebels > player.independenceTalk) {
    events.push({ type: 'independenceTalk', player: playerId, rebels, rising: true });
    return patch(state, playerId, { independenceTalk: rebels });
  }
  if (player.independenceTalk > 0 && rebels < player.independenceTalk - ROYAL.independenceDrop) {
    events.push({ type: 'independenceTalk', player: playerId, rebels, rising: false });
    return patch(state, playerId, { independenceTalk: rebels });
  }
  return state;
}

// --- the turn ----------------------------------------------------------------------------------------

/** Everything the Crown does at the start of one power's turn. `taxed` says a tax event has just happened. */
export function royalTurn(state: GameState, playerId: PlayerId, taxed: boolean, events: (RoyalEvent | VoyageEvent)[]): GameState {
  const player = playerOf(state, playerId);
  if (!player || !active(player)) return state;
  let next = taxed ? state : kingsWar(state, playerId, events as RoyalEvent[]);
  next = frigateOffer(next, playerId, events);
  next = mercenaryOffer(next, playerId, events as RoyalEvent[]);
  next = growRef(next, playerId, events as RoyalEvent[]);
  next = succession(next, playerId, events as RoyalEvent[]);
  return foreignIndependence(next, playerId, events as RoyalEvent[]);
}
