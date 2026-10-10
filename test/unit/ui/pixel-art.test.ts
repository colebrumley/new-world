import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RESOURCE_IDS } from '../../../src/engine/data/resources';
import { TERRAIN_IDS } from '../../../src/engine/data/terrain';
import { UNIT_TYPE_IDS } from '../../../src/engine/data/units';
import { activeFrameArt, ART, at, blank, colonyArt, COLONY_LOOKS, DETAIL, detailedColonyArt, detailedPieceArt, detailedSettlementArt, detailedTileArt, halve, hasFigure, INK, miniTileArt, PALETTE, pieceArt, settlementArt, tileArt, toRgba, VILLAGE_LOOKS, write, type Sprite, type TileLook } from '../../../src/ui/pixel-art';

const look = (change: Partial<TileLook> = {}): TileLook => ({ terrain: 'plains', river: 'none', riverMask: 0, road: false, roadMask: 0, plowed: false, resource: null, rumor: false, totem: false, variant: 0, ...change });
const text = (s: Sprite): string => Array.from({ length: s.size }, (_, y) => Array.from({ length: s.size }, (_, x) => (at(s, x, y) === 0 ? '.' : (at(s, x, y) - 1).toString(32))).join('')).join('\n');
const inks = (s: Sprite): Set<number> => new Set([...s.cells].filter((c) => c > 0).map((c) => c - 1));
const differ = (a: Sprite, b: Sprite): boolean => text(a) !== text(b);

describe('the palette', () => {
  it('is thirty-two distinct colours', () => {
    expect(PALETTE).toHaveLength(32);
    expect(new Set(PALETTE).size).toBe(32);
    for (const hex of PALETTE) expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    expect(Object.values(INK).sort((a, b) => a - b)).toEqual(Array.from({ length: 32 }, (_, i) => i));
  });

  it('is the only source of colour for the map: the drawing code names no colours of its own', () => {
    for (const file of ['render.ts', 'tiles.ts', 'minimap.ts']) {
      const source = readFileSync(join(__dirname, '../../../src/ui', file), 'utf8');
      expect(source.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g) ?? [], file).toEqual([]);
    }
  });
});

describe('terrain art', () => {
  it('fills the whole square for every terrain, in every variant, on the sixteen-pixel grid', () => {
    for (const terrain of TERRAIN_IDS) {
      for (let variant = 0; variant < 4; variant++) {
        const s = tileArt(look({ terrain, variant }));
        expect(s.size).toBe(ART);
        expect([...s.cells].every((c) => c >= 1 && c <= 32), terrain).toBe(true);
      }
      const mini = miniTileArt(look({ terrain }));
      expect(mini.size).toBe(8);
      expect([...mini.cells].every((c) => c >= 1), terrain).toBe(true);
    }
  });

  it('every terrain can be told from every other, at full size and at the smallest zoom apart from open and wooded ground of one colour', () => {
    const full = new Map(TERRAIN_IDS.map((t) => [t, text(tileArt(look({ terrain: t })))]));
    expect(new Set(full.values()).size).toBe(TERRAIN_IDS.length);
    const mini = new Set(TERRAIN_IDS.map((t) => text(miniTileArt(look({ terrain: t })))));
    expect(mini.size).toBeGreaterThanOrEqual(14);
    // sea and land never share a colour, and forest is never the colour of its open ground
    for (const [open, forest] of [['plains', 'mixed'], ['grassland', 'conifer'], ['tundra', 'boreal'], ['swamp', 'rain']] as const) expect(text(miniTileArt(look({ terrain: open })))).not.toBe(text(miniTileArt(look({ terrain: forest }))));
  });

  it('is the same every time, and varies a little from variant to variant', () => {
    expect(text(tileArt(look({ terrain: 'mixed', variant: 2 })))).toBe(text(tileArt(look({ terrain: 'mixed', variant: 2 }))));
    expect(differ(tileArt(look({ terrain: 'mixed', variant: 0 })), tileArt(look({ terrain: 'mixed', variant: 1 })))).toBe(true);
    expect(differ(tileArt(look({ terrain: 'ocean', variant: 0 })), tileArt(look({ terrain: 'ocean', variant: 3 })))).toBe(true);
  });

  it('shows rivers, roads, plowing, resources, rumors and totems', () => {
    const plain = tileArt(look());
    expect(inks(tileArt(look({ river: 'minor', riverMask: 5 })))).toContain(INK.brightBlue);
    const minor = [...tileArt(look({ river: 'minor', riverMask: 5 })).cells].filter((c) => c - 1 === INK.brightBlue).length;
    const major = [...tileArt(look({ river: 'major', riverMask: 5 })).cells].filter((c) => c - 1 === INK.brightBlue).length;
    expect(major).toBeGreaterThan(minor);
    expect(differ(tileArt(look({ river: 'minor', riverMask: 5 })), tileArt(look({ river: 'minor', riverMask: 10 })))).toBe(true);
    expect(inks(tileArt(look({ road: true, roadMask: 0b01000100 })))).toContain(INK.wood);
    expect(differ(tileArt(look({ road: true, roadMask: 1 })), tileArt(look({ road: true, roadMask: 16 })))).toBe(true);
    expect(differ(plain, tileArt(look({ plowed: true })))).toBe(true);
    expect(differ(plain, tileArt(look({ rumor: true })))).toBe(true);
    expect(differ(plain, tileArt(look({ totem: true })))).toBe(true);
    for (const resource of RESOURCE_IDS) expect(differ(plain, tileArt(look({ resource }))), resource).toBe(true);
  });
});

describe('pieces', () => {
  it('every unit type has its own figure in a box of its owner\'s colour', () => {
    const seen = new Set<string>();
    for (const type of UNIT_TYPE_IDS) {
      const s = pieceArt({ type, color: INK.red, label: '-', stacked: false });
      expect(inks(s), type).toContain(INK.red);
      expect(inks(s), type).toContain(INK.ink);
      // something other than the box and its outline is drawn in it
      expect([...inks(s)].some((i) => i !== INK.red && i !== INK.ink) || text(s) !== text(pieceArt({ type: 'colonist', color: INK.red, label: '-', stacked: false })), type).toBe(true);
      seen.add(text(s));
    }
    expect(seen.size).toBe(UNIT_TYPE_IDS.length);
  });

  it('takes the owner\'s colour, carries the order on a plate in that colour, and shows when it stands on others', () => {
    const red = pieceArt({ type: 'soldier', color: INK.red, label: 'F', stacked: false });
    const blue = pieceArt({ type: 'soldier', color: INK.blue, label: 'F', stacked: false });
    expect(inks(red)).toContain(INK.red);
    expect(inks(blue)).not.toContain(INK.red);
    expect(at(red, 0, 0) - 1).toBe(INK.ink); // the plate's outline
    expect(at(red, 2, 5) - 1).toBe(INK.red); // inside the plate, clear of the letter F
    expect(differ(red, pieceArt({ type: 'soldier', color: INK.red, label: 'S', stacked: false }))).toBe(true);
    expect(differ(red, pieceArt({ type: 'soldier', color: INK.red, label: 'F', stacked: true }))).toBe(true);
    // a native band has no plate
    expect(at(pieceArt({ type: 'brave', color: INK.purple, label: '', stacked: false }), 0, 0)).toBe(0);
    // the active frame runs round the edge and leaves the middle alone
    expect(at(activeFrameArt(), 0, 7) - 1).toBe(INK.white);
    expect(at(activeFrameArt(), 7, 7)).toBe(0);
  });
});

describe('detailed pieces', () => {
  const figured = UNIT_TYPE_IDS.filter(hasFigure);

  it('every kind of unit has a detailed figure of its own, twice the grid of the map', () => {
    expect(figured).toEqual([...UNIT_TYPE_IDS]);
    const seen = new Set<string>();
    for (const type of figured) {
      const s = detailedPieceArt({ type, color: INK.red, label: '', stacked: false });
      expect(s?.size, type).toBe(DETAIL);
      if (s) seen.add(text(s));
    }
    expect(seen.size).toBe(figured.length);
  });

  it('stands on a base of its owner\'s colour, carries its orders on a tab at the foot, shows a stack, and turns into colours', () => {
    const look = { type: 'soldier', color: INK.red, label: 'F', stacked: false } as const;
    const red = detailedPieceArt(look) as Sprite;
    expect(inks(red)).toContain(INK.red); // the base
    expect(at(red, 15, 30) - 1).toBe(INK.ink); // its outline, below the figure's feet
    expect(inks(detailedPieceArt({ ...look, color: INK.blue }) as Sprite)).not.toContain(INK.red);
    // the tab: white on dark at the bottom left, and nothing of it at the top left where the old plate sat
    expect(at(red, 0, 22) - 1).toBe(INK.ink);
    expect(at(red, 1, 23) - 1).toBe(INK.white); // the top stroke of the F
    expect(at(red, 0, 0)).toBe(0);
    expect(differ(red, detailedPieceArt({ ...look, label: 'S' }) as Sprite)).toBe(true);
    expect(differ(red, detailedPieceArt({ ...look, stacked: true }) as Sprite)).toBe(true);
    // a unit with no orders has no tab, and every order letter and digit has a glyph of its own
    const idle = detailedPieceArt({ ...look, label: '-' }) as Sprite;
    expect(text(idle)).toBe(text(detailedPieceArt({ ...look, label: '' }) as Sprite));
    expect(differ(idle, red)).toBe(true);
    const tabs = [...'SGFPRT0123456789'].map((label) => text(detailedPieceArt({ ...look, label }) as Sprite));
    expect(new Set(tabs).size).toBe(tabs.length);
    // the figure's own colours lie beyond the map palette and still come out opaque
    const beyond = red.cells.findIndex((c) => c > PALETTE.length);
    expect(beyond).toBeGreaterThanOrEqual(0);
    expect(toRgba(red)[beyond * 4 + 3]).toBe(255);
  });
});

describe('colonies and settlements', () => {
  it('a colony wears its owner\'s roof and shows its population in the colour of its loyalties', () => {
    const one = colonyArt(INK.red, 1, INK.white);
    expect(inks(one)).toEqual(new Set([INK.red, INK.parchment, INK.ink, INK.white]));
    expect(differ(one, colonyArt(INK.red, 2, INK.white))).toBe(true);
    expect(differ(one, colonyArt(INK.blue, 1, INK.white))).toBe(true);
    expect(inks(colonyArt(INK.red, 12, INK.green))).toContain(INK.green);
    expect(inks(colonyArt(INK.red, 12, INK.brightBlue))).toContain(INK.brightBlue);
    expect(text(colonyArt(INK.red, 150, INK.white))).toBe(text(colonyArt(INK.red, 99, INK.white)));
  });

  it('a settlement is a tent, a longhouse or a pyramid; a capital flies a pennant; the mood mark is an exclamation in its colour', () => {
    const shapes = [0, 1, 2].map((tech) => text(settlementArt(INK.purple, tech, false, null)));
    expect(new Set(shapes).size).toBe(3);
    expect(differ(settlementArt(INK.purple, 0, false, null), settlementArt(INK.purple, 0, true, null))).toBe(true);
    const calm = settlementArt(INK.purple, 0, false, INK.green);
    const angry = settlementArt(INK.purple, 0, false, INK.red);
    expect(inks(calm)).toContain(INK.green);
    expect(inks(angry)).toContain(INK.red);
    // the mark: two wide, three tall, a gap, and a dot, at the top right
    expect([1, 2, 3, 4, 5].map((y) => at(angry, 13, y) - 1)).toEqual([INK.red, INK.red, INK.red, INK.ink, INK.red]);
    expect(inks(settlementArt(INK.purple, 0, false, null))).not.toContain(INK.red);
  });
});

describe('detailed terrain', () => {
  it('fills the whole square for every terrain, in every variant, on the 32-pixel grid', () => {
    for (const terrain of TERRAIN_IDS) {
      for (let variant = 0; variant < 4; variant++) {
        const s = detailedTileArt(look({ terrain, variant }));
        expect(s.size).toBe(DETAIL);
        expect([...s.cells].every((c) => c >= 1), `${terrain} ${variant}`).toBe(true);
      }
    }
  });

  it('every terrain can be told from every other, and a variant is the same ground turned another way', () => {
    expect(new Set(TERRAIN_IDS.map((t) => text(detailedTileArt(look({ terrain: t }))))).size).toBe(TERRAIN_IDS.length);
    const [a, b, c, d] = [0, 1, 2, 3].map((variant) => detailedTileArt(look({ terrain: 'tundra', variant }))) as [Sprite, Sprite, Sprite, Sprite];
    expect(new Set([a, b, c, d].map(text)).size).toBe(4);
    for (let y = 0; y < DETAIL; y++) {
      for (let x = 0; x < DETAIL; x++) {
        expect(at(b, x, y)).toBe(at(a, DETAIL - 1 - x, y));
        expect(at(c, x, y)).toBe(at(a, x, DETAIL - 1 - y));
        expect(at(d, x, y)).toBe(at(a, DETAIL - 1 - x, DETAIL - 1 - y));
      }
    }
    // a forest stands on the open ground of its row, and is never turned upside down
    const wood = detailedTileArt(look({ terrain: 'conifer', variant: 0 }));
    const upended = detailedTileArt(look({ terrain: 'conifer', variant: 2 }));
    const trees = [...wood.cells].map((cell, i) => (cell !== detailedTileArt(look({ terrain: 'grassland', variant: 0 })).cells[i] ? i : -1)).filter((i) => i >= 0);
    expect(trees.length).toBeGreaterThan(100);
    expect(trees.filter((i) => upended.cells[i] === wood.cells[i]).length).toBeGreaterThan(trees.length * 0.9);
  });

  it('shows rivers, roads, plowing, resources, rumors and totems as the plain art does, enlarged', () => {
    const plain = detailedTileArt(look());
    const changes: Partial<TileLook>[] = [{ river: 'minor', riverMask: 5 }, { river: 'major', riverMask: 5 }, { road: true, roadMask: 68 }, { plowed: true }, { resource: 'wheat' }, { rumor: true }, { totem: true }];
    const seen = new Set([text(plain)]);
    for (const change of changes) seen.add(text(detailedTileArt(look(change))));
    expect(seen.size).toBe(changes.length + 1);
    // a river is the bright blue of the plain art, each of its pixels four here
    const blue = (s: Sprite): number => [...s.cells].filter((c) => c - 1 === INK.brightBlue).length;
    expect(blue(detailedTileArt(look({ river: 'minor', riverMask: 5 })))).toBe(4 * blue(tileArt(look({ river: 'minor', riverMask: 5 }))));
  });
});

describe('detailed places', () => {
  it('a colony has a picture for each state of its walls, roofed in its owner\'s colour, with its population at the foot', () => {
    const looks = COLONY_LOOKS.map((_, fort) => detailedColonyArt(INK.red, 5, INK.white, fort) as Sprite);
    expect(new Set(looks.map(text)).size).toBe(4);
    for (const s of looks) {
      expect(s.size).toBe(DETAIL);
      expect(inks(s)).toContain(INK.red);
    }
    const blue = detailedColonyArt(INK.blue, 5, INK.white, 0) as Sprite;
    expect(inks(blue)).toContain(INK.blue);
    expect(inks(blue)).not.toContain(INK.red);
    // the population: every count reads differently, in the colour of the colony's loyalties, and 99 is the most shown
    expect(new Set([1, 2, 9, 10, 12, 99].map((n) => text(detailedColonyArt(INK.red, n, INK.white, 0) as Sprite))).size).toBe(6);
    expect(inks(detailedColonyArt(INK.red, 12, INK.green, 0) as Sprite)).toContain(INK.green);
    expect(text(detailedColonyArt(INK.red, 150, INK.white, 0) as Sprite)).toBe(text(detailedColonyArt(INK.red, 99, INK.white, 0) as Sprite));
    // walls beyond a fortress, or less than none, are drawn as the nearest there is
    expect(text(detailedColonyArt(INK.red, 5, INK.white, 7) as Sprite)).toBe(text(looks[3] as Sprite));
  });

  it('a settlement has a picture for each tech level in its people\'s colour; a capital carries a star and the mood mark is an exclamation', () => {
    const looks = VILLAGE_LOOKS.map((_, tech) => detailedSettlementArt(INK.purple, tech, false, null) as Sprite);
    expect(new Set(looks.map(text)).size).toBe(4);
    for (const s of looks) expect(inks(s)).toContain(INK.purple);
    const capital = detailedSettlementArt(INK.purple, 0, true, null) as Sprite;
    expect(at(capital, 3, 3) - 1).toBe(INK.yellow);
    expect(at(looks[0] as Sprite, 3, 3) - 1).not.toBe(INK.yellow);
    const angry = detailedSettlementArt(INK.purple, 0, false, INK.red) as Sprite;
    expect([1, 2, 3, 4, 5, 6, 7].map((y) => at(angry, DETAIL - 3, y) - 1)).toEqual([INK.red, INK.red, INK.red, INK.red, INK.ink, INK.red, INK.red]);
    expect(inks(looks[0] as Sprite)).not.toContain(INK.red);
  });
});

describe('helpers', () => {
  it('writes in a three-by-five face', () => {
    const s = blank();
    write(s, 0, 0, '10', INK.white);
    expect(text(s).split('\n').slice(0, 5).map((row) => row.slice(0, 7))).toEqual(['.2..222', '22..2.2', '.2..2.2', '.2..2.2', '222.222']);
  });

  it('halves art for the smallest zoom and turns it into bytes', () => {
    const big = colonyArt(INK.red, 3, INK.white);
    const small = halve(big);
    expect(small.size).toBe(8);
    expect(inks(small)).toContain(INK.red);
    const bytes = toRgba(small);
    expect(bytes).toHaveLength(8 * 8 * 4);
    const i = small.cells.findIndex((c) => c - 1 === INK.red);
    expect([...bytes.slice(i * 4, i * 4 + 4)]).toEqual([0xc8, 0x32, 0x2b, 255]);
    const clear = small.cells.findIndex((c) => c === 0);
    expect(bytes[clear * 4 + 3]).toBe(0);
  });

  it('matches the art snapshot', () => {
    expect({
      plains: text(tileArt(look())), forest: text(tileArt(look({ terrain: 'conifer' }))), mountains: text(tileArt(look({ terrain: 'mountains' }))),
      caravel: text(pieceArt({ type: 'caravel', color: INK.red, label: '-', stacked: false })),
      dragoon: text(pieceArt({ type: 'dragoon', color: INK.blue, label: 'F', stacked: true })),
      colony: text(colonyArt(INK.red, 7, INK.green)), village: text(settlementArt(INK.orange, 2, true, INK.yellow)),
    }).toMatchSnapshot();
  });
});
