// Pixel art for the map (R-1006). Everything on the map is drawn on a 16 x 16 grid of "art
// pixels" in a fixed palette of 32 colours, then blown up by whole numbers, so every zoom level
// shows the same crisp grid. All of it is made here from code: nothing is taken from the
// original's graphics (constraint C1), and nothing here needs a canvas, so it can be tested as data.
import type { ResourceId } from '../engine/data/resources';
import type { TerrainId } from '../engine/data/terrain';
import type { UnitTypeId } from '../engine/data/units';

/** The 32 colours everything on the map is drawn in: a palette in the spirit of 256-colour VGA art. */
export const PALETTE = [
  '#0b0d12', // 0 void
  '#111111', // 1 ink
  '#f2f2f2', // 2 white
  '#e9dfc4', // 3 parchment
  '#c3c7cc', // 4 light grey
  '#8d8a84', // 5 grey
  '#5f5b57', // 6 dark grey
  '#173d61', // 7 deep sea
  '#1f4e79', // 8 sea
  '#2b6398', // 9 wave
  '#4d8dff', // 10 bright blue
  '#e6edf2', // 11 ice
  '#9aa58c', // 12 tundra
  '#d3bd7a', // 13 sand
  '#b9b45a', // 14 plains
  '#c9a857', // 15 prairie
  '#7fae4e', // 16 grass
  '#a3b548', // 17 savannah
  '#6f9471', // 18 marsh
  '#56765c', // 19 swamp
  '#48902f', // 20 leaf
  '#2a6642', // 21 forest
  '#1c4a2e', // 22 deep forest
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

const RESOURCE_INK: Readonly<Record<ResourceId, InkId>> = {
  depletedMine: INK.darkGrey, oasis: INK.brightBlue, wheat: INK.yellow, primeCotton: INK.white, primeTobacco: INK.wood,
  primeSugar: INK.parchment, minerals: INK.orange, fishery: INK.ice, beaver: INK.earth, game: INK.orange,
  primeTimber: INK.deepForest, silverDeposit: INK.lightGrey, oreDeposit: INK.darkGrey,
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

/** A resource: a small badge in the top right corner, a gem shape for what is dug and a round one for what grows. */
function resource(s: Sprite, id: ResourceId): void {
  const mined = id === 'silverDeposit' || id === 'oreDeposit' || id === 'minerals' || id === 'depletedMine';
  stamp(s, 10, 1, mined ? ['..k..', '.kck.', 'kccck', '.kck.', '..k..'] : ['.kkk.', 'kccck', 'kccck', 'kccck', '.kkk.'], { k: INK.ink, c: RESOURCE_INK[id] });
}

/** A Lost City Rumor: a broken arch of pale stone in the bottom left corner. */
function rumor(s: Sprite): void {
  stamp(s, 1, 9, ['kkkkk.', 'kpppk.', 'kpkpkk', 'kpkkpk', 'kpk.pk', 'kkk.kk'], { k: INK.ink, p: INK.parchment });
}

function totem(s: Sprite): void {
  stamp(s, 5, 3, ['.rrr.', 'yyyyy', '..w..', '.yyy.', '..w..', '..w..', '..w..', '..w..'], { r: INK.red, y: INK.yellow, w: INK.wood });
}

/** The art for one map square. */
export function tileArt(look: TileLook): Sprite {
  const s = blank();
  const rnd = scatter(hash(`${look.terrain}:${look.variant}`));
  ground(s, look.terrain, rnd);
  if (look.plowed) furrows(s);
  if (look.river !== 'none') river(s, look);
  if (look.terrain === 'hills' || look.terrain === 'mountains') relief(s, look.terrain, rnd);
  else trees(s, look.terrain, rnd);
  if (look.road) road(s, look);
  if (look.resource) resource(s, look.resource);
  if (look.rumor) rumor(s);
  if (look.totem) totem(s);
  return s;
}

/** The square at the smallest zoom: one flat colour, with a river or a road as a single stroke through it. */
export function miniTileArt(look: TileLook): Sprite {
  const s = blank(8);
  box(s, 0, 0, 8, 8, MINI[look.terrain]);
  if (look.terrain === 'mountains') stamp(s, 2, 2, ['.ww.', 'wwdd'], { w: INK.white, d: INK.grey });
  if (look.river !== 'none') box(s, 3, 3, 2, 2, INK.brightBlue);
  if (look.road) box(s, 2, 4, 4, 1, INK.wood);
  if (look.rumor) box(s, 1, 5, 2, 2, INK.parchment);
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
    const hex = PALETTE[cell - 1] as string;
    out[i * 4] = parseInt(hex.slice(1, 3), 16);
    out[i * 4 + 1] = parseInt(hex.slice(3, 5), 16);
    out[i * 4 + 2] = parseInt(hex.slice(5, 7), 16);
    out[i * 4 + 3] = 255;
  });
  return out;
}
