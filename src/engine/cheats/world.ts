// World cheats (R-1060; docs/RULES.md "Cheats"): the native peoples' alarm and a treaty with one,
// the other powers (meeting, peace and war), the Crown's force and war chest, and a price in
// Europe. Meetings go the way the game's own code makes them (meetTribe, powersMeet, setStance);
// the alarm, the Crown's figures and a price are written as numbers, there being no path of the
// game's that sets one, and the ordinary turn takes it from there.
import { meetTribe, type AlarmEvent } from '../alarm';
import type { CheatCommand, CheatSpec } from '../cheats';
import { CHEATS } from '../data/cheats';
import { GOOD_IDS, GOOD_NAMES, type GoodId } from '../data/goods';
import { MARKET } from '../data/market';
import { NATIVES, TRIBES, type TribeId } from '../data/tribes';
import { powersMeet, setStance, type DiplomacyEvent } from '../diplomacy';
import { bidPrice } from '../market';
import type { GameState, Player, PlayerId, RefForce, Settlement, TribeState } from '../state';
import { amountAfter, amountArg, CHEAT_OK, choiceArg, isCount, numberArg, pastMost, refuse, wordArg, type CheatCheck, type CheatOutcome, type CheatSink } from './shared';

type Amount = { readonly set: boolean; readonly value: number };
const CROWN_PARTS = ['regulars', 'cavalry', 'artillery', 'ships', 'gold'] as const;
type CrownPart = (typeof CROWN_PARTS)[number];
const STANCES = ['peace', 'war'] as const;
/** A percent runs to this. */
const FULL = 100;

export type WorldCommand =
  /** Set a tribe's alarm at the power, or one settlement's (there, 100 is the mark at which it turns hostile). */
  | { readonly cheat: 'alarm'; readonly target: { readonly kind: 'tribe'; readonly tribe: TribeId } | { readonly kind: 'settlement'; readonly settlementId: string }; readonly percent: number }
  | { readonly cheat: 'peace'; readonly tribe: TribeId }
  | { readonly cheat: 'meet'; readonly power: PlayerId }
  | { readonly cheat: 'stance'; readonly power: PlayerId; readonly stance: 'peace' | 'war' }
  /** Add to a part of the Expeditionary Force or to the King's war chest (a negative value takes from it), or set it. */
  | { readonly cheat: 'crown'; readonly part: CrownPart; readonly amount: Amount }
  /** Set what Europe pays the power for a good, within the limits the market keeps it to. */
  | { readonly cheat: 'price'; readonly good: GoodId; readonly count: number };

const patch = (state: GameState, id: PlayerId, change: Partial<Player>): GameState => ({ ...state, players: state.players.map((p) => (p.id === id ? { ...p, ...change } : p)) });
const tribeOf = (state: GameState, tribe: TribeId): TribeState | undefined => (typeof tribe === 'string' && Object.hasOwn(state.tribes, tribe) ? state.tribes[tribe] : undefined);
const settlementOf = (state: GameState, id: string): Settlement | undefined => (typeof id === 'string' && Object.hasOwn(state.settlements, id) ? state.settlements[id] : undefined);
const hasMet = (player: Player, other: PlayerId): boolean => Object.hasOwn(player.stance, other);

/** Another European power still in the New World, or the refusal. */
function otherPower(state: GameState, player: Player, id: PlayerId): Player | CheatCheck {
  const other = state.players.find((p) => p.id === id);
  if (!other || other.withdrawn || other.id === state.crownPlayer) return refuse('cheatTarget', `"${String(id)}" is not a power in the New World`);
  return other.id === player.id ? refuse('cheatTarget', `${player.name} cannot treat with itself`) : other;
}
const isPlayer = (found: Player | CheatCheck): found is Player => 'id' in found;

/** A power fighting for its independence treats with no one, and the game's own meeting does nothing for it: the refusal, if either is. */
function fightingFor(player: Player, other: Player): CheatCheck | null {
  const fighting = player.atWar ? player : other.atWar ? other : null;
  return fighting ? refuse('cheatTarget', `${fighting.name} is fighting for its independence and meets no one`) : null;
}

/** A settlement's own alarm runs past a hundred; a percent is of the mark at which it turns hostile. */
const settlementAlarmFor = (percent: number): number => Math.round((percent * NATIVES.settlementHostile) / FULL);

const crownFigure = (player: Player, part: CrownPart): number => (part === 'gold' ? player.royalMoney : player.ref[part]);

/** The level the market keeps for a bid of `count`: one above it, held to the limits of the good's drift. */
const levelFor = (good: GoodId, count: number): number => Math.min(MARKET[good].high, Math.max(MARKET[good].low, count + 1));

/** May this power have this cheat? Null when the command is not one of this group's. */
export function checkWorld(state: GameState, player: Player, command: CheatCommand): CheatCheck | null {
  switch (command.cheat) {
    case 'alarm': {
      const target = command.target;
      if (typeof target !== 'object' || target === null) return refuse('cheatTarget', 'alarm takes a tribe or a settlement');
      if (target.kind === 'tribe') {
        if (!tribeOf(state, target.tribe)) return refuse('cheatTarget', `there is no tribe "${String(target.tribe)}" in the New World`);
        return isCount(command.percent) && command.percent <= NATIVES.alarmMax ? CHEAT_OK : refuse('cheatAmount', `a tribe's alarm is a whole number from 0 to ${NATIVES.alarmMax}`);
      }
      if (target.kind !== 'settlement' || !settlementOf(state, target.settlementId)) return refuse('cheatTarget', `there is no settlement "${String((target as { settlementId?: unknown }).settlementId)}"`);
      return isCount(command.percent) && command.percent <= FULL ? CHEAT_OK : refuse('cheatAmount', `a settlement's alarm is a whole number from 0 to ${FULL}`);
    }
    case 'peace':
      return tribeOf(state, command.tribe) ? CHEAT_OK : refuse('cheatTarget', `there is no tribe "${String(command.tribe)}" in the New World`);
    case 'meet': {
      const other = otherPower(state, player, command.power);
      if (!isPlayer(other)) return other;
      if (hasMet(player, other.id) || hasMet(other, player.id)) return refuse('cheatTarget', `${player.name} and ${other.name} have met already`);
      return fightingFor(player, other) ?? CHEAT_OK;
    }
    case 'stance': {
      const other = otherPower(state, player, command.power);
      if (!isPlayer(other)) return other;
      if (!(STANCES as readonly string[]).includes(command.stance)) return refuse('cheatTarget', 'a stance is peace or war');
      if (hasMet(player, other.id) && hasMet(other, player.id)) return CHEAT_OK;
      return fightingFor(player, other) ?? CHEAT_OK;
    }
    case 'crown': {
      if (!(CROWN_PARTS as readonly string[]).includes(command.part)) return refuse('cheatTarget', `the Crown has ${CROWN_PARTS.join(', ')}, and no "${String(command.part)}"`);
      const now = crownFigure(player, command.part);
      const after = amountAfter(now, command.amount);
      if (after === null) return refuse('cheatAmount', `an amount of ${command.part} is a whole number`);
      if (after < 0) return refuse('cheatBelowZero', `the Crown has only ${now} ${command.part}`);
      // the war chest buys the force a unit for every so much gold in it, each with its notice: it must stay a sum a turn can spend
      return pastMost(now, after) ? refuse('cheatAmount', `the Crown is given no more than ${CHEATS.most} ${command.part}`) : CHEAT_OK;
    }
    case 'price':
      if (!(GOOD_IDS as readonly string[]).includes(command.good)) return refuse('cheatTarget', `there is no good "${String(command.good)}"`);
      if (!Object.hasOwn(state.market.powers, player.id)) return refuse('cheatTarget', `${player.name} has no market in Europe`);
      return isCount(command.count) ? CHEAT_OK : refuse('cheatAmount', 'a price is a whole number of zero or more');
    default:
      return null;
  }
}

/** Apply a checked cheat of this group. Null when the command is not one of this group's. */
export function applyWorld(state: GameState, player: Player, command: CheatCommand, _events: CheatSink): CheatOutcome | null {
  switch (command.cheat) {
    case 'alarm': {
      const target = command.target;
      if (target.kind === 'tribe') {
        const record = tribeOf(state, target.tribe) as TribeState;
        const tribes = { ...state.tribes, [target.tribe]: { ...record, alarm: { ...record.alarm, [player.id]: command.percent } } };
        return { state: { ...state, tribes }, summary: `Set the alarm of the ${TRIBES[target.tribe].name} at ${player.name} to ${command.percent}.` };
      }
      const settlement = settlementOf(state, target.settlementId) as Settlement;
      const alarm = settlementAlarmFor(command.percent);
      const settlements = { ...state.settlements, [settlement.id]: { ...settlement, alarm: { ...settlement.alarm, [player.id]: alarm } } };
      const what = `the ${TRIBES[settlement.tribe].adjective} ${settlement.capital ? 'capital' : 'settlement'} at ${settlement.x},${settlement.y}`;
      return { state: { ...state, settlements }, summary: `Set the alarm of ${what} at ${player.name} to ${command.percent} percent of what turns it hostile (${alarm}).` };
    }
    case 'peace': {
      // the meeting as the game makes it, then the treaty as an accepted offer leaves it; what the
      // meeting reports is left unsaid, the cheat's own sentence standing for it
      const met: AlarmEvent[] = [];
      const next = meetTribe(state, command.tribe, player.id, met);
      const record = tribeOf(next, command.tribe) as TribeState;
      const treaty: TribeState = { ...record, peace: record.peace.includes(player.id) ? record.peace : [...record.peace, player.id], grudge: record.grudge.filter((id) => id !== player.id) };
      const now = next.players.find((p) => p.id === player.id) as Player;
      const change: Partial<Player> = { pendingTreaties: now.pendingTreaties.filter((t) => t !== command.tribe) };
      // a computer power that had made up its mind to fight this people gives the thought up
      const settled = patch(next, player.id, now.tribeWars ? { ...change, tribeWars: now.tribeWars.filter((t) => t !== command.tribe) } : change);
      return { state: { ...settled, tribes: { ...settled.tribes, [command.tribe]: treaty } }, summary: `${player.name} and the ${TRIBES[command.tribe].name} are at peace.` };
    }
    case 'meet': {
      const other = otherPower(state, player, command.power) as Player;
      const said: DiplomacyEvent[] = [];
      return { state: powersMeet(state, player.id, other.id, said), summary: `${player.name} and ${other.name} have met.` };
    }
    case 'stance': {
      const other = otherPower(state, player, command.power) as Player;
      const said: DiplomacyEvent[] = [];
      const met = hasMet(player, other.id) && hasMet(other, player.id) ? state : powersMeet(state, player.id, other.id, said);
      return { state: setStance(met, player.id, other.id, command.stance), summary: `${player.name} and ${other.name} are now at ${command.stance}.` };
    }
    case 'crown': {
      const after = amountAfter(crownFigure(player, command.part), command.amount) as number;
      const { set, value } = command.amount;
      const where = command.part === 'gold' ? "the King's war chest" : 'the Expeditionary Force';
      const summary = set ? `Set the ${command.part} of ${where} to ${after}.` : value < 0 ? `Took ${-value} ${command.part} from ${where}.` : `Added ${value} ${command.part} to ${where}.`;
      const force: RefForce = command.part === 'gold' ? player.ref : { ...player.ref, [command.part]: after };
      return { state: patch(state, player.id, command.part === 'gold' ? { royalMoney: after } : { ref: force }), summary };
    }
    case 'price': {
      const mine = state.market.powers[player.id] as GameState['market']['powers'][PlayerId];
      const price = { ...mine.price, [command.good]: levelFor(command.good, command.count) };
      const next: GameState = { ...state, market: { ...state.market, powers: { ...state.market.powers, [player.id]: { ...mine, price } } } };
      return { state: next, summary: `Europe now pays ${player.name} ${bidPrice(next, player.id, command.good)} for ${GOOD_NAMES[command.good].toLowerCase()}.` };
    }
    default:
      return null;
  }
}

/** The tribe or the settlement an `alarm` line named. */
function alarmTarget(choice: { readonly kind: string; readonly value: unknown } | undefined): Extract<WorldCommand, { cheat: 'alarm' }>['target'] {
  return choice?.kind === 'settlement' ? { kind: 'settlement', settlementId: choice.value as string } : { kind: 'tribe', tribe: choice?.value as TribeId };
}

export const WORLD_SPECS: readonly CheatSpec[] = [
  {
    name: 'alarm',
    args: [{ name: 'target', kind: { anyOf: ['tribe', 'settlement'] } }, { name: 'percent', kind: 'percent' }],
    about: `Sets how alarmed a tribe is at the power (0 to ${NATIVES.alarmMax}), or one settlement (${FULL} is the point at which it turns hostile).`,
    example: 'alarm sioux 0',
    build: (args) => ({ cheat: 'alarm', target: alarmTarget(choiceArg(args, 'target')), percent: numberArg(args, 'percent') as number }),
  },
  {
    name: 'peace',
    args: [{ name: 'tribe', kind: 'tribe' }],
    about: 'A treaty of peace with a tribe: it has met the power, holds no grudge, and any offer of a treaty still waiting is answered.',
    example: 'peace aztec',
    build: (args) => ({ cheat: 'peace', tribe: wordArg(args, 'tribe') as TribeId }),
  },
  {
    name: 'meet',
    args: [{ name: 'power', kind: 'power' }],
    about: 'Brings the power face to face with another, as if their people had met on land. Refused if they have met.',
    example: 'meet france',
    build: (args) => ({ cheat: 'meet', power: wordArg(args, 'power') as PlayerId }),
  },
  {
    name: 'stance',
    args: [{ name: 'power', kind: 'power' }, { name: 'stance', kind: { oneOf: STANCES } }],
    about: 'Sets peace or war with another power, meeting it first if need be.',
    example: 'stance spain peace',
    build: (args) => ({ cheat: 'stance', power: wordArg(args, 'power') as PlayerId, stance: wordArg(args, 'stance') as 'peace' | 'war' }),
  },
  {
    name: 'crown',
    args: [{ name: 'part', kind: { oneOf: CROWN_PARTS } }, { name: 'amount', kind: 'amount' }],
    about: "Adds to a part of the Expeditionary Force the Crown holds against the power, or to the King's war chest (gold); takes from it or sets it. Refused if it would leave less than nothing.",
    example: 'crown regulars =0',
    build: (args) => ({ cheat: 'crown', part: wordArg(args, 'part') as CrownPart, amount: amountArg(args, 'amount') as Amount }),
  },
  {
    name: 'price',
    args: [{ name: 'good', kind: 'good' }, { name: 'count', kind: 'count' }],
    about: 'Sets what Europe pays the power for a good, held to the limits that good is traded between.',
    example: 'price furs 5',
    build: (args) => ({ cheat: 'price', good: wordArg(args, 'good') as GoodId, count: numberArg(args, 'count') as number }),
  },
];
