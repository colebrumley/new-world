// The Colonial Score (F10, and the closing screen of a game): the terms of the score, the
// rating, and what posterity has named after the player. Rules in docs/RULES.md "Score".
import { SCORE } from '../../engine/data/score';
import { honourFor, ratingOf, scoreOf } from '../../engine/score';
import type { GameState, PlayerId } from '../../engine/state';
import type { Report, ReportSection } from '../report';

export function scoreReport(state: GameState, playerId: PlayerId, extra: readonly ReportSection[] = []): Report {
  const s = scoreOf(state, playerId);
  const rating = ratingOf(state.difficulty, s.total);
  const player = state.players.find((p) => p.id === playerId);
  const rows: string[][] = [
    ['Specialists', String(s.experts), String(SCORE.expert * s.experts)],
    ['Free colonists', String(s.free), String(SCORE.free * s.free)],
    ['Servants, criminals and converts', String(s.lowly), String(SCORE.lowly * s.lowly)],
    ['Founding Fathers', String(player?.fathers.length ?? 0), String(s.fathers)],
    ['Treasury', `${player?.gold ?? 0} gold`, String(s.gold)],
    ['Rebel sentiment', `${s.sentiment}%`, String(s.sentiment)],
  ];
  if (s.natives !== 0) rows.push(['Native settlements destroyed', String(player?.villagesBurned ?? 0), String(s.natives)]);
  if (s.early > 0) rows.push([`Independence declared before ${SCORE.earlyBefore}`, '', String(s.early)]);
  if (s.bells > 0) rows.push(['Liberty bells since the intervention', '', String(s.bells)]);
  if (s.bonusPercent > 0) rows.push(['Independence won', `+${s.bonusPercent}%`, String(s.total - s.subtotal)]);
  rows.push(['Total', '', String(s.total)]);
  const honour = honourFor(rating.rank);
  return {
    id: 'score',
    title: 'Colonial Score',
    sections: [
      { heading: 'Score', rows },
      {
        heading: 'Colonial rating',
        rows: [['Rating', `${rating.percent}%`], [honour ? `Posterity has named ${honour} after you.` : 'Nothing has been named after you. Not yet.']],
      },
      ...extra,
    ],
  };
}
