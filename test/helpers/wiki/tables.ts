// R-1025: the generated reference tables of the player manual in wiki/. A page holds a marked block,
//   <!-- table: name -->
//   (generated; do not edit by hand)
//   <!-- /table -->
// and test/unit/wiki/tables.test.ts fills its body from the renderer registered here under that name
// (with UPDATE_FIXTURES=1) or fails when the body is not what the renderer gives. Every number comes
// from the rule tables, so the manual cannot disagree with the game. Content items add their own
// renderers to TABLES.
import { describeDifficulty, difficultyProfile } from '../../../src/engine/difficulty';
import { DIFFICULTIES } from '../../../src/engine/data/yields';
import { GOOD_NAMES } from '../../../src/engine/data/goods';
import { PIONEER_WORK } from '../../../src/engine/data/pioneer';
import { RESOURCE_BONUS, RESOURCE_IDS, RESOURCE_TERRAINS, RESOURCES, type ResourceBonus, type ResourceId } from '../../../src/engine/data/resources';
import {
  CLEARED_FROM, defensePercent, RAW_GOODS, TERRAIN, TERRAIN_IDS, type ForestTerrain, type RawGood, type TerrainId,
} from '../../../src/engine/data/terrain';
import { jobTurns } from '../../../src/engine/pioneer';
import { makeTile, type Tile } from '../../../src/engine/tile';
import { FREE_COLONIST, tileYield, type OutdoorWorker } from '../../../src/engine/yields';
import { YIELD_RULES } from '../../../src/engine/data/yields';

const cell = (value: string | number): string => String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

/** A GitHub Markdown table with left-aligned columns; `|` in a cell is escaped, numbers are written as given. */
export function mdTable(headers: readonly string[], rows: readonly (readonly (string | number)[])[]): string {
  const line = (cells: readonly (string | number)[]): string => `| ${cells.map(cell).join(' | ')} |`;
  return [line(headers), `| ${headers.map(() => ':---').join(' | ')} |`, ...rows.map(line)].join('\n');
}

/** A Markdown image, `![alt](path)`; the path is relative to the wiki's root (`images/art/goods/food.png`). */
export function img(path: string, alt: string): string {
  return `![${alt.replace(/[[\]]/g, '')}](${path})`;
}

function difficultyLevels(): string {
  return mdTable(
    ['Level', 'Starting gold', "The Crown's starting force", 'Rating factor (per hundred)', 'In short'],
    DIFFICULTIES.map((d) => {
      const p = difficultyProfile(d);
      const { regulars, cavalry, artillery, ships } = p.ref;
      return [p.name, p.startingGold, `${regulars} regulars, ${cavalry} cavalry, ${artillery} artillery, ${ships} warships`, p.ratingFactor, describeDifficulty(d)];
    }),
  );
}

// --- The Map (R-1028) ------------------------------------------------------------------------

/** A bare square of one terrain row: no river, road, plowing or resource. */
function bareTile(terrain: TerrainId): Tile {
  if (terrain === 'hills' || terrain === 'mountains') return makeTile({ base: 'plains', relief: terrain });
  if (Object.hasOwn(CLEARED_FROM, terrain)) return makeTile({ base: CLEARED_FROM[terrain as ForestTerrain], forest: true });
  return makeTile({ base: terrain as Exclude<TerrainId, ForestTerrain | 'hills' | 'mountains'> });
}

const rawGoodName = (good: RawGood): string => (good === 'fish' ? 'Fish' : GOOD_NAMES[good]);

/** "3 Food, 3 Tobacco": what a free colonist brings in on the square, zeros left out. */
function yieldsOn(tile: Tile, waterNeighbors = 0): string {
  return RAW_GOODS.flatMap((good) => {
    const n = tileYield(tile, good, FREE_COLONIST, { waterNeighbors });
    return n > 0 ? [`${n} ${rawGoodName(good)}`] : [];
  }).join(', ');
}

function terrainKind(terrain: TerrainId): string {
  const def = TERRAIN[terrain];
  if (def.water) return 'water';
  if (def.kind === 'open') return 'open';
  if (def.kind === 'forest') return 'forested';
  return terrain === 'arctic' ? 'ice' : terrain;
}

/** "4 Fish with 0 to 5 water neighbours, 2 Fish with 6 to 7, ...": one entry per band of the fish rule. */
function fishByBand(tile: Tile): string {
  const mins = YIELD_RULES.fishByWaterNeighbors.map(([min]) => min).sort((a, b) => a - b);
  return mins.map((min, i) => {
    const next = mins[i + 1];
    const band = next === undefined ? (min === 8 ? 'all 8' : `${min} or more`) : next - 1 === min ? `${min}` : next - 2 === min ? `${min} or ${next - 1}` : `${min} to ${next - 1}`;
    return `${yieldsOn(tile, min)} with ${band}${i === 0 ? ' of the 8 neighbours water' : ''}`;
  }).join(', ');
}

function terrainTable(): string {
  return mdTable(
    ['', 'Terrain', 'Kind', 'Move cost', 'Defence', 'A free colonist gets', 'Cleared, it becomes'],
    TERRAIN_IDS.map((t) => {
      const def = TERRAIN[t];
      const tile = bareTile(t);
      const fish = def.water ? fishByBand(tile) : yieldsOn(tile) || 'nothing';
      const defence = defensePercent(t);
      return [
        img(`images/art/terrain/${t}.png`, def.name), def.name, terrainKind(t), def.moveCost, defence === 0 ? 'none' : `+${defence}%`, fish,
        Object.hasOwn(CLEARED_FROM, t) ? TERRAIN[CLEARED_FROM[t as ForestTerrain]].name : '',
      ];
    }),
  );
}

function pioneerWork(): string {
  const turns = (n: number, hardy: number): string => `${n} (${hardy})`;
  return mdTable(
    ['Terrain', 'Road', 'Clear the forest', 'Plow'],
    TERRAIN_IDS.filter((t) => !TERRAIN[t].water).map((t) => {
      const tile = bareTile(t);
      const forest = Object.hasOwn(CLEARED_FROM, t);
      const noPlow = (PIONEER_WORK.noPlow as readonly string[]).includes(t);
      const job = (j: 'road' | 'plow'): string => turns(jobTurns(tile, j, false), jobTurns(tile, j, true));
      return [TERRAIN[t].name, job('road'), forest ? job('plow') : '', forest ? 'clear first' : noPlow ? 'cannot be plowed' : job('plow')];
    }),
  );
}

/** What a resource adds to a free colonist's figure and to an expert's, read from the yield rule itself. */
function resourceEffectText(r: ResourceId, bare: Tile): string {
  const tile = { ...bare, resource: r };
  const bonuses: Partial<Record<RawGood, ResourceBonus>> = RESOURCE_BONUS[r];
  const parts = RAW_GOODS.flatMap((good) => {
    const b = bonuses[good];
    if (!b) return [];
    if (b.kind === 'double') return [`doubles ${rawGoodName(good)}`];
    const gain = (w: OutdoorWorker): number => tileYield(tile, good, w) - tileYield(bare, good, w);
    return [`+${gain(FREE_COLONIST)} ${rawGoodName(good)} (+${gain({ ...FREE_COLONIST, expertGood: good })} for the expert)`];
  });
  return parts.join(', ');
}

/** Every resource a map can carry. The Depleted Mine is left out: no map places one and no deposit becomes one in play. */
function resourceTable(): string {
  return mdTable(
    ['', 'Resource', 'Found on', 'Adds'],
    RESOURCE_IDS.filter((r) => r !== 'depletedMine').map((r) => {
      const terrains: readonly TerrainId[] = RESOURCE_TERRAINS[r];
      const bare = bareTile(terrains[0]!);
      return [img(`images/art/resources/${r}.png`, RESOURCES[r].name), RESOURCES[r].name, terrains.map((t) => TERRAIN[t].name).join(', '), resourceEffectText(r, bare)];
    }),
  );
}

/** The renderer for each block name: GitHub Markdown, a table or a list. */
export const TABLES: Readonly<Record<string, () => string>> = {
  'difficulty-levels': difficultyLevels,
  terrain: terrainTable,
  'pioneer-work': pioneerWork,
  resources: resourceTable,
};

/** A marked block: the opening marker (group 1), its name (2), its body (3) and the closing marker (4). */
export const BLOCK = /(<!--\s*table:\s*([\w-]+)\s*-->)([\s\S]*?)(<!--\s*\/table\s*-->)/g;

/** The renderer registered under a block name, or undefined (never one inherited from Object). */
export const rendererFor = (name: string): (() => string) | undefined => (Object.hasOwn(TABLES, name) ? TABLES[name] : undefined);

/** The markdown with the body of every marked block replaced by its renderer's output. */
export function fillTables(markdown: string): string {
  return markdown.replace(BLOCK, (_all, open: string, name: string, _body: string, close: string) => {
    const render = rendererFor(name);
    if (!render) throw new Error(`no renderer is registered for the table block "${name}"`);
    return `${open}\n\n${render()}\n\n${close}`;
  });
}
