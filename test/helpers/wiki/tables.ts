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
// R-1033: Founding Fathers, Score and Hall of Fame
import { CALENDAR, firstTurnOfYear } from '../../../src/engine/calendar';
import { fatherCost } from '../../../src/engine/congress';
import { CONGRESS } from '../../../src/engine/data/congress';
import { FATHER_CATEGORIES, FATHER_ERAS, FATHER_IDS, FATHERS } from '../../../src/engine/data/fathers';
import { HONOURS, SCORE } from '../../../src/engine/data/score';
import { DIFFICULTY_NAMES } from '../../../src/engine/difficulty';
import { ratingOf } from '../../../src/engine/score';
import { world } from '../world';

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

// R-1033 (W11): Founding Fathers, Score and Hall of Fame.

const capital = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** The three eras of the Congress's offer weights, by name. */
const FATHER_ERA_NAMES = [`${CALENDAR.startYear} to ${FATHER_ERAS[0]}`, `${FATHER_ERAS[0]} to ${FATHER_ERAS[1]}`, `after ${FATHER_ERAS[1]}`] as const;

/** Every Founding Father, grouped by field: portrait, name, effect, and the eras he may be offered in. */
function fathers(): string {
  return mdTable(
    ['', 'Founding Father', 'Field', 'Effect', 'May be offered'],
    FATHER_CATEGORIES.flatMap((field) =>
      FATHER_IDS.filter((id) => FATHERS[id].category === field).map((id) => {
        const f = FATHERS[id];
        const eras = FATHER_ERA_NAMES.filter((_, i) => f.weights[i] !== 0).join(', ');
        return [`<img src="images/art/portraits/${id}.png" width="64" alt="${f.name}">`, f.name, capital(field), f.effect, eras];
      }),
    ),
  );
}

/** Bells the next Founding Father costs a human power, by level and year (from the engine's fatherCost). */
function fatherCostTable(): string {
  const seats = [1, 2, 3, 5, 10];
  const years = [CALENDAR.startYear, ...CONGRESS.dearerFrom];
  const cost = (difficulty: (typeof DIFFICULTIES)[number], seated: number, year: number): number => {
    const state = world({ rows: ['.'], players: [{ id: 'a', fathers: FATHER_IDS.slice(0, seated) }], difficulty });
    return fatherCost({ ...state, turn: firstTurnOfYear(year) }, 'a');
  };
  const ordinal = (n: number): string => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;
  return mdTable(
    ['Level', 'From', ...seats.map((n) => `${ordinal(n)} father`)],
    DIFFICULTIES.flatMap((d) => years.map((year) => [DIFFICULTY_NAMES[d], year, ...seats.map((n) => cost(d, n - 1, year))])),
  );
}

/** What counts toward the score, and how much. */
function score(): string {
  const levels = DIFFICULTIES.length;
  const independence = [0, 1, 2, 3].map((ahead) => {
    const times = (SCORE.independenceBase + (SCORE.independenceBase >> ahead)) / SCORE.independenceBase;
    return `x${times} ${ahead === 0 ? 'if no other power was independent first' : `behind ${ahead} ${ahead === 1 ? 'power' : 'powers'}`}`;
  });
  return mdTable(
    ['What counts', 'Points'],
    [
      ['Each specialist (a colonist with a skill), in a colony or outside one', SCORE.expert],
      ['Each free colonist', SCORE.free],
      ['Each indentured servant, petty criminal or Indian convert', SCORE.lowly],
      ['Each Founding Father in the Congress', SCORE.perFather],
      ['Gold in the treasury', `1 for every ${SCORE.goldPerPoint}`],
      ['Rebel sentiment (as it stood at the Declaration, once that is made)', '1 per percentage point'],
      ['Each native settlement you destroyed', `minus 1 (${DIFFICULTY_NAMES[DIFFICULTIES[0]!]}) to minus ${levels} (${DIFFICULTY_NAMES[DIFFICULTIES[levels - 1]!]})`],
      [`Independence declared before ${SCORE.earlyBefore}, and won`, `${SCORE.earlyPerYear} for each year early`],
      ['Liberty bells rung after a foreign power intervened in your war of independence',`1 per ${SCORE.bellsPerPoint} bells, at most ${SCORE.bellsCap}`],
      ['Independence won: the whole is multiplied', independence.join('; ')],
    ],
  );
}

/** The rating factor by difficulty: the score times it over a hundred is the weighted score. */
function scoreRating(): string {
  return mdTable(
    ['Level', 'Rating factor (per hundred)', 'A score of 100 gives a weighted score of', 'and a Colonial Rating of'],
    DIFFICULTIES.map((d) => {
      const r = ratingOf(d, 100);
      return [DIFFICULTY_NAMES[d], SCORE.difficultyFactor[DIFFICULTIES.indexOf(d)]!, r.weighted, `${r.percent}%`];
    }),
  );
}

/** The honours by rank, with the least weighted score and rating each needs (found by asking the engine's ratingOf). */
function honours(): string {
  // the level with the largest factor reaches every weighted score from some whole score
  const top = DIFFICULTIES.reduce((a, b) => (SCORE.difficultyFactor[DIFFICULTIES.indexOf(b)]! > SCORE.difficultyFactor[DIFFICULTIES.indexOf(a)]! ? b : a));
  const least: { weighted: number; percent: number }[] = [];
  for (let s = 0; s < 100000 && least.length < HONOURS.length; s++) {
    const { rank, weighted, percent } = ratingOf(top, s);
    if (rank !== null) for (let r = least.length; r <= rank; r++) least[r] = { weighted, percent };
  }
  return mdTable(
    ['Rank', 'Weighted score of at least', 'Colonial Rating of at least', 'Posterity names after you'],
    HONOURS.map((honour, rank) => [rank + 1, least[rank]?.weighted ?? '-', least[rank] === undefined ? '-' : `${least[rank].percent}%`, honour]),
  );
}

/** The renderer for each block name: GitHub Markdown, a table or a list. */
export const TABLES: Readonly<Record<string, () => string>> = {
  'difficulty-levels': difficultyLevels,
  fathers,
  'father-cost': fatherCostTable,
  score,
  'score-rating': scoreRating,
  honours,
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
