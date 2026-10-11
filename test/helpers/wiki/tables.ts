// R-1025: the generated reference tables of the player manual in wiki/. A page holds a marked block,
//   <!-- table: name -->
//   (generated; do not edit by hand)
//   <!-- /table -->
// and test/unit/wiki/tables.test.ts fills its body from the renderer registered here under that name
// (with UPDATE_FIXTURES=1) or fails when the body is not what the renderer gives. Every number comes
// from the rule tables, so the manual cannot disagree with the game. Content items add their own
// renderers to TABLES.
import { describeDifficulty, difficultyProfile } from '../../../src/engine/difficulty';
import { DIFFICULTIES } from '../../../src/engine/data/yields';
import { BUILDINGS } from '../../../src/engine/data/buildings';
import { COMBAT } from '../../../src/engine/data/combat';
import { BUILDABLE_UNITS } from '../../../src/engine/data/construction';
import { MISSIONARY_BUILDINGS } from '../../../src/engine/data/equipment';
import { GOOD_NAMES } from '../../../src/engine/data/goods';
import { NAVAL, REPAIR_HEAD_START } from '../../../src/engine/data/naval';
import { TRADE_IDS, TRADES, PRODUCTION } from '../../../src/engine/data/production';
import { PROFESSIONS, SPECIALISTS } from '../../../src/engine/data/professions';
import { DEFENSE_STEP_PERCENT, TERRAIN, TERRAIN_IDS } from '../../../src/engine/data/terrain';
import { ARTILLERY_PRICE_STEP, PIONEER_TOOLS, UNIT_TYPE_IDS, UNIT_TYPES, type UnitTypeId } from '../../../src/engine/data/units';
import { YIELD_RULES } from '../../../src/engine/data/yields';

const cell = (value: string | number): string => String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

/** A GitHub Markdown table with left-aligned columns; `|` in a cell is escaped, numbers are written as given. */
export function mdTable(headers: readonly string[], rows: readonly (readonly (string | number)[])[]): string {
  const line = (cells: readonly (string | number)[]): string => `| ${cells.map(cell).join(' | ')} |`;
  return [line(headers), `| ${headers.map(() => ':---').join(' | ')} |`, ...rows.map(line)].join('\n');
}

/** A Markdown image, `![alt](path)`; the path is relative to the wiki's root (`images/art/goods/food.png`). */
export function img(path: string, alt: string): string {
  return `![${alt.replace(/[[\]]/g, '')}](${path})`;
}

function difficultyLevels(): string {
  return mdTable(
    ['Level', 'Starting gold', "The Crown's starting force", 'Rating factor (per hundred)', 'In short'],
    DIFFICULTIES.map((d) => {
      const p = difficultyProfile(d);
      const { regulars, cavalry, artillery, ships } = p.ref;
      return [p.name, p.startingGold, `${regulars} regulars, ${cavalry} cavalry, ${artillery} artillery, ${ships} warships`, p.ratingFactor, describeDifficulty(d)];
    }),
  );
}

// --- Units and Combat (R-1029) --------------------------------------------------------------------

const goodName = (good: string): string => (GOOD_NAMES as Readonly<Record<string, string>>)[good] ?? good.charAt(0).toUpperCase() + good.slice(1);
const listOf = (items: readonly string[]): string => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);
const CROWN_ONLY: readonly UnitTypeId[] = ['regular', 'cavalry', 'manOWar'];

/** How a power comes by a unit of this kind, in words, from the tables where they say it. */
function howGot(id: UnitTypeId): string {
  const u = UNIT_TYPES[id];
  if (u.native) return "The native peoples' only";
  if (CROWN_ONLY.includes(id)) return "The Crown's only";
  if (id === 'colonist') return 'Recruited or trained in Europe, or born in a colony';
  if (id === 'treasure') return 'Found: a rumour, burial mounds or a destroyed settlement';
  if (id === 'damagedArtillery') return 'Artillery that has lost a fight';
  if (id === 'continentalArmy' || id === 'continentalCavalry') return 'After the Declaration: mustered, promoted or sent by a foreign power';
  if (id === 'missionary') return `Equipped: a colonist blessed in a colony with a ${MISSIONARY_BUILDINGS.map((b) => BUILDINGS[b as keyof typeof BUILDINGS].name).join(' or ')}, or on the docks in Europe`;
  if (u.colonistRole) {
    const kit = id === 'pioneer'
      ? [`${PIONEER_TOOLS.min} to ${PIONEER_TOOLS.max} tools`]
      : (['muskets', 'horses', 'tools'] as const).filter((g) => u.equipment[g] > 0).map((g) => `${u.equipment[g]} ${g}`);
    return `Equipped: a colonist given ${listOf(kit)}`;
  }
  const ways: string[] = [];
  const needs = (BUILDABLE_UNITS as Partial<Record<UnitTypeId, keyof typeof BUILDINGS | null>>)[id];
  if (u.build) ways.push(needs ? `Built (needs ${/^[AEIOU]/.test(BUILDINGS[needs].name) ? 'an' : 'a'} ${BUILDINGS[needs].name})` : 'Built');
  if (u.europePrice !== null) ways.push(`bought in Europe for ${u.europePrice}${id === 'artillery' ? ` (+${ARTILLERY_PRICE_STEP} for each one bought)` : ''}`);
  return ways.join(', or ');
}

function units(): string {
  return mdTable(
    ['', 'Unit', 'Land or sea', 'Moves', 'Attack', 'Defence', 'Holds', 'How it is got'],
    UNIT_TYPE_IDS.map((id) => {
      const u = UNIT_TYPES[id];
      return [img(`images/art/units/${id}.png`, u.name), u.name, u.domain === 'sea' ? 'Sea' : 'Land', u.moves, u.attack, u.defense, u.holds, howGot(id)];
    }),
  );
}

const SCHOOLS = ['', 'Schoolhouse', 'College', 'University', 'Never'] as const;
const ROLE_SKILL: Readonly<Record<string, string>> = {
  pioneer: 'Pioneer work, in half the turns',
  soldier: `Fighting as a soldier or dragoon, at +${100 / COMBAT.halfBonus}%`,
  scout: 'Scouting: safer with chiefs and at rumours, caught less often in a colony',
  missionary: 'Missions: founds expert missions, which bring more converts',
};

/** What a specialist does better than a free colonist. */
function expertAt(id: (typeof SPECIALISTS)[number]): string {
  const p = PROFESSIONS[id];
  if (p.expertGood === 'food' || p.expertGood === 'fish') return `${goodName(p.expertGood)}: ${YIELD_RULES.foodExpertAdd} more a square`;
  if (p.expertGood) return `${goodName(p.expertGood)}: ${YIELD_RULES.expertMultiplier === 2 ? 'twice' : `${YIELD_RULES.expertMultiplier} times`} as much a square`;
  if (p.expertRole) return ROLE_SKILL[p.expertRole] ?? p.expertRole;
  const trade = TRADE_IDS.find((t) => TRADES[t].expert === id);
  if (!trade) return '';
  const t = TRADES[trade];
  const what = `${goodName(t.output ?? '')}${t.input ? ` from ${goodName(t.input).toLowerCase()}` : ''}`;
  if (t.rule === 'flat') return `${what}: ${PRODUCTION.flatExpert} a turn where a colonist makes ${PRODUCTION.base.skilled}`;
  return `${what}: ${PRODUCTION.expertMultiplier === 2 ? 'twice' : `${PRODUCTION.expertMultiplier} times`} as much`;
}

function professions(): string {
  return mdTable(
    ['Skill', 'Expert at', 'Taught in a school', 'Natives teach it'],
    SPECIALISTS.map((id) => {
      const p = PROFESSIONS[id];
      return [p.name, expertAt(id), SCHOOLS[p.teachLevel], p.nativeTaught ? 'Yes' : 'No'];
    }),
  );
}

/** Every modifier the Combat Analysis dialog can list, with when it applies and how much. */
function combatModifiers(): string {
  const half = `+${100 / COMBAT.halfBonus}%`;
  const quarters = (q: number): string => `+${25 * q}%`;
  const ground = [...new Set(TERRAIN_IDS.filter((t) => !TERRAIN[t].water).map((t) => TERRAIN[t].defense).filter((d) => d > 0))].sort((a, b) => a - b);
  const groundRange = `+${DEFENSE_STEP_PERCENT}% for each point of the square's defence (${quarters(ground[0] ?? 0)} to ${quarters(ground[ground.length - 1] ?? 0)})`;
  const s = COMBAT.settledQuarters;
  const fatigue = [2, 1].map((left) => `${Math.trunc((100 * (left - COMBAT.fullMove)) / COMBAT.fullMove)}%`);
  const open = `${Math.round(100 / COMBAT.artilleryOpenDivisor) - 100}%`;
  return mdTable(
    ['Modifier', 'Side', 'When it applies', 'How much'],
    [
      ['Attack Bonus', 'Attacker', 'Every attack, on land and at sea', half],
      ['Veteran', 'Either', 'A soldier or dragoon who is a Veteran Soldier', half],
      ['Ambush', 'Attacker', 'Natives attacking a European unit in the open that is not Fortified; after the Declaration, rebels attacking from outside a colony', groundRange],
      ['Fatigue', 'Attacker', 'Less than a full move left: two thirds, or one third', `${fatigue[0]} or ${fatigue[1]}`],
      ['Artillery In Open', 'Either', 'Artillery fighting outside a colony or settlement, unless the defender is a European unit fortifying or fortified', open],
      ['Spain Bonus', 'Attacker', 'Spain attacking a native settlement', half],
      ['Bombard', 'Attacker', "After the Declaration: the Crown's troops attacking a colony, and the rebels once a foreign power has intervened", half],
      ['Tory Unrest', 'Attacker', "After the Declaration: the Crown's troops attacking a colony", "+ the colony's Tory percentage"],
      ['Rebel Unrest', 'Attacker', 'After the Declaration: the rebels attacking a colony', "+ the colony's Sons of Liberty percentage"],
      ['Terrain', 'Defender', 'A unit in the open, unless it is ambushed', groundRange],
      ['Settlement', 'Defender', 'A native settlement; a capital counts double', `${quarters(s)} for camps and villages, ${quarters(2 * s)} for cities; a capital ${quarters(2 * s)} or ${quarters(4 * s)}`],
      ['Colony', 'Defender', 'A colony with no stockade', quarters(s)],
      ['Stockade', 'Defender', 'A colony with a stockade', quarters(2 * s)],
      ['Fort', 'Defender', 'A colony with a fort', quarters(3 * s)],
      ['Fortress', 'Defender', 'A colony with a fortress', quarters(4 * s)],
      ['Fortified', 'Defender', `A land unit that has finished fortifying, where the place gives ${quarters(COMBAT.fortifiedLimit - 1)} or less`, quarters(COMBAT.fortifiedQuarters)],
      ['Artillery Vs. Raid', 'Defender', 'Artillery in a colony attacked by natives', `+${100 * (COMBAT.artilleryRaidFactor - 1)}%`],
      ['Drake', 'Either', 'A privateer whose owner has Francis Drake in the Congress', half],
    ],
  );
}

/** The longest a crippled ship waits, in Europe and in a colony with a drydock. */
function shipRepairs(): string {
  const ships = UNIT_TYPE_IDS.filter((id) => UNIT_TYPES[id].domain === 'sea');
  return mdTable(
    ['Ship', 'Turns in Europe', `Turns in a ${BUILDINGS[NAVAL.repairBuilding as keyof typeof BUILDINGS].name}`],
    ships.map((id) => {
      const need = Math.max(1, UNIT_TYPES[id].defense - ((REPAIR_HEAD_START as Partial<Record<UnitTypeId, number>>)[id] ?? 0));
      return [UNIT_TYPES[id].name, need, Math.max(1, Math.ceil(need / 2))];
    }),
  );
}

/** The renderer for each block name: GitHub Markdown, a table or a list. */
export const TABLES: Readonly<Record<string, () => string>> = {
  'difficulty-levels': difficultyLevels,
  units,
  professions,
  'combat-modifiers': combatModifiers,
  'ship-repairs': shipRepairs,
};

/** A marked block: the opening marker (group 1), its name (2), its body (3) and the closing marker (4). */
export const BLOCK = /(<!--\s*table:\s*([\w-]+)\s*-->)([\s\S]*?)(<!--\s*\/table\s*-->)/g;

/** The renderer registered under a block name, or undefined (never one inherited from Object). */
export const rendererFor = (name: string): (() => string) | undefined => (Object.hasOwn(TABLES, name) ? TABLES[name] : undefined);

/** The markdown with the body of every marked block replaced by its renderer's output. */
export function fillTables(markdown: string): string {
  return markdown.replace(BLOCK, (_all, open: string, name: string, _body: string, close: string) => {
    const render = rendererFor(name);
    if (!render) throw new Error(`no renderer is registered for the table block "${name}"`);
    return `${open}\n\n${render()}\n\n${close}`;
  });
}
