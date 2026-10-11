# Art guide

How a picture gets onto the map: what each folder under `art/` holds, what every picture must look
like, the colours it is painted in, how it is generated, and how it is baked into the game. Every
item that adds or replaces art hands this guide's prompt to the generator and checks the result
against it. All of the pictures are our own (constraint C1): nothing is copied or fetched
from anyone else's graphics, and a prompt holds nothing that is not already public in this
repository.

What the finished map must look like, and which test checks each point, is in
[VISUAL_CHECKLIST.md](VISUAL_CHECKLIST.md). Where the baked art sits in the code is in
[ARCHITECTURE.md](ARCHITECTURE.md).

## The look

One hand-painted world in flat colour, saturated and high in contrast, that still reads when a
1024-pixel picture is shrunk to 32 pixels or fewer.

- **Flat colour areas.** A handful of flat colours to a subject, each area large. No gradients, no
  soft shading, no grain or noise, no dithering, no texture finer than a thirtieth of the picture.
- **A dark outline** round every subject and between its main parts, one or two pixels wide once
  baked, which is 30 to 60 pixels wide in the source. A floor has no outline round its square.
- **Light from the upper left.** Lit faces are up and left, shade is down and right, and a subject
  casts no shadow on the ground behind it.
- **Saturated greens and blues.** Land is green and gold, forest a strong green, the sea a deep
  blue. Nothing is greyed, misted or faded toward the distance.
- **No text**, no letters or numbers, no border, no frame, no signature, no watermark.
- **One subject to a picture**, seen from the same side as the pictures already in the folder (a
  floor from above, a forest or a figure from the front and a little above), filling most of its
  square.

## The ground rule

- **Anything cut out** (a unit, a place, a forest, hills, mountains, a resource marker) stands on a
  flat magenta ground, exactly `#ff00ff`, with no shadow, glow or tint on it. Magenta and anything
  tinted by it is cut away when the picture is baked, so the subject itself holds no pink or
  purple-red.
- **A floor fills its square** from edge to edge with no magenta, and should repeat across its
  edges: what leaves the right side comes in at the left, and likewise top to bottom, with nothing
  centred and no feature large enough to show as a pattern when the square is laid in rows.
- **A part that takes its owner's colour** (a roof, a flag, an adviser's coat) is painted flat
  cyan, `#00ffff`, and is given the colour when it is drawn.
- **A portrait and the title painting** fill their picture and are painted in the palette's own
  colours and no others, on plain parchment for a portrait.

## Size

Every source picture is a 1024 x 1024 PNG. (The generator may give back a slightly larger square;
that is fine, as the baker measures the picture it is given.) The one exception is the title
painting, which is 8 to 5. The older pictures in `art/` are 1254 pixels square.

## The folders

| Folder | Subject | Baked as | Into |
|---|---|---|---|
| `art/floors` | The ground of each of the thirteen terrains that has a floor, named by its terrain id (`plains.png`, `seaLane.png`, ...): bare ground with a little texture, in one clearly dominant colour, filling the square. | 32 px, in the map palette alone, single cells kept (`specks`), then levelled so the commonest colour is exactly the terrain's palette colour; then a 16 px copy in the same colours, levelled the same way | `src/ui/floor-art.ts` (`FLOOR_ART`, `FLOOR_ART_16`) |
| `art/features` | What stands on the ground: one picture for each of the eight forests, for hills and for mountains, named by its terrain id, cut out on magenta: a dense clump that fills its square, since a forest or mountains must cover at least six tenths of it and hills nearly half. Mountains are a massif that reaches both sides of the square and stands on its bottom edge ("What a mountain needs" below). It is baked once, as it stands: where two of a kind meet, the map draws the picture again half a square over (`joinMask`), so the wood or the ridge runs on. | 32 px, one palette of 32 for the folder; then a 16 px copy in the same colours (`--palette-name`) | `src/ui/feature-art.ts` (`FEATURE_ART`, `FEATURE_ART_16`) |
| `art/resources` | One marker per special resource, named by its id in `src/engine/data/resources.ts`: a picture of the thing itself, cut out on magenta: one bold, compact silhouette with few parts, since it is shrunk further than anything else; a marker that lies on a ground of its own colours is told from it by dark against light, as silver on mountains is bright metal in near-black rock. | 24 px, one palette of 24 for the folder, the subject centred in its square with a twelfth of the square clear round it (`centre`), and the near-black outline colours folded into one ink (`one_ink`); then a 12 px copy in the same colours (`--palette-name`), with an outline of that ink drawn round it after shrinking, as the painted one is too thin to survive | `src/ui/resource-art.ts` (`RESOURCE_ART`, `RESOURCE_ART_12`) |
| `art/places` | A colony at each state of its walls and a native settlement at each level of advancement, cut out on magenta, roofs in cyan. | 32 px, one palette of 24 for the folder | `src/ui/place-art.ts` |
| `art/units` | One figure per unit type, named by its id, cut out on magenta. | 30 px, one palette of 32 for the folder | `src/ui/unit-art.ts` |
| `art/portraits` | A head and shoulders for each adviser, the King and each founding father, on plain parchment, an adviser's coat in cyan. The faces are invented: none is a likeness of a historical person. | 64 px, in the map palette alone | `src/ui/portrait-art.ts` |
| `art/title` | The painting behind the title screen, 8 to 5. | 320 x 200, in the map palette alone | `src/ui/title-art.ts` |
| `art/chart` | The explorer's chart the unexplored map is drawn as: the vellum floor, the compass rose and the chart's creatures, at 32, 16 and 8 pixels to the square. These are not generated: `scripts/draw-chart.py` draws them at their final size in six inks of the palette (parchment, sand, hill, earth, wood, ink). | as they are | `src/ui/chart-art.ts` |

`art/buildings` and `art/goods` (the colony screen's pictures) are older and are drawn from plain
shapes by `scripts/draw-colony-art.py`; this guide does not cover them.

## The palette

The map is drawn in these 32 colours (`PALETTE` in `src/ui/pixel-art.ts`, pinned by value in
`test/unit/ui/pixel-art.test.ts`). Everything drawn in code uses them alone; a baked picture may
add colours of its own (its file's `_COLORS`), but it is painted in these colours or near them so
that the whole map reads as one set. Quote the rows a picture needs, with their hex values, in its
prompt.

| # | Name | Hex | Role |
|---|---|---|---|
| 0 | void | `#0b0d12` | beyond the map's edge |
| 1 | ink | `#111111` | outlines, the chart's ink |
| 2 | white | `#f2f2f2` | highlights, snow, sails, the Crown |
| 3 | parchment | `#e9dfc4` | vellum, a portrait's ground |
| 4 | light grey | `#c3c7cc` | steel, stone in light |
| 5 | grey | `#8d8a84` | mountain rock |
| 6 | dark grey | `#5f5b57` | rock in shade |
| 7 | deep sea | `#141f6b` | sea lanes, the darkest water |
| 8 | sea | `#1f2f8e` | open ocean |
| 9 | wave | `#3d58b0` | shallows along a coast, wave crests |
| 10 | bright blue | `#4a8fe8` | rivers, an oasis, one tribe, one mood |
| 11 | ice | `#e6edf2` | arctic ground |
| 12 | tundra | `#a8b08f` | tundra ground |
| 13 | sand | `#d3bd7a` | desert ground, beaches |
| 14 | plains | `#c2b268` | plains ground |
| 15 | prairie | `#cfae5c` | prairie ground |
| 16 | grass | `#6cb43e` | grassland ground |
| 17 | savannah | `#a9bd4a` | savannah ground |
| 18 | marsh | `#6a9c5e` | marsh ground |
| 19 | swamp | `#4c7a4e` | swamp ground |
| 20 | leaf | `#4f9f2c` | light canopy |
| 21 | forest | `#2b7a28` | canopy |
| 22 | deep forest | `#1a5a1e` | dark canopy, forest at the far zoom |
| 23 | hill | `#a39262` | hills ground |
| 24 | earth | `#7c6b45` | bare earth, hills at the far zoom |
| 25 | wood | `#6b4a2a` | trunks, timber, roads, the chart's brown ink |
| 26 | red | `#c8322b` | a nation, a mood, sealing wax |
| 27 | blue | `#2f5fc4` | a nation |
| 28 | yellow | `#d9c23c` | a nation, gold |
| 29 | orange | `#d9812e` | a nation |
| 30 | green | `#39c24a` | a tribe, a mood |
| 31 | purple | `#8a5fb5` | a tribe |

The ground colour of each terrain is `GROUND` in the same file, and the one flat colour it has at
the farthest zoom and on the minimap is `MINI`. A forest stands on the ground of its open row:
boreal on tundra, scrub on desert, mixed on plains, broadleaf on prairie, conifer on grassland,
tropical on savannah, wetland on marsh, rain forest on swamp. `scripts/bake-art.py` reads
`PALETTE`, `INK` and `GROUND` from `src/ui/pixel-art.ts` itself, so a floor is always levelled to
the colour the map draws; it keeps no table of its own.

A change to a palette value changes every picture baked in the palette alone: re-bake `title` and
`portraits` as well as whatever else the change was for.

## Generating a picture

Source pictures are made with Codex's image generation (`codex --version` says whether it is on
the machine). Never draw a source picture with a script. Work in an empty scratch directory
outside the repository, at most six pictures to a run, with several runs side by side if there are
more; attach one or two existing pictures from the same folder of `art/` as style references.

```bash
mkdir /tmp/art-run && cd /tmp/art-run          # empty, and not inside the repository
# write prompt.txt, then:
codex exec --skip-git-repo-check -s workspace-write -i <repo>/art/floors/grassland.png -- "$(cat prompt.txt)" < /dev/null
```

`-i` may be given more than once. The prompt has three parts, in this order.

1. **The opening**, word for word, with N filled in:

   > Use your image generation tool to create N separate square images (1024 x 1024), one per
   > subject below, and save them as PNG files in the current directory with exactly these
   > filenames. Do not write code to draw them; generate them with the image tool.

2. **The style**: the look and the ground rule above in a few sentences, what the attached
   pictures are for, and the palette rows the subjects need, with their hex values.
3. **The subjects**, numbered, each with its filename and a sentence or two saying what is in it
   and which colour dominates.

### A worked prompt: two floors

```text
Use your image generation tool to create 2 separate square images (1024 x 1024), one per subject
below, and save them as PNG files in the current directory with exactly these filenames. Do not
write code to draw them; generate them with the image tool.

Style: ground textures for the squares of a hand-painted strategy map, seen from above. Each image
is filled from edge to edge with the ground: no border, no frame, no horizon, no sky, no objects
standing on it, no text. Flat colour areas only, three or four flat colours to an image, with one
clearly dominant colour covering at least half of it. No gradients, no soft shading, no grain, no
noise. The few details are large and simple, spaced unevenly, none in the centre, and the image
must repeat seamlessly: what leaves the right edge comes in at the left edge, and the same top to
bottom. Light comes from the upper left. Colours are saturated. Match the attached image for the
size of the details and the flatness of the colour; do not copy its subject.

Paint in these colours or very near them:
- plains ground #c2b268, with savannah green #a9bd4a and sand #d3bd7a for detail
- grassland ground #6cb43e, with light canopy green #4f9f2c and savannah green #a9bd4a for detail

Subjects:
1. plains.png - open farmland plains. Dominant colour #c2b268. Faint rows of crop stubble as
   short broken lines in #d3bd7a, and a few small tufts of dry grass in #a9bd4a.
2. grassland.png - lush meadow. Dominant colour #6cb43e. A few small tufts of darker grass in
   #4f9f2c and two or three flecks of paler green in #a9bd4a.
```

For anything cut out, the style paragraph instead says: one subject, centred, filling about four
fifths of the image, on a perfectly flat magenta `#ff00ff` ground with no shadow on it; flat
colour areas with a dark outline about 40 pixels wide round the subject and between its main
parts; light from the upper left; no gradients, no grain, no text; no pink or magenta in the
subject.

### What a floor and a forest need (learned in R-1042)

- **A floor's marks must be chunky.** One cell of a 32-pixel floor is 32 pixels of the source and one cell
  of the 16-pixel copy is 64, and a mark narrower than a cell is averaged into the ground and lost. Ask for
  no mark thinner than 70 pixels, most 90 to 180 across, twenty-five to thirty of them covering about a
  quarter of the image. Fourteen to twenty marks of 60 to 130 pixels came out nine tenths bare at 32 pixels
  and almost flat at 16. The sea is the exception: six or seven crests, so that it stays a flat deep blue.
- **Name the palette's own colours for a floor's marks**, with their hex values. The floors are baked in
  the map palette and no other colour, so a mark painted in a palette colour keeps it, and one painted in
  a shade between two of them goes to whichever is nearer (blue water on green ground leaves a cell or two
  of grey round a pool).
- **A mark needs contrast with its ground.** Sand on prairie gold, or two tones of one tuft, fold into the
  ground; of two prairie pictures the one with fewer, plainer tufts in a darker brown kept more.
- **A forest is asked for as a clump, not as trees**: "a dense, compact clump that fills the image almost
  from edge to edge, roughly square in outline, in two overlapping rows", with the number of trees given
  (six to eight) and the two or three colours of the crowns. Do not ask for ground under it: a patch of
  sand under scrub came back with an outline round it and read as a framed tile; the scrub is a thicket of
  bushes touching one another instead.
- One run of five or six pictures takes about six minutes; five runs side by side take no longer.

### What a mountain needs (learned in R-1048)

- **Mountains with character, not a row of points.** The first subject asked for "four tall, sharp, triangular
  peaks standing side by side": it came back as four equal spikes, and a range of them read as a fence. The one
  kept asks for "a charming, whimsical storybook mountain massif: three big, chunky mountains of clearly
  different heights and widths huddled together and overlapping", the tallest a little left of the middle with
  a crooked summit, a broad-shouldered one overlapping it, a stout one in front; "mountains, not spikes or
  cones: each has broad sloping shoulders, a craggy stepped ridge line, a notch or a ledge or two, and big
  simple facets of rock".
- **Filling the square to both sides and along the foot.** Say that the massif spans the full width of the
  image, touches the left and right edges in its lower half, stands on the bottom edge from corner to corner,
  and that only magenta shows above the summits. The map draws the picture again half a square toward each
  mountain beside it, under the picture itself (`joinMask`), so the copies stand in the gaps between the
  summits and the range runs on; a clump with ground round it leaves a row of floor at every edge.
- **Snow like icing over the upper half of each mountain**, in white `#f2f2f2` with its shaded side in light
  grey `#c3c7cc`, "its lower edge hanging down in a few big rounded drips and scallops, not a small cap". A cap
  is two or three cells at 32 pixels and nothing at 16, and without snow mountains are grey hills. Rock below in
  grey `#8d8a84` on the lit left faces and dark grey `#5f5b57` on the shaded right, and low rounded foothills
  of earth `#7c6b45` along the foot.
- **Ask for the outline heavier than it need be.** "About 40 pixels wide" came back about half that, which
  is under a cell at 32 pixels and baked to a fiftieth of the square in ink: mountains with no line between
  them. "A very heavy, bold dark outline, 50 pixels wide everywhere and never thinner than 40, as heavy as in
  the attached picture of hills, from summit to foot" baked to a sixth of the square.
- Run the prompt four times side by side and bake each: of four pictures from the one prompt, one had too
  little snow to pass the tests and another only just enough. Look at a range of them on the map as well as at the square alone
  (`docs/art/mountains-64.png` is such a range), since the joins double the summits. Send a picture back if the
  mountains are spikes or cones, if the massif does not reach both sides, if the snow is a cap, or if the rock
  has gradients. Attach `art/features/hills.png` and `art/features/boreal.png` as style references.

### Checking what comes back

Look at every picture before baking it. Send a picture back (run its prompt again, alone) when it
has text or a border; when a cut-out's ground is not flat magenta or the subject is cropped by the
edge; when a floor has an object in the middle, a visible seam, or no dominant colour; when it is
shaded with gradients; or when its colours are far from the rows quoted. Then name it exactly as
the folder needs (the baker keys a picture by its file name without `.png`) and copy it into
`art/<folder>/`.

### When Codex is unavailable or refuses

Do not draw the picture another way, and do not fetch one. Stop, leave the pull request open with
what is missing under **Open findings**, write a note on the board, and release the claim (the
blocking rules in `CLAUDE.md`).

## The pipeline

pixelforge (<https://github.com/colebrumley/pixelforge>) shrinks the pictures. It is a single
program, built with a Rust toolchain; the baker runs the `pixelforge` on `PATH`, or the program
`PIXELFORGE` names if that is set. The scripts themselves are Python and are run with `uv run`:
each names the Pillow and numpy it needs at its top, and uv fetches them.

```bash
cargo install --git https://github.com/colebrumley/pixelforge pixelforge
```

1. **Shrink the source**, once for each new picture: `uv run scripts/shrink-art.py art/<folder>/<name>.png ...`
   takes the grain out and saves the picture with a palette, at the same size in pixels. A picture
   that already has a palette is left alone.
2. **Bake**: `uv run scripts/bake-art.py <folder> ...` (`floors`, `features`, `resources`, `units`,
   `places`, `portraits`, `title`, `chart`, `buildings`, `goods`; every folder if none is named). It rewrites
   the folder's `src/ui/*-art.ts`. Those files are never edited by hand.
3. **Run it again** and check that nothing changed: `git diff --exit-code src/ui/<file>.ts` after a
   second bake must be empty. A bake is the same every time for one pixelforge version.
4. **Update the unit snapshots** that hold art: `npm test -- test/unit/ui/pixel-art.test.ts test/unit/ui/render.test.ts -u`
   (the `-u` goes last: put first, it takes the file after it for its own and that file is not run).
5. **Update the manual's sprites**: `UPDATE_FIXTURES=1 npm test -- test/unit/wiki` rewrites
   `wiki/images/art/`.
6. **Make a contact sheet** and look at it: `uv run scripts/contact-sheet.py <folder> [scale]` tiles
   the PNGs of `wiki/images/art/<folder>/` (`terrain`, `resources`, `units`, `places`, `portraits`,
   `title`, ...) into one labelled sheet, each enlarged `scale` times over, and writes
   `test-results/sheet-<folder>.png`. Floors and features show under `terrain`. This is the picture
   a pull request shows for its art. A Playwright run empties `test-results/`, so make the sheet
   after the last one, or copy it out.
7. **Update the map baselines**: `npx playwright test test/e2e/visual.spec.ts --update-snapshots`,
   then look at the PNGs it writes to `test-results/` (`visual-zoom0.png` to `visual-zoom3.png`,
   `visual-chart-zoom*.png`) before committing the new fingerprints, and attach one to the pull
   request.
8. **Keep the pictures the pull request shows** under `docs/art/` (the map at the default zoom is
   `docs/art/map-zoom3.png`, copied from `test-results/visual-zoom3.png`; replace it when the map
   changes) and link them in the pull request by commit.
9. `npm run guard`, `npm run check`, `npm run test:e2e`.

### The pixelforge version

The bakes committed here match pixelforge 0.2.0 (commit
`227b1dfc85b15d95df5c75cc733065caeed27956`), the first version written in Rust, with Pillow 12.3.0
and numpy 2.4.6 as the scripts name them. It gives the same cells as the last Python version did
(commit `0edd46251b5ce2f925cd4345b0a8e5cf3b6a853e`) for every folder here. Another version may
shrink a picture a little differently, which changes every cell of a baked file without anything
being wrong. When a bake of an untouched folder differs from what is committed, check
`pixelforge --version` first; when the version has moved on, say so in the pull request and update
this line.

Only `floor-art.ts`, `feature-art.ts`, `title-art.ts`, `portrait-art.ts` and `resource-art.ts` have been baked at that version so far.
`unit-art.ts`, `place-art.ts`, `building-art.ts` and `goods-art.ts` were baked
before this line was kept, and baking those folders again at this version changes every one of them
with no change to their sources. An item that re-bakes one of them
should expect that, look at the result, and say so in its pull request.

## What a baked picture may hold

- `ART_COLORS` in `src/ui/pixel-art.ts` is the palette followed by every baked set that the map
  and the colony screen draw. It must stay at or under 255 colours (a cell is one byte, and zero is
  see-through); `test/unit/ui/pixel-art.test.ts` checks it. A new folder counts against it.
- A baked file's letters come from one alphabet of 52, so a folder holds at most 52 colours of its
  own.
- A resource marker is opaque over 120 to 460 of its 576 cells and holds the folder's outline ink;
  the thirteen are distinct at 24 pixels and at 12, and the 12-pixel copies use no colour the
  24-pixel ones do not (a unit test). A marker is judged at its baked size, not at its source size:
  thin stalks, veins and joints turn to noise at 24 pixels, so ask for few, large parts.
- Every floor's commonest colour is its terrain's `GROUND` colour and covers at least four tenths of
  it, at 32 pixels and at 16, and every colour of a floor is a colour of the palette (unit tests), so
  that the three nearest zooms agree with the farthest and with the minimap.
- A forest is opaque over at least six tenths of its 32-pixel square, hills over at least 0.45 of theirs and
  mountains over six tenths (0.55 at 16 pixels). The mountains' topmost cell is in the first three rows, their
  bottom row holds at least 24 cells, and each outer column at least eight in the lower half; snow (every channel
  at 200 or over) is at least 0.12 of the square and outline (every channel under 48) at least 0.08. The ten are
  distinct at 32 pixels and at 16; `FLOOR_COLORS` and `FEATURE_COLORS` hold
  at most 32 colours each; and a 16-pixel copy uses no colour the 32-pixel picture does not (unit tests).
- The title painting and the portraits use no colour outside the palette (their unit tests).
- Every sprite is square and is drawn at a whole multiple of its grid, with no smoothing
  (`test/helpers/reference-canvas.ts` refuses anything else).
