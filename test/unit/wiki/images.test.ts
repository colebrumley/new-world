// R-1024: the game's sprites as PNG files for the player manual, under wiki/images/art/<group>/<id>.png.
// Each is blown up by a whole number, with no smoothing, so that its smaller side is at least 128 pixels.
//
// To regenerate after the art changes:   UPDATE_FIXTURES=1 npm test -- test/unit/wiki
//
// Without UPDATE_FIXTURES this test only reads: it fails if a file is missing, if its pixels differ from
// what the drawer gives now (pixels are compared, not bytes, so another zlib does not matter), or if a
// .png lies there that no id accounts for. With it, the files are written and stale ones removed.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ABSTRACT_GOOD_IDS, GOOD_IDS } from '../../../src/engine/data/goods';
import { BUILDING_IDS } from '../../../src/engine/data/buildings';
import { RESOURCE_IDS, RESOURCE_TERRAINS } from '../../../src/engine/data/resources';
import { TERRAIN_IDS, type TerrainId } from '../../../src/engine/data/terrain';
import { UNIT_TYPE_IDS } from '../../../src/engine/data/units';
import { CHART_MARK_KINDS } from '../../../src/ui/chart';
import { paintingRgba } from '../../../src/ui/frontispiece';
import {
  buildingArt, chartMarkArt, COLONY_LOOKS, detailedColonyArt, detailedPieceArt, detailedSettlementArt, detailedTileArt, goodArt,
  hasFigure, INK, toRgba, vellumArt, VILLAGE_LOOKS, type Sprite, type TileLook,
} from '../../../src/ui/pixel-art';
import { PORTRAIT_IDS, portraitRgba } from '../../../src/ui/portraits';
import { TITLE_HEIGHT, TITLE_WIDTH } from '../../../src/ui/title-art';
import { decodePng, encodePng, pngSize } from '../../helpers/wiki/png';

const ART_DIR = join(__dirname, '../../../wiki/images/art');
const UPDATE = Boolean(process.env['UPDATE_FIXTURES']);
const MIN_SIDE = 128;

interface Picture {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
}

/** Each pixel `by` x `by`, nearest neighbour. */
function enlarge(width: number, height: number, rgba: Uint8Array | Uint8ClampedArray, by: number): Picture {
  const out = new Uint8Array(width * by * height * by * 4);
  for (let y = 0; y < height * by; y++) {
    for (let x = 0; x < width * by; x++) {
      const from = (Math.floor(y / by) * width + Math.floor(x / by)) * 4;
      out.set(rgba.subarray(from, from + 4), (y * width * by + x) * 4);
    }
  }
  return { width: width * by, height: height * by, rgba: out };
}

/** The smallest whole number that brings the smaller side to MIN_SIDE or more. */
const fit = (width: number, height: number): number => Math.max(1, Math.ceil(MIN_SIDE / Math.min(width, height)));

function sprite(s: Sprite | null): Picture {
  if (!s) throw new Error('no sprite');
  return enlarge(s.size, s.size, toRgba(s), fit(s.size, s.size));
}

const bare = (terrain: TerrainId): TileLook => ({
  terrain, river: 'none', riverMask: 0, road: false, roadMask: 0, plowed: false, resource: null, rumor: false, totem: false, variant: 0,
});

/** Every picture the manual may use, by its path under wiki/images/art without the extension. */
function pictures(): Map<string, () => Picture> {
  const all = new Map<string, () => Picture>();
  for (const type of UNIT_TYPE_IDS.filter(hasFigure)) all.set(`units/${type}`, () => sprite(detailedPieceArt({ type, color: INK.red, label: '-', stacked: false })));
  for (const terrain of TERRAIN_IDS) all.set(`terrain/${terrain}`, () => sprite(detailedTileArt(bare(terrain))));
  const plains = bare('plains');
  // a river or road running through the square: north to south, and east to west
  all.set('terrain/plains-river', () => sprite(detailedTileArt({ ...plains, river: 'minor', riverMask: 1 | 4 })));
  all.set('terrain/plains-major-river', () => sprite(detailedTileArt({ ...plains, river: 'major', riverMask: 1 | 4 })));
  all.set('terrain/plains-road', () => sprite(detailedTileArt({ ...plains, road: true, roadMask: 4 | 64 })));
  all.set('terrain/plains-plowed', () => sprite(detailedTileArt({ ...plains, plowed: true })));
  all.set('terrain/plains-rumor', () => sprite(detailedTileArt({ ...plains, rumor: true })));
  all.set('terrain/plains-totem', () => sprite(detailedTileArt({ ...plains, totem: true })));
  for (const resource of RESOURCE_IDS) {
    all.set(`resources/${resource}`, () => sprite(detailedTileArt({ ...bare(RESOURCE_TERRAINS[resource][0]), resource })));
  }
  COLONY_LOOKS.forEach((look, fort) => all.set(`places/${look}`, () => sprite(detailedColonyArt(INK.red, 5, INK.white, fort))));
  VILLAGE_LOOKS.forEach((look, tech) => all.set(`places/${look}`, () => sprite(detailedSettlementArt(INK.red, tech, false, null))));
  all.set('places/villageCapital', () => sprite(detailedSettlementArt(INK.red, 1, true, null)));
  for (const id of BUILDING_IDS) if (buildingArt(id, INK.red)) all.set(`buildings/${id}`, () => sprite(buildingArt(id, INK.red)));
  for (const good of [...GOOD_IDS, ...ABSTRACT_GOOD_IDS]) all.set(`goods/${good}`, () => sprite(goodArt(good)));
  for (const id of PORTRAIT_IDS) all.set(`portraits/${id}`, () => enlarge(64, 64, portraitRgba(id, INK.red), 2));
  for (const kind of CHART_MARK_KINDS) all.set(`chart/${kind}-32`, () => sprite(chartMarkArt(kind, 32)));
  all.set('chart/vellum-32', () => sprite(vellumArt(32, 0, 0)));
  all.set('title/frontispiece', () => enlarge(TITLE_WIDTH, TITLE_HEIGHT, paintingRgba(), 2));
  return all;
}

const PICTURES = pictures();
const fileOf = (path: string): string => join(ART_DIR, `${path}.png`);

function pngsUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? pngsUnder(full) : entry.name.endsWith('.png') ? [full] : [];
  });
}

describe('the sprites in wiki/images/art', () => {
  it.each([...PICTURES.keys()])('%s.png holds what the game draws now', (path) => {
    const want = (PICTURES.get(path) as () => Picture)();
    expect(Math.min(want.width, want.height)).toBeGreaterThanOrEqual(MIN_SIDE);
    const file = fileOf(path);
    if (UPDATE) {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, encodePng(want.width, want.height, want.rgba));
    }
    expect(existsSync(file), `${path}.png is missing: run UPDATE_FIXTURES=1 npm test -- test/unit/wiki`).toBe(true);
    const got = decodePng(readFileSync(file));
    expect([got.width, got.height]).toEqual([want.width, want.height]);
    expect(Buffer.from(got.rgba).equals(Buffer.from(want.rgba)), `${path}.png differs from the game's art: run UPDATE_FIXTURES=1 npm test -- test/unit/wiki`).toBe(true);
  });

  it('holds no picture that no id accounts for', () => {
    const wanted = new Set([...PICTURES.keys()].map(fileOf));
    const stale = pngsUnder(ART_DIR).filter((file) => !wanted.has(file));
    if (UPDATE) for (const file of stale) rmSync(file);
    expect(UPDATE ? [] : stale.map((file) => relative(ART_DIR, file))).toEqual([]);
  });

  it('draws a unit and a portrait at 128 pixels square', () => {
    expect(pngSize(readFileSync(fileOf('units/soldier')))).toEqual({ width: 128, height: 128 });
    expect(pngSize(readFileSync(fileOf('portraits/king')))).toEqual({ width: 128, height: 128 });
  });

  it('reads back what it writes', () => {
    const rgba = Uint8Array.from({ length: 3 * 2 * 4 }, (_, i) => (i * 37) % 256);
    const png = encodePng(3, 2, rgba);
    expect(pngSize(png)).toEqual({ width: 3, height: 2 });
    expect(decodePng(png)).toEqual({ width: 3, height: 2, rgba });
  });
});
