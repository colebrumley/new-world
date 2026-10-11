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
import { ROLE_GOODS } from '../../../src/engine/data/equipment';
import { GOOD_IDS, GOOD_NAMES, type GoodId } from '../../../src/engine/data/goods';
import { IMMIGRATION, SKILLED_IMMIGRANTS } from '../../../src/engine/data/immigration';
import { INDEPENDENCE } from '../../../src/engine/data/independence';
import { ASK_OVER_BID, MARKET, MARKET_MODEL } from '../../../src/engine/data/market';
import { PROFESSION_IDS, PROFESSIONS, type ProfessionId } from '../../../src/engine/data/professions';
import { ROYAL } from '../../../src/engine/data/royal';
import { TAX_BANDS } from '../../../src/engine/data/tax';
import { ARTILLERY_PRICE_STEP, PIONEER_TOOLS, UNIT_TYPE_IDS, UNIT_TYPES } from '../../../src/engine/data/units';
import { trainingPrice } from '../../../src/engine/europe';

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

// --- R-1031: Europe and Trade; The Crown and Independence -------------------------------------

/** "a to b", or one number when the two are the same. */
const span = (a: number, b: number): string => (a === b ? String(a) : `${a} to ${b}`);
const goodIcon = (g: GoodId): string => img(`images/art/goods/${g}.png`, GOOD_NAMES[g]);
const unitIcon = (u: string, alt: string): string => img(`images/art/units/${u}.png`, alt);

/** Europe's opening bid range, the bid's floor and ceiling, and how far the ask stands above the bid (bid = price - 1). */
function market(): string {
  const processed: readonly string[] = MARKET_MODEL.processed;
  return mdTable(
    ['', 'Good', 'Opening bid', 'Lowest bid', 'Highest bid', 'Ask is the bid plus'],
    GOOD_IDS.map((g) => {
      const m = MARKET[g];
      const opening = processed.includes(g) ? 'set by demand' : span(m.start[0] - 1, m.start[1] - 1);
      return [goodIcon(g), GOOD_NAMES[g], opening, m.low - 1, m.high - 1, ASK_OVER_BID + m.burden];
    }),
  );
}

/** How someone of this calling steps onto the docks. */
function arrivesAs(p: ProfessionId): string {
  const role = PROFESSIONS[p].expertRole;
  if (role === 'pioneer') return `a pioneer with ${PIONEER_TOOLS.max} tools`;
  if (role === 'soldier') return `a soldier with ${ROLE_GOODS.soldier.muskets} muskets`;
  if (role === 'scout') return `a scout with ${ROLE_GOODS.scout.horses} horses`;
  if (role === 'missionary') return 'a missionary';
  return 'a colonist';
}

/** The Royal University's courses, cheapest first, as the Train door lists them. */
function training(): string {
  const price = (p: ProfessionId): number => trainingPrice(p) ?? 0;
  const taught = PROFESSION_IDS.filter((p) => trainingPrice(p) !== null).sort((a, b) => price(a) - price(b));
  return mdTable(['Profession', 'Price in gold', 'Leaves as'], taught.map((p) => [PROFESSIONS[p].name, price(p), arrivesAs(p)]));
}

/** What the Purchase door sells, then the kit someone on the docks can be fitted with from the market. */
function purchases(): string {
  const rows: (string | number)[][] = UNIT_TYPE_IDS.filter((t) => UNIT_TYPES[t].europePrice !== null).map((t) => {
    const u = UNIT_TYPES[t];
    const price = t === 'artillery' ? `${u.europePrice}, and ${ARTILLERY_PRICE_STEP} more for each one bought before` : String(u.europePrice);
    return [unitIcon(t, u.name), u.name, price, u.domain === 'sea' ? `a ship of ${u.holds} holds` : 'a field gun, ready on the docks'];
  });
  const amounts = (role: 'soldier' | 'dragoon' | 'scout'): string =>
    Object.entries(ROLE_GOODS[role]).map(([g, n]) => `${n} ${GOOD_NAMES[g as GoodId].toLowerCase()}`).join(' and ');
  const kit = (who: 'soldier' | 'dragoon' | 'scout' | 'pioneer', goods: string): (string | number)[] =>
    [unitIcon(who, UNIT_TYPES[who].name), `${UNIT_TYPES[who].name}'s kit`, `${goods} at the asking price`, 'fitted to someone on the docks'];
  rows.push(kit('soldier', amounts('soldier')), kit('dragoon', amounts('dragoon')), kit('scout', amounts('scout')), kit('pioneer', `${PIONEER_TOOLS.max} tools`));
  return mdTable(['', 'What', 'Price in gold', 'Notes'], rows);
}

/** The chance of each kind of newcomer when a pool slot is drawn, by level, in whole per cents. */
function immigrantOdds(): string {
  const pct = (x: number): string => `${Math.round(x * 100)}%`;
  return mdTable(
    ['Level', 'Petty Criminal', 'Indentured Servant', 'Free Colonist', 'Skilled'],
    DIFFICULTIES.map((d, level) => {
      const t = (level + 3) >> 1; // as drawImmigrant in src/engine/immigration.ts
      const criminal = t / IMMIGRATION.criminalOdds;
      const servant = (1 - criminal) * (t / IMMIGRATION.servantOdds);
      const free = (1 - criminal - servant) * (t / IMMIGRATION.freeColonistOdds);
      return [difficultyProfile(d).name, pct(criminal), pct(servant), pct(free), pct(1 - criminal - servant - free)];
    }),
  );
}

/** The skilled draw: each calling's weight out of the whole, and what the newcomer steps ashore as. */
function skilledImmigrants(): string {
  const entries = Object.entries(SKILLED_IMMIGRANTS) as [ProfessionId, number][];
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  return mdTable(['Calling', `Chance (out of ${total})`, 'Steps ashore as'], entries.map(([p, w]) => [PROFESSIONS[p].name, w, arrivesAs(p)]));
}

const TAX_EVENT_NAMES: Readonly<Record<(typeof TAX_BANDS)[number]['reason'], string>> = {
  victory: 'A victory abroad', wedding: 'A royal wedding', war: 'A war with a foreign enemy', navigationAct: 'A Navigation Act', stampAct: 'A Stamp Act',
};

/** Each kind of tax event, in the order of the roll, and what it does to the rate. */
function taxEvents(): string {
  const sign = (n: number): string => (n > 0 ? `+${n}` : String(n));
  return mdTable(['Event', 'Change to the tax rate'], TAX_BANDS.map((b) =>
    [TAX_EVENT_NAMES[b.reason], b.min === b.max ? `${sign(b.min)} ${Math.abs(b.min) === 1 ? 'point' : 'points'}` : `${sign(b.min)} to ${sign(b.max)} points`]));
}

/**
 * The Royal Expeditionary Force at the start of a game, what the royal purse gains each turn before 1600,
 * and the bells rung after the Declaration that bring foreign intervention, by level.
 */
function expeditionaryForce(): string {
  const [bellsBase, bellsPerLevel] = INDEPENDENCE.interventionBells;
  return mdTable(
    ['Level', 'Regulars', 'Cavalry', 'Artillery', 'Men-of-War', 'Royal purse each turn (before 1600)', 'Bells for foreign intervention'],
    DIFFICULTIES.map((d, level) => {
      const { name, ref } = difficultyProfile(d);
      return [name, ref.regulars, ref.cavalry, ref.artillery, ref.ships, ROYAL.moneyBase + ROYAL.moneyPerLevel * level, bellsBase + bellsPerLevel * level];
    }),
  );
}

/** The renderer for each block name: GitHub Markdown, a table or a list. */
export const TABLES: Readonly<Record<string, () => string>> = {
  'difficulty-levels': difficultyLevels,
  market,
  training,
  purchases,
  'immigrant-odds': immigrantOdds,
  'skilled-immigrants': skilledImmigrants,
  'tax-events': taxEvents,
  'expeditionary-force': expeditionaryForce,
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
