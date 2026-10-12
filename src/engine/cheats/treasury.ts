// Treasury and Congress cheats (R-1058; docs/RULES.md "Cheats"): gold, crosses, liberty bells, a
// Founding Father, the tax rate and the boycotts. Bells and Fathers go the way the turn's own code
// sends them (creditBells, warBells, join), so the Congress's books stay as that code expects.
import type { CheatCommand, CheatSpec } from '../cheats';
import { creditBells, join, type CongressEvent } from '../congress';
import { CHEATS } from '../data/cheats';
import { FATHER_IDS, FATHERS, type FatherId } from '../data/fathers';
import { MARKET_MODEL } from '../data/market';
import { warBells } from '../independence';
import { createRng } from '../rng';
import type { GameState, Player, PlayerId } from '../state';
import { liftAllBoycotts } from '../tax';
import { amountArg, CHEAT_OK, isCount, numberArg, refuse, wordArg, type CheatCheck, type CheatOutcome, type CheatSink } from './shared';

export type TreasuryCommand =
  /** Add to the treasury (a negative value takes from it), or set it. */
  | { readonly cheat: 'gold'; readonly amount: { readonly set: boolean; readonly value: number } }
  | { readonly cheat: 'crosses'; readonly count: number }
  | { readonly cheat: 'bells'; readonly count: number }
  | { readonly cheat: 'father'; readonly father: FatherId }
  | { readonly cheat: 'tax'; readonly percent: number }
  /** Lift every boycott. */
  | { readonly cheat: 'boycott' };

const patch = (state: GameState, id: PlayerId, change: Partial<Player>): GameState => ({ ...state, players: state.players.map((p) => (p.id === id ? { ...p, ...change } : p)) });

/** The treasury after a `gold` cheat, or null when the amount is no whole number. */
function goldAfter(player: Player, amount: { readonly set: boolean; readonly value: number }): number | null {
  if (typeof amount?.value !== 'number' || !Number.isSafeInteger(amount.value)) return null;
  const after = amount.set ? amount.value : player.gold + amount.value;
  return Number.isSafeInteger(after) ? after : null;
}

/** May this power have this cheat? Null when the command is not one of this group's. */
export function checkTreasury(_state: GameState, player: Player, command: CheatCommand): CheatCheck | null {
  switch (command.cheat) {
    case 'gold': {
      const after = goldAfter(player, command.amount);
      if (after === null) return refuse('cheatAmount', 'an amount of gold is a whole number');
      return after < 0 ? refuse('cheatBelowZero', `the treasury holds only ${player.gold} gold`) : CHEAT_OK;
    }
    case 'crosses':
    case 'bells':
      return isCount(command.count) ? CHEAT_OK : refuse('cheatAmount', `a count of ${command.cheat} is a whole number of zero or more`);
    case 'father':
      if (!(FATHER_IDS as readonly string[]).includes(command.father)) return refuse('cheatTarget', `there is no Founding Father "${String(command.father)}"`);
      return player.fathers.includes(command.father) ? refuse('cheatTarget', `${FATHERS[command.father].name} already sits in the Congress`) : CHEAT_OK;
    case 'tax':
      return isCount(command.percent) && command.percent <= MARKET_MODEL.maxTax ? CHEAT_OK : refuse('cheatAmount', `the tax rate is a whole number from 0 to ${MARKET_MODEL.maxTax}`);
    case 'boycott':
      return CHEAT_OK;
    default:
      return null;
  }
}

/** Apply a checked cheat of this group. Null when the command is not one of this group's. */
export function applyTreasury(state: GameState, player: Player, command: CheatCommand, events: CheatSink): CheatOutcome | null {
  switch (command.cheat) {
    case 'gold': {
      const { set, value } = command.amount;
      const gold = goldAfter(player, command.amount) as number;
      const summary = set ? `Set the treasury to ${gold} gold.` : value < 0 ? `Took ${-value} gold from the treasury.` : `Added ${value} gold to the treasury.`;
      return { state: patch(state, player.id, { gold }), summary };
    }
    case 'crosses':
      return { state: patch(state, player.id, { crosses: player.crosses + command.count }), summary: `Added ${command.count} crosses.` };
    case 'bells': {
      // as a colony's bells are entered at the end of its turn: the lifetime count, then the
      // Congress (which does nothing once independence is declared), then the powers of Europe
      // (which hear nothing before it)
      const congress: CongressEvent[] = [];
      let next = patch(state, player.id, { bells: player.bells + command.count });
      next = creditBells(next, player.id, command.count, congress);
      events.push(...congress);
      next = warBells(next, player.id, command.count, events);
      return { state: next, summary: `Added ${command.count} liberty bells.` };
    }
    case 'father': {
      const rng = createRng(state.rng);
      const congress: CongressEvent[] = [];
      const seated = join(state, player.id, command.father, rng, congress);
      events.push(...congress);
      return { state: { ...seated, rng: rng.state() }, summary: `Seated ${FATHERS[command.father].name} in the Congress.` };
    }
    case 'tax':
      return { state: patch(state, player.id, { taxRate: command.percent }), summary: `Set the tax rate to ${command.percent} percent.` };
    case 'boycott':
      return { state: liftAllBoycotts(state, player.id), summary: 'Lifted every boycott.' };
    default:
      return null;
  }
}

export const TREASURY_SPECS: readonly CheatSpec[] = [
  {
    name: 'gold',
    args: [{ name: 'amount', kind: 'amount', optional: true }],
    about: `Adds to the treasury, takes from it or sets it (${CHEATS.gold} gold if no amount is given). Refused if it would leave less than nothing.`,
    example: 'gold 5000',
    build: (args) => ({ cheat: 'gold', amount: amountArg(args, 'amount') ?? { set: false, value: CHEATS.gold } }),
  },
  {
    name: 'crosses',
    args: [{ name: 'count', kind: 'count', optional: true }],
    about: `Adds crosses toward the next immigrant (${CHEATS.crosses} if no count is given).`,
    example: 'crosses 200',
    build: (args) => ({ cheat: 'crosses', count: numberArg(args, 'count') ?? CHEATS.crosses }),
  },
  {
    name: 'bells',
    args: [{ name: 'count', kind: 'count', optional: true }],
    about: `Adds liberty bells (${CHEATS.bells} if no count is given): toward the next Founding Father, or after the Declaration toward help from abroad.`,
    example: 'bells 300',
    build: (args) => ({ cheat: 'bells', count: numberArg(args, 'count') ?? CHEATS.bells }),
  },
  {
    name: 'father',
    args: [{ name: 'father', kind: 'father' }],
    about: 'Seats a Founding Father in the Congress at once. The bells gathered toward the next one are lost.',
    example: 'father jefferson',
    build: (args) => ({ cheat: 'father', father: wordArg(args, 'father') as FatherId }),
  },
  {
    name: 'tax',
    args: [{ name: 'percent', kind: 'percent' }],
    about: `Sets the tax rate, from 0 to ${MARKET_MODEL.maxTax} percent.`,
    example: 'tax 0',
    build: (args) => ({ cheat: 'tax', percent: numberArg(args, 'percent') as number }),
  },
  {
    name: 'boycott',
    args: [{ name: 'lift', kind: { oneOf: ['lift'] } }],
    about: 'Lifts every boycott in Europe, with nothing owed.',
    example: 'boycott lift',
    build: () => ({ cheat: 'boycott' }),
  },
];
