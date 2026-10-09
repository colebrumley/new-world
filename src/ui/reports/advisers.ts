// The advisers (R-1000): Terrain Information (F1), Religious (F2), Labor (F4), Economic (F5),
// Colony (F6), Naval (F7) and Indian (F9). Each is a plain Report built from the state; rows
// about a place carry its square so the screen can go there.
import { attitude, settlementAlarm } from '../../engine/alarm';
import { coloniesOf } from '../../engine/colony';
import { BUILDINGS } from '../../engine/data/buildings';
import { GOOD_IDS, GOOD_NAMES, type GoodId } from '../../engine/data/goods';
import { PROFESSION_IDS, PROFESSIONS, type ProfessionId } from '../../engine/data/professions';
import { RAW_GOODS, TERRAIN, TERRAIN_IDS } from '../../engine/data/terrain';
import { TRIBE_IDS, TRIBES } from '../../engine/data/tribes';
import { UNIT_TYPES } from '../../engine/data/units';
import { colonyProduction } from '../../engine/economy';
import { crossesNeeded } from '../../engine/immigration';
import { solPercent } from '../../engine/liberty';
import { askPrice, bidPrice, isBoycotted } from '../../engine/market';
import { colonyAt, type Colony, type GameState, type PlayerId, type Unit } from '../../engine/state';
import { isExploredBy } from '../../engine/tile';
import type { Report } from '../report';

type Spot = readonly [number, number] | null;
const title = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
const goodName = (good: GoodId): string => (GOOD_NAMES as Readonly<Record<string, string>>)[good] ?? title(good);
const onMap = (u: Unit): boolean => u.voyage === null;

/** F1: what each kind of land is worth, straight from the terrain table. */
export function terrainReport(): Report {
  const header = ['Terrain', 'Move', 'Defence', ...RAW_GOODS.map(title)];
  const rows = (kind: 'open' | 'forest' | 'other'): string[][] => [
    header,
    ...TERRAIN_IDS.filter((id) => TERRAIN[id].kind === kind).map((id) => {
      const t = TERRAIN[id];
      return [t.name, String(t.moveCost), t.defense === 0 ? '-' : `+${25 * t.defense}%`, ...RAW_GOODS.map((g) => (t.yields[g] === 0 ? '-' : String(t.yields[g])))];
    }),
  ];
  return {
    id: 'terrain',
    title: 'Terrain Information',
    sections: [
      { heading: 'Open land', rows: rows('open') },
      { heading: 'Forest', rows: rows('forest') },
      { heading: 'Other', rows: rows('other') },
      { heading: 'Notes', rows: [['Yields are what a free colonist brings in from an unimproved square; experts, plowing, rivers, roads and special resources add to them.']] },
    ],
  };
}

/** F2: crosses and who is waiting to come over; the missions. */
export function religiousReport(state: GameState, playerId: PlayerId): Report {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return { id: 'religion', title: 'Religious Adviser', sections: [] };
  const mine = coloniesOf(state, playerId);
  const perTurn = mine.reduce((n, c) => n + colonyProduction(state, c).produced.crosses, 0);
  const needed = crossesNeeded(state, playerId);
  const left = Math.max(0, needed - player.crosses);
  const missions = Object.values(state.settlements).filter((s) => s.mission?.owner === playerId);
  return {
    id: 'religion',
    title: 'Religious Adviser',
    sections: [
      {
        heading: 'Religious unrest in Europe',
        rows: player.atWar
          ? [['Nobody crosses from Europe while the war lasts.']]
          : [
            ['Crosses', `${player.crosses} of ${needed}`, left === 0 ? 'The next immigrant is due.' : perTurn > 0 ? `${left} more needed: about ${Math.ceil(left / perTurn)} turns` : `${left} more needed`],
            ['Crosses each turn', String(perTurn)],
          ],
      },
      { heading: 'Waiting on the docks to come over', rows: player.pool.map((p) => [PROFESSIONS[p].name]), empty: 'Nobody is waiting.' },
      {
        heading: `Missions (${missions.length})`,
        rows: missions.map((s) => [`${TRIBES[s.tribe].adjective} ${s.capital ? 'capital' : 'settlement'}`, `(${s.x}, ${s.y})`, s.mission?.expert ? 'Jesuit mission' : 'Mission']),
        zoom: missions.map((s): Spot => [s.x, s.y]),
        empty: 'We keep no mission among the native peoples.',
      },
    ],
  };
}

/** F4: how many of each occupation we have, and where. */
export function laborReport(state: GameState, playerId: PlayerId): Report {
  const mine = coloniesOf(state, playerId);
  const rows: string[][] = [];
  const zoom: Spot[] = [];
  let total = 0;
  for (const profession of PROFESSION_IDS) {
    const homes = mine.map((c) => ({ c, n: c.colonists.filter((p) => p.profession === profession).length })).filter((h) => h.n > 0).sort((a, b) => b.n - a.n);
    const afield = Object.values(state.units).filter((u) => u.owner === playerId && u.profession === profession && UNIT_TYPES[u.type].domain === 'land');
    const inColonies = homes.reduce((n, h) => n + h.n, 0);
    if (inColonies + afield.length === 0) continue;
    total += inColonies + afield.length;
    const where = [...homes.map((h) => `${h.c.name} ${h.n}`), ...(afield.length > 0 ? [`outside colonies ${afield.length}`] : [])].join(', ');
    rows.push([count(profession, inColonies + afield.length), String(inColonies + afield.length), where]);
    const first = homes[0]?.c ?? afield.find(onMap);
    zoom.push(first ? [first.x, first.y] : null);
  }
  return {
    id: 'labor',
    title: 'Labor Adviser',
    sections: [{ heading: `Colonists by occupation (${total})`, rows: rows.length > 0 ? [['Occupation', 'Number', 'Where'], ...rows] : [], zoom: [null, ...zoom], empty: 'We have no colonists in the New World.' }],
  };
}
const count = (profession: ProfessionId, n: number): string => (n === 1 ? PROFESSIONS[profession].name : PROFESSIONS[profession].plural);

/** F5: the market in Europe as it stands for us, and what we hold. */
export function economicReport(state: GameState, playerId: PlayerId): Report {
  const player = state.players.find((p) => p.id === playerId);
  const market = state.market.powers[playerId];
  if (!player || !market) return { id: 'economy', title: 'Economic Adviser', sections: [] };
  const mine = coloniesOf(state, playerId);
  const held = (good: GoodId): number => mine.reduce((n, c) => n + (c.goods[good] ?? 0), 0) + Object.values(state.units).reduce((n, u) => n + (u.owner === playerId ? u.cargo[good] ?? 0 : 0), 0);
  const making = (good: GoodId): number => mine.reduce((n, c) => n + (colonyProduction(state, c).delta[good] ?? 0), 0);
  return {
    id: 'economy',
    title: 'Economic Adviser',
    sections: [
      {
        heading: 'Treasury',
        rows: [['Gold', String(player.gold)], ['Tax rate', player.atWar ? 'none: we pay the Crown nothing' : `${player.taxRate}%`], ['Boycotts', player.boycotts.length === 0 ? 'none' : player.boycotts.map(goodName).join(', ')]],
      },
      {
        heading: 'Trade with Europe',
        rows: [
          ['Cargo', 'Europe pays', 'Europe asks', 'Net sold to date', 'In our stores and holds', 'Change each turn'],
          ...GOOD_IDS.map((good) => {
            const net = market.netSold[good] ?? 0;
            const change = making(good);
            return [goodName(good), isBoycotted(state, playerId, good) ? 'boycott' : String(bidPrice(state, playerId, good)), String(askPrice(state, playerId, good)), String(net), String(held(good)), change > 0 ? `+${change}` : String(change)];
          }),
        ],
      },
    ],
  };
}

/** F6: every colony at a glance, and what lies in its warehouse. */
export function colonyReport(state: GameState, playerId: PlayerId): Report {
  const mine = coloniesOf(state, playerId);
  const where = mine.map((c): Spot => [c.x, c.y]);
  const building = (c: Colony): string => (!c.construction ? 'nothing' : c.construction.kind === 'unit' ? UNIT_TYPES[c.construction.unit].name : BUILDINGS[c.construction.id].name);
  return {
    id: 'colonies',
    title: 'Colony Adviser',
    sections: [
      {
        heading: `Colonies (${mine.length})`,
        rows: mine.length > 0 ? [['Colony', 'People', 'Sons of Liberty', 'Building', 'Units here'], ...mine.map((c) => [c.name, String(c.colonists.length), `${solPercent(state, c)}%`, building(c), String(Object.values(state.units).filter((u) => u.x === c.x && u.y === c.y && onMap(u)).length)])] : [],
        zoom: [null, ...where],
        empty: 'We have founded no colony yet.',
      },
      {
        heading: 'Warehouses',
        rows: mine.length > 0 ? [['Colony', ...GOOD_IDS.map((g) => goodName(g).slice(0, 4))], ...mine.map((c) => [c.name, ...GOOD_IDS.map((g) => ((c.goods[g] ?? 0) === 0 ? '-' : String(c.goods[g])))])] : [],
        zoom: [null, ...where],
        empty: 'Nothing is in store.',
      },
    ],
  };
}

/** F7: every ship, where she is, where she is bound and what she carries. */
export function navalReport(state: GameState, playerId: PlayerId): Report {
  const ships = Object.values(state.units).filter((u) => u.owner === playerId && UNIT_TYPES[u.type].domain === 'sea');
  const place = (u: Unit): string => {
    if (u.voyage) return u.voyage.phase === 'inEurope' ? 'in Europe' : u.voyage.phase === 'toEurope' ? `bound for Europe (${u.voyage.turnsLeft} turns)` : `bound for the New World (${u.voyage.turnsLeft} turns)`;
    const port = colonyAt(state, u.x, u.y);
    return port ? `in ${port.name}` : `at sea (${u.x}, ${u.y})`;
  };
  const bound = (u: Unit): string => {
    if (u.repair > 0) return `under repair, ${u.repair} turns`;
    if (u.route) return `trade route ${state.tradeRoutes[u.route.routeId]?.name ?? ''}`.trim();
    if (!u.destination) return '-';
    const port = colonyAt(state, u.destination[0], u.destination[1]);
    return port ? port.name : `(${u.destination[0]}, ${u.destination[1]})`;
  };
  const cargo = (u: Unit): string => {
    const goods = GOOD_IDS.filter((g) => (u.cargo[g] ?? 0) > 0).map((g) => `${u.cargo[g]} ${goodName(g).toLowerCase()}`);
    const riders = Object.values(state.units).filter((r) => r.aboard === u.id).map((r) => UNIT_TYPES[r.type].name);
    return [...goods, ...riders].join(', ') || 'empty';
  };
  return {
    id: 'naval',
    title: 'Naval Adviser',
    sections: [
      {
        heading: `Ships (${ships.length})`,
        rows: ships.length > 0 ? [['Ship', 'Where', 'Bound for', 'Carrying'], ...ships.map((u) => [UNIT_TYPES[u.type].name, place(u), bound(u), cargo(u)])] : [],
        zoom: [null, ...ships.map((u): Spot => (onMap(u) ? [u.x, u.y] : null))],
        empty: 'We have no ships.',
      },
    ],
  };
}

const ATTITUDE = ['content', 'restless', 'angry', 'hostile'] as const;

/** F9: the native peoples we have met, how they feel about us, and what we know of their settlements. */
export function indianReport(state: GameState, playerId: PlayerId): Report {
  const index = state.players.findIndex((p) => p.id === playerId);
  const rows: string[][] = [];
  const zoom: Spot[] = [];
  for (const tribe of TRIBE_IDS) {
    const t = state.tribes[tribe];
    if (!t || !t.met.includes(playerId)) continue;
    const all = Object.values(state.settlements).filter((s) => s.tribe === tribe);
    const known = all.filter((s) => {
      const tile = state.map.tiles[s.y * state.map.width + s.x];
      return tile !== undefined && isExploredBy(tile, index);
    });
    const capital = known.find((s) => s.capital) ?? known[0];
    const angriest = known.reduce((n, s) => Math.max(n, settlementAlarm(s, playerId)), 0);
    rows.push([
      TRIBES[tribe].name,
      t.peace.includes(playerId) ? 'at peace' : 'at war',
      ATTITUDE[attitude(state, tribe, playerId)],
      `${known.length} known`,
      `${all.filter((s) => s.mission?.owner === playerId).length} missions`,
      angriest >= 50 ? 'a settlement is close to violence' : '',
    ]);
    zoom.push(capital ? [capital.x, capital.y] : null);
  }
  return {
    id: 'indians',
    title: 'Indian Adviser',
    sections: [
      {
        heading: 'Native peoples',
        rows: rows.length > 0 ? [['People', 'Relations', 'Mood', 'Settlements', 'Our missions', ''], ...rows] : [],
        zoom: [null, ...zoom],
        empty: 'We have met none of the native peoples yet.',
      },
    ],
  };
}
