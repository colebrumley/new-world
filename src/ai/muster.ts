// How a computer power's colony sees to its own defence (docs/RULES.md "Computer powers: arming
// and taking in colonists"): each turn it may take back in the units standing on its square, and
// send one colonist out armed from its own stores.
import { validateAction, type Action } from '../engine/actions';
import { coloniesOf } from '../engine/colony';
import { AI_MUSTER } from '../engine/data/ai';
import { NATIONS } from '../engine/data/nations';
import { UNSKILLED, type ProfessionId } from '../engine/data/professions';
import { landmassAt } from '../engine/regions';
import type { Colonist, Colony, GameState, Player, Unit } from '../engine/state';
import type { Rng } from '../engine/rng';
import { defendersWanted, isTroop, memo, peopleAt, regionState } from './campaign';
import { wantsColonists } from './settle';

const far = (ax: number, ay: number, bx: number, by: number): number => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
const ok = (state: GameState, action: Action): boolean => validateAction(state, action).ok;
const stock = (colony: Colony, good: 'muskets' | 'horses' | 'tools'): number => colony.goods[good] ?? 0;
const skilled = (profession: ProfessionId): boolean => !UNSKILLED.includes(profession);
const afoot = (u: Unit): boolean => u.voyage === null && u.aboard === null;
const standing = (state: GameState, colony: Colony): Unit[] =>
  Object.values(state.units).filter((u) => u.owner === colony.owner && afoot(u) && u.x === colony.x && u.y === colony.y).sort((a, b) => (a.id < b.id ? -1 : 1));

export interface Muster {
  /** Defenders the colony wants for its size and the threat to it, and how many of those are not yet standing in it. */
  readonly wanted: number;
  readonly unmet: number;
  /** Troops it wants beyond those, and troops it has beyond those. */
  readonly extra: number;
  readonly surplus: number;
  /** Fewer troops than it wants; more than it wants. */
  readonly short: boolean;
  readonly over: boolean;
}

/** How a colony stands for defenders this turn. */
export function musterOf(state: GameState, colony: Colony): Muster {
  return memo(state, `muster:${colony.id}`, () => {
    const player = state.players.find((p) => p.id === colony.owner) as Player;
    const land = landmassAt(state.map, colony.x, colony.y);
    const wanted = defendersWanted(state, colony);
    const here = standing(state, colony).filter(isTroop).length;
    const unmet = Math.max(0, wanted - here);
    // troops belong to the colony they stand in, or the nearest of the power's within reach on the same land
    const mine = coloniesOf(state, colony.owner);
    const belongs = (u: Unit): boolean => {
      if (u.x === colony.x && u.y === colony.y) return true;
      if (landmassAt(state.map, u.x, u.y) !== land || far(u.x, u.y, colony.x, colony.y) > AI_MUSTER.ownRange) return false;
      const nearest = mine.filter((c) => landmassAt(state.map, c.x, c.y) === land).reduce((a, b) => (far(b.x, b.y, u.x, u.y) < far(a.x, a.y, u.x, u.y) ? b : a), colony);
      return nearest.id === colony.id;
    };
    const assigned = Object.values(state.units).filter((u) => u.owner === colony.owner && afoot(u) && isTroop(u) && belongs(u)).length;
    const surplus = assigned - Math.min(wanted, here);
    const bent = NATIONS[player.nation].leaderTraits.civilizing;
    const stance = regionState(state, player, land);
    const sum = ((3 * peopleAt(state, colony)) >> 1) - bent - Math.trunc(state.turn / AI_MUSTER.turnsPerStep) + (stance === 0 ? AI_MUSTER.quietBonus : stance === 3 ? AI_MUSTER.defendedBonus : 0);
    const by = bent + AI_MUSTER.divisor + (unmet > 0 ? 1 : 0) - (stance === 4 ? 1 : 0);
    let extra = Math.trunc(sum / by);
    const natives = Object.values(state.settlements).some((s) => landmassAt(state.map, s.x, s.y) === land);
    const isRival = (owner: string): boolean => owner !== colony.owner && state.players.some((p) => p.id === owner);
    const rivals = Object.values(state.colonies).some((c) => isRival(c.owner) && landmassAt(state.map, c.x, c.y) === land)
      || Object.values(state.units).some((u) => isRival(u.owner) && afoot(u) && landmassAt(state.map, u.x, u.y) === land);
    const beachhead = Object.values(state.units).some((u) => u.owner === colony.owner && afoot(u) && isTroop(u) && (u.orders === 'fortify' || u.orders === 'fortified')
      && landmassAt(state.map, u.x, u.y) === land && !mine.some((c) => c.x === u.x && c.y === u.y));
    if (!natives && !rivals && !beachhead && stance !== 0) extra = 0;
    if (natives && rivals && player.nation !== AI_MUSTER.unbounded) extra = Math.min(extra, AI_MUSTER.extraMostAmongRivals);
    return { wanted, unmet, extra, surplus, short: extra > surplus, over: extra + (extra > 1 ? 1 : 0) < surplus };
  });
}

/** One of the units on the colony's square that it takes back in this turn, if it wants colonists. `swapOnly` once a soldier has been taken for being one too many. */
export function takeIn(state: GameState, colony: Colony, swapOnly = false): Unit | null {
  if (!wantsColonists(state, colony) || colony.colonists.length >= AI_MUSTER.most) return null;
  const player = state.players.find((p) => p.id === colony.owner) as Player;
  const quiet = regionState(state, player, landmassAt(state.map, colony.x, colony.y)) === 0;
  const muster = musterOf(state, colony);
  const inside = (test: (c: Colonist) => boolean): boolean => colony.colonists.some(test);
  for (const u of standing(state, colony)) {
    if (u.profession === null || !ok(state, { type: 'joinColony', unitId: u.id })) continue;
    if (u.type === 'colonist') return u;
    if (u.type === 'pioneer' && (quiet || stock(colony, 'tools') < AI_MUSTER.pioneerTools)) return u;
    if (u.type === 'scout' && (quiet || stock(colony, 'horses') < AI_MUSTER.dragoonHorses)) return u;
    if (u.type === 'soldier' || u.type === 'dragoon') {
      // a skilled man under arms changes places with an unskilled one or a veteran working inside
      const swap = skilled(u.profession) && u.profession !== 'veteranSoldier' && inside((c) => !skilled(c.profession) || c.profession === 'veteranSoldier');
      if (swap || (muster.over && !swapOnly)) return u;
    }
  }
  return null;
}

export interface SendOut {
  readonly colonist: Colonist;
  readonly role: 'soldier' | 'dragoon' | 'scout';
  /** A skilled man who takes up arms is a free colonist from then on. */
  readonly unlearn: boolean;
}

/** The colonist a colony of two or more sends out this turn, and as what: at most one. `often` is the turn's one chance in four. */
export function sendOut(state: GameState, colony: Colony, often: boolean): SendOut | null {
  const pop = colony.colonists.length;
  if (pop < 2) return null;
  const player = state.players.find((p) => p.id === colony.owner) as Player;
  const wants = wantsColonists(state, colony);
  const muster = musterOf(state, colony);
  const quiet = regionState(state, player, landmassAt(state.map, colony.x, colony.y)) === 0;
  let role: SendOut['role'] | null = null;
  if (stock(colony, 'horses') >= AI_MUSTER.scoutHorses && (pop >= AI_MUSTER.scoutFrom || AI_MUSTER.cap <= pop) && !wants) role = 'scout';
  const spare = quiet && pop > AI_MUSTER.spareOver && often && !wants;
  if ((muster.unmet > 0 || muster.short || spare) && stock(colony, 'muskets') >= AI_MUSTER.muskets) role = stock(colony, 'horses') >= AI_MUSTER.dragoonHorses ? 'dragoon' : 'soldier';
  if (role === null) return null;
  const calling: ProfessionId = role === 'scout' ? 'seasonedScout' : 'veteranSoldier';
  let best: Colonist | null = null;
  let top = -1;
  for (const c of colony.colonists) {
    if (c.profession === 'indianConvert') continue;
    let score = 0;
    if (c.profession === calling) score = AI_MUSTER.rank.expert;
    else if (!skilled(c.profession)) score = c.profession === 'pettyCriminal' ? AI_MUSTER.rank.pettyCriminal : c.profession === 'indenturedServant' ? AI_MUSTER.rank.indenturedServant : AI_MUSTER.rank.freeColonist;
    // a man with a trade is armed only while the colony's first want of defenders is unmet
    else if (role !== 'scout' && muster.unmet === 0) continue;
    if (score >= top) {
      top = score;
      best = c;
    }
  }
  return best ? { colonist: best, role, unlearn: skilled(best.profession) && best.profession !== calling } : null;
}

/** What each turn has under way, kept with the turn's own record of who has been seen to. */
const under = new WeakMap<Set<string>, Map<string, SendOut>>();

/**
 * The next step of the colony's muster this turn: units taken in one by one, then one colonist
 * sent out (his trade given up if need be, out of the gate, then armed). `done` is the turn's record.
 */
export function musterAction(state: GameState, colony: Colony, done: Set<string>, rng: Rng): Action | null {
  const sending = under.get(done) ?? new Map<string, SendOut>();
  under.set(done, sending);
  const pending = sending.get(colony.id);
  if (pending) {
    const inside = colony.colonists.find((c) => c.id === pending.colonist.id);
    const outside = state.units[pending.colonist.id];
    if (inside) {
      const unlearn: Action = { type: 'clearSpecialty', colonyId: colony.id, colonistId: inside.id };
      if (pending.unlearn && skilled(inside.profession) && ok(state, unlearn)) return unlearn;
      const leave: Action = { type: 'leaveColony', colonyId: colony.id, colonistId: inside.id };
      if (ok(state, leave)) return leave;
    } else if (outside && outside.type === 'colonist') {
      const arm: Action = { type: 'equip', unitId: outside.id, role: pending.role };
      if (ok(state, arm)) return arm;
      // the stores fell short after all: back to work
      const back: Action = { type: 'joinColony', unitId: outside.id };
      sending.delete(colony.id);
      return ok(state, back) ? back : null;
    }
    sending.delete(colony.id);
    return null;
  }
  if (!done.has(`#in:${colony.id}`)) {
    const unit = takeIn(state, colony, done.has(`#swap:${colony.id}`));
    if (unit) {
      if (unit.type === 'soldier' || unit.type === 'dragoon') done.add(`#swap:${colony.id}`);
      return { type: 'joinColony', unitId: unit.id };
    }
    done.add(`#in:${colony.id}`);
  }
  if (done.has(`#out:${colony.id}`)) return null;
  done.add(`#out:${colony.id}`);
  const choice = sendOut(state, colony, rng.int(1, AI_MUSTER.oftenOdds) === 1);
  if (!choice) return null;
  sending.set(colony.id, choice);
  return musterAction(state, colony, done, rng);
}
