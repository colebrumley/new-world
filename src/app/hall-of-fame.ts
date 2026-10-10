// The Hall of Fame: the best finished games, kept in the browser. An entry records who, when,
// how hard, how it ended, and the score with its rating.
import { dateOfTurn, formatDate } from '../engine/calendar';
import { NATIONS, type NationId } from '../engine/data/nations';
import { HONOURS } from '../engine/data/score';
import { ratingOf, scoreOf, wonIndependence } from '../engine/score';
import type { GameState, PlayerId } from '../engine/state';
import type { Report, ReportSection } from '../ui/report';

export const HALL_KEY = 'new-world:hall-of-fame';
const HALL_SIZE = 10;

export interface HallEntry {
  /** Which game this was, so that a finished game reloaded is not entered twice. */
  readonly game: string;
  readonly leader: string;
  readonly nation: NationId;
  readonly declared: boolean;
  readonly won: boolean;
  readonly date: string;
  readonly difficulty: GameState['difficulty'];
  readonly score: number;
  readonly rating: number;
  readonly rank: number | null;
}

export function entryFor(state: GameState, playerId: PlayerId): HallEntry | null {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return null;
  const score = scoreOf(state, playerId).total;
  const rating = ratingOf(state.difficulty, score);
  return {
    game: `${String(state.seed)}:${state.turn}:${state.over?.reason ?? 'playing'}`,
    leader: NATIONS[player.nation].leader,
    nation: player.nation,
    declared: player.revolution !== null,
    won: wonIndependence(state, playerId),
    date: formatDate(dateOfTurn(state.turn)),
    difficulty: state.difficulty,
    score,
    rating: rating.percent,
    rank: rating.rank,
  };
}

/** The list with `entry` in its place: best rating first, then best score; the same game is never entered twice. */
export function withEntry(hall: readonly HallEntry[], entry: HallEntry): HallEntry[] {
  if (hall.some((e) => e.game === entry.game)) return [...hall];
  return [...hall, entry].sort((a, b) => b.rating - a.rating || b.score - a.score).slice(0, HALL_SIZE);
}

const isEntry = (raw: unknown): raw is HallEntry =>
  typeof raw === 'object' && raw !== null && typeof (raw as HallEntry).game === 'string' && typeof (raw as HallEntry).score === 'number' && typeof (raw as HallEntry).rating === 'number' && (raw as HallEntry).nation in NATIONS;

export function readHall(): HallEntry[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(HALL_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter(isEntry) : [];
  } catch {
    return [];
  }
}

/** Enter a finished game and return the Hall as it now stands. */
export function recordGame(state: GameState, playerId: PlayerId): HallEntry[] {
  const entry = entryFor(state, playerId);
  const hall = entry ? withEntry(readHall(), entry) : readHall();
  try {
    localStorage.setItem(HALL_KEY, JSON.stringify(hall));
  } catch {
    // a full or forbidden store only means the Hall is not kept
  }
  return hall;
}

const LEVEL: Readonly<Record<GameState['difficulty'], string>> = { discoverer: 'Discoverer', explorer: 'Explorer', conquistador: 'Conquistador', governor: 'Governor', viceroy: 'Viceroy' };

export function hallSection(hall: readonly HallEntry[]): ReportSection {
  return {
    heading: 'Hall of Fame',
    columns: true,
    rows: hall.length === 0 ? [] : [
      ['', 'Leader', 'Level', 'Ended', 'Score', 'Rating', 'Remembered by'],
      ...hall.map((e, i) => [
        String(i + 1),
        `${e.leader} of ${NATIONS[e.nation].name}${e.won ? ', liberator' : e.declared ? ', rebel' : ''}`,
        LEVEL[e.difficulty],
        e.date,
        String(e.score),
        `${e.rating}%`,
        e.rank === null ? '-' : HONOURS[Math.min(e.rank, HONOURS.length - 1)] ?? '-',
      ]),
    ],
    empty: 'No game has been finished yet.',
  };
}

export function hallReport(hall: readonly HallEntry[]): Report {
  return { id: 'hall', title: 'Hall of Fame', sections: [hallSection(hall)] };
}
