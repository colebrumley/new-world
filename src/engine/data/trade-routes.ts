// Trade route limits (R-311).
export const TRADE_ROUTES = {
  maxRoutes: 12,
  maxStops: 4,
  maxCargoesPerList: 6,
  /** Default route names are the first stop's name plus one of these. */
  nameSuffixes: ['Run', 'Ferry', 'Cargo', 'Transport', 'Triangle'],
} as const;
