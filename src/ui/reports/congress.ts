// The Continental Congress report (F3): who sits in it, whom it is working toward and how far
// along it is, how the colonies feel, and what the Crown holds ready.
import { fatherCost } from '../../engine/congress';
import { FATHER_CATEGORIES, FATHERS, type FatherCategory } from '../../engine/data/fathers';
import { rebelSentiment } from '../../engine/liberty';
import type { GameState, PlayerId } from '../../engine/state';
import type { Report } from '../report';

const FIELD: Readonly<Record<FatherCategory, string>> = { trade: 'Trade', exploration: 'Exploration', military: 'Military', political: 'Political', religious: 'Religious' };

export function congressReport(state: GameState, playerId: PlayerId): Report {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return { id: 'congress', title: 'Continental Congress', sections: [] };
  const cost = fatherCost(state, playerId);
  const rebels = rebelSentiment(state, playerId);
  const session: string[][] = [];
  const seated = FATHER_CATEGORIES.flatMap((category) => player.fathers.filter((id) => FATHERS[id].category === category));
  if (player.atWar) session.push(['Independence is declared. The Congress seeks no more members; its bells now speak to the powers of Europe.']);
  else if (player.candidate) {
    const left = Math.max(0, cost - player.fatherBells);
    session.push(['Next to be seated', FATHERS[player.candidate].name, FATHERS[player.candidate].effect]);
    session.push(['Liberty bells', `${player.fatherBells} of ${cost}`, left === 0 ? 'He joins when the next bells are rung.' : `${left} more needed`]);
  } else if (player.fatherOffer.length > 0) session.push(['The Congress awaits our choice of whom to seek next.']);
  else session.push(['No candidate has been named yet: the Congress meets when the first bells are rung.'], ['Liberty bells', `${player.fatherBells} of ${cost}`]);

  const force = player.ref;
  return {
    id: 'congress',
    title: 'Continental Congress',
    sections: [
      {
        heading: `Members (${player.fathers.length} of 25)`,
        rows: seated.map((id) => [FATHERS[id].name, FIELD[FATHERS[id].category], FATHERS[id].effect]),
        portraits: seated,
        empty: 'No Founding Father has joined the Congress yet.',
      },
      { heading: 'Next session', rows: session, portraits: [player.atWar ? null : player.candidate] },
      {
        heading: 'Rebel sentiment',
        rows: [
          ['Sons of Liberty', `${rebels}%`, rebels >= 50 ? 'Enough of our people would back a declaration of independence.' : 'Half our people must be with us before independence can be declared.'],
          ['Tories', `${100 - rebels}%`],
        ],
      },
      {
        heading: 'Royal Expeditionary Force',
        rows: [['Regulars', String(force.regulars)], ['Cavalry', String(force.cavalry)], ['Artillery', String(force.artillery)], ['Men-of-War', String(force.ships)]],
      },
    ],
  };
}
