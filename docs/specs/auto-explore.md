# Auto-explore for scouts and ships: spec for R-1066 to R-1067

Written by `/plan` on 2026-10-14. Status: proposed.

**The request, in the owner's words (lightly trimmed):** "I want to add auto-explore to scouts and
ships. Scouts when set on auto should prefer exploring ruins and should auto speak-with-chief on
settlements (not repeating)."

## Goal

A scout or a ship can be given a standing **Explore** order. Each turn it moves on its own toward the
nearest place that will show it unexplored squares. A scout heads first for Lost City Rumors and for
native settlements nobody has spoken with, and speaks with the chief there by itself. When nothing
reachable is left to explore, the unit wakes up and the log says so.

## Non-goals

- No exploring for any other land unit (soldiers, colonists, pioneers), nor for treasure trains or
  wagon trains.
- The computer powers keep their own scouting (`src/ai/european.ts`); they do not use this order.
- No change to what a rumour or a chief gives: the outcomes, the throws and the burial-mound
  question stay exactly as `docs/RULES.md` "Lost City Rumors" and the village rules say.
- No demand for tribute, no attack, no trade: the only thing an exploring scout does at a settlement
  is speak with the chief.
- No "go home when done" (rejected by the owner; see Decisions).
- A ship never sails to Europe on this order and never lands anyone.

## Rules and sources

The private notes are silent: the game they describe has no exploring order, so every rule here is
this game's own choice, settled by the owner where marked.

- **Who may explore:** a unit of type `scout` (either profession) standing on land and not aboard, or
  any ship (`isShip`) not on a voyage. This game's own choice.
- **Which squares are known:** the unit plans only over squares its owner has explored
  (`isExploredBy`); a target is an explored square it can stand on from which its sight radius
  (`sightRadius`) would show at least one unexplored square. It never paths through squares the
  player has not seen. This game's own choice (the existing Go To paths over the true map; exploring
  must not leak what the fog hides).
- **What a scout prefers:** a visible rumour, or a square beside a settlement it may speak at,
  whose travel cost is within `EXPLORE.preferWithin` of the nearest plain frontier target beats that
  target. When no frontier target is left, any reachable rumour or such settlement is still taken.
  Ties go to the cheaper path, then to the one showing more unexplored squares, then to the lower
  `y`, then the lower `x`: no randomness, so a replayed log gives the same moves. This game's own
  choice; the owner asked that scouts prefer ruins.
- **Rumours:** an exploring scout enters every rumour it can see, accepting the risk of losing the
  party; it stops moving for the turn on the square, the rumour is explored as for any move, the
  result dialog is shown, and a burial mound still asks the player whether to search. Owner's
  decision.
- **Chiefs:** an exploring scout speaks with the chief at a settlement only when nobody has spoken
  with that chief yet (`settlement.scouted` is empty; a second visit always yields nothing) and the
  settlement's attitude toward the scout's owner is neither Angry nor War (`ATTITUDES` in
  `src/engine/data/tribes.ts`). Speaking spends the scout's moves as it does now. Owner's decision.
- **Waking:** the order clears and the unit waits for orders when (a) nothing reachable is left to
  explore, (b) a unit of a power or a tribe at war with its owner stands within one square at the
  start of its turn, or (c) the player clicks it or presses Activate. A rumour, a chief or a burial
  question does not clear the order. (a) is the owner's decision; (b) and (c) are the planner's.
- **Ships:** explore the sea only; never move onto a Sea Lane square in a way that sails to Europe
  (`planMove(..., { sail: false })`), never enter an inland lake, never stop in a foreign colony.
  Cargo and passengers aboard stay aboard. This game's own choice.

## Shared surfaces

- `UnitOrders` in `src/engine/state.ts` gains `'explore'` — **W1**, first. The union grows; no field
  is added, so `SCHEMA_VERSION` stays 1 and saves made before still load (no migration).
- A new action `explore { unitId }` in `src/engine/actions.ts` and a new event
  `{ type: 'exploreDone', unitId, x, y }` — **W1**.
- A new rule table `EXPLORE` in `src/engine/data/explore.ts` (with its snapshot test) — **W1**.
- The keymap row, the command-bar button and the order letter — **W2**.

## Work items

### W1 — The Explore order in the engine (R-1066, size M, depends on: nothing)

Files: `src/engine/state.ts`, `src/engine/data/explore.ts` (new), `src/engine/data/index.ts`,
`src/engine/explore-order.ts` (new), `src/engine/path.ts` (a cost-bounded search from one start to
every reachable square, if `findPath` cannot be reused), `src/engine/movement.ts` (`executeMove` keeps
`'explore'` like `'goto'`), `src/engine/actions.ts` (validate and apply `explore`; add it to
`CONTACT_ACTIONS` and to the per-turn loop in `unitPhase` beside Go To), `src/engine/invariants.ts` if
it needs a case, `test/unit/engine/explore-order.test.ts` (new),
`test/unit/engine/data/explore.test.ts` (new snapshot), `docs/RULES.md` (new section "Exploring",
after "Go To Europe"), `docs/ARCHITECTURE.md` (one paragraph for the new module).

Acceptance:
- `explore` is refused (with a reason code) for a unit that is not a scout or a ship, a scout aboard
  a ship, a unit on a voyage, a unit with no moves, or another player's unit. Accepted, it sets the
  order to `explore`, clears `destination` and `route`, and moves the unit at once with the moves it
  has, as Go To does.
- At the start of each of its owner's turns an exploring unit moves again with its full moves.
- It plans only over squares its owner has explored; a test map with a cheap unexplored corridor and
  a dearer explored one shows the explored one is used.
- It goes to the cheapest-to-reach target from which its sight shows an unexplored square, and after
  the move those squares are explored by its owner.
- A scout with a visible rumour within `EXPLORE.preferWithin` of the nearest plain target goes to the
  rumour, stops on it for the turn, and the rumour is explored (the `rumorExplored` event is
  emitted). A burial mound leaves `pendingBurial` set and the order still `explore`. A party that
  vanishes is gone and nothing else moves in its name.
- A scout beside a settlement with an empty `scouted` list whose attitude to its owner is below
  Angry speaks with the chief (`chiefSpoke` event, moves spent, `scouted` set); it heads for such a
  settlement as it heads for a rumour. It never speaks where `scouted` is not empty, nor where the
  attitude is Angry or War, and never demands tribute or attacks.
- A ship explores the sea, never sails to Europe, never enters an inland lake or a foreign colony,
  and keeps its cargo and passengers.
- With nothing reachable left to explore, the order becomes `none` and an `exploreDone` event names
  the unit and its square. At the start of its turn, a unit of a power or tribe at war with its owner
  within one square also clears the order (no event needed beyond the order change).
- Replaying the same action log gives the same moves (no `Math.random`; ties broken as the rules
  above say).
- An old save (`test/fixtures/saves/v1.json`) still loads.

Verify: `npm test -- test/unit/engine/explore-order.test.ts test/unit/engine/data/explore.test.ts`;
`npm run check`.

### W2 — Explore in the interface (R-1067, size S, depends on: W1)

Files: `src/ui/keymap.ts` (a `Shift-E` row: "Explore: the active scout or ship explores on its own
until nothing is left in reach"; command `explore`), `docs/KEYS.md` and `wiki/Controls.md`
(regenerated), `src/ui/command-bar.ts` (an Explore button, shown only for a unit that may explore),
`src/ui/unit-queue.ts` (`orderLetter` gives `X` for `explore`; an exploring unit does not need
orders), `src/app/game-screen.ts` (dispatch; add `explore` to `UNIT_ORDER_ACTIONS`; show chief
results that come from an `explore` or `endTurn` action; an `exploreDone` log line), the wiki page
on units and orders, `test/unit/ui/*` for the touched modules, `test/e2e/explore.spec.ts` (new).

Acceptance:
- `Shift-E` and the Explore button give the active scout or ship the order; for any other unit the
  key does nothing and says why on the status line, and the button is not shown.
- The unit's box shows `X`; the next-unit cycle skips it; with "End of turn" off the turn ends by
  itself once every unit has orders, exploring ones included.
- When a scout speaks with a chief on its own, the player sees the same result text a manual visit
  shows, as a dialog after the moves, in the same place rumour results are shown (`afterMoving`);
  the manual visit and the automatic one share one function for that text.
- Rumour results and the burial-mound question appear exactly as for a manual move.
- `exploreDone` writes a log line such as "Scout at (12, 30): nothing left to explore." and the
  unit becomes the active unit when its turn comes round.
- Clicking the unit or Activate wakes it, as for any other order.

Verify: `npm test -- test/unit/ui`; `npm run test:e2e -- explore` (a scout set to explore beside an
unvisited friendly settlement and a rumour: after one End Turn the chief's and the rumour's dialogs
have appeared and the unit's letter is `X`); `npm run check`.

## Open questions and decisions

Owner's decisions (2026-10-14):
- Rumours: an exploring scout enters every rumour it can see and the burial-mound question is still
  asked. Rejected: always leaving mounds unasked; stopping beside each rumour for the player.
- Chiefs: only settlements nobody has spoken with, and not where the attitude is Angry or War.
  Rejected: every unvisited settlement whatever its mood.
- When nothing is left: wake and say so. Rejected: going to the nearest own colony first.

Planner's choices:
- The key is `Shift-E` (plain `E` opens Europe; free plain letters carry no meaning for "explore").
  The order letter is `X`.
- Exploring plans over explored squares only, unlike Go To. Rejected: the true map, which would steer
  a unit by what the fog hides.
- "Not repeating" is read as "nobody has spoken with this chief", since the game records one visit per
  settlement and a later visit by anyone yields nothing.
- A worker that meets a case not covered here (a scout on a square where a burial mound waits when its
  next turn begins, say) builds the smaller reading and says so in the pull request.
