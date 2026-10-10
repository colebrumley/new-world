// Diplomacy between the colonial powers (R-801). Powers meet when their units or colonies come
// alongside on land. A computer power and a human hold an audience, a short run of questions the
// human answers one at a time (the talk in progress is `state.audience`); two computer powers
// settle it between themselves. War and peace are kept in `stance`, the rest in `dealings`.
import { adjustTribalAlarm, tribalAlarm, type AlarmEvent, type AlarmSink } from './alarm';
import { addGoods, amountOf } from './cargo';
import { coloniesOf } from './colony';
import { DIPLOMACY as D } from './data/diplomacy';
import type { GoodId } from './data/goods';
import { NATIONS } from './data/nations';
import { NATIVES, TRIBE_IDS, type TribeId } from './data/tribes';
import { UNIT_TYPES } from './data/units';
import { DIFFICULTIES } from './data/yields';
import { dockRecord } from './europe';
import { bidPrice } from './market';
import { warehouseCapacity } from './pioneer';
import { createRng, type Rng } from './rng';
import { militaryStrength } from './royal';
import { tribeMight } from './settlements';
import { OFF_MAP, type Audience, type Colony, type Dealing, type GameState, type Player, type PlayerId, type Unit } from './state';

export type AudienceReply = 'yes' | 'no' | 'goInPeace' | 'withdraw' | 'valueLives' | 'alliance' | 'pay' | 'threaten';
export type DiplomacyEvent =
  | AlarmEvent
  | { readonly type: 'powersMet'; readonly a: PlayerId; readonly b: PlayerId }
  /** A computer power wishes to speak with a human one. */
  | { readonly type: 'audienceRequested'; readonly human: PlayerId; readonly ai: PlayerId }
  /** The question now before the human in an audience. */
  | { readonly type: 'audienceQuestion'; readonly human: PlayerId; readonly ai: PlayerId; readonly stage: Audience['stage']; readonly gold: number; readonly hostile: boolean }
  | { readonly type: 'audienceEnded'; readonly human: PlayerId; readonly ai: PlayerId; readonly peace: boolean }
  | { readonly type: 'treatySigned'; readonly a: PlayerId; readonly b: PlayerId }
  | { readonly type: 'warDeclared'; readonly by: PlayerId; readonly on: PlayerId }
  | { readonly type: 'goldPaid'; readonly from: PlayerId; readonly to: PlayerId; readonly amount: number; readonly why: 'tribute' | 'cash' | 'withdraw' | 'gift' | 'alliance' }
  | { readonly type: 'forcesWithdrawn'; readonly player: PlayerId; readonly units: readonly string[] }
  /** One power was paid to make war on another power or on a tribe. */
  | { readonly type: 'allyHired'; readonly by: PlayerId; readonly ally: PlayerId; readonly against: string }
  | { readonly type: 'soldAbroad'; readonly unitId: string; readonly colonyId: string; readonly good: GoodId; readonly amount: number; readonly gold: number };

export type DiplomacyErrorCode = 'noAudience' | 'badReply' | 'cannotAfford' | 'noTarget' | 'notDue' | 'atWar' | 'noDeWitt' | 'noCargo' | 'noRoom';
export type DiplomacyCheck = { readonly ok: true } | { readonly ok: false; readonly code: DiplomacyErrorCode; readonly message: string };
const no = (code: DiplomacyErrorCode, message: string): DiplomacyCheck => ({ ok: false, code, message });

const NO_DEALING: Dealing = { grudge: false, piracy: false, intent: false, truce: 0, lastTalk: -1, kingsWarUntil: 0 };
const playerOf = (state: GameState, id: string): Player | undefined => state.players.find((p) => p.id === id);
const level = (state: GameState): number => DIFFICULTIES.indexOf(state.difficulty);
const patch = (state: GameState, id: PlayerId, change: Partial<Player>): GameState => ({ ...state, players: state.players.map((p) => (p.id === id ? { ...p, ...change } : p)) });
export const dealing = (state: GameState, of: PlayerId, toward: PlayerId): Dealing => playerOf(state, of)?.dealings[toward] ?? NO_DEALING;
export const withDealing = (state: GameState, of: PlayerId, toward: PlayerId, change: Partial<Dealing>): GameState => {
  const p = playerOf(state, of);
  return p ? patch(state, of, { dealings: { ...p.dealings, [toward]: { ...dealing(state, of, toward), ...change } } }) : state;
};
const atPeace = (state: GameState, a: PlayerId, b: PlayerId): boolean => playerOf(state, a)?.stance[b] === 'peace';
const hasMet = (state: GameState, a: PlayerId, b: PlayerId): boolean => playerOf(state, a)?.stance[b] !== undefined;
const isArmed = (u: Unit): boolean => UNIT_TYPES[u.type].domain === 'land' && UNIT_TYPES[u.type].attack > 1;
const pay = (state: GameState, from: PlayerId, to: PlayerId, amount: number, why: Extract<DiplomacyEvent, { type: 'goldPaid' }>['why'], events: DiplomacyEvent[]): GameState => {
  if (amount <= 0) return state;
  events.push({ type: 'goldPaid', from, to, amount, why });
  return { ...state, players: state.players.map((p) => (p.id === from ? { ...p, gold: p.gold - amount } : p.id === to ? { ...p, gold: p.gold + amount } : p)) };
};

/** Peace or war between two powers, set on both sides. */
export function setStance(state: GameState, a: PlayerId, b: PlayerId, stance: 'peace' | 'war'): GameState {
  return { ...state, players: state.players.map((p) => (p.id === a ? { ...p, stance: { ...p.stance, [b]: stance } } : p.id === b ? { ...p, stance: { ...p.stance, [a]: stance } } : p)) };
}

function declareWar(state: GameState, by: PlayerId, on: PlayerId, events: DiplomacyEvent[]): GameState {
  const broke = atPeace(state, by, on);
  events.push({ type: 'warDeclared', by, on });
  let next = setStance(state, by, on, 'war');
  // a broken treaty is remembered
  if (broke) next = withDealing(next, on, by, { grudge: true });
  return withDealing(next, by, on, { intent: false });
}

/** A power's armed land units standing beside (or in) the colonies of another: its weight at their gates. */
export function pressureOn(state: GameState, by: PlayerId, on: PlayerId): { strength: number; units: Unit[] } {
  const theirs = coloniesOf(state, on);
  const units = Object.values(state.units).filter((u) => u.owner === by && u.voyage === null && u.aboard === null && isArmed(u)
    && theirs.some((c) => Math.max(Math.abs(c.x - u.x), Math.abs(c.y - u.y)) === 1));
  return { strength: units.reduce((n, u) => n + UNIT_TYPES[u.type].attack, 0), units };
}

/** Send units back to Europe's docks: the way forces are "withdrawn". */
function sendHome(state: GameState, playerId: PlayerId, units: readonly Unit[], events: DiplomacyEvent[]): GameState {
  if (units.length === 0) return state;
  const moved = { ...state.units };
  for (const u of units) moved[u.id] = { ...u, x: OFF_MAP, y: OFF_MAP, orders: 'sentry', destination: null, route: null, movesLeft: 0, aboard: null, voyage: dockRecord(state, playerId) };
  events.push({ type: 'forcesWithdrawn', player: playerId, units: units.map((u) => u.id) });
  return { ...state, units: moved };
}

// --- meeting -------------------------------------------------------------------------------------------

/**
 * Units or colonies of two powers stand side by side on land: they have met. Two computer
 * powers settle their relations at once; a computer power asks a human for an audience (again
 * only after sixteen turns). Nothing once the human has declared independence.
 */
export function powersMeet(state: GameState, a: PlayerId, b: PlayerId, events: DiplomacyEvent[]): GameState {
  const pa = playerOf(state, a);
  const pb = playerOf(state, b);
  if (!pa || !pb || a === b || pa.withdrawn || pb.withdrawn || pa.atWar || pb.atWar) return state;
  let next = state;
  const first = !hasMet(state, a, b);
  if (first) {
    events.push({ type: 'powersMet', a, b });
    next = setStance(next, a, b, 'war'); // contact without a treaty is war, until they agree otherwise
  }
  const human = pa.kind === 'human' ? pa : pb.kind === 'human' ? pb : null;
  if (!human) return aiMeetsAi(next, a, b, first, events);
  if (pa.kind === 'human' && pb.kind === 'human') return next;
  const ai = human.id === a ? b : a;
  const last = dealing(next, ai, human.id).lastTalk;
  if (!first && last >= 0 && next.turn - last < D.audienceEvery) return next;
  const now = playerOf(next, human.id) as Player;
  if (now.audiencesDue.includes(ai) || next.audience?.ai === ai) return next;
  events.push({ type: 'audienceRequested', human: human.id, ai });
  return patch(next, human.id, { audiencesDue: [...now.audiencesDue, ai] });
}

/** Look around a power's land units and colonies for neighbours of other powers. */
export function contactSweep(state: GameState, mover: PlayerId, events: DiplomacyEvent[]): GameState {
  if (state.players.filter((p) => !p.withdrawn).length < 2) return state;
  const spots: [number, number][] = [];
  for (const u of Object.values(state.units)) if (u.owner === mover && u.voyage === null && u.aboard === null && UNIT_TYPES[u.type].domain === 'land') spots.push([u.x, u.y]);
  for (const c of Object.values(state.colonies)) if (c.owner === mover) spots.push([c.x, c.y]);
  const near = (x: number, y: number): boolean => spots.some(([sx, sy]) => Math.max(Math.abs(sx - x), Math.abs(sy - y)) === 1);
  const found = new Set<PlayerId>();
  for (const u of Object.values(state.units)) {
    if (u.owner !== mover && playerOf(state, u.owner) && u.voyage === null && u.aboard === null && UNIT_TYPES[u.type].domain === 'land' && near(u.x, u.y)) found.add(u.owner);
  }
  for (const c of Object.values(state.colonies)) if (c.owner !== mover && near(c.x, c.y)) found.add(c.owner);
  let next = state;
  for (const other of found) next = powersMeet(next, mover, other, events);
  return next;
}

/** Wars a power already has on its hands: European enemies, and tribes at open war with it. */
function warsOf(state: GameState, id: PlayerId): number {
  const p = playerOf(state, id);
  if (!p) return 0;
  const powers = state.players.filter((o) => o.id !== id && !o.withdrawn && p.stance[o.id] === 'war' && coloniesOf(state, o.id).length > 0).length;
  const tribes = TRIBE_IDS.filter((t) => state.tribes[t] && tribalAlarm(state, t, id) >= NATIVES.alarmLevels[2]).length;
  return powers + tribes;
}

/** Does this computer power want war with that one? Only when it is clearly the stronger and has nothing else on. */
export function wantsWar(state: GameState, a: PlayerId, b: PlayerId): boolean {
  const pa = playerOf(state, a);
  const pb = playerOf(state, b);
  if (!pa || !pb || state.turn < D.aiWarFromTurn || pa.independent || pb.independent) return false;
  const strengths = state.players.filter((p) => !p.withdrawn).map((p) => ({ p, s: militaryStrength(state, p.id) })).sort((x, y) => y.s - x.s);
  if (strengths[0]?.p.kind === 'human') return false;
  const people = (id: PlayerId): number => coloniesOf(state, id).reduce((n, c) => n + c.colonists.length, 0);
  if (people(a) <= D.aiWarPopulation && people(b) <= D.aiWarPopulation) return false;
  const mine = militaryStrength(state, a);
  const theirs = Math.max(1, militaryStrength(state, b));
  return Math.trunc((4 * mine) / theirs) >= warsOf(state, a) - NATIONS[pa.nation].leaderTraits.aggressive + 4;
}

function aiMeetsAi(state: GameState, a: PlayerId, b: PlayerId, first: boolean, events: DiplomacyEvent[]): GameState {
  const ia = state.players.findIndex((p) => p.id === a);
  const ib = state.players.findIndex((p) => p.id === b);
  // they talk when they first meet, and after that only every third turn
  if (!first && (ia + ib + state.turn) % D.aiTalkEvery !== 0) return state;
  if (dealing(state, a, b).grudge || dealing(state, b, a).grudge) return state;
  const war = wantsWar(state, a, b) || wantsWar(state, b, a);
  if (war && atPeace(state, a, b)) return declareWar(state, wantsWar(state, a, b) ? a : b, wantsWar(state, a, b) ? b : a, events);
  if (!war && !atPeace(state, a, b)) {
    events.push({ type: 'treatySigned', a, b });
    return setStance(state, a, b, 'peace');
  }
  return state;
}

// --- the audience --------------------------------------------------------------------------------------

/** How a computer power sizes up a human one before they talk: what it fears, what it thinks it is owed, and its tone. */
export function sizeUp(state: GameState, human: PlayerId, ai: PlayerId, rng: Rng): Pick<Audience, 'demand' | 'fear' | 'hostile' | 'pressure'> {
  const h = playerOf(state, human) as Player;
  const a = playerOf(state, ai) as Player;
  const d = level(state);
  const franklin = h.fathers.includes('benjaminFranklin');
  const mine = militaryStrength(state, human);
  const theirs = militaryStrength(state, ai);
  const pressure = pressureOn(state, human, ai).strength;
  const grudge = dealing(state, ai, human).grudge;
  const treaty = atPeace(state, human, ai);
  const first = dealing(state, ai, human).lastTalk < 0;
  const kingsWar = h.stance[ai] === 'war' && state.turn < dealing(state, ai, human).kingsWarUntil;
  const aiUnits = Object.values(state.units).filter((u) => u.owner === ai && u.voyage === null && isArmed(u)).length;
  const fear = mine > theirs ? Math.trunc((mine * (d === 0 ? 4 : 2)) / (aiUnits + 1) / 4) : 0;

  let value = Math.max(0, theirs - mine) + 2 * pressure;
  value = Math.trunc((value * (d + 8)) / 10);
  if (grudge) value *= 2;
  if (first) value >>= 2;
  if (state.turn < D.earlyTurns[0]) value >>= 1;
  else if (state.turn < D.earlyTurns[1]) value = Math.trunc((value * 3) / 4);
  const myColonies = coloniesOf(state, human);
  if (myColonies.length <= D.smallPower[0] && myColonies.reduce((n, c) => n + c.colonists.length, 0) < D.smallPower[1]) value >>= 1;
  let demand = D.goldStep * Math.min(D.demandSteps[1], Math.max(D.demandSteps[0], Math.trunc(((d + 1) * value) / 8)));
  if (kingsWar) demand += D.kingsWarDemand * (d + 1);
  if (demand > h.gold && demand < 2 * h.gold && h.gold >= D.cutToFitAbove) demand = h.gold - (h.gold % D.goldStep);
  if (franklin) demand >>= 1;

  const strongest = state.players.filter((p) => !p.withdrawn).every((p) => militaryStrength(state, p.id) <= mine);
  const bully = strongest && state.turn >= D.bullyFromTurn && myColonies.length > D.bullyColonies && coloniesOf(state, ai).length > 1;
  let hostile = pressure > 0 || kingsWar || bully || (grudge && 3 * theirs > mine);
  if (fear > 0 || demand === 0 || 3 * theirs < mine || franklin || (!grudge && state.turn < 10 * (10 - d))) hostile = false;
  const busy = warsOf(state, ai) - NATIONS[a.nation].leaderTraits.aggressive - (theirs > mine ? 1 : 0) - (grudge ? 2 : 0);
  if (!bully && busy > (treaty ? 0 : 1)) {
    hostile = false;
    if (rng.int(0, 1) === 0) demand = 0;
  }
  // with a treaty in force it will not turn on a power it owes a grudge or fears: it only nurses the thought
  if (hostile && treaty && (grudge || mine > theirs)) hostile = false;
  return { demand, fear, hostile, pressure };
}

/** The first question an audience turns to from its present state, or null when it is over. */
function nextStage(state: GameState, a: Audience, after: Audience['stage'] | null, rng: Rng): { stage: Audience['stage']; gold: number } | null {
  const order: Audience['stage'][] = ['piracy', 'sieges', 'tribute', 'worthy', 'menu'];
  const from = after === null ? 0 : order.indexOf(after) + 1;
  const h = playerOf(state, a.human) as Player;
  const treaty = atPeace(state, a.human, a.ai);
  for (const stage of order.slice(Math.max(0, from))) {
    if (stage === 'piracy' && dealing(state, a.ai, a.human).piracy && Object.values(state.units).some((u) => u.owner === a.human && u.type === 'privateer')) return { stage, gold: 0 };
    if (stage === 'sieges') {
      const people = coloniesOf(state, a.ai).reduce((n, c) => n + c.colonists.length, 0);
      if (a.pressure > 0 && (a.pressure * D.siegeShare >= people || (a.pressure > D.siegeAlways && rng.int(1, D.siegeOdds) === 1))) return { stage, gold: 0 };
    }
    // a treasury that just covers the demand can pay it: a demand cut to fit a round treasury equals it
    if (stage === 'tribute' && a.hostile && a.demand > 0 && h.gold >= a.demand) return { stage, gold: a.demand };
    if (stage === 'worthy' && !a.hostile && !treaty) return { stage, gold: 0 };
    // a power still set on a quarrel has nothing more to discuss
    if (stage === 'menu' && treaty && !a.hostile) return { stage, gold: 0 };
  }
  return null;
}

/** Wind up an audience: a hard line unanswered means war or a threat; then the talk is recorded. */
function conclude(state: GameState, a: Audience, events: DiplomacyEvent[]): GameState {
  let next: GameState = { ...state, audience: null };
  const treaty = atPeace(next, a.human, a.ai);
  if (a.hostile && ((treaty && a.demand > D.provokeAbove) || a.tributeRefused)) next = declareWar(next, a.ai, a.human, events);
  const peace = atPeace(next, a.human, a.ai);
  const franklin = playerOf(next, a.human)?.fathers.includes('benjaminFranklin') ?? false;
  const truce = peace ? (2 * (D.truceLevels - level(next))) >> (franklin ? 1 : 0) : 0;
  next = withDealing(next, a.ai, a.human, { lastTalk: next.turn, truce });
  // an old intention to break the treaty is kept if it came in meaning harm and backed down
  if (a.cameHostile && !a.hostile && peace && dealing(next, a.ai, a.human).grudge) next = withDealing(next, a.ai, a.human, { intent: true });
  events.push({ type: 'audienceEnded', human: a.human, ai: a.ai, peace });
  return next;
}

function advance(state: GameState, a: Audience, after: Audience['stage'] | null, rng: Rng, events: DiplomacyEvent[]): GameState {
  const step = nextStage(state, a, after, rng);
  if (!step) return conclude(state, a, events);
  const audience: Audience = { ...a, stage: step.stage, gold: step.gold };
  events.push({ type: 'audienceQuestion', human: a.human, ai: a.ai, stage: step.stage, gold: step.gold, hostile: a.hostile });
  return { ...state, audience };
}

export function checkHoldAudience(state: GameState, human: PlayerId, ai: PlayerId): DiplomacyCheck {
  if (state.audience) return no('badReply', 'an audience is already under way');
  return playerOf(state, human)?.audiencesDue.includes(ai) ? { ok: true } : no('notDue', 'that power has not asked to speak with us');
}

/** Receive the envoy of a power that has asked for an audience. */
export function holdAudience(state: GameState, human: PlayerId, ai: PlayerId, events: DiplomacyEvent[]): GameState {
  const h = playerOf(state, human) as Player;
  const rng = createRng(state.rng);
  const view = sizeUp(state, human, ai, rng);
  const audience: Audience = { human, ai, stage: 'menu', gold: 0, tributeRefused: false, cameHostile: view.hostile, ...view };
  const next = advance(patch(state, human, { audiencesDue: h.audiencesDue.filter((id) => id !== ai) }), audience, null, rng, events);
  return { ...next, rng: rng.state() };
}

/** A scout presents himself to the mayor of a foreign colony: an audience is granted at once. */
export function meetMayor(state: GameState, human: PlayerId, ai: PlayerId, events: DiplomacyEvent[]): GameState {
  const h = playerOf(state, human);
  if (!h || h.atWar || state.audience) return state;
  let next = state;
  if (!hasMet(next, human, ai)) {
    events.push({ type: 'powersMet', a: human, b: ai });
    next = setStance(next, human, ai, 'war');
  }
  const now = playerOf(next, human) as Player;
  next = now.audiencesDue.includes(ai) ? next : patch(next, human, { audiencesDue: [...now.audiencesDue, ai] });
  return holdAudience(next, human, ai, events);
}

const REPLIES: Readonly<Record<Audience['stage'], readonly AudienceReply[]>> = {
  piracy: ['yes', 'no'], sieges: ['yes', 'no'], tribute: ['yes', 'no'], worthy: ['yes', 'no'], cash: ['yes', 'no'],
  menu: ['goInPeace', 'withdraw', 'valueLives', 'alliance'], withdraw: ['pay', 'threaten', 'no'],
};

/** What the computer power would ask for making war on `target` (a power's id, or `tribe:<id>`). */
export function alliancePrice(state: GameState, human: PlayerId, target: string): number {
  const h = playerOf(state, human);
  if (!h) return 0;
  const tribe = target.startsWith('tribe:') ? (target.slice(6) as TribeId) : null;
  const strength = tribe ? 3 * tribeMight(state, tribe) : militaryStrength(state, target);
  const steps = Math.min(D.allianceSteps[1], Math.max(D.allianceSteps[0], Math.trunc((Math.trunc(h.gold / D.goldStep) * strength) / 50)));
  return (D.goldStep * steps) >> (h.fathers.includes('benjaminFranklin') ? 1 : 0);
}

export function checkAudienceReply(state: GameState, playerId: PlayerId, reply: AudienceReply, target?: string): DiplomacyCheck {
  const a = state.audience;
  if (!a || a.human !== playerId) return no('noAudience', 'no audience is under way');
  if (!REPLIES[a.stage].includes(reply)) return no('badReply', 'that is no answer to what was asked');
  const h = playerOf(state, playerId) as Player;
  if ((a.stage === 'tribute' && reply === 'yes') || (a.stage === 'withdraw' && reply === 'pay')) return h.gold >= a.gold ? { ok: true } : no('cannotAfford', `that would cost ${a.gold} gold`);
  if (a.stage === 'menu' && reply === 'alliance') {
    if (target === undefined) return no('noTarget', 'name the enemy they are to fight');
    const tribe = target.startsWith('tribe:') ? (target.slice(6) as TribeId) : null;
    const known = tribe ? (state.tribes[tribe]?.met.includes(a.ai) ?? false) : target !== a.ai && target !== a.human && hasMet(state, a.ai, target);
    if (!known) return no('noTarget', 'they have never met those people');
    const already = tribe ? tribalAlarm(state, tribe, a.ai) >= NATIVES.alarmLevels[2] : playerOf(state, a.ai)?.stance[target] === 'war';
    if (already) return no('noTarget', 'they are at war with them already');
    return h.gold >= alliancePrice(state, playerId, target) ? { ok: true } : no('cannotAfford', `they ask ${alliancePrice(state, playerId, target)} gold`);
  }
  return { ok: true };
}

/** Answer the question before the human in the audience, and move on to the next. */
export function audienceReply(state: GameState, reply: AudienceReply, target: string | undefined, events: DiplomacyEvent[]): GameState {
  const a = state.audience as Audience;
  const rng = createRng(state.rng);
  const d = level(state);
  const h = playerOf(state, a.human) as Player;
  const ai = playerOf(state, a.ai) as Player;
  const franklin = h.fathers.includes('benjaminFranklin');
  const done = (s: GameState): GameState => ({ ...s, rng: rng.state() });
  let next = state;
  let now = a;

  switch (a.stage) {
    case 'piracy':
      if (reply === 'yes') {
        const privateers = Object.values(next.units).filter((u) => u.owner === a.human && u.type === 'privateer');
        const atSea = privateers.filter((u) => u.voyage === null);
        next = sendHome(next, a.human, atSea, events);
        next = withDealing(next, a.ai, a.human, { piracy: false });
        now = { ...now, demand: Math.trunc(now.demand / (atSea.length + 1)), hostile: false };
      }
      return done(advance(next, now, 'piracy', rng, events));
    case 'sieges':
      if (reply === 'yes') {
        next = sendHome(next, a.human, pressureOn(next, a.human, a.ai).units, events);
        now = { ...now, demand: Math.max(0, now.demand - D.siegeRelief * now.pressure), hostile: false, pressure: 0 };
      }
      return done(advance(next, now, 'sieges', rng, events));
    case 'tribute':
      if (reply === 'yes') {
        next = pay(next, a.human, a.ai, a.gold, 'tribute', events);
        now = { ...now, hostile: false };
      } else now = { ...now, tributeRefused: true };
      return done(advance(next, now, 'tribute', rng, events));
    case 'worthy': {
      if (reply === 'yes') {
        events.push({ type: 'treatySigned', a: a.human, b: a.ai });
        return done(advance(setStance(next, a.human, a.ai, 'peace'), now, 'worthy', rng, events));
      }
      // spurned: a power that fears us may yet buy its peace
      const cash = dealing(next, a.ai, a.human).grudge ? 0 : 100 * Math.min(Math.trunc(ai.gold / 100), 2 * (a.fear - 2));
      if (cash <= 0) return done(conclude(next, now, events));
      events.push({ type: 'audienceQuestion', human: a.human, ai: a.ai, stage: 'cash', gold: cash, hostile: false });
      return done({ ...next, audience: { ...now, stage: 'cash', gold: cash } });
    }
    case 'cash':
      if (reply === 'yes') {
        next = pay(next, a.ai, a.human, a.gold, 'cash', events);
        events.push({ type: 'treatySigned', a: a.human, b: a.ai });
        next = setStance(next, a.human, a.ai, 'peace');
      }
      return done(conclude(next, now, events));
    case 'withdraw': {
      const theirs = pressureOn(next, a.ai, a.human);
      if (reply === 'pay') {
        next = pay(next, a.human, a.ai, a.gold, 'withdraw', events);
        next = sendHome(next, a.ai, theirs.units, events);
      } else if (reply === 'threaten') {
        const mine = militaryStrength(next, a.human);
        const roll = rng.int(0, (militaryStrength(next, a.ai) + mine) * (dealing(next, a.ai, a.human).grudge ? 2 : 1));
        if (mine >= roll) next = sendHome(next, a.ai, theirs.units, events);
        else next = declareWar(next, a.ai, a.human, events);
      }
      return done(conclude(next, now, events));
    }
    default:
  }

  // the treaty menu
  if (reply === 'withdraw') {
    const theirs = pressureOn(next, a.ai, a.human);
    if (theirs.units.length === 0) return done(conclude(next, now, events));
    if (a.fear > 0) return done(conclude(sendHome(next, a.ai, theirs.units, events), now, events));
    let price = D.withdrawPrice * (d + 2) * theirs.strength;
    if (dealing(next, a.ai, a.human).grudge) price *= 2;
    if (a.cameHostile) price += price >> 1;
    if (franklin) price >>= 1;
    price = Math.max(D.withdrawMinimum, price);
    events.push({ type: 'audienceQuestion', human: a.human, ai: a.ai, stage: 'withdraw', gold: price, hostile: now.hostile });
    return done({ ...next, audience: { ...now, stage: 'withdraw', gold: price } });
  }
  if (reply === 'valueLives') {
    const fear = a.fear + (franklin && rng.int(0, 2) === 0 ? 1 : 0);
    const gift = 100 * Math.min(Math.trunc(ai.gold / 100), fear);
    if (gift > 0) next = pay(next, a.ai, a.human, gift, 'gift', events);
    else if (a.cameHostile) next = declareWar(next, a.ai, a.human, events);
    return done(conclude(next, { ...now, hostile: false }, events));
  }
  if (reply === 'alliance' && target !== undefined) {
    next = pay(next, a.human, a.ai, alliancePrice(next, a.human, target), 'alliance', events);
    events.push({ type: 'allyHired', by: a.human, ally: a.ai, against: target });
    if (target.startsWith('tribe:')) {
      const tribe = target.slice(6) as TribeId;
      next = adjustTribalAlarm(next, tribe, a.ai, NATIVES.alarmMax, rng, events as AlarmSink);
    } else {
      next = declareWar(next, a.ai, target, events);
      next = withDealing(next, target, a.human, { grudge: true });
    }
  }
  return done(conclude(next, now, events));
}

/** An audience nobody attended: the envoy is heard out with the mildest answers (peace accepted, nothing paid). */
export function settleAudiences(state: GameState, human: PlayerId, events: DiplomacyEvent[]): GameState {
  let next = state;
  for (let guard = 0; guard < 40; guard++) {
    if (!next.audience) {
      const due = playerOf(next, human)?.audiencesDue[0];
      if (due === undefined) break;
      next = holdAudience(next, human, due, events);
      continue;
    }
    const mild: AudienceReply = next.audience.stage === 'worthy' || next.audience.stage === 'cash' ? 'yes' : next.audience.stage === 'menu' ? 'goInPeace' : 'no';
    next = audienceReply(next, mild, undefined, events);
  }
  return next;
}

// --- between turns ---------------------------------------------------------------------------------------

/** A power's turn in diplomacy: truces run down, and a computer power that means to break a treaty may do it. */
export function diplomacyTurn(state: GameState, playerId: PlayerId, events: DiplomacyEvent[]): GameState {
  const player = playerOf(state, playerId);
  if (!player || player.withdrawn) return state;
  const rng = createRng(state.rng);
  let next = state;
  let rolled = false;
  for (const [other, now] of Object.entries(player.dealings)) {
    if (now.truce > 0) next = withDealing(next, playerId, other, { truce: now.truce - 1 });
    else if (player.kind === 'ai' && now.intent && atPeace(next, playerId, other)) {
      rolled = true;
      if (rng.int(1, D.breakOdds) === 1) next = declareWar(next, playerId, other, events);
    }
  }
  return rolled ? { ...next, rng: rng.state() } : next;
}

/** What a privateer's attack does to relations: no war, but the victim does not forget who was behind it. */
export function privateerOutrage(state: GameState, attacker: PlayerId, victim: PlayerId, rng: Rng): GameState {
  if (!playerOf(state, attacker) || !playerOf(state, victim)) return state;
  let next = withDealing(state, victim, attacker, { piracy: true });
  if (rng.int(1, D.piracyGrievanceOdds) <= level(state) + 1) {
    const weaker = militaryStrength(state, victim) < militaryStrength(state, attacker);
    next = withDealing(next, victim, attacker, weaker ? { grudge: true } : { intent: true });
  }
  return next;
}

// --- trade in foreign colonies (de Witt) ----------------------------------------------------------------

export function checkSellAbroad(state: GameState, unit: Unit, colony: Colony | null, good: GoodId): DiplomacyCheck {
  const carrier = UNIT_TYPES[unit.type].holds > 0;
  if (!colony || colony.owner === unit.owner || !carrier || unit.voyage !== null || Math.max(Math.abs(colony.x - unit.x), Math.abs(colony.y - unit.y)) !== 1) return no('noTarget', 'a ship or wagon train must lie beside the foreign colony');
  if (!atPeace(state, unit.owner, colony.owner)) return no('atWar', 'they will not trade with us while we are at war');
  if (!playerOf(state, unit.owner)?.fathers.includes('janDeWitt')) return no('noDeWitt', 'their laws forbid trade with foreigners');
  if (amountOf(unit.cargo, good) <= 0) return no('noCargo', 'there is no such cargo aboard');
  return amountOf(colony.goods, good) < warehouseCapacity(colony) ? { ok: true } : no('noRoom', 'their warehouse is full of it');
}

/** Sell one cargo to a foreign colony for cash: its owner pays a share of what the goods would fetch it at home, if it has the gold. */
export function sellAbroad(state: GameState, unit: Unit, colony: Colony, good: GoodId, events: DiplomacyEvent[]): GameState {
  const buyer = playerOf(state, colony.owner) as Player;
  const amount = Math.min(100, amountOf(unit.cargo, good), warehouseCapacity(colony) - amountOf(colony.goods, good));
  const gold = Math.min(buyer.gold, Math.trunc((bidPrice(state, colony.owner, good) * amount * D.foreignSale[0]) / D.foreignSale[1]));
  events.push({ type: 'soldAbroad', unitId: unit.id, colonyId: colony.id, good, amount, gold });
  return {
    ...state,
    units: { ...state.units, [unit.id]: { ...unit, cargo: addGoods(unit.cargo, good, -amount) } },
    colonies: { ...state.colonies, [colony.id]: { ...colony, goods: addGoods(colony.goods, good, amount) } },
    players: state.players.map((p) => (p.id === unit.owner ? { ...p, gold: p.gold + gold } : p.id === buyer.id ? { ...p, gold: p.gold - gold } : p)),
  };
}
