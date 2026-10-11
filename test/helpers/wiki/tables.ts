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
import { AMERICA_TRIBE_SITES } from '../../../src/engine/data/america';
import { PROFESSIONS, type ProfessionId } from '../../../src/engine/data/professions';
import { ATTITUDES, CAPITAL_NAME, NATIVES, settlementPopulation, TECH_LEVELS, TRIBE_IDS, TRIBES, type TribeId } from '../../../src/engine/data/tribes';
import { createGame } from '../../../src/engine/game';
import { settlementSkill } from '../../../src/engine/learning';
import { INK, PALETTE, VILLAGE_LOOKS } from '../../../src/ui/pixel-art';
import { MOOD_COLORS } from '../../../src/ui/render';

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

// R-1032: the native peoples.

/** Where each people lives on the America map, in words (the sites are in src/engine/data/america.ts). */
const TRIBE_HOMES: Readonly<Record<TribeId, string>> = {
  inca: 'the mountains and coast of western South America',
  aztec: 'Mexico and Central America',
  arawak: 'the Caribbean islands and the shores around them',
  iroquois: 'the north-east, from the Great Lakes to the Atlantic',
  cherokee: 'the south-east of North America',
  apache: 'the dry south-west of North America',
  sioux: 'the northern plains',
  tupi: 'the Amazon basin and the east of South America',
};

/** Games of the America map sampled to find the trades each people most often teaches. */
const SKILL_SAMPLES = 20;
const SKILLS_SHOWN = 3;

/** For each people, the trades its settlements teach, most often first, over a sample of America games. */
function taughtSkills(): Record<TribeId, ProfessionId[]> {
  const tally = new Map<TribeId, Map<ProfessionId, number>>(TRIBE_IDS.map((t) => [t, new Map()]));
  for (let i = 1; i <= SKILL_SAMPLES; i++) {
    const state = createGame({ seed: `wiki-skills-${i}`, scenario: 'america' });
    for (const settlement of Object.values(state.settlements)) {
      const counts = tally.get(settlement.tribe)!;
      const skill = settlementSkill(state, settlement);
      counts.set(skill, (counts.get(skill) ?? 0) + 1);
    }
  }
  return Object.fromEntries(
    TRIBE_IDS.map((t) => [t, [...tally.get(t)!].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([skill]) => skill)]),
  ) as Record<TribeId, ProfessionId[]>;
}

function tribes(): string {
  const skills = taughtSkills();
  return mdTable(
    ['', 'People', 'How they live', 'People per settlement', 'Treasure', 'Most often teach', 'On the America map'],
    TRIBE_IDS.map((id) => {
      const tribe = TRIBES[id];
      const level = TECH_LEVELS[tribe.tech];
      const { start } = settlementPopulation(id, false);
      const { max } = settlementPopulation(id, true);
      return [
        img(`images/art/places/${VILLAGE_LOOKS[tribe.tech]}.png`, `${tribe.adjective} ${level.settlement.toLowerCase()}`),
        tribe.name,
        `${level.name}: ${level.plural.toLowerCase()}`,
        `${start} (the ${CAPITAL_NAME.settlement.toLowerCase()} up to ${max})`,
        tribe.treasure,
        skills[id].slice(0, SKILLS_SHOWN).map((p) => PROFESSIONS[p].name).join(', '),
        `${TRIBE_HOMES[id]}; up to ${AMERICA_TRIBE_SITES[id].length} settlements`,
      ];
    }),
  );
}

/** The ink a mood mark is drawn in, as words: `brightBlue` is "bright blue". */
const inkName = (hex: string): string =>
  (Object.entries(INK).find(([, ink]) => PALETTE[ink] === hex)?.[0] ?? hex).replace(/[A-Z]/g, (c) => ` ${c.toLowerCase()}`);

function nativeAttitudes(): string {
  const [uneasy, restless, angry] = NATIVES.alarmLevels;
  const when = [
    `tribal alarm under ${uneasy}`,
    `tribal alarm ${uneasy} to ${restless - 1}`,
    `tribal alarm ${restless} to ${angry - 1}`,
    `tribal alarm ${angry} or more`,
    `this settlement's own alarm ${NATIVES.settlementHostile} or more`,
  ];
  const means = [
    'Friendly. Their braves call on your colonies with gifts and converts, and they teach and trade freely.',
    'Wary. Lessons may fail, a chief may have a scout killed, and a brave at your gate may demand goods instead of bringing them.',
    'Sullen. They will not teach, a demand for tribute that fails is refused outright, and their braves come to your colonies with black looks only.',
    'Hostile. Ships are turned away, wagon trains risk their cargo, scouts are killed, and braves attack your units and colonies.',
    'This settlement alone has turned on you: ships are turned away and its brave attacks your units and colonies.',
  ];
  return mdTable(
    ['Attitude', 'Mark', 'When', 'What it means'],
    ATTITUDES.map((name, i) => [name, inkName(MOOD_COLORS[i]!), when[i]!, means[i]!]),
  );
}

/** The renderer for each block name: GitHub Markdown, a table or a list. */
export const TABLES: Readonly<Record<string, () => string>> = {
  'difficulty-levels': difficultyLevels,
  tribes,
  'native-attitudes': nativeAttitudes,
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
