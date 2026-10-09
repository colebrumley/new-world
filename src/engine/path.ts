// A* over the 8-connected tile grid. The caller supplies the step cost, so the same search
// serves land units, ships and the AI.
import type { GameMap } from './state';

export type StepCost = (fromX: number, fromY: number, toX: number, toY: number) => number | null;

export interface PathOptions {
  /** Smallest possible step cost, for the heuristic. Must not exceed any real step cost. */
  readonly minStep: number;
  /** Give up after expanding this many tiles. */
  readonly maxExpanded?: number;
}

export interface Path {
  /** Tiles to step through, excluding the start, including the goal. */
  readonly steps: readonly (readonly [number, number])[];
  readonly cost: number;
}

const DIRS: readonly (readonly [number, number])[] = [[0, -1], [1, 0], [0, 1], [-1, 0], [-1, -1], [1, -1], [1, 1], [-1, 1]];

// Binary min-heap of tile indices keyed by an external priority array.
function push(heap: number[], priority: Float64Array, item: number): void {
  heap.push(item);
  let i = heap.length - 1;
  while (i > 0) {
    const parent = (i - 1) >> 1;
    if ((priority[heap[parent] as number] as number) <= (priority[item] as number)) break;
    heap[i] = heap[parent] as number;
    i = parent;
  }
  heap[i] = item;
}

function pop(heap: number[], priority: Float64Array): number {
  const top = heap[0] as number;
  const last = heap.pop() as number;
  if (heap.length > 0) {
    let i = 0;
    for (;;) {
      let child = 2 * i + 1;
      if (child >= heap.length) break;
      if (child + 1 < heap.length && (priority[heap[child + 1] as number] as number) < (priority[heap[child] as number] as number)) child++;
      if ((priority[last] as number) <= (priority[heap[child] as number] as number)) break;
      heap[i] = heap[child] as number;
      i = child;
    }
    heap[i] = last;
  }
  return top;
}

/** Cheapest path from (sx, sy) to (gx, gy), or null if there is none. */
export function findPath(map: GameMap, sx: number, sy: number, gx: number, gy: number, stepCost: StepCost, options: PathOptions): Path | null {
  const { width, height } = map;
  const n = width * height;
  const start = sy * width + sx;
  const goal = gy * width + gx;
  if (start === goal) return { steps: [], cost: 0 };

  const g = new Float64Array(n).fill(Infinity);
  const f = new Float64Array(n).fill(Infinity);
  const cameFrom = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const heuristic = (i: number): number => Math.max(Math.abs((i % width) - gx), Math.abs(Math.floor(i / width) - gy)) * options.minStep;

  g[start] = 0;
  f[start] = heuristic(start);
  const open: number[] = [];
  push(open, f, start);
  let expanded = 0;
  const limit = options.maxExpanded ?? n;

  while (open.length > 0) {
    const current = pop(open, f);
    if (closed[current]) continue;
    if (current === goal) break;
    closed[current] = 1;
    if (++expanded > limit) return null;
    const cx = current % width;
    const cy = (current - cx) / width;
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const next = ny * width + nx;
      if (closed[next]) continue;
      const step = stepCost(cx, cy, nx, ny);
      if (step === null) continue;
      const tentative = (g[current] as number) + step;
      if (tentative < (g[next] as number)) {
        g[next] = tentative;
        cameFrom[next] = current;
        f[next] = tentative + heuristic(next);
        push(open, f, next);
      }
    }
  }

  if (cameFrom[goal] === -1) return null;
  const steps: [number, number][] = [];
  for (let i = goal; i !== start; i = cameFrom[i] as number) steps.push([i % width, Math.floor(i / width)]);
  steps.reverse();
  return { steps, cost: g[goal] as number };
}
