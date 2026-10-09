// Land combat (the core of R-600, built here because R-506 needs it): how strong each side is,
// who defends a stack, how one throw decides it, and who is promoted. What becomes of the loser
// depends on who was fighting and is decided by the callers. Rules: docs/RULES.md "Land combat".
import { coloniesOf } from './colony';
import { COMBAT, PROMOTION } from './data/combat';
import type { ProfessionId } from './data/professions';
import { TERRAIN } from './data/terrain';
import { TRIBES } from './data/tribes';
import { UNIT_TYPES, type UnitTypeId } from './data/units';
import { DIFFICULTIES } from './data/yields';
import { solPercent } from './liberty';
import type { Rng } from './rng';
import { settlementAt } from './settlements';
import { colonyAt, type GameState, type Player, type Unit } from './state';
import { terrainOf } from './tile';

/** Just what combat needs to know of a fighter, so stand-ins (a drafted colonist, a village's defenders) can fight too. */
export interface Fighter {
  readonly type: UnitTypeId;
  readonly profession: ProfessionId | null;
  readonly owner: string;
  readonly orders: Unit['orders'];
  readonly x: number;
  readonly y: number;
  readonly movesLeft: number;
}

export interface CombatLine { readonly label: string; readonly percent: number }
export interface CombatOdds {
  readonly attack: number;
  readonly defense: number;
  /** The visible modifiers, for the analysis screen. Hidden adjustments have no line. */
  readonly attackLines: readonly CombatLine[];
  readonly defenseLines: readonly CombatLine[];
}

const playerOf = (state: GameState, id: string): Player | undefined => state.players.find((p) => p.id === id);
const isNative = (f: Fighter): boolean => UNIT_TYPES[f.type].native === true;
const isHuman = (state: GameState, f: Fighter): boolean => playerOf(state, f.owner)?.kind === 'human';
const levelOf = (state: GameState): number => DIFFICULTIES.indexOf(state.difficulty);
const half = (n: number): number => Math.trunc(n / COMBAT.halfBonus);
const isArtillery = (f: Fighter): boolean => f.type === 'artillery' || f.type === 'damagedArtillery';
const dugIn = (f: Fighter): boolean => f.orders === 'fortify' || f.orders === 'fortified';

/** A unit's own strength in eighths, attacking or defending, before the place and the moment are counted. */
export function unitStrength(fighter: Fighter, side: 'attack' | 'defense', lines: CombatLine[] = []): number {
  const type = UNIT_TYPES[fighter.type];
  let s = (side === 'attack' ? type.attack : type.defense) * COMBAT.scale;
  if ((fighter.type === 'soldier' || fighter.type === 'dragoon') && fighter.profession === 'veteranSoldier') {
    s += half(s);
    lines.push({ label: 'Veteran', percent: 50 });
  }
  return s;
}

/** Fortification levels of the colony on this tile: 0 none, 1 stockade, 2 fort, 3 fortress. */
export function fortLevel(state: GameState, x: number, y: number): number {
  const colony = colonyAt(state, x, y);
  if (!colony) return 0;
  return colony.buildings.includes('fortress') ? 3 : colony.buildings.includes('fort') ? 2 : colony.buildings.includes('stockade') ? 1 : 0;
}

/** Does the attacker, not the defender, get the benefit of the ground? Natives falling on Europeans in the open do, unless the defender is fortified (then nobody does). */
function ambush(state: GameState, attacker: Fighter, defender: Fighter): 'attacker' | 'defender' | 'nobody' {
  if (isNative(defender)) return 'defender';
  if (isNative(attacker)) return defender.orders === 'fortified' ? 'nobody' : 'attacker';
  // rebels in the field against the Crown, once independence is declared
  const rebel = playerOf(state, attacker.owner);
  if (rebel?.kind === 'human' && rebel.atWar && !colonyAt(state, attacker.x, attacker.y)) return 'attacker';
  return 'defender';
}

/**
 * Both sides' strength for an attack on the defender's tile. With `forReal` the hidden help the
 * easier levels give a human is applied too (it is left out of the odds shown beforehand).
 */
export function combatOdds(state: GameState, attacker: Fighter, defender: Fighter, forReal = false, drafted = false): CombatOdds {
  const attackLines: CombatLine[] = [];
  const defenseLines: CombatLine[] = [];
  const d = levelOf(state);
  const colony = colonyAt(state, defender.x, defender.y);
  const village = settlementAt(state, defender.x, defender.y);
  const tile = state.map.tiles[defender.y * state.map.width + defender.x];
  const ground = tile ? TERRAIN[terrainOf(tile)].defense : 0;

  // the defender: the place, and being dug in, are added together before multiplying
  let q = 0;
  let terrainForAttacker = 0;
  if (village) {
    q = COMBAT.settledQuarters * (TRIBES[village.tribe].tech > 1 ? 2 : 1) * (village.capital ? 2 : 1);
    defenseLines.push({ label: 'Settlement', percent: 25 * q });
  } else if (colony) {
    q = COMBAT.settledQuarters * (1 + fortLevel(state, colony.x, colony.y));
    defenseLines.push({ label: ['Colony', 'Stockade', 'Fort', 'Fortress'][fortLevel(state, colony.x, colony.y)] as string, percent: 25 * q });
  } else {
    const who = ambush(state, attacker, defender);
    if (who === 'defender') {
      q = ground;
      if (ground > 0) defenseLines.push({ label: 'Terrain', percent: 25 * ground });
    } else if (who === 'attacker') terrainForAttacker = ground;
  }
  if (defender.orders === 'fortified' && UNIT_TYPES[defender.type].domain === 'land' && q < COMBAT.fortifiedLimit) {
    q += COMBAT.fortifiedQuarters;
    defenseLines.push({ label: 'Fortified', percent: 50 });
  }
  let defense = Math.trunc(((q + 4) * unitStrength(defender, 'defense', defenseLines)) / 4);

  // the attacker: the ground if it is an ambush, then the edge every attacker has
  let attack = Math.trunc(((4 + terrainForAttacker) * unitStrength(attacker, 'attack', attackLines)) / 4);
  if (terrainForAttacker > 0) attackLines.push({ label: 'Ambush', percent: 25 * terrainForAttacker });
  attack += half(attack);
  attackLines.push({ label: 'Attack Bonus', percent: 50 });

  if (isHuman(state, attacker)) attack += COMBAT.humanNudgeFrom - d;
  if (isHuman(state, defender)) defense += COMBAT.humanNudgeFrom - d;

  if (attacker.movesLeft < COMBAT.fullMove) {
    attack = Math.trunc((attack * Math.max(0, attacker.movesLeft)) / COMBAT.fullMove);
    attackLines.push({ label: 'Fatigue', percent: attacker.movesLeft >= 2 ? -33 : -66 });
  }
  // a real fighting unit against one that is hardly armed
  if (UNIT_TYPES[attacker.type].attack > 1 && UNIT_TYPES[defender.type].defense < 2) defense = half(defense);

  const open = !colony && !village;
  const defenderHolds = !isNative(defender) && dugIn(defender);
  if (open && isArtillery(attacker) && !defenderHolds) {
    attack = Math.trunc(attack / COMBAT.artilleryOpenDivisor);
    attackLines.push({ label: 'Artillery In Open', percent: -75 });
  }
  if (open && isArtillery(defender) && !defenderHolds) {
    defense = Math.trunc(defense / COMBAT.artilleryOpenDivisor);
    defenseLines.push({ label: 'Artillery In Open', percent: -75 });
  }
  if (colony && isArtillery(defender) && isNative(attacker)) {
    defense *= COMBAT.artilleryRaidFactor;
    defenseLines.push({ label: 'Artillery Vs. Raid', percent: 100 });
  }
  if (village && isNative(defender) && playerOf(state, attacker.owner)?.nation === 'spain') {
    attack += half(attack);
    attackLines.push({ label: 'Spain Bonus', percent: 50 });
  }

  // once independence is declared: the Crown bombards, and each side is helped by its friends in the colony
  const declared = state.players.some((p) => p.atWar);
  const crown = state.crownPlayer !== null && attacker.owner === state.crownPlayer;
  if (declared && !isNative(attacker)) {
    if (colony) {
      // the King's guns, and after the intervention the rebels' borrowed ones
      if (crown || playerOf(state, attacker.owner)?.revolution?.intervened) {
        attack += half(attack);
        attackLines.push({ label: 'Bombard', percent: 50 });
      }
      const rebels = solPercent(state, colony);
      const support = crown ? 100 - rebels : rebels;
      attack += Math.trunc((attack * support) / 100);
      attackLines.push({ label: crown ? 'Tory Unrest' : 'Rebel Unrest', percent: support });
    } else if (crown && !village) attack += Math.trunc((attack * d) / COMBAT.refOpenPerLevel);
  }

  if (forReal) {
    const defenderHuman = isHuman(state, defender);
    const european = !isNative(attacker);
    // the gentle levels shield a human, except in the assault on a colony during the war of independence
    if (d <= 1 && !(declared && colony && !isNative(attacker))) {
      if (defenderHuman && colony && state.turn < COMBAT.shieldTurns) {
        attack = d === 0 ? attack - Math.trunc(attack / 4) : half(attack);
        if (d === 0 && drafted) attack = 0;
      }
      if (defenderHuman && (european || state.turn < COMBAT.shieldTurns)) attack = half(attack);
    }
    if (d === 0 && isHuman(state, attacker)) attack *= 2;
    if (colony) {
      const theirs = coloniesOf(state, colony.owner);
      // natives never take a power's last colony
      if (isNative(attacker) && theirs.length === 1) attack = 0;
      const people = theirs.reduce((n, c) => n + c.colonists.length, 0);
      if (defenderHuman && colony.colonists.length * 2 >= people) defense += COMBAT.heartlandBonus * (COMBAT.humanNudgeFrom - d);
    }
  }
  return { attack: Math.max(0, attack), defense: Math.max(0, defense), attackLines, defenseLines };
}

/** One throw decides it: the attacker wins with chance attack / (attack + defense). */
export function rollCombat(state: GameState, attacker: Fighter, defender: Fighter, odds: CombatOdds, rng: Rng): boolean {
  // plain braves never carry a human's guns
  if (attacker.type === 'brave' && isArtillery(defender) && isHuman(state, defender)) return false;
  const total = odds.attack + odds.defense;
  return total > 0 && rng.int(1, total) <= odds.attack;
}

/**
 * The unit that stands for a tile under attack: the one with the best defence there, and among
 * equals the weaker in itself. In a colony only armed units are considered; with none, null
 * (a colonist must be drafted). Unready artillery in the open is passed over.
 */
export function pickDefender(state: GameState, x: number, y: number, attacker: Fighter): Unit | null {
  const colony = colonyAt(state, x, y);
  let best: Unit | null = null;
  let bestScore = -1;
  for (const u of Object.values(state.units)) {
    if (u.x !== x || u.y !== y || u.aboard !== null || u.voyage !== null || u.owner === attacker.owner) continue;
    const type = UNIT_TYPES[u.type];
    if (type.domain !== 'land' || (colony && type.attack <= 0)) continue;
    let score = combatOdds(state, attacker, u).defense * 256 + 255 - unitStrength(u, 'defense');
    if (isArtillery(u)) {
      if (!colony && !dugIn(u)) score = Math.trunc(score / 8);
      if (colony && isNative(attacker)) score *= 2;
    }
    if (score >= bestScore) {
      best = u;
      bestScore = score;
    }
  }
  return best;
}

/** Is a soldier or dragoon that has just won raised a rank? The harder the fight the likelier; Washington makes it certain. */
export function earnsPromotion(state: GameState, winner: Fighter, winnerStrength: number, loserStrength: number, rng: Rng): boolean {
  if (winner.type !== 'soldier' && winner.type !== 'dragoon') return false;
  const player = playerOf(state, winner.owner);
  if (!player || winner.profession === null) return false;
  // the unskilled move up a rank; a rebel power's veterans may join the Continental line
  const continental = winner.profession === 'veteranSoldier' && player.atWar && player.kind === 'human';
  if (!(winner.profession in PROMOTION) && !continental) return false;
  if (player.fathers.includes('georgeWashington')) return true;
  let n = winnerStrength + loserStrength + (player.kind === 'human' ? levelOf(state) : -levelOf(state));
  if (winner.profession === 'pettyCriminal') n -= COMBAT.criminalHandicap;
  if (winner.profession === 'indenturedServant') n -= COMBAT.servantHandicap;
  return n < 1 || rng.int(1, n) <= loserStrength;
}

export function promotedProfession(profession: ProfessionId | null): ProfessionId | null {
  return profession !== null && profession in PROMOTION ? PROMOTION[profession as keyof typeof PROMOTION] : profession;
}
