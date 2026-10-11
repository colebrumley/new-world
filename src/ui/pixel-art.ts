// Pixel art for the map (R-1006). Everything on the map is drawn on a 16 x 16 grid of "art
// pixels" in a fixed palette of 32 colours, then blown up by whole numbers, so every zoom level
// shows the same crisp grid. All of it is made here from code: nothing is taken from
// anyone else's graphics (constraint C1), and nothing here needs a canvas, so it can be tested as data.
import type { AbstractGoodId, GoodId } from '../engine/data/goods';
import type { NationId } from '../engine/data/nations';
import type { ResourceId } from '../engine/data/resources';
import type { TerrainId } from '../engine/data/terrain';
import type { UnitTypeId } from '../engine/data/units';
import { BUILDING_ART, BUILDING_CODES, BUILDING_COLORS, BUILDING_SIZE } from './building-art';
import { CHART_ART, CHART_CODES, CHART_COLORS } from './chart-art';
import type { ChartMarkKind } from './chart';
import { FEATURE_ART, FEATURE_ART_16, FEATURE_CODES, FEATURE_COLORS, FEATURE_SIZE, FEATURE_SIZE_16 } from './feature-art';
import { FLOOR_ART, FLOOR_ART_16, FLOOR_CODES, FLOOR_COLORS, FLOOR_SIZE, FLOOR_SIZE_16 } from './floor-art';
import { GOODS_ART, GOODS_CODES, GOODS_COLORS, GOODS_SIZE } from './goods-art';
import { PLACE_ART, PLACE_CODES, PLACE_COLORS, PLACE_SIZE } from './place-art';
import { RESOURCE_ART, RESOURCE_ART_12, RESOURCE_CODES, RESOURCE_COLORS, RESOURCE_SIZE, RESOURCE_SIZE_12 } from './resource-art';
import { FIGURE_SIZE, UNIT_ART, UNIT_CODES, UNIT_COLORS } from './unit-art';

/** The 32 colours everything on the map is drawn in: a palette in the spirit of 256-colour VGA art. */
export const PALETTE = [
  '#0b0d12', // 0 void
  '#111111', // 1 ink
  '#f2f2f2', // 2 white
  '#e9dfc4', // 3 parchment
  '#c3c7cc', // 4 light grey
  '#8d8a84', // 5 grey
  '#5f5b57', // 6 dark grey
  '#141f6b', // 7 deep sea
  '#1f2f8e', // 8 sea
  '#3d58b0', // 9 wave
  '#4a8fe8', // 10 bright blue
  '#e6edf2', // 11 ice
  '#a8b08f', // 12 tundra
  '#d3bd7a', // 13 sand
  '#c2b268', // 14 plains
  '#cfae5c', // 15 prairie
  '#6cb43e', // 16 grass
  '#a9bd4a', // 17 savannah
  '#6a9c5e', // 18 marsh
  '#4c7a4e', // 19 swamp
  '#4f9f2c', // 20 leaf
  '#2b7a28', // 21 forest
  '#1a5a1e', // 22 deep forest
  '#a39262', // 23 hill
  '#7c6b45', // 24 earth
  '#6b4a2a', // 25 wood
  '#c8322b', // 26 red
  '#2f5fc4', // 27 blue
  '#d9c23c', // 28 yellow
  '#d9812e', // 29 orange
  '#39c24a', // 30 green
  '#8a5fb5', // 31 purple
] as const;

/** Names for the palette entries, so the art below reads as colours rather than numbers. */
export const INK = {
  void: 0, ink: 1, white: 2, parchment: 3, lightGrey: 4, grey: 5, darkGrey: 6, deepSea: 7, sea: 8, wave: 9, brightBlue: 10,
  ice: 11, tundra: 12, sand: 13, plains: 14, prairie: 15, grass: 16, savannah: 17, marsh: 18, swamp: 19, leaf: 20, forest: 21,
  deepForest: 22, hill: 23, earth: 24, wood: 25, red: 26, blue: 27, yellow: 28, orange: 29, green: 30, purple: 31,
} as const;
export type InkId = (typeof INK)[keyof typeof INK];

export const ART = 16;

/** A square of art pixels. Each cell is a palette index plus one; zero is see-through. */
export interface Sprite {
  readonly size: number;
  readonly cells: Uint8Array;
}

export const blank = (size = ART): Sprite => ({ size, cells: new Uint8Array(size * size) });
export const at = (s: Sprite, x: number, y: number): number => (x < 0 || y < 0 || x >= s.size || y >= s.size ? 0 : (s.cells[y * s.size + x] as number));

function dot(s: Sprite, x: number, y: number, ink: number): void {
  if (x >= 0 && y >= 0 && x < s.size && y < s.size) s.cells[y * s.size + x] = ink + 1;
}
function box(s: Sprite, x: number, y: number, w: number, h: number, ink: number): void {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) dot(s, x + i, y + j, ink);
}
function frame(s: Sprite, x: number, y: number, w: number, h: number, ink: number): void {
  box(s, x, y, w, 1, ink);
  box(s, x, y + h - 1, w, 1, ink);
  box(s, x, y, 1, h, ink);
  box(s, x + w - 1, y, 1, h, ink);
}
/** Draw rows of text art: each character is looked up in `key`; a full stop leaves the cell alone. */
function stamp(s: Sprite, x: number, y: number, rows: readonly string[], key: Readonly<Record<string, number>>): void {
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const ink = key[row[i] as string];
      if (ink !== undefined) dot(s, x + i, y + j, ink);
    }
  });
}

// Small deterministic generator for where the speckles go (not game randomness).
function scatter(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

// --- a 3 x 5 letter face ---------------------------------------------------------------------------

const GLYPHS: Readonly<Record<string, readonly string[]>> = {
  '0': ['###', '#.#', '#.#', '#.#', '###'], '1': ['.#.', '##.', '.#.', '.#.', '###'], '2': ['###', '..#', '###', '#..', '###'],
  '3': ['###', '..#', '.##', '..#', '###'], '4': ['#.#', '#.#', '###', '..#', '..#'], '5': ['###', '#..', '###', '..#', '###'],
  '6': ['###', '#..', '###', '#.#', '###'], '7': ['###', '..#', '.#.', '.#.', '.#.'], '8': ['###', '#.#', '###', '#.#', '###'],
  '9': ['###', '#.#', '###', '..#', '###'], '-': ['...', '...', '###', '...', '...'], '!': ['.#.', '.#.', '.#.', '...', '.#.'],
  A: ['.#.', '#.#', '###', '#.#', '#.#'], B: ['##.', '#.#', '##.', '#.#', '##.'], C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'], E: ['###', '#..', '##.', '#..', '###'], F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'], H: ['#.#', '#.#', '###', '#.#', '#.#'], I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['..#', '..#', '..#', '#.#', '.#.'], K: ['#.#', '#.#', '##.', '#.#', '#.#'], L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#.#', '###', '###', '#.#', '#.#'], N: ['##.', '#.#', '#.#', '#.#', '#.#'], O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  P: ['##.', '#.#', '##.', '#..', '#..'], Q: ['.#.', '#.#', '#.#', '.#.', '..#'], R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'], T: ['###', '.#.', '.#.', '.#.', '.#.'], U: ['#.#', '#.#', '#.#', '#.#', '###'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'], W: ['#.#', '#.#', '###', '###', '#.#'], X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'], Z: ['###', '..#', '.#.', '#..', '###'], '?': ['##.', '..#', '.#.', '...', '.#.'],
};

/** Write text in the 3 x 5 face, one cell apart, in the given ink. Unknown characters come out as a question mark. */
export function write(s: Sprite, x: number, y: number, text: string, ink: number): void {
  [...text.toUpperCase()].forEach((ch, i) => stamp(s, x + i * 4, y, GLYPHS[ch] ?? (GLYPHS['?'] as readonly string[]), { '#': ink }));
}

// --- terrain -----------------------------------------------------------------------------------------

/** The ground colour of each terrain; a forest shows the open ground of its row between the trees. */
export const GROUND: Readonly<Record<TerrainId, InkId>> = {
  ocean: INK.sea, seaLane: INK.deepSea, arctic: INK.ice,
  tundra: INK.tundra, desert: INK.sand, plains: INK.plains, prairie: INK.prairie, grassland: INK.grass,
  savannah: INK.savannah, marsh: INK.marsh, swamp: INK.swamp,
  boreal: INK.tundra, scrub: INK.sand, mixed: INK.plains, broadleaf: INK.prairie, conifer: INK.grass,
  tropical: INK.savannah, wetland: INK.marsh, rain: INK.swamp,
  hills: INK.hill, mountains: INK.grey,
};

/** One flat colour per terrain, for the smallest zoom and the minimap. */
export const MINI: Readonly<Record<TerrainId, InkId>> = {
  ...GROUND,
  boreal: INK.swamp, scrub: INK.marsh, mixed: INK.leaf, broadleaf: INK.leaf, conifer: INK.forest,
  tropical: INK.forest, wetland: INK.swamp, rain: INK.deepForest, hills: INK.earth, mountains: INK.darkGrey,
};

/** A speck of a second colour scattered over open ground, and how many. */
const SPECKLE: Readonly<Partial<Record<TerrainId, readonly [InkId, number]>>> = {
  ocean: [INK.wave, 0], seaLane: [INK.sea, 0], arctic: [INK.lightGrey, 5],
  tundra: [INK.marsh, 7], desert: [INK.prairie, 8], plains: [INK.savannah, 7], prairie: [INK.sand, 7], grassland: [INK.leaf, 8],
  savannah: [INK.plains, 7], marsh: [INK.wave, 6], swamp: [INK.sea, 6],
};

/** Tree colours: crown, shadow, and whether the tree is pointed (a conifer) or round. */
const TREES: Readonly<Partial<Record<TerrainId, readonly [InkId, InkId, boolean]>>> = {
  boreal: [INK.forest, INK.deepForest, true], conifer: [INK.forest, INK.deepForest, true],
  scrub: [INK.savannah, INK.swamp, false], mixed: [INK.leaf, INK.forest, false], broadleaf: [INK.leaf, INK.forest, false],
  tropical: [INK.green, INK.forest, false], wetland: [INK.forest, INK.deepForest, false], rain: [INK.forest, INK.deepForest, false],
};

const OPEN_ROW: Readonly<Partial<Record<TerrainId, TerrainId>>> = {
  boreal: 'tundra', scrub: 'desert', mixed: 'plains', broadleaf: 'prairie', conifer: 'grassland', tropical: 'savannah', wetland: 'marsh', rain: 'swamp',
};

/** Everything that changes how a tile looks. Masks describe which neighbours the tile links to. */
export interface TileLook {
  readonly terrain: TerrainId;
  readonly river: 'none' | 'minor' | 'major';
  /** Bits N=1, E=2, S=4, W=8: neighbours a river continues into (another river tile or water). */
  readonly riverMask: number;
  readonly road: boolean;
  /** Bits for the 8 neighbours clockwise from N (N=1, NE=2, E=4, SE=8, S=16, SW=32, W=64, NW=128) with a road. */
  readonly roadMask: number;
  readonly plowed: boolean;
  readonly resource: ResourceId | null;
  readonly rumor: boolean;
  /** Draw a totem marking native land (colony view). */
  readonly totem: boolean;
  /** One of a few pattern variants so neighbouring tiles of one type do not look stamped. */
  readonly variant: number;
}

function line(s: Sprite, x0: number, y0: number, x1: number, y1: number, ink: number, thick = 1): void {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / Math.max(1, steps));
    const y = Math.round(y0 + ((y1 - y0) * i) / Math.max(1, steps));
    box(s, x - ((thick - 1) >> 1), y - ((thick - 1) >> 1), thick, thick, ink);
  }
}

function ground(s: Sprite, terrain: TerrainId, rnd: () => number): void {
  box(s, 0, 0, ART, ART, GROUND[terrain]);
  const open = OPEN_ROW[terrain] ?? terrain;
  const speck = SPECKLE[open];
  if (terrain === 'ocean' || terrain === 'seaLane') {
    // three short wave crests
    const ink = (speck as readonly [InkId, number])[0];
    for (let i = 0; i < 3; i++) {
      const x = 1 + Math.floor(rnd() * 11);
      const y = 2 + i * 5 + Math.floor(rnd() * 2);
      box(s, x, y, 2, 1, ink);
      dot(s, x + 2, y - 1, ink);
      dot(s, x - 1, y - 1, ink);
    }
    return;
  }
  if (!speck) return;
  for (let i = 0; i < speck[1]; i++) {
    const x = Math.floor(rnd() * ART);
    const y = Math.floor(rnd() * ART);
    dot(s, x, y, speck[0]);
    // reeds and tufts stand two pixels tall on wet and grassy ground
    if (open === 'marsh' || open === 'swamp' || open === 'grassland') dot(s, x, y - 1, speck[0]);
  }
}

function trees(s: Sprite, terrain: TerrainId, rnd: () => number): void {
  const style = TREES[terrain];
  if (!style) return;
  const [crown, shade, pointed] = style;
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const x = col * 5 + (row % 2 ? 2 : 0) + Math.floor(rnd() * 2);
      const y = row * 5 + Math.floor(rnd() * 2);
      if (pointed) {
        stamp(s, x, y, ['..c..', '.cc..', '.ccs.', 'cccss', '..t..'], { c: crown, s: shade, t: INK.wood });
      } else {
        stamp(s, x, y, ['.cc..', 'cccs.', 'ccss.', '.ss..', '..t..'], { c: crown, s: shade, t: INK.wood });
      }
    }
  }
}

function relief(s: Sprite, terrain: TerrainId, rnd: () => number): void {
  if (terrain === 'hills') {
    for (const [x, y] of [[0, 8], [8, 9], [4, 2]] as const) {
      const dx = Math.floor(rnd() * 2);
      stamp(s, x + dx, y, ['..hhh...', '.hhhee..', 'hhhheee.', 'hhhheeee'], { h: INK.sand, e: INK.earth });
    }
  } else if (terrain === 'mountains') {
    for (const [x, y] of [[0, 7], [7, 8], [3, 1]] as const) {
      const dx = Math.floor(rnd() * 2);
      stamp(s, x + dx, y, ['...ww....', '..wwd....', '..lldd...', '.llldd...', '.lllddd..', 'lllldddd.', 'llllddddd'], { w: INK.white, l: INK.lightGrey, d: INK.darkGrey });
    }
  }
}

const SIDE: readonly (readonly [number, number])[] = [[7, 0], [15, 7], [7, 15], [0, 7]];
const AROUND: readonly (readonly [number, number])[] = [[7, 0], [15, 0], [15, 7], [15, 15], [7, 15], [0, 15], [0, 7], [0, 0]];

function river(s: Sprite, look: TileLook): void {
  const thick = look.river === 'major' ? 3 : 2;
  const ends = SIDE.filter((_, i) => look.riverMask & (1 << i));
  if (ends.length === 0) {
    box(s, 6, 6, 4, 4, INK.brightBlue);
    return;
  }
  for (const [ex, ey] of ends) line(s, 7, 7, ex, ey, INK.brightBlue, thick);
}

function road(s: Sprite, look: TileLook): void {
  const ends = AROUND.filter((_, i) => look.roadMask & (1 << i));
  if (ends.length === 0) {
    line(s, 4, 8, 11, 8, INK.wood);
    return;
  }
  for (const [ex, ey] of ends) line(s, 8, 8, ex, ey, INK.wood);
}

function furrows(s: Sprite): void {
  for (let y = 2; y < ART; y += 3) for (let x = 1; x < ART - 1; x++) if ((x + y) % 5 !== 0) dot(s, x, y, INK.earth);
}

/**
 * A resource: a picture of the thing itself in the middle of the square, three quarters of it across (24 art
 * pixels on the 32 grid, the 12-pixel copy on the 16 grid). The 8 grid shows none.
 */
function resource(s: Sprite, id: ResourceId): void {
  const [rows, size] = s.size === DETAIL ? [RESOURCE_ART[id], RESOURCE_SIZE] : [RESOURCE_ART_12[id], RESOURCE_SIZE_12];
  if (rows) stamp(s, (s.size - size) >> 1, (s.size - size) >> 1, rows, RESOURCE_KEY);
}

const SEAL_KEY = { k: INK.ink, y: INK.yellow, o: INK.orange, w: INK.white, b: INK.wood } as const;
/** The lost-city seal by grid: a round of gold with an ink rim, a glint at the upper left, shade at the lower right and a stepped pyramid pressed into it. */
const RUMOR_SEAL: Readonly<Record<16 | 32, readonly string[]>> = {
  32: [
    '.....kkkkkk.....',
    '...kkyyyyyykk...',
    '..kywwyyyyyyyk..',
    '.kwwyyyyyyyyyyk.',
    '.kwyyyybbyyyyyk.',
    'kyyyyyybbyyyyyok',
    'kyyyybbbbbbyyook',
    'kyyyybbbbbbyyook',
    'kyybbbbbbbbbbook',
    'kyybbbbbbbbbbook',
    'kyyyyyyyyyyyoook',
    '.kyyyyyyyyyoook.',
    '.kyyyyyyyoooook.',
    '..kyyyyooooook..',
    '...kkooooookk...',
    '.....kkkkkk.....',
  ],
  16: ['..kkkk..', '.kwyyyk.', 'kwyyyyok', 'kyybbyok', 'kybbbbok', 'kyyyyook', '.kyoook.', '..kkkk..'],
};

/**
 * The mark of a Lost City Rumor, alone on a see-through square of the grid: a round gold seal filling the
 * lower left quarter on the 32 and 16 grids, and a gold dot on the 8.
 */
export function rumorSealArt(grid: ChartGrid): Sprite {
  const s = blank(grid);
  if (grid === 8) box(s, 1, 5, 2, 2, INK.yellow);
  else stamp(s, 0, grid / 2, RUMOR_SEAL[grid], SEAL_KEY);
  return s;
}

function rumor(s: Sprite): void {
  laid(s, rumorSealArt(s.size as ChartGrid));
}

/** A totem marking native land, in the upper left quarter. */
function totem(s: Sprite): void {
  stamp(s, 2, 0, ['.rrr.', 'yyyyy', '..w..', '.yyy.', '..w..', '..w..', '..w..', '..w..'], { r: INK.red, y: INK.yellow, w: INK.wood });
}

/** The art for one whole map square on the 16-pixel grid: its floor with everything that stands on it. */
export function tileArt(look: TileLook): Sprite {
  return laid(floorArt(ART, look.terrain, look.variant), overArt(look, ART));
}

/** The square at the smallest zoom: one flat colour, with a river or a road as a single stroke through it. */
export function miniTileArt(look: TileLook): Sprite {
  const s = blank(8);
  box(s, 0, 0, 8, 8, MINI[look.terrain]);
  if (look.terrain === 'mountains') stamp(s, 2, 2, ['.ww.', 'wwdd'], { w: INK.white, d: INK.grey });
  if (look.river !== 'none') box(s, 3, 3, 2, 2, INK.brightBlue);
  if (look.road) box(s, 2, 4, 4, 1, INK.wood);
  if (look.rumor) rumor(s);
  return s;
}

// --- the explorer's chart: what the unexplored map is drawn as (R-1011) ------------------------------

/** The colour of bare vellum: what an unexplored square is on the minimap. */
export const VELLUM: InkId = INK.parchment;
/** The grids the chart is drawn on, in art pixels to the square: detailed, plain and the smallest zoom. */
export type ChartGrid = 32 | 16 | 8;
/** The chart's baked letters as palette inks: it has no colours of its own. */
const CHART_KEY: Readonly<Record<string, number>> = Object.fromEntries(CHART_COLORS.map((colour, i) => [CHART_CODES[i] as string, (PALETTE as readonly string[]).indexOf(colour)]));

/** Hatching by grid: a stroke every so many art pixels along the edge, and how far each reaches in, in turn. At the smallest grid the edge is a line alone. */
const HATCH: Readonly<Record<ChartGrid, { readonly every: number; readonly reach: readonly number[] }>> = {
  32: { every: 3, reach: [6, 3, 5, 2, 7, 4, 3, 6, 2, 5, 4] },
  16: { every: 2, reach: [3, 1, 2, 3, 1, 2, 2, 1] },
  8: { every: 0, reach: [] },
};

/**
 * Ink hatching along the edges of a vellum square that touch the known world, so that the frontier reads
 * as a drawn coastline. `mask` has a bit for each of the eight neighbours that is explored, north first
 * and clockwise, as a road's mask has; a corner neighbour alone gets a tick in its corner.
 */
function hatch(s: Sprite, mask: number): void {
  const n = s.size;
  const { every, reach } = HATCH[n as ChartGrid];
  /** The cell `along` the side and `depth` in from it, for north, east, south and west. */
  const spot = (side: number, along: number, depth: number): readonly [number, number] =>
    side === 0 ? [along, depth] : side === 1 ? [n - 1 - depth, along] : side === 2 ? [along, n - 1 - depth] : [depth, along];
  const sides = [0, 1, 2, 3].filter((side) => mask & (1 << (side * 2)));
  // the strokes of every side first, then the coastlines over them, so that no stroke breaks a line at a corner
  for (const side of sides) {
    for (let along = 1; every > 0 && along < n; along += every) {
      const length = reach[((along - 1) / every + side * 3) % reach.length] as number;
      for (let depth = 1; depth <= length; depth++) dot(s, ...spot(side, along, depth), INK.earth);
    }
  }
  for (const side of sides) for (let along = 0; along < n; along++) dot(s, ...spot(side, along, 0), every > 0 ? INK.wood : INK.hill);
  for (let corner = 0; corner < 4; corner++) {
    // the corner between side `corner` and the next one round
    if (!(mask & (1 << (corner * 2 + 1))) || mask & (1 << (corner * 2)) || mask & (1 << (((corner + 1) % 4) * 2))) continue;
    const x = corner === 0 || corner === 1 ? n - 1 : 0;
    const y = corner === 1 || corner === 2 ? n - 1 : 0;
    const dx = x === 0 ? 1 : -1;
    const dy = y === 0 ? 1 : -1;
    dot(s, x, y, every > 0 ? INK.wood : INK.hill);
    for (let i = 1; i <= n / 16; i++) dot(s, x + dx * i, y + dy * i, INK.earth);
  }
}

/** An unexplored square: the vellum floor, turned one of four ways by the variant, hatched where it meets the known. */
export function vellumArt(grid: ChartGrid, variant: number, mask: number): Sprite {
  const s = blank(grid);
  stamp(s, 0, 0, turned(CHART_ART[`vellum${grid}`] as readonly string[], (variant & 1) === 1, (variant & 2) === 2), CHART_KEY);
  hatch(s, mask);
  return s;
}

/** A compass rose, sea serpent or ship, as many squares across as CHART.squares says; see-through where the vellum shows. */
export function chartMarkArt(kind: ChartMarkKind, grid: ChartGrid): Sprite {
  const rows = CHART_ART[`${kind}${grid}`] as readonly string[];
  const s = blank(rows.length);
  stamp(s, 0, 0, rows, CHART_KEY);
  return s;
}

// --- pieces ------------------------------------------------------------------------------------------

const FIGURE_KEY = { k: INK.ink, w: INK.white, g: INK.lightGrey, d: INK.darkGrey, b: INK.wood, y: INK.yellow, p: INK.parchment, r: INK.red, e: INK.earth } as const;

const PERSON = ['.pp.', '.pp.', 'kkkk', 'kkkk', '.kk.', '.kk.', 'k..k', 'k..k'];
const HORSE = ['......bb', '.....bbb', 'bbbbbbb.', 'bbbbbb..', 'b....b..', 'b....b..'];
const RIDER = ['.pp.', '.kk.', 'kkkk'];

/** What stands in the box for each kind of unit: nine columns by ten rows at most, drawn over the owner's colour. */
function figure(s: Sprite, type: UnitTypeId): void {
  const person = (x: number): void => stamp(s, x, 5, PERSON, FIGURE_KEY);
  const mounted = (): void => {
    stamp(s, 4, 7, HORSE, FIGURE_KEY);
    stamp(s, 6, 4, RIDER, FIGURE_KEY);
  };
  const hull = (masts: number, guns: boolean): void => {
    stamp(s, 4, 10, ['bbbbbbbbb', '.bbbbbbb.', '..bbbbb..'], FIGURE_KEY);
    if (guns) for (let x = 6; x <= 10; x += 2) dot(s, x, 11, INK.ink);
    const xs = masts === 1 ? [8] : masts === 2 ? [6, 10] : [5, 8, 11];
    for (const x of xs) {
      box(s, x, 4, 1, 6, INK.ink);
      box(s, x - 1, 5, 3, 3, INK.white);
    }
  };
  switch (type) {
    case 'colonist':
      person(6);
      break;
    case 'soldier':
    case 'regular':
    case 'continentalArmy':
      person(5);
      box(s, 10, 3, 1, 8, type === 'soldier' ? INK.wood : INK.ink); // the musket
      if (type === 'regular') box(s, 5, 4, 4, 1, INK.red); // a red coat's tall cap
      if (type === 'continentalArmy') box(s, 5, 4, 4, 1, INK.blue);
      break;
    case 'pioneer':
      person(5);
      box(s, 10, 4, 1, 7, INK.wood);
      box(s, 10, 3, 2, 2, INK.lightGrey); // the spade
      break;
    case 'missionary':
      person(5);
      box(s, 10, 4, 1, 6, INK.white);
      box(s, 9, 5, 3, 1, INK.white); // the cross
      break;
    case 'scout':
      stamp(s, 4, 7, HORSE, FIGURE_KEY);
      stamp(s, 6, 4, RIDER, FIGURE_KEY);
      break;
    case 'dragoon':
    case 'cavalry':
    case 'continentalCavalry':
      mounted();
      box(s, 11, 3, 1, 5, type === 'dragoon' ? INK.wood : INK.ink);
      if (type === 'cavalry') box(s, 6, 3, 4, 1, INK.red);
      if (type === 'continentalCavalry') box(s, 6, 3, 4, 1, INK.blue);
      break;
    case 'treasure':
      stamp(s, 4, 6, ['.bbbbbbb.', 'byyyyyyyb', 'bbbbkbbbb', 'bbbkykbbb', 'bbbbbbbbb', 'bbbbbbbbb'], FIGURE_KEY);
      break;
    case 'artillery':
    case 'damagedArtillery':
      stamp(s, 3, 6, ['......kk..', '....kkkk..', '..kkkkk...', 'kkkkk.....', '.bbb......', 'b.b.b.....', '.bbb......'], FIGURE_KEY);
      if (type === 'damagedArtillery') line(s, 4, 5, 12, 12, INK.white); // struck through
      break;
    case 'wagonTrain':
      stamp(s, 3, 5, ['.wwwwwww..', 'wwwwwwwww.', 'wwwwwwwww.', 'bbbbbbbbbb', '.kk....kk.', '.kk....kk.'], FIGURE_KEY);
      break;
    case 'caravel':
      hull(1, false);
      break;
    case 'merchantman':
      hull(2, false);
      break;
    case 'galleon':
      hull(3, false);
      break;
    case 'privateer':
      hull(1, true);
      break;
    case 'frigate':
      hull(2, true);
      break;
    case 'manOWar':
      hull(3, true);
      break;
    case 'brave':
    case 'armedBrave':
      person(6);
      box(s, 8, 3, 1, 2, INK.white); // a feather
      if (type === 'armedBrave') box(s, 11, 4, 1, 7, INK.wood);
      break;
    case 'mountedBrave':
    case 'mountedWarrior':
      mounted();
      box(s, 9, 2, 1, 2, INK.white);
      if (type === 'mountedWarrior') box(s, 11, 3, 1, 5, INK.wood);
      break;
  }
}

export interface PieceLook {
  readonly type: UnitTypeId;
  /** The owner's colour. */
  readonly color: InkId;
  /** What the orders plate carries: an order letter, or a count of holds; empty for none (native pieces). */
  readonly label: string;
  /** Others stand on the square beneath this one. */
  readonly stacked: boolean;
}

/** A unit: a box in its owner's colour with the figure in it and, for Europeans, the orders plate at the top left. */
export function pieceArt(look: PieceLook): Sprite {
  const s = blank();
  if (look.stacked) box(s, 4, 2, 11, 12, INK.ink);
  box(s, 3, 3, 11, 12, look.color);
  frame(s, 3, 3, 11, 12, INK.ink);
  figure(s, look.type);
  if (look.label !== '') {
    box(s, 0, 0, 5, 7, look.color);
    frame(s, 0, 0, 5, 7, INK.ink);
    write(s, 1, 1, look.label.slice(0, 1), INK.ink);
  }
  return s;
}

/** Art pixels to the square for a piece drawn with a detailed figure: twice the map's grid. */
export const DETAIL = 32;

/**
 * Every colour art can be in: the map palette, then the colours of the detailed figures, places, ground and
 * features, then those of the colony screen's buildings and the goods icons, then those of the resource
 * markers. A sprite's cell is one of these plus one in a byte, so there can be no more than 255.
 */
export const ART_COLORS: readonly string[] = [
  ...PALETTE, ...UNIT_COLORS, ...PLACE_COLORS, ...FLOOR_COLORS, ...FEATURE_COLORS, ...BUILDING_COLORS, ...GOODS_COLORS, ...RESOURCE_COLORS,
];
const MAP_COLORS = PALETTE.length + UNIT_COLORS.length + PLACE_COLORS.length + FLOOR_COLORS.length + FEATURE_COLORS.length;
const BUILDING_KEY: Readonly<Record<string, number>> = Object.fromEntries(BUILDING_COLORS.map((_, i) => [BUILDING_CODES[i] as string, MAP_COLORS + i]));
const GOODS_KEY: Readonly<Record<string, number>> = Object.fromEntries(GOODS_COLORS.map((_, i) => [GOODS_CODES[i] as string, MAP_COLORS + BUILDING_COLORS.length + i]));
const FLOOR_KEY: Readonly<Record<string, number>> = Object.fromEntries(FLOOR_COLORS.map((_, i) => [FLOOR_CODES[i] as string, PALETTE.length + UNIT_COLORS.length + PLACE_COLORS.length + i]));
const FEATURE_KEY: Readonly<Record<string, number>> = Object.fromEntries(
  FEATURE_COLORS.map((_, i) => [FEATURE_CODES[i] as string, PALETTE.length + UNIT_COLORS.length + PLACE_COLORS.length + FLOOR_COLORS.length + i]),
);
const RESOURCE_KEY: Readonly<Record<string, number>> = Object.fromEntries(
  RESOURCE_COLORS.map((_, i) => [RESOURCE_CODES[i] as string, ART_COLORS.length - RESOURCE_COLORS.length + i]),
);
const PLACE_KEY: Readonly<Record<string, number>> = Object.fromEntries(PLACE_COLORS.map((_, i) => [PLACE_CODES[i] as string, PALETTE.length + UNIT_COLORS.length + i]));
const DETAIL_KEY: Readonly<Record<string, number>> = Object.fromEntries(UNIT_COLORS.map((_, i) => [UNIT_CODES[i] as string, PALETTE.length + i]));

/** Whether this kind of unit has a detailed figure (an experiment for R-1006). */
export const hasFigure = (type: UnitTypeId): boolean => Object.hasOwn(UNIT_ART, type);

// A 5 x 7 face for the orders tab of a detailed piece: the order letters, the digits of a hold count, and a question mark for anything else.
const TAB_GLYPHS: Readonly<Record<string, readonly string[]>> = {
  S: ['.###.', '#...#', '#....', '.###.', '....#', '#...#', '.###.'], G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'], P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'], T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'], '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'], '3': ['.###.', '#...#', '....#', '..##.', '....#', '#...#', '.###.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'], '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'], '7': ['#####', '....#', '...#.', '..#..', '..#..', '..#..', '..#..'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'], '9': ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
};

/**
 * The 5 x 7 upper-case face a colony's name is written in on the map: the letters, the digits, space, hyphen,
 * apostrophe and full stop, and a question mark for anything else. The plates' glyphs are the same face.
 */
export const LABEL_GLYPHS: Readonly<Record<string, readonly string[]>> = {
  ...TAB_GLYPHS,
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'], B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'], D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'], H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'], J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'], L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'], N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'], Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'], V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'], X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'], Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'], '-': ['.....', '.....', '.....', '.###.', '.....', '.....', '.....'],
  "'": ['..#..', '..#..', '.#...', '.....', '.....', '.....', '.....'], '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
};

/** Art pixels to the square of one letter of a label, and from one letter of a name to the next. */
export const LABEL_SIZE = 10;
export const LABEL_STEP = 7;
/** How many characters of a name are written. */
export const LABEL_LENGTH = 16;

/**
 * One letter of a label: the glyph in white at (2, 1), and ink on every see-through cell beside it (its eight
 * neighbours), so that it reads on sand as well as on sea. A character the face lacks is a question mark.
 */
export function labelArt(ch: string): Sprite {
  const s = blank(LABEL_SIZE);
  stamp(s, 2, 1, LABEL_GLYPHS[ch] ?? (LABEL_GLYPHS['?'] as readonly string[]), { '#': INK.white });
  const white = INK.white + 1;
  const edge: number[] = [];
  for (let y = 0; y < s.size; y++) {
    for (let x = 0; x < s.size; x++) {
      if (at(s, x, y) !== 0) continue;
      let beside = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (at(s, x + dx, y + dy) === white) beside = true;
      if (beside) edge.push(y * s.size + x);
    }
  }
  for (const i of edge) s.cells[i] = INK.ink + 1;
  return s;
}

/**
 * A name as the map writes it: in capitals, accents taken off (an accented letter is written plain; one that
 * does not come apart, or anything else the face lacks, is a question mark), cut at sixteen characters.
 */
export function labelText(name: string): string {
  const plain = name.normalize('NFD').replace(/\p{M}/gu, '').replace(/[‘’]/g, "'").toUpperCase();
  return [...plain].slice(0, LABEL_LENGTH).map((ch) => (Object.hasOwn(LABEL_GLYPHS, ch) ? ch : '?')).join('');
}

/**
 * A unit drawn large: its figure standing on a base in its owner's colour. A unit under orders (or a ship
 * showing its holds) carries them in white on a dark tab at the foot of the base on the left, where it
 * hides least of the figure; a unit with none ('-') has no tab. Null for a kind that has no detailed figure.
 */
export function detailedPieceArt(look: PieceLook): Sprite | null {
  const rows = UNIT_ART[look.type];
  if (!rows || !hasFigure(look.type)) return null;
  const s = blank(DETAIL);
  if (look.stacked) box(s, 3, 28, DETAIL - 3, 4, INK.ink);
  box(s, 1, 26, DETAIL - 2, 5, look.color);
  frame(s, 1, 26, DETAIL - 2, 5, INK.ink);
  stamp(s, (DETAIL - FIGURE_SIZE) >> 1, DETAIL - 2 - FIGURE_SIZE, rows, DETAIL_KEY);
  if (look.label !== '' && look.label !== '-') {
    box(s, 0, 22, 7, 9, INK.ink);
    stamp(s, 1, 23, TAB_GLYPHS[look.label.slice(0, 1).toUpperCase()] ?? (TAB_GLYPHS['?'] as readonly string[]), { '#': INK.white });
  }
  return s;
}

/** Lay a 16-pixel layer over detailed art, every art pixel of it four of the larger grid. */
function enlarge(s: Sprite, layer: Sprite): void {
  for (let y = 0; y < layer.size; y++) for (let x = 0; x < layer.size; x++) if (at(layer, x, y) !== 0) box(s, x * 2, y * 2, 2, 2, at(layer, x, y) - 1);
}

/** Baked rows, optionally mirrored left to right and top to bottom. */
function turned(rows: readonly string[], mirror: boolean, upend: boolean): readonly string[] {
  const across = mirror ? rows.map((row) => [...row].reverse().join('')) : rows;
  return upend ? [...across].reverse() : across;
}

// --- a square in two layers, and the pieces that soften its edges (R-1041) ---------------------------

/** The grids a square's layers are drawn on: the detailed one and the plain one. The smallest zoom stays flat. */
export type TileGrid = 32 | 16;

/** The open ground a terrain stands on: a forest's is the open terrain of its row, anything else is its own. */
export const openOf = (terrain: TerrainId): TerrainId => OPEN_ROW[terrain] ?? terrain;

/** One layer laid over another: every cell of `over` that is not see-through replaces the one beneath. */
function laid(under: Sprite, over: Sprite): Sprite {
  over.cells.forEach((cell, i) => {
    if (cell !== 0) under.cells[i] = cell;
  });
  return under;
}

/**
 * The floor of a square: the ground of its open terrain alone (a forest's is that of its row), filling the
 * square. It is the baked texture of the grid, the 16-pixel one a smaller copy of the 32-pixel one in the same
 * colours, turned one of four ways by the variant. A terrain with no baked texture has the ground drawn in
 * code on the 16-pixel grid, its speckles placed by the variant, and one flat colour on the 32-pixel grid.
 */
export function floorArt(grid: TileGrid, terrain: TerrainId, variant: number): Sprite {
  const open = openOf(terrain);
  const s = blank(grid);
  const [art, size] = grid === ART ? [FLOOR_ART_16, FLOOR_SIZE_16] : [FLOOR_ART, FLOOR_SIZE];
  if (Object.hasOwn(art, open)) stamp(s, 0, grid - size, turned(art[open] as readonly string[], (variant & 1) === 1, (variant & 2) === 2), FLOOR_KEY);
  else if (grid === ART) ground(s, open, scatter(hash(`${open}:${variant}`)));
  else box(s, 0, 0, DETAIL, DETAIL, GROUND[open]);
  return s;
}

/**
 * The forest, hills or mountains of a square: the baked picture of the grid, the 16-pixel one a smaller copy
 * of the 32-pixel one in the same colours, mirrored left to right by the variant and never turned upside
 * down. A terrain with no baked picture has its trees or relief drawn in code on the 16-pixel grid.
 */
function feature(s: Sprite, look: TileLook): void {
  const [art, size] = s.size === ART ? [FEATURE_ART_16, FEATURE_SIZE_16] : [FEATURE_ART, FEATURE_SIZE];
  if (Object.hasOwn(art, look.terrain)) {
    stamp(s, 0, s.size - size, turned(art[look.terrain] as readonly string[], (look.variant & 1) === 1, false), FEATURE_KEY);
    return;
  }
  if (s.size !== ART) return;
  const rnd = scatter(hash(`${look.terrain}:${look.variant}`));
  // the trees and the relief stand where they stood when one run of numbers placed the ground's speckles first
  ground(blank(), look.terrain, rnd);
  if (look.terrain === 'hills' || look.terrain === 'mountains') relief(s, look.terrain, rnd);
  else trees(s, look.terrain, rnd);
}

/**
 * Everything that stands on a square's floor, see-through elsewhere: the forest, hills or mountains; then
 * furrows and the river, which runs over the trees, since a canopy that fills its square would hide it; then
 * the resource marker, at its own size; the lost-city seal, drawn for the grid; then the road and the totem. On the 32-pixel grid the strokes and the totem are the 16-pixel ones
 * enlarged. The forest or relief is the baked picture of the grid.
 */
export function overArt(look: TileLook, grid: TileGrid): Sprite {
  if (grid === ART) {
    const s = blank();
    feature(s, look);
    if (look.plowed) furrows(s);
    if (look.river !== 'none') river(s, look);
    if (look.resource) resource(s, look.resource);
    if (look.rumor) rumor(s);
    if (look.road) road(s, look);
    if (look.totem) totem(s);
    return s;
  }
  const s = blank(DETAIL);
  feature(s, look);
  const under = blank();
  if (look.plowed) furrows(under);
  if (look.river !== 'none') river(under, look);
  enlarge(s, under);
  if (look.resource) resource(s, look.resource);
  if (look.rumor) rumor(s);
  const over = blank();
  if (look.road) road(over, look);
  if (look.totem) totem(over);
  enlarge(s, over);
  return s;
}

/**
 * The art for one whole map square on the 32-pixel grid: the ground of its terrain (a forest stands on the
 * open ground of its row), turned one of four ways by the variant, with everything that stands on it.
 */
export function detailedTileArt(look: TileLook): Sprite {
  return laid(floorArt(DETAIL, look.terrain, look.variant), overArt(look, DETAIL));
}

/** Rows of text art turned a quarter turn clockwise: the top row becomes the right-hand column. */
export function rotate(rows: readonly string[]): readonly string[] {
  const n = rows.length;
  return rows.map((_, y) => Array.from({ length: n }, (_, x) => (rows[n - 1 - x] as string)[y]).join(''));
}

/** Rows drawn for the top of a square, with the rows left out below them see-through. */
const topped = (rows: readonly string[]): readonly string[] => {
  const n = (rows[0] as string).length;
  return [...rows, ...Array.from({ length: n - rows.length }, () => '.'.repeat(n))];
};
/** A shape for the north side, and the same turned for the east, the south and the west. */
const fourWays = (north: readonly string[]): readonly (readonly string[])[] => {
  const east = rotate(north);
  const south = rotate(east);
  return [north, east, south, rotate(south)];
};

/**
 * The stencils a neighbouring ground spills in through, by grid and by side (north, east, south, west): a
 * band along that edge with an uneven inner edge, three to five art pixels deep on the 32-pixel grid (six
 * and two at two places each) and two to three on the 16-pixel grid. The north one is drawn here; the
 * others are it turned.
 */
export const EDGE_MASKS: Readonly<Record<TileGrid, readonly (readonly string[])[]>> = {
  32: fourWays(topped([
    '################################',
    '################################',
    '############.#########.#########',
    '..########.....######...######..',
    '....####.........##.......###...',
    '......#....................#....',
  ])),
  16: fourWays(topped([
    '################',
    '################',
    '..###..##..###..',
  ])),
};

/** A neighbour's floor where it spills into a square through one side's stencil; see-through everywhere else. */
export function blendArt(grid: TileGrid, side: number, terrain: TerrainId, variant: number): Sprite {
  const s = blank(grid);
  const floor = floorArt(grid, terrain, variant);
  (EDGE_MASKS[grid][side & 3] as readonly string[]).forEach((row, y) => {
    for (let x = 0; x < grid; x++) if (row[x] === '#') s.cells[y * grid + x] = floor.cells[y * grid + x] as number;
  });
  return s;
}

/**
 * The water of a coast, by grid: eight shapes for the north-west quarter of a water square, half the square
 * across, `#` where the water lies and `.` where the land beneath shows. Which shape is the code
 * 4 x north + 2 x north-west + west, each 1 where that neighbour is land: none (0) all water; the west
 * alone (1) land down the west side; the corner alone (2) a small corner of land; the north alone (4) land
 * along the north side; a side with the corner (3, 6) that side's land swelling toward the corner; both
 * sides (5, 7) land round a rounded inner corner. The other quarters use these turned. Every side's land
 * is one depth at the middle of the side and one at its end, so that quarters and squares meet.
 */
export const COAST_MASKS: Readonly<Record<TileGrid, readonly (readonly string[])[]>> = {
  32: [
    Array.from({ length: 16 }, () => '################'),
    [
      '....############', '....############', '.....###########', '.....###########', '....############', '...#############', '...#############', '....############',
      '....############', '.....###########', '.....###########', '....############', '...#############', '...#############', '....############', '....############',
    ],
    [
      '....############', '....############', '...#############', '..##############', '################', '################', '################', '################',
      '################', '################', '################', '################', '################', '################', '################', '################',
    ],
    [
      '......##########', '......##########', '......##########', '.....###########', '.....###########', '....############', '...#############', '...#############',
      '....############', '....############', '.....###########', '.....###########', '....############', '...#############', '....############', '....############',
    ],
    [
      '................', '................', '................', '.....##.....##..', '##..#####..#####', '################', '################', '################',
      '################', '################', '################', '################', '################', '################', '################', '################',
    ],
    [
      '................', '................', '................', '............##..', '...........#####', '.......#########', '......##########', '.....###########',
      '....############', '.....###########', '.....###########', '....############', '...#############', '...#############', '....############', '....############',
    ],
    [
      '................', '................', '................', '......##.....#..', '.....#####..####', '...#############', '################', '################',
      '################', '################', '################', '################', '################', '################', '################', '################',
    ],
    [
      '................', '................', '................', '............##..', '...........#####', '.......#########', '......##########', '.....###########',
      '....############', '.....###########', '.....###########', '....############', '...#############', '...#############', '....############', '....############',
    ],
  ],
  16: [
    Array.from({ length: 8 }, () => '########'),
    ['..######', '..######', '...#####', '..######', '..######', '...#####', '..######', '..######'],
    ['..######', '.#######', '########', '########', '########', '########', '########', '########'],
    ['...#####', '...#####', '...#####', '..######', '..######', '...#####', '..######', '..######'],
    ['........', '........', '##.##.##', '########', '########', '########', '########', '########'],
    ['........', '........', '...##.##', '..######', '..######', '...#####', '..######', '..######'],
    ['........', '........', '...##.##', '########', '########', '########', '########', '########'],
    ['........', '........', '...##.##', '..######', '..######', '...#####', '..######', '..######'],
  ],
};

/**
 * One quarter of a coastal water square (0 north-west, 1 north-east, 2 south-east, 3 south-west): the
 * water's own floor, turned by the variant, wherever that quarter's shape has water, and see-through where
 * the land beneath shows and in the other three quarters. The water nearest the land is the shallows: a
 * line of `wave` one art pixel wide, two on the 32-pixel grid.
 */
export function coastArt(grid: TileGrid, water: TerrainId, quadrant: number, code: number, variant: number): Sprite {
  const s = blank(grid);
  const half = grid >> 1;
  const quarter = quadrant & 3;
  let shape = COAST_MASKS[grid][code & 7] as readonly string[];
  for (let turn = 0; turn < quarter; turn++) shape = rotate(shape);
  const floor = floorArt(grid, water, variant);
  const reach = grid / ART;
  const left = quarter === 1 || quarter === 2 ? half : 0;
  const top = quarter >= 2 ? half : 0;
  const land = (x: number, y: number): boolean => shape[y]?.[x] === '.';
  for (let y = 0; y < half; y++) {
    for (let x = 0; x < half; x++) {
      if (land(x, y)) continue;
      let shallow = false;
      for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) if (land(x + dx, y + dy)) shallow = true;
      const i = (top + y) * grid + left + x;
      s.cells[i] = shallow ? INK.wave + 1 : (floor.cells[i] as number);
    }
  }
  return s;
}

/** The picture a colony is drawn from, by how it is fortified: open, stockade, fort, fortress. */
export const COLONY_LOOKS = ['colonyOpen', 'colonyStockade', 'colonyFort', 'colonyFortress'] as const;
/** The picture a native settlement is drawn from, by its people's tech level: camp, village, and the two kinds of city. */
export const VILLAGE_LOOKS = ['villageCamp', 'villageLonghouse', 'villageAztec', 'villageInca'] as const;

/** A place's picture with its roofs, flags and bands in the owner's colour, or null if there is none by that name. */
function placeArt(name: string | undefined, color: InkId): Sprite | null {
  const rows = name === undefined || !Object.hasOwn(PLACE_ART, name) ? undefined : PLACE_ART[name];
  if (!rows) return null;
  const s = blank(DETAIL);
  stamp(s, (DETAIL - PLACE_SIZE) >> 1, DETAIL - PLACE_SIZE, rows, { ...PLACE_KEY, '*': color });
  return s;
}

/**
 * A colony drawn large: its buildings under roofs of the owner's colour, behind whatever walls it has
 * (`fort` 0 to 3), with the population at the foot on a dark plate in the colour of its loyalties.
 */
export function detailedColonyArt(color: InkId, population: number, numberInk: InkId, fort: number): Sprite | null {
  const s = placeArt(COLONY_LOOKS[Math.min(3, Math.max(0, fort))], color);
  if (!s) return null;
  const text = String(Math.min(99, population));
  const width = text.length * 6 - 1;
  const x = (DETAIL - width) >> 1;
  box(s, x - 1, 23, width + 2, 9, INK.ink);
  [...text].forEach((digit, i) => stamp(s, x + i * 6, 24, TAB_GLYPHS[digit] as readonly string[], { '#': numberInk }));
  return s;
}

/**
 * A native settlement drawn large, in its people's colour, by tech level (0 to 3). A capital carries a gold
 * star at the top left; the mark at the top right shows how its people feel about the viewer.
 */
export function detailedSettlementArt(color: InkId, tech: number, capital: boolean, mood: InkId | null): Sprite | null {
  const s = placeArt(VILLAGE_LOOKS[Math.min(3, Math.max(0, tech))], color);
  if (!s) return null;
  if (capital) {
    box(s, 0, 0, 7, 7, INK.ink);
    stamp(s, 1, 1, ['..y..', '.yyy.', 'yyyyy', '.yyy.', '..y..'], { y: INK.yellow });
  }
  if (mood !== null) {
    box(s, DETAIL - 5, 0, 5, 9, INK.ink);
    stamp(s, DETAIL - 4, 1, ['mmm', 'mmm', 'mmm', 'mmm', '...', 'mmm', 'mmm'], { m: mood });
  }
  return s;
}

/** The frame that marks the active unit. */
export function activeFrameArt(): Sprite {
  const s = blank();
  frame(s, 0, 0, ART, ART, INK.white);
  return s;
}

export function cursorArt(): Sprite {
  const s = blank();
  frame(s, 0, 0, ART, ART, INK.yellow);
  return s;
}

/** The cursor over a square the dragged unit cannot go to: the same frame in red. */
export function blockedCursorArt(): Sprite {
  const s = blank();
  frame(s, 0, 0, ART, ART, INK.red);
  return s;
}

/** A colony: a gabled house under the owner's roof, with the population on a dark plate in the colour of its loyalties. */
export function colonyArt(color: InkId, population: number, numberInk: InkId): Sprite {
  const s = blank();
  stamp(s, 1, 1, ['......cc......', '.....cccc.....', '....cccccc....', '...cccccccc...', '..cccccccccc..', '.cccccccccccc.', 'cccccccccccccc'], { c: color });
  box(s, 2, 8, 12, 7, INK.parchment);
  frame(s, 2, 8, 12, 7, INK.ink);
  const text = String(Math.min(99, population));
  const width = text.length * 4 - 1;
  const x = 8 - Math.ceil(width / 2);
  box(s, x - 1, 9, width + 2, 5, INK.ink);
  write(s, x, 9, text, numberInk);
  return s;
}

/**
 * A native settlement in its people's colour: a tent for a camp, a longhouse for a village, a
 * stepped pyramid for a city. A capital flies a white pennant; the mark at the top right shows
 * how its people feel about the viewer.
 */
export function settlementArt(color: InkId, tech: number, capital: boolean, mood: InkId | null): Sprite {
  const s = blank();
  if (tech === 0) {
    stamp(s, 2, 3, ['.....kk.....', '....kcck....', '....kcck....', '...kcccck...', '...kcccck...', '..kcccccck..', '..kcckkcck..', '.kccckkccck.', '.kccckkccck.', 'kkkkkkkkkkkk'], { k: INK.ink, c: color });
  } else if (tech === 1) {
    stamp(s, 1, 5, ['..kkkkkkkkkk..', '.kcccccccccck.', 'kcccccccccccck', 'kcccccccccccck', 'kccckkcckkccck', 'kccckkcckkccck', 'kccckkcckkccck', 'kkkkkkkkkkkkkk'], { k: INK.ink, c: color });
  } else {
    stamp(s, 1, 3, ['.....kkkk.....', '.....kcck.....', '...kkkcckkk...', '...kcccccck...', '.kkkcccccckkk.', '.kcccccccccck.', 'kkcccckkcccckk', 'kccccckkcccccck'.slice(0, 14), 'kkkkkkkkkkkkkk'], { k: INK.ink, c: color });
  }
  if (capital) stamp(s, 1, 0, ['kww', 'kww', 'k..'], { k: INK.ink, w: INK.white });
  if (mood !== null) {
    box(s, 12, 0, 4, 7, INK.ink);
    stamp(s, 13, 1, ['mm', 'mm', 'mm', '..', 'mm'], { m: mood });
  }
  return s;
}

// --- the colony screen (R-1013): buildings, goods and flags ---------------------------------------

/** A unit's detailed figure alone, with no base under it, on its own grid of FIGURE_SIZE; null for a kind that has none. */
export function figureArt(type: string): Sprite | null {
  const rows = Object.hasOwn(UNIT_ART, type) ? UNIT_ART[type] : undefined;
  if (!rows) return null;
  const s = blank(FIGURE_SIZE);
  stamp(s, 0, 0, rows, DETAIL_KEY);
  return s;
}

/** A building that is drawn as another: the two further Town Halls of the table are never built and look like the first. */
const BUILDING_ALIAS: Readonly<Record<string, string>> = { townHall2: 'townHall', townHall3: 'townHall' };

/** A colony building's picture on the 32-pixel grid, roofed in the owner's colour; null if there is none by that name. */
export function buildingArt(id: string, color: InkId): Sprite | null {
  const name = BUILDING_ALIAS[id] ?? id;
  const rows = Object.hasOwn(BUILDING_ART, name) ? BUILDING_ART[name] : undefined;
  if (!rows) return null;
  const s = blank(BUILDING_SIZE);
  stamp(s, 0, 0, rows, { ...BUILDING_KEY, '*': color });
  return s;
}

/** Everything that has a goods icon: the sixteen goods, and hammers, crosses and bells. */
export type IconGood = GoodId | AbstractGoodId;

/** A good's icon on the 16-pixel grid; null for anything that has none (fish is counted as food and has no icon of its own). */
export function goodArt(good: string): Sprite | null {
  const rows = Object.hasOwn(GOODS_ART, good) ? GOODS_ART[good] : undefined;
  if (!rows) return null;
  const s = blank(GOODS_SIZE);
  stamp(s, 0, 0, rows, GOODS_KEY);
  return s;
}

/** The part of a canvas context that art is drawn with: anything that can fill a rectangle in a colour. */
export interface Brush {
  fillStyle: string | CanvasGradient | CanvasPattern;
  fillRect(x: number, y: number, w: number, h: number): void;
}

/** Draw a sprite at (x, y), `size` pixels square, every art pixel a crisp block (`size` a whole multiple of the sprite's grid keeps them even). */
export function drawSprite(ctx: Brush, sprite: Sprite, x: number, y: number, size: number = sprite.size): void {
  const edge = (i: number): number => Math.round((i * size) / sprite.size);
  for (let row = 0; row < sprite.size; row++) {
    for (let col = 0; col < sprite.size; col++) {
      const cell = at(sprite, col, row);
      if (cell === 0) continue;
      ctx.fillStyle = ART_COLORS[cell - 1] as string;
      ctx.fillRect(x + edge(col), y + edge(row), edge(col + 1) - edge(col), edge(row + 1) - edge(row));
    }
  }
}

/** Draw a good's icon at (x, y), `size` pixels square (16 to the art pixel, 32 doubled, and so on). Returns whether the good has an icon. */
export function drawGood(ctx: Brush, good: string, x: number, y: number, size: number = GOODS_SIZE): boolean {
  const art = goodArt(good);
  if (art) drawSprite(ctx, art, x, y, size);
  return art !== null;
}

/** Whose flag: one of the four powers, or the Crown they all answer to. */
export type FlagId = NationId | 'crown';
export const FLAG_IDS = ['england', 'france', 'spain', 'netherlands', 'crown'] as const satisfies readonly FlagId[];

const LILY = ['.y.', 'yyy', '.y.'];
const CROWN = ['y..yy..y', 'yy.yy.yy', 'yyyyyyyy', 'yryyyyry', 'yyyyyyyy'];

/**
 * A flag on the 16-pixel grid, fourteen by ten inside an ink edge: a red cross on white for England, gold
 * lilies on blue for France, a red saltire on white for Spain, orange, white and blue bars for the
 * Netherlands, and a gold crown on purple for the Crown.
 */
export function flagArt(id: FlagId): Sprite {
  const s = blank();
  box(s, 0, 2, 16, 12, INK.ink);
  const field = (ink: number): void => box(s, 1, 3, 14, 10, ink);
  if (id === 'england') {
    field(INK.white);
    box(s, 7, 3, 2, 10, INK.red);
    box(s, 1, 7, 14, 2, INK.red);
  } else if (id === 'france') {
    field(INK.blue);
    for (const [x, y] of [[3, 4], [10, 4], [6, 9]] as const) stamp(s, x, y, LILY, { y: INK.yellow });
  } else if (id === 'spain') {
    field(INK.white);
    line(s, 2, 3, 13, 12, INK.red, 2);
    line(s, 13, 3, 2, 12, INK.red, 2);
  } else if (id === 'netherlands') {
    box(s, 1, 3, 14, 3, INK.orange);
    box(s, 1, 6, 14, 4, INK.white);
    box(s, 1, 10, 14, 3, INK.blue);
  } else {
    field(INK.purple);
    stamp(s, 4, 5, CROWN, { y: INK.yellow, r: INK.red });
  }
  return s;
}

/** What is pressed into a seal: one of four marks, for the four kinds of business an adviser reports on. */
export const SEAL_GLYPHS = ['quill', 'cross', 'anchor', 'wheat'] as const;
export type SealGlyph = (typeof SEAL_GLYPHS)[number];

/** A round of wax, pressed a little out of true, lit from the upper left. */
const SEAL_WAX = [
  '.....oooooo.....',
  '...oowwwwwwoo...',
  '..owwwwwwwwwwoo.',
  '.owhhwwwwwwwwwo.',
  '.owhwwwwwwwwwwwo',
  'owwwwwwwwwwwwwwo',
  'owwwwwwwwwwwwwwo',
  'owwwwwwwwwwwwwwo',
  'owwwwwwwwwwwwwwo',
  'owwwwwwwwwwwwwwo',
  'owwwwwwwwwwwwwwo',
  '.owwwwwwwwwwwwo.',
  '.owwwwwwwwwwwwo.',
  '..oowwwwwwwwoo..',
  '....oowwwwoo....',
  '......oooo......',
];
/** The marks, eight by eight: a pen for affairs of state, a cross for the church, an anchor for the sea and its trade, an ear of wheat for the land and those who work it. */
const SEAL_MARKS: Readonly<Record<SealGlyph, readonly string[]>> = {
  quill: ['.....mmm', '....mmmm', '...mmmm.', '..mmmm..', '..mmm...', '.mm.....', '.m......', 'm.......'],
  cross: ['...mm...', '...mm...', '.mmmmmm.', '.mmmmmm.', '...mm...', '...mm...', '...mm...', '...mm...'],
  anchor: ['...mm...', '..m..m..', '...mm...', '.mmmmmm.', '...mm...', 'm..mm..m', 'mm.mm.mm', '.mmmmmm.'],
  wheat: ['...mm...', '.m.mm.m.', '..mmmm..', '.m.mm.m.', '..mmmm..', '.m.mm.m.', '..mmmm..', '...mm...'],
};
/** Waxes pale enough that the mark is pressed in ink; on every other the mark is left the colour of the sheet. */
const PALE_WAX: readonly InkId[] = [INK.yellow, INK.orange, INK.sand, INK.prairie];

/**
 * A wax seal on the 16-pixel grid: a round of wax in the given colour inside an ink edge, a glint of
 * light at its upper left, and one of the four marks pressed into the middle of it.
 */
export function sealArt(glyph: SealGlyph, wax: InkId): Sprite {
  const s = blank();
  stamp(s, 0, 0, SEAL_WAX, { o: INK.ink, w: wax, h: INK.white });
  stamp(s, 4, 4, SEAL_MARKS[glyph], { m: PALE_WAX.includes(wax) ? INK.ink : INK.parchment });
  return s;
}

/** The same art at half the size, for the smallest zoom: every other art pixel. */
export function halve(sprite: Sprite): Sprite {
  const size = sprite.size >> 1;
  const out = blank(size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) out.cells[y * size + x] = at(sprite, x * 2 + 1, y * 2 + 1);
  return out;
}

/** A sprite as RGBA bytes, for a canvas. */
export function toRgba(sprite: Sprite): Uint8ClampedArray {
  const out = new Uint8ClampedArray(sprite.size * sprite.size * 4);
  sprite.cells.forEach((cell, i) => {
    if (cell === 0) return;
    const hex = ART_COLORS[cell - 1] as string;
    out[i * 4] = parseInt(hex.slice(1, 3), 16);
    out[i * 4 + 1] = parseInt(hex.slice(3, 5), 16);
    out[i * 4 + 2] = parseInt(hex.slice(5, 7), 16);
    out[i * 4 + 3] = 255;
  });
  return out;
}
