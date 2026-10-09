// Movement rule numbers (R-201; docs/RULES.md "Movement"). Costs are in thirds of a move
// (state.MOVE_THIRDS = 3).
export const MOVEMENT = {
  /** Stepping between two tiles that both have a road (a colony counts as a road). */
  roadCost: 1,
  /** Stepping straight (not diagonally) between two tiles that both have a river. */
  riverCost: 1,
  /** Entering a square that holds a settlement never costs more than this. */
  settlementCap: 3,
  /** Every ship step. */
  shipCost: 3,
  /** With this Founding Father every ship moves this much farther each turn. */
  shipBonusFather: 'ferdinandMagellan',
  shipBonusMoves: 1,
  /** Stepping from a colony onto a ship lying alongside. */
  boardFromColonyCost: 3,
} as const;
