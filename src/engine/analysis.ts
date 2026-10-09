// The odds of an attack, set out for the Combat Analysis dialog (R-603): who would fight whom on
// the square (dx, dy) away, each side's strength and the visible modifiers behind it.
import { checkAttackColony } from './assault';
import { checkAttackUnit } from './battle';
import { braveTypeFor } from './braves';
import { combatOdds, pickDefender, type CombatLine, type Fighter } from './combat';
import { COMBAT } from './data/combat';
import { NATIVE_WAR } from './data/native-war';
import { NAVAL } from './data/naval';
import { TECH_LEVELS, TRIBES } from './data/tribes';
import { UNIT_TYPES } from './data/units';
import { checkNavalAttack, navalOdds, seaDefender } from './naval';
import { checkAttackNatives } from './native-war';
import { settlementAt, tribeOwner } from './settlements';
import { colonyAt, type GameState, type Unit } from './state';

export interface CombatAnalysis {
  readonly attacker: { readonly name: string; readonly base: number; readonly strength: number; readonly lines: readonly CombatLine[] };
  readonly defender: { readonly name: string; readonly base: number; readonly strength: number; readonly lines: readonly CombatLine[] };
  /** The attacker's chance of winning, percent (before any hidden help the difficulty level gives). */
  readonly chance: number;
  /** The quarry may simply get away (a weaker ship). */
  readonly mayEvade: boolean;
}

const eighths = (n: number): number => Math.round((n / COMBAT.scale) * 100) / 100;

/** The analysis for an attack by `unit` on the neighbouring square, or null if there is nothing there it may attack. */
export function analyseAttack(state: GameState, unit: Unit, dx: number, dy: number): CombatAnalysis | null {
  const x = unit.x + dx;
  const y = unit.y + dy;
  const mine = UNIT_TYPES[unit.type];
  if (mine.domain === 'sea') {
    if (!checkNavalAttack(state, unit, dx, dy).ok) return null;
    const foe = seaDefender(state, x, y, unit) as Unit;
    const odds = navalOdds(state, unit, foe);
    const lines = (ship: Unit, attacking: boolean): CombatLine[] => {
      const out: CombatLine[] = [];
      if (ship.type === 'privateer' && state.players.find((p) => p.id === ship.owner)?.fathers.includes('francisDrake')) out.push({ label: 'Drake', percent: 50 });
      if (attacking) out.push({ label: 'Attack Bonus', percent: 50 });
      return out;
    };
    return {
      attacker: { name: mine.name, base: mine.attack, strength: eighths(odds.attack), lines: lines(unit, true) },
      defender: { name: UNIT_TYPES[foe.type].name, base: UNIT_TYPES[foe.type].defense, strength: eighths(odds.defense), lines: lines(foe, false) },
      chance: Math.round((100 * odds.attack) / Math.max(1, odds.attack + odds.defense)),
      mayEvade: UNIT_TYPES[foe.type].attack < mine.attack,
    };
  }
  const village = settlementAt(state, x, y);
  const colony = colonyAt(state, x, y);
  let defender: Fighter | null = null;
  let name = '';
  if (village && checkAttackNatives(state, unit, dx, dy).ok) {
    defender = { type: braveTypeFor(state.tribes[village.tribe], NATIVE_WAR.mountedDefenderBreeding), profession: null, owner: tribeOwner(village.tribe), orders: 'none', x, y, movesLeft: 0 };
    name = `${TRIBES[village.tribe].adjective} ${village.capital ? 'Capital' : TECH_LEVELS[TRIBES[village.tribe].tech].settlement}`;
  } else if (colony && colony.owner !== unit.owner && checkAttackColony(state, unit, dx, dy).ok) {
    const garrison = pickDefender(state, x, y, unit);
    const owner = state.players.find((p) => p.id === colony.owner);
    const armed = !garrison && (owner?.fathers.includes('paulRevere') ?? false) && (colony.goods.muskets ?? 0) >= NAVAL.revereMuskets;
    defender = garrison ?? { type: armed ? 'soldier' : 'colonist', profession: 'freeColonist', owner: colony.owner, orders: 'none', x, y, movesLeft: 0 };
    name = garrison ? UNIT_TYPES[garrison.type].name : `${colony.name} militia`;
  } else if (checkAttackNatives(state, unit, dx, dy).ok || checkAttackUnit(state, unit, dx, dy).ok) {
    defender = pickDefender(state, x, y, unit);
    name = defender ? UNIT_TYPES[defender.type].name : '';
  }
  if (!defender) return null;
  const odds = combatOdds(state, unit, defender);
  return {
    attacker: { name: mine.name, base: mine.attack, strength: eighths(odds.attack), lines: odds.attackLines },
    defender: { name, base: UNIT_TYPES[defender.type].defense, strength: eighths(odds.defense), lines: odds.defenseLines },
    chance: Math.round((100 * odds.attack) / Math.max(1, odds.attack + odds.defense)),
    mayEvade: false,
  };
}
