# Visual checklist (R-1006)

What the map must look like, and what checks each point. The baselines are taken at 1280 x 800
by `test/e2e/visual.spec.ts`, which also writes a PNG of each view to `test-results/` to be
looked at when the art is changed.

The baselines do not depend on the platform. The map is drawn only from palette-indexed art
scaled by whole numbers, so what it must show can be computed without a browser:
`test/helpers/reference-canvas.ts` runs the game's own `render()` against a plain pixel buffer
(and refuses any colour outside the palette, any art off the pixel grid, and any smoothing). The
e2e test requires the browser's canvas to match that reference pixel for pixel at every zoom, and
the fingerprint kept as the baseline is the reference's. `test/unit/ui/render.test.ts` pins the
same renderer in the unit suite.

| # | Point | Checked by |
|---|---|---|
| 1 | Everything on the map is drawn in one palette of 32 colours (`PALETTE` in `src/ui/pixel-art.ts`). | unit: palette has 32 distinct entries; `render.ts`, `tiles.ts`, `minimap.ts` contain no colour literals. e2e: every canvas pixel at every zoom is a palette colour. |
| 2 | One pixel grid: art is 16 x 16 to the square; squares are 64, 32, 16 or 8 pixels, so an art pixel is 4, 2, 1 or (halved art) 1 pixel. No smoothing. | unit: `tileSizeFor` gives multiples of 8; art is 16 x 16. e2e: no off-palette (blended) pixels. |
| 3 | Every terrain can be told apart, open from wooded, hills and mountains by their shapes; rivers, roads, plowed fields, resources and rumors show. | unit: all terrain art distinct; features change the art. e2e sheet baseline. |
| 4 | Terrain is readable at every zoom; at the smallest each terrain is one flat colour and forest is never the colour of its open ground. | unit: mini art; e2e: at least 8 colours on screen at zoom 0, 12 at the others. |
| 5 | Each unit type has its own figure, in a box of its owner's colour: English red, French blue, Spanish yellow, Dutch orange, the Crown white, each native people its own. | unit: 24 distinct pieces; colour follows the owner. e2e: orders box test, sheet baseline. |
| 6 | European units carry an orders plate at the top left in the owner's colour with the order letter (a count of filled holds on a foreign ship); native bands carry none. A unit standing on others shows a shadow behind it. | unit: plate, label, stack, no plate for natives. |
| 7 | A colony is a house under its owner's roof with the population on a dark plate: white under half Sons of Liberty, green from half, blue at all. | unit: colony art by colour, number and band. |
| 8 | A settlement is a tent, a longhouse or a pyramid by its people's advancement, in their colour; a capital flies a pennant; an exclamation mark at the top right shows the mood from green (content) to red (hostile). | unit: shapes, pennant, mark and its colours. |
| 9 | The unit awaiting orders has a white frame that blinks. | e2e: the canvas changes over time; `?still` freezes it. |
| 10 | The sea shimmers when the Water shimmer option is on; a unit of ours slides to the next square unless Fast piece slide is on. | e2e: animation redraws counted in `data-ticks`, none with `?still`. |
| 11 | The minimap uses the flat terrain colours and marks the view with a white box. | e2e `map.spec.ts`. |

Not drawn as pixel art: the sidebar, dialogs, reports and the colony screen's tokens are text
in the page's own fonts. Colours there are the page's, not the palette's. They come from the theme
tokens at the head of `src/ui/style.css` (parchment, ink, wood, brass, wax; `docs/ARCHITECTURE.md`,
Theme), which the canvas never reads.
