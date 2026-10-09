// What a colonist carries in each role (R-202). The amounts repeat the unit table's equipment
// column; this table adds which roles a colonist may switch between and what each needs.
import type { GoodId } from './goods';
import { PIONEER_TOOLS, UNIT_TYPES, type UnitTypeId } from './units';

export const COLONIST_ROLES = ['colonist', 'soldier', 'dragoon', 'scout', 'pioneer', 'missionary'] as const;
export type ColonistRole = (typeof COLONIST_ROLES)[number];

/** Fixed goods each role holds. Pioneers are separate: they hold a variable number of tools. */
export const ROLE_GOODS = {
  colonist: {},
  soldier: { muskets: UNIT_TYPES.soldier.equipment.muskets },
  dragoon: { muskets: UNIT_TYPES.dragoon.equipment.muskets, horses: UNIT_TYPES.dragoon.equipment.horses },
  scout: { horses: UNIT_TYPES.scout.equipment.horses },
  pioneer: {},
  missionary: {},
} as const satisfies Record<ColonistRole, Partial<Record<GoodId, number>>>;

/** A colonist can be ordained only where one of these stands. */
export const MISSIONARY_BUILDINGS: readonly string[] = ['church', 'cathedral'];

export { PIONEER_TOOLS };

export function isColonistRole(type: UnitTypeId): type is ColonistRole {
  return (COLONIST_ROLES as readonly string[]).includes(type);
}
