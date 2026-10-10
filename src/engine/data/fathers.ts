// Founding Fathers: category, then the weight with which
// each is offered in three eras (1492-1600, 1600-1700, 1700 on). Effects are applied by the
// rules that consult hasFather(); the one-line summaries here are our own wording.

export const FATHER_CATEGORIES = ['trade', 'exploration', 'military', 'political', 'religious'] as const;
export type FatherCategory = (typeof FATHER_CATEGORIES)[number];

export const FATHER_IDS = [
  'adamSmith', 'jakobFugger', 'peterMinuit', 'peterStuyvesant', 'janDeWitt',
  'ferdinandMagellan', 'franciscoCoronado', 'hernandoDeSoto', 'henryHudson', 'laSalle',
  'hernanCortes', 'georgeWashington', 'paulRevere', 'francisDrake', 'johnPaulJones',
  'thomasJefferson', 'pocahontas', 'thomasPaine', 'simonBolivar', 'benjaminFranklin',
  'williamBrewster', 'williamPenn', 'jeanDeBrebeuf', 'juanDeSepulveda', 'bartolomeDeLasCasas',
] as const;
export type FatherId = (typeof FATHER_IDS)[number];

export interface FatherDef {
  readonly name: string;
  readonly category: FatherCategory;
  /** Offer weights for the three eras. */
  readonly weights: readonly [number, number, number];
  readonly effect: string;
}

const f = (name: string, category: FatherCategory, w1: number, w2: number, w3: number, effect: string): FatherDef => ({ name, category, weights: [w1, w2, w3], effect });

export const FATHERS = {
  adamSmith: f('Adam Smith', 'trade', 2, 8, 6, 'Factories and the Arsenal can be built: half again the goods from the same materials.'),
  jakobFugger: f('Jakob Fugger', 'trade', 0, 5, 8, 'Every boycott in Europe is lifted and back taxes forgiven.'),
  peterMinuit: f('Peter Minuit', 'trade', 9, 1, 0, 'Natives no longer ask payment for their land.'),
  peterStuyvesant: f('Peter Stuyvesant', 'trade', 2, 4, 8, 'Custom Houses can be built, selling goods without ships.'),
  janDeWitt: f('Jan de Witt', 'trade', 2, 6, 10, 'Trade with foreign colonies; fuller Foreign Affairs report.'),
  ferdinandMagellan: f('Ferdinand Magellan', 'exploration', 2, 10, 10, 'Ships move one square farther; Atlantic crossings are never slow.'),
  franciscoCoronado: f('Francisco Coronado', 'exploration', 3, 5, 7, 'Every colony on the map and its surroundings are revealed.'),
  hernandoDeSoto: f('Hernando de Soto', 'exploration', 5, 10, 5, 'Scouts never return from a rumor empty-handed; every unit sees one square farther.'),
  henryHudson: f('Henry Hudson', 'exploration', 10, 1, 0, 'Fur trappers bring in twice the furs.'),
  laSalle: f('Sieur De La Salle', 'exploration', 7, 5, 3, 'Every colony of three or more gets a Stockade.'),
  hernanCortes: f('Hernan Cortes', 'military', 6, 5, 1, 'Conquered settlements always yield treasure, more of it, and the Crown ships it for the tax alone.'),
  georgeWashington: f('George Washington', 'military', 0, 4, 10, 'Soldiers and dragoons that win a battle are always promoted.'),
  paulRevere: f('Paul Revere', 'military', 10, 2, 1, 'A colony with no soldier arms a colonist from its muskets when attacked.'),
  francisDrake: f('Francis Drake', 'military', 4, 8, 6, 'Privateers fight half again as well.'),
  johnPaulJones: f('John Paul Jones', 'military', 0, 6, 7, 'A Frigate sails from Europe to join the fleet.'),
  thomasJefferson: f('Thomas Jefferson', 'political', 4, 5, 6, 'Liberty bell production rises by half.'),
  pocahontas: f('Pocahontas', 'political', 7, 5, 3, 'All native tension is forgotten, and alarm grows half as fast.'),
  thomasPaine: f('Thomas Paine', 'political', 1, 2, 8, 'Liberty bell production rises by the tax rate.'),
  simonBolivar: f('Simon Bolivar', 'political', 0, 4, 6, 'Sons of Liberty membership rises by 20 points in every colony.'),
  benjaminFranklin: f('Benjamin Franklin', 'political', 5, 5, 5, "The King's wars in Europe no longer reach the colonies; rivals ask less in negotiations."),
  williamBrewster: f('William Brewster', 'religious', 7, 4, 1, 'No criminals or servants emigrate, and you choose who comes.'),
  williamPenn: f('William Penn', 'religious', 8, 5, 2, 'Preachers produce half again as many crosses.'),
  jeanDeBrebeuf: f('Jean de Brebeuf', 'religious', 6, 6, 1, 'Every mission, standing or new, works as a Jesuit mission.'),
  juanDeSepulveda: f('Juan de Sepulveda', 'religious', 3, 8, 3, 'Natives of defeated settlements more often convert and join you.'),
  bartolomeDeLasCasas: f('Bartolome de las Casas', 'religious', 0, 5, 10, 'Every Indian convert, in a colony or out, becomes a Free Colonist.'),
} as const satisfies Record<FatherId, FatherDef>;

/** Years at which the second and third weight columns take over. */
export const FATHER_ERAS = [1600, 1700] as const;
