// Which colony each wagon train of a power serves. Computer powers keep one wagon to a colony
// (R-804); nothing is stored, so the pairing is worked out from where the wagons stand.
import { coloniesOf } from './colony';
import { landmassAt } from './regions';
import { colonyAt, type ColonyId, type GameState, type PlayerId, type UnitId } from './state';

/**
 * The colony each of a power's wagon trains serves. A wagon standing in one of its colonies
 * serves that one; each of the others, in order of id, takes the nearest colony on its landmass
 * that no other wagon has. A wagon with no such colony is left out.
 */
export function wagonHomes(state: GameState, owner: PlayerId): Record<UnitId, ColonyId> {
  const wagons = Object.values(state.units)
    .filter((u) => u.owner === owner && u.type === 'wagonTrain' && u.voyage === null)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const colonies = coloniesOf(state, owner);
  const homes: Record<UnitId, ColonyId> = {};
  const taken = new Set<ColonyId>();
  for (const wagon of wagons) {
    const here = colonyAt(state, wagon.x, wagon.y);
    if (!here || here.owner !== owner || taken.has(here.id)) continue;
    homes[wagon.id] = here.id;
    taken.add(here.id);
  }
  for (const wagon of wagons) {
    if (homes[wagon.id] !== undefined) continue;
    const land = landmassAt(state.map, wagon.x, wagon.y);
    let best: { id: ColonyId; away: number } | null = null;
    for (const colony of colonies) {
      if (taken.has(colony.id) || landmassAt(state.map, colony.x, colony.y) !== land) continue;
      const away = Math.max(Math.abs(colony.x - wagon.x), Math.abs(colony.y - wagon.y));
      if (!best || away < best.away) best = { id: colony.id, away };
    }
    if (!best) continue;
    homes[wagon.id] = best.id;
    taken.add(best.id);
  }
  return homes;
}
