// Seeded value noise for the map generator: a random lattice, smooth interpolation, octaves.
import type { Rng } from '../rng';

export type Field = (x: number, y: number) => number;

const smooth = (t: number): number => t * t * (3 - 2 * t);

/** Value noise in [0, 1) with one lattice point every `cell` tiles. */
export function valueNoise(rng: Rng, width: number, height: number, cell: number): Field {
  const cols = Math.ceil(width / cell) + 2;
  const rows = Math.ceil(height / cell) + 2;
  const lattice: number[] = [];
  for (let i = 0; i < cols * rows; i++) lattice.push(rng.next());
  const at = (cx: number, cy: number): number => lattice[cy * cols + cx] ?? 0;
  return (x, y) => {
    const fx = x / cell;
    const fy = y / cell;
    const cx = Math.floor(fx);
    const cy = Math.floor(fy);
    const tx = smooth(fx - cx);
    const ty = smooth(fy - cy);
    const top = at(cx, cy) * (1 - tx) + at(cx + 1, cy) * tx;
    const bottom = at(cx, cy + 1) * (1 - tx) + at(cx + 1, cy + 1) * tx;
    return top * (1 - ty) + bottom * ty;
  };
}

/** Sum of octaves, each half the cell size and half the weight of the last; result in [0, 1). */
export function fractalNoise(rng: Rng, width: number, height: number, cell: number, octaves: number): Field {
  const layers: { field: Field; weight: number }[] = [];
  let weight = 1;
  let total = 0;
  let size = cell;
  for (let i = 0; i < octaves && size >= 1; i++) {
    layers.push({ field: valueNoise(rng, width, height, size), weight });
    total += weight;
    weight /= 2;
    size /= 2;
  }
  return (x, y) => {
    let sum = 0;
    for (const layer of layers) sum += layer.field(x, y) * layer.weight;
    return sum / total;
  };
}
