# Rivers and mountains: spec for R-1047 to R-1048

Written by `/plan` on 2026-10-11. Status: approved.

**The request, in the owner's words:** we recently improved the land graphics and the owner likes
them, but the rivers are still really bad: they are just blue lines. In the owner's reference
screenshot (a classic map of this kind, never to be named) the rivers actually look like rivers
and work with the neighbouring squares: a winding watercourse of medium blue with a broken pale
rim along both banks, a little wider where it is a major river, bending smoothly from square to
square, joining other rivers and running out into the sea. The same goes for the mountains: ours
are squat grey lumps with a dab of snow, and a range of them is a grey mush; the reference has
tall, sharp, snow-capped peaks with a dark outline that run on into one another as a ridge.

## Goal

A river is drawn as one of sixteen pieces chosen by which of its four sides it continues to, in
two widths, winding and rimmed, so that rivers on neighbouring squares meet exactly and a river
reads as a river at every zoom; its mouth on the water is the same stroke opening into the sea.
Mountains are tall, sharp, snow-capped peaks that fill their square, and a range of them reads
as one ridge. Everything stays palette-indexed pixel art drawn by whole pixels, as
`docs/VISUAL_CHECKLIST.md` requires, and every picture is our own (constraint C1).

## Non-goals

- No change to where rivers lie: map generation (`src/engine/mapgen/generate.ts`) is not touched,
  water squares still never carry a river, and a mouth is still read from the land beside the
  water (`mouthMask` in `src/ui/render.ts`, R-1046).
- Hills keep their picture and their joins (the owner's decision). The eight forests, the floors,
  the coasts and blends, the resource markers, the seal, roads and furrows are untouched.
- No new palette colour; no change to the minimap (it does not show rivers), to the colony
  screen's layout, or to any game rule or yield.
- No change to `TileLook`, `lookKey` or the sprite cache keys: everything a river piece needs
  (`river`, `riverMask`, `variant`, `mouthMask`) is already in the look.

## Rules and sources

These are looks, not game rules; the technique follows the private notes where they have one,
and the look itself is this game's own choice made from the owner's reference. Workers build from
this spec alone and never name the notes' subject or quote them (CLAUDE.md, the public-repo rule).

- **A river is one picture of sixteen, chosen by which of the four orthogonal neighbours
  continue it**, in two separate sets for a minor and a major river; diagonals never count. From
  the private notes. (Here the sixteen are drawn in code from five shapes turned, since the pixel
  grid allows that exactly; the notes keep sixteen pictures.)
- **A river square whose neighbours continue it on no side is drawn as the four-way piece.** From
  the private notes.
- **A neighbour continues the river if it has a river of either kind, or is water.** The first
  half from the private notes; the water half is this game's reading from R-1046, since generated
  maps never flag water as river.
- **The river is drawn over the forest and over the hills or mountains**, under the resource
  marker, the seal, the road and the totem. From the private notes; the order was settled in
  R-1046 and does not change.
- **A river's mouth is drawn on the water square, one piece per side from which a river runs in,
  in the river's own width.** From the private notes (which draw it only on water flagged as
  river; here on any water a river's own piece points at, R-1046's reading).
- **The river's look** (a medium-blue body with a broken pale rim, winding, three and five art
  pixels wide on the 32 grid, a pool at a source and at a mouth): this game's own choice, from the
  owner's reference. The notes say nothing of what the pictures hold.
- **Hills and mountains each take one picture of sixteen by their neighbours of the same kind.**
  From the private notes. Here that is simplified, by the owner's decision, to one picture per
  kind drawn again toward each neighbour of its kind (`joinMask`, R-1046): generating sixteen
  pictures that agree at their edges is not something the art pipeline can promise.
- **What a mountain looks like** (tall sharp peaks, snow on the upper half, a dark outline, lit
  from the upper left, filling the square to its sides): this game's own choice, from the owner's
  reference and `docs/ART.md`.

## How this is drawn today (what both workers should know)

`docs/specs/map-art-redesign.md` ("How the map is drawn today" and the W2, W3 and W7 sections)
describes the two grids, the two layers, the baked art and the masks. In short:

- A square's over layer is `overArt(look, grid)` in `src/ui/pixel-art.ts`, drawn in this order:
  joins, the feature (forest, hills or mountains), furrows, the river or the mouths, the resource
  marker, the seal, the road, the totem. On the 32 grid the river, like the furrows, the road and
  the totem, is today the 16-pixel stroke enlarged two to one (`enlarge`); the feature is the
  baked 32-pixel picture.
- `river(s, look)` draws a straight `line` of `brightBlue` from the middle of the square to the
  middle of each side set in `riverMask` (bits N=1, E=2, S=4, W=8), 2 wide for a minor river and 3
  for a major, and a 4 x 4 box when the mask is 0. `mouths(s, mask)` draws a plain box from each
  side in `mouthMask` to the middle, by the `MOUTH` table. `miniTileArt` (the 8 grid) draws a
  2 x 2 dot. `riverMask` is worked out in `src/ui/render.ts`; the colony screen passes the same
  mask through `lookOf`.
- Mountains are `FEATURE_ART.mountains` (32) and `FEATURE_ART_16.mountains` (16) in
  `src/ui/feature-art.ts`, baked by `uv run scripts/bake-art.py features` from
  `art/features/mountains.png` in one shared palette of 32 colours for the folder, stamped at
  (0, 0) by `feature()`, mirrored by `variant & 1`, never upended. `joined()` draws the picture
  again half a square toward each side in `joinMask` under the picture itself; `joins()` says
  mountains join mountains. The 8 grid stamps a small code-drawn peak.
- `scatter`, `hash`, `line`, `box`, `dot`, `stamp`, `at`, `blank`, `laid`, `enlarge` and
  `rotate` are the drawing primitives; `INK` names the palette: `blue` is `#2f5fc4` (27),
  `brightBlue` `#4a8fe8` (10), `sea` `#1f2f8e` (8), `wave` `#3d58b0` (9).
- Tests that pin the river today and will be rewritten: `test/unit/ui/pixel-art.test.ts` ("shows
  rivers, roads, plowing...", "a river runs over the trees...", "what stands on a square is laid
  in order..." where it counts `brightBlue`, "stands whole over the corner of a resource
  marker..."), `test/unit/ui/render.test.ts` ("draws the mouth of a river on the water it runs out
  into..."), the unit snapshots, the e2e visual baselines, and the manual's fixtures
  `wiki/images/art/terrain/plains-river.png` and `plains-major-river.png`
  (`test/unit/wiki/images.test.ts`). Tests that pin the mountains: "there is a picture of each
  forest, of hills and of mountains..." (cover thresholds), the join tests, the distinctness
  tests, the snapshots and baselines, and `wiki/images/art/terrain/mountains.png`.
- The art pipeline is `docs/ART.md`: Codex generates a source picture from the prompt template
  there, `uv run scripts/shrink-art.py` takes the grain out, `uv run scripts/bake-art.py <folder>`
  writes the `*-art.ts` file, a second bake must leave no diff, and `uv run
  scripts/contact-sheet.py terrain 3` makes the sheet a pull request shows. pixelforge 0.2.0 is on
  PATH on this machine (`pixelforge --version`), as is `codex`.

## Shared surfaces

| Surface | Changed by | Order |
|---|---|---|
| `src/ui/pixel-art.ts`: `river`, `mouths`, `MOUTH`, `miniTileArt`, the `overArt` comment | W1 only | any |
| `src/ui/feature-art.ts`, `art/features/mountains.png` | W2 only | any |
| `test/unit/ui/pixel-art.test.ts` | both, in different tests; expect a small merge conflict, resolve on `origin/main` | any |
| Unit snapshots, e2e visual baselines, `wiki/images/art/terrain/*`, `docs/art/*` | both; whichever merges second brings `origin/main` in and regenerates them all again before its review | any |
| `docs/VISUAL_CHECKLIST.md` points 3 and 15, `docs/ARCHITECTURE.md` (the `pixel-art.ts` paragraph), `docs/ART.md` | W1 the river sentences, W2 the mountain sentences | any |

The two items are independent and run in parallel.

## Work items

### W1 — Rivers by their neighbours (R-1047, size M, depends on: nothing)

Files: `src/ui/pixel-art.ts` (`river`, `mouths`, `MOUTH` dropped, `miniTileArt`, `overArt`
and its comment), `test/unit/ui/pixel-art.test.ts`, `test/unit/ui/render.test.ts`,
`docs/VISUAL_CHECKLIST.md` (points 3 and 15), `docs/ARCHITECTURE.md`, snapshots, baselines,
`wiki/images/art/terrain/plains-river.png`, `plains-major-river.png`, `docs/art/rivers-64.png`,
`docs/art/rivers-32.png`.

**The piece.** A river on a square is drawn for the grid it is on (32, 16 or 8 art pixels; no
longer the 16-pixel stroke enlarged on the 32 grid). It is one of sixteen pieces by `riverMask`,
which are five shapes turned: an end (one side), a straight (two opposite sides), a bend (two
adjacent), a tee (three) and a cross (four). Mask 0 draws the cross. The body is `blue`; its
width `w` is 3 for a minor river and 5 for a major one on the 32 grid, 2 and 3 on the 16 grid,
1 on the 8 grid.

- **An arm** runs from the middle of each side in the mask to the middle of the square. Where it
  crosses the side it occupies exactly `w` cells centred on the side: on the 32 grid cells 14 to 16
  of that edge row or column for `w` 3 and 13 to 17 for `w` 5; on the 16 grid 7 to 8 and 6 to 8; on
  the 8 grid cell 3. Two neighbouring squares therefore meet cell for cell. Each arm winds: its
  centre line is the straight line from the edge to the middle pushed sideways by `a · sin(π t)`
  (`t` 0 at the edge, 1 at the middle; `a` is 2 on the 32 grid, 1 on the 16, 0 on the 8), to the
  right of the way in when the arm comes from the north or the east and to the left when it comes
  from the south or the west, so that opposite arms make an S and the piece for a mask turned one
  side clockwise is the piece for the unturned mask turned a quarter turn. `variant & 1` mirrors
  the push for the whole piece, so a long river is not one repeated wave. The arm is drawn as
  `line` is today: a `w` x `w` box at every step along the centre line, rounded by whole cells.
- **The middle** gets a disc of `blue` where the arms meet: diameter `w + 1` on the 32 and 16
  grids (so a bend is rounded), and where there is one arm only (a source) or none, the disc is a
  pool of diameter `w + 4` on the 32 grid, `w + 2` on the 16, nothing more on the 8.
- **The rim.** After the body, every cell of the square that is not body, touches a body cell on
  one of its four sides, and has `x + y` even is painted `brightBlue`. That is the broken pale
  rim along both banks; no two rim cells touch, and the rim never covers the body. The 8 grid
  draws no rim.
- **Over the trees.** The order of the over layer does not change: the piece is laid after the
  feature and the furrows and before the marker, so a river still crosses a full canopy, now
  with its rim.
- **Mouths.** On a water square `mouths` draws, for each side in `mouthMask`, the end-shaped arm
  from that side to the middle in that river's width (the major bits 16 to 128 say which), with
  the pool at the middle and the rim as on land (it reads as foam on the sea), on the 32 and 16
  grids; the 8 grid draws none, as today. `MOUTH` goes.
- **The 8 grid** draws a 1-cell `blue` line from cell (3, 3) to the middle of each side in the
  mask (the cross for mask 0), in place of today's 2 x 2 dot.

Acceptance (unit, `pixel-art.test.ts` unless said; `blue` means cells of `INK.blue`, `pale`
cells of `INK.brightBlue`):
- For every mask 0 to 15, both kinds and both grids 32 and 16: each side in the mask has exactly
  the `w` cells named above `blue` in its edge row or column and no other `blue` or `pale` cell
  there; a side not in the mask has no `blue` cell on its edge. Mask 0 draws the same cells as
  mask 15. A major river has more `blue` cells than a minor one for the same mask.
- The `blue` cells of the piece for a mask turned one side clockwise (N to E, E to S, S to W,
  W to N) are the `blue` cells of the piece for the unturned mask turned a quarter turn
  clockwise, for variant 0 and every mask; the `blue` cells of variant 1 are those of variant 0
  mirrored left to right, for every mask whose sides are symmetric about the vertical axis (N,
  S, N|S, E|W and 15).
- Every `pale` cell touches a `blue` cell on a side, is not itself `blue`, and touches no other
  `pale` cell on a side; for the straight pieces (N|S and E|W) at least a third of the cells
  beside the body on each bank are `pale`.
- A piece with one arm (mask 1, 2, 4 or 8) has more `blue` cells in the middle 10 x 10 of the
  square than the straight piece has there (the pool); no `blue` or `pale` cell lies on an edge
  the mask does not name.
- Over every forest, hills and mountains, at every variant and both grids, every `blue` and
  every `pale` cell of the bare piece shows unchanged (the existing "runs over the trees" test,
  widened to both inks).
- On the 8 grid a river is a line of single `blue` cells from (3, 3) to the middle of each side
  in the mask, and mask 0 is the cross.
- Mouths (`render.test.ts`, the existing fixtures `['~r', '~.']` and `['~R', '~.']` and the
  ringed one): on the water square the east edge holds the river's `w` cells of `blue` centred,
  the `blue` cells reach the middle of the square and widen there into the pool, the west half of
  the square holds no `blue` or `pale`, the major river's stub is wider than the minor's, and
  where the stub meets the land square's own piece every edge cell of one is an edge cell of the
  other. A river the viewer has not seen still has no mouth; the 8 grid still draws none.
- The seal still stands whole over the river (the existing test, widened to both inks), and the
  colony screen's 64-pixel square is the 32 grid doubled.
- `docs/VISUAL_CHECKLIST.md` points 3 and 15 and the `pixel-art.ts` paragraph of
  `docs/ARCHITECTURE.md` describe the pieces, the rim and the mouths. Snapshots, e2e baselines and
  the two wiki fixtures updated. `docs/art/rivers-64.png` and `docs/art/rivers-32.png` are
  screenshots of one river basin with a source, a bend, a tee, a stretch through forest and a
  mouth, at 64 and 32 px (the `?seed=7&reveal` map in the browser, or a `world({ rows })` fixture rendered
  through `test/helpers/reference-canvas.ts` and written with `encodePng`, as the worker prefers), attached
  to the pull request.

Verify: `npm test -- test/unit/ui/pixel-art.test.ts test/unit/ui/render.test.ts test/unit/wiki`;
`npm run check`; `npm run test:e2e`; the two screenshots.

### W2 — Mountains regenerated as a ridge (R-1048, size M, depends on: nothing)

Files: `art/features/mountains.png` (replaced), `src/ui/feature-art.ts` (re-baked),
`docs/ART.md` (a "What a mountain needs" note under "What a floor and a forest need", and the
`art/features` row), `test/unit/ui/pixel-art.test.ts` (cover and snow thresholds), snapshots,
baselines, `wiki/images/art/terrain/mountains.png`, `docs/art/mountains-64.png`,
`docs/art/mountains-32.png`.

The mountain picture is generated anew with Codex from the prompt template in `docs/ART.md`
(the cut-out style paragraph, with `art/features/hills.png` and `art/features/boreal.png`
attached as style references), shrunk and baked. The subject, in the prompt's words or near
them: a short mountain range of three or four tall, sharp, triangular peaks standing side by
side and overlapping, spanning the full width of the image and rising nearly to its top, their
feet on the bottom edge; snow in white (`#f2f2f2`) over the upper half of each peak; rock below
in grey (`#8d8a84`) and dark grey (`#5f5b57`) with earth (`#7c6b45`) at the foot; the right-hand
face of every peak in shadow; a dark outline (`#111111`, about 40 pixels wide) round the range
and between the peaks; flat colour areas only; no trees, no sky, no clouds, no ground showing
beside the range. Send a picture back (as `docs/ART.md` says) if the peaks are rounded, if the
range does not reach both sides, if the snow is a cap rather than the upper half, or if the
rock has gradients. Then `uv run scripts/bake-art.py features` (the folder shares one palette,
so the other nine features re-letter and may shift a shade; look at the contact sheet and keep
them if they still pass their tests), bake again and check there is no diff, update snapshots
and fixtures as `docs/ART.md` steps 4 to 8 say.

`joins` keeps mountains joining mountains, and `joined` is unchanged: with the range filling its
square to both sides and its foot on the bottom row, the half-square copies toward each
neighbour fill the sky between peaks and the range runs on. Hills are not touched.

Acceptance (unit, `pixel-art.test.ts`):
- `FEATURE_ART.mountains` is opaque over at least 60% of its 32 x 32 cells (hills stay at 45%);
  its topmost opaque cell is in the first three rows; columns 0 and 31 are each opaque in at least
  eight cells of the lower half; the bottom row is opaque in at least 24 cells.
- Snow: cells whose colour has every channel at or above 200 cover at least 12% of the square;
  outline: cells with every channel under 48 cover at least 8%.
- `FEATURE_ART_16.mountains` uses only colours of the 32-pixel bake and is opaque over at least
  55% of its cells; the ten features are still distinct from one another at 32 and at 16, and a
  forest from its open row (the existing tests). `FEATURE_COLORS` has at most 32 entries and
  `ART_COLORS` at most 255.
- Two adjacent mountain squares, east to west and north to south, show no floor colour in the
  sixteen cells nearest the middle of their shared edge on the 32 grid (the forest test of
  R-1046, extended to mountains in `render.test.ts`).
- `docs/VISUAL_CHECKLIST.md` point 3 says what a mountain looks like; `docs/ART.md` says what a
  mountain needs. Snapshots, e2e baselines and the wiki fixture updated; `uv run
  scripts/contact-sheet.py terrain 3` and `docs/art/mountains-64.png` and
  `docs/art/mountains-32.png` (a range of at least four squares with a bend in it, at 64 and
  32 px) attached to the pull request.

Verify: `uv run scripts/bake-art.py features && git diff --exit-code src/ui/feature-art.ts`;
`npm test -- test/unit/ui/pixel-art.test.ts test/unit/ui/render.test.ts test/unit/wiki`;
`npm run check`; `npm run test:e2e`; the contact sheet and the two screenshots.

## Open questions and decisions

Decisions the owner made on 2026-10-11:
- **Mountains: a new picture, the joins kept.** Rejected: a picture per neighbour shape as the
  notes have (ten mirrored shapes generated with Codex, size L, with no way to make generated
  pieces agree at their edges); keeping the picture and changing only the joins.
- **The river look: a medium-blue body with a broken pale rim**, 3 and 5 wide on the 32 grid.
  Rejected: a light body with a solid dark bank line; wider strokes (4 and 7).
- **Hills are left alone.** Rejected: regenerating hills in the same item.

Planner's choices, with the alternative rejected:
- **The sixteen river pieces are drawn in code from five shapes turned** rather than generated
  as pictures: a river must meet its neighbour cell for cell at the side, which geometry
  guarantees and a generated picture does not. Hand-written rows of text art (as the seal is)
  were rejected for the same reason and for their bulk (ten pieces on two grids).
- **Mask 0 draws the cross**, as the notes do, rather than today's box; generated maps never
  make such a square, so nothing on a real map changes.
- **A pool at a source and at a mouth** is this game's own touch; the notes say nothing of what
  an end piece holds. The alternative, an arm that simply stops at the middle, looked cut off.
- **The rim is on the parity of `x + y`** so that it is broken everywhere and never doubles up,
  at the cost of a doubled or missing rim cell at a square's seam, which reads as a ripple.
- **The mouth keeps R-1046's reading** (drawn on any water a river's own piece points at); the
  notes draw it only on water flagged as river, which generated maps never make.
- **The whole features folder is re-baked** for one new picture, since the folder shares a
  palette; the nine others may shift a shade and re-letter, which the contact sheet and the
  existing tests judge.

If a worker meets a question this spec does not settle: build the smaller reading, and say so in
the pull request.
