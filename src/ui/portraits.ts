// Portraits (R-1016): the four advisers, the King and the founding fathers, each a head and
// shoulders 64 art pixels square in colours of the map palette. The pictures (portrait-art.ts) are
// baked by scripts/bake-art.py from our own sources in art/portraits (constraint C1); the faces
// are invented and none is a likeness of a historical person. A portrait is drawn one canvas pixel
// to an art pixel and the page enlarges it by a whole number with no smoothing.
import { FATHER_IDS, type FatherId } from '../engine/data/fathers';
import { INK, PALETTE } from './pixel-art';
import { PORTRAIT_ART, PORTRAIT_CODES, PORTRAIT_COLORS, PORTRAIT_SIZE } from './portrait-art';

/** The advisers, one per report module in ui/reports. */
export const ADVISER_IDS = ['advisers', 'congress', 'foreign', 'score'] as const;
export type AdviserId = (typeof ADVISER_IDS)[number];
export type PortraitId = AdviserId | 'king' | FatherId;
export const PORTRAIT_IDS: readonly PortraitId[] = [...ADVISER_IDS, 'king', ...FATHER_IDS];

/** A number into PALETTE. */
export type PaletteIndex = number;

/** What a cell of an adviser's coat holds until its colour is given: the wax its report is sealed with. */
export const COAT = 255;

/** Which adviser writes a report, by the report's id: the reports of ui/reports/advisers.ts share one, and the hall of fame is the chronicler's like the score. */
export function adviserFor(reportId: string): AdviserId {
  if (reportId === 'congress' || reportId === 'foreign') return reportId;
  return reportId === 'score' || reportId === 'hall' ? 'score' : 'advisers';
}

const cells = new Map<PortraitId, Uint8Array>();

/** A portrait as numbers into PALETTE, a row at a time; COAT where the coat is. */
export function portraitCells(id: PortraitId): Uint8Array {
  const known = cells.get(id);
  if (known) return known;
  const index = PORTRAIT_COLORS.map((colour) => (PALETTE as readonly string[]).indexOf(colour));
  const rows = PORTRAIT_ART[id] ?? [];
  const out = new Uint8Array(PORTRAIT_SIZE * PORTRAIT_SIZE);
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) out[y * PORTRAIT_SIZE + x] = row[x] === '*' ? COAT : (index[PORTRAIT_CODES.indexOf(row[x] as string)] as number);
  });
  cells.set(id, out);
  return out;
}

/** A portrait as RGBA bytes, PORTRAIT_SIZE square and opaque, its coat (if it has one to colour) in the palette colour `coat`. */
export function portraitRgba(id: PortraitId, coat: PaletteIndex = INK.red): Uint8ClampedArray<ArrayBuffer> {
  const rgb = PALETTE.map((hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)));
  const wax = rgb[coat] ?? (rgb[INK.red] as number[]);
  const out = new Uint8ClampedArray(PORTRAIT_SIZE * PORTRAIT_SIZE * 4);
  portraitCells(id).forEach((cell, n) => {
    const [r, g, b] = cell === COAT ? wax : (rgb[cell] as number[]);
    out[n * 4] = r as number;
    out[n * 4 + 1] = g as number;
    out[n * 4 + 2] = b as number;
    out[n * 4 + 3] = 255;
  });
  return out;
}

/** A canvas holding the portrait, shown `scale` screen pixels to the art pixel (a whole number; the stylesheet keeps it crisp). */
export function portraitCanvas(id: PortraitId, scale = 1, coat: PaletteIndex = INK.red): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const times = Math.max(1, Math.round(scale));
  canvas.className = 'portrait';
  canvas.width = PORTRAIT_SIZE;
  canvas.height = PORTRAIT_SIZE;
  canvas.style.width = `${PORTRAIT_SIZE * times}px`;
  canvas.style.height = `${PORTRAIT_SIZE * times}px`;
  canvas.dataset['portrait'] = id;
  canvas.dataset['scale'] = String(times);
  canvas.setAttribute('aria-hidden', 'true');
  canvas.getContext('2d')?.putImageData(new ImageData(portraitRgba(id, coat), PORTRAIT_SIZE, PORTRAIT_SIZE), 0, 0);
  return canvas;
}
