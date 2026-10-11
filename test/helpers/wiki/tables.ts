// R-1025: the generated reference tables of the player manual in wiki/. A page holds a marked block,
//   <!-- table: name -->
//   (generated; do not edit by hand)
//   <!-- /table -->
// and test/unit/wiki/tables.test.ts fills its body from the renderer registered here under that name
// (with UPDATE_FIXTURES=1) or fails when the body is not what the renderer gives. Every number comes
// from the rule tables, so the manual cannot disagree with the game. Content items add their own
// renderers to TABLES.
import { describeDifficulty, difficultyProfile, DIFFICULTY_NAMES } from '../../../src/engine/difficulty';
import { DIFFICULTIES, YIELD_RULES } from '../../../src/engine/data/yields';
import { NATION_IDS, NATIONS, STARTING_FORCE } from '../../../src/engine/data/nations';
import { KEY_CONTEXT_TITLES, KEYMAP, type KeyContext } from '../../../src/ui/keymap';
import { COLONY_OPTIONS, GAME_OPTIONS, SOUND_OPTIONS, type ColonyOptionKey } from '../../../src/ui/options';
import { landsWith } from '../../../src/ui/power';
import { BUILDINGS, BUILDING_CHAINS, type BuildingChain, type BuildingId } from '../../../src/engine/data/buildings';
import { COMBAT } from '../../../src/engine/data/combat';
import { BUILDABLE_UNITS } from '../../../src/engine/data/construction';
import { MISSIONARY_BUILDINGS } from '../../../src/engine/data/equipment';
import { GOOD_NAMES, ABSTRACT_GOOD_IDS, GOOD_IDS, type AbstractGoodId, type GoodId } from '../../../src/engine/data/goods';
import { NAVAL, REPAIR_HEAD_START } from '../../../src/engine/data/naval';
import { TRADE_IDS, TRADES, PRODUCTION } from '../../../src/engine/data/production';
import { PROFESSIONS, SPECIALISTS, type ProfessionId, PROFESSION_IDS } from '../../../src/engine/data/professions';
import { DEFENSE_STEP_PERCENT, TERRAIN, TERRAIN_IDS, CLEARED_FROM, defensePercent, RAW_GOODS, type ForestTerrain, type RawGood, type TerrainId } from '../../../src/engine/data/terrain';
import { ARTILLERY_PRICE_STEP, PIONEER_TOOLS, UNIT_TYPE_IDS, UNIT_TYPES, type UnitTypeId } from '../../../src/engine/data/units';
import { PIONEER_WORK, WAREHOUSE } from '../../../src/engine/data/pioneer';
import { RESOURCE_BONUS, RESOURCE_IDS, RESOURCE_TERRAINS, RESOURCES, type ResourceBonus, type ResourceId } from '../../../src/engine/data/resources';
import { jobTurns } from '../../../src/engine/pioneer';
import { makeTile, type Tile } from '../../../src/engine/tile';
import { FREE_COLONIST, tileYield, type OutdoorWorker } from '../../../src/engine/yields';
import { AMERICA_TRIBE_SITES } from '../../../src/engine/data/america';
import { ATTITUDES, CAPITAL_NAME, NATIVES, settlementPopulation, TECH_LEVELS, TRIBE_IDS, TRIBES, type TribeId } from '../../../src/engine/data/tribes';
import { createGame } from '../../../src/engine/game';
import { settlementSkill } from '../../../src/engine/learning';
import { INK, PALETTE, VILLAGE_LOOKS } from '../../../src/ui/pixel-art';
import { MOOD_COLORS } from '../../../src/ui/render';
import { CALENDAR, firstTurnOfYear } from '../../../src/engine/calendar';
import { fatherCost } from '../../../src/engine/congress';
import { CONGRESS } from '../../../src/engine/data/congress';
import { FATHER_CATEGORIES, FATHER_ERAS, FATHER_IDS, FATHERS } from '../../../src/engine/data/fathers';
import { HONOURS, SCORE } from '../../../src/engine/data/score';
import { ratingOf } from '../../../src/engine/score';
import { world } from '../world';
import { COLONY_LIMITS } from '../../../src/engine/data/colony';
import { CROSSES } from '../../../src/engine/data/crosses';
import { CUSTOM_HOUSE } from '../../../src/engine/data/custom-house';
import { HORSES } from '../../../src/engine/data/food';
import { LIBERTY } from '../../../src/engine/data/liberty';

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
  const quarters = (q: number): string => `+${DEFENSE_STEP_PERCENT * q}%`;
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


// --- The Map (R-1028) ------------------------------------------------------------------------

/** A bare square of one terrain row: no river, road, plowing or resource. */
function bareTile(terrain: TerrainId): Tile {
  if (terrain === 'hills' || terrain === 'mountains') return makeTile({ base: 'plains', relief: terrain });
  if (Object.hasOwn(CLEARED_FROM, terrain)) return makeTile({ base: CLEARED_FROM[terrain as ForestTerrain], forest: true });
  return makeTile({ base: terrain as Exclude<TerrainId, ForestTerrain | 'hills' | 'mountains'> });
}

const rawGoodName = (good: RawGood): string => (good === 'fish' ? 'Fish' : GOOD_NAMES[good]);

/** "3 Food, 3 Tobacco": what a free colonist brings in on the square, zeros left out. */
function yieldsOn(tile: Tile, waterNeighbors = 0): string {
  return RAW_GOODS.flatMap((good) => {
    const n = tileYield(tile, good, FREE_COLONIST, { waterNeighbors });
    return n > 0 ? [`${n} ${rawGoodName(good)}`] : [];
  }).join(', ');
}

function terrainKind(terrain: TerrainId): string {
  const def = TERRAIN[terrain];
  if (def.water) return 'water';
  if (def.kind === 'open') return 'open';
  if (def.kind === 'forest') return 'forested';
  return terrain === 'arctic' ? 'ice' : terrain;
}

/** "4 Fish with 0 to 5 water neighbours, 2 Fish with 6 to 7, ...": one entry per band of the fish rule. */
function fishByBand(tile: Tile): string {
  const mins = YIELD_RULES.fishByWaterNeighbors.map(([min]) => min).sort((a, b) => a - b);
  return mins.map((min, i) => {
    const next = mins[i + 1];
    const band = next === undefined ? (min === 8 ? 'all 8' : `${min} or more`) : next - 1 === min ? `${min}` : next - 2 === min ? `${min} or ${next - 1}` : `${min} to ${next - 1}`;
    return `${yieldsOn(tile, min)} with ${band}${i === 0 ? ' of the 8 neighbours water' : ''}`;
  }).join(', ');
}

function terrainTable(): string {
  return mdTable(
    ['', 'Terrain', 'Kind', 'Move cost', 'Defence', 'A free colonist gets', 'Cleared, it becomes'],
    TERRAIN_IDS.map((t) => {
      const def = TERRAIN[t];
      const tile = bareTile(t);
      const fish = def.water ? fishByBand(tile) : yieldsOn(tile) || 'nothing';
      const defence = defensePercent(t);
      return [
        img(`images/art/terrain/${t}.png`, def.name), def.name, terrainKind(t), def.moveCost, defence === 0 ? 'none' : `+${defence}%`, fish,
        Object.hasOwn(CLEARED_FROM, t) ? TERRAIN[CLEARED_FROM[t as ForestTerrain]].name : '',
      ];
    }),
  );
}

function pioneerWork(): string {
  const turns = (n: number, hardy: number): string => `${n} (${hardy})`;
  return mdTable(
    ['Terrain', 'Road', 'Clear the forest', 'Plow'],
    TERRAIN_IDS.filter((t) => !TERRAIN[t].water).map((t) => {
      const tile = bareTile(t);
      const forest = Object.hasOwn(CLEARED_FROM, t);
      const noPlow = (PIONEER_WORK.noPlow as readonly string[]).includes(t);
      const job = (j: 'road' | 'plow'): string => turns(jobTurns(tile, j, false), jobTurns(tile, j, true));
      return [TERRAIN[t].name, job('road'), forest ? job('plow') : '', forest ? 'clear first' : noPlow ? 'cannot be plowed' : job('plow')];
    }),
  );
}

/** What a resource adds to a free colonist's figure and to an expert's, read from the yield rule itself. */
function resourceEffectText(r: ResourceId, bare: Tile): string {
  const tile = { ...bare, resource: r };
  const bonuses: Partial<Record<RawGood, ResourceBonus>> = RESOURCE_BONUS[r];
  const parts = RAW_GOODS.flatMap((good) => {
    const b = bonuses[good];
    if (!b) return [];
    if (b.kind === 'double') return [`doubles ${rawGoodName(good)}`];
    const gain = (w: OutdoorWorker): number => tileYield(tile, good, w) - tileYield(bare, good, w);
    return [`+${gain(FREE_COLONIST)} ${rawGoodName(good)} (+${gain({ ...FREE_COLONIST, expertGood: good })} for the expert)`];
  });
  return parts.join(', ');
}

/** Every resource a map can carry. The Depleted Mine is left out: no map places one and no deposit becomes one in play. */
function resourceTable(): string {
  return mdTable(
    ['', 'Resource', 'Found on', 'Adds'],
    RESOURCE_IDS.filter((r) => r !== 'depletedMine').map((r) => {
      const terrains: readonly TerrainId[] = RESOURCE_TERRAINS[r];
      const bare = bareTile(terrains[0]!);
      return [img(`images/art/resources/${r}.png`, RESOURCES[r].name), RESOURCES[r].name, terrains.map((t) => TERRAIN[t].name).join(', '), resourceEffectText(r, bare)];
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
    'Sullen. They will not teach, a demand for tribute that fails is refused or laughed at, and their braves come to your colonies with black looks only.',
    'Hostile. Ships are turned away, wagon trains risk their cargo, scouts are killed, and braves attack your units and colonies.',
    'This settlement alone has turned on you: ships are turned away and its brave attacks your units and colonies.',
  ];
  return mdTable(
    ['Attitude', 'Mark', 'When', 'What it means'],
    ATTITUDES.map((name, i) => [name, inkName(MOOD_COLORS[i]!), when[i]!, means[i]!]),
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

// --- R-1030: Colonies and Buildings --------------------------------------------------------------

const chainNames = (chain: BuildingChain): string =>
  (BUILDING_CHAINS[chain] as readonly BuildingId[]).filter((id) => !BUILDINGS[id].unused).map((id) => BUILDINGS[id].name).join(' → ');
const expertsFor = (good: RawGood): string[] => PROFESSION_IDS.filter((p) => PROFESSIONS[p].expertGood === good).map((p) => PROFESSIONS[p].name);

/**
 * Where a free colonist gets this raw good on a bare square, best first, as "Plains 5, Savannah 4,
 * Tundra 3 and 14 more". Fish are counted on a shore square (fewer water neighbours give more).
 */
function bestSquares(good: RawGood, shown = 3): string {
  const rows = TERRAIN_IDS.map((t) => ({ name: TERRAIN[t].name, n: tileYield(bareTile(t), good) }))
    .filter((r) => r.n > 0)
    .sort((a, b) => b.n - a.n);
  const head = rows.slice(0, shown).map((r) => `${r.name} ${r.n}`).join(', ');
  if (rows.length === 0) {
    // silver: a bare square gives none without a deposit, but a road brings a little out
    const roads = TERRAIN_IDS.map((t) => ({ name: TERRAIN[t].name, n: tileYield({ ...bareTile(t), road: true }, good) })).filter((r) => r.n > 0);
    return `${roads.map((r) => `${r.name} ${r.n} with a road`).join(', ')}; more on a silver or mineral deposit`;
  }
  return rows.length > shown ? `${head} and ${rows.length - shown} more` : head;
}

/** Fish on a bare Ocean square by how many of its eight neighbours are water: "fish 4 with up to 5 water neighbours, ...". */
function fishByWater(): string {
  const steps = [...YIELD_RULES.fishByWaterNeighbors].map(([min]) => min).sort((a, b) => a - b);
  const parts = steps.map((min, i) => {
    const max = (steps[i + 1] ?? 9) - 1;
    const n = tileYield(bareTile('ocean'), 'fish', undefined, { waterNeighbors: min, hasDocks: true });
    const span = min === 0 ? `up to ${max}` : min === max ? `${min}` : `${min} or ${max}`;
    return `${n} with ${span} water neighbours`;
  });
  return `fish ${parts.join(', ')}`;
}

function goodsRow(good: GoodId | AbstractGoodId): (string | number)[] {
  const icon = img(`images/art/goods/${good}.png`, goodName(good));
  if ((RAW_GOODS as readonly string[]).includes(good)) {
    const raw = good as RawGood;
    if (raw === 'food') {
      return [icon, goodName(good), 'Raw', 'Land; water too once the colony has Docks (fish)', [...expertsFor('food'), ...expertsFor('fish')].join(', '),
        `A square: ${bestSquares('food')}; ${fishByWater()}`];
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
    if (b.level === 2) {
      const base = PRODUCTION.base.skilled;
      return `Each worker makes his base amount again on top: a free colonist ${2 * base} instead of ${base}, an expert ${2 * base * PRODUCTION.expertMultiplier} instead of ${base * PRODUCTION.expertMultiplier}.`;
    }
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
    case 'stable': return `A big herd breeds faster: up to ${HORSES.perHerd} new horses for every ${HORSES.herdSizeWithStable} in the herd (or part of ${HORSES.herdSizeWithStable}) instead of every ${HORSES.herdSize}, food and room allowing.`;
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

/** The renderer for each block name: GitHub Markdown, a table or a list. */
export const TABLES: Readonly<Record<string, () => string>> = {
  'difficulty-levels': difficultyLevels,
  nations,
  controls,
  options,
  units,
  professions,
  'combat-modifiers': combatModifiers,
  'ship-repairs': shipRepairs,
  terrain: terrainTable,
  'pioneer-work': pioneerWork,
  resources: resourceTable,
  tribes,
  'native-attitudes': nativeAttitudes,
  fathers,
  'father-cost': fatherCostTable,
  score,
  'score-rating': scoreRating,
  honours,
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
