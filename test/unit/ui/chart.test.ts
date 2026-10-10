// Where the explorer's chart puts its compass roses, serpents and ships (R-1011).
import { describe, expect, it } from 'vitest';
import { CHART, CHART_MARK_KINDS, chartMarks, markShows, type ChartMark } from '../../../src/ui/chart';

const SEEDS = [1, 2, 3, 11, 'new-world', 'a longer seed'];
const overlap = (a: ChartMark, b: ChartMark): boolean => a.x < b.x + b.size && b.x < a.x + a.size && a.y < b.y + b.size && b.y < a.y + a.size;

describe('the chart\'s marks', () => {
  it('matches the layout table', () => {
    expect(CHART).toMatchSnapshot();
    expect(CHART.region % CHART.cell).toBe(0);
    expect(CHART.squares.rose).toBe(4);
  });

  it('are the same for the same seed and map, and differ from seed to seed', () => {
    expect(chartMarks(11, 58, 72)).toEqual(chartMarks(11, 58, 72));
    expect(chartMarks('11', 58, 72)).toEqual(chartMarks('11', 58, 72));
    const layouts = new Set(SEEDS.map((seed) => JSON.stringify(chartMarks(seed, 58, 72))));
    expect(layouts.size).toBe(SEEDS.length);
    expect(chartMarks(11, 58, 72)).not.toEqual(chartMarks(11, 72, 58));
  });

  it('put one compass rose of four squares by four in each 24 x 24 region, and never two', () => {
    for (const seed of SEEDS) {
      for (const [width, height] of [[58, 72], [48, 48], [120, 96], [30, 20]] as const) {
        const roses = chartMarks(seed, width, height).filter((m) => m.kind === 'rose');
        const regions = roses.map((m) => `${Math.floor(m.x / CHART.region)},${Math.floor(m.y / CHART.region)}`);
        expect(new Set(regions).size, `${seed} ${width}x${height}`).toBe(roses.length);
        // every region with room for a rose has one, and each stands wholly inside its own region
        const room = (span: number): number => Math.floor(span / CHART.region) + (span % CHART.region >= CHART.squares.rose ? 1 : 0);
        expect(roses).toHaveLength(room(width) * room(height));
        for (const rose of roses) {
          expect(rose.size).toBe(4);
          expect(Math.floor((rose.x + 3) / CHART.region)).toBe(Math.floor(rose.x / CHART.region));
          expect(Math.floor((rose.y + 3) / CHART.region)).toBe(Math.floor(rose.y / CHART.region));
        }
        // roses in neighbouring regions keep their distance
        for (const a of roses) for (const b of roses) if (a !== b) expect(Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))).toBeGreaterThanOrEqual(4);
      }
    }
  });

  it('scatter sea serpents and ships, each on the map, none on another mark or against a rose', () => {
    for (const seed of SEEDS) {
      const marks = chartMarks(seed, 58, 72);
      const kinds = new Set(marks.map((m) => m.kind));
      for (const kind of CHART_MARK_KINDS) expect(kinds, `${seed}`).toContain(kind);
      for (const mark of marks) {
        expect(mark.size).toBe(CHART.squares[mark.kind]);
        expect(mark.x).toBeGreaterThanOrEqual(0);
        expect(mark.y).toBeGreaterThanOrEqual(0);
        expect(mark.x + mark.size).toBeLessThanOrEqual(58);
        expect(mark.y + mark.size).toBeLessThanOrEqual(72);
        for (const other of marks) if (other !== mark) expect(overlap(mark, other), JSON.stringify([mark, other])).toBe(false);
      }
      // the odd creature, not a crowd: about one cell in four holds one
      const cells = Math.ceil(58 / CHART.cell) * Math.ceil(72 / CHART.cell);
      const creatures = marks.filter((m) => m.kind !== 'rose').length;
      expect(creatures).toBeGreaterThanOrEqual(4);
      expect(creatures).toBeLessThanOrEqual(cells / 2);
    }
  });

  it('leave out what does not fit: a map smaller than a rose has none', () => {
    expect(chartMarks(5, 3, 3).filter((m) => m.kind === 'rose')).toEqual([]);
    for (const mark of chartMarks(5, 3, 3)) expect(mark.x + mark.size).toBeLessThanOrEqual(3);
  });

  it('show only while every square they cover is unknown', () => {
    const rose: ChartMark = { kind: 'rose', x: 10, y: 20, size: 4 };
    expect(markShows(rose, () => true)).toBe(true);
    for (const [x, y] of [[10, 20], [13, 23], [11, 22]] as const) expect(markShows(rose, (px, py) => !(px === x && py === y))).toBe(false);
    // a known square beside it does not matter
    expect(markShows(rose, (px, py) => !(px === 14 && py === 20) && !(px === 9 && py === 19))).toBe(true);
  });
});
