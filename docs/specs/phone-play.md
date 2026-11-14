# Play on a phone: spec for R-1071 to R-1076

Written by `/plan` on 2026-11-14. Status: approved.

**The request, in the owner's words:** "I want to optimize this game for mobile, and specifically
iPhone Duo." The game was laid out for a desktop window and played with a mouse and a keyboard. On a
phone a tap works as a click and a pinch zooms the map, but a finger cannot pan the map, nothing that
needs a hover, a right-click or the Shift key can be reached, the sidebar takes 232 px of a screen
that may be 393 px wide, and nothing keeps clear of the notch or the home bar.

## Goal

The whole game can be played with fingers alone, from the title screen to the end page, on the
iPhone Duo's cover and inner screens and on an ordinary iPhone, held upright or sideways, and goes
on without a break when the phone is folded, unfolded or turned. A desktop window looks and behaves
as it does today.

## Non-goals

- No change to any game rule, to the save format or to the stored options.
- No change to how the game looks or plays in the full layout (defined below) with a mouse. The
  measure of that is: every existing end-to-end test passes unedited, `test/e2e/visual.spec.ts`
  among them, and the desktop box snapshot W1 records does not change.
- No native app, no app-store packaging, no haptics, no gamepad.
- No layout that spans the fold as two panes; the inner screen is one screen.
- No second Playwright config and no second browser engine in the test run. The tests emulate the
  sizes and touch in Chromium (see Open questions for what that leaves unproven).
- No touch control for what stays keyboard-only: the map's view mode (a finger pans instead), the
  colony screen's letter shortcuts where a button or a tap already does the same, and Tab
  completion in the cheat console.
- No new art.

## Rules and sources

No rule of the game is added or changed, so the private notes were not consulted for one. What
follows is this game's own choice for its own screens.

- **The screens planned for** ("postures"), in CSS pixels, width × height:

  | Name | Size | What it is |
  |---|---|---|
  | `duoCoverUpright` | 466 × 678 | iPhone Duo, folded, upright |
  | `duoCoverSideways` | 678 × 466 | iPhone Duo, folded, sideways |
  | `duoInnerUpright` | 626 × 890 | iPhone Duo, unfolded, upright |
  | `duoInnerSideways` | 890 × 626 | iPhone Duo, unfolded, sideways |
  | `phoneUpright` | 393 × 852 | an ordinary iPhone, upright |
  | `phoneSideways` | 852 × 393 | an ordinary iPhone, sideways |

  The Duo's sizes are its published pixel counts (1398 × 2034 and 1878 × 2670) divided by three;
  they are not figures its maker publishes in points, and a browser's bars take some of the height.
  So each posture is also tested 40 px smaller in both dimensions (`SMALL_POSTURES`): the layouts
  are written for ranges, never for one exact size.
- **The layout** is `compact` when the window is narrower than 760 px or shorter than 640 px, and
  `full` otherwise (640 px is the height today's sidebar is built to fit). All six postures and
  their smaller forms are compact. **The posture** is `upright` when the window is taller than
  wide, `sideways` otherwise.
- **The pointer** is `coarse` when the browser says its primary pointer is coarse, or once a touch
  has been felt in this visit; `fine` otherwise.
- **A thing to tap**, in the compact layout or with a coarse pointer, is at least 44 × 44 CSS px
  (`--tap`), or has that much room to itself.
- **A long press** is a touch held 500 ms without travelling 10 px. **A tap** is a touch lifted
  sooner, without travelling 10 px. A touch that travels 10 px or more is a pan or a scroll and
  can no longer become either. The mouse's own threshold for a drag (4 px) is unchanged.

## Shared surfaces

W1 makes all of these and goes first; W2 to W6 only use them, and none writes a second way to do
the same.

- **The three attributes on `<html>`**, kept current by W1 on every resize:
  `data-layout="compact|full"`, `data-posture="upright|sideways"`, `data-pointer="coarse|fine"`.
  Every rule for the compact layout, a posture or a coarse pointer is written against these
  (`:root[data-layout='compact'] ...`). No item writes a media query on the window's size or on the
  pointer for these purposes. The two `@media (max-width: 760px)` rules already in the stylesheet
  stay as they are.
- `index.html` and `public/manifest.webmanifest`.
- Tokens in the `:root` block of `src/ui/style.css`: `--safe-top`, `--safe-right`, `--safe-bottom`,
  `--safe-left`, `--tap`.
- `src/ui/touch.ts`:
  - `LONG_PRESS_MS = 500`, `LONG_PRESS_TRAVEL = 10`;
  - `layoutOf(width: number, height: number): { layout: 'compact' | 'full'; posture: 'upright' | 'sideways' }`;
  - `onLongPress(element: Element, handler: (target: Element, clientX: number, clientY: number) => void): () => void`.
    The handler runs once a touch or pen pointer that went down inside `element` has been held
    `LONG_PRESS_MS` without travelling `LONG_PRESS_TRAVEL`; never for a mouse; never once a second
    pointer is down; never after a `pointercancel`. Whenever the handler ran, the release that
    follows makes no `click` and no `contextmenu`. The returned function removes it.
  - `LOOK_UP = 'lookup'`: the name of a bubbling `CustomEvent` whose `detail` is
    `{ clientX: number; clientY: number }`. Sent from an element, it asks for that element's
    encyclopedia page. W3 listens for it on the game's screen; W5 sends it.
- `test/e2e/postures.ts`: `POSTURES`, `SMALL_POSTURES`, and the touch helpers `tap`, `touchDrag`,
  `longPress`, `pinch` (sent as real touch input through the browser's debugging protocol). A test
  opts in with `test.use({ viewport: POSTURES.x, hasTouch: true })`, and each touch test begins by
  expecting `data-pointer="coarse"` after its first tap: it fails, never skips, if that is not so.

Who owns what where files are shared:

- `src/app/game-screen.ts`: W2 owns where the screen is assembled and `resize`; W3 owns everything
  from the comment "The pointer's shape" to `edgeScroll`, which includes `pediaTargetAt` and the
  `contextmenu` handler. No other item edits this file.
- `src/ui/style.css`: W1 owns the `:root` block, `html, body, #app` and `.magnified-notice`; W2 the
  section "the game: map, sidebar, command bar" (with `.game`) and `.event-log`; W3 `.map-tooltip`;
  W4 the colony screen's whole section, its help line included; W6 every other section. W5 adds
  only rules for its Part buttons, next to the buttons they style.
- Bring `origin/main` in before the review; where two items touched one file, keep both sides.

No type in `src/engine/state.ts`, no action and no save version changes.

## Work items

### W1 — The page on a phone, and the tools the other items share (R-1071, size S, depends on: nothing)

Files: `index.html`, `public/manifest.webmanifest`, `src/ui/style.css` (the `:root` block,
`html, body, #app`, `.magnified-notice`), `src/ui/touch.ts` (new), `src/app/shell.ts`, `src/ui/magnified.ts`,
`test/unit/ui/touch.test.ts` (new), `test/unit/ui/style.test.ts`, `test/e2e/postures.ts` (new),
`test/e2e/phone.spec.ts` (new), `docs/ARCHITECTURE.md`.

Acceptance:
- First, before any other change: `phone.spec.ts` records a text snapshot, at 1280 × 800, of the
  bounding boxes of the sidebar, the chart, the command bar and each of its buttons on the map
  screen, of each region of the colony screen, and of the Europe screen's regions. The snapshot
  recorded on `main`'s code is the one committed; it is the measure of "as it is today" for every
  item.
- `<html>` carries `data-layout`, `data-posture` and `data-pointer` as Shared surfaces defines
  them, from before the title screen paints, and they change when the window does.
- `touch.ts` is as Shared surfaces defines it. Its unit test covers `layoutOf` at the boundaries
  (759 and 760 wide, 639 and 640 high, a square window) and, with a fake clock, `onLongPress`: it
  fires at 500 ms and not at 499; a mouse never fires it; a second pointer, 10 px of travel or a
  `pointercancel` stops it; the click after it is swallowed; the returned function removes it.
- Checked as text, in `style.test.ts` and `phone.spec.ts` (Chromium has no notch, no moving bars
  and no on-screen keyboard, so their effect is seen only in the simulator, which is not a gate):
  - `index.html` asks for `viewport-fit=cover`, names the game for the home screen and asks for a
    dark status bar; the manifest's `orientation` is `any`;
  - `--safe-top`, `--safe-right`, `--safe-bottom`, `--safe-left` are the four
    `env(safe-area-inset-*, 0px)` values, `--tap` is `44px`, and `#app` is padded by the four
    insets;
  - `html, body, #app` take the dynamic viewport height, with today's `100%` kept as the fallback
    before it;
  - the page allows no double-tap zoom (`touch-action: manipulation` or stricter on `#app`), no
    overscroll, no text selection and no system call-out outside `input` and `textarea`.
- With a coarse pointer the magnified-page notice tells the player to pinch the page back with two
  fingers; with a fine one it reads as it does today.
- At each of `POSTURES` and `SMALL_POSTURES` the title screen loads, a game starts by taps alone,
  and the document scrolls in neither direction.

Verify: `npm test -- test/unit/ui/touch.test.ts test/unit/ui/style.test.ts`;
`npx playwright test test/e2e/phone.spec.ts test/e2e/offline.spec.ts test/e2e/visual.spec.ts`;
`npm run check`.

### W2 — The dock: the map screen in the compact layout (R-1072, size M, depends on: W1)

Files: `src/ui/dock.ts` (new), `src/ui/command-bar.ts`, `src/ui/sidebar.ts`, `src/app/game-screen.ts`
(where the screen is assembled, and `resize`), `src/ui/style.css` (the section "the game: map, sidebar,
command bar", `.event-log`), `test/unit/ui/dock.test.ts` (new), `test/unit/ui/command-bar.test.ts`,
`test/e2e/dock.spec.ts` (new), `docs/ARCHITECTURE.md`, `docs/KEYS.md`.

Acceptance:
- In the compact layout the sidebar is replaced by a dock: under the map at the map's full width
  when upright, at the right of the map when sideways. In the full layout the sidebar is as it is
  today (W1's box snapshot).
- The dock shows the date, the treasury, the active unit with its moves and orders, the status
  line, and these commands: Wait, Skip, Go to, Fortify, Sentry, Build, End turn and More. Each is a
  button of at least `--tap` by `--tap`, runs what its sidebar button runs, and is enabled, hidden
  and relabelled by the same rules (Go to reads Cancel while a destination is picked; End turn
  reads The end when the game is over).
- More carries the same `data-europe` state, in every state, that the sidebar's Europe button
  carries, and is marked the same way.
- More opens a sheet over the map holding every other command of the command bar, the chart, the
  Location and Terrain rows, and the features, cargo and aboard lists. Choosing a command runs it
  and closes the sheet; a tap on the chart centres the map there and closes it; a tap outside the
  sheet, or its Close button, closes it.
- At each of `POSTURES` and `SMALL_POSTURES` the map's canvas has at least 55% of the window's
  area, and every button of the dock lies inside the window without a scroll.
- The event log and the slip lie inside the canvas's box.
- Changing the window from any posture to any other, and to 1280 × 800 and back, in the middle of a
  turn keeps the game, the active unit and the zoom level and keeps the active unit's square inside
  the canvas. After each change the canvas's backing size is its box times the device pixel ratio,
  the dock or sidebar shown is the one the layout calls for, and a move made by a tap on the map
  lands. The test goes through all six.
- With the More sheet, the colony screen or a dialog open, the same change of size leaves it open
  and its buttons inside the window.

Verify: `npm test -- test/unit/ui/dock.test.ts test/unit/ui/command-bar.test.ts`;
`npx playwright test test/e2e/dock.spec.ts test/e2e/phone.spec.ts test/e2e/mouse.spec.ts test/e2e/map.spec.ts test/e2e/shell.spec.ts test/e2e/visual.spec.ts`;
`npm run check`.

### W3 — Fingers on the map, and the long press that looks a thing up (R-1073, size M, depends on: W1)

Files: `src/app/game-screen.ts` (from "The pointer's shape" to `edgeScroll`, and the minimap's
handler), `src/ui/pointer.ts`, `src/ui/tile-tooltip.ts`, `src/ui/style.css` (`.map-tooltip`),
`test/unit/ui/pointer.test.ts`, `test/unit/ui/tile-tooltip.test.ts`, `test/e2e/touch-map.spec.ts` (new),
`docs/KEYS.md`.

Acceptance:
- One finger dragged across the map pans it: the square that was under the finger when it went
  down is still under it, to within one square, when it lifts. Lifting after a pan gives no order
  and selects nothing.
- A tap does what a click does there today: steps the active unit to a neighbouring square, opens
  our colony, picks another unit of ours, sets a Go To destination while one is being picked,
  centres the view otherwise. A tap on the map also ends the hidden-terrain look, as a key does.
- A finger put down on the active unit and moved 10 px or more sends it where the finger lifts (a
  step to a neighbour, a Go To farther off), with the same marker and the same refusal mark as the
  mouse's drag. While that drag is within `--tap` of an edge of the canvas the view scrolls; a
  finger near the edge otherwise never scrolls it.
- Two fingers zoom about the point between them as they do today; from the moment a second finger
  comes down until every finger has lifted, nothing pans, nothing is ordered and no long press
  fires.
- A long press on a square, the active unit's own and a square during Go To targeting included,
  shows that square's slip and does nothing else: no order, no destination. It shows whether or not
  the Terrain tooltips option is on. The slip's bottom edge lies 24 px above the finger, or its top
  24 px below where there is no room above. With a coarse pointer the slip carries a Look up
  button that opens the encyclopedia page a right-click on that square opens. The slip goes at the
  next tap, pan or pinch.
- A long press on anything else a right-click looks up today (a building on the colony screen, a
  token on the Europe screen) opens its encyclopedia page, and is not also taken for a tap. The
  one exception is a thing on the colony screen that can be dragged (it carries `data-drag`): a
  long press there is left to the colony screen (W5).
- A `lookup` event (`LOOK_UP`) reaching the game's screen opens the encyclopedia page a right-click
  on its target opens. A `contextmenu` event that a touch raises opens nothing by itself.
- A `pointercancel`, or a change of the window's size, in the middle of any of these drops the
  gesture: no order, no pan left running, no marker left on the map.
- A tap on the chart, where it is shown, centres the map there.
- With a mouse everything is as it is today: hover, the pointer's shape, edge scrolling, the
  right-click, the wheel, the drag.

Verify: `npm test -- test/unit/ui/pointer.test.ts test/unit/ui/tile-tooltip.test.ts`;
`npx playwright test test/e2e/touch-map.spec.ts test/e2e/mouse.spec.ts test/e2e/tooltip.spec.ts test/e2e/map.spec.ts test/e2e/colony.spec.ts`;
`npm run check`.

### W4 — The colony screen at phone sizes (R-1074, size M, depends on: W1)

Files: `src/ui/style.css` (the colony screen's section only), `src/ui/colony-screen.ts` (only where
a region's markup must change to reflow), `test/e2e/colony-phone.spec.ts` (new),
`docs/VISUAL_CHECKLIST.md`.

Acceptance, at each of `POSTURES` and `SMALL_POSTURES` unless a bullet says otherwise:
- Every region of the colony screen (header, settlement, the squares around it, people, transport,
  the production panel, warehouse, the help line, the way out) can be scrolled into the window; the
  screen never scrolls sideways; and the boxes of the regions do not overlap one another, the
  header and the way out excepted.
- The header (with the colony's name) and the way out stay inside the window wherever the screen is
  scrolled to, lying over what scrolls beneath them.
- Upright, the regions stack in one column and the screen scrolls down. The settlement's picture
  and the squares around the colony are each scaled down to fit the column's width where they are
  wider than it, never enlarged beyond today's size, and never cut off.
- Sideways, the settlement and the squares sit side by side, and the warehouse can be reached by
  scrolling no more than one window's height.
- With a coarse pointer every token, building, square and button is at least `--tap` high, and the
  warehouse shows all sixteen goods with their counts set at 11 px or more.
- The menus the screen opens (jobs, construction, exports) lie inside the window and scroll inside
  themselves when they are longer than it.
- In the full layout the screen is as it is today (W1's box snapshot).

Verify: `npx playwright test test/e2e/colony-phone.spec.ts test/e2e/colony.spec.ts test/e2e/phone.spec.ts`;
`npm run check`. Put a screenshot of the colony screen at `duoCoverUpright` and at `phoneSideways` in
the pull request.

### W5 — Fingers on the colony and Europe screens (R-1075, size M, depends on: W1)

Files: `src/ui/colony-screen.ts` (the section "pointer: press, move, release", and the text of the
help line), `src/ui/europe-screen.ts`, `src/ui/style.css` (`.drag-ghost` and the Part buttons only),
`test/e2e/touch-colony.spec.ts` (new).

Acceptance:
- A finger that goes down on the colony screen and travels 10 px or more before it has been held
  500 ms scrolls the screen, wherever it went down, a token included, and moves nothing.
- A finger held 500 ms on a colonist, a unit, a good or a cargo picks it up: its ghost appears at
  once, lifted so that its bottom edge is 12 px above the finger, and the token it came from is
  dimmed. From then on the screen does not scroll under that finger.
- Moved 10 px or more after the pick-up, the ghost follows the finger; the place under the finger
  (not under the ghost) is marked or refused exactly as the mouse's drag marks it; lifting the
  finger drops the thing there, and lifting it over no place puts it back.
- While a picked-up thing is within `--tap` of the top or bottom of the window the screen scrolls
  that way, so that any region can be reached in one drag at every posture.
- Lifted without having moved 10 px after the pick-up, the thing is put back and its encyclopedia
  page opens (the token sends `LOOK_UP`); nothing is selected and nothing is moved.
- A second finger, a `pointercancel` or a change of the window's size during a pick-up puts the
  thing back: no drop, no ghost left on the screen.
- Tap, then tap, does what click, then click, does today, for a colonist, a unit, a good and a
  cargo; a second tap on the same colonist opens the jobs menu, and on the same ship or wagon
  train its orders. The mouse's drag is as it is today.
- While a good or a cargo is selected on the colony screen, the foot of the screen carries a Part
  button. With it pressed, the next placement, by tap or by a finger's drop, asks how much, as
  Shift does; it lets go after one placement and when the selection is dropped.
- The Europe screen's market carries a Part button. With it pressed, the next tap on a stall or on
  a cargo asks how much to buy or sell, as the `+` and `_` keys do; it lets go after that one.
- Each how-much prompt takes digits from a number pad (`inputmode="numeric"`).
- What a `title` alone tells today on these two screens is also told by a tap: tapping a square
  that cannot be worked, a building, an equipped colonist, or a button that is refused says in the
  help line (the colony) or the harbour-master's note (Europe) what its `title` says.
- With a coarse pointer the help line speaks of tapping, of holding a thing to pick it up and
  drag it, and of holding and letting go to look it up, and never of clicks, right-clicks or
  Shift; with a fine one it reads as today.

Verify: `npx playwright test test/e2e/touch-colony.spec.ts test/e2e/colony.spec.ts test/e2e/europe.spec.ts test/e2e/harbour.spec.ts test/e2e/trade.spec.ts`;
`npm run check`.

### W6 — Every other screen at phone sizes (R-1076, size M, depends on: W1)

Files: `src/ui/style.css` (the sections for dialogs, the Europe screen, reports, the options and save
dialogs, the cheat console, the encyclopedia, the end page, the title, power and customize screens),
`src/ui/dialog.ts`, `src/ui/options-dialog.ts`, `src/ui/europe-screen.ts` (markup only), `src/ui/pedia-screen.ts`,
`src/ui/report.ts`, `src/ui/title.ts`, `src/ui/power.ts`, `src/ui/customize.ts`,
`test/e2e/screens-phone.spec.ts` (new).

Acceptance, at each of `POSTURES` and `SMALL_POSTURES` unless a bullet says otherwise:
- Each of these lies inside the window, never scrolls the page sideways, and scrolls inside itself
  when it is taller than the window: the title screen, Customize, Choose a European Power, every
  dialog (a question, a menu, a text prompt, the combat analysis, options, save and load), the
  Europe screen with its panels, each of the ten reports, the encyclopedia, the cheat console and
  the end page.
- The button that leaves each of them stays inside the window wherever it is scrolled to: Close or
  Done on a screen or dialog that has one, Back or Cancel on Customize and Choose a European Power,
  the choices on the end page. The title screen's menu is all inside the window or scrolls to it.
- Every dialog that Esc dismisses today shows, in the compact layout or with a coarse pointer, a
  Close button of at least `--tap` by `--tap` at its top right that does what Esc does. A tap on
  the backdrop does what a click on it does today, which is nothing.
- No dialog or panel has a minimum width wider than the window.
- With a coarse pointer every choice in a menu or dialog is at least `--tap` high, and each option
  in the options dialog shows its hint as a line under its label.
- Every text field is set at 16 px or more, so that taking the focus never magnifies the page, and
  is scrolled into the visible viewport when it takes the focus.
- A table in a report that is wider than the window scrolls sideways inside its own section.
- In the full layout every one of these is as it is today: the existing specs named below pass
  unedited, and W1's box snapshot does not change.

Verify: `npx playwright test test/e2e/screens-phone.spec.ts test/e2e/shell.spec.ts test/e2e/options.spec.ts test/e2e/saves.spec.ts test/e2e/reports.spec.ts test/e2e/europe.spec.ts test/e2e/phone.spec.ts`;
`npm run check`.

## Open questions and decisions

Decisions the owner made (2026-11-14):

- **Things are dragged with a finger on the colony screen**, and it must feel natural on a phone.
  Rejected: tap, then tap, as the only way (the planner's first proposal).
- **All four Duo postures** are fully playable. Rejected: the inner screen only; landscape only with
  a request to turn the phone.
- **Ordinary iPhones too**: 393 × 852 upright and 852 × 393 sideways are laid out and tested.
  Rejected: the Duo's cover screen as the smallest size.
- **The sidebar becomes a dock under the map** on an upright screen. Rejected: a slide-out drawer;
  a narrowed sidebar kept at the right.

The planner's choices (say so in the pull request if you find one of them wrong):

- The same dock stands at the right of the map when the window is sideways, since 393 px and 466 px
  of height cannot hold today's sidebar. Rejected: today's sidebar with a scroll.
- The layout turns compact by the window's size, not by the kind of pointer, so a small desktop
  window gets it too and a test can ask for it by size alone.
- The dock's commands are Wait, Skip, Go to, Fortify, Sentry, Build, End turn and More; the rest are
  under More. Rejected: a dock that changes with the active unit.
- A long press on the map shows the slip, with Look up on it; on a building and on the Europe
  screen, where there is no slip and nothing to drag, it opens the encyclopedia at once.
- How the finger's drag works on the colony screen: a swipe scrolls, a hold picks a thing up, and
  a hold let go in place looks it up, the way a phone's own home screen and lists behave. Upright,
  the screen is one long column made almost wholly of tokens, so a drag that began the moment a
  finger moved on a token would leave nowhere to scroll from. Rejected: a drag begun at once on a
  token, with scrolling only from the gaps; a separate handle on each token.
- Part of a cargo is asked for with a Part button, on the colony screen and in Europe's market.
  Rejected: a long press on the good, which is the look-up.

Left open:

- The tests run in Chromium with a phone's window and touch input. They do not prove Safari's own
  behaviour: its bars, its safe areas, its on-screen keyboard, its rubber-band scroll. After the
  items merge, the planner looks at each posture in an iOS simulator and reports what differs; a
  worker does not wait for that.
- The Duo's sizes in points are derived, not published (see Rules and sources). If the real window
  is smaller than the 40 px the tests allow for, that is a new item.
- Drawing the map at three device pixels to one on the inner screen is about five million pixels a
  frame. No budget is set here because none can be measured without the device; if the simulator or
  the owner's phone shows it slow, capping the scale is a new item of size S.
- A worker who finds a screen this spec does not name builds the smaller reading (it lies inside
  the window, it scrolls inside itself, its way out stays in the window) and says so in the pull
  request.
