// What a computer power's colonies ask to be sent, and where its ships take the goods
// (docs/RULES.md "Computer powers: supplies by ship").
import { coloniesOf } from '../engine/colony';
import { groundWanted } from '../engine/computer';
import { AI_SUPPLY, AI_WAGONS } from '../engine/data/ai';
import { GOOD_IDS, type GoodId } from '../engine/data/goods';
import { NATIONS } from '../engine/data/nations';
import { colonyProduction } from '../engine/economy';
import { priceLevel } from '../engine/market';
import { warehouseCapacity } from '../engine/pioneer';
import type { Colony, GameState, Player, Unit } from '../engine/state';
import { wagonHomes } from '../engine/wagons';
import { memo } from './campaign';
import { musterOf } from './muster';

const far = (ax: number, ay: number, bx: number, by: number): number => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
const stock = (colony: Colony, good: GoodId): number => colony.goods[good] ?? 0;
export type Supply = (typeof AI_SUPPLY.goods)[number];

/** The one good a colony asks its power to send, if any: the last of these that applies, and only a good it is not full of and does not make. */
export function colonyAsks(state: GameState, colony: Colony): Supply | null {
  return memo(state, `asks:${colony.id}`, () => {
    const player = state.players.find((p) => p.id === colony.owner) as Player;
    const made = colonyProduction(state, colony).produced;
    const muster = musterOf(state, colony);
    const few = stock(colony, 'muskets') < AI_SUPPLY.muskets;
    let asked: Supply | null = null;
    const ask = (good: Supply, want: boolean): void => {
      if (want && stock(colony, good) < warehouseCapacity(colony) && made[good] <= 0) asked = good;
      else if (asked === good) asked = null;
    };
    // muskets to keep in store, by the leader's temper
    ask('muskets', stock(colony, 'muskets') < AI_SUPPLY.muskets * (NATIONS[player.nation].leaderTraits.aggressive + AI_SUPPLY.musketLotsBase));
    const stocked = asked === 'muskets';
    const wagon = Object.values(wagonHomes(state, colony.owner)).includes(colony.id);
    ask('tradeGoods', stock(colony, 'tradeGoods') < AI_WAGONS.tradeGoodsBelow && priceLevel(state, colony.owner, 'tradeGoods') <= AI_WAGONS.tradeGoodsPriceMost && wagon);
    ask('horses', stock(colony, 'horses') < AI_SUPPLY.horses);
    ask('tools', stock(colony, 'tools') < AI_SUPPLY.tools && groundWanted(state, colony).work);
    // muskets it needs now come before all but tools
    const beforeTools = (asked as Supply | null) !== 'tools';
    ask('muskets', (muster.unmet > 0 && few) || (muster.wanted === 1 && few && beforeTools) || (muster.short && few && beforeTools) || (stocked && asked === 'muskets'));
    return asked;
  });
}

/**
 * How strongly the power wants each good sent: its colonies asking for it, muskets counting
 * twice; and once more for every colony with no muskets, no horses, no tools. Nothing else is
 * ever wanted.
 */
export function powerWants(state: GameState, player: Player): Record<GoodId, number> {
  return memo(state, `powerWants:${player.id}`, () => {
    const out = Object.fromEntries(GOOD_IDS.map((g) => [g, 0])) as Record<GoodId, number>;
    for (const c of coloniesOf(state, player.id)) {
      const asked = colonyAsks(state, c);
      if (asked) out[asked] += asked === 'muskets' ? 2 : 1;
      for (const good of ['muskets', 'horses', 'tools'] as const) if (stock(c, good) === 0) out[good] += 1;
    }
    return out;
  });
}

/**
 * The port a ship carries its cargo to: not where she lies; not one that makes a good she
 * carries and has a hundred of it; best by the room it has for what she carries, more for the
 * good it asks for, less the farther off.
 */
export function cargoPort(state: GameState, ship: Unit, ports: readonly Colony[]): Colony | null {
  const carried = AI_SUPPLY.goods.filter((g) => (ship.cargo[g] ?? 0) > 0);
  if (carried.length === 0) return null;
  let best: Colony | null = null;
  let top = -Infinity;
  for (const c of ports) {
    if (c.x === ship.x && c.y === ship.y) continue;
    const made = colonyProduction(state, c).produced;
    if (carried.some((g) => made[g] > 0 && stock(c, g) >= AI_SUPPLY.lot)) continue;
    const cap = warehouseCapacity(c);
    let score = 0;
    for (const g of carried) {
      score += cap - stock(c, g) - 1;
      const over = stock(c, g) + (ship.cargo[g] ?? 0) - cap;
      if (over > 0) score -= 4 * priceLevel(state, c.owner, g) * over;
    }
    const asked = colonyAsks(state, c);
    if (asked && carried.includes(asked)) score += AI_SUPPLY.askedBonus;
    score = Math.trunc(score / ((far(c.x, c.y, ship.x, ship.y) >> 2) + 1));
    if (score > top) {
      top = score;
      best = c;
    }
  }
  return best;
}
