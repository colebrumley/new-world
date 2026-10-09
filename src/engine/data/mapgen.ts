// Tunables for the random "New World" generator (R-102). The original's generator is not
// documented in its data files; these are our own values, logged as derived in FIDELITY.md.

/** Whole grid including the 1-tile border nobody can enter; 56x70 is playable (as AMER2.MP). */
export const MAP_WIDTH = 58;
export const MAP_HEIGHT = 72;

export const LAND_MASS_OPTIONS = ['small', 'normal', 'large'] as const;
export const LAND_FORM_OPTIONS = ['archipelago', 'normal', 'continents'] as const;
export const TEMPERATURE_OPTIONS = ['cool', 'temperate', 'warm'] as const;
export const CLIMATE_OPTIONS = ['arid', 'normal', 'wet'] as const;

export interface WorldOptions {
  readonly landMass: (typeof LAND_MASS_OPTIONS)[number];
  readonly landForm: (typeof LAND_FORM_OPTIONS)[number];
  readonly temperature: (typeof TEMPERATURE_OPTIONS)[number];
  readonly climate: (typeof CLIMATE_OPTIONS)[number];
}

export const DEFAULT_WORLD: WorldOptions = { landMass: 'normal', landForm: 'normal', temperature: 'temperate', climate: 'normal' };

export const MAPGEN = {
  /** Share of the playable area that is (non-arctic) land. */
  landRatio: { small: 0.17, normal: 0.25, large: 0.33 },
  /** Tolerance the tests allow around landRatio. */
  landRatioTolerance: 0.04,
  /** Noise lattice spacing in tiles: small cells break the land up, large cells merge it. */
  landFormCell: { archipelago: 7, normal: 11, continents: 17 },
  /** MAPEDIT warns above 15 continents. The two polar caps count, so the rest get 13. */
  maxLandMasses: 15,
  maxNonPolarMasses: 13,
  /** Sea Lane columns counted from each playable edge. */
  westLaneColumns: 3,
  eastLaneColumns: 7,
  /** Sea Lane never comes closer than this to land. */
  laneLandGap: 2,
  /** Inland water bodies larger than this are filled in. */
  maxLakeTiles: 6,
  forestRatio: 0.6,
  /** Added to the 0..1 warmth of every tile. */
  temperatureShift: { cool: -0.12, temperate: 0, warm: 0.12 },
  /** Added to the 0..1 moisture of every tile, and to the forest share. */
  moistureShift: { arid: -0.15, normal: 0, wet: 0.15 },
  forestShift: { arid: -0.1, normal: 0, wet: 0.1 },
  mountainRatio: 0.04,
  hillRatio: 0.09,
  /** One river source per this many land tiles. */
  landPerRiver: 55,
  majorRiverChance: 0.25,
  /** Chance that a legal land tile / coastal ocean tile carries a special resource. */
  landResourceChance: 0.07,
  fisheryChance: 0.03,
  rumorsMin: 10,
  rumorsMax: 25,
  landPerRumor: 45,
} as const;
