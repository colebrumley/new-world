# Drag feedback: spec for R-1035 to R-1036

Written by `/plan` on 2026-10-10. Status: approved.

**The request, in the owner's words:** "When I am dragging a unit or a resource, I want to see the
unit dragging under my mouse. If I am dragging it and I hold it over somewhere it can't go, it
should get a red border or something to tell me that." Today both drags (the colony screen's
tokens, and the active unit on the map) draw nothing under the pointer, and nothing says whether
the release will be refused until the button is let go.

## Goal

A thing picked up by the mouse travels under the pointer. Held over a place that would refuse it,
it and the place turn red; held over a place that would take it, the place lights green. On the
map, the piece being dragged follows the pointer and the destination marker is red where the unit
cannot go.

## Non-goals

- No drag on the Europe screen; it has none today (everything there is a click).
- No change to what a drop does, to any rule, or to the amounts a drop moves. Only what is shown
  while the button is down changes.
- No touch or keyboard version. The click-then-click and keyboard flows on the colony screen are
  untouched.
- No third colour for "will ask first" (a native-land square, a landfall): those count as allowed.

## Rules and sources

Nothing here changes a rule. Every verdict is the game's own `validateAction` asked ahead of time
through the same path the drop uses (`host.refusal` on the colony screen; `validateAction` on the
map), so the colour can never disagree with what the release would do.

## Shared surfaces

None. The two items touch different files, no type in `state.ts`, no action, no save version, no
theme token. `docs/ARCHITECTURE.md` and `src/ui/keymap.ts` (and the regenerated `docs/KEYS.md`)
are touched by both, on different lines; the second to merge resolves the trivial conflict.

## Work items

### W1 — Colony drag ghost and verdict (R-1035, size M, depends on: nothing)

Files: `src/ui/colony-model.ts`, `src/ui/colony-screen.ts`, `src/ui/style.css`,
`test/unit/ui/colony-model.test.ts`, `test/e2e/colony.spec.ts`, `src/ui/keymap.ts` (line for
"Drag (Shift-drag for part)") and `docs/KEYS.md`, `docs/ARCHITECTURE.md` (the `colony-screen.ts`
sentence in the `src/ui/` paragraph).

**The verdict, pure, in `colony-model.ts`:**

```ts
export type DropVerdict = 'ok' | 'bad' | 'home';
/** The place a token stands in now, as a drop target ("field:1,0", "trade:statesman", "idle",
 *  "outside", "carrier:<id>", "warehouse"); null for a carrier token. */
export function homeOf(state: GameState, colonyId: string, source: string): string | null;
/** What dropping `source` on `target` would come to, mirroring the colony screen's drop(). */
export function dropVerdict(state: GameState, colonyId: string, source: string, target: string,
  refusal: (action: Action) => string | null,
  jobFor: (target: string, colonistId: string) => Job | null): DropVerdict;
```

`source` and `target` are the `data-drag` and `data-drop` strings the screen already uses.
`probe(action)` is `'ok'` when `refusal(action)` is null, else `'bad'`. After `target ===
homeOf(...)` gives `'home'`:

| source | target | verdict |
|---|---|---|
| colonist | `outside` | probe `leaveColony` |
| colonist | `field:dx,dy` whose `squareStatus` is `nativeLand` | `ok`, no probe (the drop asks to buy or take it) |
| colonist | `idle`, `trade:*`, `field:*` | `job = jobFor(target, id)`; `job ? probe(assignJob job) : 'bad'` |
| colonist | anything else | `bad` |
| unit | `warehouse`, `carrier:*` | `bad` (the drop ignores it) |
| unit | `outside` | aboard a carrier ? probe `goAshore` : `bad` |
| unit | anything else | probe `joinColony` (the job taken after joining cannot be probed without a trial state; say so in a comment) |
| good | `carrier:*` | warehouse amount > 0 ? probe `loadCargo` with `min(amount, 100)` : `bad` |
| good | anything else | `bad` |
| cargo | `warehouse` | lot amount > 0 ? probe `unloadCargo` with the lot : `bad` |
| cargo | another `carrier:*` | probe `transferCargo` with the lot |
| cargo | anything else | `bad` |

The amount probed is the one a plain (non-Shift) drop would move; a hold with room for fewer
than 100 shows red though Shift could load less. Say so in a comment.

**The ghost, in `colony-screen.ts`** (the pointer handlers at the end of `openColonyScreen`):

- The press remembers the token element pressed. Once the pointer has moved more than the 4px
  threshold, and the token is not a carrier, a ghost is made: `div.drag-ghost.token.token-<kind>`,
  `aria-hidden`, holding fresh art (`figure()` for a colonist or unit, `goodIcon()` for a good or
  cargo lot; never `cloneNode`, a canvas loses its pixels) and the token's `.token-label` and
  `.token-sub` text. The token it came from gets `token-lifted`. The ghost is appended to the
  screen root and is `position: fixed` at the pointer's client coordinates, so neither the
  screen's own scroll nor a region's scroll moves it; `pointer-events: none`, so
  `elementFromPoint` never hits it.
- On every move the place under the pointer is found as the release does
  (`elementFromPoint(...).closest('[data-drop]')`). When it changes: the old place loses
  `data-drop-state`; the new place gets `data-drop-state="ok"|"bad"|"home"` from `dropVerdict`
  (results cached per target string for the length of the drag: a field square's `jobFor` runs up
  to nine refusals and nine trial views); the ghost gets `data-verdict` set the same, or removed
  when over no place.
- The release removes the ghost and both attributes before calling `drop()`, so a question the
  drop asks (native land, how many) never shares the screen with a ghost. Letting go over no
  place, or over the token's home, is the cancel it is today.
- The pointer leaving the screen root (which covers the whole game, so this is the window's edge)
  clears the press and the ghost. This also ends the stale press that today survives a release
  outside the screen.
- A `render()` landing mid-drag (a refresh from the host) puts the ghost back and re-marks the
  lifted token, since `replaceChildren` would drop them.
- `selected`, `data-holding`, the click-then-click flow, the keyboard flow and Shift partial
  amounts are unchanged. Carrier tokens get no ghost (dragging one does nothing today).

**CSS** (`style.css`, after the `data-holding` rules; theme tokens only, `test/unit/ui/style.test.ts`
refuses a colour literal):

- `.colony-screen .token-lifted`: dimmed (opacity about 0.4).
- `.colony-screen .drag-ghost`: `position: fixed; z-index: 9` (above the regions, below
  `.dialog-backdrop` at 10); centred on the pointer with `transform: translate(-50%, -50%)`;
  `pointer-events: none`; `box-shadow: var(--lift)`.
- `.drag-ghost[data-verdict='bad']`: a 2px solid `var(--ink-bad)` border and a ring.
- A place with `data-drop-state='ok'`: a 2px solid `var(--ink-good)` outline, as the hover rule
  lights it today; `'bad'`: a 2px solid `var(--ink-bad)` outline, a `color-mix` tint of
  `--ink-bad` over `--parchment-light`, `cursor: not-allowed`; `'home'`: the plain dashed line.
  Each rule needs a `:hover` twin after the existing hover rules so it wins by order.

Acceptance:
- Pressing a token and moving the pointer 2px shows no ghost; moving past the threshold shows
  one ghost that follows the pointer, with the token's picture and name, and dims the token it
  came from.
- Over a place that would take it, the place shows a solid green outline and the ghost is plain.
- Over a place the game would refuse (a colonist over the warehouse, a good over a building, cargo
  over a building, a unit over a hold, a full building, a square where nothing can be raised), the
  ghost has a red border and the place a red outline.
- Over the place it came from, the ghost is plain and the place keeps its dashed line. Over no
  place at all, the ghost is plain and no place is marked.
- Letting go removes the ghost and every mark before the drop happens or the message appears; the
  pointer leaving the window removes them too.
- The existing `dragTo` tests in `test/e2e/colony.spec.ts` still pass unchanged.
- `test/unit/ui/colony-model.test.ts` gains a `drop verdicts` group on a `world` with
  `withColony` (a colonist on a field, one in a building, one idle; furs 40, muskets 0), a galleon
  with furs 100 and a passenger, a wagon, and a soldier outside; a fake `refusal` that records the
  actions probed and refuses a chosen type, and a fake `jobFor`. It asserts `homeOf` for every
  kind and every row of the table, including that native land, a zero amount and the silently
  ignored pairs probe nothing.
- `test/e2e/colony.spec.ts` gains a `page.mouse` test after `foundJamestown` (the colony has one
  farmer on a square, Muskets 50, no carrier): press on the farmer, move 2px: no `.drag-ghost`;
  onto the Town Hall: one `.drag-ghost.token-colonist` holding a `canvas.token-figure`, no
  `data-verdict`, Town Hall `data-drop-state="ok"`, farmer `token-lifted`; over the warehouse
  heading: ghost `data-verdict="bad"`, warehouse `data-drop-state="bad"`, Town Hall unmarked; back
  over his own square: `data-drop-state="home"`, ghost plain; release over the warehouse: no ghost,
  `.square .token` still one, message "Nothing can be produced there."; then Muskets over the
  Town Hall: bad; release: Muskets still 50.
- `docs/ARCHITECTURE.md` says the colony screen's drag draws a ghost under the pointer and lights
  the place under it from `dropVerdict` in `colony-model.ts`; the keymap's drag line says a ghost
  follows the pointer, red where it cannot go, and `docs/KEYS.md` is regenerated.

Verify: `npm test -- test/unit/ui/colony-model.test.ts test/unit/ui/style.test.ts
test/unit/ui/keymap.test.ts`; `npm run test:e2e -- colony`; `npm run check`; `npm run test:e2e`
(the item touches `src/ui`); a screenshot of the red ghost over the warehouse in the pull request.

### W2 — Map drag piece and blocked marker (R-1036, size S, depends on: nothing)

Files: `src/ui/pixel-art.ts`, `src/ui/pointer.ts`, `src/ui/render.ts`, `src/app/game-screen.ts`,
`test/unit/ui/pointer.test.ts`, `test/unit/ui/pixel-art.test.ts`, `test/unit/ui/render.test.ts`,
`test/e2e/mouse.spec.ts`, `src/ui/keymap.ts` (line for "Drag from the active unit") and
`docs/KEYS.md`, `docs/ARCHITECTURE.md` (the `pointer.ts` clause and the `game-screen.ts` input
sentence).

- `pixel-art.ts`: `blockedCursorArt()` beside `cursorArt()`: the same frame in `INK.red`.
- `pointer.ts`: a pure `dragBlocked(state, active, tile): boolean`. `mapDrag` says what the
  release would do; `none` is not blocked; `step` asks `validateAction` with `moveUnit`, `goto`
  with `goTo`. Blocked when the answer is not ok and its code is not one the screen turns into a
  question rather than a refusal (`needsLandfall`, `needsSailChoice`, `settlement`, as `tryMove`
  in `game-screen.ts` does). The UI may import the engine (`test/unit/boundaries.test.ts`
  constrains only engine and ai).
- `render.ts`: `RenderExtras.cursor` gains `blocked?: boolean`, drawn with `blockedCursorArt`; a
  new `extras.dragged?: { unitId, x, y } | null` draws that unit's piece once more, centred on
  canvas pixel `(x, y)`, after the stack loop. Pull the piece drawing (the figure-or-piece choice
  and its cache keys) into a local `drawPiece(unit, px, py, stacked)` and use it for both, so no
  new cache keys appear. The piece on its own square keeps being drawn, with its active frame.
- `game-screen.ts`: `aimBlocked`, recomputed in `retarget()` only when `aimAt` changes (so the
  route search runs once per square, edge-scroll included); `mousemove` marks the frame dirty
  during an aimed drag so the piece follows within a square; `mouseup` and `mouseleave` clear it.
  `draw()` passes `cursor: { ...aimAt, blocked: aimBlocked }` and `dragged` while the drag is
  aimed, moved, still for the active unit and in move mode (the same condition the release uses).
  The `frame()` branch that writes `data-view` also writes `canvas.dataset['aim']` as
  `"x,y,ok"` or `"x,y,blocked"`, or `''` with no aim, as a test hook.

Acceptance:
- Dragging from the active unit, its piece is drawn under the pointer from the first moved frame
  to the release, and still on its own square.
- The destination marker is yellow over a square the unit may go to (or where the game would
  ask first), red over one it cannot: a land square for a ship, water for a soldier, a square
  with no route, any square beyond the next for a unit aboard a ship.
- Redraws with no drag in progress are not added (the "redraws only when state or view changes"
  tests and `test/e2e/budget.spec.ts` are unchanged).
- `test/unit/ui/pointer.test.ts`: `dragBlocked` on a small world with water inside it: a soldier
  aboard a ship: adjacent land false, adjacent water true, two squares away true, its own square
  false; the ship: land two squares away true, water two away false.
- `test/unit/ui/pixel-art.test.ts`: `blockedCursorArt` has `INK.red` on its frame and nothing
  inside, as the `cursorArt` test checks yellow.
- `test/unit/ui/render.test.ts`: through `referencePixels`, `cursor.blocked` paints
  `PALETTE[INK.red]` and differs from the yellow shot; `dragged` changes the fingerprint.
- `test/e2e/mouse.spec.ts`: after the landfall loop the test at "a drag orders the unit it began
  on" uses, with the soldier aboard at the ship's square: mouse down on the ship, move to the land
  square west, `settled`: `data-aim` is `x,y,ok`; to the water square east: `blocked`; two
  squares away: `blocked`; back to the ship's square: `ok`; up: `data-aim` is `''` and the
  location unchanged.
- `docs/ARCHITECTURE.md` and the keymap's "Drag from the active unit" line say the piece follows
  the pointer and the marker is red where it cannot go; `docs/KEYS.md` is regenerated.

Verify: `npm test -- test/unit/ui/pointer.test.ts test/unit/ui/render.test.ts
test/unit/ui/pixel-art.test.ts test/unit/ui/keymap.test.ts`; `npm run test:e2e -- mouse`;
`npm run check`; `npm run test:e2e` (the item touches `src/ui` and `src/app`).

## Open questions and decisions

- **Scope** (owner, 2026-10-10): the colony screen and the map, as two items. Rejected: either
  alone.
- **When red, on the colony screen** (owner): only over a place that refuses it; a plain ghost
  over empty table and over the place it came from, since letting go there puts it back.
  Rejected: red anywhere a release would do nothing, including the table and the header.
- **The place too** (planner): the place under the pointer goes red or green as well, and the
  lifted token is dimmed. Rejected: the ghost alone, which hides part of the place it is over.
- **Silent no-ops are red** (planner): a good over a building, a unit over the warehouse or a
  hold, a colonist over the warehouse: the drop does nothing today, and these are "somewhere it
  can't go" in the owner's words. Rejected: neutral.
- **Native land is allowed** (planner): the drop asks to buy or take it, so the square is green.
  Rejected: amber, which the theme has no token for in this role.
- **Probe amounts** (planner): the plain drop's amount. Rejected: amount 1, which would light a
  hold green that the plain drop then refuses.
- **The map's questions are not refusals** (planner): a landfall, the Europe sail choice and a
  native settlement are yellow. A step onto a foreign colony fails validation though the screen
  may offer trade or an assault; it shows red. A worker who meets that case may add its code to
  the asked set and say so in the pull request.
- **Wheel-scrolling a region mid-drag** (planner): the mark catches up on the next move. Accepted.
