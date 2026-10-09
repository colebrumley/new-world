// The Foreign Affairs report (F8): which powers are at war and which at peace, and, once Jan de Witt sits in the
// Congress, how the colonial powers compare. Rules in docs/RULES.md "Foreign Affairs report".
import { NATIONS } from '../../engine/data/nations';
import { UNIT_TYPES } from '../../engine/data/units';
import type { GameState, Player, PlayerId } from '../../engine/state';
import type { Report } from '../report';

export interface PowerSummary {
  readonly colonies: number;
  readonly population: number;
  /** Colonists per colony, to one decimal place. */
  readonly averageSize: number;
  /** Attack values of its armed land units. */
  readonly military: number;
  /** Attack values of its ships. */
  readonly naval: number;
  /** Cargo holds afloat. */
  readonly merchant: number;
}

export function powerSummary(state: GameState, playerId: PlayerId): PowerSummary {
  const colonies = Object.values(state.colonies).filter((c) => c.owner === playerId);
  const population = colonies.reduce((n, c) => n + c.colonists.length, 0);
  let military = 0;
  let naval = 0;
  let merchant = 0;
  for (const unit of Object.values(state.units)) {
    if (unit.owner !== playerId) continue;
    const type = UNIT_TYPES[unit.type];
    if (type.domain === 'sea') {
      naval += type.attack;
      merchant += type.holds;
    } else if (type.attack > 1) military += type.attack;
  }
  return { colonies: colonies.length, population, averageSize: colonies.length === 0 ? 0 : Math.round((10 * population) / colonies.length) / 10, military, naval, merchant };
}

const relation = (a: Player, b: Player): string => (a.id === b.id ? '-' : a.stance[b.id] === 'war' ? 'War' : a.stance[b.id] === 'peace' ? 'Peace' : 'No contact');

/** The report, or null once the viewer has declared independence: the adviser has nothing to say then. */
export function foreignAffairsReport(state: GameState, playerId: PlayerId): Report | null {
  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.atWar) return null;
  const powers = state.players.filter((p) => !p.withdrawn);
  const name = (p: Player): string => `${NATIONS[p.nation].name}${p.independent ? ' (independent)' : ''}`;
  const sections: Report['sections'][number][] = [
    {
      heading: 'War and peace',
      rows: [['', ...powers.map((p) => NATIONS[p.nation].abbreviation)], ...powers.map((p) => [name(p), ...powers.map((q) => relation(p, q))])],
    },
  ];
  if (player.fathers.includes('janDeWitt')) {
    sections.push({
      heading: 'The powers compared',
      rows: [
        ['', 'Colonies', 'Population', 'Average colony', 'Military', 'Naval', 'Merchant marine'],
        ...powers.map((p) => {
          const s = powerSummary(state, p.id);
          return [name(p), String(s.colonies), String(s.population), s.averageSize.toFixed(1), String(s.military), String(s.naval), String(s.merchant)];
        }),
      ],
    });
  } else sections.push({ heading: 'The powers compared', rows: [], empty: 'Our adviser knows little of the other powers\' colonies. A Congress with Jan de Witt in it would be better informed.' });
  return { id: 'foreign', title: 'Foreign Affairs', sections };
}
