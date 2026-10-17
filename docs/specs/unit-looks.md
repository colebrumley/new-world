# A look for every kind of colonist: spec for R-1068 to R-1070

Written by `/plan` on 2026-10-16. Status: proposed.

**The request, in the owner's words:** "I want to generate either unique art or unique color
variations where appropriate for each unit type. Right now most colonist specialties look the same,
as do veteran vs non-specialized troops. Each should have a trademark look and should be easily
identifiable on the map. Keep the consistent style we have for the other art." Today the map, the
colony screen and the docks draw one figure per unit type (`unit.type`), and `unit.profession` is
never looked at: an expert farmer, a master blacksmith and a petty criminal are the same colonist,
and a veteran soldier is the same soldier as a free colonist under arms. The spec for R-1056 put
this off for a separate piece of work; this is it.

## Goal

Every kind of colonist has a figure of its own, told apart on the map by a trademark prop and a
dominant clothing colour, and every role's expert (veteran soldier and dragoon, hardy pioneer,
seasoned scout, Jesuit missionary) looks different from anyone else in that role. At the far zoom
every unequipped kind of colonist has a coat colour no other kind has. Nothing about the rules or
the save changes.

## Non-goals

- No rule, no engine change, no `state.ts` change, no save version. A look is read from a unit's
  type and profession alone, in `src/ui`.
- No recolouring by nation: a figure is the same for every power; the owner's colour stays on the
  base and the plate, as now.
- Ships, wagons, artillery, treasure, the Crown's and the Continental troops and the native units
  keep the pictures they have. No existing picture in `art/units` is redrawn, and the ordinary
  roles' far-zoom pieces (soldier, dragoon, pioneer, scout, missionary held by a non-expert) are
  unchanged.
- No change to a printed label or a tooltip (R-1056's hover text stays as it is).

## Rules and sources

- **Which figure a unit shows** (the private notes): a colonist with no equipment shows the figure
  of its profession; a free colonist shows the plain colonist. A soldier, dragoon, pioneer, scout or
  missionary shows the role's expert figure when the unit's profession is that role's expert, and
  the role's ordinary figure (today's `soldier.png` etc.) for anyone else, so an expert farmer under
  arms looks like any soldier and shows his trade again once disarmed. The Continental Army,
  Continental Cavalry, King's Regulars and King's Cavalry have one figure each, whatever the
  profession. The owner chose to follow the notes here (asked during planning); the hover text from
  R-1056 already names the skill under the equipment.
- **A veteran dragoon** (the private notes count him as a veteran for the dragoon; the rest is the
  planner's choice, the notes being silent): `veteranDragoon` is treated as `veteranSoldier`
  everywhere: unequipped he shows `veteranSoldier`, as a soldier `expertSoldier`, as a dragoon
  `expertDragoon`. A dragoon's expert is a veteran soldier or a veteran dragoon.
- **Inside a colony** (the private notes): a colonist working in a building or on the land shows the
  figure of its profession, whatever job it is doing; a unit standing on the colony's square, or
  aboard a ship there, shows the same figure the map would.
- **One picture per profession, not an emblem or a recolour** (the private notes give every
  profession its own picture; the owner chose all-new generated pictures, rejecting code recolours
  of a shared figure). How each figure looks is this game's own design: the notes describe only
  three (the lumberjack in a red shirt with a saw, the carpenter at a sawhorse, the petty criminal
  in stocks), and those three follow them.
- **The far zoom** (this game's own choice, made by the owner): the small hand-drawn piece takes the
  look's coat colour, so unequipped colonists are told apart there by colour alone.

## The looks

A look id names a picture in `art/units` (`<look id>.png`) and an entry of `UNIT_ART`. Each
picture is one figure in the style of `art/units/colonist.png`: the same build, the same side and
height, the same outline, standing on the bottom edge. What tells it apart is the prop in its hands
(large and clear, since it must read at 30 pixels) and the dominant colour of its clothes, which is
the palette row named in the Coat column (hex values in `docs/ART.md`; quote them in the prompt).
The coat is also the `INK` the far-zoom piece takes. The 26 unequipped looks (the plain colonist
and every row down to `indianConvert`) have 26 different coats; an `expert<Role>` look shares the
coat of the same expert unequipped.

| Look id | Who | Trademark prop | Coat |
|---|---|---|---|
| `colonist` | free colonist, expert teacher, no profession (exists) | pack and staff (as now) | `prairie` (far zoom only; the picture stays as it is) |
| `expertFarmer` | Expert Farmer | pitchfork, wide straw hat | `leaf` |
| `masterSugarPlanter` | Master Sugar Planter | cane knife and a bundle of cane on the shoulder | `white` |
| `masterTobaccoPlanter` | Master Tobacco Planter | an armful of broad tobacco leaves | `savannah` |
| `masterCottonPlanter` | Master Cotton Planter | a sack spilling white cotton bolls | `sand` |
| `expertFurTrapper` | Expert Fur Trapper | fur cap, a steel trap and pelts over the shoulder | `wood` |
| `expertLumberjack` | Expert Lumberjack | a two-handed saw (the notes) | `red` shirt (the notes) |
| `expertOreMiner` | Expert Ore Miner | pick over the shoulder, lamp on the cap | `darkGrey` |
| `expertSilverMiner` | Expert Silver Miner | pick and a bright lump of silver held up | `lightGrey` |
| `expertFisherman` | Expert Fisherman | a fish on a line or a net, brimmed rain hat | `wave` |
| `masterDistiller` | Master Distiller | a small cask under one arm, apron | `purple` |
| `masterTobacconist` | Master Tobacconist | a long clay pipe and a roll of leaf | `earth` |
| `masterWeaver` | Master Weaver | a bolt of cloth over the arm | `brightBlue` |
| `masterFurTrader` | Master Fur Trader | a bale of furs and a coin purse, tricorn | `deepForest` |
| `masterCarpenter` | Master Carpenter | standing at a sawhorse with a saw (the notes) | `hill` |
| `masterBlacksmith` | Master Blacksmith | hammer and anvil, leather apron | `orange` |
| `masterGunsmith` | Master Gunsmith | a musket stock held across the chest, a file | `swamp` |
| `firebrandPreacher` | Firebrand Preacher | a raised book, arm thrown up, white bands | `deepSea` |
| `elderStatesman` | Elder Statesman | a quill and a scroll, white wig | `parchment` |
| `hardyPioneer` | Hardy Pioneer, unequipped | an axe on the shoulder, coonskin cap | `tundra` |
| `veteranSoldier` | Veteran Soldier or Dragoon, unequipped | a sword at the hip, cocked hat, white cross belts | `blue` |
| `seasonedScout` | Seasoned Scout, unequipped | a spyglass held to the eye | `green` |
| `jesuitMissionary` | Jesuit Missionary, unequipped | a rosary and a book, cassock | `ink` |
| `indenturedServant` | Indentured Servant | a bucket on a yoke | `grey` |
| `pettyCriminal` | Petty Criminal | head and hands in stocks (the notes), ragged | `marsh` |
| `indianConvert` | Indian Convert | a small cross on a cord, carrying a basket | `grass` |
| `expertSoldier` | type `soldier`, veteran | musket and bayonet, tall grenadier cap, cross belts | `blue` |
| `expertDragoon` | type `dragoon`, veteran soldier or dragoon | the dragoon's horse, crested helmet, sabre raised | `blue` |
| `expertPioneer` | type `pioneer`, hardy pioneer | a shovel and an axe, a coil of rope | `tundra` |
| `expertScout` | type `scout`, seasoned scout | the scout's horse, a spyglass, a feathered hat | `green` |
| `expertMissionary` | type `missionary`, Jesuit | a tall cross held high, cassock | `ink` |

The ordinary figures stay as they are: `soldier`, `dragoon`, `pioneer`, `scout`, `missionary`.
Where a coat is the colour of the owner's base (the lumberjack's red on an English piece, the
veteran's blue on a French one), that is accepted: the near zooms carry the prop. Some coats are
near neighbours (`leaf` and `grass`, `sand`, `prairie` and `hill`); the props and the near zooms
carry those.

## Terms

- **Near zoom**: a square of `DETAIL` (32) pixels or more, drawn with `detailedPieceArt` from
  `UNIT_ART`. **Far zoom**: every square smaller than that, drawn with `pieceArt` (including the
  halved copy of `render.ts`, `half|...`).
- **The coat** of a far-zoom piece: the `k` cells of `PERSON` rows 2 and 3 and of `RIDER` rows 1
  and 2 in `src/ui/pixel-art.ts`. The face, the legs, the horse and any overlay (musket, spade,
  cross) are drawn as now.
- **Differ by a fifth**: for two figures A and B on the same grid, the cells where either is
  opaque, U, and those of U where A's colour is not B's (one see-through counts as different), D;
  the figures differ by a fifth when |D| ≥ 0.2 × |U|.

## Shared surfaces

- `src/ui/unit-looks.ts` (new): the look table and `lookOf`. W1 makes it; W2 and W3 do not touch it.
- `PieceLook` in `src/ui/pixel-art.ts`, the sprite cache keys in `src/ui/render.ts`, the view
  models of the colony and Europe, and the wiki's image export in `test/unit/wiki/images.test.ts`
  (one PNG per look that has a picture): W1.
- `src/ui/unit-art.ts` (generated) and `scripts/bake-art.py`: W2 raises the folder's palette from 32
  colours to 48 and bakes; W3 bakes again after W2 has merged and leaves the palette size alone.
- The baselines that fingerprint unit art: `test/e2e/__snapshots__/visual.spec.ts/map-baselines.json`
  (regenerated with `npx playwright test visual --update-snapshots`) and the wiki's images
  (`UPDATE_FIXTURES=1 npm test -- test/unit/wiki`). W1 may regenerate them for the far-zoom coats,
  W2 and W3 for their bakes; each says so in its pull request and regenerates nothing else.

The look ids are fixed by the table above, so W1 can build against pictures that do not exist yet
(a look with no picture falls back to its unit type's figure) and W2 and W3 need nothing from W1
but its image export, which they may extend themselves if W1 has not landed.

## Work items

### W1 — Draw each unit by its look (R-1068, size M, depends on: nothing)

Files: `src/ui/unit-looks.ts` (new), `src/ui/pixel-art.ts` (`PieceLook` gains `look: LookId`;
`pieceArt`, `figure`, `detailedPieceArt`, `figureArt`), `src/ui/render.ts`, `src/ui/colony-model.ts`
and `src/ui/colony-screen.ts`, `src/ui/europe-model.ts` and `src/ui/europe-screen.ts`,
`test/unit/ui/unit-looks.test.ts` (new), `test/unit/ui/pixel-art.test.ts`,
`test/unit/ui/render.test.ts`, `test/unit/ui/colony-model.test.ts`,
`test/unit/ui/europe-model.test.ts`, `test/unit/wiki/images.test.ts`, the baselines above,
`docs/FIDELITY.md`, `docs/ARCHITECTURE.md` (a line for the new module).

Acceptance:
- `lookOf(type: UnitTypeId, profession: ProfessionId | null): LookId` gives the look by the rules
  above; a colonist at work is `lookOf('colonist', colonist.profession)`. The table is a
  `const ... as const satisfies Record<...>` with a snapshot test. A test runs every pair of
  `UNIT_TYPE_IDS` × (`PROFESSION_IDS` and null) and checks named expectations for each clause: an
  expert farmer as colonist and as soldier; a veteran soldier and a veteran dragoon as colonist,
  soldier and dragoon; each role's expert and a free colonist in each role; an expert teacher and
  null as colonist; the Continental and Crown troops, a ship and a brave with any profession.
- Every look carries the coat of the table. The far-zoom piece of a colonist and of each
  `expert<Role>` fills its coat with that ink; a test checks that the 26 unequipped looks' far
  sprites are pairwise different, and that the far sprites of the ordinary roles, ships, artillery,
  wagons, treasure, the Crown's, the Continental and the native units are what they were (their
  existing snapshots pass untouched).
- At the near zoom a look with no picture yet draws its unit type's figure, so the near zoom looks
  as it does today until W2 and W3 land: every existing near-zoom snapshot passes untouched.
- The map, the colony screen (a colonist at work, a unit on the square, a passenger of a ship there)
  and the docks, the quay and the ships' passengers in Europe all draw the unit's look; the view
  models carry the look, and tests in `colony-model.test.ts` and `europe-model.test.ts` show an
  expert farmer and a veteran soldier given their looks. The sprite caches of the map and of
  Europe key on the look, not the type (`render.test.ts` checks two looks of one type get two
  sprites).
- The wiki export writes `wiki/images/art/units/<look id>.png` for every look that has a picture
  (today the unit types that have one, as now).
- `docs/FIDELITY.md` gains a row for which figure a unit shows, sourced to the private notes.

Verify: `npm test -- test/unit/ui test/unit/wiki`; `npm run test:e2e`; `npm run check`.

### W2 — The craftsmen's and planters' pictures (R-1069, size L, depends on: nothing)

Files: `art/units/` (18 new pictures: the looks `expertFarmer` to `elderStatesman` in the table),
`scripts/bake-art.py` (the units folder baked in a palette of 48), `src/ui/unit-art.ts`
(regenerated), `test/unit/ui/unit-art.test.ts` (new), the baselines above, `wiki/images/art/units/`,
`docs/ART.md` (the units row: 48 colours, one picture per look id), `wiki/Units.md` (a new table,
"Telling colonists apart": picture, name, trademark).

Acceptance:
- Each of the 18 pictures is generated with Codex as `docs/ART.md` says (at most six to a run, runs
  side by side, `art/units/colonist.png` attached as the style reference, the coat's palette row
  and hex quoted), shows the table's prop and coat, and is baked by
  `uv run scripts/bake-art.py units`. A picture that comes back wrong (pink on the figure, a second
  figure, text, a different side or height from the colonist) is generated again, never fixed by a
  script; after three tries a look is left without a picture (it falls back to the colonist) and is
  listed under **Open findings**.
- Every existing figure still bakes and is still in `UNIT_ART`; `ART_COLORS` stays at 255 or fewer.
  The existing figures are re-quantised by the bigger palette; that changes the baselines above and
  nothing else.
- `unit-art.test.ts` checks that every one of the 18 looks is in `UNIT_ART`, and that every pair
  of the 18 and `colonist` differ by a fifth.
- The pull request carries a contact sheet of all the colonist figures
  (`UPDATE_FIXTURES=1 npm test -- test/unit/wiki`, then `uv run scripts/contact-sheet.py units`).
  Whether a prop reads and a colour dominates is judged there, by the owner; no test claims it.
- `npm run check` passes the size budget (today 270 KB of 400 KB gzipped; `unit-art.ts` is 29 KB
  raw). If it does not, stop and leave the pull request open under **Open findings** with the
  numbers.

Verify: `uv run scripts/bake-art.py units`; `npm test -- test/unit/ui test/unit/wiki`;
`npm run test:e2e`; `npm run check`; the contact sheet in the pull request.

### W3 — The experts of the roles and the unskilled (R-1070, size M, depends on: W2)

Files: `art/units/` (12 new pictures: `hardyPioneer`, `veteranSoldier`, `seasonedScout`,
`jesuitMissionary`, `indenturedServant`, `pettyCriminal`, `indianConvert`, `expertSoldier`,
`expertDragoon`, `expertPioneer`, `expertScout`, `expertMissionary`), `src/ui/unit-art.ts`
(regenerated), `test/unit/ui/unit-art.test.ts`, the baselines above, `wiki/images/art/units/`,
`wiki/Units.md` (the seven unequipped looks added to W2's table, and a table "Experts in their
roles": the ordinary figure, the expert's, the role).

Acceptance:
- The 12 pictures are generated and baked as in W2, with the same three-try limit. Each
  `expert<Role>` figure is generated with the ordinary role's figure as a second style reference
  (`art/units/soldier.png` for `expertSoldier`, and so on) so that the pair reads as the same kind
  of unit, and differs from it by the table's prop and coat. The mounted ones ride the same horse
  as `dragoon.png` and `scout.png`.
- `unit-art.test.ts` extends to the 12: each is in `UNIT_ART`; each `expert<Role>` and its role's
  ordinary figure differ by a fifth; each of the seven unequipped ones and every other colonist
  figure differ by a fifth.
- The contact sheet in the pull request shows every colonist look and each expert beside its
  ordinary role.

Verify: `uv run scripts/bake-art.py units`; `npm test -- test/unit/ui test/unit/wiki`;
`npm run test:e2e`; `npm run check`; the contact sheet in the pull request.

## Open questions and decisions

Decisions the owner made during planning:
- All-new generated pictures for every look, rejecting code recolours of a shared figure, alone or
  mixed with new pictures.
- Follow the private notes for an armed non-expert (the ordinary figure, trade hidden), rejecting a
  trade badge on the base.
- The far zoom tells looks apart by coat colour, rejecting leaving it as it is.

The planner's choices:
- The look table lives in `src/ui`, not `src/engine/data`: it is how a unit is drawn, not a rule
  the engine reads.
- The plain colonist's far coat becomes `prairie` (from ink) so that the Jesuit can keep the black
  cassock; that is the one far-zoom change to an existing kind.
- The units folder's palette grows from 32 colours to 48, so thirty more figures do not muddy the
  ones there; `ART_COLORS` has room (202 of 255 today).
- The art is split into two items that bake the same file one after the other, rather than one item
  of thirty pictures, so each pull request's contact sheet is small enough to judge.
- A worker who finds a prop that will not read at 30 pixels on the contact sheet may choose another
  for that look, keep the coat, and say so in the pull request.
