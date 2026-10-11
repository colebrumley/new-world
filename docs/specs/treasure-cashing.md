# Cashing treasure trains: spec for R-1038 to R-1039

Written by `/plan` on 2026-10-10. Status: built.

**The request, in the owner's words:** "There is no way to send a treasure train without owning a
galleon, I don't think. I can't find one." Reading the code showed it is worse: nothing cashes a
treasure at all. The Crown's fee is computed by `royalTransportCut` and `royalTransport` in
`src/engine/royal.ts`, but nothing calls them; and a galleon that reaches Europe with a treasure
aboard pays nothing, because the Europe and voyage code never look at the treasure. A treasure found
at a rumour, in burial mounds or in a destroyed settlement is a one-square-a-turn unit and nothing
more. The manual's Glossary and Units pages say so outright.

## Goal

A treasure train can be turned into gold two ways: parked in a coastal colony, the Crown carries it
home for its fee; carried to Europe by the player's own galleon, it pays its whole value the moment
the ship makes port. After the Declaration a treasure in any own colony is sold whole.

## Non-goals

- Computer powers. They do not cash treasure today and this spec leaves that as it is (their rule,
  from the private notes, is whole value on entering an own colony; a later item).
- A new unit command on the map command bar. The offer comes as a question when the treasure enters
  the colony and as an entry in the colony screen's orders menu; that is enough.
- Changing the fee, the Hernan Cortes effect, or anything about where treasure comes from.
- A save version change. No state shape changes.

## Rules and sources

- **The Crown's offer.** A treasure train standing in a coastal colony of its owner, before the
  Declaration, may be carried home by the Crown for a fee. Private notes. "Coastal" is
  `isPortColony` in `src/engine/construction.ts`: a square of open sea touches the colony, not an
  inland lake.
- **Only without a galleon.** The offer is made only when the owner has no galleon anywhere (on the
  map, at sea, or in Europe), or has Hernan Cortes, in which case it is always made. The private
  notes record this as the open-source reading (medium confidence); the owner chose it over
  "always offered" during planning.
- **The fee.** The larger of twice the tax rate and 50 + 5 x level percent, capped at 90; with
  Cortes the tax rate alone. Already in `docs/RULES.md` "Royal events" and in `ROYAL` in
  `src/engine/data/royal.ts`; already tested. The fee goes to the royal purse through `payCrown`,
  as `docs/RULES.md` says ("wired when treasure trains exist").
- **After the Declaration.** A treasure in any own colony, coastal or not, is sold to agents for
  its whole value, no fee; the Crown's purse gets nothing. Private notes.
- **Own galleon.** A treasure aboard a ship of the player's that reaches Europe is cashed for its
  whole value at the moment of arrival, no fee and no tax. The sources are silent on a tax; the
  owner chose whole value during planning (the fee exists for the King's carriage only).
- **Value.** `Unit.treasure` is the value in gold (set by `src/engine/rumors.ts` and
  `src/engine/native-war.ts`).

## Shared surfaces

- `Action` in `src/engine/actions.ts` gains `cashTreasure` (W1). `GameEvent` gains `treasureCashed`
  through `RoyalEvent` (W1). W2 reads both.
- No change to `state.ts`, the save version, test helpers, rule tables or theme tokens.

## Work items

### W1 — Engine: cash a treasure (R-1038, size S, depends on: nothing)

Files: `src/engine/royal.ts`, `src/engine/actions.ts`, `test/unit/engine/royal.test.ts`,
`test/unit/engine/actions.test.ts`, `docs/RULES.md` (Royal events, Treasure), `docs/FIDELITY.md`
(one row for the trigger), `docs/ARCHITECTURE.md` (the `royal.ts` sentence, if it lists what the
module does).

Build in `royal.ts`:

- `treasureQuote(state, unit): { value, fee, net, carrier: 'crown' | 'agents' } | null` — what a
  treasure standing where it stands would pay, or null when it cannot be cashed there.
- `checkCashTreasure(state, playerId, unitId): RoyalCheck` with new `RoyalErrorCode`s: not a
  treasure of this player's; not standing in a colony of its owner; the colony has no open sea
  beside it (before the Declaration); the owner has a galleon and not Cortes (before the
  Declaration). Keep the codes distinct so the UI can word them.
- `cashTreasure(state, playerId, unitId, events)`: removes the unit, adds `net` to `gold`, pays
  `fee` to the Crown with `payCrown`, pushes
  `{ type: 'treasureCashed', player, unitId, value, fee, carrier: 'crown' | 'agents' | 'galleon', colonyId? }`.
- `cashTreasuresAboard(state, playerId, shipId, events)`: every treasure aboard the ship is removed
  and its whole value added to `gold`, fee 0, carrier `'galleon'`, one event per treasure.

Build in `actions.ts`:

- `{ type: 'cashTreasure'; unitId }` in `Action`, validated by `checkCashTreasure`, applied by
  `cashTreasure`. Only the current player's unit.
- In `europePhase`, right after `advanceVoyages`: for each `shipReachedEurope` event of this
  player's, call `cashTreasuresAboard` and push its events after the arrival event. The treasure
  must be gone before the Europe screen could show it.

Acceptance:
- A treasure of the player's in an own port colony, before the Declaration, owner with no galleon:
  `cashTreasure` removes it, gold rises by value minus fee, `royalMoney` rises by the fee, and the
  fee matches `royalTransport`. With Cortes the same with the Cortes fee.
- Same colony but the owner has a galleon anywhere (including one lying in Europe or at sea) and no
  Cortes: refused with its own code. With Cortes: allowed.
- A treasure in an own colony with no open sea beside it (a lake does not count): refused before
  the Declaration; allowed after it.
- After the Declaration (`atWar`): any own colony, fee 0, `royalMoney` unchanged, carrier `'agents'`.
- A treasure standing outside a colony, a treasure of another power, or a unit that is not a
  treasure: refused, each with the right code; the state is unchanged.
- A galleon of the player's carrying a treasure reaches Europe at the start of their turn: the
  treasure unit no longer exists, gold rose by its whole value, `royalMoney` unchanged, and the
  events hold `shipReachedEurope` followed by `treasureCashed` with carrier `'galleon'`. Two
  treasures aboard two ships both pay. A ship with no treasure aboard is unaffected.
- `docs/RULES.md` Treasure says when the Crown offers, the no-galleon rule, the after-Declaration
  sale and the own-galleon payout, and no longer says "wired when treasure trains exist".
  `docs/FIDELITY.md` gets a row for the no-galleon trigger (medium confidence, open-source reading
  recorded in the notes).

Verify: `npm test -- test/unit/engine/royal.test.ts test/unit/engine/actions.test.ts`;
`npm run check`.

### W2 — Ask, menu, notice and manual (R-1039, size S, depends on: W1)

Files: `src/app/game-screen.ts` (the move handler near `needsLandfall`), `src/ui/colony-screen.ts`
(`ordersMenu`), `src/ui/notices.ts` (`voyageNotices`), `test/unit/ui/notices.test.ts`,
`test/e2e/colony.spec.ts` (or a new `test/e2e/treasure.spec.ts`), `wiki/Units.md`,
`wiki/Glossary.md`, `wiki/The-Crown-and-Independence.md`.

Build:

- **The question on arrival.** In `game-screen.ts`, after a `moveUnit` of a treasure train is
  dispatched and the unit now stands in a colony of the player's, if `checkCashTreasure` passes,
  ask with the King's portrait (as the frigate offer does): before the Declaration, "The Crown will
  carry this treasure of N gold home to <home port>. The King keeps F gold (P percent) for his
  trouble; we receive R." with choices Decline and Accept; after the Declaration, "Agents will buy
  this treasure for N gold." with the same two choices. Accept dispatches `cashTreasure` and then
  shows a one-line confirmation (an `ask` with Continue, or a notice line, the worker's choice).
  Decline leaves the train in the colony. Do not ask when the check fails (the player has a galleon
  and no Cortes, or the colony is inland); the train just enters.
- **The orders menu.** In `colony-screen.ts` `ordersMenu`, when the unit is a treasure and
  `checkCashTreasure` passes, add the entry "Send the treasure home (keep R of N gold)" before the
  Declaration or "Sell the treasure (N gold)" after it, dispatching `cashTreasure`. When the unit
  is a treasure and the check fails because of a galleon, add a disabled or explanatory line, or
  none; the worker chooses, but the player must be able to learn why from the pedia text or the
  manual, not be left guessing. Fortify and Sentry stay available.
- **The notice.** `voyageNotices` adds a line for each `treasureCashed` event with carrier
  `'galleon'`: "Our galleon has brought home a treasure of N gold." after the ship's own arrival
  line. Also covered by the notices unit test.
- **The manual.** `wiki/Units.md` (the treasure train paragraph) and `wiki/Glossary.md` (the
  Treasure train entry) drop "nothing pays a treasure out" and say the three ways: the Crown's
  galleon from a coastal colony when you have none of your own (or with Cortes), your own galleon
  to Europe for the whole value, and sale after the Declaration. `wiki/The-Crown-and-Independence.md`
  (the treasure paragraph) adds the no-galleon rule and the own-galleon payout. Pedia text in
  `src/ui/pedia.ts` already matches; leave it unless the generated-table tests say otherwise.

Acceptance:
- Moving a treasure into an own coastal colony with no galleon owned opens the Crown's question;
  Accept removes the train and the treasury shows the net; Decline leaves the train there.
- With a galleon owned (and no Cortes) no question appears on entry.
- The colony screen's orders menu for a treasure that can be cashed offers the entry and it works.
- A `treasureCashed` galleon event yields the notice line; a crown-carried one does not.
- The three wiki pages read true against the engine; no page still says a treasure cannot be
  cashed.

For the end-to-end test, the game has no state-loading hook. Either add a small method to
`GameScreenDebug` on `window.__newWorld` that replaces the session state with a crafted
`GameState` (a treasure beside or in the player's colony), or drive it in unit tests with a
scripted `ColonyScreenHost` if that is simpler. Either satisfies the Verify line; name which in the
pull request.

Verify: `npm test -- test/unit/ui/notices.test.ts`; `npm run test:e2e -- colony` (or the new
spec); `npm run check`.

## Open questions and decisions

- **Owner, during planning:** the Crown offers only when the player owns no galleon (Cortes
  excepted). Rejected: always offered.
- **Owner, during planning:** a treasure brought by the player's own galleon pays its whole value
  with no fee and no tax. Rejected: taxed like a sale.
- **Planner:** "coastal" means `isPortColony` (open sea, not a lake), since the Crown's galleon
  must reach it; `hasWaterSquare` would let a lakeside colony qualify. Rejected: `hasWaterSquare`.
- **Planner:** the arrival question is asked by the app after the move, not raised by the engine
  as a `pendingOffer`; a `pendingOffer` would block the frigate and mercenary offers and would
  need a save-version note. Rejected: a new `RoyalOffer` kind.
- **Planner:** after the Declaration the sale works from any own colony, coastal or not, since no
  ship is involved. If a worker finds the private notes say otherwise, build the coastal reading
  and say so in the pull request.
- **Left open:** whether computer powers should cash treasure. Not in this spec.
