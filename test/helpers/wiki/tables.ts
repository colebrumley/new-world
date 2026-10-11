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
import { NATION_IDS, NATIONS, STARTING_FORCE } from '../../../src/engine/data/nations';
import { KEY_CONTEXT_TITLES, KEYMAP, type KeyContext } from '../../../src/ui/keymap';
import { COLONY_OPTIONS, GAME_OPTIONS, SOUND_OPTIONS, type ColonyOptionKey } from '../../../src/ui/options';
import { landsWith } from '../../../src/ui/power';

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

/** R-1027: the four powers, what each is good at, and what it lands with on the easier and harder levels. */
function nations(): string {
  const levels = DIFFICULTIES.map((d) => difficultyProfile(d).name);
  const cut = STARTING_FORCE.humanVeteranBelowLevel;
  const easy = DIFFICULTIES[0]!;
  const hard = DIFFICULTIES[cut]!;
  return mdTable(
    ['Power', 'Good at', 'Home port', 'Its colonies are called', `Lands with (${levels.slice(0, cut).join(', ')})`, `Lands with (${levels.slice(cut).join(', ')})`],
    NATION_IDS.map((id) => {
      const n = NATIONS[id];
      return [n.name, n.strength, n.homePort, n.colonyName, landsWith(id, easy), landsWith(id, hard)];
    }),
  );
}

/** R-1027: the keyboard and mouse map from src/ui/keymap.ts, one table per context (docs/KEYS.md without its Status column). */
function controls(): string {
  return (Object.keys(KEY_CONTEXT_TITLES) as KeyContext[])
    .map((context) => `### ${KEY_CONTEXT_TITLES[context]}\n\n${mdTable(['Key or mouse', 'Action'], KEYMAP.filter((k) => k.context === context).map((k) => [k.keys, k.action]))}`)
    .join('\n\n');
}

/** What each colony report option silences, where the option itself carries no hint. */
const COLONY_NEWS: Partial<Readonly<Record<ColonyOptionKey, string>>> = {
  reportTrained: 'A line when a colonist is taught a trade at school, or learns one by doing it.',
  reportFood: "A warning when a colony's food will run out in a few turns, and when the last of it is eaten.",
  reportRawMaterials: 'A warning when work stops in a building for want of the goods it works up.',
  reportTools: 'A warning when what a colony is building needs more tools than it has.',
  reportInefficient: 'A warning when Tory feeling slows every worker in a colony, and a line when it no longer does.',
  reportNewCargo: 'A line when a colony has a full load of a good ready to ship, and when its warehouse cannot hold all of a good.',
  reportSonsOfLiberty: "A line when a colony's Sons of Liberty membership rises or falls.",
  reportRebelMajority: 'A line when half or all of a colony stands with the Sons of Liberty, and when it slips back and a production bonus is lost.',
};

/** R-1027: every game, colony report and sound option, what it does and how it starts. */
function options(): string {
  const onOff = (on: boolean): string => (on ? 'On' : 'Off');
  const group = (title: string, rows: readonly (readonly (string | number)[])[]): string => `### ${title}\n\n${mdTable(['Option', 'What it does', 'At first'], rows)}`;
  return [
    group('Game options', GAME_OPTIONS.map((o) => [o.label, o.hint, onOff(o.default)])),
    group('Colony report options', COLONY_OPTIONS.map((o) => [o.label, o.hint || (COLONY_NEWS[o.key] ?? ''), onOff(o.default)])),
    group('Sound options', SOUND_OPTIONS.map((o) => [o.label, o.hint, onOff(o.default)])),
  ].join('\n\n');
}

/** The renderer for each block name: GitHub Markdown, a table or a list. */
export const TABLES: Readonly<Record<string, () => string>> = {
  'difficulty-levels': difficultyLevels,
  nations,
  controls,
  options,
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
