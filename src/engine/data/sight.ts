// How far units see, in tiles (Chebyshev distance). R-200 attaches these to the unit table.
export const SIGHT = {
  /** Every unit not listed below. */
  default: 1,
  /** Unit types that see farther: scouts (seasoned or not) and three of the ships. */
  extended: 2,
  extendedUnits: ['scout', 'galleon', 'privateer', 'frigate'],
  /** Hernando de Soto lengthens every unit's sight by this much. */
  deSoto: 'hernandoDeSoto',
  deSotoBonus: 1,
  /** Foreign units are shown only within this distance of one of your own. */
  foreignUnitRange: 1,
} as const;
