// Living among the natives (R-508): what a settlement teaches, and whether it will teach this
// colonist now.
import { adjustTribalAlarm, tribalAlarm, type AlarmEvent, type AlarmSink } from './alarm';
import { GOOD_IDS, type GoodId } from './data/goods';
import { LEARNING, SKILL_FOR_GOOD, TEACHABLE } from './data/learning';
import type { ProfessionId } from './data/professions';
import { TRIBES } from './data/tribes';
import { DIFFICULTIES } from './data/yields';
import { settlementEconomy } from './native-economy';
import { createRng } from './rng';
import type { GameState, Settlement, Unit } from './state';
import { isWater } from './tile';

export type LearningOutcome = 'taught' | 'angry' | 'criminal' | 'master' | 'already' | 'slow';
export type LearningEvent =
  | AlarmEvent
  | { readonly type: 'nativesTaught'; readonly unitId: string; readonly settlementId: string; readonly outcome: LearningOutcome; readonly skill: ProfessionId };

/**
 * The trade a settlement teaches. It is not stored: it follows from what the settlement has to
 * spare, drawn with a throw that depends only on the game and the place, so it stays the same
 * from visit to visit unless the settlement's circumstances change a good deal.
 */
export function settlementSkill(state: GameState, settlement: Settlement): ProfessionId {
  const tech = TRIBES[settlement.tribe].tech;
  const { supply } = settlementEconomy(state, settlement);
  const weight = (good: GoodId): number => {
    if (!(good in SKILL_FOR_GOOD)) return 0;
    const needs = LEARNING.needsLevel.find(([g]) => g === good);
    if (needs && tech < needs[1]) return 0;
    let u = supply[good];
    if (good === 'food') u = Math.trunc((u * (LEARNING.foodShare[tech] as readonly [number, number])[0]) / (LEARNING.foodShare[tech] as readonly [number, number])[1]);
    if (good === 'silver' && settlement.tribe === 'inca') u = Math.trunc((u * LEARNING.incaSilver[0]) / LEARNING.incaSilver[1]);
    return u;
  };
  const rng = createRng(`skill:${state.seed}:${settlement.x},${settlement.y}`);
  const total = GOOD_IDS.reduce((sum, g) => sum + weight(g), 0);
  let good: GoodId = 'food';
  if (total > 0) {
    let roll = rng.int(1, total);
    for (const g of GOOD_IDS) {
      roll -= weight(g);
      if (roll <= 0) {
        good = g;
        break;
      }
    }
  }
  const skill: ProfessionId = SKILL_FOR_GOOD[good as keyof typeof SKILL_FOR_GOOD] ?? 'expertFarmer';
  if (skill === 'expertFurTrapper' && (settlement.x + settlement.y) % LEARNING.scoutEvery === 0) return 'seasonedScout';
  if (skill === 'expertFarmer') {
    let water = 0;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if ((dx === 0 && dy === 0) || (Math.abs(dx) === 2 && Math.abs(dy) === 2)) continue;
        const tile = state.map.tiles[(settlement.y + dy) * state.map.width + settlement.x + dx];
        if (tile && isWater(tile)) water++;
      }
    }
    if (rng.int(1, LEARNING.fisherDie) < water) return 'expertFisherman';
  }
  return skill;
}

/** A colonist asks to stay in a settlement and learn its people's trade. */
export function liveAmongNatives(state: GameState, unit: Unit, settlement: Settlement, events: LearningEvent[]): GameState {
  const skill = settlementSkill(state, settlement);
  const rng = createRng(state.rng);
  const t = tribalAlarm(state, settlement.tribe, unit.owner);
  const human = state.players.find((p) => p.id === unit.owner)?.kind === 'human';
  const spent: GameState = { ...state, units: { ...state.units, [unit.id]: { ...unit, movesLeft: 0 } } };
  const tell = (next: GameState, outcome: LearningOutcome): GameState => {
    events.push({ type: 'nativesTaught', unitId: unit.id, settlementId: settlement.id, outcome, skill });
    return { ...next, rng: rng.state() };
  };
  if (t >= LEARNING.refusedFrom) return tell(adjustTribalAlarm(spent, settlement.tribe, unit.owner, LEARNING.refusalAlarm, rng, events as AlarmSink), 'angry');
  if (unit.profession === 'pettyCriminal') return tell(spent, 'criminal');
  if (unit.profession === null || !TEACHABLE.includes(unit.profession)) return tell(spent, 'master');
  if (settlement.taught && !settlement.capital) return tell(spent, 'already');
  const d = human ? DIFFICULTIES.indexOf(state.difficulty) : 0;
  if (t >= LEARNING.slowFrom && rng.int(1, 1000) <= LEARNING.slowPerLevel * d + LEARNING.slowBase) return tell(spent, 'slow');
  const taught: GameState = {
    ...spent,
    units: { ...spent.units, [unit.id]: { ...(spent.units[unit.id] as Unit), profession: skill } },
    settlements: { ...spent.settlements, [settlement.id]: { ...settlement, taught: true } },
  };
  return tell(taught, 'taught');
}
