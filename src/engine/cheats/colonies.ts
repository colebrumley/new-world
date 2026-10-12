// Colony cheats (R-1060; docs/RULES.md "Cheats"): the warehouse, the hammers put by, the project
// under construction, a building, and Sons of Liberty membership. The game has no path of its own
// to a warehouse over capacity or a building the colony is too small for, so these write the
// colony's fields and the ordinary turn takes it from there: spoilage trims the warehouse, the
// construction code finishes the project, and the membership bonus follows at the next turn.
import type { CheatCommand, CheatSpec } from '../cheats';
import { addGoods, amountOf } from '../cargo';
import { itemCost, itemName } from '../construction';
import { BUILDING_CHAINS, BUILDING_IDS, BUILDINGS, type BuildingId } from '../data/buildings';
import { CHEATS } from '../data/cheats';
import { GOOD_IDS, GOOD_NAMES, type GoodId } from '../data/goods';
import { solPercent } from '../liberty';
import type { Colony, ColonyId, GameState, Player } from '../state';
import { amountAfter, amountArg, CHEAT_OK, choiceArg, isCount, numberArg, pastMost, refuse, wordArg, type CheatCheck, type CheatOutcome, type CheatSink } from './shared';

type Amount = { readonly set: boolean; readonly value: number };

export type ColoniesCommand =
  /** Add to a good in the warehouse (a negative value takes from it), or set it; `all` is every good there is. */
  | { readonly cheat: 'goods'; readonly colonyId: ColonyId; readonly good: GoodId | 'all'; readonly amount: Amount }
  | { readonly cheat: 'hammers'; readonly colonyId: ColonyId; readonly amount: Amount }
  /** Give the colony what its project still needs, to be finished at the end of the turn. */
  | { readonly cheat: 'finish'; readonly colonyId: ColonyId }
  | { readonly cheat: 'building'; readonly colonyId: ColonyId; readonly building: BuildingId }
  | { readonly cheat: 'liberty'; readonly colonyId: ColonyId; readonly percent: number };

/** A percent runs to this. */
const FULL = 100;
const COLONY_CHEATS: readonly string[] = ['goods', 'hammers', 'finish', 'building', 'liberty'] satisfies readonly ColoniesCommand['cheat'][];

/** The colony a cheat names, if it is this power's; otherwise the refusal, with the colony's name where it has one. */
function colonyFor(state: GameState, player: Player, colonyId: ColonyId): Colony | CheatCheck {
  const colony = typeof colonyId === 'string' && Object.hasOwn(state.colonies, colonyId) ? state.colonies[colonyId] : undefined;
  if (!colony) return refuse('cheatTarget', `there is no colony "${String(colonyId)}"`);
  return colony.owner === player.id ? colony : refuse('cheatTarget', `${colony.name} is not a colony of ${player.name}`);
}
const isColony = (found: Colony | CheatCheck): found is Colony => 'id' in found;

const withColony = (state: GameState, colony: Colony): GameState => ({ ...state, colonies: { ...state.colonies, [colony.id]: colony } });
const goodsOf = (good: GoodId | 'all'): readonly GoodId[] => (good === 'all' ? GOOD_IDS : [good]);
const said = (amount: Amount, what: string, where: string): string =>
  amount.set ? `Set ${what} in ${where} to ${amount.value}.` : amount.value < 0 ? `Took ${-amount.value} ${what} from ${where}.` : `Added ${amount.value} ${what} to ${where}.`;

/** The links of a building's chain up to and including it that the colony lacks, in order; the building alone if it has no chain. */
function missingLinks(colony: Colony, building: BuildingId): BuildingId[] {
  const chain = BUILDINGS[building].chain;
  const links: readonly BuildingId[] = chain ? BUILDING_CHAINS[chain].slice(0, BUILDINGS[building].level) : [building];
  return links.filter((id) => !colony.buildings.includes(id));
}

/** What the project still wants of hammers and of tools. */
function wanting(colony: Colony): { hammers: number; tools: number } {
  const cost = colony.construction ? itemCost(colony.construction) : { hammers: 0, tools: 0 };
  return { hammers: Math.max(0, cost.hammers - colony.hammers), tools: Math.max(0, cost.tools - amountOf(colony.goods, 'tools')) };
}

/** The share of Bolivar's that is counted on top of a colony's own membership. */
const bolivarPoints = (state: GameState, colony: Colony): number => solPercent(state, { ...colony, sol: { n: 0, d: colony.sol.d } });

/**
 * The membership count that makes the colony read the percent asked, its denominator kept: the
 * least count that reads no less. Bolivar's points come on top of a colony's own, so they are
 * taken off what is asked first; with him a colony cannot read less than his points.
 */
function membersFor(state: GameState, colony: Colony, percent: number): number {
  const own = Math.max(0, percent - bolivarPoints(state, colony));
  return Math.min(colony.sol.d, Math.ceil((own * colony.sol.d) / FULL));
}

/** May this power have this cheat? Null when the command is not one of this group's. */
export function checkColonies(state: GameState, player: Player, command: CheatCommand): CheatCheck | null {
  if (!COLONY_CHEATS.includes(command.cheat)) return null;
  const found = colonyFor(state, player, (command as ColoniesCommand).colonyId);
  if (!isColony(found)) return found;
  const colony = found;
  switch (command.cheat) {
    case 'goods': {
      if (command.good !== 'all' && !(GOOD_IDS as readonly string[]).includes(command.good)) return refuse('cheatTarget', `there is no good "${String(command.good)}"`);
      for (const good of goodsOf(command.good)) {
        const after = amountAfter(amountOf(colony.goods, good), command.amount);
        if (after === null) return refuse('cheatAmount', 'an amount of goods is a whole number');
        if (after < 0) return refuse('cheatBelowZero', `${colony.name} holds only ${amountOf(colony.goods, good)} ${GOOD_NAMES[good].toLowerCase()}`);
        if (pastMost(amountOf(colony.goods, good), after)) return refuse('cheatAmount', `a warehouse is given no more than ${CHEATS.most} of a good`);
      }
      return CHEAT_OK;
    }
    case 'hammers': {
      const after = amountAfter(colony.hammers, command.amount);
      if (after === null) return refuse('cheatAmount', 'an amount of hammers is a whole number');
      if (after < 0) return refuse('cheatBelowZero', `${colony.name} has only ${colony.hammers} hammers put by`);
      return pastMost(colony.hammers, after) ? refuse('cheatAmount', `a colony is given no more than ${CHEATS.most} hammers`) : CHEAT_OK;
    }
    case 'finish': {
      const item = colony.construction;
      if (!item) return refuse('cheatTarget', `${colony.name} has nothing under construction`);
      if (item.kind === 'building' && colony.buildings.includes(item.id)) return refuse('cheatTarget', `${colony.name} already has its ${itemName(item)}`);
      const need = wanting(colony);
      return need.hammers === 0 && need.tools === 0 ? refuse('cheatTarget', `${colony.name} already has all its ${itemName(item)} needs`) : CHEAT_OK;
    }
    case 'building': {
      if (!(BUILDING_IDS as readonly string[]).includes(command.building)) return refuse('cheatTarget', `there is no building "${String(command.building)}"`);
      if (BUILDINGS[command.building].unused) return refuse('cheatTarget', `the ${BUILDINGS[command.building].name} "${command.building}" is never built`);
      return colony.buildings.includes(command.building) ? refuse('cheatTarget', `${colony.name} already has the ${BUILDINGS[command.building].name}`) : CHEAT_OK;
    }
    case 'liberty':
      return isCount(command.percent) && command.percent <= FULL ? CHEAT_OK : refuse('cheatAmount', `membership is a whole number from 0 to ${FULL}`);
    default:
      return null;
  }
}

/** Apply a checked cheat of this group. Null when the command is not one of this group's. */
export function applyColonies(state: GameState, player: Player, command: CheatCommand, _events: CheatSink): CheatOutcome | null {
  if (!COLONY_CHEATS.includes(command.cheat)) return null;
  const colony = colonyFor(state, player, (command as ColoniesCommand).colonyId) as Colony;
  switch (command.cheat) {
    case 'goods': {
      let goods = colony.goods;
      for (const good of goodsOf(command.good)) goods = addGoods(goods, good, (amountAfter(amountOf(goods, good), command.amount) as number) - amountOf(goods, good));
      const what = command.good !== 'all' ? GOOD_NAMES[command.good].toLowerCase() : command.amount.set ? 'every good' : 'of every good';
      return { state: withColony(state, { ...colony, goods }), summary: said(command.amount, what, `the warehouse of ${colony.name}`) };
    }
    case 'hammers':
      return { state: withColony(state, { ...colony, hammers: amountAfter(colony.hammers, command.amount) as number }), summary: said(command.amount, 'hammers', colony.name) };
    case 'finish': {
      // as paying for the project does, less the paying: the hammer store is topped up and the
      // missing tools are put in the warehouse, and the end of the turn finishes it as usual
      const need = wanting(colony);
      const goods = need.tools > 0 ? addGoods(colony.goods, 'tools', need.tools) : colony.goods;
      const item = colony.construction as NonNullable<Colony['construction']>;
      return {
        state: withColony(state, { ...colony, goods, hammers: colony.hammers + need.hammers }),
        summary: `Gave ${colony.name} the ${need.hammers} hammers and ${need.tools} tools its ${itemName(item)} still needs.`,
      };
    }
    case 'building': {
      const added = missingLinks(colony, command.building);
      const names = added.map((id) => BUILDINGS[id].name);
      const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
      return { state: withColony(state, { ...colony, buildings: [...colony.buildings, ...added] }), summary: `Built in ${colony.name}: ${list}.` };
    }
    case 'liberty': {
      const set: Colony = { ...colony, sol: { n: membersFor(state, colony, command.percent), d: colony.sol.d } };
      return { state: withColony(state, set), summary: `Set Sons of Liberty membership in ${colony.name} to ${solPercent(state, set)} percent.` };
    }
    default:
      return null;
  }
}

export const COLONIES_SPECS: readonly CheatSpec[] = [
  {
    name: 'goods',
    args: [{ name: 'colony', kind: 'colony' }, { name: 'good', kind: { anyOf: ['good', { oneOf: ['all'] }] } }, { name: 'amount', kind: 'amount' }],
    about: 'Adds to a good in a colony\'s warehouse, takes from it or sets it; "all" is every good. Refused if it would leave less than nothing. What is over the warehouse\'s room spoils at the end of the turn as always.',
    example: 'goods Jamestown muskets 300',
    build: (args) => ({ cheat: 'goods', colonyId: wordArg(args, 'colony') as ColonyId, good: choiceArg(args, 'good')?.value as GoodId | 'all', amount: amountArg(args, 'amount') as Amount }),
  },
  {
    name: 'hammers',
    args: [{ name: 'colony', kind: 'colony' }, { name: 'amount', kind: 'amount' }],
    about: 'Adds to the hammers a colony has put by, takes from them or sets them. Refused if it would leave less than nothing.',
    example: 'hammers Jamestown 100',
    build: (args) => ({ cheat: 'hammers', colonyId: wordArg(args, 'colony') as ColonyId, amount: amountArg(args, 'amount') as Amount }),
  },
  {
    name: 'finish',
    args: [{ name: 'colony', kind: 'colony' }],
    about: 'Gives a colony the hammers and the tools its project still needs, for no gold; it is finished at the end of the turn.',
    example: 'finish Jamestown',
    build: (args) => ({ cheat: 'finish', colonyId: wordArg(args, 'colony') as ColonyId }),
  },
  {
    name: 'building',
    args: [{ name: 'colony', kind: 'colony' }, { name: 'building', kind: 'building' }],
    about: 'Puts up a building at once, with whatever comes before it; the colony\'s size, the coast and the Congress are not asked.',
    example: 'building Jamestown fortress',
    build: (args) => ({ cheat: 'building', colonyId: wordArg(args, 'colony') as ColonyId, building: wordArg(args, 'building') as BuildingId }),
  },
  {
    name: 'liberty',
    args: [{ name: 'colony', kind: 'colony' }, { name: 'percent', kind: 'percent' }],
    about: 'Sets Sons of Liberty membership in a colony. The production bonus follows at the end of the turn.',
    example: 'liberty Jamestown 100',
    build: (args) => ({ cheat: 'liberty', colonyId: wordArg(args, 'colony') as ColonyId, percent: numberArg(args, 'percent') as number }),
  },
];
