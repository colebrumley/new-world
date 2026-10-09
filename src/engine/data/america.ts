// The "America" scenario: our own low-resolution coastline of the Americas, plus the tribe
// sites and European starting points the original lists for its 56x70 map.
// All coordinates here are playable coordinates (0..55, 0..69); add 1 for the bordered grid.
// The coastline is hand-drawn for this project around those published anchor points. It is not
// derived from the original map file.

type Span = readonly [number, number];

/** Land spans [x0, x1] (inclusive) for each row, north to south. Rows not listed are open sea. */
export const AMERICA_COAST: Readonly<Record<number, readonly Span[]>> = {
  1: [[0, 20], [45, 51]],
  2: [[0, 21], [29, 38], [44, 52]],
  3: [[0, 21], [28, 39], [45, 51]],
  4: [[0, 22], [27, 38], [46, 49]],
  5: [[0, 21], [26, 37]],
  6: [[0, 22], [25, 36]],
  7: [[0, 24], [26, 35], [38, 39]],
  8: [[0, 34], [38, 40]],
  9: [[0, 33]],
  10: [[0, 33]],
  11: [[0, 21], [24, 32], [34, 35]],
  12: [[0, 23], [25, 32]],
  13: [[0, 31]],
  14: [[0, 31]],
  15: [[0, 30]],
  16: [[0, 30]],
  17: [[1, 29]],
  18: [[1, 29]],
  19: [[2, 29]],
  20: [[3, 28]],
  21: [[4, 28]],
  22: [[5, 28]],
  23: [[6, 19], [26, 28]],
  24: [[7, 18], [27, 28]],
  25: [[8, 18], [27, 28], [30, 33]],
  26: [[9, 18], [30, 34]],
  27: [[10, 19], [23, 24], [31, 35]],
  28: [[11, 20], [22, 25], [36, 38]],
  29: [[13, 25], [36, 39]],
  30: [[15, 25], [41, 41], [45, 45]],
  31: [[18, 25]],
  32: [[21, 26], [46, 46]],
  33: [[23, 27]],
  34: [[25, 28], [46, 46]],
  35: [[26, 33], [36, 40], [46, 46]],
  36: [[27, 44]],
  37: [[27, 46]],
  38: [[27, 47]],
  39: [[26, 48]],
  40: [[26, 49]],
  41: [[26, 50]],
  42: [[26, 51]],
  43: [[26, 52]],
  44: [[27, 53]],
  45: [[27, 53]],
  46: [[28, 53]],
  47: [[28, 52]],
  48: [[29, 52]],
  49: [[29, 51]],
  50: [[30, 51]],
  51: [[30, 50]],
  52: [[31, 50]],
  53: [[31, 49]],
  54: [[32, 48]],
  55: [[32, 47]],
  56: [[32, 46]],
  57: [[32, 45]],
  58: [[32, 44]],
  59: [[33, 43]],
  60: [[33, 42]],
  61: [[33, 41]],
  62: [[33, 40]],
  63: [[33, 39]],
  64: [[33, 38]],
  65: [[34, 37]],
  66: [[34, 37]],
  67: [[34, 36]],
};

export const AMERICA_TRIBES = ['inca', 'aztec', 'arawak', 'iroquois', 'cherokee', 'apache', 'sioux', 'tupi'] as const;
export type AmericaTribe = (typeof AMERICA_TRIBES)[number];

type Point = readonly [number, number];

/** Settlement sites per tribe, from TRIBE.TXT (one site listed under two tribes is kept once). */
export const AMERICA_TRIBE_SITES = {
  iroquois: [[27, 15], [30, 11], [23, 15], [19, 14], [25, 10], [16, 10], [15, 6], [20, 8], [25, 6], [29, 6], [36, 6]],
  cherokee: [[25, 20], [28, 23], [22, 18], [21, 21]],
  arawak: [[37, 29], [32, 25], [31, 27], [45, 30], [46, 35]],
  inca: [[36, 52], [35, 66], [35, 60], [37, 56], [27, 43]],
  sioux: [[10, 8], [13, 3], [8, 4], [3, 1], [4, 8], [13, 12], [4, 13]],
  apache: [[16, 15], [4, 17], [7, 15], [12, 16], [17, 19], [13, 20], [17, 23]],
  aztec: [[17, 27], [12, 24], [24, 28], [26, 34]],
  tupi: [
    [47, 45], [41, 59], [44, 56], [48, 52], [50, 48], [31, 35], [34, 39], [37, 36],
    [42, 38], [46, 41], [52, 44], [44, 52], [39, 42], [45, 48], [42, 45],
  ],
} as const satisfies Record<AmericaTribe, readonly Point[]>;

/** Region box per tribe: x0, y0, x1, y1 inclusive (Appendix D). */
export const AMERICA_TRIBE_REGIONS = {
  inca: [27, 43, 37, 66],
  aztec: [12, 24, 26, 34],
  arawak: [31, 25, 46, 35],
  iroquois: [15, 6, 36, 15],
  cherokee: [21, 18, 28, 23],
  apache: [4, 15, 17, 23],
  sioux: [3, 1, 13, 13],
  tupi: [26, 34, 52, 59],
} as const satisfies Record<AmericaTribe, readonly [number, number, number, number]>;

/** Where each power's first ship appears, from NAMES.TXT @SCENARIO AMER2, in nation order. */
export const AMERICA_STARTS = {
  england: [34, 20],
  france: [39, 10],
  spain: [47, 61],
  netherlands: [50, 33],
} as const satisfies Record<string, Point>;

/** Row of the equator on this map (mouth of the Amazon). */
export const AMERICA_EQUATOR_ROW = 40;

/** Moisture nudges by box: x0, y0, x1, y1, delta. Later boxes add to earlier ones. */
export const AMERICA_MOISTURE: readonly (readonly [number, number, number, number, number])[] = [
  [2, 14, 18, 26, -0.45], // south-western deserts and northern Mexico
  [3, 2, 15, 13, -0.15], // great plains
  [33, 36, 50, 48, 0.35], // Amazon basin
  [20, 24, 46, 35, 0.15], // Caribbean and Central America
  [26, 46, 35, 58, -0.3], // dry Pacific strip and Patagonia
];

/** Forest nudges by box, same layout: open prairie on the plains, dense jungle on the Amazon. */
export const AMERICA_FOREST: readonly (readonly [number, number, number, number, number])[] = [
  [5, 3, 15, 14, -0.5],
  [33, 36, 50, 48, 0.3],
  [18, 6, 33, 22, 0.15], // eastern woodlands
];
