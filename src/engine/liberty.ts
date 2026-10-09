// Sons of Liberty (R-306): membership of a colony, the production bonus and Tory penalty it
// brings, and the turn-by-turn drift of membership with the bells rung.
import { LIBERTY } from './data/liberty';
import { DIFFICULTIES } from './data/yields';
import { hasFather, type Colony, type GameState, type PlayerId } from './state';

function isHuman(state: GameState, owner: PlayerId): boolean {
  return state.players.find((p) => p.id === owner)?.kind === 'human';
}

/** Sons of Liberty membership of a colony, percent. */
export function solPercent(state: GameState, colony: Colony): number {
  const raw = colony.sol.d > 0 ? Math.floor((colony.sol.n * 100) / colony.sol.d) : 0;
  const bolivar = isHuman(state, colony.owner) && hasFather(state, colony.owner, LIBERTY.bolivar) ? LIBERTY.bolivarPoints : 0;
  return Math.min(100, Math.max(0, raw) + bolivar);
}

function threshold(state: GameState): number {
  return LIBERTY.toryThreshold[state.difficulty] ?? 10 - DIFFICULTIES.indexOf(state.difficulty);
}

/** Production lost per worker to Tory obstruction. Human colonies only. */
export function toryPenalty(state: GameState, colony: Colony): number {
  if (!isHuman(state, colony.owner)) return 0;
  const tories = Math.floor((colony.colonists.length * (100 - solPercent(state, colony)) + 50) / 100);
  return Math.floor(tories / threshold(state));
}

/** Tories as counted for the notice (no rounding term), against the same threshold. */
export function toriesAreObstructing(state: GameState, colony: Colony): boolean {
  if (!isHuman(state, colony.owner)) return false;
  return Math.floor((colony.colonists.length * (100 - solPercent(state, colony))) / 100) >= threshold(state);
}

/** What every worker of the colony gains or loses per turn: the earned bonus less the Tory penalty. */
export function solProductionTerm(state: GameState, colony: Colony): number {
  return colony.solLevel - toryPenalty(state, colony);
}

/** Bells a colony rings in a turn, given what its statesmen make between them. */
export function colonyBells(state: GameState, colony: Colony, statesmen: number): number {
  const owner = state.players.find((p) => p.id === colony.owner);
  let total = statesmen + LIBERTY.freeBells;
  if (hasFather(state, colony.owner, LIBERTY.jefferson)) total += Math.floor(total / 2);
  if (hasFather(state, colony.owner, LIBERTY.paine)) total += Math.floor((total * (owner?.taxRate ?? 0)) / 100);
  if (owner?.kind === 'ai' && hasFather(state, colony.owner, LIBERTY.bolivar)) total += Math.floor((colony.colonists.length + 3) / 5);
  // a Newspaper doubles; otherwise a Printing Press adds half. They do not stack.
  if (colony.buildings.includes('newspaper')) total *= 2;
  else if (colony.buildings.includes('printingPress')) total += Math.floor(total / 2);
  return total;
}

export type LibertyEvent =
  | { readonly type: 'rebelMajority'; readonly colonyId: string; readonly percent: number }
  | { readonly type: 'rebelUnanimous'; readonly colonyId: string; readonly percent: number }
  /** Membership fell far enough to lose the second bonus. */
  | { readonly type: 'toryMinority'; readonly colonyId: string; readonly percent: number }
  /** Membership fell below half; the first bonus is lost. */
  | { readonly type: 'toryMajority'; readonly colonyId: string; readonly percent: number }
  | { readonly type: 'membershipChanged'; readonly colonyId: string; readonly percent: number; readonly rising: boolean }
  | { readonly type: 'toriesObstruct'; readonly colonyId: string }
  | { readonly type: 'toriesSubside'; readonly colonyId: string };

/** End-of-turn drift of a colony's membership with the bells rung this turn, and the notices it brings. */
export function updateLiberty(state: GameState, colony: Colony, bells: number, events: LibertyEvent[]): Colony {
  const pop = colony.colonists.length;
  const old = solPercent(state, colony);
  let b = bells;
  if (b < pop) b -= Math.floor(old / LIBERTY.smallColonyDivisor);
  let d = colony.sol.d - Math.floor(colony.sol.d / LIBERTY.decayDivisor);
  if (d < 1) d = 1;
  d += LIBERTY.denominatorPerColonist * pop;
  const n = Math.max(0, Math.min(d, colony.sol.n + b - Math.floor(colony.sol.n / LIBERTY.decayDivisor)));
  let next: Colony = { ...colony, sol: { n, d } };
  const now = solPercent(state, next);

  // one step per turn, first match wins
  if (now >= LIBERTY.majority && next.solLevel < 1) {
    next = { ...next, solLevel: 1 };
    events.push({ type: 'rebelMajority', colonyId: colony.id, percent: now });
  } else if (now >= LIBERTY.unanimous && next.solLevel < 2) {
    next = { ...next, solLevel: 2 };
    events.push({ type: 'rebelUnanimous', colonyId: colony.id, percent: now });
  } else if (now < LIBERTY.unanimousKeptAbove && next.solLevel === 2) {
    next = { ...next, solLevel: 1 };
    events.push({ type: 'toryMinority', colonyId: colony.id, percent: now });
  } else if (now < LIBERTY.majority && next.solLevel === 1) {
    next = { ...next, solLevel: 0 };
    events.push({ type: 'toryMajority', colonyId: colony.id, percent: now });
  } else if (Math.floor(old / 10) < Math.floor(now / 10)) {
    events.push({ type: 'membershipChanged', colonyId: colony.id, percent: now, rising: true });
  } else if (Math.floor(old / 10) > Math.floor((now + 4) / 10)) {
    events.push({ type: 'membershipChanged', colonyId: colony.id, percent: now, rising: false });
  }

  const obstructing = toriesAreObstructing(state, next);
  if (obstructing && !next.toryNoticed) {
    next = { ...next, toryNoticed: true };
    events.push({ type: 'toriesObstruct', colonyId: colony.id });
  } else if (!obstructing && next.toryNoticed) {
    next = { ...next, toryNoticed: false };
    events.push({ type: 'toriesSubside', colonyId: colony.id });
  }
  return next;
}

/** Rebel sentiment across all of a power's colonies: membership weighted by population. */
export function rebelSentiment(state: GameState, owner: PlayerId): number {
  let members = 0;
  let people = 0;
  for (const colony of Object.values(state.colonies)) {
    if (colony.owner !== owner) continue;
    members += solPercent(state, colony) * colony.colonists.length;
    people += colony.colonists.length;
  }
  return people === 0 ? 0 : Math.floor(members / people);
}

/** How the population number on the map is coloured: plain, majority, unanimous. */
export function membershipBand(state: GameState, colony: Colony): 'minority' | 'majority' | 'unanimous' {
  const percent = solPercent(state, colony);
  return percent >= LIBERTY.unanimous ? 'unanimous' : percent >= LIBERTY.majority ? 'majority' : 'minority';
}
