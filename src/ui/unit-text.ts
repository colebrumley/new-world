// What a unit is, in words: its label, its full name, its moves, its orders and its load. Pure text, shared by the
// sidebar and the map's hover slip, so neither has to import the other.
import { GOOD_IDS, GOOD_NAMES } from '../engine/data/goods';
import { PROFESSIONS } from '../engine/data/professions';
import { UNIT_TYPES } from '../engine/data/units';
import { MOVE_THIRDS, type GameState, type Unit } from '../engine/state';

/** The roles a colonist takes with equipment: the unit types some profession is the expert of. */
const EQUIPPED_ROLES: ReadonlySet<string> = new Set(Object.values(PROFESSIONS).flatMap((p) => (p.expertRole ? [p.expertRole] : [])));

/** "Free Colonist", "Veteran Soldier", "Caravel": the skill shows unless it is the plain colonist's. */
export function unitLabel(unit: Unit): string {
  const type = UNIT_TYPES[unit.type];
  if (!unit.profession) return type.name;
  const skill = PROFESSIONS[unit.profession];
  if (unit.type === 'colonist') return skill.name;
  return skill.expertRole === unit.type ? skill.name : type.name;
}

/**
 * The label, and under an equipped role held by anyone but its expert, the skill in brackets:
 * "Soldier (Expert Farmer)", "Dragoon (Veteran Soldier)". Everything else reads as `unitLabel` does.
 */
export function unitFullName(unit: Unit): string {
  const label = unitLabel(unit);
  if (!unit.profession || unit.type === 'colonist') return label;
  const skill = PROFESSIONS[unit.profession];
  if (!EQUIPPED_ROLES.has(unit.type) || skill.expertRole === unit.type) return label;
  return `${label} (${skill.name})`;
}

/** Movement in thirds: "2", "1/3", "1 2/3". */
export function formatMoves(thirds: number): string {
  const whole = Math.floor(thirds / MOVE_THIRDS);
  const rest = thirds % MOVE_THIRDS;
  if (rest === 0) return String(whole);
  return whole === 0 ? `${rest}/${MOVE_THIRDS}` : `${whole} ${rest}/${MOVE_THIRDS}`;
}

export const ORDER_NAMES: Readonly<Record<Unit['orders'], string>> = {
  none: 'No orders', sentry: 'Sentry', goto: 'Go to', fortify: 'Fortifying', fortified: 'Fortified', plow: 'Clear / plow', road: 'Build road', trade: 'Trade route',
};

/** What a unit carries: passengers (named by `name`, their label unless told otherwise), cargo lots, a pioneer's tools. */
export function manifest(state: GameState, unit: Unit, name: (passenger: Unit) => string = unitLabel): string[] {
  const lines = Object.values(state.units).filter((u) => u.aboard === unit.id).map((u) => name(u));
  for (const good of GOOD_IDS) {
    const amount = unit.cargo[good] ?? 0;
    if (amount > 0) lines.push(`${amount} ${GOOD_NAMES[good]}`);
  }
  if (unit.type === 'pioneer') lines.push(`${unit.tools} Tools`);
  return lines;
}
