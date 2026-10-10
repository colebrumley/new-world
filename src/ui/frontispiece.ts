// The painting behind the title screen: a caravel off a wooded coast, in the colours of the map
// palette. The picture (title-art.ts) is baked by scripts/bake-art.py from our own source in
// art/title (constraint C1). This module and the picture are fetched after the title screen is up
// (app/shell.ts), so nothing here may be imported by the entry script.
import { TITLE_ART, TITLE_CODES, TITLE_COLORS, TITLE_HEIGHT, TITLE_WIDTH } from './title-art';

/** One row of the picture as colour numbers (indexes into TITLE_COLORS): each letter of the row, repeated as often as the figure after it says. */
export function unpackRow(row: string): number[] {
  const cells: number[] = [];
  for (const [, letter, count] of row.matchAll(/([a-zA-Z])(\d*)/g)) {
    const colour = TITLE_CODES.indexOf(letter as string);
    for (let n = count ? Number(count) : 1; n > 0; n--) cells.push(colour);
  }
  return cells;
}

/** The whole picture as RGBA bytes, TITLE_WIDTH x TITLE_HEIGHT, every pixel opaque. */
export function paintingRgba(): Uint8ClampedArray<ArrayBuffer> {
  const rgb = TITLE_COLORS.map((hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)));
  const out = new Uint8ClampedArray(TITLE_WIDTH * TITLE_HEIGHT * 4);
  TITLE_ART.forEach((row, y) => {
    unpackRow(row).forEach((colour, x) => {
      const at = (y * TITLE_WIDTH + x) * 4;
      const [r, g, b] = rgb[colour] as number[];
      out[at] = r as number;
      out[at + 1] = g as number;
      out[at + 2] = b as number;
      out[at + 3] = 255;
    });
  });
  return out;
}

/** Draw the picture to its canvas, one canvas pixel to an art pixel; the page enlarges it by a whole number with no smoothing. */
export function paint(canvas: HTMLCanvasElement): void {
  canvas.width = TITLE_WIDTH;
  canvas.height = TITLE_HEIGHT;
  canvas.getContext('2d')?.putImageData(new ImageData(paintingRgba(), TITLE_WIDTH, TITLE_HEIGHT), 0, 0);
  canvas.dataset['painted'] = 'true';
}
