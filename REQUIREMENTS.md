# New World — Requirements Backlog

This document is the single source of truth for an autonomous build loop. Every requirement
has an ID, a checkbox, acceptance criteria, and a **Verify** line that an agent can execute
without human input. The loop protocol lives in [CLAUDE.md](CLAUDE.md). Rule values live in the
data tables under `src/engine/data/`; [docs/FIDELITY.md](docs/FIDELITY.md) records how each was settled.

Legend:
- `[ ]` not started, `[x]` done and verified, `[~]` in progress, `[!]` blocked (reason must follow)
- `[VERIFY]` marks a value that was provisional when the backlog was written; the value settled on is
  logged in `docs/FIDELITY.md`. Implement the listed value, keep it in a data table. Do not block on it.

---

## 0. Scope and non-negotiable constraints

### Goals
- G1. A turn-based colonial strategy game, complete in its **rules, systems, pacing, and feel**
  (turn structure, economy, natives, Europe, Founding Fathers, independence war, scoring).
- G2. Runs entirely in a modern browser from static files. No backend, no login, no telemetry.
- G3. Deterministic, headless-testable engine. Same seed + same actions = same state, in Node and in browser.
- G4. Playable with mouse and with the keyboard shortcuts in Appendix K; usable on a laptop at 100% zoom.

### Hard constraints
- C1. **No third-party assets or text.** No graphics, sprites, fonts, palette, music, sounds,
  map tile data, or prose from any other game may be included or fetched.
  Rule values, names, mechanics, hotkeys, and screen layout are fine.
- C2. **No network calls at runtime** except loading the app's own static files.
- C3. **Engine is pure.** `src/engine/**` must not import from `src/ui/**`, the DOM, `window`,
  `document`, `fetch`, `Date.now`, or `Math.random`. Enforced by a lint rule and a test.
- C4. **Save format is versioned JSON** and every released version can load every prior version.
- C5. **Stack is fixed:** TypeScript (strict), Vite, Vitest, Playwright, ESLint, npm. Canvas 2D for
  the map; plain DOM for panels/dialogs. No UI framework, no state library. Add runtime deps only
  if a requirement names them.
- C6. **Target:** latest Chrome, Firefox, Safari. Minimum viewport 1024x640. Must also work at 1280x800.
- C7. **The rule tables are the authority.** When a value in this document conflicts with the
  tables in `src/engine/data/` (and the notes `docs/FIDELITY.md` keeps on them), the tables win;
  fix this document in the same commit.

### Out of scope for v1 (do not build, do not stub)
- Multiplayer (hot-seat), cloud saves, accounts, mod loader, map editor,
  achievements, mobile-first layout, loading assets from another game's install, cheat menu.

---

## Phase 0 — Scaffold and loop infrastructure

- [x] **R-000 Repository and toolchain**
  Init git. `npm create vite` (vanilla-ts). Add Vitest, Playwright (chromium only), ESLint with
  typescript-eslint and `import/no-restricted-paths` (or equivalent) to enforce C3. Scripts:
  `dev`, `build`, `preview`, `test` (vitest run), `test:e2e` (playwright), `lint`, `typecheck`, `check`
  (lint + typecheck + test + build). `.gitignore` for node_modules, dist, test-results.
  **Verify:** `npm run check` exits 0 on a fresh clone. `git log` has an initial commit.

- [x] **R-001 Directory layout and module boundaries**
  ```
  src/engine/      pure rules + state (no DOM)
  src/engine/data/ static rule tables (terrain, goods, units, buildings, fathers, tribes, prices, nations)
  src/ai/          AI decision-makers that emit engine actions (pure)
  src/ui/          canvas renderer, panels, input, audio
  src/app/         bootstrapping, save/load to localStorage/file
  test/unit/       vitest
  test/e2e/        playwright
  test/sim/        headless long-run simulations (vitest, tagged slow)
  docs/            FIDELITY.md, ARCHITECTURE.md, KEYS.md
  ```
  **Verify:** lint rule fails if `src/engine` imports from `src/ui` or `src/app` (add a negative
  test fixture under `test/unit/boundaries.test.ts` that asserts the lint rule exists and the
  source tree currently passes it).

- [x] **R-002 Deterministic RNG**
  Implement a seeded PRNG (xoshiro128** or sfc32) with `next()`, `int(min,max)`, `pick(arr)`,
  `chance(p)`, `fork(label)` (derive a child stream from a label) and serializable state.
  **Verify:** unit tests: known seed produces fixed known sequence; `fork` is independent of
  consumption order on the parent; state round-trips through JSON.

- [x] **R-003 Game state model and action pipeline**
  Define `GameState` as a plain JSON-serializable object (no classes, no Maps, no undefined in
  serialized form). Define a discriminated-union `Action` type. Implement
  `applyAction(state, action): { state, events[] }` that is pure (returns a new state; may use
  structural sharing). Define `Event` union for everything the UI must react to (unit moved,
  combat resolved, colonist arrived, father elected, etc.). Implement `validateAction(state, action)`
  returning a typed error or ok; `applyAction` must throw on invalid actions.
  **Verify:** unit test: `JSON.parse(JSON.stringify(state))` deep-equals state after 50 random
  valid actions; invalid actions throw and leave input state untouched (frozen in tests).

- [x] **R-004 Save/load and replay**
  `serialize(state): string`, `deserialize(string): GameState` with a `schemaVersion` field and a
  migration registry. Save = snapshot plus the action log since game start. Replay = re-apply log
  from the initial seed.
  **Verify:** property test: for 200 random actions, replaying the log from seed deep-equals the
  snapshot. A fixture save at each released schema version loads without error.

- [x] **R-005 Headless simulation harness**
  `test/sim/run.ts`: construct a game with N AI players, step until end or turn limit, assert
  invariants each turn (no negative goods, no unit on impassable terrain, no colony with pop 0,
  gold is integer, every unit has an owner, every tile index in bounds, colony count ≤ 48,
  colony pop ≤ 32). Runs in Vitest with a `SIM=1` env gate so the default `npm test` stays fast.
  **Verify:** `SIM=1 npm test` runs 1 seed x 50 turns with placeholder AI (random valid actions)
  without throwing. Later phases raise the turn count and player count.

- [x] **R-007 Rules notebook**
  `docs/RULES.md` is the place where formulas and hidden rules are written out in prose
  before being implemented.
  **Verify:** `docs/RULES.md` exists.

- [x] **R-006 Minimal app shell**
  `index.html` loads the app, shows a title screen with five choices (Start a Game
  in New World, Start a Game in America, Customize New World, Load Game, View Hall of Fame) and
  a canvas that renders the current state via `render(state, view)`. `requestAnimationFrame` loop
  that only redraws when state or view changed (dirty flag). Resizes to window.
  **Verify:** Playwright: page loads, no console errors, starting a game shows a canvas with
  non-blank pixels.

---

## Phase 1 — Map

- [x] **R-100 Terrain data table** (Appendix A)
  Encode the 8 open land types (Tundra, Desert, Plains, Prairie, Grassland, Savannah, Marsh,
  Swamp), their 8 forested counterparts (Boreal, Scrub, Mixed, Broadleaf, Conifer, Tropical,
  Wetland, Rain), Arctic, Ocean, Sea Lane, Mountains, Hills. Per type: movement cost, defense
  bonus (table value × 25%), improvement time, AI site value, base yield per good. Apply the
  derived engine adjustments (food +1 when > 0, lumber × 2) in one
  clearly named function so they can be switched off if play testing disproves them.
  Clearing a forest yields its open counterpart (Boreal→Tundra, Scrub→Desert, Mixed→Plains,
  Broadleaf→Prairie, Conifer→Grassland, Tropical→Savannah, Wetland→Marsh, Rain→Swamp).
  **Verify:** unit test asserts every type has all fields; snapshot test of the table; a test that
  Plains yields 5 food and Mixed forest 6 lumber to a free colonist with no bonuses.

- [x] **R-101 Tile model and yield function** (Appendix A modifiers)
  Tile = terrain, forest flag, hills/mountain flag, river (none/minor/major), road, plowed,
  resource (Appendix A2), lost-city-rumor flag, native-homeland owner, European claim, per-player
  explored flag. `tileYield(tile, good, unitType, colony, fathers)` applies: plow (+1 food,
  +1 sugar/tobacco/cotton), road (+ lumber, ore, furs, silver-with-deposit),
  river (minor +1, major +2 to produced goods [VERIFY amounts]),
  resource bonus (Appendix A2), expert (×2 for all raw goods except Expert Farmer +2 and Expert
  Fisherman +2 [VERIFY fisherman]), Indian Convert +1 on outdoor goods [VERIFY],
  Hudson (fur trappers ×2), SoL +1/+2, Tory penalty. Ocean/lake fishing requires Docks; fish yield
  rises with adjacent land tiles [VERIFY formula: +1 per 2 adjacent land tiles].
  Silver deposits deplete after extended mining into "Depleted Mine".
  Note: modifier values above are superseded by the rule in Appendix A / `docs/RULES.md`.
  The per-colony depletion counter is wired into the colony turn by R-301 (helpers exist in `yields.ts`).
  **Verify:** unit tests per modifier using Appendix A worked examples.

- [x] **R-102 Random "New World" generator**
  Map 56x70 playable (58x72 with a 1-tile impassable border). Sea Lane
  along the east and west edges; polar ice (Arctic) north and south; latitude climate bands;
  coherent forests (~60% of land forested at start); hills and mountain chains; rivers (must be
  ≥2 tiles, may end in an ocean tile); resources only on legal terrain; Lost City Rumors on land.
  Customize options: Land Mass
  (Small/Normal/Large), Land Form (Archipelago/Normal/Large Continents), Temperature
  (Cool/Temperate/Warm), Climate (Arid/Normal/Wet). Keep ≤15 land masses.
  **Verify:** unit tests over 50 seeds: land ratio in range per Land Mass option, every land tile
  reachable from a coast, river rules hold, no resource on illegal terrain, rumor count 10–25,
  land-mass count ≤ 15. Deterministic per seed.

- [x] **R-103 "America" map**
  Hand-author a low-resolution coastline mask of the Americas (Newfoundland to the Caribbean to
  Brazil; Andes/west coast mostly off-map) in `data/america.ts`, 56x70, and generate terrain
  detail procedurally so it is recognizable without anyone else's tile data. Place tribes using the
  coordinate clusters in Appendix D as region guides. European start positions on
  the eastern Sea Lane at historically sensible latitudes (England north, France far north, Spain
  Caribbean, Netherlands mid) [VERIFY positions].
  **Verify:** snapshot test; Playwright screenshot shows a recognizable Caribbean and Florida;
  every tribe's settlements lie within its region box.

- [x] **R-104 Exploration and fog**
  Tiles start unexplored per player. Units reveal radius 1; Seasoned Scouts and ships radius 2
  [VERIFY]; de Soto +1 for all units. Explored tiles stay visible forever;
  foreign units are shown only when adjacent to your units ("Show Foreign Moves").
  Natives and AI powers have full knowledge. "Show Hidden Terrain" (H) draws terrain under forests
  and icons.
  **Verify:** unit test on reveal radius; e2e screenshot shows black outside the start area.

- [x] **R-105 Map renderer**
  Canvas 2D square tiles, four zoom levels with view sizes 120x96 / 60x48 /
  30x24 / 15x12 tiles, Z/X to zoom. Procedurally drawn tiles (flat color plus
  simple pattern per terrain, forest canopy, hill/mountain glyphs, river lines, roads, plow
  furrows, resource icons, totem poles on native homeland tiles in colony view, rumor icon).
  Pan with arrow keys, edge-scroll, drag, and click-to-center; "New World view" minimap in the
  top-right with the viewport box and click-to-center; information sidebar on the
  right with date, treasury, active unit, moves, location, terrain, colony cargo list sorted by
  value. Only visible tiles drawn; frame time under 8 ms at 1280x800.
  **Verify:** e2e: zoom keys change tile size; minimap click recenters; a performance test
  (`performance.now` around 100 frames) stays under budget in headless chromium.

---

## Phase 2 — Units and movement

- [x] **R-200 Unit data table** (Appendix B)
  Encode colonist types (Free Colonist, Indentured Servant, Petty Criminal, Indian Convert, and
  the 22 specialists), roles (Soldier, Dragoon, Pioneer, Scout, Missionary), land units (Wagon
  Train, Treasure Train, Artillery, Damaged Artillery, Continental Army, Continental Cavalry,
  King's Regular, King's Cavalry, Braves, Armed Braves, Mounted Braves, Mounted Warriors), ships
  (Caravel, Merchantman, Galleon, Privateer, Frigate, Man-O-War). Fields: moves, attack,
  defense, holds, colony build cost (hammers = table cost × 32, tools = table tools × 10),
  Europe price, equipment carried, AI role flags.
  **Verify:** table snapshot; every unit referenced elsewhere exists.

- [x] **R-201 Movement rules**
  Moves per unit (Appendix B). Terrain cost from Appendix A; roads cost 1/3; moving along a river
  costs 1/3 [VERIFY exact fraction]; a unit with any
  moves left may always attempt a move into a tile costing more [VERIFY: civ-style rule].
  Ships stay on Ocean/Sea Lane except inside a coastal colony; ships cannot enter inland lakes;
  land units board a ship from an adjacent land tile or by Sentry in a colony
  (auto-board when the ship leaves); "Make Landfall" prompt when a loaded ship moves onto land;
  land units cannot attack from aboard ship. No zone of
  control. Orders: Go To (G, named destination menu, multi-turn pathfinding A*), Sentry (S),
  Fortify (F; effect starts next turn), Wait (W), Skip (Space), Disband (Shift-D), Activate (A).
  Note: both [VERIFY] items are settled in `docs/RULES.md` "Movement": river steps
  cost 1/3 only when orthogonal; a short-of-moves step succeeds with chance left/cost (always on the
  first step of a turn). The Go To destination menu and the landfall dialog are UI, built in R-205.
  **Verify:** unit tests for each rule; pathfinding test on a fixture map; sim invariant: no unit
  ends a turn on an illegal tile.

- [x] **R-202 Cargo and equipment**
  Holds carry 100 goods or one land unit (not ships/wagons); a Treasure Train needs 6 holds
  (Galleon or Man-O-War). Wagons never carry units. Transfer goods between carriers and the
  colony warehouse, or between two carriers in the same colony; partial amounts via a prompt.
  "Load most valuable" (L) ignores horses, tools, muskets. Equip in a colony or on the Europe
  docks: 50 muskets → Soldier; +50 horses → Dragoon; 50 horses → Scout; 20–100 tools → Pioneer
  (takes up to 100 available); Missionary requires a Church/Cathedral in the colony (or any
  colonist blessed on the Europe docks). All reversible; equipment returns to the warehouse.
  Pioneer with 0 tools reverts to colonist.
  Note: the engine side is complete (`cargo.ts`). The partial-amount prompt and drag UI are built with
  the colony screen (R-308); equipping on the Europe docks reuses `planEquip` in R-402/R-404; "most
  valuable" ranks by opening bid until the live market (R-400) supplies prices.
  **Verify:** unit tests for every equip/unequip path and capacity error; goods conservation
  invariant in sim.

- [x] **R-203 Europe travel**
  A ship on a Sea Lane tile moving toward the nearer map edge is asked "sail for Europe?".
  Transit 1–4 turns depending on direction (west edge longer), ship speed,
  and Magellan [VERIFY: east base 2, west base 4 before Magellan]. Ships in
  transit appear in "Expected Soon" / "Bound for New World" boxes and may be reversed mid-voyage.
  Returning ships reappear at the Sea Lane tile they left from, or at a chosen port.
  Europe is closed during the War of Independence.
  Note: timing follows `docs/RULES.md` "Europe travel": two turns each way from
  either edge, occasionally three; ships return to their departure square (a port is chosen
  through the Go To menu). The "Expected Soon" / "Bound for New World" boxes are a plain list until the
  Europe screen
  (R-402); the wartime closure is enforced by R-900.
  **Verify:** unit tests on transit timers and reversal; e2e round-trip.

- [x] **R-204 Pioneer actions**
  Clear forest / Plow (P) and Build Road (R) consume 20 tools each. Turn cost =
  terrain "Improvement" value from Appendix A [derived interpretation of the table's third column]; Hardy
  Pioneer works twice as fast [VERIFY]. Clearing a forest next to a colony adds lumber to that
  colony. Cleared land never re-forests. Improving native homeland triggers the
  land dialog (R-510). Already-plowed / already-road messages.
  Note (see `docs/RULES.md` "Pioneer work"): road = improvement turns, clear/plow =
  improvement + 2, Hardy Pioneer half (rounded down), tools spent on completion, the order turn counts.
  **Verify:** unit tests for each action, tool consumption, completion turns, lumber grant.

- [x] **R-205 Unit orders UI and keyboard map**
  Implement the keyboard map in Appendix K.
  Orders box on each unit colored by nation (English red, French blue, Spanish yellow, Dutch orange)
  with the order letter (`-`, S, T, G, L, F, B, P, R). Foreign ships show their filled-hold count
  instead. Bottom/side panel showing unit, moves left, terrain, orders.
  Note: `docs/KEYS.md` is generated from `src/ui/keymap.ts`. Keys whose feature does not exist yet (B,
  T, F1-F10, Alt menus, colony and Europe screens) are listed with the requirement that brings them and
  answer "not available yet". Go To picks a square with the cursor or mouse; the named-destination menu
  is added when colonies exist (R-300). Unit figures are a letter on the nation colour until R-1006.
  **Verify:** e2e: a key sequence moves a unit and ends the turn; `docs/KEYS.md` snapshot matches Appendix K.

- [x] **R-206 Turn structure and calendar**
  Start 1492. One turn per year to 1600, then two per year, Spring and Autumn.
  Player order each turn: natives first, then England, France,
  Spain, Netherlands. Within a player's turn: Europe events (prices, tax, immigrants),
  then colony events (production, spoilage, construction), then unit movement. End-of-turn
  message optional. Scoring game end at 1800 if no revolution declared ("retire in 1800");
  the War of Independence may run until 1850; the game
  also ends if you hold no colonies in or after 1600.
  Note: the round and the three phases of a power's turn are fixed in `actions.ts`; the natives and
  colony phases are empty until Phases 5 and 3 fill them. The scoring event is `gameEnded`; the score
  itself is R-902. The optional end-of-turn message is an R-1001 option.
  **Verify:** unit test on the calendar; sim runs to 1800 and emits a scoring event.

---

## Phase 3 — Colonies and production

- [x] **R-300 Found, join, abandon**
  Any colonist except an Indian Convert founds a colony (B) on land that is not Mountains,
  not adjacent to another colony or an in-progress colony site,
  not during the War of Independence. Warnings when no adjacent
  forest or few productive squares. Max 48 colonies;
  max 32 colonists per colony with a "far too crowded" refusal.
  Colony names from Appendix J lists in order, user-editable. B inside a colony = Join. Abandon
  allowed unless a stockade/fort/fortress exists (then pop may never drop below 3).
  Founding on native homeland triggers R-510. The founder works the best food tile.
  Note (see `docs/RULES.md`): the caps are 48 colonies in the whole game and 38 per power; the
  forest and space warnings appear only on Discoverer and Explorer, a no-ocean-access warning on every
  level; the in-progress-site refusal concerns a pending Build Colony order and cannot arise with
  immediate founding.
  The founder takes the best food square until `suggestPlacement` (R-309) replaces that choice.
  **Verify:** unit tests for legal/illegal placement, caps, stockade rule; e2e founds a colony.

- [x] **R-301 Goods and production chain** (Appendix C)
  16 storable goods: Food, Sugar, Tobacco, Cotton, Furs, Lumber, Ore, Silver, Horses, Rum,
  Cigars, Cloth, Coats, Trade Goods, Tools, Muskets; plus Hammers, Crosses, Liberty Bells
  (non-storable). Conversions: Sugar→Rum, Tobacco→Cigars, Cotton→Cloth, Furs→Coats, Ore→Tools,
  Tools→Muskets, Lumber→Hammers. Each worker converts input 1:1 at the building's rate; this
  turn's raw output feeds this turn's converters first, then stock (example: 3 ore mined
  and 3 tools made leaves ore stock untouched; shortfall drawn from stock). Rates per worker:
  House 3, Shop 6 (doubled for Lumber Mill / Magazine), Factory 6 input → 9 output
  (Adam Smith: 1.5 output per input). Expert ×2; Indentured Servant 2 in buildings; Petty
  Criminal 1; Indian Convert 1 in buildings [VERIFY]. Max 3 workers per building.
  Shortage messages per good.
  Note (see `docs/RULES.md` "Indoor production"): convert = 1 in buildings; a factory makes half
  again as much for two thirds the input; servants and criminals scale with the building level (2/4/6,
  1/2/3). Shortage reports are events (`ranOutOf`); their wording is shown by the colony report UI.
  **Verify:** unit tests: conversion with insufficient input; chain Ore→Tools→Muskets in one turn
  follows the example above; rates per level and per colonist type.

- [x] **R-302 Colony tiles and workers**
  The 8 surrounding tiles plus the center ("town commons"): the center automatically
  produces food plus the terrain's secondary good, using any resource there except Prime Timber,
  with no worker. One worker per tile producing one chosen good; tiles owned by natives (until
  bought/taken), occupied by foreign units, or worked by an adjacent colony are unavailable.
  Jobs menu shows "here / best elsewhere" values for each job. Clear Specialty option.
  Note: engine in `jobs.ts` (`squareStatus`, `fieldOutput`, `centerOutput`, `jobOptions`, `assignJob`,
  `clearSpecialty`); the centre-tile rule is the one in `docs/RULES.md` "Colony centre tile".
  The menu itself is drawn by the colony screen (R-308).
  **Verify:** unit tests for availability rules, center-tile output, job menu values.

- [x] **R-303 Buildings** (Appendix E)
  Encode all buildings with hammers, tools (× 10), min population, prerequisites, upkeep value
  (store it; upkeep rule off by default, see Appendix E note). Starting buildings: Town Hall,
  Carpenter's Shop, Blacksmith's House, Tobacconist's House, Weaver's House, Distiller's House,
  Fur Trader's House. One construction project at a time; hammers accumulate; tools
  are consumed on completion; if tools are short the project waits with a message;
  changing project keeps accumulated hammers; "Buy" completes for gold
  [VERIFY price formula: remaining hammers × 10? plus tools at Europe price]. Factory
  level (Iron Works, Textile Mill, Cigar Factory, Rum Factory, Fur Factory, Arsenal) requires Adam
  Smith; Custom House requires Stuyvesant. Colonies can also build Wagon Trains (≤ number of
  colonies), Artillery (needs Armory), and ships (needs Shipyard, coastal)
  with costs from Appendix B. Only one Warehouse Expansion.
  Note (see `docs/RULES.md` "Construction"): buy price = 13 per missing hammer + (tools price + 4)
  per missing tool, doubled with no hammers down; the hammer store resets to 0 on completion; upkeep is
  never charged. The tools price is a fixed opening value until the market (R-400).
  **Verify:** unit tests: completion exactly when hammers ≥ cost and tools ≥ cost; pop and
  prerequisite enforcement; wagon cap.

- [x] **R-304 Food, growth, starvation, horses**
  Each colonist eats 2 food. Surplus accumulates; at 200 food a Free Colonist is born and 200 is
  deducted. Food is not capped by warehouse size. Deficit draws from
  stock; with no stock, one colonist starves per turn of deficit, with warnings beforehand
  (and a message when the last colonist dies). Horses: with
  ≥2 horses and a food surplus the herd grows; Stable doubles the rate
  [VERIFY: growth = min(surplus/2, horses/4) style formula; calibrate so 50 horses with 10 surplus
  food grow ~2–5 per turn]; horse breeding consumes part of the surplus.
  Note (see `docs/RULES.md` "Food and horses"): the newborn is a unit outside the colony; one
  colonist at most dies per turn and only when the store was already empty; horses gain
  min(2 per started 50 (25 with Stable), half the turn's surplus rounded up, warehouse room).
  **Verify:** unit tests for growth, starvation sequence, breeding with and without Stable.

- [x] **R-305 Warehouse and spoilage**
  Capacity 100 per good; Warehouse → 200; Warehouse Expansion → 300. Goods over capacity
  at end of turn are thrown away with a message; food exempt. Unloading into
  a full warehouse warns. New-cargo-ready reports.
  Custom House (R-403) sells configured goods automatically.
  Note: events `goodsSpoiled`, `cargoReady`, `warehouseFull`; their wording and the report option to
  silence cargo-ready notices are UI (R-308, R-1001). Custom House sales are R-403.
  **Verify:** unit tests.

- [x] **R-306 Liberty bells, Sons of Liberty, Tories**
  Town Hall workers produce bells (free colonist 1? [VERIFY: no table rate; use House rate 3
  with Elder Statesman ×2]); Printing Press +50%, Newspaper +100%;
  Jefferson statesmen +50%; Paine + current tax rate %; Bolivar +20% membership. Each
  colony's accumulated bells vs population gives SoL% (Appendix F formula [VERIFY]). SoL ≥ 50%
  → +1 production per worker; 100% → +2 (100% also
  speeds education). Tory penalty: when Tories (non-members) ≥ threshold (Discoverer 10 …
  Viceroy 6) production −1 per threshold multiple. Population
  number color on map: white <50%, green ≥50%, blue 100%. National rebel sentiment =
  total bells averaged against population and feeds Founding Fathers (R-701).
  Note (see `docs/RULES.md` "Sons of Liberty"): statesmen make 3 (Elder 6) plus 1 free bell per
  colony; membership is a numerator/denominator pair drifting 1/64 per turn toward bells / (2 x pop),
  which supersedes the Appendix F formula; the Newspaper doubles instead of stacking on the press.
  **Verify:** unit tests reproducing Appendix F worked examples and the message thresholds.

- [x] **R-307 Crosses**
  Each colony produces 1 cross per turn automatically; Church and Cathedral add more
  [VERIFY: Church +1, Cathedral +2] and let workers preach at House/Shop rates; Firebrand
  Preacher ×2; Penn +50%. Immigration handled in R-405.
  Note: 1 / 2 / 3 flat crosses with nothing / Church / Cathedral; a Church does not
  multiply preachers, a Cathedral doubles them; Penn applies to preachers only.
  **Verify:** unit tests on cross totals.

- [x] **R-308 Colony screen UI**
  Layout: settlement view (buildings with worker slots) top-left, area view (3x3
  tiles with workers and totem poles) top-right, multi-function view (Production / Units /
  Construction with Buy and Change) right, people view (colonists row, SoL% flag, Tory% crown,
  food line with surplus/shortfall X's, crosses, bells) bottom-left, transport view (ships and
  wagons with holds) and warehouse strip bottom. Drag-and-drop between tiles, buildings, the
  outside "fence", and holds; click a worker for the Jobs menu with here/best values; Shift-drag
  for partial amounts; Tab/arrow keyboard navigation (Appendix K). Exit with ESC.
  Note: built as plain DOM over a pure model (`ui/colony-model.ts`, `ui/colony-screen.ts`). People and
  goods are shown once, where they are (square, building, gates, hold, warehouse); the people view
  carries the food, bells and crosses lines and the idle and outside rows. SoL and Tory figures are in
  the header as text; flag and crown art waits for R-1006. Leaving the colony already equipped is
  done from the unit's orders menu at the gates. The snapshot is a structural JSON, not pixels.
  The screen lies over the whole game (map and sidebar) rather than beside the map. A click selects a
  colonist, unit or cargo and a second click on a place sends it there; a click on the selected
  colonist opens the Jobs menu. A help line at the foot says what a click will do.
  **Verify:** e2e: drag a colonist from a tile to a building changes production; keyboard-only
  path loads cargo; snapshots.

- [x] **R-309 Colony AI auto-placement**
  `suggestPlacement(colony)` used when a colonist joins or when the AI manages a colony.
  Prefers food self-sufficiency, then the colony's best cash crop, then lumber/hammers.
  Note: `engine/placement.ts` (`docs/RULES.md` "Automatic
  placement"), with a small weight set: food while hungry, else by yield and price, a carpenter once
  the colony is fed, has three people and a project. Founders and joiners use it; `placeIdle` serves the AI.
  **Verify:** unit tests on fixture colonies.

- [x] **R-310 Education and specialty acquisition**
  Schoolhouse 1 teacher, College 2, University 3; teachable
  skill tiers per Appendix B "level" column (1 = Schoolhouse, 2 = College, 3 = University, 4 =
  not teachable). A teacher trains one student at a time over N turns [VERIFY: 4/6/8 by tier];
  outcomes: Criminal → Servant, Servant → Free Colonist, Free Colonist → teacher's skill;
  fails if no eligible student.
  Converts cannot be educated. A free colonist working a
  job long enough may become its specialist by experience [VERIFY: small per-turn
  chance]. Scouts become Seasoned after visiting villages.
  Note (see `docs/RULES.md` "Education"): the term is 4/6/8 turns by the teacher's own level;
  pupils are picked at random; learning by doing is limited to planters and fur trappers (1/100,
  1/200, 1/300) and to powers with no such expert yet. The Seasoned Scout promotion is done in R-503.
  **Verify:** unit tests per transition.

- [x] **R-311 Trade routes**
  Up to 4 stops per route, up to 6 cargoes to unload and 6 to load per stop, land or sea routes,
  default names, route cap [VERIFY: 12]. Assign wagons
  and ships with T; they follow the itinerary until cleared. Create/Edit/Delete menu.
  Note: the cap is 12. The Trade menu opens with Alt+T until the menu
  bar exists (R-1001); the itinerary editor is a table of four rows with multi-select cargo lists.
  **Verify:** unit tests for a two-stop loop moving goods; e2e creates a route.

---

## Phase 4 — Europe

- [x] **R-400 Market model** (Appendix C)
  Per good: starting bid chosen in [start1, start2]; ask = bid + 1 + burden; drift bounds
  [low, high]; a traffic volume per good that trades push (sales add, purchases subtract),
  attrition changes it each turn, volatility scales the shift; price falls when volume crosses
  `fall`, rises when it crosses `rise`. All four powers' trades feed one shared market per good
  with cross-port influence; AI powers sell too. Dutch: prices collapse slower and
  recover faster [VERIFY: halve their volume impact]. Food IS tradeable
  (it has a price row). Price change announcements.
  Note (see `docs/RULES.md` "Market"): prices and traffic are per power, coupled by every
  trade moving all four powers' traffic and by a shared volume; rum, cigars, cloth and coats are priced
  against one another and open around 8-18 rather than at the table's 11-13; tax applies to sales only.
  The Dutch feel two thirds of anyone's sales and recover half again as fast.
  **Verify:** unit tests: selling 1000 sugar drops the bid by ≥2 steps; drift recovers toward
  baseline; Dutch impact is smaller; initial prices within Appendix C ranges.

- [x] **R-401 Tax and boycotts**
  Tax starts 0 [VERIFY by difficulty]; applied to sales and purchases. The King
  raises it with a reason drawn from the event list (Appendix G2) and offers "Kiss
  pinky ring" or "Hold a <Good> Party": the party dumps that good from a ship
  in port, boycotts the good until back taxes are paid, and raises
  rebel sentiment. Fugger lifts all boycotts. Tax also rises on purchases of Crown resources
  and when building a Custom House; it can fall.
  Max tax [VERIFY 75%]. Paine's bonus uses it.
  Note (see `docs/RULES.md` "Tax"): tax starts at 0 on every level, applies to sales only, and is
  capped at 75%. No tax change is tied to purchases of Crown resources, to building a Custom House or to the
  loss of a royal unit. The +10 for accepting the King's frigate is R-406.
  **Verify:** unit tests for raise, party, boycott, back taxes, Fugger.

- [x] **R-402 Europe screen**
  Transit boxes (Expected Soon / Bound for New World), harbor view with holds,
  warehouse strip with bid/ask per good, docks with immigrants (sentry by default), transaction
  monitor (tax %, amount, net), RECRUIT / PURCHASE / TRAIN buttons, treasury. Dock options for
  an immigrant: board/don't board next ship, move to front, arm with muskets,
  equip tools (100), equip horses, bless as missionary, and the sell-equipment reversals. Ship
  options: set sail, unload all, move to front.
  Note: dock kit prices and the difficulty-based starting treasury follow
  `docs/RULES.md` "Europe docks and starting treasury". "Move to front" is covered by selecting the
  ship to load and by "board the ship in port now". Recruit lists the immigrant pool once R-405 lands.
  **Verify:** e2e buys 100 tools and loads them; prices and treasury update on screen.

- [x] **R-403 Custom House**
  With Stuyvesant and the building: a per-colony checklist of goods to export;
  each turn exports those goods above a keep-threshold [VERIFY: 50] at current prices minus tax,
  boycotted goods excluded; moves the market. During the revolution it keeps trading at 50% net.
  Note (see `docs/RULES.md` "Custom House"): a good sells at 100 down to 50,
  boycotts are ignored, wartime sales pay in full with no tax, and a nearby foreign warship stops a
  human's exports. The checklist is the colony screen's X key.
  **Verify:** unit tests.

- [x] **R-404 Recruit, train, purchase**
  Recruitment pool of 3 drawn from the immigrant class distribution (Appendix B2)
  weighted by era and crosses; recruit price = class transport cost scaled by how far the next
  cross threshold is [VERIFY: price falls as crosses accumulate, rises after each recruit]; the
  pool refills immediately. Train = Royal University list with fixed prices from Appendix B
  (−1 = not available). Purchase: Artillery (500, +100 per purchase [VERIFY]),
  Caravel 1000, Merchantman 2000, Galleon 3000, Privateer 2000, Frigate 5000 [VERIFY all ship
  prices], rising with demand. Insufficient funds refused.
  Note: the pool draw, first pool and price follow `docs/RULES.md` "Recruiting,
  training and purchases": the class distribution and the era are unused, ship prices are constant, and only
  artillery rises.
  **Verify:** unit tests.

- [x] **R-405 Immigration via crosses**
  National cross total vs threshold (Appendix F); when reached one pool member moves to the docks
  (random, or chosen with Brewster) and the threshold rises.
  English need only 2/3 the crosses. Brewster removes criminals and servants
  from the pool. Immigrants on the docks are on sentry and board the next departing ship.
  Note (see `docs/RULES.md` "Immigration"): needed = 8 + 2 per colonist and unit, crosses
  reset to zero on arrival, and the docks add or subtract 2 a turn. `brewsterPool` is applied when the
  father is elected (R-701).
  **Verify:** unit tests on threshold progression, English factor, Brewster.

- [x] **R-406 Royal events** (Appendix G2)
  Tax raises with reasons; demands for gold ("fund the war") with tax penalty on refusal
  [VERIFY mechanics]; King declares war on another power, cancelling your treaty and granting
  gold plus Veteran Soldiers; King offers a Frigate when privateers prey on
  you; royal galleon transports a parked Treasure Train for 50% (or for the
  tax rate; free with Cortes); mercenary offers once treasury ≈ 5000+
  (always veterans, take-all-or-nothing); REF reinforcement notices;
  Treaty of Utrecht event transferring one power's colonies to another
  [VERIFY trigger]; foreign power independence.
  Note (see `docs/RULES.md` "Royal events"): there is no demand-for-gold
  event. The treasure cut is a function awaiting treasure
  trains (R-506); wars use a minimal `Player.stance` until diplomacy (R-80x); wartime mercenaries are
  R-902. The app asks about tax rises, Crown offers and Brewster's choice after each end of turn.
  **Verify:** unit tests triggered via forced RNG; events logged.

---

## Phase 5 — Natives

- [x] **R-500 Tribes data** (Appendix D)
  8 tribes with tech level (0 Semi-Nomadic camps: Apache, Sioux, Tupi; 1 Agrarian villages:
  Arawak, Iroquois, Cherokee; 2 Advanced cities: Aztec; 3 Civilized cities: Inca), treasure
  name, capital flag, homeland radius (camps/villages 1, cities 2), skills taught by
  terrain, starting braves, aggression. Attitude scale: Content, Uneasy, Restless, Angry, War
  with intensity adverbs.
  Note: the Inca reach 3 squares, a settlement starts with 3 + 2 x tech people
  and one brave, and the taught skill is computed from the land around a settlement (R-508) rather
  than listed per tribe. There is no aggression number: hostility comes from alarm (R-502).
  **Verify:** table snapshot.

- [x] **R-501 Settlements**
  Placed by map gen (America: from the Appendix D regions; New World: by climate preference), never
  adjacent to each other, ≤ 84 total. Each has population (braves), taught skill,
  "already taught" flag, wanted goods, goods for sale, alarm per European power, mission
  (owner, expert flag), visited-by-scout per power. Capitals have more braves, treasure, goods.
  Note: placement follows `docs/RULES.md` "Settlements"; random maps have no
  climate preference, only spread from eight capitals. Wanted goods, wares and the
  taught skill are computed (R-505, R-508), not stored. Settlements may be adjacent to nothing but
  land; nobody can enter one until R-503. Brave units come with R-507.
  **Verify:** map gen tests.

- [x] **R-502 Tribal anger and village alarm**
  Two layers: tribe anger (from direct acts: attacks, tribute demands, improving/working homeland
  without purchase, denounced missions, burial-ground desecration; capital involvement weighs
  more) and per-settlement alarm (from colony proximity, population and building density,
  weapons in colonies, soldiers nearby, foreign missions). Alarm feeds anger. Reductions: time,
  trade and gifts, missions, Pocahontas (reset to Content, halve future alarm), French halve all
  alarm. Thresholds move the tribe through the 5 attitudes; at War braves raid
  (R-506). Alarm shown as colored exclamation marks over settlements (green → blue → yellow →
  brown → red) and on a nation-colored background if alarmed at another power.
  Messages per cause.
  Note (see `docs/RULES.md` "Alarm"): tribal alarm 0..100 in four levels with
  banked goodwill, settlement alarm fed by the most alarming colony within 6 and by soldiers nearby.
  One-off changes (trade, gifts, tribute, attacks, land, shrines) land with their features
  (R-503..R-510); raids and the nation-coloured background for alarm at others with R-506/R-1006.
  Events `attitudeChanged`, `missionsBurned`, `tribeMet` carry the causes for the message layer.
  **Verify:** unit tests on each contribution and threshold transitions.

- [x] **R-503 Entering a settlement**
  Menu by unit type: Trade With Village (ships/wagons with cargo; ships only after land contact
  and not when Restless or worse), Enter Hostile Village, Establish Mission / Denounce Heresy of
  X's Mission / Incite Indians (missionaries), Live Among The Natives (unskilled colonists and
  pioneers; criminals refused; experts honored but not taught), Ask to Speak With Chief (scouts:
  learn wanted goods and taught skill, tales of nearby lands reveal map, gift of gold/beads, or
  the scout is killed with chance by attitude), Demand Tribute (soldiers,
  dragoons, scouts), Attack Village (soldiers, dragoons, scouts, artillery),
  Cancel. First-contact greeting offers a treaty gifting the land you occupy.
  Note: menu, treaty, chief and tribute are built to `docs/RULES.md` "Entering a
  settlement", with the demand/supply model they need. The other menu entries are listed but
  answer "not yet" until their own items: missions and incite R-504, trade and hostile entry R-505,
  attack R-506, living among the natives R-508. The treaty grants no land.
  **Verify:** unit tests per branch with forced RNG.

- [x] **R-504 Missions and converts**
  A mission lowers that settlement's alarm toward its owner and raises it toward rivals; converts
  appear at the mission owner's nearest colony with a message; Jesuit
  missions are stronger and drawn brighter; Brebeuf makes all missionaries experts; de Sepulveda
  raises conversion on defeating settlements; de las Casas converts all
  current converts to Free Colonists. Denounce Heresy: council decides, one missionary burns.
  Incite: pay gold for the tribe to attack a named European power's colonies.
  Converts not placed in a colony within 8 turns
  return to the tribe. Natives burn missions when at war.
  Note (see `docs/RULES.md` "Missions"): converts arrive through friendly brave
  visits (`visitConvert`) and won attacks (`forcedConvert`), which R-506/R-507 call; `freeConverts` is
  las Casas's effect for R-701. Existing missions are not upgraded by Brebeuf.
  **Verify:** unit tests.

- [x] **R-505 Trade with natives**
  Offer a cargo; the settlement offers gold if it wants it (never the same good twice in a row
  except muskets; refuses goods it has in abundance; demand inferred from local terrain); haggle
  once for a higher price ("fairer price" counter), accept, or give as a gift (bigger alarm
  reduction); after selling/gifting they offer 3 goods to buy with haggling.
  Horses and muskets sold to natives upgrade their braves.
  Ship trade pays less than wagon trade. Trade goods are what camps want most early.
  Note (see `docs/RULES.md` "Trade with natives"): muskets are not exempt from the
  consecutive-good rule, and a ship's only handicap is being offered a
  quarter of the quantity. Talks run as actions (`enterSettlement` trade, then `parley`).
  **Verify:** unit tests of price formula, consecutive-good rule, inventory effects.

- [x] **R-506 Native raids and settlement combat**
  At war, braves raid colonies: outcomes wipe out the party, steal goods, burn a building, take
  scalps (kill a colonist), damage a ship in harbor, plunder gold; artillery in a
  fortified colony gets +75% vs raids. Natives at Angry make "surprise raids" with
  chief denial. Natives also make demands at Restless: goods from wagons
  or colony stores, gold reparations, and when
  Content give food or goods. Attacking a settlement
  kills a brave per win; at 0 it burns, yielding treasure for Aztec/Inca (always, more, with
  Cortes), converts with de Sepulveda, and destroying a capital demoralizes the
  tribe. Natives capture muskets/horses from defeated soldiers/dragoons.
  Natives may burn a colony to the ground when they win against an undefended one.
  Spanish +50% attacking settlements.
  Note (see `docs/RULES.md` "Land combat" and "Natives at war"): built with the land
  combat core R-600 will complete. No colonist is killed in a raid, there are
  no gold reparations, and artillery's raid bonus is +100% in any colony. Ship damage in raids waits
  for R-602. Braves now exist as units (one per settlement); when and where they go is R-507, which
  calls `braveAttacks` and `braveVisits`.
  **Verify:** unit tests; sim invariant: settlements with pop 0 are removed; a tribe reaching 0
  settlements is Extinct.

- [x] **R-507 Native AI**
  Braves wander near their settlement (nomads farther); at war they path to the nearest enemy
  colony or unit; the tribe accepts peace via chief dialog after losses or cooling; braves
  acquire horses and muskets from trade and captures; natives may join the Tory side during the
  revolution if they hold a grudge.
  Note: brave movement is a simple rule
  set (`docs/RULES.md` "Native AI"); breeding, rearming and siding with the Crown
  are written up there too. Peace returns when alarm cools below 75 (no dialog).
  **Verify:** sim 300 turns with natives only: no exceptions; raids occur when at war.

- [x] **R-508 Learning from natives**
  Each settlement teaches one skill (Appendix D by terrain); after teaching once the village
  says it has nothing else to teach [VERIFY: capitals teach repeatedly];
  refusals for criminals, experts, angry villages,
  converts; servants are taught.
  Note (see `docs/RULES.md` "Learning from natives"): the skill is computed from the
  settlement's surroundings, capitals teach without limit, and a wary tribe's lessons may fail.
  **Verify:** unit tests.

- [x] **R-509 Lost City Rumors**
  Outcomes: nothing but rumors; small ruins gold; Seven Cities of Cibola (treasure train);
  Fountain of Youth (choose immigrants from an enlarged pool [VERIFY: 8 picks]); burial mounds
  (search → empty / trinkets / treasure; or they are a tribe's sacred grounds → immediate war);
  expedition vanishes (unit lost); friendly tribe gift; holy shrines (tribe displeased); survivors
  of a lost colony join as a Free Colonist. Weights by difficulty; Seasoned Scouts better; de
  Soto makes results always positive.
  Note (see `docs/RULES.md` "Lost City Rumors"): nine equally likely rolls with
  conditions rather than weights by difficulty; difficulty only enters through the shrine alarm. De
  Soto helps scouts only. The Fountain gives 8 picks from the ordinary pool.
  **Verify:** unit tests on distribution via forced RNG.

- [x] **R-510 Native land dialog**
  Working, plowing, roading, clearing, or settling homeland: natives ask you to stop; options
  Leave / Offer gold (price by tribe, distance, capital) / Take it (anger). Minuit: land is free.
  First-contact treaty may gift currently occupied land.
  Note (see `docs/RULES.md` "Native land"): plowing open land and founding a colony are
  never questioned (unpaid plowing is resented when finished), and the treaty
  grants nothing. The colony screen asks when a colonist is dropped on a native square; the pioneer
  keys ask before clearing forest or building a road.
  **Verify:** unit tests.

---

## Phase 6 — Combat

- [x] **R-600 Land combat resolution** (Appendix G)
  Strengths from Appendix B. Modifiers: Attack Bonus +50% always for the attacker; Veteran +50%;
  Terrain defense bonus for the defender (forest 50%, hills 100%, mountains 150%, open marsh/swamp
  25%); Ambush: natives get the terrain bonus on attack and defense; colonial units get it vs the
  REF outside colonies; Fortified +50%; Colony: Stockade +100% / Fort +150% / Fortress +200%
  (replaces plain fortify); Artillery In Open −75%; Artillery +75% vs native raids in a fortified
  colony; Spain Bonus +50% vs natives; Expeditionary Force (bombardment) +50% attacking colonies;
  Rebels/Tories popular-support bonus = attacker's side's % in the colony during the revolution;
  Fatigue: attacking with partial moves fights at moves/3 strength after a confirmation;
  Drake +50% privateers. Win probability = A/(A+D). Outcomes: Dragoon loses horses →
  Soldier (natives capture them); Soldier loses muskets → Colonist; Colonist/Pioneer/Scout/Wagon
  captured (captured soldiers lose veteran status);
  Treasure captured; Artillery → Damaged → destroyed; Braves killed;
  Continental/REF units demoted or destroyed. Promotion: non-veteran soldier or
  dragoon that wins may become Veteran (chance [VERIFY 1/3]; Washington always); during the
  revolution Veterans may harden to Continental Army. A unit that
  fights cannot move further that turn. Optional "Combat Analysis" pre-battle screen listing every
  modifier by name (Appendix G).
  Note (see `docs/RULES.md` "Land combat"). Differences from the text above:
  Fortified adds to the place bonus (capped), scouts and pioneers are destroyed rather than
  captured, artillery has +100% against raids in any colony, an attack costs one full move (a
  mounted unit keeps the rest), and the Plowed, Expeditionary Force and Founding Fathers labels are
  unused. Drake and the ship terms arrive with naval combat (R-602); `previewAttack` feeds the
  Combat Analysis dialog (R-603).
  **Verify:** unit tests with fixed RNG covering every modifier and transition.

- [x] **R-601 Colony attack, capture, siege**
  Defender = best defensive unit present; with none, an unarmed colonist defends at 1 (Revere:
  takes 50 stockpiled muskets). Last defender falls → colony captured intact with inhabitants
  swearing allegiance, gold plundered; natives burn instead.
  Siege: when enemy combat units adjacent outnumber friendly ones, only soldiers/dragoons can be
  created there. Foreign colonies cannot be attacked during your revolution.
  Scouts at a foreign colony: Meet With Mayor / Infiltrate / Attack
  (infiltration may fail and lose the scout).
  Note (see `docs/RULES.md` "Colonies under attack"): a colony falls
  only when a drafted colonist is beaten; the siege count follows Revolution Now; under siege a
  colonist leaves armed from the stores. Meeting the mayor waits for diplomacy (R-801). Ship damage
  and repair were built here because capture and raids need them.
  **Verify:** unit tests.

- [x] **R-602 Naval combat**
  Only Privateers, Frigates, Men-O-War attack. Privateers carry no flag (no
  war declared on attack; nation hidden; "What pirates?" diplomacy). Win probability A/(A+D);
  loser is damaged and sent to the nearest Drydock or Europe losing cargo,
  or sunk [VERIFY: sunk when damaged with no repair available? or chance];
  winner may capture one cargo. Zone of patrol: armed ships
  slow or stop foreign ships entering adjacent tiles, which may evade.
  Forts and Fortresses fire on adjacent enemy ships each turn, stronger with artillery
  inside. Repairs complete after N turns [VERIFY].
  Magellan +1 move to all ships.
  Note (see `docs/RULES.md` "Naval combat"): sinking is by the victor's guns against the
  loser's hull with fleet-size overrides; any warship takes prizes; the victor's cargo choice is
  automatic (most valuable first). "What pirates?" diplomacy belongs to R-801.
  **Verify:** unit tests.

- [x] **R-603 Combat UI**
  Combat Analysis dialog (toggle in Game Options) showing both strengths and the modifier list;
  result flash; event log entries for every combat using our own phrasing.
  Note: the dialog is on by default; the switch is the `new-world:combat-analysis` setting, which the
  Game Options screen (R-1001) will expose. The e2e loads a prepared save to stage a fight.
  **Verify:** e2e: attack dialog appears with numbers.

---

## Phase 7 — Founding Fathers

- [x] **R-700 Fathers data** (Appendix H)
  25 fathers, 5 per category, with era weights (1492–1600, 1600–1700, 1700+) and effects.
  Note: the table matches Appendix H row for row; the one-line effects say what
  each father does in play (e.g. De Soto helps scouts at rumors, Cortes makes the Crown's cut the tax rate).
  **Verify:** table snapshot; exactly 25; weights match Appendix H.

- [x] **R-701 Continental Congress**
  National bells accumulate toward the next father; cost rises with the number elected and
  difficulty (Appendix F [VERIFY]). When one joins, the player picks the next candidate from one
  offer per category, drawn by era weight (a father of a higher weight tier does not
  appear until one of the lower tier in the same category has joined — implement as: within a
  category, offer the candidate with the highest current-era weight among those not yet elected,
  randomized by weight). Effects applied via `hasFather(state, player, id)` consulted by each rule.
  Election message; choice prompt.
  Note (see `docs/RULES.md` "Continental Congress"): the candidate is chosen first and
  then paid for; the "higher weight tier" condition is not implemented,
  so the draw is simply by era weight; surplus bells are lost.
  **Verify:** one unit test per father asserting its rule path changes an output.

- [x] **R-702 Congress report (F3)**
  Shows elected fathers, current candidate and bells needed, rebel sentiment %, REF size, next
  session, with our own one-line descriptions.
  Note: the report screen (`ui/report.ts`) is the frame the other advisers (R-1000) will use.
  **Verify:** e2e snapshot.

---

## Phase 8 — Foreign European powers

- [x] **R-800 Nations data** (Appendix I)
  England (immigration: 2/3 crosses), France (cooperation: half alarm), Spain (conquest: +50%
  vs natives), Netherlands (trade: stable prices, starts with a Merchantman instead of a Caravel).
  Start: one ship carrying a Soldier (50 muskets) and a Hardy Pioneer (100 tools) on the eastern
  Sea Lane [VERIFY: Spain's soldier is a Veteran]. Home ports London,
  La Rochelle, Seville, Amsterdam; colony-area names New England etc.; independent names United
  States of America, Republic of Quebec, Republic of Mexico, Republic of Surinam; AI leader
  personalities (Appendix I). Nation colors red/blue/yellow/orange.
  Note: in the landing party the pioneer is hardy only for France, and the
  soldier a veteran only for Spain and for a human on the two easiest levels.
  **Verify:** snapshot; a new game has the right starting units per nation.

- [x] **R-801 Diplomacy**
  Contact when units are adjacent (chance) or a scout meets a mayor. States: no contact, peace,
  war, alliance [VERIFY alliance effects]. Dialog outcomes: greetings, demarcation treaty (spheres
  of influence; trespass angers), peace proposals, demands to withdraw forces near colonies or
  pay to demobilize, tribute demands and offers, piracy complaints about privateers, requests to
  join a war on a tribe or on a third power, war declarations; attacking a colonist/colony or a
  flagged warship is an act of war. Mood from relative military/economic strength. Franklin:
  Europeans always offer peace and the King's wars don't bind you. Treaty violation messages.
  Jan de Witt: trade in foreign colonies (goods swap or gold).
  Note (see `docs/RULES.md` "Diplomacy"): there is no
  alliance state and no demarcation treaty; "alliance" is paying a power to fight a third. Strengths
  are whole-map totals rather than per region; the goods-instead-of-tribute and joint-war steps are
  left out; foreign-colony trade is a cash sale.
  **Verify:** unit tests.

- [x] **R-802 European AI**
  Each AI power uses the same action API, parameterized by its leader personality (aggressive/
  friendly, expansionist/perfectionist, civilize/militaristic). It explores, founds coastal
  colonies on good sites, manages colonists (R-309), builds, ships goods to Europe, recruits,
  trades with natives, defends, attacks when at war and stronger (no suicide attacks),
  and may reach independence by colonist support. Budget ≤200 ms
  per AI power per turn in Node.
  **Verify:** sim 4 powers x 350 turns on 5 seeds: no exceptions, each AI founds ≥3 colonies by
  turn 100, gold never negative, per-turn AI time within budget.
  *Built:* `src/ai/european.ts` (policy in docs/RULES.md "Computer powers"). Not built: native
  trade, missions and wagon trains by computer powers; of the leader traits only expansion steers
  this policy (the others act through R-801). Its colonies sell surplus directly rather than by ship.

- [x] **R-803 Foreign Affairs report (F8)**
  Before de Witt: war/peace matrix only. After: colonies, population, average colony size,
  military power, naval power, merchant marine per power. Unavailable during the
  revolution.
  **Verify:** e2e snapshot.

---

## Phase 9 — Independence and endgame

- [x] **R-900 Declaration**
  Allowed when national rebel sentiment ≥ 50%; irrevocable; ends the turn. Effects: Europe
  closes (Custom Houses keep trading at 50% net); no new colonies; no attacks on foreign
  colonies; no mayor visits; Continental Army musters: in each colony with SoL ≥ 50% that holds
  ≥ 50 muskets [VERIFY], veteran soldiers/dragoons become Continental Army/Cavalry in numbers
  scaling with SoL%; Tory uprisings arm Tory militia near low-SoL colonies;
  the REF (Appendix F sizes by difficulty, grown by REF reinforcement events) lands in
  waves near colonies, preferring weak coastal ones; Royal Navy seizes ships at
  sea or in captured ports. The turn after declaring, an advisor states the
  bells needed for foreign intervention.
  **Verify:** unit tests; sim scenario from a fixture save.
  *Built:* `src/engine/independence.ts`. As built: no musket requirement for the muster;
  Custom Houses sell at full price untaxed (not 50%); the "bells needed" notice comes with the
  first bells rung after declaring. The Royal Navy's seizures are those in Europe at the
  Declaration and under a landing's anchorage. Moving and fighting the landed units is R-901.

- [x] **R-901 War of independence**
  REF units use Appendix B stats and the bombardment bonus; colonists get the ambush bonus
  outside colonies; popular-support bonus on colony attacks; bells in
  REF-occupied colonies raise Tory sentiment instead. Intervention: when bells since declaration
  reach the stated number, a foreign power declares war on the King and lands Men-O-War plus
  Continental-equivalent troops at a held port, grants the bombardment bonus, and offers paid
  mercenaries. Lose when the REF holds all your
  colonies, all your coastal colonies, or ≥90% of your population, with warnings beforehand.
  Win when you control all your colonies and the REF's ground
  forces are nearly destroyed in the New World and the Old. If
  still fighting in 1850, Congress sues for peace.
  **Verify:** sim from fixtures: both outcomes reachable with forced RNG.
  *Built:* `src/engine/war.ts` (rules in docs/RULES.md "War of Independence"). There is
  no "all coastal colonies" test separate from "no ports", and the 90% is of people in colonies.
  The Crown's marching orders are a simple rule of our own.

- [x] **R-902 Score, epitaph, Hall of Fame**
  Score = +1 per criminal/servant, +2 per free colonist, +4 per skilled colonist; +5 per father;
  +1 per 1000 gold; +1 per point of rebel sentiment; −(difficulty index + 1) per native settlement
  destroyed; independence bonus ×2 if first to independence, +50% if second, +25% if third; +1
  per bell produced after intervention; bonus for declaring before 1780 (earlier = larger)
  [VERIFY curve]; Hall of Fame ranking multiplies by a difficulty factor [VERIFY]. Scoring runs at
  1800 (or on Retire, or on winning); play may continue unscored. Show a
  "Colonial Rating %" and an epitaph line chosen from our own list of named things (do not
  copy anyone else's list).
  **Verify:** unit tests; e2e: 1800 scoring screen via a fixture save.
  *Built:* `src/engine/score.ts`, `src/ui/reports/score.ts`, `src/app/hall-of-fame.ts`. As
  built: bells after intervention score 1 per 100 (cap 100), not 1 each; the early bonus is
  2 per year before 1780 and needs the war won; converts score 1. F10 shows the score now.

---

## Phase 10 — Reports, help, polish

- [x] **R-1000 Advisor reports**
  F1 Terrain Information, F2 Religious Adviser (crosses, next immigrant, missions), F3
  Continental Congress, F4 Labor Adviser (colonist counts by type, drill-down to locations), F5
  Economic Adviser (tons bought/sold and gold per good, foreign trade), F6 Colony Adviser (goods
  per colony), F7 Naval Adviser (ships, cargo, location, destination), F8 Foreign Affairs, F9
  Indian Adviser (tribes, attitudes, missions), F10 Colonial Score. Click an item to zoom.
  **Verify:** e2e opens each report without console errors; snapshots.
  *Built:* `src/ui/reports/advisers.ts` on the report frame, rows clickable to show the place.
  The Economic Adviser gives net tons sold per cargo (gold per cargo and foreign trade are not kept
  by the engine); the Labor Adviser's drill-down is the list of places on each row.

- [x] **R-1001 Options and notifications**
  Game options: Show Indian Moves, Show Foreign Moves, Fast Piece Slide, End of Turn, Autosave,
  Combat Analysis, Tutorial Hints (Water Color Cycling is a shader toggle). Colony report
  options: ten toggles. Tutorial hints in our own words at
  19 hint moments. Scrollable event log.
  **Verify:** e2e toggles persist across reload.
  *Built:* Alt+G and Alt+O dialogs over `ui/options.ts`; notices in `ui/notices.ts`; hints in
  `ui/hints.ts` (shown in the log, not as dialogs). Fast piece slide and Water shimmer are stored
  and took effect with R-1006. There is no menu bar: the menus are reached by their Alt keys.

- [x] **R-1002 Encyclopedia**
  In-game reference generated from the data tables (cargo, units, terrain, skills, buildings,
  fathers, concepts: Disband, Fortify, Plowing, Roads, Sentry, Trade Route, Veteran Units,
  Prices, Taxes, Liberty Bells, Crosses, Hammers) with our own prose; right-click on anything
  opens its page. Zero copied text.
  **Verify:** e2e: every table entry has a page; `test/unit/no-copied-text.test.ts` asserts none of
  a maintained list of 40 distinctive third-party sentences appears in `src/`.
  *Built:* `src/ui/pedia.ts`, `src/ui/pedia-screen.ts`. Conflict with C1: a list of third-party
  sentences cannot itself be committed, so the test keeps 40 fingerprints (hashes of the first
  eight words of each) of sentences that must never appear, and scans `src/` for matches; where a
  local, never-committed folder of such text (`ref/orig`) is present it also checks every
  eight-word run of it.

- [x] **R-1003 Audio**
  Synthesized or CC0 cues for move, combat, build complete, immigrant, new turn,
  native drums at war; optional generated period-style ambient music via WebAudio; per-category
  toggles (Background Music, Event Music, Sound Effects) persisted.
  **Verify:** unit tests that cues map to events.
  *Built:* `src/ui/audio-cues.ts`, `src/app/audio.ts`; all synthesized, no audio files. Alt+S.

- [x] **R-1004 Difficulty**
  Discoverer, Explorer, Conquistador, Governor, Viceroy applying Appendix F multipliers.
  **Verify:** unit tests on multipliers.
  *Built:* the levels were already applied rule by rule; this adds `src/engine/difficulty.ts`
  (the headline numbers in one place), the chooser on the title screen, and Appendix F corrected.

- [x] **R-1005 Save/load UI**
  10 slots; the last two are autosaves (last turn, and every ten years); export/import
  as `.json` via File API; "obsolete save" and "map size mismatch" style errors.
  **Verify:** e2e: save, reload page, load, state identical.
  *Built:* `src/app/slots.ts`, `src/ui/save-dialog.ts`, Alt+L. Import is offered inside the dialog,
  so with no save at all a game must be started first to reach it.

- [x] **R-1006 Visual pass**
  Palette of ~32 colors evoking VGA; consistent pixel grid; unit glyphs per type with nation
  color orders box; colony icon with population number colored by SoL; selected-unit blink;
  exclamation marks on settlements; terrain readable at every zoom.
  **Verify:** screenshot baselines at 1280x800 checked against `docs/VISUAL_CHECKLIST.md`.
  *Built:* `src/ui/pixel-art.ts` (palette and all map art as 16 x 16 indexed sprites), squares
  snapped to 64/32/16/8 px, blink, water shimmer and piece slide (the two R-1001 options now act).
  Baselines are fingerprints of a reference render computed without a browser
  (`test/helpers/reference-canvas.ts`); the browser's canvas must match it pixel for pixel, so
  the baselines hold on any platform; confirmed on macOS and on Linux (the Playwright 1.64 image,
  in a container). PNGs are written to `test-results/` for review.

- [x] **R-1007 Performance and size**
  Initial JS ≤ 400 KB gzipped; cold load ≤ 1.5 s on throttled Fast 3G; end-turn with 4 AIs and
  40 colonies ≤ 500 ms.
  **Verify:** Playwright budget tests; vite build size assertion script.
  *Built:* the app is split into a 2.3 KB entry (title screen) and the game chunk fetched behind
  it (134 KB gzipped in all). Measured: title up in about 1.2 s on Fast 3G; end of turn with four
  powers and forty colonies about 170 ms at worst. `scripts/check-size.mjs`, `test/e2e/budget.spec.ts`.

- [x] **R-1008 Static deployment**
  Relative base path; PWA manifest and service worker for offline play; GitHub Pages workflow
  running `npm run check` then deploying on main.
  **Verify:** `npx vite preview` passes the e2e suite; workflow YAML validated by `actionlint` if available.
  *Built:* manifest and icon in `public/`, service worker generated by `vite.config.ts`, workflow in
  `.github/workflows/deploy.yml`. The workflow passes `actionlint` (the wasm build, a dev
  dependency; `test/unit/deploy/workflow.test.ts`). Its steps (`npm ci`, `npm run check`, the
  Playwright install, `npm run test:e2e`) were run in order on Linux in the Playwright container
  and pass. The workflow has run on GitHub Actions (both jobs green) and the game is
  served from GitHub Pages at https://colebrumley.github.io/new-world/.

- [x] **R-1009 Balance simulation**
  20 seeds x full games with 4 AIs → `docs/BALANCE.md` with first-colony turn, colonies per power
  at 1600/1700/1800, independence declarations, native wars, and flags for metrics outside
  Appendix L. Out-of-range metrics become new `[!]` tuning items (data tables only).
  **Verify:** `SIM=1 npm test -- balance` writes the report.
  *Built:* `test/sim/balance.test.ts` writes `docs/BALANCE.md` (20 seeds, about 100 s). What it
  found, and what was done about it, is in the tuning items below.

- [x] **R-1010 Mouse play on the map**
  Goal G4 asks that the game be playable with the mouse; the map screen needed the keyboard for
  everything but panning. On the map: click one of our units to make it the active unit (waking it
  if it has standing orders; a list when several stand on the square); click a square beside the
  active unit to step there, with the same questions a key press raises (landfall, attack, village);
  drag from the active unit to any square to send it there (one step if adjacent, Go To otherwise);
  the wheel zooms; in Go To targeting the cursor follows the pointer. A command bar in the sidebar
  gives every map order, End Turn, Europe, zoom, the ten reports and the Alt menus a button, each
  running the same command as its key (one table, `src/ui/command-bar.ts`). Click-to-centre, drag
  to pan, edge-scroll, the New World view and right-click encyclopedia stay as they were.
  **Verify:** unit: `pointer.test.ts` (what a click or a drag means), `command-bar.test.ts` (every
  button names a command its key reaches; snapshot); e2e `mouse.spec.ts`: a game played to a
  founded colony and an ended turn without touching the keyboard; wheel changes the zoom level.
  *Built:* `src/ui/pointer.ts` (pure click, drag and wheel rules), `src/ui/command-bar.ts` (21
  buttons; the report and menu lists are read from the keyboard table), `zoomAt` in `view.ts`, and
  the handlers in `app/game-screen.ts`. A click on our colony still opens it, so a unit beside its
  colony is walked in by dragging. The Terrain button toggles hidden terrain (H shows it until the
  next key). Buttons do nothing while a question, report or other screen is up.
  After review: End turn always ends the turn (Enter's other meanings are not the button's), and
  Go to reads Cancel while a square is being picked; in view mode a click on the active unit
  returns to move mode; the Go To cursor and the drag marker are recomputed when the view moves
  under the pointer (edge-scroll, wheel); a drag orders only the unit it began on; the sidebar
  scrolls in a short window, with the status line directly under the buttons (seen at 1024x640).
  A pinch on a trackpad or a touch screen no longer magnifies the page (it cut the left and top
  edges off the colony screen): the game element refuses Ctrl+wheel and Safari's gesture events
  and sets `touch-action: pan-x pan-y`; over the map the wheel still zooms the map.
  A page magnified all the same (browsers restore it with the page, and keep some gestures to
  themselves) shows a notice naming the key that undoes it, Ctrl/Cmd+0 (`src/ui/magnified.ts`).
  Over the map a pinch zooms the map about the fingers: Ctrl+wheel with a shorter step
  (`PINCH_STEP`), Safari's gesture events and two fingers on a touch screen (`pinchTravel`; the
  canvas sets `touch-action: none`). The browser's zoom keys, Ctrl/Cmd with plus or minus, zoom the
  map while it has the keyboard; with Ctrl or Cmd held no other key is a map command.
  Later: the pointer's shape says what a click will do (`mapCursor`): an arrow the way the active
  unit would step, a hand on a colony that would open or a unit that would be picked. A colony or
  unit of ours beside the active unit is stepped onto by a click on the part of its square nearest
  the unit (`STEP_RIM`, the touching corner for a diagonal); the rest of the square opens or picks
  as before. This is how a unit is walked into its colony diagonally without a numeric keypad.

### Tuning items raised by R-1009

The first balance run found five metrics outside Appendix L and one oddity. They were then worked
on (the computer powers' policy in `src/ai/european.ts` and its table `AI_PLAN`, and how often a
brave calls). After that work every metric is within its range on all twenty seeds; the figures
are in `docs/BALANCE.md`. These ranges are checked on those twenty seeds only.

- [x] **T-1 First colony by turn 8.** Was 14 of 80 powers late (latest turn 18). Ships now judge
  sites by sea distance, and a power with no colony takes the nearest fair site
  (`AI_PLAN.firstColonyHaste`). Now every power founds by turn 8.
- [x] **T-2 Colonies per power at 1800.** Was one power at 5. Now 6 to 11, within 6–20.
- [x] **T-5 A computer power at 50% rebel sentiment by 1800.** Was none (best 29%). Colonies now
  seat statesmen and build presses first; some power reaches 50% in three seeds out of four.
- [x] **T-6 Native gifts.** Was about 13,500 a game. A brave beside a colony now calls on about
  one turn in eight (`NATIVE_AI.callChance`); about 800 a game.
- [x] **T-3 Native wars per game.** Now 1–5 in every game (mean 3.2). A war is counted as open
  war between a people and a power (attitude at war, a colony burned, a settlement destroyed);
  raids by one angry settlement are reported apart.
- [x] **T-4 Settlements destroyed by 1800.** Was none in any game. Computer powers now keep
  soldiers, answer a people from the "angry" level (shifted by the leader's temperament), and a
  militaristic leader campaigns unprovoked until he has destroyed four settlements. Now 6–26%
  in every game (mean 14.9%). The 60% odds rule is unchanged.
- [x] **T-7 Colonies per power at 1600.** Was one power at 2. The cause was a deadlock, not a
  number: a ship waited for ever beside a landing square another unit stood on. Fixed; now 4–8.

---

## Appendix A — Terrain

Columns: Move cost, Defense (×25%), Improve (turns to clear/plow/road, derived), Value (AI site
weight). Yields are the raw table values for a free colonist. **Displayed/engine food = raw+1 when
raw>0; lumber = raw×2**. Clearing gives the open type in the same row.

| Open | Mv | Def | Imp | Val | Food | Sug | Tob | Cot | Fur | Lum | Ore | Sil | Fish | Forested | Mv | Def | Imp | Val | Food | Sug | Tob | Cot | Fur | Lum | Ore |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Tundra | 1 | 0 | 4 | 2 | 2 | | | | | | 2 | | | Boreal | 2 | 2 | 4 | 3 | 1 | | | | 3 | 2 | 1 |
| Desert | 1 | 0 | 3 | 2 | 1 | | | 1 | | | 2 | | | Scrub | 1 | 2 | 4 | 1 | 1 | | | 1 | 2 | 1 | 1 |
| Plains | 1 | 0 | 3 | 4 | 4 | | | 2 | | | 1 | | | Mixed | 2 | 2 | 4 | 3 | 2 | | | 1 | 3 | 3 | |
| Prairie | 1 | 0 | 3 | 4 | 2 | | | 3 | | | | | | Broadleaf | 2 | 2 | 4 | 3 | 1 | | | 1 | 2 | 2 | |
| Grassland | 1 | 0 | 3 | 4 | 2 | | 3 | | | | | | | Conifer | 2 | 2 | 4 | 3 | 1 | | 1 | | 2 | 3 | |
| Savannah | 1 | 0 | 3 | 4 | 3 | 3 | | | | | | | | Tropical | 2 | 2 | 6 | 3 | 2 | 1 | | | 2 | 2 | |
| Marsh | 2 | 1 | 5 | 2 | 2 | | 2 | | | | 2 | | | Wetland | 3 | 2 | 6 | 1 | 1 | | 1 | | 2 | 2 | 1 |
| Swamp | 2 | 1 | 7 | 2 | 2 | 2 | | | | | 2 | | | Rain | 3 | 3 | 7 | 1 | 1 | 1 | | | 1 | 2 | 1 |
| Arctic | 2 | 0 | 4 | 0 | 0 | | | | | | | | | — | | | | | | | | | | | |
| Hills | 2 | 4 | 4 | 2 | 1 | | | | | | 4 | | | (hills overlay any land type; forest flag allowed) | | | | | | | | | | | |
| Mountains | 3 | 6 | 7 | 2 | 0 | | | | | | 4 | 1 | | no colonies, no forest | | | | | | | | | | | |
| Ocean | 1 | 0 | 2 | 3 | | | | | | | | | 3 | needs Docks; more adjacent land → more fish | | | | | | | | | | | |
| Sea Lane | 1 | 0 | 2 | 0 | | | | | | | | | 3 | Europe access | | | | | | | | | | | |

Modifiers (`docs/RULES.md` "Tile yield"; order of application matters and is given there):
Plow +1 food/sugar/tobacco/cotton. Road +2 lumber and furs, +1 ore/silver/fish. Any river gives the
same step as a road would for that good (+1, or +2 for lumber and furs); a major river gives a second
step only when no road/plow/food step applied. Experts ×2, except Expert Farmer and Expert Fisherman
+2. Non-food experts double the plow/road/river step. Indian Convert +1 on food, crops, furs, fish.
Silver needs a deposit: bare mountains give 0, or 1 with a road or an expert. Hills and Mountains are
their own terrain rows; a hills tile ignores the forest flag.
Fish: table 3, +1 with five or fewer water neighbours, −1 with six or seven, −2 with eight; needs Docks.

### A2 — Resources (value = AI weight; effects in `docs/RULES.md`)

| Resource | Terrain | Effect (expert gets double the addend) |
|---|---|---|
| Oasis 3 | Desert, Scrub | food +2 |
| Wheat 4 | Plains | food +2 |
| Prime Cotton 6 / Prime Tobacco 6 / Prime Sugar 7 | Prairie / Grassland / Savannah | ×2, before plow and river |
| Minerals 4 | Tundra, Marsh, Swamp, Wetland, Rain | ore +3, silver +1; depletes (vanishes) |
| Fishery 5 | Ocean | fish +3 |
| Beaver 6 | Mixed | furs +3 |
| Game 6 | Boreal, Broadleaf | food +2, furs +2 |
| Prime Timber 6 | Conifer, Tropical | lumber +4 (+2 before the lumber doubling) |
| Silver Deposit 12 | Mountains | silver +2; depletes to Depleted Mine 6 |
| Ore Deposit 6 | Hills | ore +2 |

Colony centre tile and depletion rules: `docs/RULES.md`.

## Appendix B — Units

Columns: moves, attack, defense, holds, colony build cost (hammers = cost×32, tools =
tools×10), guns/hull (reserved, store but unused). Europe prices are provisional [VERIFY].

| Unit | Mv | Atk | Def | Holds | Hammers | Tools | Europe price | Notes |
|---|---|---|---|---|---|---|---|---|
| Colonist | 1 | 0 | 1 | | | | recruit | |
| Soldier | 1 | 2 | 2 | | | | +50 muskets | Veteran 3/3 |
| Pioneer | 1 | 0 | 1 | | | | +20..100 tools | |
| Missionary | **2** | 0 | 1 | | | | church | |
| Dragoon | 4 | 3 | 3 | | | | +50 horses | Veteran 4.5/4.5 |
| Scout | 4 | 1 | 1 | | | | +50 horses | |
| King's Regular | 1 | 5 | 5 | | | | — | |
| Continental Cavalry | 4 | 5 | 5 | | | | — | |
| King's Cavalry | 4 | 6 | 6 | | | | — | |
| Continental Army | 1 | 4 | 4 | | | | — | |
| Treasure Train | 1 | 0 | 0 | needs 6 | | | — | King ships it for 50% / tax rate; free with Cortes |
| Artillery | 1 | 7 | 5 | | 192 | 40 | 500, +100 each [VERIFY] | needs Armory; Damaged 5/3 |
| Wagon Train | 2 | 0 | 1 | 2 | 32 [VERIFY 40] | 0 | — | ≤ colonies |
| Caravel | 4 | 0 | 2 | 2 | 128 | 40 | 1000 | |
| Merchantman | 5 | 0 | 6 | 4 | 192 | 80 | 2000 | |
| Galleon | 6 | 0 | 10 | 6 | 320 | 100 | 3000 | carries treasure |
| Privateer | 8 | 8 | 8 | 2 | 256 | 120 | 2000 | no flag |
| Frigate | 6 | 16 | 16 | 4 | 512 | 200 | 5000 | |
| Man-O-War | **5** | 24 | 24 | 6 | — | — | — | REF / intervention only |
| Braves | 1 | 1 | 1 | | | | | |
| Armed Braves | 1 | 2 | 2 | | | | | muskets |
| Mounted Braves | 4 | 2 | 2 | | | | | horses |
| Mounted Warriors | 4 | 3 | 3 | | | | | both |

### B1 — Professions: teach tier (1 Schoolhouse, 2 College, 3 University, 4 never) and Royal University price (−1 = not sold)

Farmer 1/1100 · Sugar Planter 2/— · Tobacco Planter 2/— · Cotton Planter 2/— · Fur Trapper 1/— ·
Lumberjack 1/700 · Ore Miner 1/600 · Silver Miner 1/900 · Fisherman 1/1000 · Distiller 2/1100 ·
Tobacconist 2/1200 · Weaver 2/1300 · Fur Trader 2/950 · Carpenter 1/1000 · Blacksmith 2/1050 ·
Gunsmith 2/850 · Preacher 3/1500 · Statesman 3/1900 · Pioneer (Hardy) 1/1200 · Soldier (Veteran)
2/2000 · Scout (Seasoned) 1/— · Dragoon (Veteran) 2/— · Missionary (Jesuit) 3/1400 · Free Colonist,
Servant, Criminal, Convert, Teacher 4/—. Natives teach: planters, fur trapper, farmer, fisherman,
silver miner, ore miner, scout.

### B2 — Immigrant classes (transport cost)

Petty Criminals 300 · Indentured Servants 400 · Peasant Farmers 600 · Skilled Craftsmen 800 · Hardy
Pioneers 1450 · Town Merchants 1500 · Trained Mercenaries 1900 · Educated Elite 2000. Map classes to
unit types: Peasant Farmers → Free Colonist/Expert Farmer/Fisherman; Skilled Craftsmen → Carpenter,
Blacksmith, Lumberjack, Ore/Silver Miner; Town Merchants → Distiller, Tobacconist, Weaver, Fur Trader,
Gunsmith; Trained Mercenaries → Veteran Soldier, Seasoned Scout; Educated Elite → Statesman, Preacher,
Jesuit [VERIFY mapping]. Recruit price starts at the class cost and is reduced by progress toward the
next cross threshold [VERIFY].

## Appendix C — Europe market

Columns: start bid range, drift low/high, burden (ask = bid + 1 + burden), rise, fall, attrition, volatility.

| Good | Start | Low | High | Burden | Rise | Fall | Attrition | Volatility |
|---|---|---|---|---|---|---|---|---|
| Food | 1–3 | 1 | 6 | 7 | 3 | 2 | −1 | 0 |
| Sugar | 4–7 | 3 | 7 | 1 | 4 | 6 | −8 | 1 |
| Tobacco | 3–5 | 2 | 5 | 1 | 4 | 8 | −10 | 1 |
| Cotton | 2–5 | 2 | 5 | 1 | 4 | 6 | −11 | 1 |
| Furs | 4–6 | 2 | 6 | 1 | 4 | 20 | −13 | 1 |
| Lumber | 2 | 2 | 2 | 4 | 3 | 2 | 0 | 0 |
| Ore | 3–6 | 2 | 6 | 2 | 2 | 4 | −7 | 0 |
| Silver | 20 | 2 | 20 | 0 | 8 | 1 | −8 | 2 |
| Horses | 2–3 | 2 | 11 | 0 | 3 | 2 | −3 | 0 |
| Rum | 11–13 | 1 | 20 | 0 | 4 | 4 | −12 | 1 |
| Cigars | 11–13 | 1 | 20 | 0 | 4 | 4 | −11 | 1 |
| Cloth | 11–13 | 1 | 20 | 0 | 4 | 4 | −13 | 1 |
| Coats | 11–13 | 1 | 20 | 0 | 4 | 4 | −11 | 1 |
| Trade Goods | 2–3 | 2 | 12 | 0 | 2 | 3 | 4 | 0 |
| Tools | 2 | 2 | 9 | 0 | 2 | 2 | 5 | 0 |
| Muskets | 3 | 2 | 20 | 0 | 2 | 2 | 6 | 0 |

The model is in `docs/RULES.md` "Market": the Start, Low and High columns are on a
price scale one above the bid; thresholds are rise × 100 and fall × 100 of traffic; a trade adds its
amount shifted left by Volatility. Rum, Cigars, Cloth and Coats do not use their Start column: they
open at a linked group level (about 8–18). Trades are in lots of up to 100.

## Appendix D — Tribes

| Tribe | Tech | Settlement | Treasure | Homeland radius | America region (cluster, x,y on 56x70) | Typical skills (computed from local terrain, R-508) |
|---|---|---|---|---|---|---|
| Inca | 3 Civilized | City | Jewelled Relics | 3 | Andes (27–37, 43–66) | silver miner, farmer, sugar planter |
| Aztec | 2 Advanced | City | Gold Bars | 2 | Mexico (12–26, 24–34) | tobacco planter, cotton planter, farmer, silver miner |
| Arawak | 1 Agrarian | Village | Bone Jewelry | 1 | Caribbean (31–46, 25–35) | sugar planter, fisherman, cotton planter |
| Iroquois | 1 Agrarian | Village | Wood Carvings | 1 | Northeast (15–36, 6–15) | fur trapper, farmer, lumberjack |
| Cherokee | 1 Agrarian | Village | Turquoise | 1 | Southeast (21–28, 18–23) | tobacco planter, farmer, cotton planter |
| Apache | 0 Semi-Nomadic | Camp | Beads | 1 | Southwest (4–17, 15–23) | scout, ore miner, silver miner |
| Sioux | 0 Semi-Nomadic | Camp | Beads | 1 | Plains (3–13, 1–13) | fur trapper, scout, farmer |
| Tupi | 0 Semi-Nomadic | Camp | Gems | 1 | Brazil coast (26–52, 34–59) | sugar planter, fisherman, fur trapper |

One capital per tribe (it can grow larger: people 3 + 2 x tech, capital up to tech + 1 more; one brave per settlement). Settlement counts on America follow the
cluster sizes (Iroquois 11, Tupi 16, Sioux 7, Apache 7, Arawak 5, Inca 5, Aztec 4, Cherokee
4); random maps scale by land. Attitudes: Content, Uneasy, Restless, Angry, War. Natives who die
out: tribe Extinct. Extra tribe names for flavor (Maya, Toltec, Kiowa, Huron, Hopi, Navajo, Cheyenne,
Cree, Algonquin, Powhatan, Delaware, Shawnee, Illinois, Chickasaw, Choctaw, Seminole, Mohican, Zapotec).

## Appendix E — Buildings (hammers / tools / min pop / upkeep)

| Building | Hammers | Tools | Pop | Upkeep | Needs / effect |
|---|---|---|---|---|---|
| Town Hall | 0 (64 to rebuild) | 0 | 1 | 0 | bells |
| Carpenter's Shop | 0 (39) | 0 | 1 | 0 | hammers |
| Lumber Mill | 52 | 0 | 3 | 10 | hammers ×2 |
| Blacksmith's House | 0 (64) | 0 | 1 | 0 | ore→tools 3 |
| Blacksmith's Shop | 64 | 20 | 1 | 5 | 6 |
| Iron Works | 240 | 100 | 8 | 15 | Adam Smith; 6→9 |
| Tobacconist's House / Shop / Cigar Factory | 0 (64) / 64 / 160 | 0 / 20 / 100 | 1 / 1 / 8 | 0/5/15 | factory needs Adam Smith |
| Weaver's House / Shop / Textile Mill | 0 (64) / 64 / 160 | 0 / 20 / 100 | 1 / 1 / 8 | 0/5/15 | " |
| Distiller's House / Rum Distillery / Rum Factory | 0 (64) / 64 / 160 | 0 / 20 / 100 | 1 / 1 / 8 | 0/5/15 | " |
| Fur Trader's House / Fur Trading Post / Fur Factory | 0 (56) / 56 / 160 | 0 / 20 / 100 | 1 / 1 / 6 | 0/5/15 | " |
| Armory / Magazine / Arsenal | 52 / 120 / 240 | 0 / 50 / 100 | 1 / 8 / 8 | 5/10/15 | Armory enables artillery; Arsenal needs Adam Smith |
| Docks / Drydock / Shipyard | 52 / 80 / 240 | 0 / 50 / 100 | 1 / 4 / 8 | 5/10/15 | coastal; fishing / repair / build ships |
| Schoolhouse / College / University | 64 / 160 / 200 | 0 / 50 / 100 | 4 / 8 / 10 | 5/10/15 | 1 / 2 / 3 teachers |
| Warehouse / Warehouse Expansion | 80 / 80 | 0 / 20 | 1 / 1 | 5/5 | 200 / 300 capacity |
| Stable | 64 | 0 | 1 | 5 | horse breeding ×2 |
| Custom House | 160 | 50 | 1 | 15 | Stuyvesant |
| Printing Press / Newspaper | 52 / 120 | 20 / 50 | 1 / 4 | 5/10 | bells +50% / +100% |
| Church / Cathedral | 64 / 176 | 0 / 100 | 3 / 8 | 5/15 | crosses; missionaries |
| Stockade / Fort / Fortress | 64 / 120 / 320 | 0 / 100 / 200 | 3 / 3 / 8 | 0/10/15 | +100% / +150% / +200%; La Salle gives Stockade free at pop 3 |
| Capitol / Capitol Expansion | 400 / 400 | 100 / 100 | 16 / 16 | 20/10 | present in data, unused; do not expose |

Upkeep: the table carries per-building upkeep (half efficiency when
unpaid), but it is not charged [VERIFY]. Store the values; ship with upkeep off.

## Appendix F — Formulas and difficulty [mostly VERIFY]

| | Discoverer | Explorer | Conquistador | Governor | Viceroy |
|---|---|---|---|---|---|
| Tory penalty threshold (10 … 6) | 10 | 9 | 8 | 7 | 6 |
| Score difficulty index (−(index+1) per village) | 0 | 1 | 2 | 3 | 4 |
| Starting gold (human) | 1000 | 300 | 0 | 0 | 0 |
| First Founding Father, bells: human / computer power | 24 / 56 | 32 / 52 | 40 / 48 | 48 / 44 | 56 / 40 |
| Native alarm at the start, added for a human | 0 | 2 | 4 | 6 | 8 |
| REF initial Regulars/Cavalry/Artillery/MoW | 15/5/2/2 | 23/10/8/5 | 31/15/14/8 | 39/20/20/11 | 47/25/26/14 |
| Royal money per turn (before the doublings) | 10 | 18 | 26 | 34 | 42 |
| Bells for foreign intervention | 2000 | 3500 | 5000 | 6500 | 8000 |
| Rating factor (score x this / 100) | 4 | 5 | 6 | 8 | 10 |

(Rows corrected where the first draft guessed; see `docs/FIDELITY.md`.
`src/engine/difficulty.ts` gathers these for the setup screen and `test/unit/engine/difficulty.test.ts`.)

- SoL% per colony: numerator/denominator bookkeeping; see `docs/RULES.md` "Sons of Liberty".
  Steady state = bells per turn / (2 × population). Bolivar +20 points (human). Rebel sentiment
  (national) = Σ colony SoL × pop / Σ pop.
- Father cost for the Nth father = (N² × 5 + N × 20 + 32) × multiplier [VERIFY].
- Cross threshold: first immigrant at 60 crosses, +20 per immigrant; English ×2/3 [VERIFY base].
- Tax raise: probability per turn grows with cumulative trade; raise 1–7%; max 75% [VERIFY].
- Buy-building price: remaining hammers × 10 + missing tools × ask price [VERIFY].

## Appendix G — Combat modifier names as shown in the Combat Analysis

Fatigue · Attack Bonus · Ambush · Terrain · Colony · Fortified · Spain Bonus · Plowed [VERIFY meaning;
likely a defense penalty on plowed open land] · Artillery In Open · Expeditionary Force · Rebels ·
Tories · Founding Fathers · Drake · Veteran · Bombard · Artillery Vs. Raid.

### G2 — King event flavors (write our own wording)

Tax raises: generic, royal wedding, war with a European
power (Holy Roman Empire, Portuguese, Ottoman Turks, Barbary Pirates, Russia,
Prussia, Sweden, Denmark), Navigation Act, Stamp Act (names a
colony), after building a Custom House, after purchases.
Decreases: plain lowering, mercy (loss of a royal unit), victory. Other: royal funding
grant, frigate offer, galleon transport, the King's new war, mercenaries, REF additions, succession.

## Appendix H — Founding Fathers (weights 1492–1600 / 1600–1700 / 1700+; effects)

| Category | Father | Weights | Effect |
|---|---|---|---|
| Trade | Adam Smith | 2/8/6 | Factory-level buildings; 1.5 output per input |
| Trade | Jakob Fugger | 0/5/8 | All boycotts lifted, no back taxes |
| Trade | Peter Minuit | 9/1/0 | Natives no longer demand payment for land |
| Trade | Peter Stuyvesant | 2/4/8 | Custom House; trade continues during the revolution |
| Trade | Jan de Witt | 2/6/10 | Trade with foreign colonies; detailed Foreign Affairs report |
| Exploration | Ferdinand Magellan | 2/10/10 | Ships +1 move; west-edge voyage to Europe much shorter |
| Exploration | Francisco de Coronado | 3/5/7 | All existing colonies and surroundings revealed |
| Exploration | Hernando de Soto | 5/10/5 | Rumor results always positive; all units +1 sight |
| Exploration | Henry Hudson | 10/1/0 | Fur trappers +100% |
| Exploration | Sieur de La Salle | 7/5/3 | Free Stockade in every colony reaching pop 3 |
| Military | Hernan Cortes | 6/5/1 | Conquered settlements always yield more treasure; royal transport free |
| Military | George Washington | 0/4/10 | Every non-veteran soldier/dragoon that wins is upgraded |
| Military | Paul Revere | 10/2/1 | Undefended colony: a colonist takes up 50 stockpiled muskets |
| Military | Francis Drake | 4/8/6 | Privateers +50% |
| Military | John Paul Jones | 0/6/7 | A free Frigate |
| Political | Thomas Jefferson | 4/5/6 | Statesmen's bell production +50% |
| Political | Pocahontas | 7/5/3 | All tension reset to Content; alarm accrues at half rate |
| Political | Thomas Paine | 1/2/8 | Bell production + current tax rate % |
| Political | Simon Bolivar | 0/4/6 | SoL membership +20% in all colonies |
| Political | Benjamin Franklin | 5/5/5 | King's wars don't affect New World relations; Europeans always offer peace |
| Religious | William Brewster | 7/4/1 | No criminals/servants on the docks; choose the immigrant from the pool |
| Religious | William Penn | 8/5/2 | Crosses +50% |
| Religious | Jean de Brebeuf | 6/6/1 | All missionaries function as experts |
| Religious | Juan de Sepulveda | 3/8/3 | Higher chance defeated natives convert and join a colony |
| Religious | Bartolome de las Casas | 0/5/10 | All existing converts become Free Colonists |

## Appendix I — Nations

| Nation | Power | Home port | Colonies named | Independent name | AI leader (aggressive/friendly, expansionist/perfectionist, civilize/militaristic) |
|---|---|---|---|---|---|
| England | Immigration: 2/3 crosses needed | London | New England | United States of America | Walter Raleigh 1, −1, 0 |
| France | Cooperation: alarm at half rate | La Rochelle | New France | Republic of Quebec | Jacques Cartier 0, 1, 0 |
| Spain | Conquest: +50% attacking native settlements | Seville | New Spain | Republic of Mexico | Christopher Columbus 1, 0, −1 |
| Netherlands | Trade: prices fall slower, recover faster; start with Merchantman | Amsterdam | New Netherlands | Republic of Surinam | Michiel De Ruyter −1, 0, 1 |

Mission name prefixes: Church of / Sainte Marie de / Santa Maria del / Church of. Intervention
friends: French General Lafayette etc. Rulers: Queen (England), King (France),
King/Pope (Spain), Stadtholder (Netherlands).

## Appendix J — Colony name lists

Use a list per nation, in order (English: Jamestown, Plymouth, Roanoke, …;
French: Quebec, Montreal, Guadeloupe, …; Spanish: Isabella, Santo Domingo, San Salvador, …;
Dutch: New Amsterdam, Fort Orange, Fort Nassau, …). Historical place names; include all of them.

## Appendix K — Keyboard map

Map: arrows/numpad move · A activate · W wait · Space skip · F fortify · S sentry · B build/join
colony · P clear/plow · R road · G go to · L load · U unload · O dump overboard · T trade route ·
Shift-D disband · V view mode · M move mode · E Europe · Z/X zoom · H hidden terrain · C center ·
F1 terrain info · F2–F10 advisers (Religious, Congress, Labor, Economic, Colony, Naval, Foreign,
Indian, Score) · Alt+letter opens menus · Esc exit. Colony: Tab cycles views · arrows move
highlight · Enter jobs/orders menu · L / = / + load (most valuable / all / some) · U / − / _ unload ·
M toggle multi-function view · 1/2/3 production/units/construction · N production numbers · C
construction menu · B buy · F1 info · Esc exit. Europe: R or 1 recruit · P or 2 purchase · T or 3
train · L / = / + buy · U / − / _ sell · Esc or E exit.

## Appendix L — Balance target ranges (used by R-1009)

- First colony founded by every power: turn ≤ 8.
- Colonies per power at 1600: 3–8; at 1700: 5–14; at 1800: 6–20 (cap 48 total).
- Native wars per game: 1–6. Settlements destroyed by 1800: 5–40%.
- At least one AI power reaches 50% rebel sentiment by 1800 in ≥30% of seeds.
- Scoring at 1800 in 100% of seeds; no turn exceeds 2 s with 4 AIs in Node.
