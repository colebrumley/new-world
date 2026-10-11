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
| `art/floors` | The ground of each of the thirteen terrains that has a floor, named by its terrain id (`plains.png`, `seaLane.png`, ...): bare ground with a little texture, in one clearly dominant colour, filling the square. | 32 px, three colours a picture, then levelled so the commonest colour is exactly the terrain's palette colour | `src/ui/floor-art.ts` |
| `art/features` | What stands on the ground: one picture for each of the eight forests, for hills and for mountains, named by its terrain id, cut out on magenta. | 32 px, five colours a picture | `src/ui/feature-art.ts` |
| `art/resources` | One marker per special resource, named by its id in `src/engine/data/resources.ts`: a picture of the thing itself, cut out on magenta. (Not yet a folder; it arrives with the resource markers.) | to be set by the item that adds it | `src/ui/resource-art.ts` |
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

pixelforge (<https://github.com/colebrumley/pixelforge>) shrinks the pictures. `PIXELFORGE` is the
path to a checkout of it, and both scripts are run with that checkout's Python, which has Pillow
and numpy. Below, `$PY` is `$PIXELFORGE/.venv/bin/python`.

```bash
git clone https://github.com/colebrumley/pixelforge && (cd pixelforge && uv sync)
export PIXELFORGE=$PWD/pixelforge PY=$PWD/pixelforge/.venv/bin/python
```

1. **Shrink the source**, once for each new picture: `$PY scripts/shrink-art.py art/<folder>/<name>.png ...`
   takes the grain out and saves the picture with a palette, at the same size in pixels. A picture
   that already has a palette is left alone.
2. **Bake**: `$PY scripts/bake-art.py <folder> ...` (`floors`, `features`, `units`, `places`,
   `portraits`, `title`, `chart`, `buildings`, `goods`; every folder if none is named). It rewrites
   the folder's `src/ui/*-art.ts`. Those files are never edited by hand.
3. **Run it again** and check that nothing changed: `git diff --exit-code src/ui/<file>.ts` after a
   second bake must be empty. A bake is the same every time for one pixelforge commit.
4. **Update the unit snapshots** that hold art: `npm test -- -u test/unit/ui/pixel-art.test.ts test/unit/ui/render.test.ts`.
5. **Update the manual's sprites**: `UPDATE_FIXTURES=1 npm test -- test/unit/wiki` rewrites
   `wiki/images/art/`.
6. **Make a contact sheet** and look at it: `$PY scripts/contact-sheet.py <folder> [scale]` tiles
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

### The pixelforge commit

The bakes committed here were made with pixelforge at commit
`0edd46251b5ce2f925cd4345b0a8e5cf3b6a853e`. Another commit may shrink a picture a little
differently, which changes every cell of a baked file without anything being wrong. When a bake
of an untouched folder differs from what is committed, check the commit first; when the commit
has moved on, say so in the pull request and update this line.

Only `floor-art.ts`, `title-art.ts` and `portrait-art.ts` have been baked at that commit so far.
`unit-art.ts`, `place-art.ts`, `feature-art.ts`, `building-art.ts` and `goods-art.ts` were baked
before this line was kept, and baking those folders again at this commit changes every one of them
with no change to their sources (the features, for one, come out in 50 colours of their own where
the committed file has 46, which counts against `ART_COLORS`). An item that re-bakes one of them
should expect that, look at the result, and say so in its pull request.

## What a baked picture may hold

- `ART_COLORS` in `src/ui/pixel-art.ts` is the palette followed by every baked set that the map
  and the colony screen draw. It must stay at or under 255 colours (a cell is one byte, and zero is
  see-through); `test/unit/ui/pixel-art.test.ts` checks it. A new folder counts against it.
- A baked file's letters come from one alphabet of 52, so a folder holds at most 52 colours of its
  own.
- Every floor's commonest colour is its terrain's `GROUND` colour (a unit test), so that the two
  nearest zooms agree with the far ones and with the minimap.
- The title painting and the portraits use no colour outside the palette (their unit tests).
- Every sprite is square and is drawn at a whole multiple of its grid, with no smoothing
  (`test/helpers/reference-canvas.ts` refuses anything else).
