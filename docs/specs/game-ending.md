# The game ends on a page of its own: spec for R-1064 to R-1065

Written by `/plan` on 2026-10-12. Status: proposed.

**The request, in the owner's words:** "there is no ending - if you lose at least the game just sits
there and you cant do anything".

What the code does today. The engine does end the game, for six reasons (`GameOverReason` in
`src/engine/state.ts`: `retired`, `retiredEarly`, `warLost`, `noColonies`, `independence`,
`crownVictory`), and `announceEnd` in `src/app/game-screen.ts` then shows a one-line dialog, the
score with the Hall of Fame, and, after 1800 or 1850 only, "Stop here / Play on". Three gaps leave
the player stranded:

1. When those dialogs close the player is back on the map with `state.over` set. Every action is
   refused, nothing on screen says why, and no menu leads to a new game or the title screen. Only
   Alt+L (load) or reloading the browser page gets out.
2. `announceEnd` runs only after a dispatched action. The finished game is autosaved, so resuming or
   loading it shows a dead map with no word at all.
3. Before 1600 nothing ends the game. A player who has lost every colony and every unit must press
   End Turn, up to 108 times, until the charter rule dismisses them.

## Goal

When the game ends, for any reason, the player lands on an end page that says what happened, shows
the reckoning, and offers every way on: a new game, a saved game, the Hall of Fame, a look over the
map, and playing on where the rules allow it. A power with nothing left is dismissed at once.

## Non-goals

- No new pictures. The page uses the parchment, type and seals the game already has.
- No change to the score, the rating, the Hall of Fame, or to which endings may be played on.
- No "quit to title" command for a game still being played.
- No new `GameOverReason`, no change to `GameState`, no save version bump.
- The computer powers are not dismissed by the new rule, as they are not by the 1600 one.

## Rules and sources

- **1600, no colonies:** unchanged. The private notes: a human power holding no colony in or after
  1600, not having declared, is dismissed, scored once, and may not play on.
- **Ruin (new):** a human power not at war that, as its turn begins, holds no colony, has no unit
  anywhere (on the map, at sea, on the docks or in port in Europe) and has too little gold to put
  one person on Europe's docks by the cheapest means the Europe screen offers, is dismissed at once
  whatever the year, with the reason `noColonies`. This game's own choice, made by the owner; the
  private notes are silent on a power with nothing left before 1600. To be entered in
  `docs/FIDELITY.md` as own design, confidence low.
- **What follows the end:** the private notes give "stop, or keep playing" after the 1800 and 1850
  reckonings and nothing after the others. The end page and its choices are this game's own.

## Shared surfaces

None changed. `GameOverReason`, the `continuePlaying` and `retire` actions, the save format and
`canvas.dataset['over']` (which the end-to-end tests read) all stay as they are. The two items touch
different files and may be built at the same time.

The cheats spec (`docs/specs/cheats.md`, R-1058 to R-1063) is being built alongside and also edits
`src/app/game-screen.ts`, `src/ui/command-bar.ts`, the score report and the Hall of Fame. W2 brings
`origin/main` in before its review and keeps what those items added.

## Work items

### W1 — A power with nothing left is dismissed at once (R-1064, size S, depends on: nothing)

Files: `src/engine/actions.ts` (`gameOverFor`), `src/engine/europe.ts` only if a helper for "the
cheapest way to a person on the docks" is wanted, `src/engine/calendar.ts` or the fitting file under
`src/engine/data/` for any number, `test/unit/engine/turn.test.ts`, `docs/RULES.md` (Score, rating
and the Hall of Fame: "When"), `docs/FIDELITY.md` (a row beside R-206 game end).

Acceptance:
- A human power, not at war, whose turn begins with no colony, no unit of any kind anywhere, and
  gold below the cheapest price that would put a person on the docks, ends the game with
  `{ reason: 'noColonies' }` and a `gameEnded` event, in any year, 1492 included.
- The same power with one unit anywhere (a ship crossing the ocean, a colonist on the docks, a wagon
  on the map), or with gold enough for that cheapest person, is not ended before 1600.
- From 1600 the existing rule is unchanged: no colony ends it, units and gold or not.
- A computer power with nothing left is not ended. A power at war is judged by `warOutcome` as now.
- The game cannot be played on afterwards (`continuePlaying` is refused, as for `noColonies` today).
- The test at `turn.test.ts` that expects a colony-less human to play through 1599 still says so for
  a power that has a unit or the gold; it gains the destitute case beside it.

Verify: `npm test -- test/unit/engine/turn.test.ts`; `npm run check`.

### W2 — The end page (R-1065, size M, depends on: nothing)

Files: `src/ui/end-page.ts` (new: the page and its text, no engine calls beyond reading the state),
`src/app/game-screen.ts` (`announceEnd`, `END_TEXT`, `startGame`, the key handler, the command bar's
state when over), `src/ui/command-bar.ts`, `src/ui/style.css`, `test/unit/ui/end-page.test.ts`
(new), `test/e2e/reports.spec.ts`, `test/e2e/saves.spec.ts`, `docs/ARCHITECTURE.md` (the new
module), `docs/RULES.md` ("When" and the Hall of Fame bullet), and the manual page that describes
how a game ends, if one does (`grep -ril "retire" docs/` to find it).

Acceptance:
- When the game ends, a full-screen page (`role="dialog"`, `aria-modal`, labelled by its headline)
  comes up over the game in place of today's "So be it" dialog. It holds: a headline for the reason
  (six, one per `GameOverReason`, each plainly a win, a loss or a retirement); the closing text (the
  six in `END_TEXT`, moved to the new module); the year; the score, the Colonial Rating and the
  honour as `scoreReport` gives them; and the choices below. The independence page is set in the
  good ink (`--ink-good`), the two defeats and the lost charter in the bad ink (`--ink-bad`); no new
  theme token.
- The game is entered in the Hall of Fame once, when the page first comes up (`recordGame` already
  refuses a second entry for the same game).
- Choices, each a button, the first focused, arrow keys and Enter working as in `ask`:
  - **The reckoning**: the existing score report with the Hall of Fame section; closing it returns
    to the page.
  - **Play on**: only where `validateAction(state, { type: 'continuePlaying' })` is ok (1800 and
    1850). Dispatches it and closes the page; the page's text says the game will not be scored again.
  - **New game**: the title screen, with its choices working and this game's loop, listeners and
    music stopped as `switchTo` stops them. The finished game stays in its save slot.
  - **Load game**: the existing load dialog; a game loaded replaces this one; cancelled, back to the
    page.
  - **Look over the map**: closes the page.
- While the game is over and the page is closed: the status line reads that the game has ended; the
  command bar's orders are disabled and it carries one enabled button, **The end**, that brings the
  page back; Enter and Esc on the map bring it back too. Reports (F1 to F10), scrolling, zoom and
  the load menu go on working. No action is dispatched and no "the game has ended" refusal is shown
  for a key that would have given an order.
- Starting the game screen with a state that is already over (the autosave resumed, a slot or a file
  loaded) puts the page up at once, with no Hall of Fame entry added.
- `canvas.dataset['over']` is the reason while the game is over and empty once played on, as now.
- Nothing on the page overflows or scrolls the window at 1280 x 720 and at 390 x 844.

Verify: `npm test -- test/unit/ui/end-page.test.ts` (the six headlines and texts, which choices each
reason offers, Play on only for `retired` and `warLost`); `npm run test:e2e -- reports saves` with
the two existing ending tests in `reports.spec.ts` rewritten for the page and three added: Shift+R
then New game reaches the title screen and a new game can be begun; a retired game reloaded shows
the page at once; Look over the map then **The end** brings it back. `npm run check`. A screenshot
of the defeat page and the independence page in the pull request.

## Open questions and decisions

Decisions the owner made:
- The ending is a page with existing art (rejected: a last dialog only; new pictures now).
- Ruin before 1600 ends the game only when the treasury cannot buy a way back (rejected: ending
  whenever no colony and no unit is left; leaving 1600 as the only dismissal).

The planner's choices:
- Ruin reuses the reason `noColonies` and its text, so no type, save or Hall of Fame change
  (rejected: a seventh reason, which every table keyed by reason and every old save would feel).
- No "quit to title" while a game is in play; the owner asked about the ending. Loading already
  leaves a game in play.
- How New game reaches the title screen is the worker's to choose, so long as nothing of the old
  game goes on running and the browser page need not be reloaded by the player.

Open: pictures for defeat, retirement and independence, if wanted later, are a separate item
(Codex, then pixelforge) that fills a place on this page.
