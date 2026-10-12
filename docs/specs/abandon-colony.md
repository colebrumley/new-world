# Abandoning a colony: spec for R-1054 to R-1055

Written by `/plan` on 2026-10-11. Status: built.

**The request, in the owner's words:** "There needs to be a way to abandon or destroy a colony. The
stupid Dutch made one like right next to me and I captured it, but I'm forced to keep it and I don't
want it." Reading the code showed the engine already has the rule and the action (`abandonColony` in
`src/engine/colony.ts`, handled in `src/engine/actions.ts`), but nothing in `src/ui` or `src/app`
ever dispatches it: the colony screen offers "Leave the colony" for each colonist and refuses the
last one, and the manual says outright that there is no way. The engine refuses to abandon a colony
behind a Stockade, Fort or Fortress; the owner chose to keep that rule.

## Goal

The player can give up a colony of their own that has no Stockade, Fort or Fortress from its colony
screen, after one confirmation: the
colonists walk out as units on the square, the buildings and stores are lost, and the colony is gone
from the map.

## Non-goals

- No choice at the moment of capture (keep it or burn it). Capture works as it does now; the player
  opens the colony afterwards and abandons it. The owner decided this.
- No way to tear down a single building, and no way to hand a colony to another power.
- No change to the fortification rule: a colony with a Stockade, Fort or Fortress cannot be abandoned
  and cannot be thinned below three colonists. A captured colony that has one stays the player's.
- No change to what the computer powers do. They never abandon a colony, and this adds no AI code.
- No new key binding and no map-side order. The command lives on the colony screen only.
- Colonies that starve out or are burned keep their own code paths; do not merge them with this one.

## Rules and sources

- Removing the last colonist of a colony asks for confirmation and, on yes, removes the colony: the
  private notes (`colony-research.md`, the "Abandoning" row). `docs/RULES.md` already states it; the
  screen never did it.
- Abandoning turns every colonist out as a unit on the colony's square with no moves left, loses the
  buildings and the stores, and frees the square's claim: already this game's behaviour
  (`abandonColony`), kept.
- The owner's ships in port leave damaged, as from a colony that has fallen: already in
  `docs/RULES.md`, kept.
- A colony with a Stockade, Fort or Fortress cannot be abandoned, and cannot go from three colonists
  downward by the player's action: the private notes, already this game's behaviour (`checkAbandon`,
  `checkLeave`), kept by the owner's decision on 2026-10-11. The screen must say why when it refuses.
- **New, the planner's choice (the sources are silent):** a colony under siege cannot be abandoned.
  The existing rule lets nobody leave a besieged colony unarmed; abandoning would turn everyone out
  unarmed at once. Refused with the existing `underSiege` code. Rejected alternative: allow it and
  arm whoever the stores can arm, which is more code for a case nobody asked for.
- **New, the planner's choice:** the owner's trade routes that stop at the abandoned colony are
  removed, and units following them stop following, exactly as `captureColony` in
  `src/engine/assault.ts` does for the loser's routes. Without this a wagon train keeps a route to a
  colony that no longer exists.
- Abandoning the player's last colony is allowed. From the charter year on it ends the game at the
  next year check (`noColonies`, existing rule, `src/engine/actions.ts`); the confirmation must say so.

## Shared surfaces

- `checkAbandon` in `src/engine/colony.ts` and the `abandonColony` validation in
  `src/engine/actions.ts`: W1 changes them; W2 only reads them through `host.refusal`. W1 goes first.
- `ColonyEvent` `colonyAbandoned`: unchanged in shape. W2 starts listening to it in
  `src/app/game-screen.ts`.
- No change to `src/engine/state.ts`, no save version bump: saves made before this load and play
  unchanged.
- `test/unit/engine/colony.test.ts` pins the `keepStockade` refusal on `abandonColony`; it stays as
  it is.

## Work items

### W1 — Abandoning: not under siege, and the colony's trade routes go with it (R-1054, size S, depends on: nothing)

Files: `src/engine/colony.ts`, `src/engine/actions.ts`, `test/unit/engine/colony.test.ts`,
`docs/RULES.md` (the colony founding section, the two abandon bullets), `docs/FIDELITY.md` (a new
R-300 row for abandoning)

Acceptance:
- `abandonColony` on a colony with a Stockade, a Fort or a Fortress is still refused with
  `keepStockade`, and the existing test for it is unchanged.
- `abandonColony` on a colony for which `isBesieged` is true is refused with `underSiege` and a
  message naming the colony; the same colony with the besiegers removed can be abandoned.
- After abandoning, none of the owner's trade routes has a stop at that colony, no unit has a `route`
  pointing at a removed route, another power's routes are untouched, and `checkInvariants` is empty.
- Abandoning another power's colony is still `notYourColony`; an unknown id is still `noColonyHere`.
- `docs/RULES.md` says what the game now does; `docs/FIDELITY.md` has a row for abandoning: fortified
  colonies cannot be (high confidence), a besieged one cannot and its routes are removed (this game's
  own choices).

Verify: `npm test -- test/unit/engine/colony.test.ts`; `npm run check`.

### W2 — The colony screen abandons: a command, and the last colonist's way out (R-1055, size M, depends on: W1)

Files: `src/ui/colony-screen.ts`, `src/ui/colony-model.ts`, `src/app/game-screen.ts`,
`src/ui/audio-cues.ts` (only if a cue fits an existing sound), `src/ui/style.css` (the header button, if it
needs a rule), `test/unit/ui/colony-model.test.ts`, `test/e2e/colony.spec.ts`, `wiki/Colonies.md`
(the "Leaving and losing a colony" section), `wiki/Buildings.md` (the Stockade row), `src/ui/pedia.ts`
(only if a building entry repeats the old claim)

Acceptance:
- The colony screen's header has an "Abandon colony" button beside "Exit (Esc)", shown only for the
  viewing player's own colony. When `host.refusal({ type: 'abandonColony', ... })` is not null the
  button is disabled and its title gives the refusal's message.
- Pressing it asks one question through the screen's existing `ask`, with "No, keep it" first and as
  the Escape answer, and "Yes, abandon it" second. The text names the colony, says how many colonists
  will walk out, and says the buildings and everything in the warehouse are lost. If ships of the
  player are in port it adds that they leave damaged and lose their cargo. If this is the player's
  only colony it adds that holding no colony loses the charter from the charter year on (read the
  year from `CALENDAR.charterYear`, do not write the number).
- On yes the screen dispatches `abandonColony`; the colony screen closes, the map shows no colony on
  the square, and the colonists stand there as units. On no nothing changes.
- "Leave the colony" in the jobs menu of the last colonist, and dragging the last colonist to the
  outside row, ask the same question and abandon on yes, instead of being refused. While dragging,
  the outside row shows as a valid drop for the last colonist exactly when abandoning is allowed
  (`dropVerdict` in `src/ui/colony-model.ts`).
- For a colony that is not down to its last colonist, "Leave the colony" behaves as before, including
  the `keepStockade` refusal at three.
- The human player gets a notice, "<name> has been abandoned.", when their colony is abandoned.
- `wiki/Colonies.md` and `wiki/Buildings.md` describe the new behaviour: how to abandon, what is
  lost, that a Stockade or stronger works prevents it, and so does a siege. The wiki unit tests still
  pass.

Verify: `npm test -- test/unit/ui/colony-model.test.ts test/unit/wiki`; `npm run test:e2e -- colony.spec.ts`
with new tests that (1) abandon a colony with the button and find the colonists on the map and no
colony, (2) answer no and find the colony intact, (3) take the last colonist out through the jobs menu
and confirm, (4) find the button disabled, with the refusal as its title, in a colony with a Stockade; `npm run check`. Put a screenshot of the confirmation in the pull request.

## Open questions and decisions

Decisions the owner made (2026-10-11):
- A Stockade, Fort or Fortress still prevents abandoning, as the private notes have it. Rejected:
  letting any colony be abandoned; allowing it only for colonies taken from another power.
- Both ways in: the header button and the last colonist leaving. Rejected: either one alone.
- Nothing is asked at capture.

The planner's choices: no abandoning under siege; routes through the colony are removed; abandoning
the last colony is allowed with a warning rather than refused.

If a worker finds that a colony starving out leaves trade routes behind in the same way, say so in the
pull request and on the board; do not fix it here.
