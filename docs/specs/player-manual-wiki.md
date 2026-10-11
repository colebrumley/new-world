# Player manual on the GitHub wiki, and a README: spec for R-1023 to R-1034

Written by `/plan` on 2026-10-10. Status: approved.

**The request, in the owner's words:** Create comprehensive documentation and a readme for this
project. Put the documentation in the GitHub wiki. It should be a user manual and should include
everything a player or potential player might want to know. Where appropriate, it should use or
reference the art that we've generated to make sure that people understand particular units or tiles
and how they appear in the game. The README should be brief and just say what it is and to say see
the wiki for user guide.

## Goal

A player, or someone deciding whether to play, opens the repository's wiki and finds a complete
manual: what the game is and where to play it, how to start and win, every screen, every unit, terrain,
building, cargo, people and Founding Father as it looks in the game, with the numbers behind them.
The manual's source lives in this repository under `wiki/`, is checked by the unit suite and the
public-repo guard like any code, and is published to the GitHub wiki by a workflow on every push to
`main`. The README says what the game is, where to play it, and points at the wiki.

## Non-goals

- No link from inside the game to the wiki, and no change to the in-game encyclopedia or hints.
- No change to any rule, table or screen. Where the manual finds the game doing something odd, the
  worker describes what the game does and notes the oddity on the board; it does not fix it here.
- No developer documentation beyond what `docs/` already holds; the wiki is for players. One page may
  say where the code is and that `CLAUDE.md` describes how work is done.
- No new art, and no redrawing: the manual shows the pictures the game already has.
- No translation, no video, no hosting other than the GitHub wiki and GitHub Pages.
- No runtime dependency. Everything new runs under Vitest or Playwright (both present) or in a
  GitHub Actions workflow.

## Rules and sources

This spec adds no rule to the game. Every statement in the manual describes what the game does today,
and comes from, in this order:

1. the rule tables in `src/engine/data/*` and the engine code (constraint C7: the tables are the
   authority; the reference tables in the wiki are generated from them, so they cannot disagree);
2. `docs/RULES.md` for how a system works in words, and `docs/FIDELITY.md` for what was simplified;
3. the prose the game already shows players: `src/ui/pedia.ts` (encyclopedia notes), `src/ui/hints.ts`,
   `src/engine/difficulty.ts` (difficulty summaries), the dialogs and notices in `src/ui/`;
4. `REQUIREMENTS.md` appendices A to L, only where they agree with the tables (a `[VERIFY]` mark means
   the table wins and the appendix may be stale).

The public-repo rule applies to every page, image name, alt text, commit and pull request (CLAUDE.md):
never name another game, its makers or its files, and never say or imply a rule or a look came from one.
Describe what this game does. Where `docs/FIDELITY.md` records a simplification, the manual says
"simplified" or "left out", not what it was simplified from. Every sentence is written for this manual
or taken from this repository's own text; nothing is quoted from anywhere else (constraint C1). The
`test/unit/no-copied-text.test.ts` fingerprints are extended to `wiki/` by W1.

Historical names the game itself uses (nations, Founding Fathers, tribes, colony names, kings' events)
are fine in the manual, as they are in the game.

## Shared surfaces

| Surface | Who changes it | Order |
|---|---|---|
| `wiki/` folder layout, page names, `_Sidebar.md`, `_Footer.md`, stub pages, image folder names | W1 creates all of it | first |
| `README.md` | W1 writes it; W5 adds the title-screen picture (owner's request after W1 merged) | first, then W5 |
| `.github/workflows/wiki.yml` (publishing) | W1 only | first |
| `test/unit/wiki/pages.test.ts` (link and image checker) | W1 creates; nobody else edits | first |
| `wiki/images/art/**` (sprites) and `test/helpers/wiki/png.ts`, `test/unit/wiki/images.test.ts` | W2 creates; content items only read | second wave |
| `test/helpers/wiki/tables.ts` (the `TABLES` registry and Markdown helpers), `test/unit/wiki/tables.test.ts` | W3 creates with one table; each content item **adds** its own renderers to the registry | second wave, then appended |
| `wiki/images/screens/**`, `test/e2e/wiki-shots.spec.ts`, `test/unit/wiki/screens.test.ts` | W4 creates; content items only read | second wave |
| `docs/ARCHITECTURE.md` | W1 alone writes the `wiki/` paragraph, describing W2 to W4's scripts as planned; nobody else edits it in this spec | first |

W1 goes first and alone: W2, W3 and W4 write into pages and folders it creates. Content items (W5 to
W12) each own a disjoint set of pages and never edit another item's pages. The only file more than
one of them touches is the `TABLES` registry in `test/helpers/wiki/tables.ts`, where each adds
entries; bring `origin/main` in before review and the merge is mechanical.

### Conventions every item follows

- **Page names.** One Markdown file per page in `wiki/`, named as the GitHub wiki names pages:
  `Getting-Started.md` is the page "Getting Started". Titles are words and spaces only (no commas or
  other punctuation), so title and file name map both ways by swapping spaces and hyphens. Pages link
  to each other with the wiki's own form, `[[Getting Started]]`. A section link,
  `[[Getting Started#Choosing a power]]`, is allowed only to a page the same item owns, because the
  other pages are stubs without headings until their items merge; across items, link to the page.
  No page starts with an H1 (the wiki shows the title); sections start at `##`. The pages and their
  owners are listed under "The pages" below, and W1 creates every one as a stub so links resolve from
  the start.
- **Images.** Relative paths from the wiki root: `![A soldier](images/art/units/soldier.png)`. Three
  folders: `images/art/<group>/<id>.png` are the game's own sprites blown up by whole numbers (W2),
  `images/screens/<name>.png` are screenshots at 1280 x 800 (W4), and `images/paintings/<folder>/<id>.png`
  are the source pictures under `art/` that the sprites were baked from, copied into the wiki by the
  publishing workflow at publish time (not duplicated in this repository). To show a painting at a
  sensible size use the HTML form: `<img src="images/paintings/units/colonist.png" width="160" alt="...">`.
  A sprite sits in a table cell or at the start of the paragraph that describes the thing; a painting
  heads a page or stands in the Gallery.
- **Numbers.** Any table of game values (yields, strengths, costs, prices, effects, difficulty) is
  generated: the page holds a marked block

  ```
  <!-- table: unit-strengths -->
  (generated; do not edit by hand)
  <!-- /table -->
  ```

  and `test/unit/wiki/tables.test.ts` fills it from the renderer registered under that name in
  `test/helpers/wiki/tables.ts` when run with `UPDATE_FIXTURES=1`, and otherwise fails if the block is
  not exactly what the renderer gives (the pattern `test/unit/ui/keymap.test.ts` uses for
  `docs/KEYS.md`). After adding a block and its renderer, run `UPDATE_FIXTURES=1 npm test -- test/unit/wiki`
  to fill it; never fill a block by hand. Prose may carry a number where a sentence needs one ("every
  colonist eats two food a turn"); the writer reads it from the table, not from the appendix.
- **Required content.** Each content page must carry the generated blocks and the screenshots its
  item names (the lists under "Work items"). W1 encodes them in `REQUIRED` in
  `test/unit/wiki/pages.test.ts`, and a page that is no longer a stub (does not contain the line
  "This page is being written.") fails the test while any of its required blocks or images is missing.
  So a content item is not done until every named block and picture is on its page.
- **Voice.** Plain words, present tense, second person where it helps ("you"). Short sentences. Say
  what a thing is for before how it works. The in-game encyclopedia notes in `src/ui/pedia.ts` set
  the tone. No marketing.
- **Regeneration.** The sprite test (W2), the table test (W3) and the screenshot test (W4) fail when
  the art, the rule tables or a screen change. Whoever changes those regenerates:
  `UPDATE_FIXTURES=1 npm test -- test/unit/wiki` for sprites and tables, and
  `WIKI_SHOTS=1 npx playwright test test/e2e/wiki-shots.spec.ts` for screenshots. W1 writes this in
  `docs/ARCHITECTURE.md` and posts it on the board.
- **Done means:** `npm run check` green (it runs the wiki tests), `npm run guard` clean, every link
  and image in the item's pages resolving and every required block and picture present (the W1
  checker), every acceptance bullet met.

### The pages

| Page file | Title | Owner |
|---|---|---|
| `Home.md` | Home | W5 (W1 writes the stub with the play link) |
| `_Sidebar.md`, `_Footer.md` | sidebar and footer | W1 |
| `Getting-Started.md` | Getting Started | W5 |
| `Controls.md` | Controls | W5 |
| `Help-and-Options.md` | Help and Options | W5 |
| `Tips-and-FAQ.md` | Tips and FAQ | W5 |
| `Glossary.md` | Glossary | W5 |
| `The-Map.md` | The Map | W6 |
| `Units.md` | Units | W7 |
| `Combat.md` | Combat | W7 |
| `Colonies.md` | Colonies | W8 |
| `Buildings.md` | Buildings | W8 |
| `Europe-and-Trade.md` | Europe and Trade | W9 |
| `The-Crown-and-Independence.md` | The Crown and Independence | W9 |
| `Native-Peoples.md` | Native Peoples | W10 |
| `Founding-Fathers.md` | Founding Fathers | W11 |
| `Other-Powers.md` | Other Powers | W11 |
| `Reports-and-Advisers.md` | Reports and Advisers | W11 |
| `Score-and-Hall-of-Fame.md` | Score and Hall of Fame | W11 |
| `Gallery.md` | Gallery | W12 |

## Work items

### W1 — Wiki scaffold, publishing workflow and README (R-1023, size M, depends on: nothing)

Files: `README.md` (new), `wiki/Home.md`, `wiki/_Sidebar.md`, `wiki/_Footer.md`, one stub per page in
"The pages", `.github/workflows/wiki.yml` (new), `test/unit/deploy/workflow.test.ts` (lint every
workflow, not only `deploy.yml`), `test/unit/wiki/pages.test.ts` (new), `test/unit/no-copied-text.test.ts`
(walk `wiki/` too), `docs/ARCHITECTURE.md` (a `wiki/` paragraph).

Acceptance:
- `README.md` is short: the game's name, one paragraph saying what it is (the description in
  `public/manifest.webmanifest` is the model), a line with the link to play it
  (`https://colebrumley.github.io/new-world/`), and a line sending players to the wiki
  (`https://github.com/colebrumley/new-world/wiki`) for the user guide. Nothing else: no badges, no
  install steps. Developer notes stay in `CLAUDE.md` and `docs/`. (W5 later adds one picture, the
  title screen, once W4 has made it; see W5.)
- `wiki/` holds `Home.md`, `_Sidebar.md`, `_Footer.md` and every page in "The pages". A stub page is
  its title's one-line summary and the line "This page is being written." (exactly that, so the
  checker can tell a stub). `Home.md` already carries the play link, a one-paragraph description and
  the list of pages. `Getting-Started.md`'s stub also carries an empty `<!-- table: difficulty-levels -->`
  block for W3 to fill. `_Sidebar.md` is exactly this, with each name a `[[...]]` link:

  ```
  **Start here**
  Home · Getting Started · Controls

  **Playing**
  The Map · Units · Colonies · Buildings · Europe and Trade · Native Peoples · Combat ·
  Other Powers · Founding Fathers · The Crown and Independence · Score and Hall of Fame

  **Reference**
  Reports and Advisers · Help and Options · Tips and FAQ · Glossary · Gallery
  ```

  (one link per line is fine if the wiki renders the separators badly). `_Footer.md` says the game is
  free to play in the browser, with the play link, and that the manual's source is `wiki/` in the
  repository.
- `wiki/images/` is not created by W1 (git keeps no empty folders); W2 and W4 create their folders.
- `.github/workflows/wiki.yml` has two jobs. **check** runs on pull requests and pushes to `main` that
  touch `wiki/**`, `art/**`, `test/unit/wiki/**`, `test/helpers/wiki/**` or the workflow itself:
  `npm ci`, then `npm test -- test/unit/wiki test/unit/no-copied-text test/unit/deploy`. **publish**
  runs after check, on pushes to `main` and on `workflow_dispatch` only, under `concurrency: wiki`
  with `cancel-in-progress: false`, with `permissions: contents: write`. It clones the wiki repository
  (`https://x-access-token:${{ github.token }}@github.com/${{ github.repository }}.wiki.git`), sets the
  git identity to the Actions bot (`github-actions[bot]` and its noreply address), replaces the
  clone's contents with `wiki/` (keeping `.git`), copies the folders `units`, `places`, `features`,
  `floors`, `buildings`, `goods`, `portraits`, `title` and `chart` of `art/` to `images/paintings/` in
  the clone, commits with the source commit's SHA in the message only if `git status --porcelain` is
  not empty, and pushes to the branch the clone checked out (`git push origin HEAD`). When the clone
  fails, the step writes to `$GITHUB_STEP_SUMMARY` and fails: if the wiki has no pages yet, telling the
  owner to create the first page in the browser (Wiki tab, "Create the first page") and re-run the
  workflow; if the push is refused (403), saying that the token cannot write the wiki and that a
  personal access token in a secret named `WIKI_TOKEN` is the fallback, which the workflow uses when
  present. `deploy.yml`'s path filters are not widened: a change under `wiki/` must not rebuild or
  redeploy the game, and the existing "runs only when" test on its paths stays as it is.
- `test/unit/deploy/workflow.test.ts` lints every file in `.github/workflows/` with actionlint, and
  for `wiki.yml` asserts by the order of the `run:` steps' text (the pattern the file already uses for
  `deploy.yml`): the check job runs the wiki tests; the publish job needs check, clones the wiki, syncs
  `wiki/`, copies `art/`, guards the commit on `git status --porcelain`, pushes `HEAD`, and writes
  `GITHUB_STEP_SUMMARY` on failure.
- `test/unit/wiki/pages.test.ts` reads every `wiki/*.md` and fails if: a `[[Page]]` or
  `[[Page#Section]]` link names a page that is not a file in `wiki/` (title to file: spaces to
  hyphens); a `[[Page#Section]]` names a `##`/`###` heading the page does not have (compare GitHub's
  anchor form: lower case, spaces to hyphens, punctuation dropped); an image path (`![...](path)` or
  `<img src="path"`) does not resolve to a file under `wiki/images/` or, for `images/paintings/<rest>`,
  to `art/<rest>`; a page starts with an H1; a page other than the sidebar and footer is not linked
  from `_Sidebar.md`; a `<!-- table: name -->` block has no closing marker; a page title (file name
  with hyphens as spaces) contains anything but letters, digits and spaces. It also fails on a bare
  Markdown link to another page (`[text](Page-Name)`), so that links are all of one kind.
- The same test holds `REQUIRED: Record<pageFile, { tables: string[]; images: string[] }>`, taken
  from the content items below (every block name and screenshot each item's bullets name for each
  page), and fails for a page that is not a stub while a required block or image is missing from it.
  Stubs are exempt, so the test is green on W1's own pull request.
- `test/unit/no-copied-text.test.ts` walks `wiki/` as well as `src/`, with `.md` added to the file
  filter (today it keeps only `.ts`, `.css` and `.html`, so adding the folder alone checks nothing).
  A self-test writes a temporary Markdown file holding one fingerprinted run and asserts the check
  catches it.
- `docs/ARCHITECTURE.md` gains a paragraph for `wiki/`: what it is, how it is published and checked,
  where the sprites, tables and screenshots come from (W2 to W4's scripts, named as planned) and the
  regeneration commands from "Regeneration" above. W1 posts the regeneration commands on the board.

Verify: `npm test -- test/unit/wiki test/unit/deploy test/unit/no-copied-text`; `npm run check`;
`npm run guard`. Then, if the owner has created the wiki's first page, run the workflow by hand
(`gh workflow run wiki.yml`) and confirm on the live wiki: Home shows with its sidebar, a `[[Page]]`
link opens the page, and one relative image renders (add a temporary one to Home for the check if W2
has not merged, and remove it). Say in the pull request whether this was done.

### W2 — Export the game's sprites as images for the manual (R-1024, size M, depends on: W1)

Files: `test/helpers/wiki/png.ts` (new: a PNG encoder and a decoder for its own output),
`test/unit/wiki/images.test.ts` (new), `wiki/images/art/**/*.png` (generated).

The game's art is palette-indexed pixel data in `src/ui/*-art.ts`, drawn by `src/ui/pixel-art.ts`.
That runs in Node, so the sprites can be written as PNG from a Vitest test, like
`test/unit/ui/keymap.test.ts` writes `docs/KEYS.md`, with one difference: it writes **only** under
`UPDATE_FIXTURES=1` (the keymap test also writes when the file is missing; this one must fail on a
missing file instead). Without the variable it fails if any committed file is missing or differs
from what it would write. Compare pixels, not bytes (decode the committed PNG and compare the RGBA
buffer), so that a different zlib does not fail the test. The encoder needs only `node:zlib`: 8-bit
RGBA, no interlace, filter 0 on every row, one IDAT. `png.ts` exports `encodePng(width, height, rgba):
Buffer`, `decodePng(buffer): { width, height, rgba }` (its own format only) and `pngSize(buffer):
{ width, height }` from the IHDR; W4's test uses the last.

Acceptance:
- Each sprite is blown up by a whole number so that the smallest side is at least 128 pixels (16-pixel
  art x8, 30/32-pixel art x4, 64-pixel portraits x2), with transparent background where the sprite has
  none. Nothing is smoothed.
- File names are the id the engine uses, in its own lower camel case (`wagonTrain.png`), with a
  kebab-case suffix for a variant (`plains-major-river.png`). The owner colour is `INK.red` everywhere
  a drawer takes one, and `INK.white` for the population digits. The following are written:
  - `units/<UnitTypeId>.png`: `detailedPieceArt({ type, color: INK.red, label: '-', stacked: false })`
    for every unit type that `hasFigure` says has a figure.
  - `terrain/<TerrainId>.png`: `detailedTileArt` for every terrain id, bare (no river, road, plow,
    resource, rumor or totem), variant 0. As examples of the marks, on plains: `terrain/plains-river.png`
    (a minor river), `terrain/plains-major-river.png`, `terrain/plains-road.png`, `terrain/plains-plowed.png`,
    `terrain/plains-rumor.png`, `terrain/plains-totem.png`.
  - `resources/<ResourceId>.png`: `detailedTileArt` of each resource on the first terrain it may lie on.
  - `places/<look>.png` named after `COLONY_LOOKS` and `VILLAGE_LOOKS` (`colonyOpen`, `colonyStockade`,
    `colonyFort`, `colonyFortress` from `detailedColonyArt(INK.red, 5, INK.white, fort)` with fort = the
    look's index; `villageCamp`, `villageLonghouse`, `villageAztec`, `villageInca` from
    `detailedSettlementArt(INK.red, tech, false, null)` with tech = the look's index), plus
    `places/villageCapital.png` (tech 1, capital true, mood null). These names match the paintings in
    `art/places/`, which the Gallery pairs them with.
  - `buildings/<BuildingId>.png` from `buildingArt(id, INK.red)` for every id it returns a sprite for.
  - `goods/<IconGood>.png` from `goodArt` for the sixteen goods and hammers, crosses, bells.
  - `portraits/<PortraitId>.png` from `portraitRgba` for every `PORTRAIT_IDS` entry (advisers, king,
    every Founding Father), the adviser's coat in the red the Advisers report uses.
  - `chart/<kind>-32.png` from `chartMarkArt(kind, 32)` for each `ChartMarkKind` in `src/ui/chart.ts`,
    and `chart/vellum-32.png` from `vellumArt(32, 0, 0)`.
  - `title/frontispiece.png`: the 320 x 200 painting from `paintingRgba()`, x2.
- `test/unit/wiki/images.test.ts` fails if a file for any id above is missing or its pixels differ
  from what the drawer gives now, and fails if a `.png` is present that no id accounts for (so a
  renamed unit leaves no stale picture); it also asserts `units/soldier.png` is 128 x 128 and
  `portraits/king.png` is 128 x 128 by their IHDR. Its header comment says how to regenerate.
- Total size of `wiki/images/art/` under 1 MB (palette-flat art compresses well; say the number in the
  pull request).

Verify: `npm test -- test/unit/wiki/images`; `npm run check`. Attach `units/soldier.png`,
`terrain/plains.png` and `portraits/king.png` to the pull request.

### W3 — Generated reference tables in wiki pages (R-1025, size S, depends on: W1)

Files: `test/helpers/wiki/tables.ts` (new), `test/unit/wiki/tables.test.ts` (new),
`wiki/Getting-Started.md` (fills the empty `difficulty-levels` block W1's stub carries; nothing else).

Acceptance:
- `test/helpers/wiki/tables.ts` exports `TABLES: Readonly<Record<string, () => string>>`, a renderer per
  block name returning GitHub Markdown (a table, or a list), and the helpers content items use:
  `mdTable(headers: readonly string[], rows: readonly (readonly (string | number)[])[]): string`
  (left-aligned columns, `|` in a cell escaped as `\|`, numbers written as given) and
  `img(path: string, alt: string): string` (the `![alt](path)` form). It also exports
  `fillTables(markdown): string`, which replaces the body of every `<!-- table: name --> ... <!-- /table -->`
  block with the renderer's output (and throws naming the block if no renderer is registered).
- `test/unit/wiki/tables.test.ts` runs over every `wiki/*.md`: with `UPDATE_FIXTURES=1` it rewrites the
  files; otherwise it fails naming the page and block if a block's body is not what `fillTables` gives.
  It also fails if a registered renderer is used by no page (dead renderers), and if a renderer's
  output is empty.
- The first renderer, `difficulty-levels`, lists the five levels from `src/engine/difficulty.ts`
  (name, starting gold, the Crown's starting force, the rating factor, and the sentence
  `describeDifficulty` gives, all from `difficultyProfile`) and `wiki/Getting-Started.md` carries its block, filled.
- A renderer may use a sprite from W2 by path (`images/art/goods/food.png`); the W1 checker proves the
  file exists once both are merged. The `difficulty-levels` table uses no images, so W3 does not wait
  for W2.

Verify: `npm test -- test/unit/wiki/tables`; `npm run check`.

### W4 — Screenshots of every screen for the manual (R-1026, size M, depends on: W1)

Files: `test/e2e/wiki-shots.spec.ts` (new), `test/unit/wiki/screens.test.ts` (new),
`wiki/images/screens/*.png` (generated).

The e2e suite already builds the game and drives it in Chromium at 1280 x 800 (`playwright.config.ts`).
This item adds a spec that is skipped unless `WIKI_SHOTS=1` is set, so CI and `npm run test:e2e` never
run it, and that writes screenshots into `wiki/images/screens/`. Open every game with
`/?seed=7&still` (the `still` flag, read in `src/app/game-screen.ts`, freezes the blink and the water)
and drive it with `startNewGame` and `setSail` from `test/e2e/helpers.ts`. `foundJamestown` hard-codes
its own `goto` without `still`, so do not use it: copy its steps into the spec instead of changing the
shared helper. Build states that need more than a few turns (a large colony, a fight, the war) with
`test/helpers/world.ts` (`world`, `withColony`, `withUnit`) and load them through `saveGame` and the
save dialog, as `test/e2e/visual.spec.ts` does.

Acceptance:
- Running `WIKI_SHOTS=1 npx playwright test test/e2e/wiki-shots.spec.ts` writes these 1280 x 800 PNGs
  (the state for each is given; where it says "England, seed 7" it is the America scenario started
  as England with that seed, as `foundJamestown` does):
  - `title.png`: the title screen. `customize.png`: the Customize screen with its defaults.
    `choose-power.png`: the power screen with England highlighted. `audience.png`: the first dialog with
    the Crown.
  - `map-start.png`: England, seed 7, turn 1, the caravel off the coast. `map-zoomed-out.png`: the same
    at the smallest squares (press X until the zoom stops changing). `map-tooltip.png`: the same with the
    pointer resting on the resource square `test/e2e/tooltip.spec.ts` uses, tooltip shown.
  - `colony.png`: Jamestown just founded (the `foundJamestown` steps). `colony-construction.png`: the
    same with the construction menu open (C). `colony-large.png`: a state from `withColony` holding
    eight colonists, a Stockade, Lumber Mill, Docks, Schoolhouse, Printing Press and Church, 100 of
    food, lumber and furs in the warehouse, loaded through the save dialog; its colony screen.
  - `europe.png`: England, seed 7, the Europe screen opened with E before the caravel sails (the
    docks and market). `europe-recruit.png`: the same with Recruit open (R).
  - `report-economic.png` (F5), `report-colony.png` (F6), `report-foreign.png` (F8),
    `report-congress.png` (F3), `report-score.png` (F10): from the `colony-large` state.
  - `encyclopedia.png`: Alt+P, then the Units category, the Soldier page.
  - `combat-analysis.png`: a `withUnit` state with a soldier beside a brave, the analysis dialog that
    appears on moving the soldier onto the brave (with the combat analysis option on).
  - `options.png`: Alt+G. `saves.png`: Alt+L after saving the game to slots 1 and 2 under two names.
    `hall-of-fame.png`: after Shift-R (retire) and confirming, from the `colony-large` state, the
    Hall of Fame as shown; also `game-over.png`, the scoring dialog that comes before it.
  - `trade-route.png`: Alt+T with a route of two colonies being edited (a `withColony` state with two
    colonies). `native-settlement.png`: a `withUnit` state with a scout beside a village; the dialog on
    entering it. `declaration.png`: a state with rebel sentiment above the threshold (set it in the
    state), the dialog Shift-I opens. `congress-choice.png`: a state with enough bells for a father, the
    dialog offering the candidates at the end of the turn. `rumor.png`: a scout stepping on a rumor
    square, the dialog with the result (whatever seed 7 gives).
  If one of these screens does not exist in the game, leave it out and say so in the pull request.
- Each picture is taken after the frame settles (`settled` in helpers), with `still` set.
- Without `WIKI_SHOTS=1`, the spec reports skipped; `npm run test:e2e` is not made slower.
- `test/unit/wiki/screens.test.ts` holds the list of file names above as `SCREENS` and fails if any is
  missing from `wiki/images/screens/` or is not 1280 x 800 by its IHDR (`pngSize` from W2's
  `test/helpers/wiki/png.ts` if merged, else its own twelve-line IHDR read), or if a `.png` is there
  that the list does not name. A screen left out is removed from the list, with a comment saying why.
- The spec's header comment says how to regenerate the pictures. The pictures are committed.

Verify: `WIKI_SHOTS=1 npx playwright test test/e2e/wiki-shots.spec.ts` writes every file named;
`npm test -- test/unit/wiki/screens`; `npm run test:e2e` still passes; `npm run check`. Attach
`colony-large.png` and `europe.png` to the pull request.

### W5 — Home, Getting Started, Controls, Options, FAQ and Glossary (R-1027, size M, depends on: W1, W2, W3, W4)

Files: `wiki/Home.md`, `wiki/Getting-Started.md`, `wiki/Controls.md`, `wiki/Help-and-Options.md`,
`wiki/Tips-and-FAQ.md`, `wiki/Glossary.md`, `test/helpers/wiki/tables.ts` (add renderers), `README.md`
(the picture only).

Sources: `src/ui/title.ts`, `src/ui/customize.ts`, `src/ui/power.ts`, `docs/NATION_SELECTION.md`,
`src/engine/data/nations.ts`, `src/engine/difficulty.ts`, `src/ui/hints.ts`, `src/ui/options.ts`,
`src/ui/options-dialog.ts`, `src/ui/save-dialog.ts`, `src/app/storage.ts`, `src/app/hall-of-fame.ts`,
`src/ui/keymap.ts`, `docs/KEYS.md`, `docs/RULES.md` sections "Options, notices and hints",
"Encyclopedia", "Sound", "Difficulty", "Saving and loading", "Europe docks and starting treasury".

Acceptance:
- **Home**: what the game is in a paragraph; the frontispiece (`images/art/title/frontispiece.png`);
  the play link; that it runs in the browser from static files with no account and no download and
  works offline once loaded (see `test/e2e/offline.spec.ts` for what is true); the browsers and the
  smallest window it is made for (constraints C6); a "Where to start" list of three links; the sidebar
  explained in a line.
- **Getting Started**: the title screen (`title.png`) and its five choices; New World vs America vs
  Customize (what Customize lets you set, `customize.png`); choosing a power (`choose-power.png`):
  the four nations with what each is good at, in a generated table `nations` (name, advantage, home
  port, what colonies are called, the starting units); difficulty in the `difficulty-levels` block
  W3 placed; the audience with the Crown; the first turns as a walkthrough: sail west, land, found a
  colony (`map-start.png`, `colony.png`), put colonists to work, send the ship home with cargo,
  recruit; what the sidebar shows; how a turn ends; how to save. Each step links to the page that
  goes deeper.
- **Controls**: the whole keyboard and mouse map, generated from `src/ui/keymap.ts` (block `controls`,
  one table per context, same content as `docs/KEYS.md` without the Status column), with a paragraph
  before it saying the game plays with mouse alone through the sidebar buttons.
- **Help and Options**: every game option, colony report option and sound option with what it does
  (generated block `options` from `GAME_OPTIONS`, `COLONY_OPTIONS` and `SOUND_OPTIONS` in
  `src/ui/options.ts`; `options.png`); saving and loading:
  ten slots, autosave, export and import to a file, where saves live (the browser's storage, so
  clearing site data loses them; `saves.png`); the hints and how to turn them off; the encyclopedia
  (`encyclopedia.png`) and the right-click; tooltips on the map and the terrain tooltips option.
- **Tips and FAQ**: at least twelve questions a newcomer asks (is it free, do I need to install
  anything, does it save, can I play on a phone, how long is a game, how do I win, how do I make
  money early, why is my colony starving, why did my price fall, what do the natives want, when
  should I declare independence, how is a game lost, where do I report a bug: the repository's
  Issues), each answered in a few sentences with links into the manual. Then ten tips for the first
  game; the pull request lists, for each tip, the `docs/RULES.md` section or data table that makes it
  true (no advice the game does not reward).
- **Glossary**: every term the manual uses that a newcomer may not know (bells, crosses, hammers,
  Sons of Liberty, Tory, rebel sentiment, boycott, the Crown's expeditionary force, Lost City Rumor,
  mission, convert, veteran, custom house, trade route, sea lane, hold, lot, and the rest found while
  writing), one or two sentences each, alphabetical, each linking to the page that explains it.
- Every screenshot named above appears on the page that describes that screen.
- **README picture** (the owner asked for the title screen "for flavor"): under the README's first
  paragraph, the title screen from W4, as
  `<img src="wiki/images/screens/title.png" width="640" alt="The title screen: ...">` (a path relative
  to the repository root, since the README is read on GitHub, not on the wiki). Nothing else in the
  README changes.

Verify: `npm test -- test/unit/wiki`; `npm run check`; `npm run guard`.

### W6 — The Map (R-1028, size S, depends on: W1, W2, W3, W4)

Files: `wiki/The-Map.md`, `test/helpers/wiki/tables.ts` (add renderers).

Sources: `src/engine/data/terrain.ts`, `resources.ts`, `yields.ts`, `movement.ts`, `sight.ts`,
`rumors.ts`, `mapgen.ts`; `docs/RULES.md` "Tile yield", "Resource terrains and effects", "Deposit
depletion", "Movement", "Lost City Rumors", "Pioneer work"; `src/ui/tile-tooltip.ts`;
`docs/VISUAL_CHECKLIST.md` and `docs/chart/` for how the unexplored chart reads.

Acceptance:
- The screen: map, sidebar, the small New World view, zoom levels and what each shows
  (`map-start.png`, `map-zoomed-out.png`); the unexplored chart (vellum, compass rose, creatures,
  `images/art/chart/*`) and fog; view mode and the resting-pointer tooltip (`map-tooltip.png`).
- Every terrain with its sprite, in a generated table `terrain` (sprite, name, open or forested, move
  cost, defence bonus, what a free colonist gets from it for every good that is not zero, what
  clearing a forest leaves); hills and mountains explained as their own rows; ocean and sea lane; the
  arctic.
- Rivers, roads and plowing: what each does to movement and yield, with the example sprites
  (`terrain/plains-river.png` and the others); how long a pioneer takes, in a generated table
  `pioneer-work`.
- Resources in a generated table `resources` (sprite, name, where it is found, what it adds, whether
  it depletes); the colony centre square's rule in a paragraph.
- Lost City Rumors and what they can turn out to be (the kinds, without the odds unless the table
  gives them plainly); native land and the totem mark.
- A paragraph on how maps are made (random New World from a seed vs the America map) and what
  Customize changes about them.

Verify: `npm test -- test/unit/wiki`; `npm run check`; `npm run guard`.

### W7 — Units and Combat (R-1029, size M, depends on: W1, W2, W3, W4)

Files: `wiki/Units.md`, `wiki/Combat.md`, `test/helpers/wiki/tables.ts` (add renderers).

Sources: `src/engine/data/units.ts`, `equipment.ts`, `movement.ts`, `combat.ts`, `naval.ts`,
`professions.ts`, `europe.ts`; `docs/RULES.md` "Movement", "Europe travel", "Go To Europe", "Pioneer
work", "Land combat", "Colonies under attack", "Naval combat", "Natives at war" (the parts about
braves attacking units); `src/ui/combat-analysis.ts`; `src/ui/pedia.ts` unit and concept pages
(fortify, sentry, disband, veteran units, trade route).

Acceptance:
- **Units**: every unit type with its sprite in a generated table `units` (sprite, name, land or sea,
  moves, attack, defence, holds, how it is got: recruited, trained, bought, built, equipped, or the
  Crown's only); then a section per family in prose: colonists and professions (what an expert is,
  the generated table `professions` of skill, what it doubles, where it is taught: schoolhouse,
  college, university or never, and whether natives teach it), pioneers, scouts, missionaries,
  soldiers and dragoons (arming and dismounting, muskets and horses), wagon trains and treasure
  trains, ships (holds, carrying units, repair), artillery, the native units, the Crown's units.
- Orders: every order a unit takes (fortify, sentry, wait, skip, go to, load, unload, dump, trade
  route, disband, build or join colony, clear, plow, road) with the key and what it does; movement
  costs and the third-of-a-move rule, boarding and landfall, sailing to Europe and back (turns
  each way, the sea lanes, the west edge); unit stacks and the active unit frame; promotion to
  veteran.
- **Combat**: how a fight is decided (attack vs defence, the throw, what happens to the loser: killed,
  captured, demoted, damaged), every modifier the Combat Analysis dialog can show in a generated table
  `combat-modifiers` (name, when it applies, how much) from `src/engine/data/combat.ts`;
  `combat-analysis.png`; attacking and defending colonies (stockade, fort, fortress bonuses, capture,
  what the taker gets, artillery in the open); naval combat (privateers, flags, damage and repair,
  sinking, cargo lost, zones of patrol and fort fire); fighting natives (raids on colonies, what a brave
  does at the gate, burning missions) as a short section linking to [[Native Peoples]]; the
  independence war's units linking to [[The Crown and Independence]].

Verify: `npm test -- test/unit/wiki`; `npm run check`; `npm run guard`.

### W8 — Colonies and Buildings (R-1030, size M, depends on: W1, W2, W3, W4)

Files: `wiki/Colonies.md`, `wiki/Buildings.md`, `test/helpers/wiki/tables.ts` (add renderers).

Sources: `src/engine/data/colony.ts`, `buildings.ts`, `production.ts`, `food.ts`, `goods.ts`,
`construction.ts`, `liberty.ts`, `education.ts`, `placement.ts`, `custom-house.ts`, `trade-routes.ts`;
`docs/RULES.md` "Founding and joining colonies", "Indoor production", "Construction", "Food and
horses", "Warehouse and spoilage", "Sons of Liberty", "Sons of Liberty bonus and Tory penalty inputs",
"Crosses", "Automatic placement", "Education", "Custom House", "Colony centre tile";
`src/ui/colony-screen.ts`, `src/ui/colony-model.ts`, `docs/colony/`.

Acceptance:
- **Colonies**: founding and joining (where you may found, the centre square, the free road); the
  colony screen walked through region by region with `colony.png` and `colony-large.png` (the
  squares, the buildings, the gates, the warehouse and holds, the construction panel, the views Tab
  cycles); putting people to work on squares and in buildings, drag and click; what each cargo is
  and what it becomes, with goods icons, in a generated table `goods` (icon, name, raw or made, made
  from, made by, made in); food, growth and starvation; horses; the warehouse limit and spoilage;
  Sons of Liberty: bells, membership, the production bonus and the Tory penalty, in plain words with
  the thresholds; schooling; the custom house and its export list; trade routes (`trade-route.png`);
  automatic job choice when a colonist arrives; abandoning a colony; what a colony does when attacked
  links to [[Combat]].
- **Buildings**: every building with its sprite in a generated table `buildings` grouped by line
  (Town Hall; Carpenter; Lumber Mill; the four manufacturing lines house → shop → factory; Armory
  line; Docks line; schools; Warehouse; Stable; Custom House; Printing Press and Newspaper; Church
  and Cathedral; Stockade line), with hammers, tools, the population needed and what it does; the
  Capitol rows are left out as the data says. Construction: hammers and tools, the queue, buying the
  rest and what it costs, what needs a Founding Father (Adam Smith's factories, Stuyvesant's
  Custom House), what La Salle gives free; `colony-construction.png`.

Verify: `npm test -- test/unit/wiki`; `npm run check`; `npm run guard`.

### W9 — Europe and Trade; The Crown and Independence (R-1031, size M, depends on: W1, W2, W3, W4)

Files: `wiki/Europe-and-Trade.md`, `wiki/The-Crown-and-Independence.md`, `test/helpers/wiki/tables.ts`
(add renderers).

Sources: `src/engine/data/market.ts`, `europe.ts`, `immigration.ts`, `crosses.ts`, `tax.ts`,
`royal.ts`, `independence.ts`, `custom-house.ts`; `docs/RULES.md` "Market", "Tax", "Europe docks and
starting treasury", "Custom House", "Recruiting, training and purchases", "Immigration", "Royal
events", "Declaration of Independence", "War of Independence"; `src/ui/europe-screen.ts`,
`src/ui/europe-model.ts`, `docs/europe/`; `src/ui/pedia.ts` concepts (prices, taxes, crosses,
liberty bells).

Acceptance:
- **Europe and Trade**: getting there and back (the sea lane, the Europe button and what its two looks
  mean, Go To Europe); the screen (`europe.png`): docks, market, the three counters; buying and
  selling in lots, bid and ask, why prices move and recover, boycotts, the other powers trading in
  the same market; the generated table `market` (icon, good, starting price range, the lowest and
  highest it goes); recruiting (`europe-recruit.png`): the pool of three, crosses and the price,
  what each immigrant class may turn out to be; training at the Royal University with the generated
  table `training` (profession, price); purchases (ships, artillery, muskets, horses, tools) with the
  generated table `purchases`; the Custom House as the way to sell without sailing; taxes: how a
  raise comes, the tea-party choice and what a boycott costs, back taxes.
- **The Crown and Independence**: what the Crown does over a game (taxes, the royal events in
  `docs/RULES.md` "Royal events" told as the player sees them: wars in Europe, the frigate and
  mercenary offers, the War of Succession, the expeditionary force growing and how to read its size
  in the Congress report); rebel sentiment and how to raise it (links to [[Colonies]] bells and
  [[Founding Fathers]]); the Declaration (what is needed, Shift-I, what happens at once: seizures,
  the Continental Army forming from veterans, Tory uprisings, trade stopping unless Stuyvesant); the
  war: landings, how the Crown's troops fight, defending and retaking colonies, foreign intervention
  and what brings it, hiring Continentals; how the war is won or lost and what then (links to
  [[Score and Hall of Fame]]). A generated table `expeditionary-force` of the Crown's starting force
  by difficulty.

Verify: `npm test -- test/unit/wiki`; `npm run check`; `npm run guard`.

### W10 — Native Peoples (R-1032, size S, depends on: W1, W2, W3, W4)

Files: `wiki/Native-Peoples.md`, `test/helpers/wiki/tables.ts` (add renderers).

Sources: `src/engine/data/tribes.ts`, `settlements.ts`, `alarm.ts`, `native-economy.ts`,
`native-trade.ts`, `missions.ts`, `learning.ts`, `land.ts`, `village.ts`, `native-war.ts`;
`docs/RULES.md` "Tribes", "Settlements", "Alarm", "Native demand and supply", "Entering a
settlement", "Missions", "Trade with natives", "Learning from natives", "Native land", "Natives at
war", "Native AI".

Acceptance:
- The eight peoples in a generated table `tribes` (settlement sprite by tech level, name, how
  settled: camp, village, city, what their treasure is, the skills they most often teach, where on
  the America map they live); capitals and the star; the mood mark and the five attitudes.
- First contact and the treaty; what each kind of unit may do on entering a settlement (scout: speak
  with the chief and what can come of it; missionary: found a mission; free colonist: live among them
  and learn; soldier or dragoon: demand tribute or attack; wagon train or ship: trade) with
  `native-settlement.png`.
- Alarm: what raises it (colonies on their land, missions, soldiers, taking land, killing) and what
  lowers it (gifts, trade, Pocahontas, time), per settlement and per people, and what happens at each
  attitude (demands, raids, war); the French advantage.
- Trade: what they want and what they offer, haggling, prices; missions and converts, what a convert is
  good for; learning a skill, which colonists may learn; buying or taking land and Peter Minuit;
  burning villages and what is gained and lost; extinction; Sepulveda, Brebeuf and las Casas linked.

Verify: `npm test -- test/unit/wiki`; `npm run check`; `npm run guard`.

### W11 — Founding Fathers, Other Powers, Reports, Score (R-1033, size M, depends on: W1, W2, W3, W4)

Files: `wiki/Founding-Fathers.md`, `wiki/Other-Powers.md`, `wiki/Reports-and-Advisers.md`,
`wiki/Score-and-Hall-of-Fame.md`, `test/helpers/wiki/tables.ts` (add renderers).

Sources: `src/engine/data/fathers.ts`, `congress.ts`, `diplomacy.ts`, `nations.ts`, `score.ts`, `ai.ts`;
`docs/RULES.md` "Continental Congress", "Nations", "Diplomacy", "Computer powers" (the first section
only, for how they behave as seen by the player), "Foreign Affairs report", "Score, rating and the
Hall of Fame", "Advisers"; `src/ui/reports/*.ts`, `src/ui/report.ts`, `src/ui/portraits.ts`,
`src/app/hall-of-fame.ts`.

Acceptance:
- **Founding Fathers**: how the Congress works (bells, one candidate per field offered, the cost
  rising with each father, `report-congress.png`); all twenty-five with their portraits in a generated
  table `fathers` grouped by field (portrait, name, effect, the eras he may be offered in: those of
  the three `weights` in `src/engine/data/fathers.ts` that are not zero, named 1492 to 1600, 1600 to
  1700, after 1700), with a paragraph per field on how to use them.
- **Other Powers**: the three other European powers and that they play the same game; meeting them
  and audiences; war and peace, what they attack, trading in their colonies with Jan de Witt; the
  Foreign Affairs report (`report-foreign.png`) and what it shows with and without de Witt; Franklin.
  Say in a paragraph how a computer power behaves as the player sees it (founds colonies, trades,
  arms, declares independence too), without the internals.
- **Reports and Advisers**: F1 to F10 each with what the report shows and is for, and the portrait
  `adviserFor(reportId)` in `src/ui/portraits.ts` gives it: `portraits/congress.png` for F3,
  `portraits/foreign.png` for F8, `portraits/score.png` for F10 and the Hall of Fame, and
  `portraits/advisers.png` for every other report (F1, F2, F4 to F7, F9); with `report-economic.png`,
  `report-colony.png` and `report-score.png`; the colony report options.
- **Score and Hall of Fame**: what counts toward the score, with the generated table `score` of
  components and weights; the rating factor by difficulty; the rating names; retiring (Shift-R); the
  ending at the last year; the Hall of Fame (`hall-of-fame.png`) and where it is kept.

Verify: `npm test -- test/unit/wiki`; `npm run check`; `npm run guard`.

### W12 — Gallery of the game's art (R-1034, size S, depends on: W1, W2)

Files: `wiki/Gallery.md`.

Acceptance:
- A page of the source paintings the sprites were baked from, by folder, each with
  `<img ... width="160">` from `images/paintings/<folder>/<file>` and the sprite it became beside it
  from `images/art/...`, with a caption naming the thing. The pairing is by file name, which the
  painting and the sprite share: `art/units/<id>.png` with `images/art/units/<id>.png`;
  `art/places/<look>.png` with `images/art/places/<look>.png`; `art/features/<terrain>.png` and
  `art/floors/<terrain>.png` with `images/art/terrain/<terrain>.png`; `art/buildings/<id>.png`,
  `art/goods/<id>.png` and `art/portraits/<id>.png` with the same names under `images/art/`;
  `art/title/frontispiece.png` with `images/art/title/frontispiece.png`. The chart pictures in
  `art/chart/` are shown alone (they are drawn at their final size and have no larger source).
- A short introduction saying the pictures are the game's own, made for it, how they are shrunk into
  the game's palette (the gist of `scripts/bake-art.py`'s docstring in a few sentences, without
  naming tools the reader does not need), and that the faces are invented and none is a likeness of a
  real person.
- Every image path resolves (the W1 checker maps `images/paintings/<rest>` to `art/<rest>`).

Verify: `npm test -- test/unit/wiki`; `npm run check`; `npm run guard`.

## Open questions and decisions

Decisions the owner made during planning:

- **The manual's source lives in this repository** (`wiki/`), published to the GitHub wiki by a
  workflow. Rejected: writing straight into the wiki repository, which has no pull requests, no
  reviews and no guard hook.
- **Both kinds of pictures**: the game's sprites as they appear in play, beside the thing they show,
  and the larger source paintings as page heads and in a Gallery. Rejected: either alone.
- **Prose plus generated reference tables.** Rejected: prose only (the numbers are what a returning
  player looks up); a full restatement of every formula (the in-game encyclopedia and `docs/RULES.md`
  hold those).

Planner's choices, for the workers:

- **The wiki repository must exist before the first publish.** GitHub creates it when the first page
  is made in the browser; it cannot be made by pushing. The owner does this once (Wiki tab, "Create
  the first page", any content; the workflow overwrites it). W1 does not block on it: the workflow is
  tested with actionlint and by its structure, and the first live publish is confirmed by hand when
  the page exists.
- **Paintings are copied at publish time**, not committed twice. The checker resolves
  `images/paintings/<rest>` to `art/<rest>` so broken references are still caught.
- **Pixels, not bytes**, are what the sprite test compares, so a different Node build's zlib does not
  fail it.
- **Links are wiki links** (`[[Page]]`), images are relative paths. If a worker finds on the live wiki
  that relative image paths do not render, the fix is in the publishing workflow (rewrite to the
  wiki's raw URL, `https://raw.githubusercontent.com/wiki/colebrumley/new-world/<path>`), not in the
  pages; say so on the board.
- **A rule the code and `docs/RULES.md` disagree on**: the manual says what the code does, the worker
  leaves a board note naming the section, and the pull request lists it under **Decisions**. Do not
  change code or `docs/RULES.md` in these items.
- **Something the spec names that the game does not have** (a screen, an option, a dialog): leave it
  out of the page and say so in the pull request. Do not build it.
- **Screenshot drift**: when a later change alters a screen, the pictures are regenerated by whoever
  changes it (`WIKI_SHOTS=1 ...`). The screens test checks presence and size, not content, so a stale
  picture fails nothing; this is accepted.
- **Wiki-only pull requests are checked by `wiki.yml`'s check job**, not by widening `deploy.yml`,
  so that a page edit does not build and test the whole game.
- **Critique.** A quick adversarial critique of this spec found no critical issue; its high findings
  (a page title with a comma, a self-contradicting sidebar, section links into stubs, an undefined
  painting-to-sprite pairing, identical Verify lines that proved nothing, a C1 check that would have
  checked nothing, no CI gate for wiki-only pull requests, and W2 to W4 colliding with W1) are folded
  in above.
