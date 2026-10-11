# The America map, authored square by square: spec for R-1049 to R-1050

Written by `/plan` on 2026-10-11. Status: built.

**The request, in the owner's words:** the America map is very generic and is missing critical
features: a ship cannot go around the southern tip of South America, and there is no Mississippi.
Regenerate it, starting from the layout the private notes describe. And America should be static:
only random maps get random things. America should be hard-coded with all its mountains, rivers,
resources and so on. And fix the settlements too: they stand exactly on their listed sites.

## Goal

"Start a Game in America" opens the same map every time, in every detail: every square's ground,
forest, hills or mountains, river, resource and rumor is written down in `src/engine/data/america.ts`
as charts a person can read and edit, and nothing on it comes from the random generator. The map
is drawn after the real Americas at 56 x 70: a ship can round Cape Horn and sail up the Pacific
coast, the Mississippi runs from the plains to the Gulf of Mexico as a major river, the St Lawrence
from the Great Lakes to the sea, the Amazon and the Paraná across South America, and the coasts,
islands, mountain ranges, deserts, forests and jungles lie where they belong. The native settlements
stand exactly on their listed sites, every game.

## Non-goals

- The random New World generator (`generateWorld`) does not change: its maps stay byte for byte
  what they are for every seed and option, and W1 adds the test that proves it.
- The native peoples' sites, their region boxes and the four powers' starting squares (the rule
  tables `AMERICA_TRIBE_SITES`, `AMERICA_TRIBE_REGIONS`, `AMERICA_STARTS`) do not move: they come
  from the private notes. Random-map settlement placement (`placeRandomSettlements`) does not
  change.
- No new map size, no new terrain, resource or river kind, no change to how any square is drawn
  (R-1040 to R-1048), no map editor (REQUIREMENTS.md §0, out of scope).
- The west coast of North America stays off the map north of Mexico (the owner's decision): the
  continent runs to the west edge down to Baja California, and the Pacific with its Sea Lane
  begins at Mexico.
- The Great Lakes are an inland lake; ships do not sail into them (the owner's decision).
- No save version bump: a saved game carries its own squares, so every old save still loads and
  plays on the map it was saved with. Replaying an old America action log from its seed would
  run on the new map and diverge; nothing in the app does that.

## Conventions used in this spec

- **All coordinates are playable coordinates** (x 0 to 55, y 0 to 69; add 1 for the grid), in the
  acceptance bullets as much as in the prose.
- **Every distance is Chebyshev** (a king's move counts one), as the generator measures it
  (`distanceFrom` with `N8` in `generate.ts`). "4-adjacent" means sharing a side; "8-adjacent"
  means sharing a side or a corner.
- **Land** means a square that is not water. **Solid land** means land that is not arctic; ice
  never counts as land for the Sea Lane gap, for fisheries, for the density ratios or for
  `worldStats.landTiles`, as in the generator.
- **The main ocean** is the 8-connected water body that holds the border square (0, 0) of the grid;
  a **lake** is any other water body. A test works this out with its own small flood fill;
  `components` in `generate.ts` stays private.
- **A river run** is a 4-connected set of river squares of one kind (minor or major), as large as
  it can be. **A run joins another** when a square of it is 4-adjacent to a square of the other.
  **A square reaches water** when it is 4-adjacent to a water square of any kind (ocean, Sea Lane
  or lake).
- **The Sea Lane columns** are x 0 to 2 on the west and x 49 to 55 on the east (grid x 1 to 3 and
  50 to 56: `MAPGEN.westLaneColumns` 3 and `eastLaneColumns` 7).

## Rules and sources

- **The America map is fixed, and so are its settlements.** Every listed site holds a settlement
  of its people on exactly that square, the first of each people its capital; nothing is thrown.
  The owner's decision (2026-10-11). The private notes shift each site by a small random amount
  and skip a site that finds no room (RULES.md "Settlements", R-501); this game drops the shift
  as a simplification for a static map. The sites are never 8-adjacent to one another, so the
  rule that settlements never touch still holds. Built in W2, once the charts put settlement
  ground under every site.
- **What the map holds** (coastline, relief, rivers, terrain, resources, rumors): this game's own
  work, drawn after the real geography of the Americas (constraint C1: no other game's map tile
  data, and none is available to us). The private notes give only the peoples' sites and the four
  starting squares, which this map is drawn around, as today.
- **Sea Lanes** fill the lane columns wherever water lies more than two squares from solid land,
  and lie nowhere else (R-102, `MAPGEN.laneLandGap`; the generator's rule, in both directions).
  On the America map they are drawn on the chart and a test holds them to that rule. The border
  ring of the grid is plain ocean, never Sea Lane: nobody can enter it, and RULES.md ("Sailing to
  Europe") already says the rim does not count as Sea Lane.
- **A lake** is water that does not reach the map's edge; ships cannot enter it, and a treasure
  beside it cannot be carried home (R-201, R-1038). The Great Lakes and Lake Titicaca are lakes.
- **At most 15 land masses** counting the two polar caps (R-102), and no land mass out of reach
  of the main ocean (`worldStats.landlocked` 0). Kept.
- **Resources lie only where their terrain allows** (`RESOURCE_TERRAINS`), fisheries only on
  water within two squares of solid land; a rumor lies only on solid land, never on mountains or
  on a resource, and rumors are at least three squares apart (R-102, `generate.ts`). Kept for the
  authored map, by test.
- **Density** of the authored map follows the generator's numbers so that balance holds: land
  resources on about 7% of solid land (`landResourceChance`), fisheries on about 3% of the water
  within two of solid land, 20 to 25 rumors (`rumorsMax`), about 4% of solid land mountains and
  9% hills, about 60% of flat solid land wooded. This game's own choice; the notes do not give the
  scenario map's counts.
- **A river runs from inland to the sea**: every river square can walk 4-connected over river
  squares of either kind to a square that reaches water, and the mouth is drawn on that water
  (R-1046). An authored run is at least two squares long. Kept.

## Shared surfaces

| Surface | Changed by | Order |
|---|---|---|
| `src/engine/data/america.ts`: `AMERICA_COAST`, `AMERICA_EQUATOR_ROW`, `AMERICA_MOISTURE`, `AMERICA_FOREST` go; the four charts and their legends arrive | W1 writes the format with today's squares; W2 rewrites the charts' contents | W1 first |
| `src/engine/mapgen/america.ts`: `readCharts(charts)`, `americaMap()` without an `Rng`, `chartsOf(map)`; `americaRelief` and the site-levelling loop go | W1 | first |
| `src/engine/mapgen/generate.ts`: `WorldHints` and the hint branches of `detailWorld` removed | W1 | first |
| `src/engine/game.ts`: the `americaMap` call (W1); the `placeAmericaSettlements` call (W2) | W1, W2 | W1 first |
| `src/engine/mapgen/settlements.ts`: `placeAmericaSettlements(map)` without an `Rng`, no shift, no spacing; `src/engine/data/settlements.ts`: `siteTries` and `siteSpacing` go if nothing else reads them; `test/unit/engine/settlements.test.ts`; `docs/RULES.md` "Settlements (R-501)", the America paragraph; `docs/FIDELITY.md`, the R-501 America row | W2 | after W1 |
| `test/unit/engine/mapgen/america.test.ts` and its snapshot; `test/unit/engine/mapgen/generate.test.ts` (the new digest test) | W1 rewrites, W2 extends | W1 first |
| e2e baselines (`test/e2e/__snapshots__/visual.spec.ts`), the manual's screenshots (`wiki/images/screens`, `test/e2e/wiki-shots.spec.ts`) and tables (`wiki/Native-Peoples.md`, the "Most often teach" column), `docs/art/map-zoom*.png` | both; each regenerates after bringing `origin/main` in | W1 first |

W2 depends on W1. They do not run in parallel.

## The chart format (W1 builds it, W2 fills it)

Four charts in `src/engine/data/america.ts`, each an array of 70 strings of 56 characters, one
character per playable square, row 0 at the top. Each legend is a `const ... as const satisfies
Record<string, ...>` with a snapshot test. A letter means one thing on its own chart; the same
letter may mean something else on another chart, and the legends say so.

- **`AMERICA_GROUND`**, the square itself: `.` ocean, `~` Sea Lane, `#` arctic, and the eight open
  terrains in lower case with their forested forms in upper case, as the test glyphs today:
  `t` tundra / `T` boreal, `d` desert / `D` scrub, `p` plains / `P` mixed, `r` prairie / `R`
  broadleaf, `g` grassland / `G` conifer, `s` savannah / `S` tropical, `m` marsh / `M` wetland,
  `w` swamp / `W` rain. A lake is `.` not reached from the edge. The polar caps are rows of `#`
  on the chart itself (row 0 and row 69, with ragged ice on row 1 or row 68 only where drawn),
  not added by code.
- **`AMERICA_RELIEF`**: `.` flat, `h` hills, `A` mountains. Only on solid land; a hills or
  mountains square's ground letter is lower case (no forest on relief, as the generator has it).
- **`AMERICA_RIVERS`**: `.` none, `r` minor, `R` major. Only on solid land.
- **`AMERICA_EXTRAS`**: `.` nothing, `?` a Lost City Rumor, and one letter per resource: `o`
  oasis, `w` wheat, `c` prime cotton, `t` prime tobacco, `s` prime sugar, `m` minerals, `f`
  fishery, `b` beaver, `g` game, `l` prime timber, `v` silver deposit, `e` ore deposit (a
  depleted mine is never authored). `?` only on solid land; `f` only on water within two squares
  of solid land; every other letter only on solid land of a terrain `RESOURCE_TERRAINS` allows.

`src/engine/mapgen/america.ts` exports three functions:

- `readCharts(charts: { ground, relief, rivers, extras }): GameMap` builds a map of `MAP_WIDTH` x
  `MAP_HEIGHT` through `makeTile`: the charts fill the playable area and the border ring is plain
  ocean. It throws a `RangeError` whose message names the chart and the row (for a chart that is
  not 70 rows of 56 characters, or a letter its legend lacks); this is a unit-test path, never a
  runtime one.
- `americaMap(): GameMap` is `readCharts(AMERICA_CHARTS)` on the data constants, a fresh object
  each call (tests compare with `toEqual`).
- `chartsOf(map): { ground, relief, rivers, extras }` is the inverse over the playable area, for
  the round-trip test, for the snapshot, and for a worker drafting charts from a generated map.

`createGame` calls `americaMap()`. `WorldHints`, `detailWorld`'s hint parameter and its hint
branches go (they read no random numbers, so `generateWorld`'s output cannot move; the digest
test below proves it). `americaRelief`, `coastMask`, `boxSum` and the site-levelling loop in
`america.ts` go: the charts are the truth and the site test enforces them.

## Work items

### W1 — The America map as charts (R-1049, size M, depends on: nothing)

Files: `src/engine/data/america.ts`, `src/engine/mapgen/america.ts`,
`src/engine/mapgen/generate.ts`, `src/engine/game.ts`, `test/unit/engine/mapgen/america.test.ts`
and its snapshot, `test/unit/engine/mapgen/generate.test.ts`, `docs/ARCHITECTURE.md` (the
`mapgen/` paragraph), `docs/FIDELITY.md` (the three R-103 rows), e2e baselines, the manual's
screenshots and tables, `docs/art/map-zoom*.png`.

Work in this order, so that the tests pin the old picture before the code that made it goes:

1. **Pin first.** Before touching any engine file, commit two tests. In `america.test.ts`, replace
   the `ascii` snapshot with a snapshot of the four charts of `chartsOf(oldMap)` (where `oldMap`
   is today's `americaMap(createRng('america').fork('world'))`): the ground chart with `.` for
   ocean, each chart as its 70 rows joined by newlines. `chartsOf` may live in the test at this
   step and move to `america.ts` in the next. In `generate.test.ts`, add a test that pins the
   `sha1` digest (`node:crypto`) of `JSON.stringify(map.tiles)` for `generateWorld(createRng(String(seed)).fork('world'))`
   with the default options for seeds 1, 2 and 3, as a snapshot. Both tests stay for good.
2. **Then build the format** above, and fill the four charts with exactly that snapshot's rows.
   Drafting tip: paste from the snapshot file; never commit a scratch test.
3. **Then regenerate** what the new sameness moves: the map is now the same for every seed, so
   the e2e baselines (seed 11) and the manual's screenshots and tables (seed 7) change, while the
   unit snapshot of the charts does not. Regenerate them as `docs/ART.md` says.

Acceptance (unit, `america.test.ts` unless said):
- The chart snapshot committed in step 1 is unchanged by steps 2 and 3: `chartsOf(americaMap())`
  matches it line for line. The digest snapshot in `generate.test.ts` is unchanged too.
- `americaMap()` gives a map of 58 x 72 whose border ring is plain ocean, equal (`toEqual`) on
  every call; and `createGame({ seed, scenario: 'america' })` for seeds 1, 2 and 3 gives maps
  whose squares agree in `base`, `forest`, `relief`, `river`, `resource` and `rumor` (settlements,
  `explored`, `homeland` and `claim` may differ).
- `chartsOf(americaMap())` equals the four charts in the data file, line for line (the round
  trip); every chart has 70 rows of 56 characters; `readCharts` with a 69-row ground chart, and
  with a row holding `z`, throws a `RangeError` naming the chart and the row.
- Every square obeys its rule: relief and rivers on solid land only, no forest under relief; every
  resource on a terrain in `RESOURCE_TERRAINS`, fisheries within two squares of solid land; every
  `?` on solid land, never on mountains or on a resource, rumors at least three apart; every
  river run at least two squares long, and every river square able to walk 4-connected over river
  squares of either kind to a square that reaches water; a water square in a Sea Lane column is
  `~` exactly when it is more than two squares from solid land, and no `~` lies outside those
  columns.
- The existing checks still hold: `landlocked` 0; at most 15 land masses; at least 10 rumors;
  every listed site on level non-arctic land without a rumor, inside its region box, and
  distinct; the four starts at sea in their north-to-south order; Florida, the Gulf, Cuba, the
  Caribbean, the isthmus, the Pacific and Brazil where the test looks today; the regional
  character on today's boxes (mountains in (26, 36) to (35, 66) above 40, dry over wet by three in
  (4, 15) to (17, 23), wet over dry by three in (34, 37) to (49, 47), tundra above 20 in (0, 1) to
  (20, 3), at least 300 Sea Lane squares).
- `generate.test.ts` passes with the new digest test: random maps are what they were.
- `docs/ARCHITECTURE.md` says the America map is read from charts; `docs/FIDELITY.md`'s R-103
  rows say the coastline and every square are authored charts, own work.

Verify: `npm test -- test/unit/engine/mapgen test/unit/engine/settlements.test.ts
test/unit/engine/game.test.ts test/unit/wiki`; `npm run check`; `npm run test:e2e`.

### W2 — The new geography (R-1050, size L, depends on: W1)

Files: `src/engine/data/america.ts` (the four charts), `src/engine/mapgen/settlements.ts`,
`src/engine/data/settlements.ts`, `src/engine/game.ts` (the settlements call),
`test/unit/engine/settlements.test.ts`, `docs/RULES.md` (the America settlements paragraph),
`test/unit/engine/mapgen/america.test.ts` and its snapshot, `test/e2e/shell.spec.ts` (the Florida and Caribbean sample squares, if they
move), `test/e2e/helpers.ts` (`foundJamestown`, only if the coast west of England's start moves
out of its twelve steps), e2e baselines, the manual's screenshots and tables (`wiki/Native-Peoples.md`
"On the America map" and "Most often teach"), `wiki/Getting-Started.md` (the America paragraph,
if it needs a word), `docs/art/map-zoom*.png`, `docs/FIDELITY.md` (the R-103 rows).

Redraw all four charts after the real Americas, around the peoples' sites and the four starts,
which do not move. The drafting path a careful worker takes: draw the ground chart's land and
water first; run today's `detailWorld` once over that land mask from a scratch test (it is still
there for random maps) and `chartsOf` the result as a first draft of terrain, forest, relief,
rivers, resources and rumors; then edit every chart by hand into the geography below, and delete
every random river that is not one of the named ones. The numbers in the prose are a guide, not
a rule; the acceptance bullets hold the rules, with their own boxes.

**Coasts and seas.**
- Row 0 and row 69 are ice. Rows 67 and 68 are open sea the whole width, so a ship rounds Cape
  Horn: the continent's tip ends at row 66 (the southmost Inca site is on it).
- North America runs to the west edge from the ice down to Baja California (a peninsula at
  x 3 to 5, y 20 to 25, with the Gulf of California a one-square inlet beside it); the Pacific is on
  the map from Mexico's west coast (about x 6, y 26) southward, with its Sea Lane from row 30 at
  the latest to row 68.
- Hudson Bay: a bay open to the northern sea, about x 21 to 24, y 1 to 7 (the Iroquois and Sioux
  sites close it in). Labrador, Newfoundland (an island, about x 36 to 40, y 4 to 7, with France's
  start at sea south-east of it), Nova Scotia, a Cape Cod bump, a one-square Chesapeake inlet
  (about x 28, y 17), the Carolina coast, Florida (a peninsula x 26 to 28, y 22 to 25), the Gulf
  coast with the Mississippi delta (about x 20, y 21), the Texas coast, Yucatán (a peninsula
  x 19 to 21, y 27 to 29), Central America narrowing to a one- or two-square isthmus at Panama
  (the site at 26,34 is on it).
- The Caribbean: Cuba (x 29 to 34, y 25 to 26), Hispaniola (x 36 to 38, y 27), Puerto Rico (40,27),
  Jamaica (33,28), a Bahamas scatter (x 30 to 32, y 22 to 23), the Lesser Antilles as a chain
  down to Trinidad (x 44 to 46, y 28 to 35; the two southern Arawak sites are on them). At most 15
  land masses in all, counting the two caps, both continents as one, and Newfoundland.
- South America: the Venezuela and Guiana coast, the Amazon mouth as a two-square estuary
  (about x 45, y 40), Brazil's bulge east to x 52 at y 44 (the Tupi site is on it; the east Sea
  Lane is one column wide there), the coast running south-west to the Plate, a two-square estuary
  (about x 42 to 43, y 58 to 59), then Patagonia narrowing to the tip at x 34 to 36, y 66. The
  Pacific coast from Panama south-west to Colombia, down the Peruvian coast (the Inca site at
  27,43 near it) and the long Chilean coast to the tip.
- Lakes: the Great Lakes (about x 21 to 24, y 11 to 12, a lake, not reached from the sea); Lake
  Titicaca (one square, about 32,50).

**Relief.** The Rockies: mountains with hills beside them in columns 2 to 4 from row 2 to row 22,
then the Sierra Madre as two lines down Mexico; the Appalachians as hills with a few mountains
from about (28,13) to (22,21); the Andes as an unbroken line of mountains one or two wide along
the Pacific coast from Colombia (27,36) to the tip, with hills east of it; the Guiana and Brazilian
highlands as hills; mountains about 4% of solid land and hills about 9%.

**Rivers**, all authored, each a 4-connected run ending on the land square beside the water:
- The Mississippi, major, from the northern plains (about 13,6) south through about (15,12) and
  (18,17) to its delta on the Gulf (about 20,21); the Missouri, minor, from the Rockies' foot
  (about 6,7) joining it near (14,10); the Ohio, minor, from the Appalachians (about 24,15)
  joining it near (17,17).
- The St Lawrence, major, from the Great Lakes east-north-east to the Atlantic (about 31,9);
  the Hudson, minor, from (29,12) to the sea at (30,15); the Rio Grande, minor, from (8,17) to
  the Gulf at (15,23).
- The Amazon, major, from the Andes' foot (about 31,40) east along row 40 to its estuary, with
  one minor tributary from the south; the Orinoco, minor, to the Venezuelan coast; the São
  Francisco, minor, in Brazil's east; the Paraná, major, from about (40,48) south to the Plate;
  the Magdalena, minor, in Colombia.

**Terrain.** Tundra and boreal across the north (rows 1 to 5) and at Patagonia's south; the
plains and prairie open between the Rockies and the Mississippi (rows 3 to 14, the Sioux);
mixed, broadleaf and conifer woods east of the Mississippi; desert and scrub in the south-west
(x 2 to 14, y 15 to 24, the Apache) and the Atacama strip (x 28 to 30, y 46 to 56); marsh and
swamp on the Gulf coast and in Florida; savannah and tropical forest in Central America and the
Caribbean; rain forest, wetland and swamp through the Amazon basin; savannah and grassland in
Brazil's east; prairie and plains on the pampas about the Plate. About 60% of flat solid land
wooded. Every listed site, including the Apache sites inside the desert and the Tupi sites inside
the Amazon, stands on settlement ground: level tundra, plains, prairie, grassland, savannah or
marsh, wooded or not (never desert, swamp, hills or mountains), an island of such ground inside
its region where the region is otherwise dry or wet.

**Settlements.** `placeAmericaSettlements(map)` takes no `Rng` and puts one settlement of each
people on each of its listed sites, in list order, the first the capital, with no shift and no
spacing check; a site that is not settlement ground is a bug the chart test catches, not a site
to skip. `createGame` calls it without a fork (`rng.fork('natives')` is no longer drawn; the
later forks, `alarm` and the rest, derive from the root and do not move). The America-only
constants `siteTries` and `siteSpacing` in `src/engine/data/settlements.ts` go if nothing else
reads them. RULES.md's America paragraph under "Settlements (R-501)" and FIDELITY.md's R-501
America row say what the game now does and that the shift was dropped by the owner's decision.

**Resources and rumors**, placed by hand where they make sense: wheat on the plains, beaver in
the northern mixed woods, game in the boreal and broadleaf woods, prime timber in the conifers
and tropics, tobacco in the south-east, cotton on the prairies, sugar in the Caribbean and
Brazil, silver in the Andes and Mexico's mountains (the Inca and Aztec treasuries count
mountains near their settlements), ore in the Appalachians and Andean hills, minerals in the
tundra and swamps, oases in the deserts, fisheries on the Grand Banks, the Gulf, the Caribbean
and the Peruvian coast; about one land resource per 14 solid land squares. 20 to 25 rumors,
spread over both continents, three or more apart, none on a listed site.

Acceptance (all in `america.test.ts`, with W1's format and rule checks still passing; "water" in
a named box means main-ocean water unless a lake is named):
- **Cape Horn:** a path of 8-adjacent water squares exists from a `~` in the east Sea Lane
  columns to a `~` in the west Sea Lane columns using rows 60 to 68 only.
- **The Mississippi:** the major run that holds a square 4-adjacent to Gulf water (water inside
  x 14 to 25, y 19 to 27) reaches a square with y at most 8, and at least two minor runs join it.
- **The St Lawrence:** a major run joins both a square 4-adjacent to the Great Lakes and a square
  4-adjacent to Atlantic water with x at least 29 on rows 5 to 12. **The Great Lakes:** a lake of
  4 to 12 squares inside x 19 to 27, y 9 to 13. **Hudson Bay:** main-ocean water inside x 20 to
  25, y 2 to 6, and `worldStats.landlocked` is 0.
- **The Amazon:** a major run holds a square with x at most 32 and a square 4-adjacent to
  Atlantic water with x at least 43 on rows 38 to 42. **The Paraná:** a major run holds a square
  4-adjacent to the Plate (main-ocean water inside x 41 to 44, y 57 to 60).
- **Sea Lanes:** on every row from 30 to 68 the west lane columns hold at least one `~`, and on
  every row from 1 to 68 the east lane columns hold at least one (W1's rule already fills the
  rest).
- **Sites:** every listed site is on settlement ground (level tundra, plains, prairie, grassland,
  savannah or marsh, wooded or not) and no two listed sites are 8-adjacent. At least three
  mountains lie within two squares of some Inca site and of some Aztec site.
- **Settlements** (`settlements.test.ts`): on the America map for seeds 1, 2 and 3 the settlements
  are the same, one per listed site on exactly that square, of that people, the first of each
  people the capital, and no two adjacent; the site at 26,34, listed under two peoples, is Aztec
  (as `docs/FIDELITY.md` records). Random maps still place as they did (the existing tests).
- **The Andes:** on every row from 36 to 66, at least one mountains square lies within two
  columns east of that row's westmost solid land square.
- **Regional character**, on these boxes: in (2, 15) to (14, 24) desert and prairie squares
  outnumber swamp, savannah and marsh squares three to one; in (32, 38) to (48, 48) the reverse;
  in (0, 1) to (20, 3) at least 20 tundra squares; at least 300 `~` squares; at most 15 land
  masses; `landlocked` 0.
- **Density**, over solid land: land resources (every extra but `f` and `?`) between 5% and 9%;
  fisheries between 2% and 5% of the water squares within two of solid land; 20 to 25 rumors;
  mountains between 3% and 6%; hills between 6% and 12%; wooded flat squares between 50% and
  70% of flat squares.
- `shell.spec.ts`'s Florida and Caribbean samples pass (moved to the new squares if needed);
  `foundJamestown` lands at seed 7 within its twelve steps; every e2e test passes with
  regenerated baselines and screenshots. The reviewer, not a test, judges that the manual's "On
  the America map" words still describe where each people is.
- The pull request carries a screenshot of the whole map at the far zoom (`?reveal`, zoom 0) and
  the four charts as the snapshot prints them.

Verify: `npm test -- test/unit/engine/mapgen test/unit/engine/settlements.test.ts
test/unit/engine/game.test.ts test/unit/wiki`; `npm run check`; `npm run test:e2e`; the screenshot.

## Open questions and decisions

Decisions the owner made on 2026-10-11:
- **The America map is static**, every square authored: mountains, rivers, resources and rumors
  included, **and the settlements stand exactly on their listed sites** with no random shift. Rejected: a hand-drawn coastline with generated detail steered by hints (what the game
  does today) and a list of authored rivers over random ones.
- **The Great Lakes are an inland lake** and the St Lawrence a major river to the sea. Rejected:
  a one-square strait so ships sail into the lakes.
- **North America's west coast stays off the map** north of Mexico. Rejected: California and
  the north-west coast on the map with a western Sea Lane the whole way.

Planner's choices, with the alternative rejected:
- **The starting point is the real geography plus the notes' sites and starts**, not any other
  map's squares: constraint C1 bars another game's map tile data, and the private notes do not
  hold it. The sites and starts, which the notes do give, pin the layout to the same latitudes
  and shape.
- **Charts of letters rather than span lists**: a 56 x 70 picture is what a person can draw, read
  in a diff and review; four layered charts rather than one so that each square's ground, relief,
  river and extra are each one letter from a small legend. Rejected: a packed single chart with
  dozens of letters; coordinate lists for resources and rumors (a hundred entries nobody can
  picture).
- **Two items, format first**: W1 is mechanical and keeps the picture, so its review is about the
  code; W2 is all judgment about geography and its review is about the map. Rejected: one L item
  doing both, too much for one session.
- **W1 pins before it builds**: the chart snapshot and the generator digest are committed from
  the old code first, so the rewrite is proved to keep both pictures; the old `ascii` print,
  which showed no rivers, resources or rumors, goes.
- **The border ring is plain ocean**: today's generator marked Sea Lane on the border by
  accident of its loop; nobody can enter the border, and the rules already say the rim is not
  Sea Lane. The unit snapshot covers the playable area only, so this moves nothing it pins.
- **Ice is on the chart** (rows 0 and 69) rather than added by code, so that the tip's clearance
  is visible in the data; W2 draws rows 67 and 68 open.
- **The settlement change lands in W2, not W1**: today's charts, transcribed from the generator,
  may hold desert or swamp under a listed site, which the shift used to step around; W2's charts
  put settlement ground under every site, so the shift can go there without editing W1's picture.
- **Densities follow the generator's numbers** so that the balance simulation's assumptions hold;
  a worker may go a little outside them where geography demands, within the test's bands.

If a worker meets a question this spec does not settle: build the smaller reading, and say so in
the pull request.
