// Player options (R-1001): the game options and the colony report options, as plain data.
// Reading and writing them to the browser is src/app/storage.ts; the dialog is options-dialog.ts.

export const GAME_OPTIONS = [
  { key: 'showIndianMoves', label: 'Show Indian moves', hint: 'Note in the log what native units were seen doing between our turns.', default: true },
  { key: 'showForeignMoves', label: 'Show foreign moves', hint: 'Note in the log what foreign units were seen doing between our turns.', default: true },
  { key: 'fastPieceSlide', label: 'Fast piece slide', hint: 'Pieces move at once instead of sliding.', default: false },
  { key: 'endOfTurn', label: 'End of turn', hint: 'Wait for Enter when every unit has moved, instead of ending the turn at once.', default: true },
  { key: 'autosave', label: 'Autosave', hint: 'Keep the game in this browser after every action.', default: true },
  { key: 'combatAnalysis', label: 'Combat analysis', hint: 'Show the odds and ask before an attack.', default: true },
  { key: 'waterShimmer', label: 'Water shimmer', hint: 'Animate the sea.', default: true },
  { key: 'tutorialHints', label: 'Tutorial hints', hint: 'Advice in the log at the moments a newcomer needs it.', default: true },
] as const;

export const COLONY_OPTIONS = [
  { key: 'buildingLabels', label: 'Labels on buildings', hint: 'Name each building on the colony screen.', default: true },
  { key: 'cargoLabels', label: 'Labels on cargo and terrain', hint: 'Name each cargo and what each square yields.', default: true },
  { key: 'reportTrained', label: 'Report when colonists are trained', hint: '', default: true },
  { key: 'reportFood', label: 'Report food shortages', hint: '', default: true },
  { key: 'reportRawMaterials', label: 'Report raw materials shortages', hint: '', default: true },
  { key: 'reportTools', label: 'Report tools needed for production', hint: '', default: true },
  { key: 'reportInefficient', label: 'Report inefficient government', hint: '', default: true },
  { key: 'reportNewCargo', label: 'Report new cargos available', hint: '', default: true },
  { key: 'reportSonsOfLiberty', label: 'Report Sons of Liberty membership', hint: '', default: true },
  { key: 'reportRebelMajority', label: 'Report rebel majorities', hint: '', default: true },
] as const;

export const SOUND_OPTIONS = [
  { key: 'backgroundMusic', label: 'Background music', hint: 'A quiet tune made up as it goes, in an old mode.', default: false },
  { key: 'eventMusic', label: 'Event music', hint: 'A short flourish when something is built, someone arrives, or the drums of war sound.', default: true },
  { key: 'soundEffects', label: 'Sound effects', hint: 'Footfalls, gunfire, the turn of the year.', default: true },
] as const;

export type GameOptionKey = (typeof GAME_OPTIONS)[number]['key'];
export type ColonyOptionKey = (typeof COLONY_OPTIONS)[number]['key'];
export type SoundOptionKey = (typeof SOUND_OPTIONS)[number]['key'];
export type OptionKey = GameOptionKey | ColonyOptionKey | SoundOptionKey;
export type Options = Readonly<Record<OptionKey, boolean>>;

export const DEFAULT_OPTIONS: Options = Object.fromEntries([...GAME_OPTIONS, ...COLONY_OPTIONS, ...SOUND_OPTIONS].map((o) => [o.key, o.default])) as Record<OptionKey, boolean>;

/** Options from stored text: anything missing or malformed falls back to its default. */
export function parseOptions(text: string | null): Options {
  const read = (): unknown => {
    try {
      return text === null ? null : JSON.parse(text);
    } catch {
      return null;
    }
  };
  const raw = read();
  const given = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const out: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(DEFAULT_OPTIONS)) out[key] = typeof given[key] === 'boolean' ? (given[key] as boolean) : value;
  return out as Options;
}

export function serializeOptions(options: Options): string {
  return JSON.stringify(options);
}
