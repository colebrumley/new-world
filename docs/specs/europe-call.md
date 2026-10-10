# The call to Europe: spec for R-1021 to R-1022

Written by `/plan` on 2026-10-10. Status: approved.

**The request, in the owner's words:** "I want to make it more obvious to the player when there is
something to do in Europe. Perhaps the Europe button could be highlighted or something? Right now
you just have to remember that there's a ship coming or going." A ship that sails for Europe leaves
the map and the sidebar; its arrival in port raises no notice (the engine's `shipReachedEurope`
event is handled nowhere in the UI), and the Europe button in the command bar looks the same whether
a ship is waiting at the quay, crossing, or there is nothing there at all.

## Goal

The Europe button in the sidebar's command bar says at a glance whether Europe needs the player: it
takes the brass plate (the look End turn has) while one of their ships lies in port, carries a small
wax marker while ships of theirs are crossing and none is in port, and reads plain otherwise. Its
tooltip names the ship and, for a crossing, the turns to go. The event log gets a line the turn a
ship of ours makes port in Europe.

## Non-goals

- The Europe screen does not open by itself on arrival. The player still presses E or the button.
- No animation. The brass plate and the marker are static.
- No new game option. The arrival line is always logged, like the lines for independence events.
- No change to the Europe screen itself, to the sidebar's seven information lines (the sidebar must
  still fit a 640px-high window without a scroll), to the keyboard table, to any rule, to the save
  format or to `state.ts`.
- Units standing on the docks with no ship in port do not light the button. Nothing can be done for
  them until a ship arrives, and the arrival lights it.
- Nothing is shown for other powers' ships.

## Rules and sources

Nothing here changes a rule. Both items read state the engine already keeps: a ship's `voyage`
record (`toEurope`, `inEurope`, `toNewWorld` with `turnsLeft`, see docs/RULES.md "Europe travel
(R-203)"), `shipsInEurope` in `src/engine/europe.ts`, `checkEuropeOpen` (Europe is closed to a
power that has declared independence, R-900), and the `shipReachedEurope` event `advanceVoyages`
raises at the start of the owner's turn (`src/engine/voyage.ts`). The wording of the turns to go
follows the Europe screen's lanes ("Caravel, 2 turns"): `turnsLeft` is the number of the owner's
turn starts still to pass before arrival.

The look is this game's own choice (the owner's, during planning): the brass plate is the one
"do this now" look the theme already has, used by End turn; the marker is sealing wax, the theme's
colour for a mark set on parchment. No new theme token is needed: `--plate-brass`, `--brass-light`
and `--wax` exist in `src/ui/style.css`.

## Shared surfaces

- `CommandBar.update` in `src/ui/command-bar.ts` gains a third argument (W1 only).
- `src/app/game-screen.ts` is touched by both items in different places: W1 at the call to
  `commandBar.update` in `draw` (around line 1563), W2 at the list of notice lines recorded when a
  turn ends (around line 316). Neither moves the other's lines; each brings `origin/main` in before
  its review.
- No type in `state.ts`, no action, no save version, no test helper and no theme token changes.

## Work items

### W1 — Europe button state (R-1021, size S, depends on: nothing)

Files: `src/ui/europe-model.ts`, `src/ui/command-bar.ts`, `src/ui/style.css`,
`src/app/game-screen.ts` (the `draw` function only), `test/unit/ui/europe-model.test.ts`,
`test/e2e/europe.spec.ts`, `docs/ARCHITECTURE.md` (the `command-bar.ts` sentence).

A pure function in `europe-model.ts` (suggested: `europeCall(state, playerId)`) returns what the
button is to show, as plain data: a state, one of `'none'`, `'sea'`, `'port'`, and a note for the
tooltip. `game-screen.ts` passes it to `commandBar.update` on every redraw beside the two flags it
already passes; the bar's memo of what it last showed (`shown`) must include it, so the button is
only rewritten when the state or note changes. The look is on the button element: a `data-europe`
attribute reading `port` or `sea`, absent in the plain state, styled in `style.css` with the
stylesheet's tokens only (the style test forbids colours below `:root`).

Acceptance:
- While a ship of the player's lies in port in Europe (`shipsInEurope`), the Europe button carries
  `data-europe="port"` and shows the brass plate: the same background as `.command-wide`, with the
  same hover. Its title reads `Europe (E): Caravel in port` for one ship, `Europe (E): 2 ships in
  port` for more.
- While no ship of theirs is in port but one or more are crossing (`voyage.phase` of `toEurope` or
  `toNewWorld`, the ship itself, not units aboard), the button carries `data-europe="sea"` and a
  small wax-coloured round marker in its top-right corner, drawn with `::after`; its title lists
  each crossing ship with its turns to go, `Caravel arrives in 2 turns` for one bound for Europe,
  `Galleon returns in 1 turn` for one bound back, joined with `; `. Singular and plural turns are
  spelt as the Europe screen spells them.
- With neither, the button has no `data-europe` attribute, its title is `Europe (E)` as today, and
  it looks exactly as it does now (the visual snapshots are unchanged).
- While Europe is closed to the player (`checkEuropeOpen` refuses: independence declared), the
  state is `none` whatever ships remain off the map.
- Other powers' ships never count.
- The button is enabled in every state, as today (it does not need a unit), and clicking it still
  opens the Europe screen.
- The button's height does not change in any state: the command bar keeps its rows.

Verify: `npm test -- test/unit/ui/europe-model.test.ts` (a `europeCall` describe: none, sea with two
ships in opposite directions and the exact note, port with one and with two ships, a ship aboard
nothing but a unit aboard a crossing ship not double counted, a foreign ship ignored, Europe closed);
`npm test -- test/unit/ui/command-bar.test.ts test/unit/ui/style.test.ts` still green; in
`test/e2e/europe.spec.ts`, extend the first test ("a ship sails to Europe and back to the square it
left") with expectations on `.command-bar [data-command="europe"]`: after sailing,
`data-europe` is `sea` and the title contains `Caravel arrives in 2 turns`; two turns on, `port` and
`Caravel in port`; after Set sail, `sea` and `Caravel returns in 2 turns`; after the return, no
`data-europe` attribute. `npm run check`; `npm run test:e2e` (the change is in `src/ui` and
`src/app`).

### W2 — A line in the log when a ship reaches Europe (R-1022, size S, depends on: nothing)

Files: `src/ui/notices.ts`, `src/app/game-screen.ts` (the turn-end notice list only),
`test/unit/ui/notices.test.ts`.

A function in `notices.ts` beside `colonyNotices` (suggested: `voyageNotices(events, state,
playerId)`) returns one line per `shipReachedEurope` event whose ship belongs to the player.
`game-screen.ts` spreads it into the list of lines it records when a turn ends, after
`movementNotices`.

Acceptance:
- The turn a ship of ours makes port in Europe, the Recent events log gains the line
  `Our Caravel has reached London and awaits orders.`: the ship's type name from `UNIT_TYPES`, the
  home port from `NATIONS[nation].homePort` of the player's power.
- Two ships arriving the same turn give two lines, in event order.
- A foreign power's arrival, and a ship returning to the New World (`shipReachedNewWorld`, the ship
  is then on the map and asks for orders itself), give no line.
- No option governs it; it is logged whatever the report options say.

Verify: `npm test -- test/unit/ui/notices.test.ts` (a `voyage notices` describe covering the four
bullets); `npm run check`; `npm run test:e2e` (the change is in `src/ui` and `src/app`).

## Open questions and decisions

- **In port: brass plate, like End turn.** Chosen by the owner over a marker alone (too quiet) and
  over a plate with a pulse (the theme has no animated button, and the arrival line in the log now
  says when it happened).
- **At sea: a quiet marker and a tooltip**, distinct from the in-port look so the player can tell
  "waiting" from "arrived". Chosen by the owner over showing nothing for crossings and over one look
  for both.
- **Log the arrival**, always, with no new option. Chosen by the owner.
- Docks units without a ship do not light the button (planner's choice; see Non-goals). A worker
  who meets a case the acceptance does not name builds the smaller reading and says so in the PR.
- The count in the title for several ships in port is a number ("2 ships in port"), not a list of
  types: the Europe screen lists them.
