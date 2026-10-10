// Missionaries of the computer powers, and what any of their units does on entering a native
// settlement (R-805; docs/RULES.md "Computer powers: missions").
import { validateAction, type Action } from '../engine/actions';
import { settlementAlarm, tribalAlarm } from '../engine/alarm';
import { coloniesOf } from '../engine/colony';
import { AI_MISSIONS } from '../engine/data/ai';
import { UNSKILLED } from '../engine/data/professions';
import { UNIT_TYPES } from '../engine/data/units';
import { docksOf } from '../engine/europe';
import { landmassAt } from '../engine/regions';
import { colonyAt, type GameState, type Player, type PlayerId, type Settlement, type Unit } from '../engine/state';
import type { Rng } from '../engine/rng';
import { aiRng, settlementsOn } from './wagons';

const far = (ax: number, ay: number, bx: number, by: number): number => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
const ok = (state: GameState, action: Action): boolean => validateAction(state, action).ok;

/** How a power stands among the powers: its gold by the hundred, twice its colonies, its colonists, and its strength on land. */
export function powerRank(state: GameState, playerId: PlayerId): number {
  const player = state.players.find((p) => p.id === playerId);
  const colonies = coloniesOf(state, playerId);
  const colonists = colonies.reduce((n, c) => n + c.colonists.length, 0);
  const strength = Object.values(state.units).reduce((n, u) => n + (u.owner === playerId && UNIT_TYPES[u.type].domain === 'land' ? UNIT_TYPES[u.type].attack : 0), 0);
  return Math.trunc((player?.gold ?? 0) / AI_MISSIONS.rankGoldPer) + AI_MISSIONS.rankPerColony * colonies.length + colonists + strength;
}

/** The human player a computer power sets the tribes against. */
const humanOf = (state: GameState, me: PlayerId): Player | null => state.players.find((p) => p.kind === 'human' && p.id !== me && !p.withdrawn) ?? null;

/**
 * Could this power set the settlement's tribe on the human player, as far as the tribe and the
 * two powers' standing go? `gold` is what the power must hold.
 */
export function mayIncite(state: GameState, me: PlayerId, settlement: Settlement, gold: number): PlayerId | null {
  const human = humanOf(state, me);
  const mine = state.players.find((p) => p.id === me);
  if (!human || !mine || mine.gold < gold) return null;
  if (!state.tribes[settlement.tribe]?.met.includes(human.id) || tribalAlarm(state, settlement.tribe, human.id) >= AI_MISSIONS.inciteAlarmBelow) return null;
  return powerRank(state, me) < powerRank(state, human.id) ? human.id : null;
}

/** Where a decision's chances come from; tests put their own in. */
export type Chances = (label: string) => Rng;
const chancesOf = (state: GameState): Chances => (label) => aiRng(state, label);

/** Is a missionary due to be made of this colonist waiting on the docks, on this turn? */
export function missionaryDue(state: GameState, player: Player, unit: Unit, chances: Chances = chancesOf(state)): boolean {
  if (unit.type !== 'colonist' || unit.profession === null || unit.profession === 'indianConvert') return false;
  if (Object.values(state.units).some((u) => u.owner === player.id && u.type === 'missionary')) return false;
  if (state.turn <= AI_MISSIONS.afterTurn || state.turn % AI_MISSIONS.every !== 0) return false;
  if (state.turn >= AI_MISSIONS.rarerFrom && chances(`${player.id}:missionary`).int(1, AI_MISSIONS.rarerOdds) !== 1) return false;
  return UNSKILLED.includes(unit.profession) || chances(`${unit.id}:missionary`).int(1, AI_MISSIONS.skilledOdds) === 1;
}

/** The order that makes a missionary on the docks, when one is due: the unskilled are looked at before the skilled. */
export function ordain(state: GameState, player: Player, chances: Chances = chancesOf(state)): Action | null {
  const waiting = docksOf(state, player.id);
  const order = [...waiting.filter((u) => UNSKILLED.includes(u.profession ?? 'freeColonist')), ...waiting.filter((u) => !UNSKILLED.includes(u.profession ?? 'freeColonist'))];
  for (const unit of order) {
    if (!missionaryDue(state, player, unit, chances)) continue;
    const bless: Action = { type: 'equipInEurope', unitId: unit.id, role: 'missionary' };
    if (ok(state, bless)) return bless;
  }
  return null;
}

/**
 * Where a missionary goes: the settlement on its landmass where the tribe is angriest at its
 * own power and nearest, a capital counting half again. One that already holds its own
 * mission is passed over unless there is inciting to be done there.
 */
export function missionTarget(state: GameState, unit: Unit): Settlement | null {
  let best: Settlement | null = null;
  let top = -1;
  for (const s of settlementsOn(state, landmassAt(state.map, unit.x, unit.y))) {
    if (s.mission?.owner === unit.owner && mayIncite(state, unit.owner, s, AI_MISSIONS.inciteJourneyGold) === null) continue;
    let score = Math.trunc((tribalAlarm(state, s.tribe, unit.owner) * AI_MISSIONS.alarmWeight) / (far(s.x, s.y, unit.x, unit.y) + 1));
    if (s.capital) score += score >> 1;
    if (score > top) {
      top = score;
      best = s;
    }
  }
  return best;
}

/**
 * What a unit of a computer power does on entering a settlement, by its kind: a wagon train
 * trades, a scout speaks with the chief, soldiers, dragoons and artillery attack, a missionary
 * incites, founds a mission or denounces a rival's, and a free colonist or servant lives among
 * the natives while the tribe is not hostile. Nothing else is done there; tribute is never demanded.
 */
export function villageEntry(state: GameState, unit: Unit, settlement: Settlement, chances: Chances = chancesOf(state)): Action | null {
  const enter = (action: Extract<Action, { type: 'enterSettlement' }>['action'], target?: PlayerId): Action =>
    ({ type: 'enterSettlement', unitId: unit.id, settlementId: settlement.id, action, ...(target === undefined ? {} : { target }) });
  switch (unit.type) {
    case 'wagonTrain': return enter('trade');
    case 'scout': return enter('speakWithChief');
    case 'soldier':
    case 'dragoon':
    case 'artillery': return enter('attack');
    case 'missionary': {
      const human = mayIncite(state, unit.owner, settlement, AI_MISSIONS.inciteGold);
      const willing = settlement.mission !== null || chances(`${unit.id}:incite`).int(1, AI_MISSIONS.inciteOdds) <= AI_MISSIONS.inciteTimes;
      if (human !== null && willing && ok(state, enter('incite', human))) return enter('incite', human);
      if (!settlement.mission) return enter('establishMission');
      return settlement.mission.owner === unit.owner ? null : enter('denounce');
    }
    case 'colonist': {
      const plain = unit.profession === 'freeColonist' || unit.profession === 'indenturedServant';
      return plain && tribalAlarm(state, settlement.tribe, unit.owner) < AI_MISSIONS.liveAmongAlarmBelow ? enter('liveAmong') : null;
    }
    default: return null;
  }
}

/**
 * A colonist or scout passing a settlement steps in when the people are friendly: a free
 * colonist or servant where nobody has yet been taught, a scout where nobody's scout has yet
 * spoken with the chief (a chief has nothing for a second caller).
 */
export function villageVisit(state: GameState, unit: Unit): Action | null {
  if (unit.movesLeft <= 0 || unit.aboard !== null || (unit.type !== 'colonist' && unit.type !== 'scout')) return null;
  for (const s of Object.values(state.settlements)) {
    if (far(s.x, s.y, unit.x, unit.y) !== 1 || tribalAlarm(state, s.tribe, unit.owner) >= AI_MISSIONS.visitAlarmBelow) continue;
    const due = unit.type === 'scout' ? s.scouted.length === 0 : !s.taught && settlementAlarm(s, unit.owner) < AI_MISSIONS.visitSettlementAlarmBelow;
    const entry = due ? villageEntry(state, unit, s) : null;
    if (entry && ok(state, entry)) return entry;
  }
  return null;
}

/** The next thing a missionary on land does, or null when there is nothing for it just now. */
export function missionaryAction(state: GameState, unit: Unit): Action | null {
  if (unit.orders === 'goto') return null;
  const target = missionTarget(state, unit);
  if (!target) {
    // nowhere to preach: back to a colony, and a colonist again
    const here = colonyAt(state, unit.x, unit.y);
    const lay: Action = { type: 'equip', unitId: unit.id, role: 'colonist' };
    if (here?.owner === unit.owner) return ok(state, lay) ? lay : null;
    const land = landmassAt(state.map, unit.x, unit.y);
    const home = coloniesOf(state, unit.owner)
      .filter((c) => landmassAt(state.map, c.x, c.y) === land)
      .sort((a, b) => far(a.x, a.y, unit.x, unit.y) - far(b.x, b.y, unit.x, unit.y))[0];
    const go: Action | null = home ? { type: 'goTo', unitId: unit.id, x: home.x, y: home.y } : null;
    return go && ok(state, go) ? go : null;
  }
  if (far(target.x, target.y, unit.x, unit.y) > 1) {
    const squares: (readonly [number, number])[] = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx !== 0 || dy !== 0) squares.push([target.x + dx, target.y + dy]);
    squares.sort((a, b) => far(a[0], a[1], unit.x, unit.y) - far(b[0], b[1], unit.x, unit.y));
    for (const [x, y] of squares) {
      const go: Action = { type: 'goTo', unitId: unit.id, x, y };
      if (ok(state, go)) return go;
    }
    return null;
  }
  if (unit.movesLeft <= 0) return null;
  const entry = villageEntry(state, unit, target);
  return entry && ok(state, entry) ? entry : null;
}
