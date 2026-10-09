// Headless simulation harness (R-005): N AI players stepped to a turn limit with the engine
// invariants asserted after every action.
import { randomAction } from '../../src/ai/random';
import { equipmentOf, totalGoods } from '../../src/engine/cargo';
import { GOOD_IDS, type GoodId } from '../../src/engine/data/goods';
import { PIONEER_TOOLS } from '../../src/engine/data/units';
import { applyAction, type Action, type GameEvent } from '../../src/engine/actions';
import type { WorldOptions } from '../../src/engine/data/mapgen';
import { createGame } from '../../src/engine/game';
import { checkInvariants } from '../../src/engine/invariants';
import { createRng, type Rng } from '../../src/engine/rng';
import type { GameState, Unit } from '../../src/engine/state';

export type Policy = (state: GameState, rng: Rng) => Action;

export interface SimOptions {
  readonly seed: number | string;
  readonly players: number;
  readonly turns: number;
  readonly policy?: Policy;
  /** Play on a generated New World instead of the small test map. */
  readonly world?: WorldOptions;
  /** Safety valve: a player that has not ended its turn after this many actions is forced to. */
  readonly maxActionsPerPlayerTurn?: number;
}

export interface SimResult {
  readonly state: GameState;
  readonly actions: number;
  readonly events: Readonly<Record<string, number>>;
}

export class InvariantViolation extends Error {
  constructor(turn: number, action: Action, problems: readonly string[]) {
    super(`turn ${turn} after ${JSON.stringify(action)}:\n  ${problems.join('\n  ')}`);
    this.name = 'InvariantViolation';
  }
}

/** Keep the goods ledger in step with what the events say appeared or vanished. `state` is the state after them. */
export function tally(goods: Record<GoodId, number>, events: readonly GameEvent[], state: GameState): void {
  for (const e of events) {
    if (e.type === 'tileImproved') goods.tools -= PIONEER_TOOLS.perAction;
    if (e.type === 'lumberSalvaged') goods.lumber += e.amount;
    if (e.type === 'cargoMoved' && e.to === 'sea') goods[e.good] -= e.amount;
    if (e.type === 'buildingCompleted' || e.type === 'unitBuilt') goods.tools -= e.tools;
    if (e.type === 'constructionBought') goods.tools += e.tools;
    if (e.type === 'goodsSpoiled') for (const good of GOOD_IDS) goods[good] -= e.lost[good] ?? 0;
    if (e.type === 'partyHeld') goods[e.good] -= e.destroyed;
    if (e.type === 'goodsSold' || e.type === 'customHouseSold') goods[e.good] -= e.amount;
    if (e.type === 'goodsBought' || e.type === 'colonySupplied') goods[e.good] += e.amount;
    if (e.type === 'tributeDemanded' && e.good) goods[e.good] += e.amount;
    if (e.type === 'nativeSale') goods[e.good] -= e.amount;
    // goods sold abroad stay in the world: they only change hands
    if (e.type === 'musketsIssued') goods.muskets -= e.amount;
    if (e.type === 'colonyInfiltrated' && e.caught) goods.horses += 50;
    if (e.type === 'unitLost' || e.type === 'colonyBurned' || e.type === 'rumorExplored' || e.type === 'shipDamaged' || e.type === 'shipSunk') for (const good of GOOD_IDS) goods[good] -= e.lost[good] ?? 0;
    if (e.type === 'colonyRaided' && e.good) goods[e.good] -= e.amount;
    if (e.type === 'nativeGift') goods[e.good] += e.amount;
    if (e.type === 'demandAnswered' && e.given) goods[e.demand.good] -= e.taken;
    if (e.type === 'nativePurchase') goods[e.good] += e.amount;
    if (e.type === 'hostileEntry') for (const good of GOOD_IDS) goods[good] -= e.lost[good] ?? 0;
    // newcomers and University graduates step ashore with their kit
    if (e.type === 'immigrantArrived' || e.type === 'unitTrained') {
      const kit = equipmentOf(state.units[e.unitId] ?? ({ type: 'colonist' } as Unit));
      for (const good of GOOD_IDS) goods[good] += kit[good] ?? 0;
    }
    if (e.type === 'colonistBorn') goods.food -= e.food;
    if (e.type === 'colonyVanished') for (const good of GOOD_IDS) goods[good] -= e.lost[good] ?? 0;
    if (e.type === 'colonyProduced') for (const good of GOOD_IDS) goods[good] += e.delta[good] ?? 0;
    // the Crown takes what lay in Europe; those who leave take their kit; Tories find arms of their own
    if (e.type === 'unitsSeized' || e.type === 'unitOverrun' || e.type === 'powerWithdrew' || e.type === 'succession') for (const good of GOOD_IDS) goods[good] -= e.lost[good] ?? 0;
    // a veteran who takes Continental colours is no longer reckoned by his muskets and horse: they are part of him now
    if (e.type === 'continentalsMustered' || (e.type === 'unitPromoted' && (e.became === 'continentalArmy' || e.became === 'continentalCavalry'))) {
      for (const id of e.type === 'continentalsMustered' ? e.unitIds : [e.unitId]) {
        goods.muskets -= 50;
        if (state.units[id]?.type === 'continentalCavalry' || (e.type === 'unitPromoted' && e.became === 'continentalCavalry')) goods.horses -= 50;
      }
    }
    if (e.type === 'toryUprising') {
      for (const id of e.unitIds) {
        const kit = equipmentOf(state.units[id] ?? ({ type: 'colonist' } as Unit));
        for (const good of GOOD_IDS) goods[good] += kit[good] ?? 0;
      }
    }
  }
}

export function runSim(options: SimOptions): SimResult {
  const policy = options.policy ?? randomAction;
  const cap = options.maxActionsPerPlayerTurn ?? 200;
  const rng = createRng(options.seed).fork('sim-policy');
  const players = Array.from({ length: options.players }, (_, i) => ({ id: `ai${i}`, name: `AI ${i}`, kind: 'ai' as const }));
  let state = createGame({ seed: options.seed, players, ...(options.world ? { world: options.world } : {}) });

  const initial = checkInvariants(state);
  if (initial.length > 0) throw new InvariantViolation(0, { type: 'endTurn' }, initial);

  const goods = totalGoods(state);
  const counts: Record<string, number> = {};
  let actions = 0;
  let inTurn = 0;
  while (state.turn < options.turns && !state.over) {
    const action: Action = inTurn >= cap ? { type: 'endTurn' } : policy(state, rng);
    inTurn = action.type === 'endTurn' ? 0 : inTurn + 1;
    const result = applyAction(state, action);
    state = result.state;
    actions++;
    for (const e of result.events as readonly GameEvent[]) counts[e.type] = (counts[e.type] ?? 0) + 1;
    const problems = checkInvariants(state);
    // Goods conservation: every action must leave the grand total alone apart from the known
    // sources and sinks. Later phases add production, trade and spoilage to that list.
    // The only sources and sinks so far: a finished pioneer job uses 20 tools, and clearing
    // forest near a colony yields lumber.
    tally(goods, result.events, state);
    const now = totalGoods(state);
    for (const good of GOOD_IDS) if (now[good] !== goods[good]) problems.push(`${good} changed from ${goods[good]} to ${now[good]}`);
    if (problems.length > 0) throw new InvariantViolation(state.turn, action, problems);
  }
  return { state, actions, events: counts };
}
