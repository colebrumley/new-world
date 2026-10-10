# Map tile tooltips: spec for R-1018 to R-1020

Written by `/plan` on 2026-10-10. Status: built.

**The request, in the owner's words:** "I want to add tooltip popups about map tiles when you hover
over them. Some of the special features are hard to discern what they are." A resource is a
five-pixel badge in the corner of a square, a rumor a small mark, and a river a thin line; at the
smaller zooms they are hard to tell apart, and the sidebar describes only the active unit's square
(in move mode) or the cursor's (in view and Go To modes), never the square under the pointer.

## Goal

Rest the pointer on an explored map square and a small parchment slip appears beside it saying what
the square is: the terrain, each feature on it with what it does, what a free colonist working it
would bring in, and how it moves and defends. It goes away as soon as the player does anything.
A game option turns it off.

## Non-goals

- No tooltip on the colony screen's area squares (the owner chose the map only; the colony screen
  already labels what each square yields).
- Nothing about what stands on the square: units, colonies, settlements, whose land it is, prices.
  The sidebar and the encyclopedia (right-click) keep that.
- No tooltip for unexplored squares: the chart says enough. Nothing is shown.
- No touch or keyboard way to bring it up. A device without hover never shows it.
- No change to the sidebar's own content, to any rule, or to the map art.

## Rules and sources

Nothing here changes a rule; the tooltip reads tables the game already has, so every figure it shows
is the game's own (`docs/RULES.md` "Tile yield" and "Resource terrains and effects", R-101).

- Terrain name, move cost and defence bonus: `TERRAIN` in `src/engine/data/terrain.ts`, the defence
  shown as the encyclopedia shows it (`defensePercent`, "none" at 0).
- A resource's effect: derived from `RESOURCE_BONUS` in `src/engine/data/resources.ts` (`double` →
  "doubles cotton"; `add n` → "+n food"; an empty row → "nothing left to dig"). No number is
  written in the UI; the text is generated from the table so it cannot drift.
- What a free colonist brings in: `tileYield` in `src/engine/yields.ts` for each raw good, with
  `FREE_COLONIST`, the square's real water neighbours (`countWaterNeighbors`) and otherwise
  `NEUTRAL_CONTEXT` (so Docks are assumed for fish, no Sons of Liberty bonus, no Hudson, no
  expert). This is the figure the colony screen labels a square with for a free colonist.
- Feature names (Minor River, Major River, Road, Plowed, Lost City Rumor, resource names): the ones
  the sidebar already uses; W1 moves them to one place.

## Shared surfaces

- `src/ui/tile-tooltip.ts` (new, W1): `tileTip` and `groundFeatures`. W3 adds `placeTooltip` to the
  same file. W1 goes first.
- `src/ui/sidebar.ts` (W1): `sidebarModel` takes its river, road, plowed, resource and rumor lines
  from `groundFeatures` instead of its own list, so the two never disagree. Its output text does
  not change; nothing pins it today, so W1 adds `test/unit/ui/sidebar.test.ts`.
- `src/ui/options.ts` (W2): `GAME_OPTIONS` gains `terrainTooltips`, so `Options` and
  `DEFAULT_OPTIONS` gain a key. `test/unit/ui/options.test.ts` counts the game options.
- `src/app/game-screen.ts` (W3 only). `src/ui/style.css` (W3 only, new `.map-tooltip` rules on
  the theme tokens).
- `docs/ARCHITECTURE.md` `src/ui/` section: W1 adds a sentence for `tile-tooltip.ts`; W3 extends it.

## Work items

### W1 — Tile description model (R-1018, size S, depends on: nothing)

Files: `src/ui/tile-tooltip.ts` (new), `src/ui/sidebar.ts`, `test/unit/ui/tile-tooltip.test.ts`
(new), `test/unit/ui/sidebar.test.ts` (new), `docs/ARCHITECTURE.md` (the `src/ui/` paragraph that
names `sidebar.ts`).

A pure module. Nothing in it touches the DOM.

```ts
export interface TileTip {
  /** The terrain's name: "Grassland", "Conifer Forest", "Hills", "Ocean". */
  readonly title: string;
  /** One line per feature, in this order: resource, river, road, plowed, rumor. */
  readonly features: readonly string[];
  /** "3 Food, 3 Tobacco": what a free colonist brings in, in RAW_GOODS order, zeros left out; '' if nothing. */
  readonly yields: string;
  /** "Move 1 · Defence none" / "Move 2 · Defence +50%". */
  readonly ground: string;
}
/** Null off the map and for a square the viewer has not explored (unless revealAll). */
export function tileTip(state: GameState, x: number, y: number, revealAll?: boolean): TileTip | null;
/** The feature names the sidebar lists: river, road, plowed, resource, rumor, in the sidebar's order. */
export function groundFeatures(tile: Tile): string[];
```

Acceptance:
- `tileTip` names the terrain row that governs the square (`terrainOf`): a forested plains square
  is "Mixed Forest", a hilly one "Hills", whatever its base.
- A resource line is its name, a colon, and its effect read from `RESOURCE_BONUS`: "Wheat: +2 Food",
  "Minerals: +3 Ore, +1 Silver", "Prime Cotton: doubles Cotton", "Depleted Mine: nothing left to
  dig". Goods are named from `GOOD_NAMES`; fish, which is not a cargo, is "Fish".
- River, road, plowed and rumor lines are "Minor River", "Major River", "Road", "Plowed", "Lost
  City Rumor", in that order after the resource line.
- `yields` lists every raw good a free colonist would bring in on the square, as `tileYield` gives
  it with the square's own water neighbours and otherwise the neutral context: plains "5 Food,
  2 Cotton, 1 Ore" (food is table + 1); a conifer forest with Prime Timber "2 Food, 1 Tobacco,
  2 Furs, 10 Lumber" (lumber doubles and the resource adds first); ocean with no land about it
  "1 Fish" (8 water neighbours take 2 off the table's 3), ocean with five or fewer water
  neighbours "4 Fish"; arctic '' (nothing).
- `ground` is "Move n · Defence none" or "Move n · Defence +p%" from the terrain row.
- Off the map, or unexplored by the viewer (`isExploredBy` with `viewerIndex`) without
  `revealAll`, the result is null; with `revealAll` an unexplored square is described.
- `sidebarModel` now gets those five feature lines from `groundFeatures`; its features list reads
  exactly as before (a colony or settlement first, then the ground features, then "<Tribe> land").
  A new `test/unit/ui/sidebar.test.ts` pins that order on a `world` from `test/helpers/world.ts`
  with `setTile`, `withColony` and a settlement, and the "Unexplored" terrain of an unseen square.
- `docs/ARCHITECTURE.md` gains one sentence naming `tile-tooltip.ts` as the pure description of a
  square the map tooltip (W3) and the sidebar share.

Verify: `npm test -- test/unit/ui/tile-tooltip.test.ts test/unit/ui/sidebar.test.ts`; `npm run check`.

### W2 — Terrain tooltips option (R-1019, size S, depends on: nothing)

Files: `src/ui/options.ts`, `test/unit/ui/options.test.ts`.

Acceptance:
- `GAME_OPTIONS` gains, after `tutorialHints`, `{ key: 'terrainTooltips', label: 'Terrain
  tooltips', hint: 'Describe the square under the pointer: its terrain, features and yields.',
  default: true }`.
- The options test counts nine game options; `parseOptions` of stored text without the key gives
  true; a stored false survives being written and read back.
- Nothing reads the option yet (W3 does); the options dialog shows it because it lists
  `GAME_OPTIONS`.

Verify: `npm test -- test/unit/ui/options.test.ts`; `npm run check`.

### W3 — The tooltip on the map (R-1020, size M, depends on: W1, W2)

Files: `src/app/game-screen.ts`, `src/ui/tile-tooltip.ts` (adds `placeTooltip`),
`src/ui/style.css`, `test/unit/ui/tile-tooltip.test.ts` (placement cases), `test/e2e/tooltip.spec.ts`
(new), `docs/ARCHITECTURE.md` (the sentence W1 added; the `app/game-screen.ts` mention if useful).

The element: one `<div class="map-tooltip" role="tooltip">` appended to the game screen beside the
magnified notice, `hidden` until needed, `pointer-events: none`, above the event log (z-index 3)
and below dialogs, reports and screens (z-index 8). Inside it: a `<p class="map-tooltip-title">`,
one `<p>` per feature line, a `<p class="map-tooltip-yields">` and a `<p class="map-tooltip-ground">`;
empty lines are left out. The look is a slip of parchment on the chart like the event log: the
`--sheet` background, `--rule` border, `--lift` shadow, the display face for the title, 0.8rem text,
colours only from the theme tokens (`test/unit/ui/style.test.ts` refuses a colour literal).

Behaviour, all in `game-screen.ts` beside the existing mouse handlers (`pointer`, `drag`, `retarget`,
`showPointer`):

- The pointer rests on an explored square for `TOOLTIP_DELAY_MS` (400, a constant exported from
  `tile-tooltip.ts`) with no button down and no drag: the tooltip appears, filled from
  `tileTip(session.state, x, y, revealAll)`.
- While it is up, crossing into another explored square replaces its text and position at once;
  crossing into an unexplored square, or off the map, hides it.
- It hides, and the wait starts over on the next movement, on: `mousedown` on the map, `wheel`, a
  pinch, a touch, `mouseleave`, any key handled by the map (a key may move the view or the active
  unit under a resting pointer), `setView`, and when a dialog, the colony screen, the Europe screen,
  a report or the encyclopedia opens (anything that puts a `[role="dialog"]` or a screen over the map).
  It is not re-shown while a dialog is open even if the pointer rests again.
- Position: `placeTooltip({ x, y }, { width, height }, { width, height })` in `tile-tooltip.ts`
  returns the slip's top-left in canvas pixels for a pointer at `(x, y)`, a slip of the given size
  and a canvas of the given size: `TOOLTIP_GAP` (14) right of and below the pointer; flipped to the
  left of the pointer when it would overrun the right edge; flipped above when it would overrun the
  bottom; clamped to the canvas at the end. Pure, unit-tested with a pointer in each corner.
- When the option `terrainTooltips` is off (read the way `waterShimmer` and `tutorialHints` are
  read, so a change in the options dialog takes effect at once) it never shows.
- Where the device cannot hover (`window.matchMedia('(hover: hover)')` is false) it never shows,
  so a tap on a touch screen does not bring it up.
- Showing, moving or hiding it does not redraw the map (`dirty` stays as it was, `data-frames`
  and `data-ticks` do not change); only the DOM slip changes, and only when the square changes.
  `test/e2e/budget.spec.ts` must not slow.

Acceptance:
- In a game started with `?reveal&still` the pointer resting on a square with a resource shows a
  tooltip whose text includes the terrain name, the resource line and the yields line; on an
  ocean square it names "Ocean" and a fish yield; moving straight to a neighbouring square changes
  the text without a second wait; pressing the mouse button hides it; moving the pointer off the
  map hides it.
- With the Terrain tooltips option off (Alt+G opens the Game Options dialog; uncheck "Terrain
  tooltips" and press Escape, as `test/e2e/options.spec.ts` does for Tutorial hints) the pointer
  resting on the same square shows nothing.
- An e2e spec `test/e2e/tooltip.spec.ts` proves the above. It starts from a saved game built the way
  `test/e2e/visual.spec.ts` builds its sheet (a small `world` with `makeTile` squares placed by
  hand, written to the autosave key, loaded with the Load Game menu item), so the resource squares
  are at known coordinates; it finds the pixel of a square from `canvas.dataset.view` as
  `test/e2e/mouse.spec.ts` does, and uses `page.mouse.move` then a wait of at least the delay.
- The sidebar is unchanged.
- `npm run test:e2e` passes (W3 touches `src/app` and `src/ui`; the protocol runs the whole suite).

Verify: `npm test -- test/unit/ui/tile-tooltip.test.ts test/unit/ui/style.test.ts`;
`npm run test:e2e -- tooltip`; `npm run check`; `npm run test:e2e`; a screenshot of the tooltip
over a resource square in the pull request.

## Open questions and decisions

- **Content** (owner, 2026-10-10): name, features with their effect, a free colonist's yields,
  move and defence. Rejected: names only (too little to tell a Fishery from a Silver Deposit
  effect); everything on the square (the sidebar and the encyclopedia do that).
- **Where** (owner): the map only. Rejected: the colony screen's area squares too.
- **Option** (owner): a game option, on by default. Rejected: always on.
- **Unexplored squares** (planner): nothing is shown. A worker finding a reason to show
  "Unexplored" should not; the chart is the answer.
- **Fish and Docks** (planner): the yields line assumes Docks, as the neutral yield context does,
  so an ocean square is never "nothing". A worker may add "(with Docks)" after a fish figure if it
  fits on the slip; otherwise leave it.
- **Delay and following** (planner): 400 ms to appear, then the slip follows the pointer from
  square to square at once. Rejected: a fresh wait on every square (too slow for scanning a coast).
- If a worker meets a question not covered here: build the smaller reading and say so in the pull
  request.
