// Turn counter to calendar date. One turn per year from 1492 to 1600, then two per year,
// Spring and Autumn.
export const CALENDAR = {
  startYear: 1492,
  /** From this year on there are two turns per year. */
  twoSeasonsFrom: 1600,
  /** From this year on, a player with no colonies loses the royal charter. */
  charterYear: 1600,
  /** The game ends (and is scored) in this year unless a War of Independence is being fought. */
  retireYear: 1800,
  /** A War of Independence not won by this year is lost. */
  warLimitYear: 1850,
} as const;

export type Season = 'spring' | 'autumn';

export interface GameDate {
  readonly year: number;
  /** Null while the game still runs one turn per year. */
  readonly season: Season | null;
}

export function dateOfTurn(turn: number): GameDate {
  const yearly = CALENDAR.twoSeasonsFrom - CALENDAR.startYear;
  if (turn < yearly) return { year: CALENDAR.startYear + turn, season: null };
  const half = turn - yearly;
  return { year: CALENDAR.twoSeasonsFrom + Math.floor(half / 2), season: half % 2 === 0 ? 'spring' : 'autumn' };
}

export function formatDate(date: GameDate): string {
  if (date.season === null) return String(date.year);
  return `${date.season === 'spring' ? 'Spring' : 'Autumn'} ${date.year}`;
}

/** First turn that falls in the given year. */
export function firstTurnOfYear(year: number): number {
  if (year <= CALENDAR.twoSeasonsFrom) return year - CALENDAR.startYear;
  return CALENDAR.twoSeasonsFrom - CALENDAR.startYear + (year - CALENDAR.twoSeasonsFrom) * 2;
}
