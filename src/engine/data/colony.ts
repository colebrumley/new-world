import type { NationId } from './nations';

// Default colony names per nation, in the order they are handed out.
// Historical place names; a few repeat within a list.
export const COLONY_NAMES = {
  england: [
    'Jamestown', 'Plymouth', 'Roanoke', 'Barbados', 'Penobscot', 'Boston', 'Baltimore', 'Providence', 'Hartford',
    'New Haven', 'New York', 'Albany', 'New Jersey', 'Charleston', 'Philadelphia', 'Newport', 'Yorktown', 'Annapolis',
    'Halifax', 'Lexington', 'Savannah', 'Williamsburg', "St. John's", 'Norfolk', 'Concord', 'Wilmington', 'Richmond',
    'Portsmouth', 'Camden', 'Springfield', 'Newport News', 'Antigua', 'Rupert House', 'Kingston', 'Reading', 'Ottawa',
  ],
  france: [
    'Quebec', 'Montreal', 'Guadeloupe', 'Cayenne', 'St. Louis', 'Martinique', 'Port Royal', 'Port au Prince',
    'Trois Rivieres', 'New Orleans', 'Fort Caroline', 'Fort Detroit', 'Fort Frontenac', 'Fort Pontchartain',
    'Fort Tadoussac', 'Fort Canada', 'Fort Niagara', 'Fort Crevecoeur', 'Fort Roquelai', 'Fort Laguille',
    'Fort Brest', 'Fort Richelieu', 'Fort Louis', 'Fort Prudhome', 'Fort Sandouski', 'Fort du Quesne', 'Fort Erie',
    'Fort Maurepas', 'Fort Francois Xavier', 'Fort St. Michel', 'Fort Chicago', 'Fort-de-France', 'Fort Frances',
    'Fort St. Joseph', 'Fort Miannis', 'Fort Orleans', 'Fort St. Ignace', 'Fort Le Rocher', 'Fort Miyamis',
    'Fort Rosalie', 'Fort Balise', 'Fort Conde', 'Fort Pensacola', 'Fort Toulouse', 'Fort St. John', 'Fort Kappa',
    'Fort Biloxi', 'Fort Mobile', 'Sault Ste. Marie', 'Baton Rouge', 'Denonville', 'Gananoque', 'St. Croix',
    'Port Cartier', 'Terre Haute', 'Trois Pistoles', 'Sept-Iles', 'Louisville', 'St. Barthelemy', 'St. Pierre',
    'Miquelon', 'Des Moines', 'Havre St. Pierre', 'Port Menier', 'Portage la Prairie', 'St. Boniface',
  ],
  spain: [
    'Isabella', 'Santo Domingo', 'San Salvador', 'Veracruz', 'Havana', 'Trinidad', 'San Juan', 'Panama', 'Cartajena',
    'St. Augustine', 'Lima', 'Buenos Aires', 'Guatemala', 'Honduras', 'Potosi', 'Santiago', 'Guadalajara', 'Asuncion',
    'Managua', 'Costa Rica', 'Santa Fe', 'Los Angeles', 'Bogota', 'Corpus Christi', 'Acapulco', 'Santa Marta',
    'San Agostin', 'Caracas', 'Tobago', 'San Francisco', 'Santiago', 'San Diego', 'San Angelo', 'El Paso', 'Cancun',
    'Valparaiso', 'Concepcion', 'La Plata', 'Port of Spain',
  ],
  netherlands: [
    'New Amsterdam', 'Fort Orange', 'Fort Nassau', 'New Holland', 'Vlissingen', 'Curacao', 'Recife', 'Bahia',
    'Paramaribo', 'Pernambuco', 'St. Martin', 'St. Eustatius', 'Essequibo', 'Berbice', 'Surinam', 'Paraiba',
    'Bonaire', 'Willemstad', 'Aruba', 'Santa Catharina', 'Saba', 'Utrecht', 'Haarlem', 'Tappans', 'Hoboken',
    'Rensselaerswyck', 'Nederhorst', 'Fort Cristina', 'Gottenburgh', 'Fort Kasimiris', 'Fort Elsenburgh', 'Naiack',
  ],
} as const satisfies Record<NationId, readonly string[]>;

export const COLONY_LIMITS = {
  /** Colonies in the whole game, all powers together. */
  maxColonies: 48,
  /** Colonies a human power may hold before it can found no more (colonies taken in war are not counted against it). */
  maxColoniesPerPower: 38,
  /** Colonists one colony may hold. */
  maxPopulation: 32,
  /** With a stockade or better, the population may not be reduced below this by choice. */
  stockadeMinPopulation: 3,
  /** Fortifications that pin a colony in place. */
  fortifications: ['stockade', 'fort', 'fortress'],
  /** A site scoring fewer points than this earns a warning (see siteWarnings). */
  fewSpacesBelow: 4,
  /** Difficulty levels on which the forest and space warnings are given. */
  tutorialLevels: ['discoverer', 'explorer'],
  /** With this Founding Father, a colony reaching three colonists gets a Stockade free. */
  freeStockadeFather: 'laSalle',
} as const;

/** Buildings every new colony starts with. */
export const STARTING_BUILDINGS = [
  'townHall', 'carpentersShop', 'blacksmithsHouse', 'tobacconistsHouse', 'weaversHouse', 'rumDistillersHouse', 'furTradersHouse',
] as const;
