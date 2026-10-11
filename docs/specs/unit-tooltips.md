# Units on the map tooltip: spec for R-1051

Written by `/plan` on 2026-10-11. Status: proposed.

**The request, in the owner's words:** "When there is a unit on top of a tile, I want that unit's
information to be shown on the pop-up tooltip as well." The slip that appears when the pointer rests
on a map square (`docs/specs/map-tile-tooltips.md`, R-1018 to R-1020) describes the ground only; that
spec left what stands on the square to the sidebar, which describes the active unit and nothing else.
A piece on the map is a small figure with one letter on it, and nothing says what it is, whose it
is or what it carries without making it the active unit.

## Goal

Rest the pointer on a square where the map draws a unit and the slip, under its description of the
ground, says what stands there: each of the player's own units with its moves, orders and load, or
the one foreign or native unit the map shows, with whose it is. It never says more about another
power's units than the map itself shows.

## Non-goals

- Nothing about a colony or a settlement on the square, and no units standing inside one: the map
  draws the colony, not them (the owner's choice). The one exception is the active unit, which the
  map does draw there.
- No combat strengths, odds or attack and defence figures.
- No list of who is in a foreign or native stack; only its top unit and that there are others.
- No tooltip where there is none today: unexplored squares, touch screens, under a dialog, with the
  option off. No new option; "Terrain tooltips" governs the whole slip and keeps its name and key.
- No change to the sidebar's text, to what the map draws, to any rule, or to the save format.
- No new wiki screenshot (`wiki/images/screens/map-tooltip.png` shows a square with no unit and
  stays true).

## Rules and sources

Nothing here changes a rule. Every line is read from state the game already has, and what may be
shown of another power is this game's own choice, set by what its map already draws.

- Which units are on show: the ones `renderOverlay` in `src/ui/render.ts` draws. Units of the viewer
  and foreign units within `SIGHT.foreignUnitRange` of one of them (`visibleUnits` in
  `src/engine/explore.ts`; every unit with `revealAll`), that are not aboard a carrier and not on a
  voyage. The unit on top of a stack is `topUnit` in `src/ui/unit-queue.ts` (the active unit, else
  the first). On a colony's square only the active unit is drawn.
- A unit of the viewer's is named as the sidebar names it (`unitLabel`), with its moves
  (`formatMoves`), its orders (the sidebar's `ORDER_NAMES`) and its load (the sidebar's `manifest`:
  passengers, cargo lots, a pioneer's tools), plus a treasure train's gold (`unit.treasure`).
- A unit of another power is named by its kind only (`UNIT_TYPES[type].name`: "Soldier",
  "Colonist", "Caravel"), because the piece on the map shows its kind and not its skill, after whose
  it is: the nation's adjective (`NATIONS[nation].adjective`), the tribe's (`tribeOfOwner`, then
  `TRIBES[tribe].adjective`), or "Royal" for the Crown's army (`state.crownPlayer`), left off where
  the kind's name already begins "King's". A foreign ship adds how many holds are in use
  (`holdsUsed` in `src/engine/cargo.ts`), the figure the map already prints on her piece.

## Shared surfaces

One item, so nothing is contended, but these are surfaces others build on and the board note names
them:

- `TileTip` in `src/ui/tile-tooltip.ts` gains `units`; `tileTip` gains a fifth parameter,
  `activeUnitId`, optional so every present caller and test still compiles.
- `src/ui/unit-text.ts` (new): `unitLabel`, `formatMoves`, `ORDER_NAMES` and `manifest` move here
  from `src/ui/sidebar.ts`, because `sidebar.ts` already imports `tile-tooltip.ts` and the tooltip
  now needs them. `sidebar.ts` re-exports `unitLabel` and `formatMoves`, so nothing that imports
  them from it changes.
- `GAME_OPTIONS` in `src/ui/options.ts`: the hint of `terrainTooltips` changes; the generated
  options table in `wiki/Help-and-Options.md` follows it.
- `src/ui/style.css`: two new rules under `.map-tooltip`, on the theme tokens.

## Work items

### W1 — The units on a square, on the map tooltip (R-1051, size S, depends on: nothing)

Files: `src/ui/unit-text.ts` (new), `src/ui/sidebar.ts`, `src/ui/tile-tooltip.ts`,
`src/app/game-screen.ts` (`showTip` and where the map is redrawn), `src/ui/style.css`,
`src/ui/options.ts` (one hint), `test/unit/ui/tile-tooltip.test.ts`, `test/e2e/tooltip.spec.ts`,
`wiki/Help-and-Options.md` (the options table row, regenerated the way `test/helpers/wiki/tables.ts`
and `test/unit/wiki/pages.test.ts` say, and the Tooltips paragraph), `wiki/The-Map.md` (the tooltip
paragraph), `docs/ARCHITECTURE.md` (the `src/ui/` paragraph: `unit-text.ts`, and that the slip names
the units on show).

The model, pure as before:

```ts
export interface UnitTip {
  /** "Veteran Soldier · Moves 1 · Fortified" / "French Caravel · 2 holds in use" / "and others". */
  readonly line: string;
  /** "Carrying Free Colonist, 100 Muskets"; '' for a unit that carries nothing, and for every unit of another power. */
  readonly carried: string;
}
export interface TileTip {
  // title, features, yields, ground: as they are
  /** The units the map shows on the square, top of the stack first; empty where it shows none. */
  readonly units: readonly UnitTip[];
}
export function tileTip(state: GameState, x: number, y: number, revealAll?: boolean, activeUnitId?: UnitId | null): TileTip | null;
```

Acceptance:
- The stack on a square is the units the map could draw there: the viewer's own and, without
  `revealAll`, only those foreign units `visibleUnits` gives; never a unit aboard a carrier or on a
  voyage. Its top is `topUnit(stack, activeUnitId)`. A square with no such unit has `units` empty
  and the slip reads exactly as it does today.
- The top unit is the viewer's: one entry for each of the viewer's units in the stack, the top
  first, the rest in the stack's order. Each line is the unit's label, its moves and its orders:
  "Veteran Soldier · Moves 1 · Fortified", "Caravel · Moves 4 · No orders",
  "Hardy Pioneer · Moves 1/3 · Build road".
- A unit of the viewer's with a load has `carried` "Carrying " and the sidebar's manifest joined by
  commas, in its order: a caravel with a free colonist aboard and 100 muskets "Carrying Free
  Colonist, 100 Muskets"; a pioneer "Carrying 100 Tools"; a treasure train "Carrying 3000 gold".
  A soldier's is ''. The colonist aboard the caravel is not an entry of its own.
- The top unit is another power's: one entry, its owner's adjective and its kind, with `carried`
  '': "French Soldier", "Dutch Colonist" (whatever its skill), "Sioux Braves", "Royal Artillery",
  "King's Regular". A ship adds her holds in use: "Spanish Galleon · 3 holds in use",
  "· 1 hold in use", "· holds empty". Where the stack holds more than one unit a second entry
  follows, "and others", and nothing more is said of them.
- A foreign unit farther than `SIGHT.foreignUnitRange` from every unit of the viewer's is not
  listed; with `revealAll` it is.
- On a square with a colony, `units` is the active unit alone if it stands there, otherwise empty,
  whoever owns the colony and however many units stand in it.
- Off the map and on a square the viewer has not explored the result is null, as before.
- On the slip the units come last, after the ground line, parted from it by a thin rule
  (`--rule`): one `<p class="map-tooltip-unit">` per entry and, where `carried` is not empty, a
  `<p class="map-tooltip-carried">` under it in `--ink-faded`. A square with no unit has neither,
  and no rule. `test/unit/ui/style.test.ts` still passes (no colour literal).
- `game-screen.ts` passes the active unit's id to `tileTip`. While the slip is up and what it would
  say changes without the pointer leaving the square (a unit steps on or off during another
  power's turn, or the unit's orders change), the slip says the new text by the next time the map
  is drawn. Showing, changing or hiding the slip still never asks for a redraw.
- The hint of the Terrain tooltips option reads "Describe the square under the pointer: its
  terrain, features and yields, and the units on it." Its key, label and default do not change, so
  stored options are untouched. The wiki's options table and its two tooltip paragraphs say the
  same; `test/unit/wiki/pages.test.ts` passes.
- `sidebarModel`'s output is unchanged (`test/unit/ui/sidebar.test.ts` and the label and moves
  cases in `test/unit/ui/unit-queue.test.ts` pass untouched).
- Unit tests in `test/unit/ui/tile-tooltip.test.ts`, on a `world` from `test/helpers/world.ts` with
  `withUnit` and `withColony`, cover each bullet above that names a line of text.
- `test/e2e/tooltip.spec.ts` gains a case on its hand-laid world: one more unit of the player's
  with a load on a known square, and a French soldier next to the player's unit. The pointer
  resting on the first shows a `.map-tooltip-unit` with its label and a `.map-tooltip-carried`
  line; on the second, "French Soldier" and no carried line; on the cotton square the slip still
  holds exactly four `<p>`. The existing cases pass untouched.

Verify: `npm test -- test/unit/ui/tile-tooltip.test.ts test/unit/ui/sidebar.test.ts
test/unit/ui/unit-queue.test.ts test/unit/ui/style.test.ts test/unit/wiki`;
`npm run test:e2e -- tooltip`; `npm run check`; `npm run test:e2e` (the item touches `src/ui` and
`src/app`); a screenshot in the pull request of the slip over one of the player's units that
carries something.

## Open questions and decisions

- **Stacks** (owner, 2026-10-11): every unit of the player's on the square, one line each; for
  another power's stack only the unit the map draws, and "and others". Rejected: the top unit only
  (hides the player's own stack from them); every unit whoever owns it (tells what nothing else in
  the game tells).
- **Detail** (owner): the sidebar's detail for the player's units (name, moves, orders, load); for
  others, owner and kind, and a ship's holds in use. Rejected: name and owner only; adding combat
  strengths.
- **Colonies** (owner): units standing in a colony are not listed, as the map does not draw them.
  Rejected: listing the player's own garrison; naming the colony on the slip.
- **Foreign units by kind, not skill** (planner): "Dutch Colonist" even for a master craftsman,
  since the piece shows only the kind. Rejected: `unitLabel` for everyone.
- **Where on the slip** (planner): last, under a rule, so the ground reads as it always has and the
  existing tooltip tests hold. Rejected: units first.
- **One option** (planner): the Terrain tooltips option turns the whole slip off, units included;
  only its hint changes. Rejected: a second option for the unit lines.
- **The active unit in a colony** (planner): listed, because the map draws it there. A worker who
  finds this awkward should leave it and say so in the pull request.
- **A slip gone stale** (planner): it follows the state at the next drawing of the map. No test can
  bring this about without a key or a press, which hide the slip anyway, so it is checked by
  reading; the worker says in the pull request how it was done.
- If a worker meets a question not covered here: build the smaller reading and say so in the pull
  request.
