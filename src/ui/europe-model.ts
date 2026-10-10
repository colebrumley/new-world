// What the Europe screen shows, as plain data.
import { holdsUsed } from '../engine/cargo';
import { COLONIST_ROLES, type ColonistRole } from '../engine/data/equipment';
import { GOOD_IDS, GOOD_NAMES, type GoodId } from '../engine/data/goods';
import { NATIONS } from '../engine/data/nations';
import { PROFESSION_IDS, PROFESSIONS, type ProfessionId } from '../engine/data/professions';
import { UNIT_TYPE_IDS, UNIT_TYPES, type UnitTypeId } from '../engine/data/units';
import { checkDockEquip, dockEquipPlan, docksOf, purchasePrice, shipsInEurope, trainingPrice } from '../engine/europe';
import { recruitPrice } from '../engine/immigration';
import { askPrice, bidPrice, isBoycotted } from '../engine/market';
import type { GameState, Unit } from '../engine/state';
import { unitLabel } from './sidebar';

export interface EuropeShip {
  readonly id: string;
  /** The kind of ship, which is also the name of its picture. */
  readonly type: UnitTypeId;
  readonly label: string;
  readonly holds: number;
  readonly used: number;
  readonly cargo: readonly { readonly good: GoodId; readonly name: string; readonly amount: number }[];
  readonly passengers: readonly { readonly id: string; readonly type: UnitTypeId; readonly label: string }[];
}

export interface EuropeVoyage {
  readonly id: string;
  readonly type: UnitTypeId;
  readonly label: string;
  readonly turns: number;
}

export interface EuropeView {
  readonly port: string;
  readonly gold: number;
  readonly taxRate: number;
  /** Ships on their way here, and on their way back, with turns to go. */
  readonly expected: readonly EuropeVoyage[];
  readonly outbound: readonly EuropeVoyage[];
  readonly inPort: readonly EuropeShip[];
  readonly docks: readonly { readonly id: string; readonly type: UnitTypeId; readonly label: string; readonly boarding: boolean }[];
  readonly prices: readonly { readonly good: GoodId; readonly name: string; readonly bid: number; readonly ask: number; readonly boycotted: boolean }[];
  /** The immigrant pool, and what passage for any one of them costs now. */
  readonly pool: readonly { readonly slot: number; readonly label: string }[];
  readonly recruitPrice: number;
  readonly train: readonly { readonly profession: ProfessionId; readonly label: string; readonly price: number }[];
  readonly purchase: readonly { readonly unit: UnitTypeId; readonly label: string; readonly price: number }[];
}

const shipLabel = (u: Unit): string => UNIT_TYPES[u.type].name;

export function europeView(state: GameState, playerId: string): EuropeView | null {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return null;
  const mine = Object.values(state.units).filter((u) => u.owner === playerId);
  const transit = (phase: 'toEurope' | 'toNewWorld') =>
    mine.filter((u) => u.voyage?.phase === phase && u.aboard === null).map((u) => ({ id: u.id, type: u.type, label: shipLabel(u), turns: u.voyage?.turnsLeft ?? 0 }));
  return {
    port: NATIONS[player.nation].homePort,
    gold: player.gold,
    taxRate: player.taxRate,
    expected: transit('toEurope'),
    outbound: transit('toNewWorld'),
    inPort: shipsInEurope(state, playerId).map((ship) => ({
      id: ship.id,
      type: ship.type,
      label: shipLabel(ship),
      holds: UNIT_TYPES[ship.type].holds,
      used: holdsUsed(state, ship),
      cargo: GOOD_IDS.filter((g) => (ship.cargo[g] ?? 0) > 0).map((g) => ({ good: g, name: GOOD_NAMES[g], amount: ship.cargo[g] ?? 0 })),
      passengers: mine.filter((u) => u.aboard === ship.id).map((u) => ({ id: u.id, type: u.type, label: unitLabel(u) })),
    })),
    docks: docksOf(state, playerId).map((u) => ({ id: u.id, type: u.type, label: unitLabel(u), boarding: u.orders === 'sentry' })),
    prices: GOOD_IDS.map((g) => ({ good: g, name: GOOD_NAMES[g], bid: bidPrice(state, playerId, g), ask: askPrice(state, playerId, g), boycotted: isBoycotted(state, playerId, g) })),
    pool: player.pool.map((p, slot) => ({ slot, label: PROFESSIONS[p].name })),
    recruitPrice: recruitPrice(state, playerId),
    train: PROFESSION_IDS.filter((p) => trainingPrice(p) !== null)
      .map((p) => ({ profession: p, label: PROFESSIONS[p].name, price: trainingPrice(p) as number }))
      .sort((a, b) => a.price - b.price),
    purchase: UNIT_TYPE_IDS.filter((t) => purchasePrice(state, playerId, t) !== null).map((t) => ({ unit: t, label: UNIT_TYPES[t].name, price: purchasePrice(state, playerId, t) as number })),
  };
}

const ROLE_LABEL: Readonly<Record<ColonistRole, string>> = {
  colonist: 'Sell the equipment', soldier: 'Arm with muskets', dragoon: 'Arm and mount as a dragoon', scout: 'Mount as a scout',
  pioneer: 'Equip with tools', missionary: 'Bless as a missionary',
};

/** Ways someone on the docks can be fitted out now, with what each costs (negative = money back). */
export function dockOptions(state: GameState, unitId: string): { role: ColonistRole; label: string; cost: number }[] {
  const unit = state.units[unitId];
  if (!unit) return [];
  return COLONIST_ROLES.filter((role) => checkDockEquip(state, unit, role).ok).map((role) => {
    const cost = dockEquipPlan(state, unit, role).cost;
    const money = cost > 0 ? ` (${cost} gold)` : cost < 0 ? ` (+${-cost} gold)` : '';
    return { role, label: `${ROLE_LABEL[role]}${money}`, cost };
  });
}
