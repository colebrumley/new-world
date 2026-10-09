// Information sidebar: date, treasury, the active unit, and what lies on the selected square.
import { dateOfTurn, formatDate } from '../engine/calendar';
import { GOOD_IDS, GOOD_NAMES } from '../engine/data/goods';
import { PROFESSIONS } from '../engine/data/professions';
import { RESOURCES } from '../engine/data/resources';
import { UNIT_TYPES } from '../engine/data/units';
import { MOVE_THIRDS, type GameState, type Unit } from '../engine/state';
import { CAPITAL_NAME, TECH_LEVELS, TRIBES, type TribeId } from '../engine/data/tribes';
import { settlementAt } from '../engine/settlements';
import { isExploredBy, terrainDef, type Tile } from '../engine/tile';
import { viewerIndex } from './render';

/** "Free Colonist", "Veteran Soldier", "Caravel": the skill shows unless it is the plain colonist's. */
export function unitLabel(unit: Unit): string {
  const type = UNIT_TYPES[unit.type];
  if (!unit.profession) return type.name;
  const skill = PROFESSIONS[unit.profession];
  if (unit.type === 'colonist') return skill.name;
  return skill.expertRole === unit.type ? skill.name : type.name;
}

/** Movement in thirds as the original shows it: "2", "1/3", "1 2/3". */
export function formatMoves(thirds: number): string {
  const whole = Math.floor(thirds / MOVE_THIRDS);
  const rest = thirds % MOVE_THIRDS;
  if (rest === 0) return String(whole);
  return whole === 0 ? `${rest}/${MOVE_THIRDS}` : `${whole} ${rest}/${MOVE_THIRDS}`;
}

const ORDER_NAMES: Readonly<Record<Unit['orders'], string>> = {
  none: 'No orders', sentry: 'Sentry', goto: 'Go to', fortify: 'Fortifying', fortified: 'Fortified', plow: 'Clear / plow', road: 'Build road', trade: 'Trade route',
};

/** What a unit carries: passengers, cargo lots, a pioneer's tools. */
function manifest(state: GameState, unit: Unit): string[] {
  const lines = Object.values(state.units).filter((u) => u.aboard === unit.id).map((u) => unitLabel(u));
  for (const good of GOOD_IDS) {
    const amount = unit.cargo[good] ?? 0;
    if (amount > 0) lines.push(`${amount} ${GOOD_NAMES[good]}`);
  }
  if (unit.type === 'pioneer') lines.push(`${unit.tools} Tools`);
  return lines;
}

export interface SidebarModel {
  readonly date: string;
  readonly treasury: string;
  readonly unit: string;
  readonly moves: string;
  readonly orders: string;
  /** Cargo and passengers of the active unit, or other units on the square. */
  readonly aboard: readonly string[];
  /** Prompt or last error, shown at the foot. */
  readonly status: string;
  readonly location: string;
  readonly terrain: string;
  readonly features: readonly string[];
}

/** Text for the sidebar. `focus` is the square to describe: the active unit's, or the cursor's. */
export function sidebarModel(state: GameState, activeUnit: Unit | null, focus: { x: number; y: number } | null, revealAll = false, status = ''): SidebarModel {
  const viewer = viewerIndex(state);
  const player = state.players[viewer];
  const tile: Tile | null = focus ? (state.map.tiles[focus.y * state.map.width + focus.x] ?? null) : null;
  const known = tile !== null && (revealAll || isExploredBy(tile, viewer));
  const features: string[] = [];
  if (tile && known) {
    if (tile.river === 'minor') features.push('Minor River');
    if (tile.river === 'major') features.push('Major River');
    if (tile.road) features.push('Road');
    if (tile.plowed) features.push('Plowed');
    if (tile.resource) features.push(RESOURCES[tile.resource].name);
    if (tile.rumor) features.push('Lost City Rumor');
    const colony = focus ? Object.values(state.colonies).find((c) => c.x === focus.x && c.y === focus.y) : undefined;
    if (colony) features.unshift(`${colony.name} (${colony.colonists.length})`);
    const village = focus ? settlementAt(state, focus.x, focus.y) : null;
    if (village) {
      const level = TECH_LEVELS[TRIBES[village.tribe].tech];
      features.unshift(`${TRIBES[village.tribe].adjective} ${village.capital ? CAPITAL_NAME.settlement : level.settlement}`);
    } else if (tile.homeland && tile.homeland in TRIBES) features.push(`${TRIBES[tile.homeland as TribeId].adjective} land`);
  }
  return {
    date: formatDate(dateOfTurn(state.turn)),
    treasury: `${player?.gold ?? 0} gold`,
    unit: activeUnit ? unitLabel(activeUnit) : 'No active unit',
    moves: activeUnit ? `Moves: ${formatMoves(activeUnit.movesLeft)}` : '',
    orders: activeUnit ? ORDER_NAMES[activeUnit.orders] : '',
    aboard: activeUnit ? manifest(state, activeUnit) : [],
    status,
    location: focus ? `(${focus.x}, ${focus.y})` : '',
    terrain: tile ? (known ? terrainDef(tile).name : 'Unexplored') : '',
    features,
  };
}

export interface Sidebar {
  readonly element: HTMLElement;
  readonly minimap: HTMLCanvasElement;
  update(model: SidebarModel): void;
}

export function createSidebar(): Sidebar {
  const element = document.createElement('aside');
  element.className = 'sidebar';

  const minimap = document.createElement('canvas');
  minimap.className = 'minimap';
  minimap.setAttribute('aria-label', 'New World view');
  element.append(minimap);

  const rows: Record<string, HTMLElement> = {};
  const info = document.createElement('dl');
  info.className = 'sidebar-info';
  for (const [key, label] of [['date', 'Date'], ['treasury', 'Treasury'], ['unit', 'Unit'], ['moves', ''], ['orders', 'Orders'], ['location', 'Location'], ['terrain', 'Terrain']] as const) {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.dataset['field'] = key;
    rows[key] = dd;
    info.append(dt, dd);
  }
  element.append(info);

  const features = document.createElement('ul');
  features.className = 'sidebar-features';
  features.dataset['field'] = 'features';
  element.append(features);

  // The colony cargo list (sorted by value) is filled in once colonies exist (R-308).
  const cargo = document.createElement('ul');
  cargo.className = 'sidebar-cargo';
  cargo.dataset['field'] = 'cargo';
  element.append(cargo);

  const aboard = document.createElement('ul');
  aboard.className = 'sidebar-aboard';
  aboard.dataset['field'] = 'aboard';
  element.append(aboard);

  const status = document.createElement('p');
  status.className = 'sidebar-status';
  status.dataset['field'] = 'status';
  status.setAttribute('aria-live', 'polite');
  element.append(status);

  return {
    element,
    minimap,
    update(model) {
      if (status.textContent !== model.status) status.textContent = model.status;
      const carried = model.aboard.join('\n');
      if (aboard.dataset['text'] !== carried) {
        aboard.dataset['text'] = carried;
        aboard.replaceChildren(...model.aboard.map((line) => Object.assign(document.createElement('li'), { textContent: line })));
      }
      for (const key of ['date', 'treasury', 'unit', 'moves', 'orders', 'location', 'terrain'] as const) {
        const node = rows[key];
        if (node && node.textContent !== model[key]) node.textContent = model[key];
      }
      const text = model.features.join('\n');
      if (features.dataset['text'] !== text) {
        features.dataset['text'] = text;
        features.replaceChildren(...model.features.map((f) => Object.assign(document.createElement('li'), { textContent: f })));
      }
    },
  };
}
