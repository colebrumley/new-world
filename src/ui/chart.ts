// The explorer's chart (R-1011): where the compass roses and the chart's creatures stand on the
// unexplored map. It is worked out from the map's seed and size alone, never from what lies under
// the vellum, so the chart gives nothing away, and it is the same every time the game is opened.

export const CHART_MARK_KINDS = ['rose', 'serpent', 'ship'] as const;
export type ChartMarkKind = (typeof CHART_MARK_KINDS)[number];

/** How the chart is laid out, in map squares. */
export const CHART = {
  /** The map is cut into regions this many squares each way; each holds at most one compass rose. */
  region: 24,
  /** Each region is cut into cells this many squares each way; each holds at most one creature or ship. */
  cell: 8,
  /** The share of cells that hold one. */
  markChance: 0.25,
  /** A rose keeps this many squares from the edge of a whole region, so two roses never stand side by side. */
  roseInset: 4,
  /** Squares each mark covers, across and down. */
  squares: { rose: 4, serpent: 3, ship: 2 },
} as const satisfies { region: number; cell: number; markChance: number; roseInset: number; squares: Record<ChartMarkKind, number> };

/** One mark on the chart: its top left square and how many squares it covers each way. */
export interface ChartMark {
  readonly kind: ChartMarkKind;
  readonly x: number;
  readonly y: number;
  readonly size: number;
}

/** A number from 0 up to (not including) 1 for this text: the same for the same text, well spread for different ones. */
function draw(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  h ^= h >>> 16;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  h = Math.imul(h, 3266489909);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const touch = (a: ChartMark, b: ChartMark): boolean => a.x < b.x + b.size + 1 && b.x < a.x + a.size + 1 && a.y < b.y + b.size + 1 && b.y < a.y + a.size + 1;

function layOut(seed: number | string, width: number, height: number): readonly ChartMark[] {
  const marks: ChartMark[] = [];
  /** Where a mark of `size` squares goes in the part of a block of `block` squares, starting at `from`, that is on the map. */
  const place = (name: string, from: number, block: number, limit: number, size: number, inset = 0): number | null => {
    const span = Math.min(block, limit - from);
    // a block cut short by the map's edge has no room to spare for the inset
    const margin = span - size >= 2 * inset ? inset : 0;
    const room = span - size - 2 * margin;
    return room < 0 ? null : from + margin + Math.floor(draw(`${seed}|${name}`) * (room + 1));
  };
  for (let ry = 0; ry * CHART.region < height; ry++) {
    for (let rx = 0; rx * CHART.region < width; rx++) {
      const size = CHART.squares.rose;
      const x = place(`rose|x|${rx}|${ry}`, rx * CHART.region, CHART.region, width, size, CHART.roseInset);
      const y = place(`rose|y|${rx}|${ry}`, ry * CHART.region, CHART.region, height, size, CHART.roseInset);
      const rose: ChartMark | null = x === null || y === null ? null : { kind: 'rose', x, y, size };
      if (rose) marks.push(rose);
      const cells = CHART.region / CHART.cell;
      for (let cy = ry * cells; cy < (ry + 1) * cells && cy * CHART.cell < height; cy++) {
        for (let cx = rx * cells; cx < (rx + 1) * cells && cx * CHART.cell < width; cx++) {
          if (draw(`${seed}|mark|${cx}|${cy}`) >= CHART.markChance) continue;
          const kind: ChartMarkKind = draw(`${seed}|kind|${cx}|${cy}`) < 0.5 ? 'serpent' : 'ship';
          const side = CHART.squares[kind];
          const mx = place(`mark|x|${cx}|${cy}`, cx * CHART.cell, CHART.cell, width, side);
          const my = place(`mark|y|${cx}|${cy}`, cy * CHART.cell, CHART.cell, height, side);
          if (mx === null || my === null) continue;
          const mark: ChartMark = { kind, x: mx, y: my, size: side };
          // nothing is drawn against the rose
          if (!rose || !touch(mark, rose)) marks.push(mark);
        }
      }
    }
  }
  return marks;
}

let last: { readonly key: string; readonly marks: readonly ChartMark[] } | null = null;

/** Every mark on the chart of a map of this seed and size. A rose and the creatures never share a square. */
export function chartMarks(seed: number | string, width: number, height: number): readonly ChartMark[] {
  const key = `${typeof seed}:${seed}|${width}|${height}`;
  if (last?.key !== key) last = { key, marks: layOut(seed, width, height) };
  return last.marks;
}

/** Whether a mark may be drawn: only while every square it covers is still unknown. */
export function markShows(mark: ChartMark, unknown: (x: number, y: number) => boolean): boolean {
  for (let y = mark.y; y < mark.y + mark.size; y++) for (let x = mark.x; x < mark.x + mark.size; x++) if (!unknown(x, y)) return false;
  return true;
}
