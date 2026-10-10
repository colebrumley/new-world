// The four European powers. Each power's
// special strength is applied by the rule it belongs to; `strength` here is our one-line summary.
// Leader traits are three numbers: aggressive(+)/friendly(-),
// expansionist(+)/perfectionist(-), civilizing(+)/militaristic(-).

export const NATION_IDS = ['england', 'france', 'spain', 'netherlands'] as const;
export type NationId = (typeof NATION_IDS)[number];

export interface NationDef {
  readonly name: string;
  readonly adjective: string;
  readonly abbreviation: string;
  readonly homePort: string;
  /** What the power calls its New World holdings. */
  readonly colonyName: string;
  /** What it becomes on winning independence. */
  readonly independentName: string;
  readonly leader: string;
  readonly leaderTraits: { readonly aggressive: number; readonly expansionist: number; readonly civilizing: number };
  /** How its missions are named: this, then the settlement. */
  readonly missionPrefix: string;
  /** A palette index (not used for drawing), and the colour we use. */
  readonly colorIndex: number;
  readonly color: string;
  /** What the power is good at, in a line. */
  readonly strength: string;
  /** Who rules it at home. */
  readonly ruler: string;
  /** The ruler as the opening audience names them: "the Queen of England". */
  readonly court: string;
  /** A short account of the power for the screen where one is chosen (our own words). */
  readonly account: string;
}

export const NATIONS = {
  england: {
    name: 'England', adjective: 'English', abbreviation: 'Eng.', homePort: 'London', colonyName: 'New England',
    independentName: 'United States of America', leader: 'Walter Raleigh',
    leaderTraits: { aggressive: 1, expansionist: -1, civilizing: 0 }, missionPrefix: 'Church of',
    colorIndex: 12, color: '#c8322b', strength: 'Immigration: a third fewer crosses bring each new colonist.', ruler: 'Queen',
    court: 'the Queen of England',
    account: 'Quarrels over religion at home send dissenters across the ocean by the shipload, and the English colonies fill faster than any other. A third fewer crosses bring each new colonist to the docks.',
  },
  france: {
    name: 'France', adjective: 'French', abbreviation: 'Fr.', homePort: 'La Rochelle', colonyName: 'New France',
    independentName: 'Republic of Quebec', leader: 'Jacques Cartier',
    leaderTraits: { aggressive: 0, expansionist: 1, civilizing: 0 }, missionPrefix: 'Sainte Marie de',
    colorIndex: 9, color: '#2f5fc4', strength: 'Cooperation: native alarm rises half as fast.', ruler: 'King',
    court: 'the King of France',
    account: 'Small posts and missions among the forest peoples, trading in furs rather than clearing farms, keep the French on good terms with their neighbours. Native alarm at French colonies and units rises at half the usual rate, and the first pioneer is a hardy one.',
  },
  spain: {
    name: 'Spain', adjective: 'Spanish', abbreviation: 'Span.', homePort: 'Seville', colonyName: 'New Spain',
    independentName: 'Republic of Mexico', leader: 'Christopher Columbus',
    leaderTraits: { aggressive: 1, expansionist: 0, civilizing: -1 }, missionPrefix: 'Santa Maria del',
    colorIndex: 14, color: '#d9c23c', strength: 'Conquest: half again the strength when attacking native settlements.', ruler: 'King',
    court: 'the King of Spain',
    account: 'A generation of soldiers left idle by the end of the Reconquista looks west for gold and takes it by force. Spanish troops fight half again as strong when attacking a native settlement, and the first soldier is a veteran.',
  },
  netherlands: {
    name: 'Netherlands', adjective: 'Dutch', abbreviation: 'Dutch', homePort: 'Amsterdam', colonyName: 'New Netherlands',
    independentName: 'Republic of Surinam', leader: 'Michiel De Ruyter',
    leaderTraits: { aggressive: -1, expansionist: 0, civilizing: 1 }, missionPrefix: 'Church of',
    colorIndex: 13, color: '#d9812e', strength: 'Trade: prices in Amsterdam fall more slowly and recover sooner.', ruler: 'Stadtholder',
    court: 'the Stadtholder of the Netherlands',
    account: 'A republic of merchants with the largest fleet in Europe, the Dutch make trade the whole of their policy. Prices in Amsterdam fall more slowly when goods are sold and recover sooner, and the first ship is a Merchantman.',
  },
} as const satisfies Record<NationId, NationDef>;

/**
 * What each power lands with: one ship carrying soldiers and pioneers
 * (100 tools). The Dutch come in a merchantman; the French pioneer is a hardy one; Spain's
 * soldier is always a veteran, and so is a human's on the two easiest levels.
 */
export const STARTING_FORCE = {
  ship: { england: 'caravel', france: 'caravel', spain: 'caravel', netherlands: 'merchantman' },
  hardyPioneer: ['france'],
  veteranSoldier: ['spain'],
  /** Difficulty levels (by index) on which a human power's soldier is a veteran. */
  humanVeteranBelowLevel: 2,
} as const satisfies { ship: Record<NationId, 'caravel' | 'merchantman'>; hardyPioneer: readonly NationId[]; veteranSoldier: readonly NationId[]; humanVeteranBelowLevel: number };

