// The encyclopedia (R-1002): a reference generated from the rule tables. Every figure is read
// from the table that the engine uses; every sentence is our own.
import { BUILDING_CHAINS, BUILDING_IDS, BUILDINGS, type BuildingId } from '../engine/data/buildings';
import { CUSTOM_HOUSE } from '../engine/data/custom-house';
import { FOOD, HORSES } from '../engine/data/food';
import { FATHER_IDS, FATHERS, type FatherId } from '../engine/data/fathers';
import { GOOD_IDS, GOOD_NAMES, HOLD_CAPACITY, START_BID, type GoodId } from '../engine/data/goods';
import { INDEPENDENCE } from '../engine/data/independence';
import { PROFESSION_IDS, PROFESSIONS, UNSKILLED, type ProfessionId } from '../engine/data/professions';
import { TRADE_IDS, TRADES } from '../engine/data/production';
import { RAW_GOODS, TERRAIN, TERRAIN_IDS, type TerrainId } from '../engine/data/terrain';
import { PIONEER_TOOLS, UNIT_TYPE_IDS, UNIT_TYPES, type UnitTypeId } from '../engine/data/units';

export const PEDIA_CATEGORIES = ['cargo', 'units', 'terrain', 'skills', 'buildings', 'fathers', 'concepts'] as const;
export type PediaCategory = (typeof PEDIA_CATEGORIES)[number];

export const CATEGORY_TITLES: Readonly<Record<PediaCategory, string>> = {
  cargo: 'Cargo', units: 'Units', terrain: 'Terrain', skills: 'Skills', buildings: 'Buildings', fathers: 'Founding Fathers', concepts: 'Concepts',
};

export interface PediaPage {
  readonly category: PediaCategory;
  readonly id: string;
  readonly title: string;
  /** Facts from the tables, as label and value. */
  readonly facts: readonly (readonly [string, string])[];
  /** Our own words about it. */
  readonly prose: readonly string[];
}

export const CONCEPT_IDS = ['disband', 'fortify', 'plowing', 'roads', 'sentry', 'tradeRoute', 'veteranUnits', 'prices', 'taxes', 'libertyBells', 'crosses', 'hammers'] as const;
export type ConceptId = (typeof CONCEPT_IDS)[number];

const title = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
const goodName = (good: string | null): string => (good === null ? '' : (GOOD_NAMES as Readonly<Record<string, string>>)[good] ?? title(good));
const list = (items: readonly string[]): string => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

// --- cargo ---------------------------------------------------------------------------------------

const CARGO_NOTES: Readonly<Record<GoodId, string>> = {
  food: `Every colonist eats two a turn. What is left over is stored, and a colony with ${FOOD.growthAt} in store raises a new colonist.`,
  sugar: 'A cash crop of warm, wet land. Sold raw, or distilled into rum.',
  tobacco: 'A cash crop of grassland. Sold raw, or rolled into cigars.',
  cotton: 'A cash crop of prairie. Sold raw, or woven into cloth.',
  furs: 'Trapped in forest. Sold raw, or made up into coats.',
  lumber: 'Cut in forest. Carpenters turn it into hammers, which is how anything gets built.',
  ore: 'Dug from hills, mountains and swamp. Blacksmiths turn it into tools.',
  silver: 'Mined in the mountains, best where a lode has been found.',
  horses: `They breed by themselves in a colony that holds at least ${HORSES.minimumHerd} and has food to spare, twice as fast with a Stable. Fifty mount a scout or a dragoon.`,
  rum: 'Distilled from sugar, and worth more in Europe than the sugar that went into it.',
  cigars: 'Rolled from tobacco, and worth more in Europe than the leaf.',
  cloth: 'Woven from cotton. Europe and the native peoples both pay well for it.',
  coats: 'Made up from furs, and worth more in Europe than the pelts.',
  tradeGoods: 'Made in Europe and wanted by the native peoples; nothing in the colonies produces them.',
  tools: 'Forged from ore. Pioneers use twenty for each piece of work, larger buildings need them, and gunsmiths turn them into muskets.',
  muskets: 'Made from tools. Fifty arm a soldier.',
};

function cargoPage(good: GoodId): PediaPage {
  const maker = TRADE_IDS.find((t) => TRADES[t].output === good);
  const user = TRADE_IDS.find((t) => TRADES[t].input === good);
  const lands = (RAW_GOODS as readonly string[]).includes(good)
    ? TERRAIN_IDS.filter((t) => TERRAIN[t].yields[good as (typeof RAW_GOODS)[number]] > 0).map((t) => TERRAIN[t].name)
    : [];
  const facts: [string, string][] = [['Opening price in Europe', `${START_BID[good][0]} to ${START_BID[good][1]} (what the port pays)`], ['A full hold', String(HOLD_CAPACITY)]];
  if (maker && TRADES[maker].input) facts.push(['Made from', `${goodName(TRADES[maker].input)} by a ${TRADES[maker].name}`]);
  if (user) facts.push(['Made into', `${goodName(TRADES[user].output)} by a ${TRADES[user].name}`]);
  if (lands.length > 0) facts.push(['Found on', list(lands)]);
  return { category: 'cargo', id: good, title: goodName(good), facts, prose: [CARGO_NOTES[good]] };
}

// --- units ---------------------------------------------------------------------------------------

function unitPage(id: UnitTypeId): PediaPage {
  const u = UNIT_TYPES[id];
  const facts: [string, string][] = [['Moves', String(u.moves)], ['Attack', String(u.attack)], ['Defence', String(u.defense)]];
  if (u.holds > 0) facts.push(['Cargo holds', String(u.holds)]);
  const kit = (['muskets', 'horses', 'tools'] as const).filter((g) => u.equipment[g] > 0).map((g) => `${u.equipment[g]} ${g}`);
  if (kit.length > 0) facts.push(['Carries', list(kit)]);
  if (u.build) facts.push(['Built in a colony for', `${u.build.hammers} hammers${u.build.tools > 0 ? ` and ${u.build.tools} tools` : ''}`]);
  if (u.europePrice !== null) facts.push(['Bought in Europe from', `${u.europePrice} gold`]);
  const prose: string[] = [];
  if (u.native) prose.push('A band of one of the native peoples. It belongs to a settlement and returns there to take up what muskets and horses its people have.');
  else if (u.domain === 'sea') prose.push(u.attack > 0 && u.holds > 0 ? 'A ship that can both carry and fight.' : u.attack > 0 ? 'A warship: she carries no cargo and exists to fight other ships.' : 'A cargo ship: it carries goods and people, and cannot attack.');
  else if (u.colonistRole) prose.push(kit.length > 0 ? 'A colonist equipped for a task. Lay the equipment down in a colony and he is a colonist again; his skill, if he has one, is what he brings to the task.' : 'A person. Inside a colony he works; outside it he can be given equipment and a task.');
  else prose.push('Not a person: it cannot join a colony or be given other work.');
  if (id === 'artillery') prose.push('Strong in a colony, weak in the open. Beaten once it is damaged; beaten again it is lost.');
  if (id === 'wagonTrain') prose.push('Carries cargo overland between colonies and to native settlements. A power may keep one for each colony it has.');
  if (id === 'treasure') prose.push('Gold found in the New World. It must be carried to a coastal colony and then to Europe, by a galleon or by the Crown for a share.');
  return { category: 'units', id, title: u.name, facts, prose };
}

// --- terrain -------------------------------------------------------------------------------------

function terrainPage(id: TerrainId): PediaPage {
  const t = TERRAIN[id];
  const yields = RAW_GOODS.filter((g) => t.yields[g] > 0).map((g) => `${t.yields[g]} ${g}`);
  const facts: [string, string][] = [['Movement cost', String(t.moveCost)], ['Defence bonus', t.defense === 0 ? 'none' : `+${25 * t.defense}%`], ['A free colonist brings in', yields.length > 0 ? list(yields) : 'nothing']];
  if (t.improve > 0 && t.kind !== 'other') facts.push([t.kind === 'forest' ? 'Turns for a pioneer to clear' : 'Turns for a pioneer to plow', String(t.improve)]);
  const prose = [
    t.kind === 'forest' ? 'Forest. It gives lumber and furs; cleared by a pioneer it becomes open land fit for crops.'
      : t.kind === 'open' ? 'Open land. Plowing raises what it grows; a river or a road raises it further.'
        : t.water ? 'Water. Ships sail it; a colony beside it can fish once it has Docks.'
          : 'Rough ground: slow to cross and good to defend.',
  ];
  return { category: 'terrain', id, title: t.name, facts, prose };
}

// --- skills --------------------------------------------------------------------------------------

function skillPage(id: ProfessionId): PediaPage {
  const p = PROFESSIONS[id];
  const facts: [string, string][] = [];
  const trade = TRADE_IDS.find((t) => TRADES[t].expert === id);
  if (p.expertGood) facts.push(['Expert at producing', goodName(p.expertGood)]);
  if (trade && TRADES[trade].output) facts.push(['Expert at making', `${goodName(TRADES[trade].output)}${TRADES[trade].input ? ` from ${goodName(TRADES[trade].input).toLowerCase()}` : ''}`]);
  else if (trade) facts.push(['Expert as a', TRADES[trade].name]);
  if (p.expertRole) facts.push(['Expert as a', p.expertRole]);
  if (!UNSKILLED.includes(id)) facts.push(['Taught in', p.teachLevel === 1 ? 'a Schoolhouse or better' : p.teachLevel === 2 ? 'a College or better' : p.teachLevel === 3 ? 'a University' : 'no school']);
  if (p.europePrice !== null) facts.push(['Trained in Europe from', `${p.europePrice} gold`]);
  if (p.nativeTaught) facts.push(['Also learned', 'in a native settlement that practises it']);
  const prose = [
    id === 'freeColonist' ? 'An ordinary colonist with no trade. He can do any work, learn any trade, and is the measure the tables are written for.'
      : id === 'indenturedServant' ? 'Bound to service. As good as anyone in the fields; poor at a craft and poorer still in an office. Schooling or battle can make him free.'
        : id === 'pettyCriminal' ? 'Sent out from the jails. Fit for field work and little else until schooling or battle raises him.'
          : id === 'indianConvert' ? 'One of the native peoples who has come to live in a colony. Better than a colonist on the land and the sea; he does not work indoors and cannot be schooled.'
            : 'A specialist: in his own trade he does about twice the work of a free colonist, and he can teach it in a school of the right standing.',
  ];
  return { category: 'skills', id, title: p.name, facts, prose };
}

// --- buildings -----------------------------------------------------------------------------------

function buildingPage(id: BuildingId): PediaPage {
  const b = BUILDINGS[id];
  const facts: [string, string][] = [['Cost', `${b.hammers} hammers${b.tools > 0 ? ` and ${b.tools} tools` : ''}`], ['Colonists needed to build it', String(b.minPopulation)]];
  if (b.chain) {
    const line = BUILDING_CHAINS[b.chain] as readonly BuildingId[];
    facts.push(['Line', line.map((x) => BUILDINGS[x].name).join(', then ')]);
    const trade = TRADE_IDS.find((t) => TRADES[t].chain === b.chain);
    if (trade) facts.push(['Work done here', TRADES[trade].output ? `${TRADES[trade].name}: ${TRADES[trade].input ? `${goodName(TRADES[trade].input).toLowerCase()} into ` : ''}${goodName(TRADES[trade].output).toLowerCase()}` : TRADES[trade].name]);
  }
  if (b.needsFather) facts.push(['Needs in the Congress', FATHERS[b.needsFather].name]);
  if (b.coastal) facts.push(['Needs', 'a colony on the sea']);
  const prose = [
    b.unused ? 'Listed in the tables but never offered in play.'
      : b.level > 1 ? 'An improvement on the building before it in its line: the same work, done better.'
        : b.chain ? 'The first building of its line. Up to three colonists can work in it.'
          : 'It serves the colony as a whole rather than housing a trade.',
  ];
  return { category: 'buildings', id, title: b.name, facts, prose };
}

// --- fathers -------------------------------------------------------------------------------------

function fatherPage(id: FatherId): PediaPage {
  const f = FATHERS[id];
  const eras = ['early', 'in the middle years', 'late'].filter((_, i) => f.weights[i as 0 | 1 | 2] > 0);
  return {
    category: 'fathers', id, title: f.name,
    facts: [['Field', title(f.category)], ['Likely to be offered', eras.length === 3 ? 'throughout the game' : list(eras)]],
    prose: [f.effect, 'A Founding Father joins the Continental Congress when the colonies have rung enough liberty bells, and his effect lasts for the rest of the game.'],
  };
}

// --- concepts ------------------------------------------------------------------------------------

const CONCEPTS: Readonly<Record<ConceptId, { readonly title: string; readonly facts: readonly (readonly [string, string])[]; readonly prose: readonly string[] }>> = {
  disband: { title: 'Disband', facts: [['Key', 'Shift-D']], prose: ['Removes a unit from the game for good. The game asks first. A colonist is better put to work than disbanded; the order is for units that cost more to keep track of than they are worth.'] },
  fortify: { title: 'Fortify', facts: [['Key', 'F'], ['Bonus', '+50% defence once dug in']], prose: ['A unit told to fortify spends the rest of the turn digging in and from the next turn defends half again as well. It is not asked for orders again until it is woken. Inside a colony with a stockade or stronger works the works count instead.'] },
  plowing: { title: 'Plowing', facts: [['Key', 'P'], ['Tools used', String(PIONEER_TOOLS.perAction)]], prose: ['A pioneer plows open land to raise its crops, or clears a forest square to make open land of it. How many turns it takes depends on the ground, and a hardy pioneer works twice as fast.'] },
  roads: { title: 'Roads', facts: [['Key', 'R'], ['Tools used', String(PIONEER_TOOLS.perAction)]], prose: ['A road lets units cross a square for a third of a move when they come from another road, and raises what the square gives in lumber, furs, ore and silver. Every colony square has one.'] },
  sentry: { title: 'Sentry', facts: [['Key', 'S']], prose: ['A unit on sentry is passed over when orders are asked for. It wakes by itself when a foreign unit comes alongside, or, aboard a ship, when the ship reaches a colony.'] },
  tradeRoute: { title: 'Trade Route', facts: [['Keys', 'Alt+T to define, T to assign']], prose: ['A list of colonies, with what to load and unload at each. A ship or wagon train put on a route carries it out turn after turn without further orders. Sea routes may call at Europe.'] },
  veteranUnits: { title: 'Veteran Units', facts: [['Bonus', '+50% in battle']], prose: ['A veteran soldier fights half again as well as a colonist given the same muskets. A colonist who wins a battle may be promoted in the field. After a Declaration of Independence, veterans in colonies that favour the cause form the Continental Army.'] },
  prices: { title: 'Prices', facts: [['A full hold', String(HOLD_CAPACITY)]], prose: ['Europe quotes two prices for each cargo: what it pays and, a little higher, what it asks. Selling a cargo pushes its price down and buying pushes it up, a little at a time, and the other powers trade in the same market. Manufactured goods fetch more than the raw materials they are made from.'] },
  taxes: { title: 'Taxes', facts: [['Custom House keeps back', String(CUSTOM_HOUSE.keep)]], prose: ['The Crown takes a share of every sale in Europe and raises it from time to time. A rise can be refused by throwing a cargo into the harbour, after which that cargo cannot be traded in Europe until the back taxes are paid. Nothing is owed once independence is declared.'] },
  libertyBells: { title: 'Liberty Bells', facts: [['To declare independence', `${INDEPENDENCE.sentimentNeeded}% rebel sentiment`]], prose: ['Rung by statesmen in a Town Hall, more with a Printing Press or Newspaper. Bells raise Sons of Liberty membership in the colony that rings them, which first removes a production penalty and then earns a bonus; the same bells bring Founding Fathers into the Congress.'] },
  crosses: { title: 'Crosses', facts: [], prose: ['Made by a colony\'s church and its preachers. They stand for religious feeling in Europe: when enough have gathered, another immigrant comes forward on the docks, and each one that comes makes the next a little dearer.'] },
  hammers: { title: 'Hammers', facts: [], prose: ['What carpenters make from lumber. A colony spends them on whatever it is building; costly buildings need tools as well. Hammers are not cargo and cannot be moved or sold.'] },
};

// --- lookup --------------------------------------------------------------------------------------

const IDS: Readonly<Record<PediaCategory, readonly string[]>> = {
  cargo: GOOD_IDS, units: UNIT_TYPE_IDS, terrain: TERRAIN_IDS, skills: PROFESSION_IDS, buildings: BUILDING_IDS, fathers: FATHER_IDS, concepts: CONCEPT_IDS,
};

export function pediaIds(category: PediaCategory): readonly string[] {
  return IDS[category];
}

/** The page for an entry, or null if there is no such entry. */
export function pediaPage(category: PediaCategory, id: string): PediaPage | null {
  if (!IDS[category].includes(id)) return null;
  switch (category) {
    case 'cargo': return cargoPage(id as GoodId);
    case 'units': return unitPage(id as UnitTypeId);
    case 'terrain': return terrainPage(id as TerrainId);
    case 'skills': return skillPage(id as ProfessionId);
    case 'buildings': return buildingPage(id as BuildingId);
    case 'fathers': return fatherPage(id as FatherId);
    case 'concepts': {
      const c = CONCEPTS[id as ConceptId];
      return { category, id, title: c.title, facts: c.facts, prose: c.prose };
    }
  }
}

/** Every entry, by category, with its title. */
export function pediaIndex(): { category: PediaCategory; title: string; entries: { id: string; title: string }[] }[] {
  return PEDIA_CATEGORIES.map((category) => ({
    category,
    title: CATEGORY_TITLES[category],
    entries: IDS[category].map((id) => ({ id, title: pediaPage(category, id)?.title ?? id })),
  }));
}
