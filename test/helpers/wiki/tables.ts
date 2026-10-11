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
import { BUILDING_CHAINS, BUILDINGS, type BuildingChain, type BuildingId } from '../../../src/engine/data/buildings';
import { COLONY_LIMITS } from '../../../src/engine/data/colony';
import { COMBAT } from '../../../src/engine/data/combat';
import { BUILDABLE_UNITS } from '../../../src/engine/data/construction';
import { CROSSES } from '../../../src/engine/data/crosses';
import { CUSTOM_HOUSE } from '../../../src/engine/data/custom-house';
import { FATHERS } from '../../../src/engine/data/fathers';
import { HORSES } from '../../../src/engine/data/food';
import { ABSTRACT_GOOD_IDS, GOOD_IDS, GOOD_NAMES, type AbstractGoodId, type GoodId } from '../../../src/engine/data/goods';
import { LIBERTY } from '../../../src/engine/data/liberty';
import { NAVAL } from '../../../src/engine/data/naval';
import { WAREHOUSE } from '../../../src/engine/data/pioneer';
import { PRODUCTION, TRADE_IDS, TRADES } from '../../../src/engine/data/production';
import { PROFESSION_IDS, PROFESSIONS } from '../../../src/engine/data/professions';
import { RAW_GOODS, TERRAIN, TERRAIN_IDS, baseYield, type RawGood } from '../../../src/engine/data/terrain';
import { UNIT_TYPES } from '../../../src/engine/data/units';

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

/** The renderer for each block name: GitHub Markdown, a table or a list. */
export const TABLES: Readonly<Record<string, () => string>> = {
  'difficulty-levels': difficultyLevels,
  goods: goodsTable,
  buildings: buildingsTable,
  'buildable-units': buildableUnits,
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

// --- R-1030: Colonies and Buildings --------------------------------------------------------------

const goodName = (good: GoodId | AbstractGoodId): string => GOOD_NAMES[good];
const chainNames = (chain: BuildingChain): string =>
  (BUILDING_CHAINS[chain] as readonly BuildingId[]).filter((id) => !BUILDINGS[id].unused).map((id) => BUILDINGS[id].name).join(' → ');
const expertsFor = (good: RawGood): string[] => PROFESSION_IDS.filter((p) => PROFESSIONS[p].expertGood === good).map((p) => PROFESSIONS[p].name);

/** Where a free colonist gets this raw good, best first, as "Plains 5, Savannah 4, Grassland 3 and 4 more". */
function bestSquares(good: RawGood, shown = 3): string {
  const rows = TERRAIN_IDS.map((t) => ({ name: TERRAIN[t].name, n: baseYield(t, good) }))
    .filter((r) => r.n > 0)
    .sort((a, b) => b.n - a.n);
  const head = rows.slice(0, shown).map((r) => `${r.name} ${r.n}`).join(', ');
  return rows.length > shown ? `${head} and ${rows.length - shown} more` : head;
}

function goodsRow(good: GoodId | AbstractGoodId): (string | number)[] {
  const icon = img(`images/art/goods/${good}.png`, goodName(good));
  if ((RAW_GOODS as readonly string[]).includes(good)) {
    const raw = good as RawGood;
    if (raw === 'food') {
      return [icon, goodName(good), 'Raw', 'Land; water too once the colony has Docks (fish)', [...expertsFor('food'), ...expertsFor('fish')].join(', '),
        `A square: ${bestSquares('food')}; at sea ${bestSquares('fish', 2)}`];
    }
    return [icon, goodName(good), 'Raw', 'Land', expertsFor(raw).join(', '), `A square: ${bestSquares(raw)}`];
  }
  if (good === 'horses') {
    return [icon, goodName(good), 'Bred', 'Spare food', 'Nobody: they breed by themselves', `A colony with ${HORSES.minimumHerd} or more; faster with a ${BUILDINGS.stable.name}`];
  }
  const trade = TRADE_IDS.find((t) => TRADES[t].output === good);
  if (!trade) return [icon, goodName(good), 'Bought', 'Not made in a colony', '-', 'Europe'];
  const t = TRADES[trade];
  const kind = (ABSTRACT_GOOD_IDS as readonly string[]).includes(good) ? 'Made, not cargo' : 'Made';
  const extra = good === 'bells' ? ` (the colony rings ${LIBERTY.freeBells} a turn by itself)` : good === 'crosses' ? ` (the colony makes ${CROSSES.perColony} a turn by itself)` : '';
  return [icon, goodName(good), kind, t.input ? goodName(t.input) : 'Nothing', `Anyone as ${t.name.toLowerCase()}; the expert is the ${PROFESSIONS[t.expert].name}`, `${chainNames(t.chain)}${extra}`];
}

/** Every cargo, and the three things a colony makes that are not cargo: what it is and where it comes from. */
function goodsTable(): string {
  return mdTable(['Icon', 'Cargo', 'Raw or made', 'Made from', 'Made by', 'Made in'], [...GOOD_IDS, ...ABSTRACT_GOOD_IDS].map(goodsRow));
}

/** The order the Buildings page lists the lines in. */
const BUILDING_LINES = [
  'townHall', 'carpenter', 'weaver', 'tobacconist', 'distiller', 'furTrader', 'blacksmith', 'armory', 'docks', 'school',
  'warehouse', 'stable', 'customHouse', 'press', 'church', 'fortification',
] as const satisfies readonly BuildingChain[];

function buildingEffect(id: BuildingId): string {
  const b = BUILDINGS[id];
  const workers = PRODUCTION.workersPerBuilding;
  const line = b.chain ? (BUILDING_CHAINS[b.chain] as readonly BuildingId[]) : [id];
  const trade = TRADE_IDS.find((t) => TRADES[t].chain === b.chain);
  if (trade && TRADES[trade].rule === 'craft') {
    const t = TRADES[trade];
    const input = goodName(t.input as GoodId).toLowerCase();
    const output = goodName(t.output as GoodId).toLowerCase();
    const [used, made] = PRODUCTION.factoryInput;
    if (b.level === 1) return `Up to ${workers} colonists turn ${input} into ${output}, one for one.${id === 'armory' ? ` ${UNIT_TYPES.artillery.name} can be built.` : ''}`;
    if (b.level === 2) return `Each worker makes twice what he made in the ${BUILDINGS[line[0] as BuildingId].name}.`;
    return `Half again the output of the ${BUILDINGS[line[1] as BuildingId].name}, using only ${used} ${input} for every ${made} ${output}.`;
  }
  const shipyardUnits = (Object.keys(BUILDABLE_UNITS) as (keyof typeof BUILDABLE_UNITS)[]).filter((u) => BUILDABLE_UNITS[u] === 'shipyard').map((u) => UNIT_TYPES[u].name);
  const defence = (level: number): string => `+${COMBAT.settledQuarters * (1 + level) * 25}%`;
  const teachers = (level: 1 | 2 | 3): string => {
    const n = PRODUCTION.teachers[level];
    return `Seats ${n} teacher${n === 1 ? '' : 's'}. An expert may teach here if his trade is taught at level ${level === 1 ? '1' : `${level} or below`}.`;
  };
  switch (id) {
    case 'townHall': return `Up to ${workers} statesmen ring liberty bells. The colony rings ${LIBERTY.freeBells} a turn with nobody here.`;
    case 'carpentersShop': return `Up to ${workers} carpenters turn lumber into hammers, one for one.`;
    case 'lumberMill': return 'Carpenters make twice as many hammers.';
    case 'docks': return "Colonists can fish on the colony's water squares.";
    case 'drydock': return 'Damaged ships come here to be repaired, in half the time Europe takes.';
    case 'shipyard': return `Ships can be built: ${shipyardUnits.join(', ')}.`;
    case 'schoolhouse': return teachers(1);
    case 'college': return teachers(2);
    case 'university': return teachers(3);
    case 'warehouse': return `The colony keeps ${WAREHOUSE.base + WAREHOUSE.step} of each good instead of ${WAREHOUSE.base}.`;
    case 'warehouseExpansion': return `The colony keeps ${WAREHOUSE.base + 2 * WAREHOUSE.step} of each good.`;
    case 'stable': return `Horses breed twice as fast: ${HORSES.perHerd} for every ${HORSES.herdSizeWithStable} in the herd instead of every ${HORSES.herdSize}.`;
    case 'customHouse': return `Sells the goods you choose without a ship: each turn, down to ${CUSTOM_HOUSE.keep} once ${CUSTOM_HOUSE.sellAt} are in store.`;
    case 'printingPress': return "Half again the colony's liberty bells.";
    case 'newspaper': return "Twice the colony's liberty bells, in place of the press's half again.";
    case 'church': return `The colony makes ${CROSSES.perColony + CROSSES.perChurchLevel} crosses a turn instead of ${CROSSES.perColony}, and up to ${workers} preachers make more.`;
    case 'cathedral': return `The colony makes ${CROSSES.perColony + 2 * CROSSES.perChurchLevel} crosses a turn, and each preacher makes twice as many.`;
    case 'stockade': return `Defenders get ${defence(1)} (a bare colony gives ${defence(0)}). The colony can no longer drop below ${COLONY_LIMITS.stockadeMinPopulation} colonists by choice, nor be abandoned.`;
    case 'fort': return `Defenders get ${defence(2)}. Fires on enemy ships beside the colony and costs them ${NAVAL.fortSlow} thirds of a move.`;
    case 'fortress': return `Defenders get ${defence(3)}. Fires on enemy ships beside the colony twice as hard and stops them there.`;
    default: return '';
  }
}

/** Every building a colony can raise, line by line, with its sprite, its cost and what it does. */
function buildingsTable(): string {
  const rows: (string | number)[][] = [];
  for (const line of BUILDING_LINES) {
    for (const id of BUILDING_CHAINS[line] as readonly BuildingId[]) {
      const b = BUILDINGS[id];
      if (b.unused) continue;
      const needs = [b.needsFather ? FATHERS[b.needsFather].name : '', id === 'docks' ? 'water beside the colony' : b.coastal ? 'the open sea beside the colony' : '']
        .filter(Boolean)
        .join('; ');
      rows.push([img(`images/art/buildings/${id}.png`, b.name), b.name, b.hammers, b.tools, b.minPopulation, needs || '-', buildingEffect(id)]);
    }
  }
  return mdTable(['Sprite', 'Building', 'Hammers', 'Tools', 'Colonists needed', 'Also needs', 'What it does'], rows);
}

/** The units a colony can build, with their cost and what each needs. */
function buildableUnits(): string {
  return mdTable(
    ['Sprite', 'Unit', 'Hammers', 'Tools', 'Needs'],
    (Object.keys(BUILDABLE_UNITS) as (keyof typeof BUILDABLE_UNITS)[]).map((u) => {
      const cost = UNIT_TYPES[u].build ?? { hammers: 0, tools: 0 };
      const needs = BUILDABLE_UNITS[u];
      return [img(`images/art/units/${u}.png`, UNIT_TYPES[u].name), UNIT_TYPES[u].name, cost.hammers, cost.tools, needs ? BUILDINGS[needs].name : 'Fewer wagon trains than you have colonies'];
    }),
  );
}
