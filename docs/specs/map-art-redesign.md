# Map art redesign: spec for R-1040 to R-1046

Written by `/plan` on 2026-10-11. Status: built.

**The request, in the owner's words:** the graphics are not up to snuff. The reference screenshot
the owner supplied (a classic map of this kind at 32 pixels to the square) is much more cohesive,
colourful and expressive: saturated green forests with distinct tree species, tan plains with crop
rows, deep blue sea with lighter shallows along every coast, rivers, snow-capped mountains, a clear
pictorial marker for each special resource (deer, fish, silver, beaver, cotton, tobacco, sugar and
so on), a distinctive round marker for a lost city, named colonies, and squares that blend into one
another at their edges instead of meeting as hard tiles. The owner wants a cohesive, colourful
design carried through the whole map, as close to that feel as we can get without copying anyone's
assets.

## Goal

The map reads as one saturated, hand-painted world at every zoom: ground and forests in one style,
coasts with shallows and no hard square edges between kinds of ground, a pictorial marker for every
special resource that can be told at a glance, a round gold seal for a lost city, and each colony's
name under it. All of it stays palette-indexed pixel art drawn by whole pixels, as
`docs/VISUAL_CHECKLIST.md` requires, and every picture is our own (constraint C1).

## Non-goals

- The eight colony and settlement pictures and the twenty-four unit figures keep their current
  art. The owner chose this; a follow-up spec may redo them once the ground is in.
- No new game rule, no change to what a tile yields or to which resources sit where
  (`src/engine/data/resources.ts` is read, never changed).
- No change to the page chrome, the theme tokens, the colony screen's layout, the Europe screen,
  reports or the chart (vellum, roses, creatures): the six chart inks keep their values.
- No canvas text: labels are pixel art in the palette, like everything else on the map.
- No runtime dependency. Art is generated with Codex and baked with pixelforge as CLAUDE.md says;
  nothing at runtime loads an image.

## Rules and sources

Nothing here is a game rule. The drawing technique (how squares blend, how coasts are drawn, where
the markers and the names go, the order things are drawn in) follows the private notes under
`ref/`, which the planner read on the owner's instruction; each item says what came from there and
what is this game's own choice. Workers build from this spec alone: the notes are not in the
worktrees, and nothing from them may be named or quoted in code, docs, commits, pull requests or
board notes (CLAUDE.md, the public-repo rule). The pictures themselves are our own, generated and
baked as `docs/ART.md` will say (constraint C1). "The reference" in this spec is the owner's
screenshot and is never to be named.

## How the map is drawn today (what every worker should know)

- `src/ui/pixel-art.ts` holds `PALETTE` (32 colours), `INK` (their names), and three sets of tile
  art: `miniTileArt` (8 art pixels, one flat colour), `tileArt` (16, drawn in code) and
  `detailedTileArt` (32, baked pictures from `art/floors` and `art/features` with the 16-pixel
  rivers, roads, furrows and marks enlarged over them). `src/ui/tiles.ts` picks one by the square's
  size (`grade`): under 12 px the 8 grid, a multiple of 32 px the 32 grid, otherwise 16.
- At 1280 x 800 the four zooms give squares of 64, 32, 16 and 8 px (`src/ui/view.ts`,
  `tileSizeFor`). So the 32 grid covers the two nearest zooms, the 16 grid the third, and the 8
  grid the farthest. The minimap uses `MINI` flat colours.
- Baked art lives in `src/ui/*-art.ts` as rows of letters; each file has its own `_COLORS` beyond
  the palette. `ART_COLORS` is the palette followed by every baked set, at most 255 in all (now 32
  + 32 + 19 + 39 + 46 + 23 + 22 = 213).
- `scripts/bake-art.py` bakes a folder with pixelforge (`PIXELFORGE=<checkout>` and that
  checkout's Python; the owner's checkout is at `~/Documents/lib/pixelforge`). `scripts/shrink-art.py`
  takes the grain out of a fresh picture first. Source pictures are made with Codex's image
  generation, run from an empty scratch directory, at most six pictures to a run and runs in
  parallel, with one or two existing pictures from `art/` attached as style references:

  ```bash
  codex exec --skip-git-repo-check -s workspace-write -i ../art/units/colonist.png -- "$(cat prompt.txt)" < /dev/null
  ```

  The prompt begins "Use your image generation tool to create N separate square images (1024 x
  1024), one per subject below, and save them as PNG files in the current directory with exactly
  these filenames. Do not write code to draw them; generate them with the image tool.", then the
  style (a flat magenta `#ff00ff` ground behind a subject to be cut out, or filling the square for
  a floor; flat colour areas, dark outlines, light from the upper left, no text, no gradients),
  then the numbered subjects with their filenames. Codex is on this machine (`codex --version`);
  if it is not available or refuses, stop, leave the pull request open under **Open findings**,
  and say so on the board (the blocking rules in CLAUDE.md).
- The e2e visual baselines (`test/e2e/__snapshots__/visual.spec.ts/*`) are fingerprints of a
  reference render (`test/helpers/reference-canvas.ts`) that runs the game's own `render()`. That
  helper refuses a `fillStyle` outside `PALETTE`, any art drawn off the pixel grid, any
  non-square sprite, and smoothing. Every item here changes the baselines; update them with
  `npx playwright test test/e2e/visual.spec.ts --update-snapshots` after looking at the PNGs it
  writes to `test-results/`. Unit snapshots (`test/unit/ui/__snapshots__/pixel-art.test.ts.snap`,
  `render.test.ts.snap`) update with `npm test -- -u <file>`. The manual's sprite fixtures under
  `wiki/images/art/` regenerate with `UPDATE_FIXTURES=1 npm test -- test/unit/wiki`.
- The title painting (`src/ui/title-art.ts`) and the portraits (`src/ui/portrait-art.ts`) are baked
  in palette colours only, and their tests require every colour they use to be in `PALETTE`. A
  palette change must re-bake both (`scripts/bake-art.py title portraits`).

## Shared surfaces

| Surface | Changed by | Order |
|---|---|---|
| `PALETTE` entries in `src/ui/pixel-art.ts`, `FLOOR_COLOURS` in `scripts/bake-art.py` | W1 | first |
| `docs/ART.md` (new): the style guide and the Codex prompt template every art item follows | W1 | first |
| `src/ui/tiles.ts` `TileCache`, `tileSprite`, `paintTile`: the square split into a floor layer and an over layer; `floorArt(grid, open, variant)` | W2 | after W1, before W3 and W7 |
| `TileLook` and `lookKey` (`joinMask`, `mouthMask`), `lookOf` | W7 | after W2 and W3 |
| `src/ui/floor-art.ts`, `src/ui/feature-art.ts` | W1 re-levels the floors; W3 replaces both and adds the 16-pixel copies; W7 re-bakes features without `TWO_ROWS` | W1, then W3, then W7 |
| Marks in `src/ui/pixel-art.ts` (`resource`, `rumor`, `totem`) and the over layer's order | W4, W5 and W7 each touch a different function; expect small merge conflicts, resolve on `origin/main` | after W1 |
| `test/helpers/reference-canvas.ts` | nobody: every item draws square sprites at whole multiples, as it requires | |
| e2e and unit baselines, wiki fixtures | every item, in its own pull request, after bringing `origin/main` in | |

## Work items

Independent where possible; each small enough for one worker session. Size S is a subagent (an hour's
work or less, few files); M and L are task chips (the owner watches them). W1 goes first; W2 before
W3 and W7; the rest in any order after W1, each bringing `origin/main` in before its review.

### W1 — Palette retune and the art guide (R-1040, size M, depends on: nothing)

Files: `src/ui/pixel-art.ts` (PALETTE only), `scripts/bake-art.py` (`FLOOR_COLOURS` read from
`pixel-art.ts`), `scripts/contact-sheet.py` (new), `docs/ART.md` (new), `docs/VISUAL_CHECKLIST.md`
(point 1), `docs/ARCHITECTURE.md` (one line pointing at `docs/ART.md`), `src/ui/floor-art.ts`,
`src/ui/title-art.ts`, `src/ui/portrait-art.ts` (re-baked), `test/unit/ui/pixel-art.test.ts`,
snapshots, wiki fixtures.

The land and sea entries of the palette move toward a saturated, high-contrast feel. Use the table
as given (no latitude, so that every later item bakes against the same colours):

| # | name | now | new | role |
|---|---|---|---|---|
| 7 | deepSea | `#173d61` | `#141f6b` | sea lanes, the darkest water |
| 8 | sea | `#1f4e79` | `#1f2f8e` | open ocean |
| 9 | wave | `#2b6398` | `#3d58b0` | shallows along a coast, wave crests |
| 10 | brightBlue | `#4d8dff` | `#4a8fe8` | rivers, oasis, one tribe, one mood |
| 12 | tundra | `#9aa58c` | `#a8b08f` | tundra ground |
| 14 | plains | `#b9b45a` | `#c2b268` | plains ground |
| 15 | prairie | `#c9a857` | `#cfae5c` | prairie ground |
| 16 | grass | `#7fae4e` | `#6cb43e` | grassland ground |
| 17 | savannah | `#a3b548` | `#a9bd4a` | savannah ground |
| 18 | marsh | `#6f9471` | `#6a9c5e` | marsh ground |
| 19 | swamp | `#56765c` | `#4c7a4e` | swamp ground |
| 20 | leaf | `#48902f` | `#4f9f2c` | light canopy |
| 21 | forest | `#2a6642` | `#2b7a28` | canopy |
| 22 | deepForest | `#1c4a2e` | `#1a5a1e` | dark canopy, forest at the far zoom |

The other eighteen keep their values: void, ink, white, parchment, the three greys, ice, sand,
hill, earth, wood (the chart's six inks are parchment, sand, hill, earth, wood and ink), and the six
accents red, blue, yellow, orange, green and purple, which name nations, tribes, moods and seals.

`scripts/bake-art.py` stops keeping its own `FLOOR_COLOURS` table: it reads `PALETTE` (as
`map_palette()` does) and the `GROUND` table from `src/ui/pixel-art.ts` and builds the terrain
colours from them, so the two can no longer drift apart.

`docs/ART.md` is the style guide every later art item hands to Codex and checks its result
against. It says, in public-safe words: the subject matter of each folder (`art/floors`,
`art/features`, `art/resources`, `art/places`, `art/units`, `art/portraits`, `art/title`,
`art/chart`); the look (flat colour areas with a dark outline of one or two pixels, light from the
upper left, saturated greens and blues, no gradients, no grain, no text); the ground rule (flat
magenta `#ff00ff` behind anything cut out; a floor fills its square and should repeat across its
edges); the size (1024 px square); the palette table above with hex values, to be quoted in the
prompt so that the picture is painted in those colours or near them; the exact `codex exec`
invocation and prompt opening from the section above, with a worked example prompt for two
floors; the pipeline (`shrink-art.py`, `bake-art.py <folder>`, the fixtures and baselines to
update, and `scripts/contact-sheet.py`); the pixelforge commit the committed bakes were made with
(`git -C ~/Documents/lib/pixelforge rev-parse HEAD`); and what to do when Codex is unavailable. It
must not name any other game or say a look was matched to one.

`scripts/contact-sheet.py <folder> [scale]` (Pillow and numpy, run with pixelforge's Python)
tiles the PNGs of `wiki/images/art/<folder>/` into one labelled sheet at the given enlargement
and writes it to `test-results/sheet-<folder>.png`; it is how every later item makes the pictures
its pull request shows.

Acceptance:
- `PALETTE` has the fourteen new values above and the eighteen others unchanged; a unit test pins
  all thirty-two by value. `CHART_COLORS` in `src/ui/chart-art.ts` is unchanged (its existing test
  maps every chart ink to a palette entry).
- A unit test asserts that neither water colour of `MINI` (`ocean`, `seaLane`) is the `MINI` colour
  of any land terrain, and the existing distinctness tests in `pixel-art.test.ts` pass.
- `src/ui/floor-art.ts` is re-baked from the existing sources (`scripts/bake-art.py floors`), and a
  unit test asserts that for every terrain in `FLOOR_ART` the commonest letter's colour is
  `PALETTE[GROUND[terrain]]`.
- The title painting and the portraits are re-baked (`scripts/bake-art.py title portraits`) and
  their tests pass with every colour in the new palette.
- `docs/ART.md` exists with the sections above; `npm run guard` exits 0.
- `docs/VISUAL_CHECKLIST.md` point 1 says what is true: the palette for everything drawn in code,
  and the palette plus the baked sets (`ART_COLORS`) for every pixel on the canvas.
- Unit snapshots, the e2e visual baselines and the wiki fixtures are updated; the PNGs in
  `test-results/visual-zoom*.png` are looked at and one is attached to the pull request.

Verify: `npm test -- test/unit/ui/pixel-art.test.ts test/unit/ui/render.test.ts test/unit/ui/frontispiece.test.ts test/unit/ui/portraits.test.ts test/unit/wiki`;
`PIXELFORGE=~/Documents/lib/pixelforge ~/Documents/lib/pixelforge/.venv/bin/python scripts/bake-art.py floors title portraits && git diff --exit-code src/ui/floor-art.ts src/ui/title-art.ts src/ui/portrait-art.ts`
(if the diff is not empty, the pull request says what differs and why); `npm run check`;
`npm run test:e2e`; a screenshot of the default zoom in the pull request.

### W2 — Blended edges and coasts (R-1041, size L, depends on: W1)

Files: `src/ui/pixel-art.ts` (`floorArt`, `overArt`, `rotate`, `EDGE_MASKS`, `blendArt`,
`COAST_MASKS`, `coastArt`), `src/ui/tiles.ts` (`TileCache`, `tileSprite`, `paintTile`),
`src/ui/render.ts` (`renderGround`, `landBeside`), `src/ui/colony-screen.ts` (keeps painting a
whole square), `test/unit/ui/pixel-art.test.ts`, `test/unit/ui/render.test.ts`,
`docs/VISUAL_CHECKLIST.md` (new point 13), `docs/ARCHITECTURE.md`.

The technique follows the private notes, which the planner read; a worker builds from this section
alone. Squares no longer meet as hard tiles.

**Layers.** A square is drawn in two cached sprites: the floor, `floorArt(grid, open, variant)`
(its ground alone, turned by the variant as today; `open` is the terrain with the forest stripped,
`OPEN_ROW`), and the over layer, `overArt(look, grid)` (everything that stands on the ground,
see-through elsewhere). `tileArt` and `detailedTileArt` keep returning the whole square, floor
under over, so every existing test and the manual's fixtures (`test/unit/wiki/images.test.ts`)
see what they saw; `tileSprite` and `paintTile` in `tiles.ts` draw that composite, as the colony
screen needs. `renderGround` instead draws the floor, then the blend pieces and, on a water
square, the coast pieces, then the over layer. Every piece goes through `TileCache.sprite(key,
make)`, so `test/helpers/reference-canvas.ts` needs no change. Nothing here is drawn on the 8
grid: at the farthest zoom squares stay flat.

**Shapes and turning.** `rotate(rows)` turns rows of text art a quarter turn clockwise (a new
helper; `turned()` mirrors and is not it). `EDGE_MASKS[grid]` is one stencil per side: the north
one is drawn by hand as rows of text art, a band along the top edge three to five art pixels deep
on the 32 grid whose lower edge is uneven, reaching six deep at two places and two at two
places; two to three deep on the 16 grid. East is north rotated once, south twice, west three
times.

**Blending.** Only the four orthogonal neighbours blend, in the order north, east, south, west.
For each neighbour whose open terrain differs from the square's, the neighbour's floor is stamped
into the square through that side's stencil: `blendArt(grid, side, open, variant)` is a sprite of
the grid's size, see-through outside the stencil, holding `floorArt(grid, open, variant)` inside
it, where `variant` is the neighbour's own variant without the shimmer phase (so what spills is
what the neighbour shows, and never shimmers). Later sides overwrite earlier ones where two
stencils meet at a corner. There is no precedence between terrains: each differing neighbour
spills a little way in, both ways across the edge. A forest counts as its open row, so a mixed
forest square and a plains square do not blend, and a mixed forest square and a grassland square
blend as plains and grassland. Two water squares (ocean and sea lane) never blend. A water
neighbour never spills onto land: for a land square's water neighbour, the terrain used is
`landBeside(map, wx, wy)`, the open terrain of the first land among that water square's four
orthogonal neighbours in the order west, south, east, north (which may be the square itself, in
which case nothing is drawn). A neighbour that is off the map or unexplored by the viewer counts as
the square's own terrain, so nothing of it shows (our own choice; the notes read the map).

**Coasts.** The coast is carried by the water square alone; a land square gets nothing for its
water neighbours. A water square (ocean or sea lane) looks at all eight neighbours and sets a bit
for each that is land (`N=1, NE=2, E=4, SE=8, S=16, SW=32, W=64, NW=128`, as a road's mask; an
unexplored or off-map neighbour counts as water). With no land bit it is drawn as water alone.
With any, its floor layer is instead the floor of `landBeside(map, x, y)`, falling back when none
of the four orthogonal neighbours is land to the first land among north-east, south-east,
south-west, north-west (the land it is painted as), turned by the water square's own phase-free
variant; it blends with its differing orthogonal land neighbours exactly as a land square of that
terrain would (sea lanes and oceans beside it draw nothing); and then the water is laid back on
top in four quadrant pieces, each half the square across. A quadrant's piece is chosen by a
three-bit code from its diagonal and the two orthogonal sides that bound it, `A` being the side
reached clockwise from the diagonal and `B` the other: code = `4 * A + 2 * diagonal + B`, so
north-west `4 * N + 2 * NW + W`, north-east `4 * E + 2 * NE + N`, south-east `4 * S + 2 * SE + E`,
south-west `4 * W + 2 * SW + S`. `COAST_MASKS[grid]` is the eight see-through shapes for the
north-west quadrant, drawn by hand on each grid: code 0 all water; `B` alone (1) land along the
west side with an uneven edge; the diagonal alone (2) a small land corner; `A` alone (4) land
along the north side; both sides with or without the diagonal (5, 7) a rounded inner corner of
land; a side and the diagonal (3, 6) land along that side swelling at the corner; and the three
other quadrants are those shapes rotated once for north-east, twice for south-east, three times
for south-west, which keeps `A` the side clockwise from the diagonal. `coastArt(grid, water,
quadrant, code, variant)` holds the water's floor art (turned by the water square's variant,
shimmer phase included, as today) through the shape, with a line of `wave` one art pixel wide
(two on the 32 grid) along the shape's edge where water meets land: that line is the shallows.
Draw order on a water square: land floor, blends, four coast pieces, then the over layer. River
mouths are W7's.

**Keys.** Floors `floor|grid|open|variant`, 13 x 4 per grid. Blend pieces
`blend|grid|side|open|variant`, at most 4 x 13 x 4 per grid. Coast pieces
`coast|grid|water|quadrant|code|variant`, at most 2 x 4 x 8 x 4 per grid. The over layer is keyed
by `lookKey` as the whole square is today.

**The 16 grid before W3.** `floorArt(16, open, variant)` is the ground `tileArt` draws today
(`ground()` in code, palette colours only) until W3 adds `FLOOR_ART_16`, when it is that; W2 adds
the function and W3 changes its body. The 32 grid uses `FLOOR_ART` as today.

Acceptance (in `render.test.ts`, on a `world({ rows })` fixture named in the test; cell equality
means the reference pixels of that square equal those of the named sprite at the same cells):
- Rows `['~~~~', '~.g~', '~ff~', '~~~~']`: on the plains square (1, 1), the cells inside the east
  stencil equal `floorArt(grid, 'grassland', v)` at those cells (v the grassland square's variant)
  and every other cell equals the square's own composite; on the grassland square (2, 1) the cells
  inside the west stencil equal the plains floor; the forest squares (1, 2) and (2, 2) show the
  plains square's floor nowhere, and (1, 2) shows the grassland floor nowhere. A square whose
  four orthogonal neighbours are its own open terrain equals its composite exactly.
- Rows `['~~~', '~.~', '~~~']` (an island): the water square (1, 0), with land to the south only,
  has its bottom rows equal to the plains floor inside the south-side shapes, a `wave` line above
  them, and water above that; the corner water square (0, 0), with land at its south-east only,
  shows the plains floor in its south-east quadrant's small corner and `wave` beside it; a water
  square with no land neighbour equals its composite, with no `wave` line. The plains square
  itself equals its composite.
- Rows `['...', '.~.', '...']`: the water square's north-west quadrant shows the open-bay shape
  (code 7): plains floor along its north and west sides, water in the middle.
- An explored square beside an unexplored one equals its composite on that side, at the 32 and
  16 grids.
- A counting `drawImage` stub in `render.test.ts` finds, for the island rows at the 32 grid, exactly
  two calls for the plains square, six for each of its four orthogonal water neighbours (floor,
  four coast pieces, over) and six for each corner water square.
- At every zoom every canvas pixel is still a colour of `ART_COLORS`, every sprite is square and
  drawn at a whole multiple of its grid (`test/helpers/reference-canvas.ts` passes unchanged), and
  the reference render still matches the browser pixel for pixel.

Verify: `npm test -- test/unit/ui/pixel-art.test.ts test/unit/ui/render.test.ts test/unit/wiki`;
`npm run check`; `npm run test:e2e` with the baselines updated; screenshots of a coast with a bay
and of a forest edge at 64 px and at 16 px in the pull request.

### W3 — Terrain regenerated: floors and features (R-1042, size L, depends on: W1, W2)

Files: `art/floors/*.png` (13), `art/features/*.png` (10), `scripts/bake-art.py` (floors and
features: shared palettes, a 16-pixel bake), `src/ui/floor-art.ts`, `src/ui/feature-art.ts`,
`src/ui/pixel-art.ts` (`floorArt(16, ...)` and `tileArt` draw the baked 16-pixel ground and
features where they exist; the code-drawn `ground`, `trees` and `relief` remain the fallback),
`test/unit/ui/pixel-art.test.ts`, `docs/ART.md` (anything learned), snapshots, baselines, wiki
fixtures.

Every floor and every feature is generated anew with Codex from the prompt template in
`docs/ART.md`, shrunk, and baked. The look: the thirteen grounds are textured but each in a
clearly dominant colour (its palette colour, which `level` enforces); open plains and prairie carry
faint crop-row or grass-tuft texture, desert dunes and a cactus or two, tundra lichen on pale
ground, marsh and swamp standing water with reeds, arctic drifted snow, ocean a flat deep blue with
sparse crests. The eight forests fill their square with canopy (the ground shows only in small
gaps) and are told apart by their trees: boreal dark spruce, conifer pine, mixed pine among round
crowns, broadleaf round crowns with a touch of autumn, tropical palms, wetland cypress standing in
water, rain forest a dense dark jungle, scrub low thorny bushes on bare ground. Hills are rounded
green-brown rises with a crease of shadow; mountains grey rock with snow on the peaks.

Baking changes: floors are baked against one shared palette of 19 colours for the folder
(`shared=True`, `--palette-size 19`), so that after `level()` adds the thirteen terrain colours the
set is at most 32; features against one shared palette of 32. A 16-pixel copy of each is baked
from the same source against the 32-pixel bake's colours (pixelforge `--palette-name` with a hex
file of those colours, added to the `bake()` flags; keep `--preset sprite` and the magenta key for
features, since `portraits()`'s `--preset background` keeps no see-through cells), levelled as the
32-pixel floors are, and written to the same files as `FLOOR_ART_16` and `FEATURE_ART_16` with no
colours of their own. On the 16 grid `floorArt` and `tileArt` use them, turned by the variant as
the 32 grid turns its art, so the third zoom matches the two nearest. `TWO_ROWS` is left as it is;
W7 removes it with the joins (if W7 has merged first, bake without it).

Acceptance:
- Thirteen floors and ten features are baked at 32 and at 16; `ART_COLORS` stays at or under 255
  and `FLOOR_COLORS` and `FEATURE_COLORS` each have at most 32 entries.
- For every floor at both sizes the commonest colour is its terrain's palette colour (W1's test)
  and covers at least 40% of the cells.
- On the 32 grid each forest feature is opaque over at least 60% of its square; hills and
  mountains over at least 45%. Every feature is distinct from every other, at 32 and at 16.
- Every terrain can still be told from every other at the 16 grid, in every variant (the existing
  tests), and a forest from its open row by the feature alone.
- The sixteen-pixel copies use only colours of the 32-pixel bake.
- Snapshots, e2e baselines and wiki fixtures updated; `scripts/contact-sheet.py terrain 3` and the
  map at 64, 32 and 16 px attached to the pull request.

Verify: `npm test -- test/unit/ui/pixel-art.test.ts test/unit/ui/render.test.ts test/unit/wiki`;
`PIXELFORGE=~/Documents/lib/pixelforge ~/Documents/lib/pixelforge/.venv/bin/python scripts/bake-art.py floors features && git diff --exit-code src/ui/floor-art.ts src/ui/feature-art.ts`
(if the diff is not empty, the pull request says what differs and why); `npm run check`;
`npm run test:e2e`; screenshots as above.

### W4 — Pictorial resource markers (R-1043, size M, depends on: W1)

Files: `art/resources/*.png` (13, new folder), `scripts/bake-art.py` (a `resources` folder: 24
pixels, shared palette of 24, a centring `prepare`, and a 12-pixel copy against the same colours),
`src/ui/resource-art.ts` (new, generated), `src/ui/pixel-art.ts` (`resource`, `ART_COLORS`, keys,
the marker's place in the draw order), `test/unit/ui/pixel-art.test.ts`, `docs/VISUAL_CHECKLIST.md`
(point 3), `docs/ARCHITECTURE.md`, snapshots, baselines, wiki fixtures.

Each of the thirteen resources gets a picture of the thing itself, generated with Codex from
`docs/ART.md`, cut out on magenta, baked at 24 art pixels square with a dark outline so it reads on
any ground. The file stems are the thirteen `RESOURCE_IDS` exactly (`primeCotton.png`,
`silverDeposit.png`, ...), since `bake()` keys pictures by stem and `resource()` looks them up by
id: wheat a sheaf, prime cotton open bolls, prime tobacco a broad leaf, prime sugar canes, minerals
a cluster of crystals, fishery a leaping fish, beaver a beaver on a log, game a stag, prime timber
stacked logs, silver deposit a vein with bright nuggets, ore deposit dark rocks with a rust seam,
oasis a pool with a palm, depleted mine a dark pit with a broken pick. The folder is prepared with
a `centre()` step (the subject centred in its square, not stood on its foot as `cut_out` does) and
the 12-pixel copies are baked against the 24-pixel bake's colours (`--palette-name`, as W3 does).
The private notes have the marker as a picture the size of the square drawn over the forest; so
here, on the 32 grid the 24-pixel picture is drawn at one to one in the middle of the square (cells
x 4 to 27, y 4 to 27), not the old 5 x 5 badge enlarged; on the 16 grid the 12-pixel copy in the
middle (x 2 to 13, y 2 to 13); on the 8 grid nothing, as now. W4 moves the marker's own place in
the draw order: after the feature and the river, before the road (today the road comes first);
W7 settles the rest of the order. The colony screen's square (64 px, the 32 grid doubled) shows
them too without change.

Acceptance:
- Thirteen pictures in `RESOURCE_ART` (24) and `RESOURCE_ART_12`, all distinct at both sizes;
  each 24-pixel picture is opaque over 120 to 460 of its 576 cells and contains the folder's
  darkest colour (the lowest `r + g + b` of `RESOURCE_COLORS`); the 12-pixel copies use only the
  24-pixel bake's colours.
- A square with a resource differs from the same square without on the 32 and 16 grids and not
  on the 8; every opaque cell of the marker lies in the middle 24 x 24 (12 x 12) of the square.
- On a mixed-forest square with the `beaver` resource, the marker's opaque cells are the marker's
  colours (the marker is drawn after the feature); on a plains square with a road and `wheat`, the
  road's cells inside the marker are the road's (the road is drawn after the marker).
- `ART_COLORS` stays at or under 255.
- The manual's `wiki/images/art/resources/*.png` are regenerated and the Gallery page still finds
  every one.
- Snapshots and e2e baselines updated; `scripts/contact-sheet.py resources 4` in the pull request.

Verify: `npm test -- test/unit/ui/pixel-art.test.ts test/unit/wiki`;
`PIXELFORGE=~/Documents/lib/pixelforge ~/Documents/lib/pixelforge/.venv/bin/python scripts/bake-art.py resources && git diff --exit-code src/ui/resource-art.ts`
(if the diff is not empty, the pull request says what differs and why); `npm run check`;
`npm run test:e2e`; the contact sheet.

### W5 — The lost-city seal (R-1044, size S, depends on: W1)

Files: `src/ui/pixel-art.ts` (`rumorSealArt`, `rumor`, `totem`, `miniTileArt`, `detailedTileArt`),
`test/unit/ui/pixel-art.test.ts`, `docs/VISUAL_CHECKLIST.md` (point 3), snapshots, baselines, wiki
fixtures.

A Lost City Rumor is marked with a round gold seal, drawn in code in palette colours by a new
function `rumorSealArt(grid)` (`sealArt` and `SEAL_GLYPHS`, the reports' wax seals, are unchanged).
On the 32 grid it fills the lower left quarter (cells x 0 to 15, y 16 to 31): a round 16 art
pixels across in `yellow`, shaded `orange` toward the lower right, with an `ink` rim and a glint
of `white` at the upper left, and a stepped pyramid of three steps pressed into it in `wood`. On
the 16 grid the lower left quarter again (x 0 to 7, y 8 to 15): a round of eight with a two-step
pyramid. On the 8 grid the existing 2 x 2 dot at (1, 5), in `yellow`. It is drawn after the
resource marker (W4) and before the road, so where a square has both the seal stands over the
marker's lower left corner. The totem (`totem`, colony view only) moves to the upper left quarter:
stamped at (2, 0) on the 16 grid, so that on the 32 grid it lies in x 4 to 13, y 0 to 15. The seal
replaces the broken arch.

Acceptance:
- A square with a rumor differs from the same square without at all three grids; the seal's cells
  use only `yellow`, `orange`, `wood`, `ink` and `white`.
- At 32 every opaque cell of the seal lies in the lower left quarter and it is round: its widest
  rows are the middle ones and its top and bottom rows are narrower than eight cells; at 16 the
  same within x 0 to 7, y 8 to 15.
- A square with a resource and a rumor shows the seal whole over the marker's corner; the totem
  (upper left quarter) shares no cell with the seal.
- Snapshots, baselines and the wiki fixture `terrain/plains-rumor.png` updated;
  `scripts/contact-sheet.py terrain 4` (the rumor square) in the pull request.

Verify: `npm test -- test/unit/ui/pixel-art.test.ts test/unit/wiki`; `npm run check`; `npm run test:e2e`.

### W6 — Colony names on the map (R-1045, size M, depends on: nothing)

Files: `src/ui/pixel-art.ts` (`LABEL_GLYPHS`, `labelArt`, `labelText`), `src/ui/render.ts`
(`renderPieces`), `test/unit/ui/pixel-art.test.ts`, `test/unit/ui/render.test.ts`,
`docs/VISUAL_CHECKLIST.md` (new point 14), snapshots, baselines.

Each colony's name is written under its square in a pixel face, as pixel art in the palette (never
canvas text, which would blend). The private notes put the name in the body face, left-aligned a
little in from the square's left edge on the first row below the square, in white with a dark
second colour, at the nearest zoom only; the population and the flag are already on our colony
picture. A 5 x 7 upper-case face covering A to Z, the digits, space, hyphen, apostrophe and full
stop is added beside `TAB_GLYPHS` (which stays for plates). `labelArt(ch)` is a 10 x 10 sprite: the
glyph in `white` at (2, 1), and `ink` on every see-through cell that has a glyph cell among its
eight neighbours (the notes do not settle shadow against outline; the outline is the planner's
choice, since it reads on sand as well as on sea). `labelText(name)` upper-cases the name and strips
diacritics (NFD, drop combining marks) so that an accented name is written in plain letters; a
letter that does not decompose (Ø, Æ, ß, Ł) comes out as a question mark, which is accepted; the
text is cut at 16 characters. `renderPieces` draws the labels after the unit loop, as the last thing
before the dragged piece, for every colony with `y0 - 1 <= y < y1` and `x0 - 2 <= x < x1` that
passes the same explored-or-revealed test as the colony loop (so a colony just above the view still
labels the top row), at squares of 32 px and up only (the two nearest zooms), one sprite per letter
seven art pixels apart, each sprite at `t / 32` screen pixels per art pixel (10 px at a 32 px
square, 20 at 64, 30 at 96), the run's left edge four art pixels in from the square's left edge and
its top at the square's bottom edge. Hidden-terrain view (`showHidden`) draws no labels, as it draws
no pieces. Native settlements get no label (the owner's choice).

Acceptance:
- The face has a glyph for every character listed, each 5 x 7, all distinct; an unknown character
  comes out as a question mark.
- In `render.test.ts`, on the existing `scene()` fixture with the colony renamed "Jamestown", at
  the 32 px zoom the row of squares below the colony holds white cells, the first of them four to
  six art pixels in from the square's left edge, and at the 16 px zoom it holds none; the name
  "Québec" is written as QUEBEC; a colony at x = 0 whose label would run past the canvas edge is
  clipped by the canvas, not moved; a colony on the row just above the view still shows its label
  in the top row.
- The reference render still matches the browser pixel for pixel at every zoom; sheet and map
  baselines updated.
- A screenshot of three named colonies at 64 px and at 32 px in the pull request.

Verify: `npm test -- test/unit/ui/pixel-art.test.ts test/unit/ui/render.test.ts`; `npm run check`;
`npm run test:e2e`.

### W7 — Canopy and relief joins, river mouths, overlay order (R-1046, size M, depends on: W2, W3)

Files: `src/ui/pixel-art.ts` (`TileLook`, `overArt`, `tileArt`, `detailedTileArt`, `river`),
`src/ui/tiles.ts` (`lookOf`, `lookKey`), `src/ui/render.ts` (`joinMask`, `mouthMask`),
`scripts/bake-art.py` (`TWO_ROWS` dropped), `src/ui/feature-art.ts` (re-baked without the second
row), tests, snapshots. Map generation is not touched.

`TileLook` gains `joinMask`: bits `N=1, E=2, S=4, W=8` for each orthogonal neighbour the feature
joins. A forest joins a neighbour that is any forest but scrub (scrub stands alone, low on bare
ground); hills join hills only and mountains mountains only; open ground and water have no joins.
An unexplored or off-map neighbour never joins. On the 32 and 16 grids, in the over layer before
the feature's own picture, the picture (turned as the feature itself is) is drawn again once per
set bit, moved half a square toward that side and clipped to the square, so the canopy or the
ridge runs on across the edge instead of stopping at a row of bare ground. `TWO_ROWS` in
`scripts/bake-art.py` goes (its second row served this purpose) and `art/features` is re-baked.

`TileLook` also gains `mouthMask`, bits `N=1, E=2, S=4, W=8` on a water square for each orthogonal
land neighbour that has a river whose own `riverMask` bit points at this square (generated maps
never put a river on a water square, so the mouth is read from the land beside it). In the over
layer the water square draws a stub of `brightBlue` from that side to the middle of the square:
three art pixels wide on the 32 grid for a major river on that neighbour and two for a minor one,
two and one on the 16 grid, nothing on the 8 grid. Land rivers keep today's strokes. The colony
screen passes 0 for both masks.

The over layer's order is: joins, the feature, furrows, the river or the mouth stubs, the resource
marker, the rumor seal, the road, the totem. The river runs over the trees; the marker and the seal
stand over everything but the road.

Acceptance (in `render.test.ts`, on `world({ rows })` fixtures named in the test):
- Rows `['ff', 'f.']`: the forest square (0, 0) has forest colours in cells of its bottom rows and
  its right columns where the same square with `joinMask` 0 has floor colours; the square (0, 1),
  whose east neighbour is plains, has `joinMask` with only N set. Hills beside mountains have
  `joinMask` 0.
- Two adjacent mixed-forest squares show no floor colour in the sixteen cells nearest the middle
  of their shared edge on the 32 grid (eight either side).
- Rows `['~r', '~.']` with the river square's `riverMask` pointing west: the water square (0, 0)
  has `mouthMask` E and shows `brightBlue` from its east edge to its middle; the water square
  (0, 1) has `mouthMask` 0 and shows none.
- `lookKey` includes both masks; the colony screen's call passes 0 and its square is unchanged.
- Snapshots, baselines and wiki fixtures updated.

Verify: `npm test -- test/unit/ui/pixel-art.test.ts test/unit/ui/render.test.ts test/unit/wiki`;
`PIXELFORGE=~/Documents/lib/pixelforge ~/Documents/lib/pixelforge/.venv/bin/python scripts/bake-art.py features && git diff --exit-code src/ui/feature-art.ts`;
`npm run check`; `npm run test:e2e`; a screenshot of a wood of mixed kinds and a river mouth at 64 px.

## Open questions and decisions

Decisions the owner made on 2026-10-11:
- **Art scope:** terrain (floors and features), resource markers and the rumor mark are
  regenerated; colony, settlement and unit pictures stay. Rejected: redoing places too, or
  everything.
- **Palette:** the fourteen land and sea entries are retuned (W1) so the minimap and the far zooms
  agree with the new art. Rejected: leaving the palette and letting only the 32-grid art carry the
  new colours.
- **Labels:** colonies only, in a pixel face. Rejected: settlements too; no labels.
- **Technique:** the drawing follows the private notes as closely as the pixel grid allows (the
  owner's instruction): four-neighbour stencil blending in a fixed order with no precedence, coasts
  carried by the water square as quadrant masks, canopy and relief joins by a four-bit mask, the
  marker over the forest, the name under the square. The planner's first draft (a precedence order
  and wobbly bands seeded by the variant) was dropped for it.

Planner's choices, with the alternative rejected:
- **Two layers and cached pieces** (W2) rather than putting the neighbours into `TileLook`, which
  would multiply the cache keys by thousands; the pieces are keyed by side, terrain and variant.
- **Unexplored and off-map neighbours never blend, join or spill** (W2, W7): the notes read the
  whole map, which would show a terrain through the vellum.
- **Blending on the 16 grid as well as the 32** (W2): the notes blend at their one full-size zoom,
  which is the size of our 16 grid; the 32 grid is the same picture twice as large.
- **The 16 grid draws baked copies of the new art** (W3) rather than keeping the code-drawn trees:
  the third zoom should not be a different style from the two nearest.
- **The rumor mark is a gold seal with a pyramid** (W5), drawn in code: it ties to the wax seals
  the theme already uses, and needs no picture. The notes have a full-square picture; its content
  is not in them.
- **Label outline rather than shadow** (W6): not settled by the notes.
- **A coast with land only at its corners is painted as the first such land** (W2): the notes
  leave the square as water there; the corner would otherwise have nothing to show.
- **River mouths are read from the land beside the water** (W7): generated maps never put a river
  on a water square, and map generation is out of scope.

If a worker meets a question this spec does not settle: build the smaller reading, and say so in
the pull request.
