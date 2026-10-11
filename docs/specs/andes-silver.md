# Silver in the Andes, and a marker that shows on mountains: spec for R-1052 to R-1053

Written by `/plan` on 2026-10-11. Status: built.

**The request, in the owner's words:** there should be more silver in the Andes mountains on the
America map. I only see one in all of South America?

## Goal

The America map has seven silver deposits along the Andes instead of three, and a silver deposit
can be picked out at a glance on the mountains it lies on.

## What was found

- The extras chart (`AMERICA_EXTRAS` in `src/engine/data/america.ts`) holds five silver deposits:
  three in the Andes at (30, 49), (31, 51) and (30, 53), and two in Mexico at (9, 23) and (14, 23).
  A revealed game draws all five. Three among the forty mountain squares of South America is what
  the random generator's density (`MAPGEN.landResourceChance`, 7%) would give; the owner wants
  more than that there.
- The owner saw one because the marker hides. A silver deposit lies only on mountains
  (`RESOURCE_TERRAINS.silverDeposit`), and its picture is drawn in the mountains' own colours: of
  its 354 opaque cells at 24 pixels, 175 are `#5e5852`, the very grey of the mountains' rock in
  `src/ui/feature-art.ts`, 127 are the two pale colours of their snow, and only 37 are ink.

## Non-goals

- No silver added anywhere but the Andes: Mexico keeps its two deposits and the mountains of North
  America keep none (the owner's decision).
- No change to any rule: what a silver deposit yields, where a resource may lie, depletion, what
  the native peoples trade and teach (`src/engine/data/resources.ts`, `yields.ts`,
  `native-economy.ts` and `learning.ts` are read, never changed). The native side counts mountains,
  not deposits, so nothing about the settlements moves.
- No change to the random generator: its maps stay what they are for every seed (the digest test
  in `test/unit/engine/mapgen/generate.test.ts` stays green untouched).
- No change to the ground, relief or rivers charts, to the settlement sites or to the starts.
- Only the `silverDeposit` picture is redrawn. The other twelve markers keep their source
  pictures; the marker's size, its place in the square and its place in the drawing order stay.
- No marker at the farthest zoom (the 8-pixel grid), as now.
- No save version bump: a saved game carries its own squares, so an old America save keeps its
  three Andes deposits and draws them with the new marker.

## Conventions used in this spec

Coordinates are playable ones (x 0 to 55, y 0 to 69; add 1 for the grid), as in
`docs/specs/america-map.md`. **Luminance** of a colour is
`0.299 r + 0.587 g + 0.114 b` on channels of 0 to 255. A marker's **rim** is its opaque cells that
are 4-adjacent to a see-through cell or lie on the edge of the picture.

## Rules and sources

- **Seven silver deposits in the Andes**, on the squares W1 lists. The owner's decision
  (2026-10-11); the squares are the planner's choice. The private notes give only the peoples'
  sites and the four starting squares for this map, so what it holds is this game's own work,
  drawn after the real geography (the silver country of Peru and of the high plateau south of
  Lake Titicaca). This departs from the generator's density on purpose, for the Andes alone; the
  map as a whole stays inside the band its test allows (100 land resources on 1388 solid squares,
  7.2%, against 5% to 9%).
- **A silver deposit lies only on mountains** and adds 2 silver (`RESOURCE_TERRAINS`,
  `RESOURCE_BONUS`; RULES.md "Resources"). Kept.
- **A special resource is marked by a picture of the thing itself** in the middle of its square,
  24 art pixels on the 32 grid and a 12-pixel copy on the 16 grid, with a dark outline, drawn
  over the mountains and under the road (`docs/VISUAL_CHECKLIST.md` points 3 and 15, R-1043).
  Kept. What changes is the picture: this game's own art, made as `docs/ART.md` says.

## Shared surfaces

| Surface | Changed by | Order |
|---|---|---|
| `src/engine/data/america.ts`, `AMERICA_EXTRAS` rows 41, 45, 55 and 58 | W1 | - |
| `test/unit/engine/mapgen/america.test.ts` and its snapshot | W1 | - |
| `art/resources/silverDeposit.png`, `src/ui/resource-art.ts` (generated), `wiki/images/art/resources/` | W2 | - |
| `test/unit/ui/pixel-art.test.ts` and the art snapshots of `test/unit/ui` | W2 | - |
| The map baselines (`test/e2e/__snapshots__/visual.spec.ts`), the manual's screenshots (`wiki/images/screens`), `docs/art/map-zoom*.png`, `docs/art/resources-zoom1.png`, `docs/art/sheet-resources.png` | both | whichever merges second brings `origin/main` in and regenerates them again |

The two items share no source file and run in parallel. Each posts a board note when its pull
request opens, saying that the map baselines move.

## Work items

### W1 — Four more silver deposits in the Andes (R-1052, size S, depends on: nothing)

Files: `src/engine/data/america.ts` (`AMERICA_EXTRAS` only),
`test/unit/engine/mapgen/america.test.ts` and its snapshot, the map baselines and screenshots
that show the Andes, `docs/RULES.md` or the manual only where they count the map's silver (grep
first; today neither does).

Put `v` on the extras chart at (26, 41), (29, 45), (30, 55) and (30, 58). Each is a bare mountains
square today (relief `A`, extras `.`). With the three there already, the Andes then hold, north to
south: (26, 41) in northern Peru; (29, 45) beside the ore deposit at (30, 45), so one colony on the
hills at (30, 46) works silver and ore; (30, 49), (31, 51), (30, 53) and (30, 55) as a close run
either side of Lake Titicaca, where a colony on the hills at (31, 50), (31, 52) or (31, 54) works
two of them; and (30, 58) to the south.

Acceptance:
- On the America map the squares of South America (y >= 35) that hold a silver deposit are
  exactly (26, 41), (29, 45), (30, 49), (31, 51), (30, 53),
  (30, 55) and (30, 58); the map holds nine silver deposits in all, the other two at (9, 23) and
  (14, 23).
- Every one of the nine is on mountains, and no two are 8-adjacent.
- Each of the hills squares (30, 46), (31, 50), (31, 52) and (31, 54) is solid land with no
  settlement site on it or 8-adjacent to it, and has a silver deposit 8-adjacent: (31, 50),
  (31, 52) and (31, 54) each have two.
- Nothing else on the map moves: the ground, relief and rivers charts are unchanged, and the
  extras chart differs from today's in exactly those four cells (the snapshot's diff shows it).
- Every existing test of `america.test.ts` passes unchanged, the density one among them.
- `generateWorld` is untouched and its digest test passes unchanged.

Verify: a new test "holds seven silver deposits along the Andes" in
`test/unit/engine/mapgen/america.test.ts`, written first and failing on today's chart;
`npm test -- test/unit/engine/mapgen/america.test.ts -u` for the chart snapshot, then read the
snapshot's diff; `npm run check`; `npm run test:e2e` with the map baselines regenerated as
`docs/ART.md` steps 7 and 8 say (the 8-pixel zoom draws no marker, so `zoom0` and
`docs/art/america-zoom0.png` must not move: say so in the pull request if they do); a screenshot
of the Andes from a revealed game (`/?reveal&still`, Start a Game in America) in the pull request.

### W2 — A silver marker that shows on mountains (R-1053, size M, depends on: nothing)

Files: `art/resources/silverDeposit.png` (replaced), `src/ui/resource-art.ts` (generated, never
edited by hand), `test/unit/ui/pixel-art.test.ts`, the art snapshots under `test/unit/ui`,
`wiki/images/art/resources/silverDeposit.png` (regenerated), `docs/VISUAL_CHECKLIST.md` (point 3,
one sentence), `docs/ART.md` (the `art/resources` row, one clause), the map baselines and
screenshots, `docs/art/resources-zoom1.png` and `docs/art/sheet-resources.png`.

Draw the silver deposit again so that it is told from the mountains under it by dark against
light, not by its shape alone: a heap of bright silver (ingots or nuggets, white with cool pale
shading) seated in a solid mass of near-black rock, with the heavy ink outline every marker has,
so that the silver is ringed by dark everywhere and the dark is what meets the snow and the grey
rock. It must still read as silver, and must not be taken for the minerals' blue crystals, the
ore deposit's rust seam or the depleted mine's empty pit.

Make it as `docs/ART.md` says: generate the source with Codex, giving it the other pictures of
`art/resources` as style references and the colours `RESOURCE_COLORS` already holds to draw in,
on flat magenta; shrink it; bake the `resources` folder; bake again and see nothing change. Never
draw the source with a script, and put nothing in the Codex prompt that is not already public in
this repository. The folder shares one palette of 24, so a new picture can move the colours of
the other twelve: aim for a bake in which they do not move (drawing in the colours the folder
already has is what makes that likely). If some do, look at the contact sheet, and say in the
pull request which markers changed and by how many cells.

Acceptance (24-pixel picture unless the 12-pixel copy is named; "the old picture" is the one on
`origin/main` today):
- At least 35% of the marker's opaque cells have a luminance of 60 or less, and at least 15% have
  a luminance of 190 or more. At most 20% lie between 70 and 160, the range of the mountains'
  rock (the old picture: more than half).
- At least 90% of the rim is the folder's ink, and no cell of luminance 190 or more is on the rim.
  The 12-pixel copy's rim is all ink, as the bake's outline makes it.
- Drawn on a mountains square, on the 32 grid and on the 16, for both variants: at most 5% of the
  marker's opaque cells have the colour of the mountain cell they cover (the old picture fails
  this by a wide margin: state its figure in the pull request).
- The thirteen markers are still distinct at both sizes; the silver marker is still opaque over
  120 to 460 of its 576 cells and lies within the middle 24 x 24 (12 x 12) of the square;
  `RESOURCE_COLORS` holds at most 24 colours and `ART_COLORS` at most 255.
- The other twelve source pictures in `art/resources` are byte for byte what they were.
- A second bake changes nothing (`git diff --exit-code src/ui/resource-art.ts`).
- `wiki/images/art/resources/silverDeposit.png` is regenerated and the manual's image tests pass.
- `docs/VISUAL_CHECKLIST.md` point 3 and the `art/resources` row of `docs/ART.md` say that a
  marker which lies on a ground of its own colours is told from it by dark against light, naming
  silver on mountains.

Verify: new tests in the "resource markers" block of `test/unit/ui/pixel-art.test.ts` for the
first three bullets, written first and failing on the old picture;
`npm test -- test/unit/ui/pixel-art.test.ts test/unit/ui/render.test.ts test/unit/wiki`;
the bake run twice with an empty diff after the second; `npm run check`; `npm run test:e2e` with
the baselines regenerated as `docs/ART.md` steps 4 to 8 say; in the pull request, the contact
sheet (`scripts/contact-sheet.py resources 4`) and a screenshot of silver on a mountain range at
the default zoom and one zoom out.

## Open questions and decisions

Decisions the owner made (2026-10-11):
- **Seven deposits in the Andes**, four more than today. Rejected: five (close to the generator's
  density, silver stays scarce) and ten (about one mountain in five, silver the obvious economy of
  South America).
- **Redraw the marker** as a second item. Rejected: adding deposits only, which would leave them
  as hard to find as the three there now.
- **The Andes only.** Rejected: more in Mexico, and deposits in the mountains of North America.

The planner's choices:
- **Which four squares**, as W1 lists them: spread over the range from northern Peru to the
  south, with the close run by Lake Titicaca lengthened so that three colony sites each reach two
  deposits. Rejected: (29, 44), two squares from the Inca village at (27, 43) and on the same
  colony ring as nothing else of use.
- **Dark against light** for the marker, not a new hue. Silver has to stay white metal, and a
  tint strong enough to stand off snow would read as the minerals' blue. Rejected: changing how
  the marker is drawn in code (a plate or a halo behind it on mountains), which would make one
  resource on one terrain a special case of the drawing order.
- **No balance run.** Four squares of +2 silver on one map do not call for
  `SIM=1 npm test -- balance`; `npm run check` covers the AI and game tests that play America.

Left open: nothing. If the bake cannot meet the luminance bullets within three attempts at the
picture, the worker stops as the blocking rules say and shows the best contact sheet.
