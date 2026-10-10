// What a map square is, in words: the pure model behind the map's hover slip and the sidebar's
// list of ground features. Nothing here touches the DOM.
import { GOOD_NAMES } from '../engine/data/goods';
import { RESOURCE_BONUS, RESOURCES, type ResourceBonus, type ResourceId } from '../engine/data/resources';
import { defensePercent, RAW_GOODS, TERRAIN, type RawGood } from '../engine/data/terrain';
import { tileAt, type GameState } from '../engine/state';
import { isExploredBy, terrainOf, type Tile } from '../engine/tile';
import { countWaterNeighbors, FREE_COLONIST, tileYield } from '../engine/yields';
import { viewerIndex } from './render';

export interface TileTip {
  /** The terrain's name: "Grassland", "Conifer Forest", "Hills", "Ocean". */
  readonly title: string;
  /** One line per feature, in this order: resource, river, road, plowed, rumor. */
  readonly features: readonly string[];
  /** "3 Food, 3 Tobacco": what a free colonist brings in, in RAW_GOODS order, zeros left out; '' if nothing. */
  readonly yields: string;
  /** "Move 1 · Defence none" / "Move 2 · Defence +50%". */
  readonly ground: string;
}

/** Fish is a raw good but not a cargo, so it has no entry among the goods' names. */
function rawGoodName(good: RawGood): string {
  return good === 'fish' ? 'Fish' : GOOD_NAMES[good];
}

/** "+2 Food", "+3 Ore, +1 Silver", "doubles Cotton", "nothing left to dig": read from RESOURCE_BONUS. */
function resourceEffect(resource: ResourceId): string {
  const table: Partial<Record<RawGood, ResourceBonus>> = RESOURCE_BONUS[resource];
  const parts = RAW_GOODS.flatMap((good) => {
    const bonus = table[good];
    if (!bonus) return [];
    return [bonus.kind === 'double' ? `doubles ${rawGoodName(good)}` : `+${bonus.n} ${rawGoodName(good)}`];
  });
  return parts.length > 0 ? parts.join(', ') : 'nothing left to dig';
}

const RIVER_NAMES = { minor: 'Minor River', major: 'Major River' } as const;

/** River, road and plowed lines, in that order. */
function improvements(tile: Tile): string[] {
  const lines: string[] = [];
  if (tile.river !== 'none') lines.push(RIVER_NAMES[tile.river]);
  if (tile.road) lines.push('Road');
  if (tile.plowed) lines.push('Plowed');
  return lines;
}

/** The feature names the sidebar lists: river, road, plowed, resource, rumor, in the sidebar's order. */
export function groundFeatures(tile: Tile): string[] {
  const lines = improvements(tile);
  if (tile.resource) lines.push(RESOURCES[tile.resource].name);
  if (tile.rumor) lines.push('Lost City Rumor');
  return lines;
}

/** Null off the map and for a square the viewer has not explored (unless revealAll). */
export function tileTip(state: GameState, x: number, y: number, revealAll = false): TileTip | null {
  const tile = tileAt(state.map, x, y);
  if (!tile) return null;
  if (!revealAll && !isExploredBy(tile, viewerIndex(state))) return null;
  const terrain = terrainOf(tile);
  const features: string[] = [];
  if (tile.resource) features.push(`${RESOURCES[tile.resource].name}: ${resourceEffect(tile.resource)}`);
  features.push(...improvements(tile));
  if (tile.rumor) features.push('Lost City Rumor');
  // the square's own water neighbours, otherwise the neutral context (Docks assumed for fish)
  const context = { waterNeighbors: countWaterNeighbors(state.map, x, y) };
  const yields = RAW_GOODS.flatMap((good) => {
    const amount = tileYield(tile, good, FREE_COLONIST, context);
    return amount > 0 ? [`${amount} ${rawGoodName(good)}`] : [];
  }).join(', ');
  const defence = defensePercent(terrain);
  return {
    title: TERRAIN[terrain].name,
    features,
    yields,
    ground: `Move ${TERRAIN[terrain].moveCost} · Defence ${defence === 0 ? 'none' : `+${defence}%`}`,
  };
}
