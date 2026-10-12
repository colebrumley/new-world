# Cheats: spec for R-1058 to R-1063

Written by `/plan` on 2026-10-12. Status: proposed.

**The request, in the owner's words:** "Just for fun I want to add a cheats menu, where the user can
adjust money, spawn units, reveal the map, add resources, liberty bells, etc. Let's come up with a
design that allows the most flexibility. I'm thinking that this should probably live in the main
menu so it's out of the way. It's not an intended primary feature, but kind of a bonus fun thing for
experienced players." And: "I also want help coming up with the list of available cheats."

## Goal

During play, Alt+C (or Menu… then Cheats) opens a small command console on parchment. The player
types a line such as `gold 5000`, `spawn galleon here`, `reveal` or `goods Jamestown muskets 300`,
and the game does it at once, through an ordinary engine action that is logged, saved and replayed
like any other. A game in which a cheat was used is marked as such in the score report and the Hall
of Fame, and otherwise plays on unchanged.

## Non-goals

- No cheat changes the turn, the year, the difficulty or the seed. A cheat touches only the power it
  is for; with the `as` prefix that power may be a computer power (its treasury, its Congress, its
  units, its colonies), and nothing in `src/ai` is told or changed.
- No form with pickers and buttons. The console is the whole interface; its help sheet is the
  discoverability. (The owner chose the console over a form panel.)
- Nothing on the title screen and no switch that enables cheats: the menu is always there, one Alt
  letter away, as the other menus are. (The owner's decision.)
- The `?reveal` URL flag that lifts the fog for tests is left as it is; the `reveal` cheat is a change
  to the state, not to the view.
- No cheat that undoes another. A cheated game is a cheated game.

## Rules and sources

Cheats are this game's own; no rule here comes from any source. The constraints they respect are the
game's own too:

- A cheat is an action (`validateAction` / `applyAction`), so that the action log in a save replays
  to the same state (REQUIREMENTS.md G3, C4). The console is a front end to that action and nothing
  more.
- The engine stays pure (C3): `src/engine/cheats.ts` and `src/engine/cheats/*` take a state and
  return a state. The console (`src/ui`) does the parsing; the app (`src/app`) dispatches.
- The numbers a cheat uses when none is given live in `src/engine/data/cheats.ts`, nowhere else.
- A cheat changes the state the way the game's own code would (`creditBells` and `warBells`,
  `join` and `fatherArrives`, `revealAround`, `newDockUnit`, `joinColony`, `setStance`,
  `powersMeet`, and so on) rather than by writing fields the rest of the engine then has to
  reconcile. Where the game has no such path (a warehouse over capacity, a building a colony is too
  small for, an alarm set to a number), the cheat writes the field and the ordinary turn code takes
  it from there. Each row of the table says which.
- A cheat that would take a count below zero is refused, never clamped.
- Once a cheat has been applied, the power it was for **and** the power whose turn it is are both
  marked (`Player.cheated`); the mark is never cleared and travels with the save. The score report
  says so and the Hall of Fame shows it. (The owner chose "marked and shown" over "kept out of the
  Hall".)
- The `cheat` action is not a contact action (`CONTACT_ACTIONS` in `actions.ts` is not changed): a
  unit spawned or teleported beside a settlement or onto a rumour meets nobody and digs nothing until
  it next moves. Spawn and teleport do reveal the squares in the unit's sight for its owner, through
  `revealAround` with `sightRadius`, as a move would.

## The design in one page

**The action.** `{ type: 'cheat'; player?: PlayerId; command: CheatCommand }`. `player` names the
power the cheat is for and defaults to the current player; it must be a European power that has not
withdrawn. `CheatCommand` is a discriminated union, one member per cheat, grouped into files under
`src/engine/cheats/` (treasury, map, units, colonies, world). `src/engine/cheats.ts` holds the shared
types, `checkCheat` and `applyCheat` (which dispatch to the groups), `CHEAT_SPECS` (every group's
specs, in help order), and the marking of the players. Applying a cheat pushes one event,
`{ type: 'cheatApplied'; player: PlayerId; summary: string }`, whose summary is a short sentence in
plain digits ("Added 5000 gold to the treasury.", "Revealed the whole map.") the console and the log
both show.

**The specs.** Each cheat comes with a `CheatSpec`: its name, its arguments (each a name, a *kind*
and whether it is optional), a line of help, an example line for the help sheet, and `build(args)`,
which turns parsed arguments into a `CheatCommand`. W1 fixes the kinds:

```ts
export type CheatArgKind =
  | 'amount' | 'count' | 'percent' | 'square' | 'place'
  | 'colony' | 'unit' | 'good' | 'unitType' | 'profession' | 'father' | 'building'
  | 'tribe' | 'settlement' | 'power' | 'terrain' | 'resource'
  | { readonly oneOf: readonly string[] }          // one fixed word
  | { readonly anyOf: readonly CheatArgKind[] };   // the first alternative that matches
export interface CheatArg { readonly name: string; readonly kind: CheatArgKind; readonly optional?: boolean }
export type Place = { readonly kind: 'square'; readonly x: number; readonly y: number } | { readonly kind: 'colony'; readonly colonyId: ColonyId } | { readonly kind: 'europe' };
export type CheatArgValue =
  | number                                               // count, percent
  | string                                               // an id, or the word of a oneOf
  | { readonly set: boolean; readonly value: number }    // amount
  | { readonly x: number; readonly y: number }           // square
  | Place
  | { readonly kind: string; readonly value: CheatArgValue }; // anyOf: which alternative matched ('word' for a oneOf) and its value
export interface CheatSpec {
  readonly name: string; readonly args: readonly CheatArg[]; readonly about: string; readonly example: string;
  readonly build: (args: Readonly<Record<string, CheatArgValue | undefined>>) => CheatCommand;
}
```

An omitted optional argument reaches `build` as `undefined`; `build` fills a number from `CHEATS` in
`src/engine/data/cheats.ts`, and treats an omitted square or place as the spec's row says (an omitted
`reveal` square means the whole map). `here` is the parser's business: the parser turns it, and an
omitted place where the row's default is `here`, into the active unit's square before `build` sees
it, and refuses the line when there is no active unit. The parser (W4) is written once over the kinds
and never per cheat: adding a cheat later is one union member, one `check`/`apply` case and one spec
in a group file. That is where the flexibility lives.

**The console.** One text line with a transcript above it and a help sheet listing every spec's usage,
help line and example. Enter runs the line, Tab completes the current word, Up and Down walk the
lines accepted this visit, Esc closes. A refused line stays in the box with the reason under it; an
accepted one is cleared and its summary joins the transcript and the log beside the map. The console
stays open so that several cheats can be stacked.

**The grammar** (W4 implements, W5 shows):

- `[as <power>] <cheat> <args…>`. `as England` / `as france` / `as p2` sets `player`. Every cheat
  accepts it.
- An *amount* is `500` or `+500` (add), `-200` (take) or `=1000` (set). A *count* is a whole number
  of zero or more. A *percent* is 0 to 100.
- A *square* is `x,y`, or `here` for the active unit's square. A *place* is a square, `here`,
  `europe`, or a colony named as below.
- A thing is named by its id (`u12`, `c3`, `expertFarmer`, `adamSmith`) or by its name. An exact id
  or an exact full name, ignoring case, wins outright. Otherwise a word that begins the name or any
  word of the name, ignoring case, matches (`jamest`, `amsterdam`, `farmer`, `smith`), and exactly
  one thing must match or the line is refused with the candidates listed. A name with spaces may be
  quoted: `"New Amsterdam"`. The candidates are what the game offers in play: buildings with
  `unused` set and professions with `colonist` false are left out, so `town` is one Town Hall and
  `artillery` is Artillery. A unit may also be `active`. A colony, unit or settlement is looked up in
  the state; everything else in its data table.
- An argument of kind `anyOf` takes the first alternative that parses; `<good>|all` is
  `{ anyOf: ['good', { oneOf: ['all'] }] }`.
- A line whose first word is no cheat is refused, listing the cheat names that begin with the same
  letter, or all of them if none does. A missing required argument is refused naming it; a surplus
  word is refused.

## The cheats

Each row gives the line, what it does, and where it departs from the game's own paths. "Refused
below zero" means the whole line is refused when the result would be negative.

| Group (item) | Line | Does |
|---|---|---|
| treasury (W1) | `gold [amount]` | Adds to, takes from or sets the treasury; refused below zero. Default `CHEATS.gold` = 1000. |
| | `crosses [count]` | Adds crosses toward the next immigrant. Default `CHEATS.crosses` = 100. |
| | `bells [count]` | Adds liberty bells. The lifetime `Player.bells` always grows by the count. Before the Declaration the count also goes through `creditBells` (toward the next Founding Father; the Congress may convene or seat him at once). After it, through `warBells` in `independence.ts` (toward the intervention; crossing the threshold begins it and resets the count, as it does at the end of a turn). Default `CHEATS.bells` = 100. |
| | `father <father>` | Seats a Founding Father at once through `join` in `congress.ts` (exported for this): his arrival effects run, `fatherBells` goes to 0, the candidate and the offer are cleared. Refused if he already sits in this power's Congress. |
| | `tax <percent>` | Sets the tax rate, 0 to `MARKET.maxTax`. |
| | `boycott lift` | Lifts every boycott (as Fugger does). |
| map (W1) | `reveal [square] [count]` | With nothing: every square known to the power. With a square: the squares within the radius (default `CHEATS.revealRadius` = 3) through `revealAround`. |
| map (W2) | `terrain <square> <terrain>` | Sets the ground: an open or forest terrain id sets base and forest (through `FORESTED_FROM`), `hills`/`mountains` set the relief (flat otherwise), `arctic`/`ocean`/`seaLane` the base. A square turned to water loses its road, plow, river, resource and rumour. Refused under a colony or a settlement, and under a unit the result cannot carry. |
| | `road <square> on\|off`, `plow <square> on\|off`, `river <square> none\|minor\|major`, `resource <square> <resource>\|none`, `rumor <square> on\|off` | Sets one feature of a square. Plow needs open land; a resource must suit the terrain (`RESOURCE_TERRAINS`); the rest are refused on water. `rumor on` is refused under a colony or settlement. |
| units (W2) | `spawn <unitType> [profession] [place]` | A new unit of the power with `fullMoves`, orders `none` and the next id. A colonist-role type takes a profession (default `freeColonist`); other types refuse one. Native types and `damagedArtillery` are refused. *At a square* (an `x,y`, `here`, or the default `here`): a land unit on land, a ship on water or on the square of the power's own colony; refused on a square holding a settlement, another power's colony, or any unit not the power's. *In a colony* (the colony named): the colony must be the power's; a colonist-role unit walks in as a colonist through `joinColony` (a soldier's or pioneer's kit goes to the warehouse, as it does when one joins), refused at `COLONY_LIMITS.maxPopulation`; any other type stands on the colony's square. *Europe*: through `newDockUnit`, which puts a ship in port and a person on the docks with the moves and orders it gives; refused when Europe is closed to the power. A pioneer at a square carries `PIONEER_TOOLS.max` tools; a treasure train carries `CHEATS.treasureGold` = 1000. |
| | `teleport <unit> <square>` | Moves one of the power's units on the map to a square (the same square checks as spawn); its passengers go with it. Moves are kept. Refused for a unit on a voyage (`voyage !== null`) or aboard a carrier. |
| | `moves <unit>` | Restores the unit's moves for the turn (`turnMoves`). |
| | `repair <unit>` | A damaged ship is sound again (`repair` to 0); refused for anything but a ship under repair. |
| | `promote <unit>` | A soldier or dragoon colonist becomes a veteran (`profession` to `veteranSoldier`); refused for anything else, and for one already a veteran. |
| colonies (W3) | `goods <colony> <good>\|all <amount>` | Adds to, takes from or sets a good in the warehouse, or every one of the sixteen; refused below zero. The warehouse may stand over capacity; spoilage at the end of the turn handles that as it does now. |
| | `hammers <colony> <amount>` | Adds to, takes from or sets the hammers put by; refused below zero. |
| | `finish <colony>` | Gives the colony the hammers and the tools its current project needs (and no gold changes hands), so it completes at the end of the turn through the ordinary construction code. Refused with nothing under construction. |
| | `building <colony> <building>` | Adds the building and every earlier link of its chain the colony lacks; the population minimum, the coast and the Father it may need are all ignored. Refused if present. |
| | `liberty <colony> <percent>` | Sets Sons of Liberty membership keeping the colony's denominator: `n = floor(percent * d / 100)`, `d` unchanged. The bonus level follows at the next turn as it does now. |
| world (W3) | `alarm <tribe>\|<settlement> <percent>` | Writes the tribe's or the settlement's alarm at the power to the number given (a set, not an adjustment; no event). |
| | `peace <tribe>` | A treaty of peace with the tribe: met, at peace, no grudge, any pending treaty question answered. |
| | `meet <power>` | The two powers have met (`powersMeet`); refused if met already. |
| | `stance <power> peace\|war` | Sets peace or war with a power (`setStance`), meeting it first if need be. |
| | `crown regulars\|cavalry\|artillery\|ships\|gold <amount>` | Adds to, takes from or sets a part of the Expeditionary Force held against the power, or the King's war chest (`royalMoney`); refused below zero. |
| | `price <good> <count>` | Sets the Europe bid price of a good for the power: the stored price becomes `count + 1` (`bidPrice` is the stored price less one, `market.ts`), clamped to `MARKET[good].low … high`. |

Each cheat's colony, unit or settlement argument must belong to or concern the power the cheat is
for (a colony or unit of another power is refused with its name); `as` moves that power.

Left out on purpose (and why): changing the turn or year (the calendar drives scoring, the Fathers'
eras and the Crown); changing difficulty mid-game (the tables are read by level everywhere). Either
can be a later spec.

## Shared surfaces

- `src/engine/state.ts`: `Player.cheated?: true` (optional; absent reads as not cheated, so
  `SCHEMA_VERSION` stays 1 and no migration is written). W1.
- `src/engine/actions.ts`: the `cheat` member of `Action`, the `cheatApplied` member of `GameEvent`,
  `'cheat'` codes in `ActionErrorCode`. W1.
- `src/engine/cheats.ts`: `CheatCommand`, `CheatArgKind`, `CheatArg`, `CheatArgValue`, `Place`,
  `CheatSpec`, `CHEAT_SPECS`, `checkCheat`, `applyCheat`. W1 defines them exactly as above; W2 and W3
  add union members and specs in their own group files and one import and one dispatch line each in
  `cheats.ts`. W1 leaves a labelled comment (`// map and units (R-1059)`, `// colonies and world
  (R-1060)`) where each goes, in the union, in `checkCheat`, in `applyCheat` and in `CHEAT_SPECS`, so
  that the two merges do not collide.
- `src/engine/data/cheats.ts`: `CHEATS = { gold, crosses, bells, revealRadius, treasureGold }`. W1.
- `src/ui/keymap.ts` (and so `docs/KEYS.md`, the manual's `controls` table and `MENU_CHOICES`): the
  Alt+C row. W5.
- `src/app/game-screen.ts`: a `runCheat(action)` beside `dispatch` that returns the summary (W5).
- `src/app/hall-of-fame.ts`: `HallEntry.cheated?: boolean`. W6.
- `REQUIREMENTS.md` §0: "cheat menu" is struck from the out-of-scope list by the planning pull
  request.

## Work items

### W1 — The cheat action, its specs, and the treasury, Congress and reveal cheats (R-1058, size M, depends on: nothing)

Files: `src/engine/cheats.ts` (new), `src/engine/cheats/treasury.ts` (new),
`src/engine/cheats/map.ts` (new, holding `reveal` only until W2), `src/engine/data/cheats.ts` (new),
`src/engine/actions.ts`, `src/engine/state.ts`, `src/engine/congress.ts` (export `join`),
`src/engine/explore.ts` (a whole-map reveal if `revealAround` with a large radius is not enough),
`test/unit/engine/cheats.test.ts` (new), `test/unit/engine/cheats/treasury.test.ts` and
`map.test.ts` (new), `test/unit/engine/data/cheats.test.ts` (snapshot, new),
`test/unit/engine/actions.test.ts`, `test/unit/engine/save.test.ts`, `docs/RULES.md` (new section
"Cheats (R-1058)"), `docs/ARCHITECTURE.md` (a paragraph for `cheats.ts` and `cheats/`).

Acceptance:
- `applyAction` with `{ type: 'cheat', command }` changes the state as the table says for `gold`,
  `crosses`, `bells`, `father`, `tax`, `boycott lift` and `reveal`, pushes one `cheatApplied` event
  with a summary in plain digits, and sets `cheated: true` on the player it was for and on the
  current player (one player when they are the same); a second cheat leaves the flags as they are.
- `validateAction` refuses: a cheat after the game has ended (`gameOver`); a `player` that is not a
  European power or has withdrawn; a treasury that would go below zero; a Father already seated; a
  tax outside 0 to `MARKET.maxTax`; a square off the map. Each refusal has a message a player can
  read.
- `bells` before the Declaration adds to `bells` and `fatherBells`; when the Congress has a candidate
  and the bells now cover his cost, he is seated by that one action (`fatherJoined` is among the
  events). With no candidate and a human power, the offer is drawn and `fatherOffer` filled, as at
  the opening of a turn. After the Declaration `bells` still grows, and the count goes through
  `warBells`: below the intervention threshold `revolution.bells` rises by the count; reaching it
  yields `interventionBegan` and the reset, exactly as the turn code would.
- `father` seats him through `join`: he is in `fathers`, `fatherBells` is 0, the candidate and offer
  are cleared, and his arrival effect shows (Fugger lifts a boycott set up before).
- `reveal` with no square marks every square explored by the power's index and no other; with a
  square and radius, exactly the squares `revealAround` would; with a square alone, radius
  `CHEATS.revealRadius`.
- `player` defaults to the current player and, when given, acts on that power (a cheat `as` a
  computer power during the human's turn adds to the computer power's gold and marks both).
- A save written after a cheat loads (`loadGame`) and `replay(options, log)` reaches the same state
  as the snapshot (a round trip in `save.test.ts` whose log holds a cheat).
- `CHEAT_SPECS` has unique names and a non-empty `about` and `example` on every spec (a generic test
  in `cheats.test.ts`); each group's own test file checks that every spec of its group, given
  arguments the test supplies, builds a command `checkCheat` accepts in a state the test sets up.
- `CHEATS` in `src/engine/data/cheats.ts` is `as const satisfies Record<…>` with a snapshot test.
- The types in "The specs" are exported from `cheats.ts` exactly as written, and the union,
  `checkCheat`, `applyCheat` and `CHEAT_SPECS` carry the two labelled comments named under Shared
  surfaces.

Verify: `npm test -- test/unit/engine/cheats test/unit/engine/actions.test.ts test/unit/engine/save.test.ts`;
`npm run check`.

### W2 — Unit and square cheats (R-1059, size S, depends on: W1)

Files: `src/engine/cheats/units.ts` (new), `src/engine/cheats/map.ts`, `src/engine/cheats.ts` (the
labelled lines only), `src/engine/cargo.ts` or `movement.ts` (export `putUnit` or whatever placing a
unit needs), `test/unit/engine/cheats/units.test.ts` (new), `test/unit/engine/cheats/map.test.ts`,
`docs/RULES.md` (lines under "Cheats").

Acceptance:
- `spawn` as the table says, on a small world from `test/helpers/world.ts`: at a square, a land unit
  on land and a ship on water or on the power's own colony; refused on the wrong ground, off the
  map, on a settlement, on another power's colony, on a square holding a foreign unit, for native
  types and `damagedArtillery`, for a profession on a type that takes none, and in Europe when
  Europe is closed. The new unit has `fullMoves`, orders `none`, the power as owner and the next id;
  `nextId` advances; the squares in its sight are explored for the owner.
- `spawn … <colony>` of a colonist-role type makes a colonist there with the profession given, a
  soldier's muskets going to the warehouse; refused when the colony is full or not the power's.
  `spawn soldier here` on the colony's own square leaves a soldier standing there.
- `spawn treasure` carries `CHEATS.treasureGold`; `spawn pioneer` at a square carries
  `PIONEER_TOOLS.max` tools; `spawn caravel europe` lies in port as `newDockUnit` makes it.
- `teleport` moves the unit and every unit aboard it; refused for a unit on a voyage, aboard a
  carrier, or bound for a square it could not stand on.
- `moves`, `repair` and `promote` as the table says, each refused where it does not apply.
- `terrain` and the five feature cheats as the table says; a square turned to water is bare of road,
  plow, river, resource and rumour; `checkInvariants` passes after each, and a ship's square turned
  to land is refused.
- Every new cheat has a spec in its group's list, in the place W1 marked, and its group's test
  checks the spec builds an accepted command.

Verify: `npm test -- test/unit/engine/cheats test/unit/engine/invariants.test.ts`; `npm run check`.

### W3 — Colony, native, power, Crown and market cheats (R-1060, size S, depends on: W1)

Files: `src/engine/cheats/colonies.ts` (new), `src/engine/cheats/world.ts` (new),
`src/engine/cheats.ts` (the labelled lines only), `test/unit/engine/cheats/colonies.test.ts` and
`world.test.ts` (new), `docs/RULES.md` (lines under "Cheats").

Acceptance:
- `goods`, `hammers`, `finish`, `building`, `liberty` as the table says; `goods … all` touches every
  one of the sixteen goods; `finish` followed by `endTurn` completes the project with the treasury
  unchanged; `building fortress` on a colony with nothing adds stockade, fort and fortress;
  `liberty` leaves `sol.d` as it was and `solPercent` reads the percent given.
- `alarm`, `peace`, `meet`, `stance`, `crown`, `price` as the table says. `stance … war` with a
  power not yet met meets it first (both powers' `stance` records show the other). `price` makes
  `bidPrice` return the count, within the table's range.
- A colony named in a cheat must belong to the power the cheat is for; otherwise refused with the
  colony's name in the message.
- Every new cheat has a spec in its group's list, in the place W1 marked, and its group's test
  checks the spec builds an accepted command.

Verify: `npm test -- test/unit/engine/cheats`; `npm run check`.

### W4 — The command parser: text to command, names, completion, help (R-1061, size S, depends on: W1)

Files: `src/ui/cheat-parser.ts` (new), `test/unit/ui/cheat-parser.test.ts` (new).

Pure functions over a list of specs and a `GameState`; no DOM. Exports, with `specs` defaulting to
`CHEAT_SPECS` so that tests can pass their own:

- `parseCheat(text, state, context, specs = CHEAT_SPECS)` returning `{ ok: true; action: Action }`
  or `{ ok: false; message: string }`, where `context` is
  `{ player: PlayerId; here: { x: number; y: number } | null; active: UnitId | null }`;
- `completeCheat(text, state, context, specs = CHEAT_SPECS)` returning the words that could complete
  the last word (the cheat names at the first word, `as` and the powers after `as`, the candidates
  of the argument's kind after that; a name with spaces is offered quoted);
- `cheatHelp(specs = CHEAT_SPECS)` returning `{ usage: string; about: string; example: string }[]`,
  usage built from the argument names and kinds (`gold [amount]`,
  `spawn <unitType> [profession] [place]`, `goods <colony> <good>|all <amount>`).

Acceptance:
- The grammar under "The design in one page" holds, line by line: `as`, amounts, counts, percents,
  squares (`x,y`, `here`), places (square, `here`, `europe`, a colony), `anyOf` and `oneOf`, names by
  id, by exact name, by a word beginning the name or any of its words ignoring case, and in quotes,
  with exact matches winning; `active` for a unit; unused buildings and non-colonist professions
  absent from the candidates.
- An ambiguous name is refused with every candidate listed; an unknown cheat is refused as the
  grammar says; a missing required argument says which; a surplus word is refused; `here` with no
  active unit is refused with a message that says so; an omitted place whose row defaults to `here`
  is filled from the context before `build`.
- The parser knows nothing of any single cheat: the tests exercise every kind through test-local
  specs (for example a `probe <colony> <good> <unitType> [place]` spec) against a world from
  `test/helpers/world.ts`, and the W1 cheats through `CHEAT_SPECS`.
- `completeCheat` on `go` gives `gold`; on `father ad` gives the Father whose id begins so; on an
  empty line gives every cheat name; with a test-local spec, on `probe ja` gives the colony's name.

Verify: `npm test -- test/unit/ui/cheat-parser.test.ts`; `npm run check`.

### W5 — The console: Alt+C, the dialog, the log line (R-1062, size M, depends on: W1, W4)

Files: `src/ui/cheat-console.ts` (new), `src/ui/keymap.ts`, `src/ui/style.css`,
`src/app/game-screen.ts`, `docs/KEYS.md` (regenerated), `wiki/Controls.md` (table regenerated),
`test/unit/ui/keymap.test.ts`, `test/unit/ui/command-bar.test.ts`, `test/e2e/cheats.spec.ts` (new),
`docs/ARCHITECTURE.md` (the `src/ui` and `src/app` paragraphs).

Acceptance:
- `KEYMAP` has a map row `Alt+C`, command `menu`, action beginning "Cheats:"; `docs/KEYS.md` and
  the manual's `controls` table are regenerated (`UPDATE_FIXTURES=1 npm test -- test/unit/ui/keymap.test.ts test/unit/wiki`),
  and `MENU_CHOICES` lists Cheats after Colony report options (the command-bar test's list grows to
  seven menus). The "There is no such menu" message in `game-screen.ts` names Alt+C.
- `game-screen.ts` gains `runCheat(action): string | null` beside `dispatch`: it steps the session
  as `dispatch` does (the two share one body; `dispatch` keeps its boolean), records
  "Cheat: <summary>" from the `cheatApplied` event in the log beside the map, and returns the
  summary. A `fatherJoined` or `congressConvened` among the same events is handled as the screen
  handles it after a turn (the worker reuses that code; if the offer dialog cannot be put up from
  here without new state, it waits for the turn's opening and the PR says so).
- Alt+C and Menu… then Cheats open a dialog with `role="dialog"` and the accessible name "Cheats",
  styled as the other parchment dialogs from the theme's tokens alone (`style.test.ts` still
  passes). It holds, top to bottom: a heading; a transcript list (empty at first); a help sheet in a
  `<details>` element headed "Commands", one row per `cheatHelp()` entry showing usage, help and
  example; a text input labelled "Command"; a hint line; a Done (Esc) button.
- Enter parses the line with `parseCheat` (context: the player, the active unit and its square),
  then `validateAction`; a refusal shows its message in the hint line and leaves the text; an
  accepted line goes to `runCheat`, the input clears, and the summary joins the transcript. The map
  behind redraws (the treasury in the sidebar shows the new gold without closing the dialog).
- Tab completes the last word when `completeCheat` gives one candidate, and shows the candidates in
  the hint line when it gives several. Up and Down walk the lines accepted this visit.
- Esc, Enter on Done, or clicking Done closes the dialog and returns focus to the map canvas.
- The e2e test starts a game with a fixed seed, opens the console with Alt+C, runs `gold 5000` and
  sees the treasury field rise by 5000 and the transcript show the summary; runs `reveal` and sees
  the minimap's vellum count fall to zero (as `map.spec.ts` counts it); runs `nonsense` and sees a
  refusal in the hint line; closes with Esc; reloads the page and sees the gold kept (the autosave
  carried the cheat).

Verify: `npm test -- test/unit/ui`; `npm run test:e2e -- cheats`; `npm run check`.

### W6 — The mark of a cheated game: score report, Hall of Fame, manual (R-1063, size S, depends on: W1)

Files: `src/app/hall-of-fame.ts`, `src/ui/reports/score.ts`, `test/unit/app/hall-of-fame.test.ts`
(which also tests `scoreReport`), `wiki/Help-and-Options.md` (new section "## Cheats"),
`wiki/Tips-and-FAQ.md` (one question), `docs/RULES.md` (the Score section gains a line).

Acceptance:
- `entryFor` sets `cheated: true` on the entry when the player is marked; `withEntry` and `readHall`
  keep it; an old entry without the field reads as not cheated.
- `hallSection` shows the mark: the leader column reads "…, cheated" after the liberator/rebel word,
  and the heading row is unchanged.
- `scoreReport` for a marked player has, in its first section, a row reading "Cheats were used in
  this game." in the first cell with the other cells empty, placed just before the Total row; for an
  unmarked player no such row, and nothing else changes.
- The manual's Help and Options page gains a "Cheats" section: how to open the console, the grammar
  in a few lines, the full table of cheats as this spec gives them (kept by hand, not generated),
  and that a cheated game is marked. Tips and FAQ gains "Is there a cheat menu?" pointing there.
  `test/unit/wiki` passes.
- `docs/RULES.md` "Score, rating and the Hall of Fame" says a cheated game is scored and entered,
  marked.

Verify: `npm test -- test/unit/app test/unit/wiki`; `npm run check`.

## Open questions and decisions

Decisions the owner made during planning:

- **Entry point:** the in-game menu list, Alt+C and the sidebar's Menus picker. Rejected: a switch
  on the title or Customize screen that enables the menu per game; a cheats page on the title screen
  acting on the autosave.
- **Shape:** a command console with a help sheet and completion. Rejected: a form panel of pickers
  and buttons (every new cheat is new form code); the console with a row of quick buttons.
- **Scoring:** a cheated game is scored and entered in the Hall of Fame, marked. Rejected: kept out
  of the Hall; no consequence.

Decisions the planner made:

- Cheats are engine actions, not UI-side edits of the state, because saves replay the action log
  (`replay` in `save.ts`) and the simulation and e2e tests depend on that; the flag lives on the
  `Player` so that a bare snapshot (the Hall of Fame reads one) knows without the log.
- Both the power the cheat is for and the power whose turn it is are marked, so that `as france …`
  cannot help the human without marking the human.
- The flag is optional on `Player` so that no save migration is needed. Rejected: a required field
  with a schema bump and a migration, for one boolean.
- The grammar is declarative (specs with argument kinds, including `anyOf` and `oneOf`) so that
  adding a cheat touches no parser code; the square edits are separate cheats (`terrain`, `road`,
  `plow`, `river`, `resource`, `rumor`) rather than one `square` cheat with sub-commands, so that no
  argument's kind depends on another's word. Rejected: a hand-written parser case per cheat.
- Refuse rather than clamp wherever a count would go below zero: one rule, no silent surprises.
- `finish` completes at the end of the turn through the construction code rather than at once, so
  that the completion events, the notices and the next project come as they always do.
- `liberty` keeps the colony's denominator and sets only `n`, because the engine grows and decays `d`
  with the population; a fixed `d` would swing membership at the next join or departure.
- `father` goes through `join` (losing the bells gathered, as a paid-for Father does) rather than
  `fatherArrives` alone, so that the Congress's bookkeeping stays what the turn code expects.
- The cheat list above is the owner's request plus what the state offered cheaply. A worker meeting a
  cheat it cannot build faithfully within its item says so in the pull request and leaves that one
  out rather than bending the rules around it.

Questions left open, and what a worker should do:

- Whether a cheat should be allowed while an audience, a parley or a pending question
  (`pendingTax`, `pendingBurial`, `fatherOffer`) is on the table. Default: allow it; the ordinary
  validation of the next action still holds. Say so in the PR if it bites.
- Whether `bells` convening the Congress mid-turn should put the offer to the player at once.
  Default: W1 leaves the offer in `fatherOffer`; W5 puts it up at once if the screen's existing
  handler can be called from `runCheat` without new state, and otherwise notes in the PR that it
  waits for the turn's opening.
