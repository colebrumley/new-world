// Trade route limits (R-311). The cap is the constant the original compares against before
// refusing a new route; stops and cargo lists are the manual's (p.28).
export const TRADE_ROUTES = {
  maxRoutes: 12,
  maxStops: 4,
  maxCargoesPerList: 6,
  /** Default route names are the first stop's name plus one of these (GAME.TXT @TRADENAMES). */
  nameSuffixes: ['Run', 'Ferry', 'Cargo', 'Transport', 'Triangle'],
} as const;
