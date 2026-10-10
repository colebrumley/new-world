# Architecture

One paragraph per top-level module. Keep this current when a module is added.

## `src/engine/`
Pure rules and state. Every function is `(state, ...args) => newState | result`. It may not import
from `src/ui` or `src/app`, nor use the DOM, `fetch`, `Date.now`, or `Math.random` (constraint C3).
ESLint enforces this (`eslint.config.js`, the `PURE_GLOBS` block) and
`test/unit/boundaries.test.ts` asserts the rule exists and catches each offence; `npm run lint` holds the tree to it.

## `src/engine/data/`
Static rule tables: terrain, goods, units, buildings,
fathers, tribes, prices, nations. Every table is `as const satisfies Record<...>` and has a snapshot
test. Rule numbers live here and nowhere else.

## `src/engine/` modules
`state.ts` is the `GameState` shape (players, map, units, colonies) as plain JSON. `actions.ts` is
the only way to change it: `validateAction` / `applyAction` over a discriminated `Action` union,
returning `GameEvent`s. `movement.ts` holds the movement rules (step cost in thirds of a move,
ships and inland lakes, boarding, landfall, Go To) and `path.ts` the A* search they use. The Go To
and trade-route loops take a `SailWatch` that `actions.ts` sets to the naval zone-of-patrol and fort
rule, so movement need not depend on `naval.ts`.
`market.ts` is the Europe price model with buying, selling and boycotts; `europe.ts` the docks,
the Royal University and purchases. `immigration.ts` is the immigrant pool, recruit prices and
crosses. `settlements.ts` holds native settlements and whose land is whose (placement is
`mapgen/settlements.ts`). `alarm.ts` is how tribes and settlements feel about each power and how that changes each
turn. `native-economy.ts` works out what a
settlement wants and has; `village.ts` is first contact, the treaty, and what units do at a
settlement; `missions.ts` is founding, denouncing, inciting and converts;
`native-trade.ts` is the bargaining over cargoes (talks in progress live in `state.parley`).
`combat.ts` is the land combat core (strengths, the throw, promotion) and `battle.ts` the fights
between European units and the fate of the beaten; `assault.ts` is the storming and capture of
colonies, siege and infiltration; `ships.ts` is damage and repair and `naval.ts` fighting at sea, patrol zones and fort fire;
`independence.ts` is the Declaration and the Crown's answer (seizures, the Continental muster, landings of the Expeditionary Force, Tory uprisings; numbers in `data/independence.ts`). `difficulty.ts` gathers what each of the five levels changes, for the setup screen. `score.ts` is the colonial score, rating and honour (`data/score.ts`). `war.ts` is the war that follows (the Crown's troops marching and storming, foreign intervention, hired Continentals, and the tests for victory and defeat). `analysis.ts` sets out the odds of an attack for the Combat Analysis dialog (`ui/combat-analysis.ts`); `braves.ts` creates native
units (owned by `tribe:<id>`); `native-war.ts` is attacks on braves and settlements, raids, and
what a brave does at a colony's gate; `native-ai.ts` moves the braves each turn; `learning.ts` is the
trade a settlement teaches and living among the natives; `rumors.ts` is what a Lost City Rumor
turns out to be; `land.ts` is the price of native land and buying or taking it. `congress.ts` is the Continental Congress: bells, candidates, and what each
Founding Father does on joining. `diplomacy.ts` is relations between the powers:
meeting, audiences (`state.audience`), acts of war, and trade in foreign colonies. `royal.ts` is the Crown: the Expeditionary Force, wars in Europe, the frigate and
mercenary offers, the War of Succession. `custom-house.ts` is the export list and the sales a
Custom House makes during the colony turn (for a computer power's colony, its overflow and the set list it sells without flags). `regions.ts` numbers the landmasses; `wagons.ts` says which colony each wagon train serves. `computer.ts` is what a computer power's colonies get by themselves each turn (tools and horses bought, the best square of its ground improved, a road laid toward a sister colony, carpenters promoted, colonists schooled or trained; `AI_UPKEEP`), and where a power makes up its mind to fight a native people (`AI_NATIVE_WAR`). It also counts the defenders a colony wants, and keeps the power's reserve of arms in Europe (`AI_RESERVE`), which the dock and market code draw on for computer powers. `fleet.ts` is a computer power's treasury and fleet: what it has afloat, what it wants, and the gold it is given each turn. `trade-routes.ts` defines and runs trade routes. `education.ts` is schooling, `liberty.ts` the Sons of
Liberty, `placement.ts` automatic job choice. `voyage.ts` is the Atlantic crossing and `pioneer.ts` clearing, plowing and road building. `colony.ts` founds, joins and abandons colonies; `jobs.ts` decides who may work which square or
building and what they would make; `economy.ts` is a colony's turn (production, conversion,
storage) and `construction.ts` what it may build, buying, and completion. `cargo.ts` is holds, goods transfer and colonist equipment. `explore.ts` is fog and sight, `tile.ts` and `yields.ts` the tile model and production,
`calendar.ts` the date, `save.ts` serialization and replay, `invariants.ts` the checks the
simulation asserts, `rng.ts` the seeded generator, `game.ts` new-game setup.

## `src/engine/mapgen/`
The random New World generator: seeded value noise (`noise.ts`) and `generateWorld(rng, options)`
(`generate.ts`), which shapes land, climate, relief, forest, rivers, sea lanes, resources and
rumors, plus `worldStats` for tests and AI. Tunables live in `src/engine/data/mapgen.ts`.

## `src/ai/`
AI decision-makers. They read a `GameState` and return engine actions; they are held to the same
purity rules as the engine.
`random.ts` is the random player the simulations use. `european.ts` plays a colonial power (R-802):
`europeanAction(state)` returns the next action for the power to move and `playTurn(state)` runs
a whole turn, returning the actions it took so the app can log them. Its numbers are `AI_PLAN` in
`src/engine/data/ai.ts`. `wagons.ts` is its wagon trains and their trade with the native peoples (R-804): when a colony
builds one, what it loads, where it goes, and the answers given in the trade talks (`AI_WAGONS`).
`missions.ts` is its missionaries (R-805) and what each kind of unit does on entering a settlement (`AI_MISSIONS`).
`navy.ts` is its warships and privateers (R-806): the stations it wants kept, which ship takes which, and when a ship attacks (`AI_NAVY`).
`colony.ts` runs its colonies: the job plan dealt out every turn, with the scoring of squares and benches that places everyone not an expert (`AI_JOBS`), and the list a colony builds from (`AI_COLONY`).
`campaign.ts` is its wars on land (R-807): what it wants attacked and defended, landings beside rival colonies, which troops go where, and when a troop attacks (`AI_CAMPAIGN`); also the threat to a colony and the defenders it wants.
`settle.ts` decides whether a colonist founds a colony or joins one, which colony, and which port a ship takes passengers to (`AI_SETTLE`); it also rates a square as a site and reckons what a settler makes of it (`AI_SITE`).
`muster.ts` is a colony seeing to its own defence: the units it takes back in and the one colonist a turn it sends out armed (`AI_MUSTER`).
`freight.ts` is what a ship loads in a colony, which port an empty one fetches from, and when she makes for Europe (`AI_FREIGHT`).
`supply.ts` is what a colony asks to be sent and where a ship takes her cargo (`AI_SUPPLY`); the docks routine in `european.ts` does the buying (`AI_DOCKS`).

## `src/ui/`
`unit-art.ts`, `place-art.ts`, `floor-art.ts` and `feature-art.ts` are the detailed pictures of units, colonies and native settlements, the ground of each terrain, and the forests, hills and mountains that stand on it, on a 32-pixel grid, written by `scripts/bake-art.py` from the pictures kept in `art/` (our own, constraint C1); `pixel-art.ts` adds the owner's colour, the orders tab and the other marks, and `render.ts` and `tiles.ts` use them wherever a square is at least 32 pixels (from there up `view.ts` keeps a square a multiple of 32), falling back to the 16-pixel art below that.
`chart.ts` and `chart-art.ts` are the explorer's chart the unexplored map is drawn as: `chart.ts` says where the compass roses, sea serpents and ships stand, from the map's seed and size alone (pure; one rose to a 24 x 24 region, the others one to an 8 x 8 cell at most), and `chart-art.ts` is the vellum floor and those pictures at 32, 16 and 8 pixels to the square, drawn by `scripts/draw-chart.py` into `art/chart/` and written out by `scripts/bake-art.py chart` in six inks of the map palette. `pixel-art.ts` turns them into sprites and adds the ink hatching along the edges of a vellum square that meet the known (an edge mask over the eight neighbours); `render.ts` draws a mark only while every square it covers is unexplored.
`building-art.ts` and `goods-art.ts` are the colony screen's pictures (R-1013): one per building on the 32-pixel grid, roofed in the owner's colour, and one icon per good (and for hammers, crosses and bells) on the 16-pixel grid. Their sources in `art/buildings` and `art/goods` are drawn from plain shapes by `scripts/draw-colony-art.py` and baked by `scripts/bake-art.py buildings goods`. `pixel-art.ts` turns them into sprites (`buildingArt`, `goodArt`, `figureArt`), draws the flags of the four powers and the Crown (`flagArt`), and exports `drawGood` and `drawSprite` for any screen that paints them on a canvas; `colony-screen.ts` shows each building as its picture with its workers standing on it.
`portraits.ts` and `portrait-art.ts` are the faces (R-1016): the four advisers (one per report module in `reports/`), the King, and each founding father, a head and shoulders 64 art pixels square in colours of the map palette alone, baked from `art/portraits` by `scripts/bake-art.py portraits`. The faces are invented; none is a likeness of a historical person. `portraits.ts` turns one into palette numbers, RGBA bytes or a canvas shown at a whole number of screen pixels to the art pixel; an adviser's coat is a key that takes the colour of the wax its report is sealed with. They are shown at the head of each report, at the head of each line of the Continental Congress report, in the dialogs the Crown and the Congress put to the player (`dialog.ts` takes a picture for the question and one per choice), and on a father's page of the encyclopedia.
`pixel-art.ts` is all the map art as data: a 32-colour palette and functions that return
16 x 16 grids of palette indices for a tile, a unit, a colony, a settlement (nothing in it needs
a canvas, so it is unit-tested as data). `tiles.ts` turns that art into small canvases, once
each, and `render.ts` draws the visible squares and pieces from them scaled by whole numbers
with smoothing off. Square sizes are multiples of 8 pixels (`view.ts`). The blink of the active
unit, the water shimmer and the slide of a moving piece are driven from the frame loop in
`app/game-screen.ts` (which also keeps the painted ground from one redraw to the next, repainting it only when the map, the view or the water changes, and draws the pieces over it) and counted in `data-ticks`, apart from the redraws the game asks for
(`data-frames`); `?still` freezes them. See `docs/VISUAL_CHECKLIST.md`.
Reads state, never changes it. `view.ts` is the camera math (four zoom levels, clamping, pan,
pixel/tile conversion). `tiles.ts` paints each distinct tile look procedurally and caches it per
pixel size. `render.ts` draws the visible tiles, the chart over what is unexplored, and the pieces; `minimap.ts` draws the New World
view; `sidebar.ts` builds the information sidebar from a pure `sidebarModel`; `tile-tooltip.ts` is the pure description of a square (its terrain, each feature and its effect, a free colonist's yields, move and defence) that the map tooltip and the sidebar share, through `tileTip` and `groundFeatures`; its `placeTooltip` says where the tooltip's slip goes beside the pointer (turned to the other side at the right and bottom edges, kept on the canvas). The slip itself is one `.map-tooltip` element that `app/game-screen.ts` fills when the pointer has rested on an explored square for `TOOLTIP_DELAY_MS`, moves from square to square, and takes away on any press, key, wheel, pinch, change of view or dialog, without redrawing the map; the Terrain tooltips option and a device that cannot hover keep it away. `keymap.ts` is the keyboard table (it also generates `docs/KEYS.md`), `pointer.ts` says what a click, a drag from the active unit, a turn of the wheel or a pinch means on the map (pure), `command-bar.ts` is the sidebar's row of buttons, one per map command, each running what its key runs (the Europe button takes a brass plate while a ship lies in port and a wax mark while ships cross, from the pure `europeCall` in `europe-model.ts`), `magnified.ts` is the notice shown while the page itself is magnified (a pinch), `unit-queue.ts` decides
which unit asks for orders next, `dialog.ts` is the pop-up question, `europe-model.ts` turns the
player's side of Europe into plain data and `europe-screen.ts` draws it as a harbour (ships on the water and at the quay, the docks, the
market's stalls, the doors of the offices), its parts made once and changes written into them. `colony-model.ts` turns a colony into the plain data its screen shows and
`colony-screen.ts` draws that as DOM with drag-and-drop and the colony keys. `report.ts` shows an adviser's report built as plain data by a
function in `reports/` (so far the Continental Congress). `title.ts` and
`customize.ts` are the opening screens. Panels and dialogs are plain DOM.

`ui/options.ts` lists the game and colony report options (kept by `app/storage.ts`, edited in `ui/options-dialog.ts`); `ui/notices.ts` turns a turn's events into log lines as the options allow (a ship of ours reaching Europe is always logged); `ui/hints.ts` picks the tutorial hint for the moment. `ui/audio-cues.ts` maps events to sound cues and defines each cue as tones (and the ambient phrase generator); `app/audio.ts` plays them through WebAudio. `ui/pedia.ts` generates the encyclopedia pages from the data tables and `ui/pedia-screen.ts` shows them. `ui/report.ts` is the full-screen frame every adviser uses; `ui/reports/` holds the builders
(`advisers.ts` for F1, F2, F4-F7 and F9; `congress.ts`, `foreign.ts`, `score.ts`), each a pure
function from the state to rows.

## `src/app/`
`shell.ts` is the entry: it puts the title screen up and fetches everything else (`boot.ts`, which routes the title's choices into a game and carries the engine) in the background, so the first paint costs a few kilobytes. The painting behind the title screen arrives the same way, after the first paint: `shell.ts` hangs an empty canvas beside the game's element (`createPainting` and `fitPainting` in `ui/title.ts` size it by a whole number of art pixels, letterboxed on the wood) and then asks for `ui/frontispiece.ts`, a chunk of its own holding `title-art.ts`, the 320 x 200 picture `scripts/bake-art.py` bakes from `art/title/` in the colours of the map palette alone (a generated picture of our own, constraint C1). The canvas shows whenever a title-framed screen is up (the title, Customize, Choose a European Power, a report opened from the title) and is hidden by the stylesheet once a game starts. Every new game passes through `ui/power.ts`, the screen where the power and the player's name are chosen (R-1017): `boot.ts` seats the powers with `standardPowers` (`engine/game.ts`), keeps the choice under keys in `save-keys.ts` and honours `?nation=` and `?name=`, and asks `game-screen.ts` to open a fresh game (never a loaded one) with an audience with the Crown. `save-keys.ts` names the browser-store keys and imports nothing, for the same reason. `game-screen.ts` owns the session, the view, input
(keys, click, drag, edge-scroll, minimap) and the dirty-flag frame loop, and dispatches engine
actions. `storage.ts` is the localStorage autosave; `hall-of-fame.ts` keeps the ten best finished games there. `slots.ts` is the ten save slots (two of them autosaves) and the words for a save that will not load; the dialog is `ui/save-dialog.ts`. `?reveal` in the URL lifts the fog and
`window.__newWorld.benchmark(n)` times redraws; both exist for tests.

## `test/`
`test/unit` mirrors `src` paths (Vitest). `test/e2e` is Playwright (chromium). `test/sim` holds slow
headless simulations gated behind `SIM=1`.

Local runs are made to share a machine. Each Playwright run builds into
`node_modules/.cache/new-world-e2e/<port>` and serves that on a port of its own
(`playwright.config.ts`; `PW_PORT` overrides it), so runs in other checkouts or sessions never
meet. Outside CI both runners use a few workers (`PW_WORKERS`, `VITEST_WORKERS`), and a Playwright
run stops after three failures or five minutes. `npm run sweep` (`scripts/sweep-test-procs.mjs`)
ends test workers, browsers and preview servers left behind by a run that was killed.

Sessions work in worktrees under `.claude/worktrees/` and talk through the board
(`scripts/board.mjs`, `npm run board`): one file per claimed requirement and a log of notes, kept
in the repository's shared git directory so that every worktree sees the same board and none of
it is committed. A claim whose worktree no longer exists is free to take.

## Balance
`test/sim/balance.test.ts` (`SIM=1 npm test -- balance`) plays twenty full games between four
computer powers and writes `docs/BALANCE.md`, comparing what happened with the target ranges of
REQUIREMENTS.md Appendix L. Metrics outside range become `[!]` tuning items in the backlog.

## Budgets
`scripts/check-size.mjs` (run by `npm run check` after the build) fails if the entry script
passes 20 KB or all scripts together pass 400 KB, gzipped. `test/e2e/budget.spec.ts` holds the
time budgets: title screen within 1.5 s on throttled Fast 3G (measured by the page's own
`new-world:title` performance mark), and an end of turn with four powers and forty colonies
within 500 ms (measured in the page around the dispatch). The time budgets run in CI, or locally
with `BUDGET=1 npm run test:e2e -- budget`; a busy machine cannot keep them.

## Deployment
The build is static and every path in it is relative (`base: './'`), so `dist/` can be served
from any folder. `public/manifest.webmanifest` and `public/icon.svg` make it installable.
`vite.config.ts` writes `dist/sw.js` at build time with the list of built files: the worker
fetches them all when it installs and then serves them cache-first (the page itself
network-first), which is what lets the game be played offline. `.github/workflows/deploy.yml`
runs `npm run check` and the e2e suite, then publishes `dist/` to GitHub Pages, on pushes to main
that change what the build is made from (`src/`, `public/`, `index.html`, the Vite and TypeScript
config, the package files), and runs the checks alone on pull requests that change those, the
tests and tooling, `docs/KEYS.md` or the art sources; a push or pull request touching only the
other docs, specs or `.claude/` runs nothing. The e2e suite always runs against `vite preview` of the real build, and
`test/unit/deploy/workflow.test.ts` lints the workflow with actionlint and holds the path lists.

## Theme (`src/ui/style.css`, `src/ui/fonts/`)
The page around the map is an explorer's chart on a captain's table: dark oiled wood with brass
trim, and on it light parchment sheets with ink text. Every colour, texture and typeface is a
custom property on `:root` at the head of `style.css`, and no rule below that block names a colour
of its own (`test/unit/ui/style.test.ts` holds the file to it, and checks the inks against the
parchment for WCAG AA). Build on the tokens, not on literals. Colours: `--parchment`, `-light`,
`-shade`; `--ink`, `--ink-faded`, `--ink-amber` (warnings, notes), `--ink-active` (links, the
current item, focus), `--ink-good`, `--ink-bad`; `--wood`, `--brass`, `--wax`, each with `-light`
and `-dark`; `--nation-england`, `-france`, `-spain`, `-netherlands`, `-crown`, the map's own. An
element that shows a nation carries `data-nation`, which sets `--nation` for it and all inside it
(the game element carries the player's); a wax seal is drawn in `--nation`. Textures are
procedural: `--grain-parchment` and `--grain-wood` are inline SVG `feTurbulence`, `--planks` a
gradient. Whole backgrounds: `--sheet` (parchment), `--table` (wood), `--plate` and
`--plate-brass` (button faces), `--wash-light` (a region of a sheet), `--ink-wash` (a well).
Lines: `--rule`, `--rule-faint`, `--rule-dashed` are ink rules, used where a panel has an edge;
`--edge-brass` with `--edge-brass-inner` is a plate's edge, `--trim-brass` a brass strip,
`--frame` the wood round a sheet that fills the window, `--lift` its shadow, `--focus-ring` the
ring. Type: `--font-body` ("Chartroom") and `--font-display` ("Chartroom Caps", small capitals for
headings and labels), with Georgia behind both. The faces are basic-Latin subsets kept in
`src/ui/fonts/` with their licence and made by `scripts/subset-fonts.py`; they load with
`font-display: swap`, and nothing is fetched from another site. The map canvas and the minimap
are not themed: they draw in the palette of `pixel-art.ts` (`docs/VISUAL_CHECKLIST.md`).

The reports, the encyclopedia and the save, options and combat panels are pages of parchment
(R-1015). A report (`src/ui/report.ts`) has a head: a wax seal drawn on a canvas by `sealArt` in
`pixel-art.ts` (one of four marks, in a wax from the map's palette), the title, and an empty
`.report-portrait` element (`data-slot="portrait"`) that takes no room until something is put in
it. `src/ui/reports/heads.ts` holds, by report id, each adviser's mark, wax and opening sentence;
a report with no entry there is sealed in plain red. A section whose first row names its columns
says so with `columns: true`, and that row is ruled off in small capitals. The rest is stylesheet
alone: the encyclopedia's index is a table of contents whose current entry (`aria-current`)
carries a ribbon, the save table is a ledger, the options are a checklist whose boxes and ticks
are drawn in ink (as are the rings of Customize), and the result of a fight is a stamped slip.
