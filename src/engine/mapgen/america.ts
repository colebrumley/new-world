// Builds the America scenario map (R-103) from the four authored charts in data/america.ts:
// ground, relief, rivers and extras, one letter per playable square. Nothing is generated.
import {
  AMERICA_CHARTS, AMERICA_EXTRAS_LEGEND, AMERICA_GROUND_LEGEND, AMERICA_RELIEF_LEGEND, AMERICA_RIVERS_LEGEND, AMERICA_STARTS,
} from '../data/america';
import { MAP_HEIGHT, MAP_WIDTH } from '../data/mapgen';
import type { GameMap } from '../state';
import { makeTile, type Tile } from '../tile';

/** Playable coordinate to bordered-grid coordinate. */
export const toGrid = (p: readonly [number, number]): [number, number] => [p[0] + 1, p[1] + 1];

/** The four charts of a map, each one string of letters per playable row. */
export interface AmericaCharts {
  readonly ground: readonly string[];
  readonly relief: readonly string[];
  readonly rivers: readonly string[];
  readonly extras: readonly string[];
}

const CHART_NAMES = ['ground', 'relief', 'rivers', 'extras'] as const;
const ROWS = MAP_HEIGHT - 2;
const COLUMNS = MAP_WIDTH - 2;

const LEGENDS = {
  ground: AMERICA_GROUND_LEGEND,
  relief: AMERICA_RELIEF_LEGEND,
  rivers: AMERICA_RIVERS_LEGEND,
  extras: AMERICA_EXTRAS_LEGEND,
} as const;

function checkChart(name: (typeof CHART_NAMES)[number], rows: readonly string[]): void {
  const legend: Record<string, unknown> = LEGENDS[name];
  for (let y = 0; y < ROWS; y++) {
    const row = rows[y];
    if (row === undefined) throw new RangeError(`${name} chart: row ${y} is missing (a chart has ${ROWS} rows)`);
    if (row.length !== COLUMNS) throw new RangeError(`${name} chart: row ${y} has ${row.length} characters, not ${COLUMNS}`);
    for (let x = 0; x < COLUMNS; x++) {
      if (!Object.hasOwn(legend, row[x] as string)) throw new RangeError(`${name} chart: row ${y} holds '${row[x]}' at x ${x}, not in its legend`);
    }
  }
  if (rows.length > ROWS) throw new RangeError(`${name} chart: row ${ROWS} is one too many (a chart has ${ROWS} rows)`);
}

/** Build a full map from four charts: they fill the playable area, the border ring is plain ocean. */
export function readCharts(charts: AmericaCharts): GameMap {
  for (const name of CHART_NAMES) checkChart(name, charts[name]);
  const tiles: Tile[] = [];
  for (let gy = 0; gy < MAP_HEIGHT; gy++) {
    for (let gx = 0; gx < MAP_WIDTH; gx++) {
      const x = gx - 1;
      const y = gy - 1;
      if (x < 0 || y < 0 || x >= COLUMNS || y >= ROWS) {
        tiles.push(makeTile());
        continue;
      }
      const letter = (name: (typeof CHART_NAMES)[number]): string => (charts[name][y] as string)[x] as string;
      const ground = AMERICA_GROUND_LEGEND[letter('ground') as keyof typeof AMERICA_GROUND_LEGEND];
      const extra = AMERICA_EXTRAS_LEGEND[letter('extras') as keyof typeof AMERICA_EXTRAS_LEGEND];
      tiles.push(makeTile({
        base: ground.base,
        forest: ground.forest,
        relief: AMERICA_RELIEF_LEGEND[letter('relief') as keyof typeof AMERICA_RELIEF_LEGEND],
        river: AMERICA_RIVERS_LEGEND[letter('rivers') as keyof typeof AMERICA_RIVERS_LEGEND],
        resource: extra === 'rumor' ? null : extra,
        rumor: extra === 'rumor',
      }));
    }
  }
  return { width: MAP_WIDTH, height: MAP_HEIGHT, tiles };
}

/** The America map, read from the authored charts; a fresh object on every call. */
export function americaMap(): GameMap {
  return readCharts(AMERICA_CHARTS);
}

function inverse(legend: Record<string, unknown>, key: (value: unknown) => string): Map<string, string> {
  return new Map(Object.entries(legend).map(([letter, value]) => [key(value), letter]));
}

const GROUND_LETTER = inverse(AMERICA_GROUND_LEGEND, (v) => JSON.stringify(v));
const RELIEF_LETTER = inverse(AMERICA_RELIEF_LEGEND, String);
const RIVER_LETTER = inverse(AMERICA_RIVERS_LEGEND, String);
const EXTRA_LETTER = inverse(AMERICA_EXTRAS_LEGEND, String);

/** The charts of a map's playable area: the inverse of readCharts. Throws on a square no chart can say. */
export function chartsOf(map: GameMap): { ground: string[]; relief: string[]; rivers: string[]; extras: string[] } {
  const out = { ground: [] as string[], relief: [] as string[], rivers: [] as string[], extras: [] as string[] };
  const pick = (table: Map<string, string>, key: string, where: string): string => {
    const letter = table.get(key);
    if (letter === undefined) throw new RangeError(`no chart letter for ${key} at ${where}`);
    return letter;
  };
  for (let y = 1; y < map.height - 1; y++) {
    let ground = '';
    let relief = '';
    let rivers = '';
    let extras = '';
    for (let x = 1; x < map.width - 1; x++) {
      const t = map.tiles[y * map.width + x] as Tile;
      const where = `${x - 1},${y - 1}`;
      ground += pick(GROUND_LETTER, JSON.stringify({ base: t.base, forest: t.forest }), where);
      relief += pick(RELIEF_LETTER, t.relief, where);
      rivers += pick(RIVER_LETTER, t.river, where);
      extras += pick(EXTRA_LETTER, t.rumor ? 'rumor' : String(t.resource), where);
    }
    out.ground.push(ground);
    out.relief.push(relief);
    out.rivers.push(rivers);
    out.extras.push(extras);
  }
  return out;
}

/** Grid coordinates of each power's starting sea tile on the America map. */
export function americaStarts(): Record<keyof typeof AMERICA_STARTS, [number, number]> {
  return {
    england: toGrid(AMERICA_STARTS.england),
    france: toGrid(AMERICA_STARTS.france),
    spain: toGrid(AMERICA_STARTS.spain),
    netherlands: toGrid(AMERICA_STARTS.netherlands),
  };
}
