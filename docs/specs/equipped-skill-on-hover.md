# The skill under the equipment, on hover: spec for R-1056 to R-1057

Written by `/plan` on 2026-10-11. Status: built.

**The request, in the owner's words:** "I should be able to see what type of colonist it is when they
are a dragoon or soldier, maybe when hovering over them. Veteran soldiers should be visually distinct
also." A colonist given muskets, horses, tools or a cross is named by the role alone: an expert farmer
under arms and a petty criminal under arms both read "Soldier", in the sidebar, on the map's slip, in
the colony and on the docks. Only the expert of the role is named for what he is ("Veteran Soldier").
Nothing tells the player whom it would pay to disarm and put back to work.

## Goal

Rest the pointer on one of the player's own soldiers, dragoons, pioneers, scouts or missionaries (on
the map, outside a colony's gates, on the docks or a ship's quay in Europe) and what appears names the
skill under the equipment: "Soldier (Expert Farmer)", "Dragoon (Free Colonist)". The labels printed on
screen stay as they are.

## Non-goals

- **No change to any figure or piece.** A veteran's own look is put off by the owner, who will make
  figures for all the specialists separately. Nothing in `src/ui/pixel-art.ts`, `src/ui/unit-art.ts`,
  `src/ui/render.ts` or `art/` changes, and no baseline is regenerated.
- No change to a printed label: the sidebar's Unit field and passenger list, a token's label in the
  colony or in Europe, the combat analysis, the notices and the reports all still say what
  `unitLabel` says. Every test that pins one passes untouched.
- Nothing more about another power's units: the slip still names them by owner and kind alone.
- W1 changes no rule. W2 changes one (who has the veteran's half again) and nothing else. Neither
  touches `state.ts` or the save format.
- No tooltip where there is none today (touch screens, the option off, under a dialog).

## Rules and sources

W1 changes no rule; every word is read from `unit.type` and `unit.profession`.

- The full name of a unit (this game's own choice, made by the owner): for the five equipped roles
  (`ExpertRole` in `src/engine/data/professions.ts`: pioneer, soldier, scout, dragoon, missionary)
  held by anyone but that role's expert, the role's name and then the skill's in brackets. For
  everything else it is `unitLabel` unchanged. The private notes describe a shorter qualifier, given
  only for a skilled man; the owner chose the skill always, and on hover only.
- A veteran soldier who is mounted has the type `dragoon` and the profession `veteranSoldier`, and
  `unitLabel` calls him "Dragoon". His full name is "Dragoon (Veteran Soldier)". He does fight as a
  veteran (`unitStrength` in `src/engine/combat.ts`).

- W2: a dragoon whose profession is `veteranDragoon` (the dragoons a mercenary offer lands) has the
  veteran's half again in battle, as a soldier or dragoon whose profession is `veteranSoldier` has
  today. The owner's decision, 2026-10-11; not checked against the private notes.

## Shared surfaces

The two items share no file; the board notes name these:

- `src/ui/unit-text.ts`: new `unitFullName(unit)`; `manifest` gains an optional third parameter, the
  function that names a passenger, defaulting to `unitLabel`.
- `PersonView` in `src/ui/colony-model.ts` and the `passengers` and `docks` entries of the Europe view
  in `src/ui/europe-model.ts` each gain `readonly fullName: string`.

## Work items

### W1 — The skill under the equipment, on hover (R-1056, size S, depends on: nothing)

Files: `src/ui/unit-text.ts`, `src/ui/tile-tooltip.ts`, `src/ui/colony-model.ts`,
`src/ui/colony-screen.ts` (`token`, `personToken`), `src/ui/europe-model.ts`,
`src/ui/europe-screen.ts` (`token` and its two callers for riders and the docks),
`test/unit/ui/unit-queue.test.ts` (beside the `unitLabel` cases), `test/unit/ui/tile-tooltip.test.ts`,
`test/unit/ui/colony-model.test.ts`, `test/unit/ui/europe-model.test.ts`, `test/e2e/tooltip.spec.ts`, `wiki/The-Map.md` (the tooltip paragraph),
`wiki/Help-and-Options.md` (the Tooltips paragraph), `docs/ARCHITECTURE.md` (the `unit-text.ts`
sentence).

Acceptance:
- `unitFullName` gives, for a unit of type soldier, dragoon, pioneer, scout or missionary whose
  profession is not that role's expert, the type's name and the profession's in brackets:
  "Soldier (Expert Farmer)", "Soldier (Free Colonist)", "Dragoon (Petty Criminal)",
  "Pioneer (Master Carpenter)", "Scout (Indentured Servant)", "Missionary (Free Colonist)",
  "Dragoon (Veteran Soldier)", "Scout (Veteran Soldier)".
- For every other unit it equals `unitLabel`: "Veteran Soldier" (a soldier), "Veteran Dragoon" (a
  dragoon whose profession is `veteranDragoon`), "Hardy Pioneer", "Seasoned Scout",
  "Jesuit Missionary", "Expert Farmer" (a colonist), "Caravel", "Continental Army", "Artillery", and
  an equipped unit with no profession ("Soldier").
- `unitLabel` and `sidebarModel` give what they gave before; `test/unit/ui/sidebar.test.ts` and the
  existing cases of `test/unit/ui/unit-queue.test.ts` pass untouched.
- On the map's slip, the line of one of the viewer's own units begins with its full name:
  "Soldier (Expert Farmer) · Moves 1 · Fortified". A passenger in its `carried` line is named in
  full too: "Carrying Soldier (Free Colonist), 100 Muskets". The line of another power's unit is
  unchanged ("French Soldier").
- In a colony, the hover title of a unit outside the gates is its full name, then ": " and its
  second line where it has one: "Pioneer (Free Colonist): 100 Tools". The token's label and its
  second line read as before, and so does the title of a colonist at work, of a carrier and of a
  good.
- In Europe, the token of a unit on the docks and of a passenger on the quay has a hover title: its
  full name. Its label, its " (staying)" and its accessible name are unchanged
  (`getByRole('button', { name: 'Veteran Soldier' })` in `test/e2e/europe.spec.ts` and
  `harbour.spec.ts` still finds it).
- The two wiki paragraphs say that the slip names the skill of an armed or equipped colonist of the
  player's; `test/unit/wiki/pages.test.ts` passes.
- `test/e2e/tooltip.spec.ts` gains a case: a soldier of the player's whose profession is
  `expertFarmer` on a known square; the pointer resting on it shows a `.map-tooltip-unit` beginning
  "Soldier (Expert Farmer)". The existing cases pass untouched.

Verify: `npm test -- test/unit/ui/unit-queue.test.ts test/unit/ui/tile-tooltip.test.ts
test/unit/ui/colony-model.test.ts test/unit/ui/sidebar.test.ts test/unit/ui/europe-model.test.ts
test/unit/wiki`; `npm run test:e2e -- tooltip`; `npm run check`; `npm run test:e2e` (the item touches
`src/ui`).

### W2 — Hired veteran dragoons fight as veterans (R-1057, size S, depends on: nothing)

Files: `src/engine/combat.ts` (`unitStrength`), `test/unit/engine/combat.test.ts`,
`docs/RULES.md` (the line "A soldier or dragoon who is a veteran soldier has half again"),
`docs/FIDELITY.md` (the combat row that covers the veteran bonus), `src/ui/pedia.ts` only if its
Veteran Units text becomes untrue.

Acceptance:
- A dragoon whose profession is `veteranDragoon` has, attacking and defending, the strength of a
  dragoon whose profession is `veteranSoldier`, and the combat analysis lists the same "Veteran"
  line at 50 for both.
- A soldier or dragoon of any other profession, and every other unit type whatever its profession,
  has the strength it had before; the existing cases of `test/unit/engine/combat.test.ts` pass
  untouched.
- Nothing else that reads `veteranSoldier` changes (promotion in the field, the Continental line,
  capture, the muster). Where the worker finds one of those that treats the hired dragoons
  differently from a mounted veteran soldier, it is left alone and listed in the pull request.
- `docs/RULES.md` and `docs/FIDELITY.md` say what the game now does, and that the rule is this
  game's own choice.

Verify: `npm test -- test/unit/engine/combat.test.ts`; `npm run check`.

## Open questions and decisions

- **A veteran's look** (owner, 2026-10-11): put off. The owner will make figures for all the
  specialists separately; this spec changes no picture. Rejected for now: two new generated
  figures; a rank mark laid on the piece in code.
- **Where the skill shows** (owner): on hover only. Rejected: the skill in brackets in every printed
  label; the skill only for a skilled man.
- **Which roles** (owner): all five equipped roles, not soldiers and dragoons alone.
- **Unskilled men are named too** (planner): "Soldier (Free Colonist)", so that a free colonist, a
  servant and a criminal can be told apart. Rejected: brackets only for a skilled man.
- **Europe gets hover titles** (planner): the docks and the quay are where men are armed, and their
  tokens have no title today. Rejected: leaving Europe out.
- **Other powers** (planner): unchanged, since their pieces show the kind and not the skill.
- **Hired veteran dragoons** (owner): they fight as veterans; W2. Found while planning: the
  mercenary offer's dragoons are named "Veteran Dragoon" and had no bonus. Rejected: leaving them
  as ordinary dragoons.
- If a worker meets a question not covered here: build the smaller reading and say so in the pull
  request.
