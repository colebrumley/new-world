// The action pipeline: every change to a GameState goes through applyAction (R-003).
import {
  addGoods, checkEquip, checkLoad, checkTransfer, checkUnload, equip, loadCargo, mostValuableLoad, transferCargo, unloadCargo,
  type CargoErrorCode,
} from './cargo';
import { buyConstruction, checkBuy, checkSetConstruction, type ConstructionErrorCode, type ConstructionEvent } from './construction';
import {
  boardInEurope, checkBoard, checkDockEquip, checkEuropeOpen, checkLand, dockEquip, checkPurchase, checkTrain, docksOf, embarkWaiting, landInEurope, purchaseUnit, trainUnit,
  type EuropeErrorCode, type EuropeEvent,
} from './europe';
import { COLONIST_ROLES, ROLE_GOODS, type ColonistRole } from './data/equipment';
import { nativesTurn, type AlarmEvent } from './alarm';
import type { FatherId } from './data/fathers';
import {
  audienceReply, checkAudienceReply, checkHoldAudience, checkSellAbroad, contactSweep, diplomacyTurn, holdAudience, meetMayor, sellAbroad, settleAudiences,
  type AudienceReply, type DiplomacyErrorCode, type DiplomacyEvent,
} from './diplomacy';
import { crownMoves, interventionArrives, noteRefBeaten, wartimeHire, warOutcome, warWarning, type WarEvent } from './war';
import { checkDeclare, crownTurn, declareIndependence, musterContinentals, type IndependenceErrorCode, type IndependenceEvent } from './independence';
import { checkChooseFather, chooseFather, coronadoSees, type CongressErrorCode, type CongressEvent } from './congress';
import { attackColony, checkAttackColony, checkInfiltrate, infiltrate, isBesieged, type AssaultErrorCode, type AssaultEvent } from './assault';
import { checkNavalAttack, fortFire, navalAttack, patrolAndForts, type NavalErrorCode, type NavalEvent } from './naval';
import { repairShips, type ShipEvent } from './ships';
import { attackUnit, checkAttackUnit, type BattleErrorCode, type BattleEvent } from './battle';
import { createRng } from './rng';
import { acquireLand, checkAcquireLand, unpaidImprovement, type LandErrorCode, type LandEvent } from './land';
import { convertsDrift, type MissionEvent } from './missions';
import { bravesTurn, type NativeAiEvent } from './native-ai';
import { answerDemand, attackNatives, checkAnswerDemand, checkAttackNatives, clearVisits, type NativeWarErrorCode, type NativeWarEvent } from './native-war';
import { answerParley, checkParley, fadeTradeMemory, type NativeTradeEvent, type ParleyReply } from './native-trade';
import type { TribeId } from './data/tribes';
import { VILLAGE_ACTIONS, type VillageAction } from './data/village';
import { answerTreaty, checkAnswerTreaty, checkVillageAction, contactAt, villageAction, type VillageErrorCode, type VillageEvent } from './village';
import { answerBurial, canExplore, checkAnswerBurial, checkFountainPick, drinkFountain, exploreRumor, fountainPick, type RumorErrorCode, type RumorEvent } from './rumors';
import { answerOffer, checkAnswerOffer, royalTurn, type RoyalErrorCode, type RoyalEvent } from './royal';
import { checkSetExport, setExport, type CustomHouseErrorCode, type CustomHouseEvent } from './custom-house';
import { colonyTurn, type EconomyEvent } from './economy';
import { arriveByLot, checkChooseImmigrant, checkRecruit, chooseImmigrant, immigrationTurn, recruit, type ImmigrationEvent } from './immigration';
import { SPECIALISTS, type ProfessionId } from './data/professions';
import { UNIT_TYPES, type UnitTypeId } from './data/units';
import { GOOD_IDS, type GoodId } from './data/goods';
import { assignJob, checkAssign, type JobErrorCode } from './jobs';
import { heldByBlockade } from './computer';
import { EUROPE_BOUND, advanceGoto, boundForEurope, executeMove, isShipUnit, laneFor, planMove, sailWatched, turnMoves, routeFor, type MoveChoices, type MoveErrorCode, type MoveEvent } from './movement';
import {
  bidPrice, buyGoods, checkBuyGoods, checkPayBackTaxes, checkSellGoods, evaluateMarket, payBackTaxes, sellGoods,
  type MarketErrorCode, type MarketEvent,
} from './market';
import { checkPioneerOrder, warehouseCapacity, workJob, type PioneerErrorCode, type PioneerEvent, type PioneerJob } from './pioneer';
import { answerTax, taxEvent, type TaxErrorCode, type TaxEvent } from './tax';
import { checkCreate, checkRouteAssign, checkStops, defaultRouteName, runTradeRoute, type TradeRouteErrorCode, type TradeRouteEvent } from './trade-routes';
import { advanceVoyages, reverseVoyage, sailForEurope, sailForNewWorld, type VoyageEvent } from './voyage';
import { CALENDAR, dateOfTurn } from './calendar';
import {
  abandonColony, checkAbandon, checkFound, checkJoin, checkLeave, checkName, foundColony, joinColony, leaveColony, nextColonyName,
  type ColonyErrorCode, type ColonyEvent,
} from './colony';
import { colonyAt, currentPlayer, tileAt, type BuildItem, type Colony, type ColonyId, type GameOverReason, type Job, type RouteStop, type TradeRoute, type GameState, type PlayerId, type Unit, type UnitId } from './state';

export type Action =
  /** One step. `landfall` answers "make landfall?" and `sail` answers "sail for Europe?" when the move raises them. */
  | { readonly type: 'moveUnit'; readonly unitId: UnitId; readonly dx: number; readonly dy: number; readonly landfall?: boolean; readonly sail?: boolean }
  /** Buy up to 100 of a good onto a ship lying in Europe, at the ask price. */
  | { readonly type: 'buyGoods'; readonly unitId: UnitId; readonly good: GoodId; readonly amount: number }
  /** Sell up to 100 of a good from a ship lying in Europe, at the bid price less tax. */
  | { readonly type: 'sellGoods'; readonly unitId: UnitId; readonly good: GoodId; readonly amount: number }
  /** Answer a tax rise: accept it, or throw the named cargo in the harbor. */
  | { readonly type: 'answerTax'; readonly party: boolean }
  /** Pay what is owed on a boycotted good to trade it again. */
  | { readonly type: 'payBackTaxes'; readonly good: GoodId }
  /** Royal University: pay for a specialist, who appears on the docks. */
  | { readonly type: 'trainUnit'; readonly profession: ProfessionId }
  /** Buy a ship or artillery in Europe. */
  | { readonly type: 'purchaseUnit'; readonly unit: UnitTypeId }
  /** Pay the passage of one of the three in the immigrant pool. */
  | { readonly type: 'recruit'; readonly slot: number }
  /** Take or decline what the Crown has offered (a frigate for a tax, mercenaries for gold). */
  | { readonly type: 'answerOffer'; readonly accept: boolean }
  /** Send a unit standing beside a native settlement in to do something there. */
  | { readonly type: 'enterSettlement'; readonly unitId: UnitId; readonly settlementId: string; readonly action: VillageAction; readonly target?: PlayerId; readonly good?: GoodId }
  /** Answer a native settlement in trade talks: take its price, haggle, give the cargo away, or leave. When buying, name the good. */
  | { readonly type: 'parley'; readonly reply: ParleyReply; readonly good?: GoodId }
  /** Attack what stands on a neighbouring square: natives, a native settlement, or another power's units in the open. */
  | { readonly type: 'attack'; readonly unitId: UnitId; readonly dx: number; readonly dy: number }
  /** Send a scout into the foreign colony on a neighbouring square to look it over. */
  | { readonly type: 'infiltrateColony'; readonly unitId: UnitId; readonly dx: number; readonly dy: number }
  /** Meet or refuse what a brave at one of our colonies is asking for. */
  | { readonly type: 'answerDemand'; readonly index: number; readonly give: boolean }
  /** Search the burial mounds a party has found, or leave them undisturbed. */
  | { readonly type: 'answerBurial'; readonly search: boolean }
  /** Buy a tile of native land at the tribe's price, or take it. */
  | { readonly type: 'acquireLand'; readonly x: number; readonly y: number; readonly pay: boolean }
  /** Name the Founding Father the Congress shall work toward, from those it has put forward. */
  | { readonly type: 'chooseFather'; readonly father: FatherId }
  /** Receive the envoy of a power that has asked to speak with us. */
  | { readonly type: 'holdAudience'; readonly with: PlayerId }
  /** Answer the question put in the audience under way. Hiring them against someone needs a `target` (a player id or `tribe:<id>`). */
  | { readonly type: 'audienceReply'; readonly reply: AudienceReply; readonly target?: string }
  /** A scout presents himself to the mayor of the foreign colony on a neighbouring square. */
  | { readonly type: 'meetMayor'; readonly unitId: UnitId; readonly dx: number; readonly dy: number }
  /** Sell one cargo to the foreign colony a ship or wagon train lies beside (needs a treaty and de Witt). */
  | { readonly type: 'sellAbroad'; readonly unitId: UnitId; readonly colonyId: ColonyId; readonly good: GoodId }
  /** Accept or refuse the treaty a newly met tribe proposes. */
  | { readonly type: 'answerTreaty'; readonly tribe: TribeId; readonly accept: boolean }
  /** Say which of the three comes over, when crosses have earned the choice (Brewster). */
  | { readonly type: 'chooseImmigrant'; readonly slot: number }
  /** Fit out someone on the docks, buying or selling the kit at market prices. */
  | { readonly type: 'equipInEurope'; readonly unitId: UnitId; readonly role: ColonistRole }
  /** Someone on the docks goes aboard a ship in port. */
  | { readonly type: 'boardInEurope'; readonly unitId: UnitId; readonly shipId: UnitId }
  /** Someone aboard a ship in port steps back onto the docks. */
  | { readonly type: 'landInEurope'; readonly unitId: UnitId }
  /** Whether someone on the docks boards the next ship to sail. */
  | { readonly type: 'setBoarding'; readonly unitId: UnitId; readonly board: boolean }
  /** A ship lying in Europe puts to sea for the New World. */
  | { readonly type: 'sailFromEurope'; readonly unitId: UnitId }
  /** Turn a ship around in mid-ocean. */
  | { readonly type: 'reverseVoyage'; readonly unitId: UnitId }
  /** Sentry, Fortify, or clear orders (Activate). */
  | { readonly type: 'setOrders'; readonly unitId: UnitId; readonly orders: 'none' | 'sentry' | 'fortify' }
  /** Go To: head for a square over as many turns as it takes. */
  | { readonly type: 'goTo'; readonly unitId: UnitId; readonly x: number; readonly y: number }
  /** Go To Europe: a ship makes for the nearest Sea Lane and sets sail from it. */
  | { readonly type: 'goToEurope'; readonly unitId: UnitId }
  /** B on open land: found a colony where the unit stands. The name defaults to the next on the nation's list. */
  | { readonly type: 'foundColony'; readonly unitId: UnitId; readonly name?: string }
  /** B inside one of your colonies: the unit moves in and takes up work. */
  | { readonly type: 'joinColony'; readonly unitId: UnitId }
  /** Someone aboard a ship or wagon train lying in one of our colonies steps ashore there. */
  | { readonly type: 'goAshore'; readonly unitId: UnitId }
  /** A colonist steps outside the colony and becomes a unit again. */
  | { readonly type: 'leaveColony'; readonly colonyId: ColonyId; readonly colonistId: UnitId }
  /** Give a colony up for good. */
  | { readonly type: 'abandonColony'; readonly colonyId: ColonyId }
  | { readonly type: 'renameColony'; readonly colonyId: ColonyId; readonly name: string }
  /** Tell the Custom House to export a good, or to stop. */
  | { readonly type: 'setExport'; readonly colonyId: ColonyId; readonly good: GoodId; readonly on: boolean }
  | { readonly type: 'createTradeRoute'; readonly kind: 'land' | 'sea'; readonly stops: readonly RouteStop[]; readonly name?: string }
  | { readonly type: 'editTradeRoute'; readonly routeId: string; readonly stops: readonly RouteStop[]; readonly name?: string }
  | { readonly type: 'deleteTradeRoute'; readonly routeId: string }
  /** T: put a ship or wagon train on a route, making first for the given stop. */
  | { readonly type: 'assignTradeRoute'; readonly unitId: UnitId; readonly routeId: string; readonly stop?: number }
  /** Choose what the colony builds next (null for nothing). Hammers already put by are kept. */
  | { readonly type: 'setConstruction'; readonly colonyId: ColonyId; readonly item: BuildItem | null }
  /** Pay gold to finish the current project. */
  | { readonly type: 'buyConstruction'; readonly colonyId: ColonyId }
  /** Put a colonist to work on a square, or take them off work. */
  | { readonly type: 'assignJob'; readonly colonyId: ColonyId; readonly colonistId: UnitId; readonly job: Job }
  /** Clear Specialty: an expert becomes an ordinary free colonist. */
  | { readonly type: 'clearSpecialty'; readonly colonyId: ColonyId; readonly colonistId: UnitId }
  /** Pioneer: clear forest or plow (P), or build a road (R), on the square it stands on. */
  | { readonly type: 'pioneerWork'; readonly unitId: UnitId; readonly job: PioneerJob }
  /** Skip: give up the rest of this unit's turn. */
  | { readonly type: 'skipUnit'; readonly unitId: UnitId }
  | { readonly type: 'disbandUnit'; readonly unitId: UnitId }
  /** Warehouse to carrier, in the colony the carrier stands in. */
  | { readonly type: 'loadCargo'; readonly unitId: UnitId; readonly good: GoodId; readonly amount: number }
  /** Carrier to warehouse. */
  | { readonly type: 'unloadCargo'; readonly unitId: UnitId; readonly good: GoodId; readonly amount: number }
  /** Throw cargo away, anywhere. */
  | { readonly type: 'dumpCargo'; readonly unitId: UnitId; readonly good: GoodId; readonly amount: number }
  /** Carrier to carrier inside one colony. */
  | { readonly type: 'transferCargo'; readonly unitId: UnitId; readonly toId: UnitId; readonly good: GoodId; readonly amount: number }
  /** One hold of whatever in the warehouse is worth most (never horses, tools or muskets). */
  | { readonly type: 'loadMostValuable'; readonly unitId: UnitId }
  /** Change a colonist's role, exchanging kit with the warehouse. */
  | { readonly type: 'equip'; readonly unitId: UnitId; readonly role: ColonistRole }
  /** Give up the Viceroy's office now; the game is scored and ends. */
  | { readonly type: 'retire' }
  /** After the calendar has ended and scored the game: play on, unscored. */
  | { readonly type: 'continuePlaying' }
  /** Irrevocable; it ends the turn. */
  | { readonly type: 'declareIndependence' }
  | { readonly type: 'endTurn' };

/** Everything the UI may need to react to. Later phases add combat, arrivals, elections, etc. */
export type GameEvent =
  | MoveEvent
  | WarEvent
  | IndependenceEvent
  | TaxEvent
  | MarketEvent
  | DiplomacyEvent
  | NavalEvent
  | AssaultEvent
  | ShipEvent
  | LandEvent
  | RumorEvent
  | NativeAiEvent
  | NativeWarEvent
  | VillageEvent
  | AlarmEvent
  | RoyalEvent
  | ImmigrationEvent
  | EuropeEvent
  | TradeRouteEvent
  | { readonly type: 'tradeRouteChanged'; readonly routeId: string; readonly change: 'created' | 'edited' | 'deleted' }
  | EconomyEvent
  | ColonyEvent
  | VoyageEvent
  | PioneerEvent
  | { readonly type: 'ordersChanged'; readonly unitId: UnitId; readonly orders: Unit['orders'] }
  /** Unloading left more of a good in the colony than its warehouse will keep past the end of the turn. */
  | { readonly type: 'warehouseFull'; readonly colonyId: ColonyId; readonly good: GoodId; readonly amount: number; readonly capacity: number }
  | { readonly type: 'cargoMoved'; readonly good: GoodId; readonly amount: number; readonly from: string; readonly to: string }
  | { readonly type: 'unitEquipped'; readonly unitId: UnitId; readonly role: ColonistRole }
  | { readonly type: 'unitDisbanded'; readonly unitId: UnitId; readonly owner: PlayerId }
  | { readonly type: 'playerTurnStarted'; readonly player: PlayerId; readonly turn: number }
  | { readonly type: 'turnAdvanced'; readonly turn: number }
  | { readonly type: 'gameEnded'; readonly reason: GameOverReason; readonly player: PlayerId; readonly turn: number; readonly year: number };

export type ActionErrorCode = 'gameOver' | 'notAboard' | IndependenceErrorCode | DiplomacyErrorCode | CongressErrorCode | NavalErrorCode | 'underRepair' | AssaultErrorCode | BattleErrorCode | LandErrorCode | RumorErrorCode | NativeWarErrorCode | VillageErrorCode | RoyalErrorCode | CustomHouseErrorCode | TaxErrorCode | MarketErrorCode | EuropeErrorCode | TradeRouteErrorCode | 'notYourColony' | ConstructionErrorCode | MoveErrorCode | ColonyErrorCode | JobErrorCode | CargoErrorCode | PioneerErrorCode | 'atSea' | 'notInEurope' | 'notAtSea' | 'unknownAction' | 'noSuchUnit' | 'notYourUnit' | 'noPath' | 'badOrders';

export interface ActionError {
  readonly code: ActionErrorCode;
  readonly message: string;
}

export type Validation = { readonly ok: true } | { readonly ok: false; readonly error: ActionError };

export interface ActionResult {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}

export class InvalidActionError extends Error {
  readonly code: ActionErrorCode;
  constructor(error: ActionError) {
    super(error.message);
    this.name = 'InvalidActionError';
    this.code = error.code;
  }
}

const OK: Validation = { ok: true };
const fail = (code: ActionErrorCode, message: string): Validation => ({ ok: false, error: { code, message } });

function ownUnit(state: GameState, unitId: UnitId): Unit | Validation {
  const unit = state.units[unitId];
  if (!unit) return fail('noSuchUnit', `no unit ${unitId}`);
  if (unit.owner !== currentPlayer(state).id) return fail('notYourUnit', `unit ${unitId} belongs to ${unit.owner}`);
  return unit;
}

function choicesOf(action: { readonly landfall?: boolean; readonly sail?: boolean }): MoveChoices {
  return {
    ...(action.landfall === undefined ? {} : { landfall: action.landfall }),
    ...(action.sail === undefined ? {} : { sail: action.sail }),
  };
}

const isValidation = (v: Unit | Validation): v is Validation => 'ok' in v;

/** Like ownUnit, but the unit must also be on the map (not crossing the ocean or in Europe). */
function ownUnitOnMap(state: GameState, unitId: UnitId): Unit | Validation {
  const unit = ownUnit(state, unitId);
  if (isValidation(unit)) return unit;
  return unit.voyage ? fail('atSea', `unit ${unitId} is away on a voyage`) : unit;
}

export function validateAction(state: GameState, action: Action): Validation {
  if (action.type === 'continuePlaying') {
    return state.over && (state.over.reason === 'retired' || state.over.reason === 'warLost') ? OK : fail('gameOver', 'there is nothing to continue');
  }
  if (state.over) return fail('gameOver', 'the game has ended');
  switch (action.type) {
    case 'moveUnit': {
      const unit = ownUnitOnMap(state, action.unitId);
      if (isValidation(unit)) return unit;
      if (unit.repair > 0) return fail('underRepair', `the ship needs ${unit.repair} more turns of repair`);
      const check = planMove(state, unit, action.dx, action.dy, choicesOf(action));
      if (check.ok && check.plan.kind === 'europe') {
        const open = checkEuropeOpen(state, unit.owner);
        if (!open.ok) return fail(open.code, open.message);
      }
      return check.ok ? OK : fail(check.code, check.message);
    }
    case 'retire':
      return OK;
    case 'declareIndependence': {
      const check = checkDeclare(state, currentPlayer(state).id);
      return check.ok ? OK : fail(check.code, check.message);
    }
    case 'buyGoods':
    case 'sellGoods': {
      const unit = ownUnit(state, action.unitId);
      if (isValidation(unit)) return unit;
      const open = checkEuropeOpen(state, unit.owner);
      if (!open.ok) return fail(open.code, open.message);
      const check = (action.type === 'buyGoods' ? checkBuyGoods : checkSellGoods)(state, unit, action.good, action.amount);
      return check.ok ? OK : fail(check.code, check.message);
    }
    case 'answerTax':
      return currentPlayer(state).pendingTax ? OK : fail('noTaxPending', 'there is no tax rise to answer');
    case 'enterSettlement': {
      const unit = ownUnitOnMap(state, action.unitId);
      if (isValidation(unit)) return unit;
      const check = checkVillageAction(state, unit, action.settlementId, action.action, action.target, action.good);
      return check.ok ? OK : fail(check.code, check.message);
    }
    case 'attack': {
      const unit = ownUnitOnMap(state, action.unitId);
      if (isValidation(unit)) return unit;
      if (UNIT_TYPES[unit.type].domain === 'sea') {
        const sea = checkNavalAttack(state, unit, action.dx, action.dy);
        return sea.ok ? OK : fail(sea.code, sea.message);
      }
      const natives = checkAttackNatives(state, unit, action.dx, action.dy);
      if (natives.ok) return OK;
      const town = colonyAt(state, unit.x + action.dx, unit.y + action.dy);
      if (town && town.owner !== unit.owner) {
        const assault = checkAttackColony(state, unit, action.dx, action.dy);
        return assault.ok ? OK : fail(assault.code, assault.message);
      }
      const check = checkAttackUnit(state, unit, action.dx, action.dy);
      return check.ok ? OK : natives.code === 'noTarget' ? fail(check.code, check.message) : fail(natives.code, natives.message);
    }
    case 'holdAudience': {
      const check = checkHoldAudience(state, currentPlayer(state).id, action.with);
      return check.ok ? OK : fail(check.code, check.message);
    }
    case 'audienceReply': {
      const check = checkAudienceReply(state, currentPlayer(state).id, action.reply, action.target);
      return check.ok ? OK : fail(check.code, check.message);
    }
    case 'meetMayor': {
      const unit = ownUnitOnMap(state, action.unitId);
      if (isValidation(unit)) return unit;
      const town = colonyAt(state, unit.x + action.dx, unit.y + action.dy);
      if (unit.type !== 'scout' || !town || town.owner === unit.owner || Math.max(Math.abs(action.dx), Math.abs(action.dy)) !== 1) return fail('noTarget', 'a scout must stand beside a foreign colony');
      if (currentPlayer(state).atWar) return fail('noAudience', 'no mayor will receive us while we fight for independence');
      if (state.audience) return fail('badReply', 'an audience is already under way');
      return state.players.find((p) => p.id === town.owner)?.kind === 'ai' ? OK : fail('noTarget', 'there is nobody there to receive us');
    }
    case 'sellAbroad': {
      const unit = ownUnitOnMap(state, action.unitId);
      if (isValidation(unit)) return unit;
      const check = checkSellAbroad(state, unit, state.colonies[action.colonyId] ?? null, action.good);
      return check.ok ? OK : fail(check.code, check.message);
    }
    case 'chooseFather': {
      const check = checkChooseFather(state, currentPlayer(state).id, action.father);
      return check.ok ? OK : fail(check.code, check.message);
    }
    case 'acquireLand': {
      const check = checkAcquireLand(state, currentPlayer(state).id, action.x, action.y, action.pay);
      return check.ok ? OK : fail(check.code, check.message);
    }
    case 'answerBurial': {
      const check = checkAnswerBurial(state, currentPlayer(state).id);
      return check.ok ? OK : fail(check.code, check.message);
    }
    case 'infiltrateColony': {
      const unit = ownUnitOnMap(state, action.unitId);
      if (isValidation(unit)) return unit;
      const check = checkInfiltrate(state, unit, action.dx, action.dy);
      return check.ok ? OK : fail(check.code, check.message);
    }
    case 'answerDemand': {
      const check = checkAnswerDemand(state, currentPlayer(state).id, action.index);
      return check.ok ? OK : fail(check.code, check.message);
    }
    case 'parley': {
      const check = checkParley(state, currentPlayer(state).id, action.reply, action.good);
      return check.ok ? OK : fail(check.code, check.message);
    }
    case 'answerTreaty': {
      const check = checkAnswerTreaty(state, currentPlayer(state).id, action.tribe);
      return check.ok ? OK : fail(check.code, check.message);
    }
    case 'answerOffer': {
      const check = checkAnswerOffer(state, currentPlayer(state).id, action.accept);
      return check.ok ? OK : fail(check.code, check.message);
    }
    case 'payBackTaxes': {
      const check = checkPayBackTaxes(state, currentPlayer(state).id, action.good);
      return check.ok ? OK : fail(check.code, check.message);
    }
    case 'trainUnit': {
      const check = checkTrain(state, currentPlayer(state).id, action.profession);
      return check.ok ? OK : fail(check.code, check.message);
    }
    case 'chooseImmigrant': {
      const me = currentPlayer(state);
      if (!me.immigrantDue && me.fountain > 0) {
        const drawn = checkFountainPick(state, me.id, action.slot);
        return drawn.ok ? OK : fail(drawn.code, drawn.message);
      }
      const check = checkChooseImmigrant(state, me.id, action.slot);
      return check.ok ? OK : fail(check.code, check.message);
    }
    case 'recruit': {
      const check = checkRecruit(state, currentPlayer(state).id, action.slot);
      return check.ok ? OK : fail(check.code, check.message);
    }
    case 'purchaseUnit': {
      const check = checkPurchase(state, currentPlayer(state).id, action.unit);
      return check.ok ? OK : fail(check.code, check.message);
    }
    case 'equipInEurope': {
      const unit = ownUnit(state, action.unitId);
      if (isValidation(unit)) return unit;
      if (!COLONIST_ROLES.includes(action.role)) return fail('cannotEquip', 'unknown role');
      const check = checkDockEquip(state, unit, action.role);
      return check.ok ? OK : fail(check.code, check.message);
    }
    case 'boardInEurope': {
      const unit = ownUnit(state, action.unitId);
      if (isValidation(unit)) return unit;
      const check = checkBoard(state, unit, state.units[action.shipId]);
      return check.ok ? OK : fail(check.code, check.message);
    }
    case 'landInEurope': {
      const unit = ownUnit(state, action.unitId);
      if (isValidation(unit)) return unit;
      const check = checkLand(unit);
      return check.ok ? OK : fail(check.code, check.message);
    }
    case 'setBoarding': {
      const unit = ownUnit(state, action.unitId);
      if (isValidation(unit)) return unit;
      return docksOf(state, unit.owner).some((u) => u.id === unit.id) ? OK : fail('notOnDocks', 'only someone waiting on the docks');
    }
    case 'sailFromEurope': {
      const unit = ownUnit(state, action.unitId);
      if (isValidation(unit)) return unit;
      if (unit.voyage?.phase !== 'inEurope' || unit.aboard !== null || UNIT_TYPES[unit.type].domain !== 'sea') return fail('notInEurope', 'only a ship lying in Europe can sail from it');
      if (unit.repair > 0) return fail('underRepair', `the ship needs ${unit.repair} more turns of repair`);
      return OK;
    }
    case 'reverseVoyage': {
      const unit = ownUnit(state, action.unitId);
      if (isValidation(unit)) return unit;
      if (!unit.voyage || unit.voyage.phase === 'inEurope' || unit.aboard !== null) return fail('notAtSea', 'only a ship in mid-ocean can turn back');
      return OK;
    }
    case 'setOrders': {
      const unit = ownUnitOnMap(state, action.unitId);
      if (isValidation(unit)) return unit;
      if (action.orders !== 'none' && action.orders !== 'sentry' && action.orders !== 'fortify') return fail('badOrders', 'unknown orders');
      return OK;
    }
    case 'foundColony': {
      const unit = ownUnitOnMap(state, action.unitId);
      if (isValidation(unit)) return unit;
      const check = checkFound(state, unit);
      if (!check.ok) return fail(check.code, check.message);
      if (action.name === undefined) return OK;
      const named = checkName(state, action.name);
      return named.ok ? OK : fail(named.code, named.message);
    }
    case 'joinColony': {
      const unit = ownUnitOnMap(state, action.unitId);
      if (isValidation(unit)) return unit;
      const check = checkJoin(state, unit);
      return check.ok ? OK : fail(check.code, check.message);
    }
    case 'goAshore': {
      const unit = ownUnitOnMap(state, action.unitId);
      if (isValidation(unit)) return unit;
      if (unit.aboard === null) return fail('notAboard', 'that unit is not aboard anything');
      return colonyAt(state, unit.x, unit.y)?.owner === unit.owner ? OK : fail('noColonyHere', 'there is no colony of ours here');
    }
    case 'leaveColony':
    case 'abandonColony':
    case 'renameColony': {
      const colony = state.colonies[action.colonyId];
      if (colony && colony.owner !== currentPlayer(state).id) return fail('notYourColony', `${colony.name} is not yours`);
      const check =
        action.type === 'leaveColony' ? checkLeaveUnderSiege(state, colony, action.colonistId)
        : action.type === 'abandonColony' ? checkAbandon(colony)
        : colony ? checkName(state, action.name, colony.id) : checkAbandon(colony);
      return check.ok ? OK : fail(check.code, check.message);
    }
    case 'setExport': {
      const colony = state.colonies[action.colonyId];
      if (colony && colony.owner !== currentPlayer(state).id) return fail('notYourColony', `${colony.name} is not yours`);
      const check = checkSetExport(colony, action.good);
      return check.ok ? OK : fail(check.code, check.message);
    }
    case 'createTradeRoute': {
      const check = checkCreate(state, currentPlayer(state).id, action.kind, action.stops, action.name);
      return check.ok ? OK : fail(check.code, check.message);
    }
    case 'editTradeRoute':
    case 'deleteTradeRoute': {
      const route = state.tradeRoutes[action.routeId];
      if (!route || route.owner !== currentPlayer(state).id) return fail('noSuchRoute', 'no such trade route');
      if (action.type === 'deleteTradeRoute') return OK;
      if (action.name !== undefined && (action.name.trim().length === 0 || action.name.trim().length > 24)) return fail('badRoute', 'a route name has 1 to 24 characters');
      const check = checkStops(state, route.owner, action.stops);
      return check.ok ? OK : fail(check.code, check.message);
    }
    case 'assignTradeRoute': {
      const unit = ownUnitOnMap(state, action.unitId);
      if (isValidation(unit)) return unit;
      const check = checkRouteAssign(unit, state.tradeRoutes[action.routeId], action.stop ?? 0);
      return check.ok ? OK : fail(check.code, check.message);
    }
    case 'setConstruction':
    case 'buyConstruction': {
      const colony = state.colonies[action.colonyId];
      if (colony && colony.owner !== currentPlayer(state).id) return fail('notYourColony', `${colony.name} is not yours`);
      const check = action.type === 'setConstruction' ? checkSetConstruction(state, colony, action.item) : checkBuy(state, colony);
      return check.ok ? OK : fail(check.code, check.message);
    }
    case 'assignJob':
    case 'clearSpecialty': {
      const colony = state.colonies[action.colonyId];
      if (colony && colony.owner !== currentPlayer(state).id) return fail('notYourColony', `${colony.name} is not yours`);
      const check = checkAssign(state, colony, action.colonistId, action.type === 'assignJob' ? action.job : { kind: 'idle' });
      if (!check.ok) return fail(check.code, check.message);
      if (action.type === 'clearSpecialty') {
        const who = colony?.colonists.find((c) => c.id === action.colonistId);
        if (!who || !SPECIALISTS.includes(who.profession)) return fail('badJob', 'only a specialist has a specialty to clear');
      }
      return OK;
    }
    case 'pioneerWork': {
      const unit = ownUnitOnMap(state, action.unitId);
      if (isValidation(unit)) return unit;
      if (action.job !== 'plow' && action.job !== 'road') return fail('badOrders', 'unknown job');
      const check = checkPioneerOrder(state, unit, action.job);
      if (!check.ok) return fail(check.code, check.message);
      return unit.movesLeft > 0 ? OK : fail('noMovesLeft', `unit ${unit.id} has no moves left`);
    }
    case 'goTo': {
      const unit = ownUnitOnMap(state, action.unitId);
      if (isValidation(unit)) return unit;
      if (!tileAt(state.map, action.x, action.y)) return fail('offMap', 'destination is off the map');
      if (unit.aboard !== null && state.units[unit.aboard]) return fail('carried', 'a carried unit goes where its ship goes');
      if (!routeFor(state, unit, action.x, action.y)) return fail('noPath', 'no route to that square');
      return OK;
    }
    case 'goToEurope': {
      const unit = ownUnitOnMap(state, action.unitId);
      if (isValidation(unit)) return unit;
      if (!isShipUnit(unit)) return fail('badOrders', 'only a ship can sail for Europe');
      const open = checkEuropeOpen(state, unit.owner);
      if (!open.ok) return fail(open.code, open.message);
      return laneFor(state, unit) ? OK : fail('noPath', 'no Sea Lane can be reached from here');
    }
    case 'skipUnit':
    case 'disbandUnit': {
      const unit = ownUnitOnMap(state, action.unitId);
      return isValidation(unit) ? unit : OK;
    }
    case 'loadCargo':
    case 'unloadCargo': {
      const unit = ownUnit(state, action.unitId);
      if (isValidation(unit)) return unit;
      const check = (action.type === 'loadCargo' ? checkLoad : checkUnload)(state, unit, action.good, action.amount);
      return check.ok ? OK : fail(check.code, check.message);
    }
    case 'dumpCargo': {
      const unit = ownUnitOnMap(state, action.unitId);
      if (isValidation(unit)) return unit;
      if (!Number.isInteger(action.amount) || action.amount <= 0) return fail('badAmount', 'dump a whole, positive amount');
      return (unit.cargo[action.good] ?? 0) >= action.amount ? OK : fail('notEnough', 'not that much aboard');
    }
    case 'transferCargo': {
      const unit = ownUnit(state, action.unitId);
      if (isValidation(unit)) return unit;
      const to = ownUnit(state, action.toId);
      if (isValidation(to)) return to;
      const check = checkTransfer(state, unit, to, action.good, action.amount);
      return check.ok ? OK : fail(check.code, check.message);
    }
    case 'loadMostValuable': {
      const unit = ownUnit(state, action.unitId);
      if (isValidation(unit)) return unit;
      const probe = checkLoad(state, unit, 'food', 1);
      if (!probe.ok && (probe.code === 'notCarrier' || probe.code === 'notInColony')) return fail(probe.code, probe.message);
      return mostValuableLoad(state, unit, (good) => bidPrice(state, unit.owner, good)) ? OK : fail('nothingToLoad', 'nothing here worth loading, or no room');
    }
    case 'equip': {
      const unit = ownUnit(state, action.unitId);
      if (isValidation(unit)) return unit;
      const check = checkEquip(state, unit, action.role);
      return check.ok ? OK : fail(check.code, check.message);
    }
    case 'endTurn':
      return OK;
    default:
      return fail('unknownAction', `unknown action ${String((action as { type?: unknown }).type)}`);
  }
}

function replaceUnit(state: GameState, unit: Unit): GameState {
  return { ...state, units: { ...state.units, [unit.id]: unit } };
}

// --- turn structure (R-206) -------------------------------------------------------------------
// A round is: the natives, then each European power in player order. A power's turn is three
// phases in a fixed order, and only then does the player (or its AI) move units.

/** Natives act before any European each round. They arrive with Phase 5; the slot is kept here. */
function nativesPhase(state: GameState, events: GameEvent[]): GameState {
  const alarms: AlarmEvent[] = [];
  const settled = nativesTurn(clearVisits(fadeTradeMemory(state)), alarms);
  events.push(...alarms);
  const moves: NativeAiEvent[] = [];
  const next = bravesTurn(settled, moves);
  events.push(...moves);
  return next;
}

/** Phase 1: news from Europe. Ships cross the ocean; prices, taxes and immigrants join in Phase 4. */
function europePhase(state: GameState, playerId: PlayerId, events: GameEvent[]): GameState {
  // the market moves first, then the ships
  const prices: MarketEvent[] = [];
  const priced = evaluateMarket(state, playerId, null, prices);
  events.push(...prices);
  const taxes: TaxEvent[] = [];
  const taxed = taxEvent(priced, playerId, taxes);
  events.push(...taxes);
  const voyages: VoyageEvent[] = [];
  const sailed = advanceVoyages(taxed, playerId, voyages);
  events.push(...voyages);
  const arrivals: ImmigrationEvent[] = [];
  const peopled = immigrationTurn(sailed, playerId, arrivals);
  events.push(...arrivals);
  const envoys: DiplomacyEvent[] = [];
  const peopled2 = diplomacyTurn(peopled, playerId, envoys);
  events.push(...envoys);
  const royal: (RoyalEvent | VoyageEvent)[] = [];
  const next = royalTurn(peopled2, playerId, taxes.length > 0, royal);
  events.push(...royal);
  return next;
}

/** Phase 2: the colonies, each in turn, oldest first. */
function colonyPhase(state: GameState, playerId: PlayerId, events: GameEvent[]): GameState {
  let next = state;
  const economy: EconomyEvent[] = [];
  for (const colony of Object.values(state.colonies)) {
    if (colony.owner === playerId) next = colonyTurn(next, colony.id, economy);
  }
  events.push(...economy);
  // forts and fortresses fire on hostile ships lying off them
  const salvos: NavalEvent[] = [];
  for (const colony of Object.values(next.colonies)) {
    if (colony.owner === playerId) next = fortFire(next, colony, salvos);
  }
  events.push(...salvos);
  return next;
}

/** Phase 3: the units. Fresh movement, Fortify takes hold, sentries wake, standing work and Go To orders carry on. */
function unitPhase(state: GameState, playerId: PlayerId, events: GameEvent[]): GameState {
  const all = Object.values(state.units);
  const threatened = (u: Unit): boolean =>
    all.some((o) => o.owner !== u.owner && Math.max(Math.abs(o.x - u.x), Math.abs(o.y - u.y)) <= 1);
  const units: Record<UnitId, Unit> = {};
  for (const u of all) {
    if (u.owner !== playerId || u.voyage) {
      units[u.id] = u;
      continue;
    }
    let orders = u.orders === 'fortify' ? 'fortified' : u.orders;
    // a sentry wakes when a foreign unit comes alongside
    if (orders === 'sentry' && u.aboard === null && threatened(u)) orders = 'none';
    units[u.id] = { ...u, movesLeft: turnMoves(state, u), orders };
  }
  const mended: ShipEvent[] = [];
  let next: GameState = repairShips({ ...state, units }, playerId, mended);
  events.push(...mended);
  const drifted: MissionEvent[] = [];
  next = convertsDrift(next, playerId, drifted);
  events.push(...drifted);
  const work: PioneerEvent[] = [];
  for (const u of Object.values(next.units)) {
    if (u.owner === playerId && (u.orders === 'plow' || u.orders === 'road')) next = workJob(next, u.id, work);
  }
  events.push(...work);
  const grudges: LandEvent[] = [];
  next = resentImprovements(next, playerId, work, grudges);
  events.push(...grudges);
  const trade: TradeRouteEvent[] = [];
  for (const u of Object.values(next.units)) {
    if (u.owner === playerId && u.orders === 'trade' && !u.voyage) next = runTradeRoute(next, u.id, trade, patrolAndForts);
  }
  events.push(...trade);
  for (const u of Object.values(next.units)) {
    if (u.owner !== playerId || u.orders !== 'goto' || u.voyage) continue;
    // (a computer power's small ship waiting out a blockade in port does not sail on)
    if (heldByBlockade(next, u)) continue;
    const advanced = carryOn(next, u.id);
    next = advanced.state;
    events.push(...advanced.events);
  }
  return next;
}

/** Carry a Go To order on. A ship bound for Europe that lies on the Sea Lane with moves in hand sets sail. */
function carryOn(state: GameState, unitId: UnitId): { state: GameState; events: GameEvent[] } {
  const advanced = advanceGoto(state, unitId, patrolAndForts);
  const ship = advanced.state.units[unitId];
  if (!ship || !boundForEurope(ship) || ship.movesLeft <= 0 || tileAt(advanced.state.map, ship.x, ship.y)?.base !== 'seaLane') return advanced;
  // Europe may have closed to us since the order was given
  if (!checkEuropeOpen(advanced.state, ship.owner).ok) return { state: replaceUnit(advanced.state, { ...ship, orders: 'none', destination: null }), events: advanced.events };
  const sailed: VoyageEvent[] = [];
  return { state: sailForEurope(advanced.state, unitId, sailed), events: [...advanced.events, ...sailed] };
}

/** Has the game just ended for this player? Checked as their turn begins. */
function gameOverFor(state: GameState, playerId: PlayerId): GameOverReason | null {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return null;
  const { year } = dateOfTurn(state.turn);
  if (player.atWar) return warOutcome(state, playerId) ?? (year >= CALENDAR.warLimitYear && !player.scored ? 'warLost' : null);
  // the calendar retires a human Viceroy; once any human has been scored and plays on, nobody is stopped by it
  if (year >= CALENDAR.retireYear && !state.players.some((p) => p.scored)) return 'retired';
  // The charter rule is the human player's: a power with no colonies after 1600 is recalled.
  if (player.kind === 'human' && year >= CALENDAR.charterYear && !Object.values(state.colonies).some((c) => c.owner === playerId)) return 'noColonies';
  return null;
}

function beginPlayerTurn(state: GameState, playerId: PlayerId, events: GameEvent[]): GameState {
  const reason = gameOverFor(state, playerId);
  if (reason) {
    events.push({ type: 'gameEnded', reason, player: playerId, turn: state.turn, year: dateOfTurn(state.turn).year });
    return { ...state, over: { reason, turn: state.turn, player: playerId } };
  }
  events.push({ type: 'playerTurnStarted', player: playerId, turn: state.turn });
  const warning = warWarning(state, playerId);
  if (warning) events.push(warning);
  let next = europePhase(state, playerId, events);
  next = colonyPhase(next, playerId, events);
  // the first morning of the war: the Continental Army forms up
  next = musterContinentals(unitPhase(next, playerId, events), playerId, events);
  // help from abroad, once it has been won, and soldiers for hire
  return wartimeHire(interventionArrives(next, playerId, events), playerId, events);
}

/** Pure: returns a new state (sharing untouched parts) and the events it caused. Throws InvalidActionError. */
/** Apply a valid action. Afterwards any tribe that now has the mover at its door makes itself known. */
export function applyAction(state: GameState, action: Action): ActionResult {
  const core = applyCore(state, action);
  if (!CONTACT_ACTIONS.has(action.type) || core.state.over) return core;
  const explored = rumorsFor(core);
  const met: DiplomacyEvent[] = [];
  const acquainted = contactSweep(explored.state, currentPlayer(explored.state).id, met);
  const result: ActionResult = met.length === 0 ? explored : { state: acquainted, events: [...explored.events, ...met] };
  if (Object.keys(result.state.settlements).length === 0) return result;
  const mover = currentPlayer(result.state).id;
  const events: VillageEvent[] = [];
  let next = result.state;
  for (const unit of Object.values(result.state.units)) {
    if (unit.owner === mover && unit.voyage === null && unit.aboard === null && UNIT_TYPES[unit.type].domain === 'land') next = contactAt(next, mover, unit.x, unit.y, events);
  }
  for (const colony of Object.values(result.state.colonies)) if (colony.owner === mover) next = contactAt(next, mover, colony.x, colony.y, events);
  return events.length === 0 ? result : { state: next, events: [...result.events, ...events] };
}

/** Parties of the power on the move that are standing on a rumor look into it. */
function rumorsFor(result: ActionResult): ActionResult {
  const mover = currentPlayer(result.state).id;
  const events: RumorEvent[] = [];
  let next = result.state;
  for (const unit of Object.values(result.state.units)) {
    if (unit.owner !== mover || !canExplore(next, unit) || !next.map.tiles[unit.y * next.map.width + unit.x]?.rumor) continue;
    next = exploreRumor(next, unit.id, events);
  }
  return events.length === 0 ? result : { state: next, events: [...result.events, ...events] };
}

const CONTACT_ACTIONS: ReadonlySet<Action['type']> = new Set(['moveUnit', 'goTo', 'goToEurope', 'foundColony', 'endTurn']);

function applyCore(state: GameState, action: Action): ActionResult {
  const check = validateAction(state, action);
  if (!check.ok) throw new InvalidActionError(check.error);

  switch (action.type) {
    case 'moveUnit': {
      const unit = state.units[action.unitId] as Unit;
      const plan = planMove(state, unit, action.dx, action.dy, choicesOf(action));
      if (!plan.ok) throw new InvalidActionError({ code: plan.code, message: plan.message });
      if (plan.plan.kind === 'europe') {
        const events: VoyageEvent[] = [];
        return { state: sailForEurope(state, unit.id, events), events };
      }
      // a manual step cancels any standing orders
      const fresh = unit.orders === 'none' ? state : replaceUnit(state, { ...unit, orders: 'none', destination: null, route: null });
      const outcome = executeMove(fresh, unit.id, plan.plan);
      if (plan.plan.kind !== 'sail' || !outcome.moved) return { state: outcome.state, events: outcome.events };
      // a ship that has moved may be held up by warships and forts it passes
      const events: (MoveEvent | NavalEvent)[] = [...outcome.events];
      return { state: sailWatched(outcome.state, unit.id, patrolAndForts, events), events };
    }
    case 'buyGoods':
    case 'sellGoods': {
      const events: MarketEvent[] = [];
      const ship = state.units[action.unitId] as Unit;
      const next = (action.type === 'buyGoods' ? buyGoods : sellGoods)(state, ship, action.good, action.amount, events);
      return { state: next, events };
    }
    case 'enterSettlement': {
      const events: VillageEvent[] = [];
      return { state: villageAction(state, state.units[action.unitId] as Unit, action.settlementId, action.action, events, action.target, action.good), events };
    }
    case 'attack': {
      const unit = state.units[action.unitId] as Unit;
      if (UNIT_TYPES[unit.type].domain === 'sea') {
        const broadsides: NavalEvent[] = [];
        return { state: navalAttack(state, unit, action.dx, action.dy, broadsides), events: broadsides };
      }
      if (!checkAttackNatives(state, unit, action.dx, action.dy).ok) {
        if (colonyAt(state, unit.x + action.dx, unit.y + action.dy)) {
          const stormed: AssaultEvent[] = [];
          return { state: attackColony(state, unit, action.dx, action.dy, stormed), events: stormed };
        }
        const fought: GameEvent[] = [];
        const after = attackUnit(state, unit, action.dx, action.dy, fought as BattleEvent[]);
        // a first victory over the King's troops is remembered
        const beaten = fought.some((e) => e.type === 'battle' && e.attackerWon && e.defenderId !== null && state.units[e.defenderId]?.owner === state.crownPlayer);
        return { state: beaten ? noteRefBeaten(after, unit.owner, fought) : after, events: fought };
      }
      const events: NativeWarEvent[] = [];
      return { state: attackNatives(state, unit, action.dx, action.dy, events), events };
    }
    case 'holdAudience': {
      const events: DiplomacyEvent[] = [];
      return { state: holdAudience(state, currentPlayer(state).id, action.with, events), events };
    }
    case 'audienceReply': {
      const events: DiplomacyEvent[] = [];
      return { state: audienceReply(state, action.reply, action.target, events), events };
    }
    case 'meetMayor': {
      const unit = state.units[action.unitId] as Unit;
      const town = colonyAt(state, unit.x + action.dx, unit.y + action.dy) as Colony;
      const events: DiplomacyEvent[] = [];
      const spent = replaceUnit(state, { ...unit, movesLeft: 0 });
      return { state: meetMayor(spent, unit.owner, town.owner, events), events };
    }
    case 'sellAbroad': {
      const events: DiplomacyEvent[] = [];
      return { state: sellAbroad(state, state.units[action.unitId] as Unit, state.colonies[action.colonyId] as Colony, action.good, events), events };
    }
    case 'chooseFather': {
      const events: CongressEvent[] = [];
      return { state: chooseFather(state, currentPlayer(state).id, action.father, events), events };
    }
    case 'acquireLand': {
      const events: LandEvent[] = [];
      return { state: acquireLand(state, currentPlayer(state).id, action.x, action.y, action.pay, events), events };
    }
    case 'answerBurial': {
      const events: RumorEvent[] = [];
      return { state: answerBurial(state, currentPlayer(state).id, action.search, events), events };
    }
    case 'infiltrateColony': {
      const events: AssaultEvent[] = [];
      return { state: infiltrate(state, state.units[action.unitId] as Unit, action.dx, action.dy, events), events };
    }
    case 'answerDemand': {
      const events: NativeWarEvent[] = [];
      return { state: answerDemand(state, currentPlayer(state).id, action.index, action.give, events), events };
    }
    case 'parley': {
      const events: NativeTradeEvent[] = [];
      return { state: answerParley(state, action.reply, action.good, events), events };
    }
    case 'answerTreaty': {
      const events: VillageEvent[] = [];
      return { state: answerTreaty(state, currentPlayer(state).id, action.tribe, action.accept, events), events };
    }
    case 'answerOffer': {
      const events: (RoyalEvent | TaxEvent | VoyageEvent)[] = [];
      return { state: answerOffer(state, currentPlayer(state).id, action.accept, events), events };
    }
    case 'answerTax': {
      const events: TaxEvent[] = [];
      return { state: answerTax(state, currentPlayer(state).id, action.party, events), events };
    }
    case 'payBackTaxes': {
      const events: MarketEvent[] = [];
      return { state: payBackTaxes(state, currentPlayer(state).id, action.good, events), events };
    }
    case 'trainUnit': {
      const events: EuropeEvent[] = [];
      return { state: trainUnit(state, currentPlayer(state).id, action.profession, events), events };
    }
    case 'chooseImmigrant': {
      const me = currentPlayer(state);
      if (!me.immigrantDue && me.fountain > 0) {
        const drawn: RumorEvent[] = [];
        return { state: fountainPick(state, me.id, action.slot, drawn), events: drawn };
      }
      const events: ImmigrationEvent[] = [];
      return { state: chooseImmigrant(state, me.id, action.slot, events), events };
    }
    case 'recruit': {
      const events: ImmigrationEvent[] = [];
      return { state: recruit(state, currentPlayer(state).id, action.slot, events), events };
    }
    case 'purchaseUnit': {
      const events: EuropeEvent[] = [];
      return { state: purchaseUnit(state, currentPlayer(state).id, action.unit, events), events };
    }
    case 'equipInEurope': {
      const events: EuropeEvent[] = [];
      return { state: dockEquip(state, state.units[action.unitId] as Unit, action.role, events), events };
    }
    case 'boardInEurope': {
      const events: EuropeEvent[] = [];
      return { state: boardInEurope(state, state.units[action.unitId] as Unit, state.units[action.shipId] as Unit, events), events };
    }
    case 'landInEurope': {
      const events: EuropeEvent[] = [];
      return { state: landInEurope(state, state.units[action.unitId] as Unit, events), events };
    }
    case 'setBoarding': {
      const unit = state.units[action.unitId] as Unit;
      const orders = action.board ? 'sentry' : 'none';
      return { state: replaceUnit(state, { ...unit, orders }), events: [{ type: 'ordersChanged', unitId: unit.id, orders }] };
    }
    case 'sailFromEurope': {
      // everyone waiting on the docks goes aboard first, as far as there is room
      const boarding: EuropeEvent[] = [];
      const loaded = embarkWaiting(state, state.units[action.unitId] as Unit, boarding);
      const events: VoyageEvent[] = [];
      return { state: sailForNewWorld(loaded, action.unitId, events), events: [...boarding, ...events] };
    }
    case 'reverseVoyage': {
      const events: VoyageEvent[] = [];
      return { state: reverseVoyage(state, action.unitId, events), events };
    }
    case 'setOrders': {
      const unit = state.units[action.unitId] as Unit;
      // a unit already dug in stays dug in when told to fortify again
      const orders = action.orders === 'fortify' && unit.orders === 'fortified' ? 'fortified' : action.orders;
      // digging in takes the rest of the turn
      const movesLeft = action.orders === 'fortify' ? 0 : unit.movesLeft;
      return {
        state: replaceUnit(state, { ...unit, orders, destination: null, movesLeft, workTurns: 0, route: null }),
        events: [{ type: 'ordersChanged', unitId: unit.id, orders }],
      };
    }
    case 'foundColony': {
      const unit = state.units[action.unitId] as Unit;
      const events: ColonyEvent[] = [];
      const name = action.name === undefined ? nextColonyName(state, unit.owner) : action.name.trim();
      // powers with Coronado hear of every new colony at once
      return { state: coronadoSees(foundColony(state, unit, name, events), unit.x, unit.y), events };
    }
    case 'joinColony': {
      const events: ColonyEvent[] = [];
      return { state: joinColony(state, state.units[action.unitId] as Unit, events), events };
    }
    case 'goAshore': {
      const unit = state.units[action.unitId] as Unit;
      // stepping onto the quay costs nothing and wakes whoever was asleep in the hold
      return {
        state: replaceUnit(state, { ...unit, aboard: null, orders: 'none', destination: null }),
        events: [{ type: 'unitLanded', unitId: unit.id, carrierId: unit.aboard as UnitId, to: [unit.x, unit.y] }],
      };
    }
    case 'leaveColony': {
      const events: ColonyEvent[] = [];
      const colony = state.colonies[action.colonyId] as Colony;
      const out = leaveColony(state, colony, action.colonistId, events);
      if (!isBesieged(state, colony)) return { state: out, events };
      // under siege nobody goes out unarmed: he takes muskets from the stores
      const armed = equip(out, out.units[action.colonistId] as Unit, 'soldier');
      return { state: armed, events: [...events, { type: 'unitEquipped', unitId: action.colonistId, role: 'soldier' }] };
    }
    case 'abandonColony': {
      const events: ColonyEvent[] = [];
      return { state: abandonColony(state, state.colonies[action.colonyId] as Colony, events), events };
    }
    case 'renameColony': {
      const colony = state.colonies[action.colonyId] as Colony;
      const name = action.name.trim();
      return { state: { ...state, colonies: { ...state.colonies, [colony.id]: { ...colony, name } } }, events: [{ type: 'colonyRenamed', colonyId: colony.id, name }] };
    }
    case 'setExport': {
      const events: CustomHouseEvent[] = [];
      return { state: setExport(state, state.colonies[action.colonyId] as Colony, action.good, action.on, events), events };
    }
    case 'createTradeRoute': {
      const owner = currentPlayer(state).id;
      const id = `r${state.nextId}`;
      const route: TradeRoute = { id, owner, kind: action.kind, stops: action.stops, name: action.name?.trim() ?? defaultRouteName(state, owner, action.stops) };
      return { state: { ...state, nextId: state.nextId + 1, tradeRoutes: { ...state.tradeRoutes, [id]: route } }, events: [{ type: 'tradeRouteChanged', routeId: id, change: 'created' }] };
    }
    case 'editTradeRoute': {
      const route = state.tradeRoutes[action.routeId] as TradeRoute;
      const edited: TradeRoute = { ...route, stops: action.stops, name: action.name?.trim() ?? route.name };
      return { state: { ...state, tradeRoutes: { ...state.tradeRoutes, [route.id]: edited } }, events: [{ type: 'tradeRouteChanged', routeId: route.id, change: 'edited' }] };
    }
    case 'deleteTradeRoute': {
      const { [action.routeId]: _gone, ...tradeRoutes } = state.tradeRoutes;
      // carriers on the route are released
      const units: Record<UnitId, Unit> = {};
      for (const u of Object.values(state.units)) units[u.id] = u.route?.routeId === action.routeId ? { ...u, orders: 'none', route: null } : u;
      return { state: { ...state, tradeRoutes, units }, events: [{ type: 'tradeRouteChanged', routeId: action.routeId, change: 'deleted' }] };
    }
    case 'assignTradeRoute': {
      const unit = state.units[action.unitId] as Unit;
      const ordered = replaceUnit(state, { ...unit, orders: 'trade', destination: null, workTurns: 0, route: { routeId: action.routeId, stop: action.stop ?? 0 } });
      const events: TradeRouteEvent[] = [];
      const running = runTradeRoute(ordered, unit.id, events, patrolAndForts);
      return { state: running, events: [{ type: 'ordersChanged', unitId: unit.id, orders: 'trade' }, ...events] };
    }
    case 'setConstruction': {
      const colony = state.colonies[action.colonyId] as Colony;
      return { state: { ...state, colonies: { ...state.colonies, [colony.id]: { ...colony, construction: action.item } } }, events: [] };
    }
    case 'buyConstruction': {
      const events: ConstructionEvent[] = [];
      return { state: buyConstruction(state, state.colonies[action.colonyId] as Colony, events), events };
    }
    case 'assignJob':
      return { state: assignJob(state, state.colonies[action.colonyId] as Colony, action.colonistId, action.job), events: [] };
    case 'clearSpecialty': {
      const colony = state.colonies[action.colonyId] as Colony;
      const colonists = colony.colonists.map((c) => (c.id === action.colonistId ? { ...c, profession: 'freeColonist' as const } : c));
      return { state: { ...state, colonies: { ...state.colonies, [colony.id]: { ...colony, colonists } } }, events: [] };
    }
    case 'pioneerWork': {
      const unit = state.units[action.unitId] as Unit;
      const events: PioneerEvent[] = [];
      const ordered = replaceUnit(state, { ...unit, orders: action.job, destination: null, workTurns: 0, route: null });
      // the turn the order is given is the first turn of work
      const worked = workJob(ordered, unit.id, events);
      const grudges: LandEvent[] = [];
      const resented = resentImprovements(worked, unit.owner, events, grudges);
      return { state: resented, events: [{ type: 'ordersChanged', unitId: unit.id, orders: action.job }, ...events, ...grudges] };
    }
    case 'goTo': {
      const unit = state.units[action.unitId] as Unit;
      const ordered = replaceUnit(state, { ...unit, orders: 'goto', destination: [action.x, action.y], workTurns: 0, route: null });
      const advanced = advanceGoto(ordered, unit.id, patrolAndForts);
      return { state: advanced.state, events: [{ type: 'ordersChanged', unitId: unit.id, orders: 'goto' }, ...advanced.events] };
    }
    case 'goToEurope': {
      const unit = state.units[action.unitId] as Unit;
      const ordered = replaceUnit(state, { ...unit, orders: 'goto', destination: EUROPE_BOUND, workTurns: 0, route: null });
      const advanced = carryOn(ordered, unit.id);
      return { state: advanced.state, events: [{ type: 'ordersChanged', unitId: unit.id, orders: 'goto' }, ...advanced.events] };
    }
    case 'skipUnit': {
      const unit = state.units[action.unitId] as Unit;
      return { state: replaceUnit(state, { ...unit, movesLeft: 0 }), events: [] };
    }
    case 'disbandUnit': {
      const gone = state.units[action.unitId] as Unit;
      const units: Record<UnitId, Unit> = {};
      // anything riding on a disbanded carrier goes down with it
      for (const u of Object.values(state.units)) if (u.id !== gone.id && u.aboard !== gone.id) units[u.id] = u;
      const events: GameEvent[] = Object.values(state.units)
        .filter((u) => u.id === gone.id || u.aboard === gone.id)
        .map((u) => ({ type: 'unitDisbanded', unitId: u.id, owner: u.owner }));
      return { state: { ...state, units }, events };
    }
    case 'loadCargo': {
      const unit = state.units[action.unitId] as Unit;
      return { state: loadCargo(state, unit, action.good, action.amount), events: [{ type: 'cargoMoved', good: action.good, amount: action.amount, from: 'colony', to: unit.id }] };
    }
    case 'unloadCargo': {
      const unit = state.units[action.unitId] as Unit;
      const unloaded = unloadCargo(state, unit, action.good, action.amount);
      const events: GameEvent[] = [{ type: 'cargoMoved', good: action.good, amount: action.amount, from: unit.id, to: 'colony' }];
      const port = colonyAt(unloaded, unit.x, unit.y);
      if (port && action.good !== 'food' && (port.goods[action.good] ?? 0) > warehouseCapacity(port)) {
        events.push({ type: 'warehouseFull', colonyId: port.id, good: action.good, amount: port.goods[action.good] ?? 0, capacity: warehouseCapacity(port) });
      }
      return { state: unloaded, events };
    }
    case 'dumpCargo': {
      const unit = state.units[action.unitId] as Unit;
      return {
        state: replaceUnit(state, { ...unit, cargo: addGoods(unit.cargo, action.good, -action.amount) }),
        events: [{ type: 'cargoMoved', good: action.good, amount: action.amount, from: unit.id, to: 'sea' }],
      };
    }
    case 'transferCargo': {
      const unit = state.units[action.unitId] as Unit;
      const to = state.units[action.toId] as Unit;
      return { state: transferCargo(state, unit, to, action.good, action.amount), events: [{ type: 'cargoMoved', good: action.good, amount: action.amount, from: unit.id, to: to.id }] };
    }
    case 'loadMostValuable': {
      const unit = state.units[action.unitId] as Unit;
      const lot = mostValuableLoad(state, unit, (good) => bidPrice(state, unit.owner, good)) as { good: GoodId; amount: number };
      return { state: loadCargo(state, unit, lot.good, lot.amount), events: [{ type: 'cargoMoved', good: lot.good, amount: lot.amount, from: 'colony', to: unit.id }] };
    }
    case 'equip': {
      const unit = state.units[action.unitId] as Unit;
      return { state: equip(state, unit, action.role), events: [{ type: 'unitEquipped', unitId: unit.id, role: action.role }] };
    }
    case 'retire': {
      const player = currentPlayer(state).id;
      return { state: { ...state, over: { reason: 'retiredEarly', turn: state.turn, player } }, events: [{ type: 'gameEnded', reason: 'retiredEarly', player, turn: state.turn, year: dateOfTurn(state.turn).year }] };
    }
    case 'continuePlaying': {
      // the calendar stopped the game as this power's turn was about to open: mark it scored and open the turn
      const player = (state.over as { player: PlayerId }).player;
      const events: GameEvent[] = [];
      const resumed: GameState = { ...state, over: null, players: state.players.map((p) => (p.id === player ? { ...p, scored: true } : p)) };
      return { state: beginPlayerTurn(resumed, player, events), events };
    }
    case 'declareIndependence': {
      const events: GameEvent[] = [];
      const declared = declareIndependence(state, currentPlayer(state).id, events);
      const ended = applyCore(declared, { type: 'endTurn' });
      return { state: ended.state, events: [...events, ...ended.events] };
    }
    case 'endTurn': {
      const events: GameEvent[] = [];
      // powers that have left the New World take no turns
      let nextIndex = state.current;
      let turn = state.turn;
      do {
        nextIndex = (nextIndex + 1) % state.players.length;
        if (nextIndex === 0) turn += 1;
      } while (state.players[nextIndex]?.withdrawn && nextIndex !== state.current);
      // a tax rise left unanswered is taken as accepted
      const settled = currentPlayer(state).pendingTax ? { ...state, players: state.players.map((p, i) => (i === state.current ? { ...p, pendingTax: null } : p)) } : state;
      // and a choice of immigrant left unmade is settled by lot
      let landed = currentPlayer(settled).immigrantDue ? arriveByLot(settled, currentPlayer(settled).id, events as ImmigrationEvent[]) : settled;
      // envoys left waiting are heard out with the mildest answers
      if (landed.audience || currentPlayer(landed).audiencesDue.length > 0) landed = settleAudiences(landed, currentPlayer(landed).id, events as DiplomacyEvent[]);
      // a Congress left without direction takes the first name put before it
      if (currentPlayer(landed).fatherOffer.length > 0) landed = chooseFather(landed, currentPlayer(landed).id, currentPlayer(landed).fatherOffer[0] as FatherId, events as CongressEvent[]);
      // burial mounds not decided about are left alone, and the Fountain's followers come by lot
      let found = landed;
      if (currentPlayer(found).pendingBurial) found = answerBurial(found, currentPlayer(found).id, false, events as RumorEvent[]);
      if (currentPlayer(found).fountain > 0) found = drinkFountain(found, currentPlayer(found).id, events as RumorEvent[]);
      // a treaty left unanswered is taken as accepted
      let greeted = found;
      for (const tribe of currentPlayer(landed).pendingTreaties) greeted = answerTreaty(greeted, currentPlayer(landed).id, tribe, true, events as VillageEvent[]);
      // braves left waiting at the gate are given what they asked
      while (currentPlayer(greeted).demands.length > 0) greeted = answerDemand(greeted, currentPlayer(greeted).id, 0, true, events as NativeWarEvent[]);
      // an offer from the Crown left unanswered lapses
      const offered = currentPlayer(greeted).pendingOffer ? answerOffer(greeted, currentPlayer(greeted).id, false, events as RoyalEvent[]) : greeted;
      // a power in revolt has the Crown's answer before anyone else moves
      const lapsed = currentPlayer(offered).atWar ? crownTurn(crownMoves(offered, currentPlayer(offered).id, events), currentPlayer(offered).id, events) : offered;
      // talks with a settlement do not outlast the turn
      let rolled: GameState = { ...lapsed, parley: null, current: nextIndex, turn };
      if (turn !== state.turn) {
        events.push({ type: 'turnAdvanced', turn });
        rolled = nativesPhase(rolled, events);
      }
      const nextPlayer = (state.players[nextIndex] as { id: PlayerId }).id;
      return { state: beginPlayerTurn(rolled, nextPlayer, events), events };
    }
  }
}

/** Leaving a colony: under siege only as a soldier, which needs muskets in store. */
function checkLeaveUnderSiege(state: GameState, colony: Colony | undefined, colonistId: UnitId): ReturnType<typeof checkLeave> {
  const check = checkLeave(colony, colonistId);
  if (!check.ok || !colony || !isBesieged(state, colony)) return check;
  return (colony.goods.muskets ?? 0) >= ROLE_GOODS.soldier.muskets ? check : { ok: false, code: 'underSiege', message: `${colony.name} is under siege: only armed men may leave, and there are no muskets for them` };
}

/** Land a pioneer has just improved without its having been paid for is held against the power. */
function resentImprovements(state: GameState, playerId: PlayerId, work: readonly PioneerEvent[], events: LandEvent[]): GameState {
  const done = work.filter((e): e is Extract<PioneerEvent, { type: 'tileImproved' }> => e.type === 'tileImproved');
  if (done.length === 0 || Object.keys(state.settlements).length === 0) return state;
  const rng = createRng(state.rng);
  let next = state;
  for (const e of done) next = unpaidImprovement(next, playerId, e.x, e.y, e.improvement === 'road', rng, events);
  return next === state ? state : { ...next, rng: rng.state() };
}

/** Cargo and equipment actions worth offering for a unit standing in one of its own colonies. */
function colonyOptions(state: GameState, unit: Unit): Action[] {
  const colony = colonyAt(state, unit.x, unit.y);
  if (!colony || colony.owner !== unit.owner) return [];
  const out: Action[] = [{ type: 'loadMostValuable', unitId: unit.id }];
  for (const role of COLONIST_ROLES) out.push({ type: 'equip', unitId: unit.id, role });
  for (const good of GOOD_IDS) {
    const aboard = unit.cargo[good] ?? 0;
    if (aboard > 0) out.push({ type: 'unloadCargo', unitId: unit.id, good, amount: aboard });
    const stored = colony.goods[good] ?? 0;
    if (stored > 0) out.push({ type: 'loadCargo', unitId: unit.id, good, amount: Math.min(stored, 100) });
  }
  return out;
}

const DIRECTIONS: readonly (readonly [number, number])[] = [
  [-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1],
];

/** Every single-step action the current player could legally take now. Used by the placeholder AI and by tests. */
export function listValidActions(state: GameState): Action[] {
  if (state.over) return [];
  const me = currentPlayer(state).id;
  const out: Action[] = [{ type: 'endTurn' }];
  if (checkDeclare(state, me).ok) out.push({ type: 'declareIndependence' });
  if (currentPlayer(state).pendingBurial) out.push({ type: 'answerBurial', search: true }, { type: 'answerBurial', search: false });
  for (const father of currentPlayer(state).fatherOffer) out.push({ type: 'chooseFather', father });
  if (!state.audience) for (const envoy of currentPlayer(state).audiencesDue) out.push({ type: 'holdAudience', with: envoy });
  if (state.audience) {
    for (const reply of ['yes', 'no', 'goInPeace', 'withdraw', 'valueLives', 'pay', 'threaten'] as const) {
      const answer: Action = { type: 'audienceReply', reply };
      if (validateAction(state, answer).ok) out.push(answer);
    }
  }
  currentPlayer(state).demands.forEach((_, index) => out.push({ type: 'answerDemand', index, give: true }, { type: 'answerDemand', index, give: false }));
  if (state.parley) {
    const goods = state.parley.stage === 'buying' ? state.parley.offers.map((o) => o.good) : [undefined];
    for (const reply of ['accept', 'haggle', 'gift', 'leave'] as const) {
      for (const good of goods) {
        const answer: Action = good === undefined ? { type: 'parley', reply } : { type: 'parley', reply, good };
        if (validateAction(state, answer).ok) out.push(answer);
      }
    }
  }
  for (const tribe of currentPlayer(state).pendingTreaties) out.push({ type: 'answerTreaty', tribe, accept: true }, { type: 'answerTreaty', tribe, accept: false });
  for (const unit of Object.values(state.units)) {
    if (unit.owner !== me) continue;
    if (unit.voyage) {
      for (const away of [{ type: 'sailFromEurope', unitId: unit.id }, { type: 'reverseVoyage', unitId: unit.id }] as const) {
        if (validateAction(state, away).ok) out.push(away);
      }
      continue;
    }
    for (const extra of colonyOptions(state, unit)) if (validateAction(state, extra).ok) out.push(extra);
    for (const settle of [{ type: 'foundColony', unitId: unit.id }, { type: 'joinColony', unitId: unit.id }] as const) {
      if (validateAction(state, settle).ok) out.push(settle);
    }
    for (const job of ['plow', 'road'] as const) {
      const work: Action = { type: 'pioneerWork', unitId: unit.id, job };
      if (validateAction(state, work).ok) out.push(work);
    }
    if (unit.movesLeft <= 0) continue;
    for (const village of Object.values(state.settlements)) {
      if (Math.max(Math.abs(village.x - unit.x), Math.abs(village.y - unit.y)) !== 1) continue;
      for (const choice of VILLAGE_ACTIONS) {
        const visit: Action = { type: 'enterSettlement', unitId: unit.id, settlementId: village.id, action: choice };
        if (validateAction(state, visit).ok) out.push(visit);
        if (choice === 'trade' || choice === 'enterHostile') {
          for (const good of GOOD_IDS) {
            const offer: Action = { ...visit, good };
            if ((unit.cargo[good] ?? 0) > 0 && validateAction(state, offer).ok) out.push(offer);
          }
        }
        if (choice !== 'incite') continue;
        for (const rival of state.players) {
          const set: Action = { ...visit, target: rival.id };
          if (validateAction(state, set).ok) out.push(set);
        }
      }
    }
    for (const [dx, dy] of DIRECTIONS) {
      const assault: Action = { type: 'attack', unitId: unit.id, dx, dy };
      if (validateAction(state, assault).ok) out.push(assault);
    }
    for (const [dx, dy] of DIRECTIONS) {
      // the plain step first, then each way of answering a prompt it might raise
      const base = { type: 'moveUnit', unitId: unit.id, dx, dy } as const;
      if (validateAction(state, base).ok) {
        out.push(base);
        continue;
      }
      const answers: Action[] = [{ ...base, landfall: true }, { ...base, sail: false }, { ...base, sail: true }];
      for (const action of answers) if (validateAction(state, action).ok) out.push(action);
    }
  }
  return out;
}
