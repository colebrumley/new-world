// The Continental Congress (R-701): liberty bells buy Founding Fathers one at a time. A power
// first settles on a candidate (a human chooses from one name per field; a computer power takes
// the field it has most left in), then gathers the bells he costs. Joining may do something at
// once; lasting effects are read by the rules that ask hasFather().
import { adjustTribalAlarm, type AlarmEvent, type AlarmSink } from './alarm';
import { dateOfTurn } from './calendar';
import { CONGRESS } from './data/congress';
import { FATHER_CATEGORIES, FATHER_ERAS, FATHER_IDS, FATHERS, type FatherCategory, type FatherId } from './data/fathers';
import { TRIBE_IDS } from './data/tribes';
import { DIFFICULTIES } from './data/yields';
import { revealAround } from './explore';
import { brewsterPool } from './immigration';
import { freeConverts } from './missions';
import { createRng, type Rng } from './rng';
import { sendFrigate, type RoyalEvent } from './royal';
import type { GameState, Player, PlayerId } from './state';
import { liftAllBoycotts } from './tax';
import type { VoyageEvent } from './voyage';

export type CongressEvent =
  | AlarmEvent
  | RoyalEvent
  | VoyageEvent
  /** The Congress asks a human power whom to work toward next. */
  | { readonly type: 'congressConvened'; readonly player: PlayerId; readonly offer: readonly FatherId[] }
  | { readonly type: 'candidateChosen'; readonly player: PlayerId; readonly father: FatherId }
  | { readonly type: 'fatherJoined'; readonly player: PlayerId; readonly father: FatherId; readonly count: number };

export type CongressErrorCode = 'notOffered';
export type CongressCheck = { readonly ok: true } | { readonly ok: false; readonly code: CongressErrorCode; readonly message: string };

const playerOf = (state: GameState, id: string): Player | undefined => state.players.find((p) => p.id === id);
const patch = (state: GameState, id: PlayerId, change: Partial<Player>): GameState => ({ ...state, players: state.players.map((p) => (p.id === id ? { ...p, ...change } : p)) });

/** Which column of offer weights applies in this year: 0 before 1600, 1 until 1700, 2 after. */
export function fatherEra(state: GameState): 0 | 1 | 2 {
  const { year } = dateOfTurn(state.turn);
  return year < FATHER_ERAS[0] ? 0 : year < FATHER_ERAS[1] ? 1 : 2;
}

/** Bells the next Founding Father costs this power. */
export function fatherCost(state: GameState, playerId: PlayerId): number {
  const player = playerOf(state, playerId);
  if (!player) return Infinity;
  const d = DIFFICULTIES.indexOf(state.difficulty);
  let base = player.kind === 'human' ? CONGRESS.humanBase * (d + CONGRESS.humanLevelOffset) : CONGRESS.aiBase * (CONGRESS.aiLevelFrom - d);
  const { year } = dateOfTurn(state.turn);
  for (const from of CONGRESS.dearerFrom) if (year >= from) base += base >> 1;
  const cost = (player.fathers.length + 1) * base + 1;
  return player.fathers.length === 0 ? cost >> 1 : cost;
}

/** One name from each field that still has someone to offer, drawn by this era's weights. */
export function drawCandidates(state: GameState, playerId: PlayerId, rng: Rng): Partial<Record<FatherCategory, FatherId>> {
  const player = playerOf(state, playerId);
  const era = fatherEra(state);
  const out: Partial<Record<FatherCategory, FatherId>> = {};
  for (const category of FATHER_CATEGORIES) {
    const open = FATHER_IDS.filter((id) => FATHERS[id].category === category && FATHERS[id].weights[era] > 0 && !player?.fathers.includes(id));
    const total = open.reduce((sum, id) => sum + FATHERS[id].weights[era], 0);
    if (total === 0) continue;
    let roll = rng.int(1, total);
    for (const id of open) {
      roll -= FATHERS[id].weights[era];
      if (roll <= 0) {
        out[category] = id;
        break;
      }
    }
  }
  return out;
}

/** What happens the moment a Founding Father joins (many do nothing at once). */
export function fatherArrives(state: GameState, playerId: PlayerId, father: FatherId, rng: Rng, events: CongressEvent[]): GameState {
  const player = playerOf(state, playerId) as Player;
  switch (father) {
    case 'jakobFugger':
      return liftAllBoycotts(state, playerId);
    case 'laSalle': {
      const colonies = Object.fromEntries(Object.values(state.colonies).map((c) => [
        c.id,
        c.owner === playerId && c.colonists.length >= CONGRESS.laSallePopulation && !c.buildings.includes('stockade') ? { ...c, buildings: [...c.buildings, 'stockade'] } : c,
      ]));
      return { ...state, colonies };
    }
    case 'johnPaulJones':
      return sendFrigate(state, playerId, events as (RoyalEvent | VoyageEvent)[]).state;
    case 'pocahontas': {
      // every grievance is forgotten
      let next = state;
      for (const tribe of TRIBE_IDS) {
        const t = next.tribes[tribe]?.alarm[playerId] ?? 0;
        if (t > 0) next = adjustTribalAlarm(next, tribe, playerId, -t, rng, events as AlarmSink);
      }
      const settlements = Object.fromEntries(Object.values(next.settlements).map((s) => [s.id, (s.alarm[playerId] ?? 0) > 0 ? { ...s, alarm: { ...s.alarm, [playerId]: 0 } } : s]));
      return { ...next, settlements };
    }
    case 'jeanDeBrebeuf': {
      const settlements = Object.fromEntries(Object.values(state.settlements).map((s) => [s.id, s.mission?.owner === playerId && !s.mission.expert ? { ...s, mission: { owner: playerId, expert: true } } : s]));
      return { ...state, settlements };
    }
    case 'bartolomeDeLasCasas':
      return freeConverts(state, playerId);
    case 'franciscoCoronado': {
      // every colony of every power, and the country around it
      const index = state.players.indexOf(player);
      let map = state.map;
      for (const c of Object.values(state.colonies)) map = revealAround(map, index, c.x, c.y, CONGRESS.coronadoRadius).map;
      return { ...state, map };
    }
    case 'williamBrewster':
      return patch(state, playerId, { pool: brewsterPool(player.pool) });
    default:
      return state;
  }
}

function join(state: GameState, playerId: PlayerId, father: FatherId, rng: Rng, events: CongressEvent[]): GameState {
  const player = playerOf(state, playerId) as Player;
  const fathers = [...player.fathers, father];
  events.push({ type: 'fatherJoined', player: playerId, father, count: fathers.length });
  // what was gathered beyond his price is lost
  const seated = patch(state, playerId, { fathers, fatherBells: 0, candidate: null, fatherOffer: [] });
  return fatherArrives(seated, playerId, father, rng, events);
}

/** A computer power's choice: the field in which it has most left to gain this era (the later field on a tie). */
function aiCandidate(state: GameState, playerId: PlayerId, drawn: Partial<Record<FatherCategory, FatherId>>): FatherId | null {
  const player = playerOf(state, playerId);
  const era = fatherEra(state);
  let best: FatherId | null = null;
  let most = -1;
  for (const category of FATHER_CATEGORIES) {
    const pick = drawn[category];
    if (!pick) continue;
    const left = FATHER_IDS.filter((id) => FATHERS[id].category === category && FATHERS[id].weights[era] > 0 && !player?.fathers.includes(id)).length;
    if (left >= most) {
      most = left;
      best = pick;
    }
  }
  return best;
}

/**
 * Credit a colony's bells to its owner's Congress, then let the Congress act: settle on a
 * candidate if it has none (a human is asked), and seat him once he is paid for. Nothing after
 * independence is declared.
 */
export function creditBells(state: GameState, playerId: PlayerId, bells: number, events: CongressEvent[]): GameState {
  const player = playerOf(state, playerId);
  if (!player || player.withdrawn || player.atWar) return state;
  let next = bells > 0 ? patch(state, playerId, { fatherBells: player.fatherBells + bells }) : state;
  const rng = createRng(next.rng);
  let rolled = false;
  for (let guard = 0; guard < 4; guard++) {
    const now = playerOf(next, playerId) as Player;
    if (now.fathers.length >= FATHER_IDS.length) break;
    if (now.candidate === null) {
      if (now.fatherOffer.length > 0) break; // a human has yet to choose
      const drawn = drawCandidates(next, playerId, rng);
      rolled = true;
      const offer = FATHER_CATEGORIES.map((c) => drawn[c]).filter((id): id is FatherId => id !== undefined);
      if (offer.length === 0) break;
      if (now.kind === 'human') {
        events.push({ type: 'congressConvened', player: playerId, offer });
        next = patch(next, playerId, { fatherOffer: offer });
        break;
      }
      const choice = aiCandidate(next, playerId, drawn) as FatherId;
      events.push({ type: 'candidateChosen', player: playerId, father: choice });
      next = patch(next, playerId, { candidate: choice });
      continue;
    }
    if (now.fatherBells < fatherCost(next, playerId)) break;
    next = join(next, playerId, now.candidate, rng, events);
    rolled = true;
  }
  return rolled ? { ...next, rng: rng.state() } : next;
}

export function checkChooseFather(state: GameState, playerId: PlayerId, father: FatherId): CongressCheck {
  return playerOf(state, playerId)?.fatherOffer.includes(father) ? { ok: true } : { ok: false, code: 'notOffered', message: 'the Congress has not put that name forward' };
}

/** A human power names the candidate its Congress will work toward. If the bells are already there he joins at once. */
export function chooseFather(state: GameState, playerId: PlayerId, father: FatherId, events: CongressEvent[]): GameState {
  events.push({ type: 'candidateChosen', player: playerId, father });
  return creditBells(patch(state, playerId, { candidate: father, fatherOffer: [] }), playerId, 0, events);
}

/** A newly founded colony is at once known to every power that has Coronado. */
export function coronadoSees(state: GameState, x: number, y: number): GameState {
  let map = state.map;
  state.players.forEach((p, index) => {
    if (p.fathers.includes('franciscoCoronado')) map = revealAround(map, index, x, y, CONGRESS.coronadoRadius).map;
  });
  return map === state.map ? state : { ...state, map };
}

/** May this power's ships and wagons trade in other powers' colonies? Only with de Witt. */
export function mayTradeAbroad(state: GameState, playerId: PlayerId): boolean {
  return playerOf(state, playerId)?.fathers.includes('janDeWitt') ?? false;
}
