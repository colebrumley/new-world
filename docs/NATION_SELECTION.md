# Choosing a power: design for R-1017

Today a new game always seats the player as England under the name "Player". This document is
the design for the screen that lets the player choose which of the four powers to lead and what
to be called, and for the short audience with the Crown that opens the game. R-1017 in
[REQUIREMENTS.md](../REQUIREMENTS.md) is the backlog item; this is the full design it points to.
The rules for each power are already in `src/engine/data/nations.ts` (R-800) and do not change.

## 1. The flow

The order of the pre-game choices becomes:

```
Title (world choice + difficulty)
  ├─ Start a Game in New World ─┐
  ├─ Start a Game in America ───┤
  └─ Customize New World → Start┘
                                 ▼
                    Choose a European Power   ← new screen (section 2)
                         (name field)
                                 ▼
                     Audience with the Crown  ← new opening dialog (section 3)
                                 ▼
                              The map
```

- The title screen is unchanged. Difficulty stays where it is, chosen before the power.
- Every one of the three ways of starting a new game passes through the power screen; Load Game
  and the Hall of Fame do not.
- Back on the power screen returns to the screen it was reached from: the title, or Customize
  with its settings still as they were.
- The power screen is a title-framed screen like Customize: the same cartouche on the same
  painting (`.title-screen .cartouche`, R-1012), not a dialog over the map.

## 2. The "Choose a European Power" screen

### What it shows

A cartouche headed **Choose a European Power**, holding, top to bottom:

1. **Four powers**, one row each, in the order England, France, Spain, Netherlands. A row is a
   radio button styled as a card (`role="radio"` inside a `role="radiogroup"` labelled by the
   heading) and shows:
   - the power's flag, from `flagArt(nation)` in `src/ui/pixel-art.ts`, drawn with `drawSprite`
     on a small canvas at a whole multiple of its 16 px grid (three: a 48 x 48 canvas, the
     16 x 12 flag with its ink edge filling 48 x 36 of it), `aria-hidden`;
   - the name, set as a heading in the nation colour (`color: var(--nation-<id>)`), with the
     leader and home port under it in faded ink: "Walter Raleigh · London";
   - the one-line strength that `NATIONS[id].strength` already holds.
   The selected row carries a wax seal in its colour at the left edge (the `[data-nation]`
   token mechanism from R-1010: the row element sets `data-nation` so `--nation` resolves for it)
   and a thicker ink rule; the others are plain parchment.
2. **The account**: one short paragraph for the selected power, in a `<p>` under the list with
   `aria-live="polite"`, swapped when the selection moves. Text in section 5.
3. **Lands with**: a line computed from the rules, not typed: the ship, the soldier and the
   pioneer the chosen power starts with at the chosen difficulty, e.g. "Lands with: Caravel,
   Veteran Soldier, Pioneer" or "Lands with: Merchantman, Soldier, Pioneer". The computation
   that `createGame` does inline (`src/engine/game.ts`, the `STARTING_FORCE` lines) moves into a
   pure exported helper `landingParty(nation, kind, difficulty)` returning
   `{ ship: UnitTypeId; soldier: ProfessionId; pioneer: ProfessionId }`, used by both.
4. **Your name**: a text field (`<label>Your name <input maxlength="24">`), prefilled with the
   leader of the selected power. While the player has not typed, changing the power changes the
   prefill; once they have typed, it keeps their text. Empty or whitespace-only on Set Sail
   falls back to the leader's name. Trimmed; no other validation.
5. **Buttons**: **Set Sail** (submit) and **Back**.

### Keys

- Up/Down (and 1–4) move the selection; the usual radio-group focus behaviour, so Tab moves to
  the name field and the buttons.
- Enter anywhere on the screen submits (the form's default), Escape goes Back.
- Document the screen's keys in `docs/KEYS.md` beside the title screen's.

### Defaults and remembering

- The first row selected is the power of the last game started on this browser, else England;
  the name is the last name typed for that power, else the leader. Both are kept in the
  browser store under keys named in `src/app/save-keys.ts` (`new-world:last-power`,
  `new-world:last-name`); reads are wrapped so a blocked store means the plain defaults.
- `?nation=<id>` and `?name=<text>` on the page URL preselect, the way `?difficulty=` and
  `?seed=` already do, so a game can be reproduced and tests can ask for a power. They
  preselect only; the screen still shows.
- `?rivals=0` keeps its meaning: the chosen power alone.

### Layout and theme

- Same frame and width rules as Customize (`.customize .cartouche { width: min(31rem, 100%) }`);
  the power screen may go to 34rem for the four rows. It must fit at 1024 x 640 without scrolling
  the cartouche (C6): four rows of about 3.4rem, the account of at most three lines, the name field,
  the buttons.
- Ink rules between rows, no 1px borders (R-1010); the flag canvas is drawn without smoothing.
- No new art: the flags exist, and there are no leader portraits (R-1016 makes none, and none
  is wanted: no likeness of a historical person).
- A screenshot `docs/theme/title-power.png` goes with the pull request, like the other
  title-framed screens in `docs/theme/`.

### Seats

`src/app/boot.ts` stops hard-coding the four seats. A pure function in the engine builds them:

```ts
// src/engine/game.ts
export function standardPowers(human: NationId, name: string): NewGameOptions['players']
// → [{ id: 'p0', name, kind: 'human', nation: human }, then one 'ai' seat for each other power
//    in NATION_IDS order, with id and name from the nation: { id: 'england', name: 'England', ... }]
```

The human keeps `id: 'p0'`; a computer power's id is its nation id, as today. Nothing in the
engine or UI may assume the human is England: `src/engine/immigration.ts` and `market.ts` test
`player.nation`, which is right; `grep -rn "'p0'\|'england'" src` must show only data tables,
`flagArt`, and this function after the change.

## 3. The audience with the Crown

When a new game starts (not when one is loaded), before the first unit is activated, the game
screen shows one dialog through the existing `ask` (`src/ui/dialog.ts`) with the King's portrait
(`portraitCanvas('king')`, R-1016) as its picture:

> **In the year of Our Lord 1492**
> **An audience with the Queen of England**
>
> "Walter Raleigh: for the glory of England we name you Viceroy of the New World. Cross the
> ocean, settle the land you find, and send its wealth home to our Crown."
>
> [ So be it ]

- The heading's court comes from a new `court` string in `NATIONS` (section 4); the name is the
  player's `name`; the one choice dismisses it (Enter or Escape).
- It is shown by `startGame` when told it is a fresh game: `startGame(root, session, { opening: true })`
  from the three new-game routes in `boot.ts`, never from Load. It is not part of the state or
  the action log, so saves and replays are untouched.
- The dialog is the first thing shown, before any turn-one notices; the view may already show
  the ship behind it.

## 4. Data and state

`NationDef` in `src/engine/data/nations.ts` gains two strings; the snapshot test and the
`as const satisfies` form stay:

| field | England | France | Spain | Netherlands |
|---|---|---|---|---|
| `court` | the Queen of England | the King of France | the King of Spain | the Stadtholder of the Netherlands |
| `account` | section 5 | section 5 | section 5 | section 5 |

- `Player.name` already exists and is where the chosen name goes. No new state fields, no save
  schema change: `NewGameOptions.players` already carries the nation and name, so a save replays
  the same game.
- Where the human's name is shown, `player.name` replaces `NATIONS[nation].leader`:
  - `src/app/hall-of-fame.ts` `entryFor` (`leader: player.kind === 'human' ? player.name : NATIONS[...].leader`);
  - `src/app/slots.ts` `describeSession` ("Jacques Cartier of France, Spring 1500, …");
  - the retirement and score texts in `src/app/game-screen.ts` and `src/ui/reports/score.ts`,
    if any name a leader (none does today; the end-of-game "give your name to" text, R-902, is
    the one to check).
  A player named exactly `Player` (every save made before this change) shows the leader's name
  instead, so old saves do not read "Player of England".
- Computer powers keep their leaders' names as `name` (already so in `boot.ts`); diplomacy text
  uses the nation adjective and is unaffected.

## 5. The accounts (our own words)

One paragraph each, stored as `account` in the data table. These are written for this game;
keep them short enough for three lines in the cartouche.

- **England** — "Quarrels over religion at home send dissenters across the ocean by the
  shipload, and the English colonies fill faster than any other. A third fewer crosses bring each
  new colonist to the docks."
- **France** — "Small posts and missions among the forest peoples, trading in furs rather than
  clearing farms, keep the French on good terms with their neighbours. Native alarm at French
  colonies and units rises at half the usual rate, and the first pioneer is a hardy one."
- **Spain** — "A generation of soldiers left idle by the end of the Reconquista looks west for
  gold and takes it by force. Spanish troops fight half again as strong when attacking a native
  settlement, and the first soldier is a veteran."
- **Netherlands** — "A republic of merchants with the largest fleet in Europe, the Dutch make
  trade the whole of their policy. Prices in Amsterdam fall more slowly when goods are sold and
  recover sooner, and the first ship is a Merchantman."

## 6. Tests

Unit (`npm test`):

- `test/unit/engine/data/nations.test.ts`: snapshot updated for `court` and `account`; every
  `account` is under 260 characters.
- `test/unit/engine/game.test.ts`: `standardPowers('france', 'X')` seats a human France first
  and England, Spain, Netherlands as computer powers; `createGame` with that seating gives the
  human a Caravel with a Soldier and a Hardy Pioneer; `landingParty` matches the units
  `createGame` places for every power at every difficulty, human and computer.
- `test/unit/app/hall-of-fame.test.ts` and `test/unit/app/slots.test.ts`: the human's name is
  shown; a player named `Player` shows the leader.

End to end (`npm run test:e2e -- shell`), new cases in `test/e2e/shell.spec.ts`:

- Each of the three start routes shows the power screen with four radios in order, England
  selected, the name field reading "Walter Raleigh"; Escape returns to the title (and to
  Customize with its settings kept, from there).
- Selecting Netherlands changes the name to "Michiel De Ruyter", the account, and the
  "Lands with" line (Merchantman); typing a name then changing the power keeps the typed name.
- Set Sail as France: the audience dialog names the King of France and the typed name; after it,
  the game element carries `data-nation="france"`, the sidebar shows the Caravel, and the
  autosave's slot summary and Hall of Fame entry use the typed name.
- `?nation=spain&name=Cortes` preselects both.
- The existing e2e specs start games through a new helper `startNewGame(page, choice, { nation?,
  name? })` in `test/e2e/helpers.ts` that clicks the title choice, submits the power screen and
  dismisses the audience; `foundJamestown` uses it. Every spec that clicked a start menuitem
  directly is changed to use the helper. The structural snapshots are unchanged apart from
  this.
- The load budget (`test/e2e/budget.spec.ts`) is unaffected: the screen lives in the `boot`
  chunk, which is fetched behind the title anyway.

## 7. Out of scope

- A difficulty step on the power screen (it stays on the title).
- Leader portraits, nation anthems or any new art.
- Choosing the computer powers' seats, or playing with fewer than four powers other than the
  existing `?rivals=0`.
- Hot-seat or a second human (REQUIREMENTS.md §0, out of scope for v1).
