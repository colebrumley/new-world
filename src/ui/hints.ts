// Tutorial hints (R-1001): advice offered once each, at the moments a newcomer needs it. The
// nineteen moments follow the original's; every sentence is our own.
import { checkFound, coloniesOf } from '../engine/colony';
import { GOOD_NAMES, type GoodId } from '../engine/data/goods';
import { NATIONS } from '../engine/data/nations';
import { UNSKILLED } from '../engine/data/professions';
import { UNIT_TYPES } from '../engine/data/units';
import { colonyProduction } from '../engine/economy';
import { askPrice } from '../engine/market';
import { colonyAt, tileAt, type GameState, type PlayerId, type Unit } from '../engine/state';
import { isLand } from '../engine/tile';

export interface Hint {
  readonly id: number;
  readonly text: string;
}

export interface HintContext {
  /** Which screen the player is looking at. */
  readonly where: 'map' | 'colony' | 'europe';
  /** The unit awaiting orders, on the map. */
  readonly activeUnitId?: string | null;
  /** The colony whose screen is open. */
  readonly colonyId?: string | null;
}

const goodName = (good: GoodId): string => ((GOOD_NAMES as Readonly<Record<string, string>>)[good] ?? good).toLowerCase();
const DIRS = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]] as const;
const isShip = (u: Unit): boolean => UNIT_TYPES[u.type].domain === 'sea';

/** The first hint that fits the moment and has not been given yet. */
export function nextHint(state: GameState, playerId: PlayerId, context: HintContext, seen: ReadonlySet<number>): Hint | null {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return null;
  const mine = coloniesOf(state, playerId);
  const unit = context.activeUnitId ? state.units[context.activeUnitId] ?? null : null;
  const active = unit && unit.owner === playerId && unit.voyage === null ? unit : null;
  const here = active ? tileAt(state.map, active.x, active.y) : null;
  const port = NATIONS[player.nation].homePort;
  const open = context.colonyId ? state.colonies[context.colonyId] ?? null : null;
  const hints: (() => string | null)[] = [];
  const when = (id: number, test: () => string | null): void => {
    hints[id] = test;
  };

  // --- on the map ---
  when(1, () => (context.where === 'map' && active && isShip(active) && mine.length === 0 && state.turn <= 1 && Object.values(state.units).some((u) => u.aboard === active.id)
    ? `Our ${UNIT_TYPES[active.type].name} is on the open sea with colonists aboard. Land most likely lies to the west (left arrow); the way home to ${port} is east.` : null));
  when(2, () => (context.where === 'map' && active && isShip(active) && mine.length === 0 && DIRS.some(([dx, dy]) => {
    const t = tileAt(state.map, active.x + dx, active.y + dy);
    return t !== null && isLand(t);
  }) ? 'Land lies alongside. Steer the ship at the shore and choose Make landfall to put the colonists ashore.' : null));
  when(13, () => (context.where === 'map' && active?.type === 'pioneer'
    ? 'Pioneers carry tools: each road, cleared forest or plowed field uses 20 of them. More tools must be bought in Europe or forged by a blacksmith.' : null));
  when(14, () => (context.where === 'map' && active?.type === 'soldier'
    ? 'Soldiers can attack, but their first duty is to guard a colony. Each carries 50 muskets; give them 50 horses as well and they fight as dragoons.' : null));
  when(3, () => (context.where === 'map' && active && mine.length === 0 && checkFound(state, active).ok
    ? 'This would do for a first colony: near the sea, with land to work. Press B to build it here.' : null));
  when(11, () => (context.where === 'map' && active && isShip(active) && mine.length > 0
    ? `A ship explores, carries cargo home to ${port} to be sold, and fetches new colonists. Arrows steer it; G sends it to a port of your choosing.` : null));
  when(9, () => (context.where === 'map' && active?.type === 'pioneer' && here && isLand(here) && !here.road && !colonyAt(state, active.x, active.y)
    ? 'A road here would speed travel and raise what the square gives in furs, lumber, ore and silver. Press R to have the pioneer build one.' : null));
  when(10, () => (context.where === 'map' && active?.type === 'pioneer' && here && isLand(here) && !here.plowed
    ? here.forest ? 'Press P to have the pioneer clear this forest, opening the ground to crops.' : 'Press P to have the pioneer plow this square; plowed land gives more food and more of every crop.' : null));
  when(8, () => {
    if (context.where !== 'map' || !active || active.type !== 'colonist' || active.profession === null || !UNSKILLED.includes(active.profession) || active.profession === 'indianConvert') return null;
    const village = Object.values(state.settlements).find((s) => Math.max(Math.abs(s.x - active.x), Math.abs(s.y - active.y)) <= 2 && state.tribes[s.tribe]?.peace.includes(playerId));
    return village ? 'This colonist has no trade. Walk him into the friendly settlement nearby and its people may teach him one.' : null;
  });
  when(15, () => {
    if (context.where !== 'map') return null;
    const waiting = Object.values(state.units).find((u) => u.owner === playerId && u.voyage === null && u.aboard === null && u.type === 'colonist' && colonyAt(state, u.x, u.y)?.owner === playerId);
    return waiting ? `Colonists stand at the gates of ${colonyAt(state, waiting.x, waiting.y)?.name ?? 'the colony'}. Open the colony and set them to work in a field or a building.` : null;
  });
  when(5, () => {
    if (context.where !== 'map' || player.atWar) return null;
    const docks = Object.values(state.units).filter((u) => u.owner === playerId && u.voyage?.phase === 'inEurope' && !isShip(u)).length;
    const shipHere = Object.values(state.units).some((u) => u.owner === playerId && isShip(u) && u.voyage === null);
    return docks > 0 && shipHere && mine.length > 0 ? `${docks} ${docks === 1 ? 'person waits' : 'people wait'} on the docks in ${port}. Send a ship home and they will come out with it.` : null;
  });
  when(6, () => {
    if (context.where !== 'map') return null;
    for (const colony of mine) {
      const good = (Object.entries(colony.goods) as [GoodId, number][]).find(([g, n]) => g !== 'food' && g !== 'lumber' && n >= 100);
      if (good) return `${colony.name} has ${good[1]} ${goodName(good[0])} in store. Bring a ship in, load it, and sell the cargo in ${port}.`;
    }
    return null;
  });
  when(7, () => {
    const growing = mine.find((c) => c.colonists.length >= 3 && !c.buildings.includes('stockade'));
    return context.where !== 'europe' && growing
      ? `${growing.name} is growing and has no Stockade. Set one colonist to cut lumber in a forest square and another to work as a carpenter, then choose what to build.` : null;
  });
  when(19, () => (context.where !== 'europe' && (Object.values(state.units).some((u) => u.owner === playerId && u.profession === 'indianConvert') || mine.some((c) => c.colonists.some((p) => p.profession === 'indianConvert')))
    ? 'Converts are native people who have come to live among us. They cannot be schooled in a trade, but they work the land and the sea better than an ordinary colonist.' : null));

  // --- in a colony ---
  when(4, () => (context.where === 'colony' && open
    ? 'Here you decide what each colonist does. Pick a colonist to choose his work, in a field outside or in one of the buildings; "Leave the colony" sends him out through the gates.' : null));
  when(16, () => {
    if (context.where !== 'colony' || !open) return null;
    const report = colonyProduction(state, open);
    return report.consumed.food > report.produced.food ? 'This colony eats more than it grows: each colonist needs two food a turn. Put more people to farming or fishing, and have pioneers plow the fields.' : null;
  });
  when(12, () => (context.where === 'colony' && open && Object.values(state.units).some((u) => u.owner === playerId && isShip(u) && u.voyage === null && u.x === open.x && u.y === open.y)
    ? 'A ship lies in port. Load cargo from the warehouse into her holds here; back on the map, G will send her on to Europe.' : null));

  // --- in Europe ---
  when(17, () => (context.where === 'europe'
    ? `This is ${port}. Colonists who come forward wait on the docks for a ship; you may also recruit or train more for gold. Each cargo shows two prices: what the port pays, and what it asks.` : null));
  when(18, () => {
    if (context.where !== 'europe') return null;
    const dear = (Object.keys(GOOD_NAMES) as GoodId[]).some((g) => player.gold > 0 && player.gold < 100 * askPrice(state, playerId, g));
    return dear ? 'A full load is 100 units. When the treasury will not stretch to that, a smaller lot can be bought instead.' : null;
  });

  // in the order a new player meets them
  for (const id of [1, 2, 13, 14, 3, 4, 16, 12, 7, 15, 11, 9, 10, 8, 6, 5, 19, 17, 18]) {
    if (seen.has(id)) continue;
    const text = hints[id]?.() ?? null;
    if (text) return { id, text };
  }
  return null;
}

/** How many hint moments there are. */
export const HINT_COUNT = 19;
