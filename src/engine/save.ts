// Save/load and replay (R-004, constraint C4).
// A save is the current snapshot plus everything needed to rebuild it: the new-game options
// (which carry the seed) and the action log since game start.
import { applyAction, type Action, type GameEvent } from './actions';
import { createGame, type NewGameOptions } from './game';
import { SCHEMA_VERSION, type GameState } from './state';

export interface GameSession {
  readonly options: NewGameOptions;
  readonly log: readonly Action[];
  readonly state: GameState;
}

export interface SaveFile extends GameSession {
  readonly schemaVersion: number;
}

type Json = Record<string, unknown>;
export type Migration = (raw: Json) => Json;

/**
 * MIGRATIONS[n] upgrades a save file object from schema n to n + 1. Never delete an entry:
 * every released version must stay loadable. Add a fixture under test/fixtures/saves per version.
 */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {};

/** Why a save could not be read: not a save at all, from a newer or a no longer readable version, cut short, or with a map that is not the size it claims. */
export type SaveErrorCode = 'notSave' | 'newer' | 'obsolete' | 'incomplete' | 'mapSize';

export class SaveFormatError extends Error {
  readonly code: SaveErrorCode;
  constructor(message: string, code: SaveErrorCode = 'notSave') {
    super(message);
    this.name = 'SaveFormatError';
    this.code = code;
  }
}

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

export function migrate(raw: unknown, migrations: Readonly<Record<number, Migration>> = MIGRATIONS, target = SCHEMA_VERSION): Json {
  if (!isObject(raw)) throw new SaveFormatError('save is not an object');
  let version = raw['schemaVersion'];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) throw new SaveFormatError('save has no schemaVersion');
  if (version > target) throw new SaveFormatError(`save is from a newer version (${version} > ${target})`, 'newer');
  let current = raw;
  while (version < target) {
    const step = migrations[version];
    if (!step) throw new SaveFormatError(`no migration from schema ${version}`, 'obsolete');
    current = { ...step(current), schemaVersion: version + 1 };
    version++;
  }
  return current;
}

function parse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new SaveFormatError('save is not valid JSON');
  }
}

function assertState(raw: unknown): asserts raw is GameState {
  if (!isObject(raw)) throw new SaveFormatError('state is not an object');
  for (const key of ['schemaVersion', 'rng', 'turn', 'current', 'players', 'map', 'units'] as const) {
    if (!(key in raw)) throw new SaveFormatError(`state is missing "${key}"`, 'incomplete');
  }
  const map = raw['map'];
  if (!isObject(map) || !Array.isArray(map['tiles']) || typeof map['width'] !== 'number' || typeof map['height'] !== 'number') throw new SaveFormatError('state has no map', 'incomplete');
  if (map['tiles'].length !== map['width'] * map['height']) {
    throw new SaveFormatError(`map size mismatch: ${map['tiles'].length} squares for a ${map['width']} by ${map['height']} map`, 'mapSize');
  }
}

/** Snapshot only. */
export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

export function deserialize(text: string): GameState {
  const state = migrateState(parse(text));
  assertState(state);
  return state;
}

// A bare snapshot is migrated by wrapping it as a save file so one registry serves both.
function migrateState(raw: unknown): unknown {
  if (!isObject(raw)) throw new SaveFormatError('state is not an object');
  const wrapped = migrate({ schemaVersion: raw['schemaVersion'], state: raw });
  const state = wrapped['state'];
  return isObject(state) ? { ...state, schemaVersion: wrapped['schemaVersion'] } : state;
}

export function newSession(options: NewGameOptions): GameSession {
  return { options, log: [], state: createGame(options) };
}

/** Apply an action and append it to the log. */
export function stepSession(session: GameSession, action: Action): { session: GameSession; events: readonly GameEvent[] } {
  const { state, events } = applyAction(session.state, action);
  return { session: { options: session.options, log: [...session.log, action], state }, events };
}

/** Rebuild a state from the seed by re-applying the log. */
export function replay(options: NewGameOptions, log: readonly Action[]): GameState {
  let state = createGame(options);
  for (const action of log) state = applyAction(state, action).state;
  return state;
}

export function saveGame(session: GameSession): string {
  const file: SaveFile = { schemaVersion: SCHEMA_VERSION, options: session.options, log: session.log, state: session.state };
  return JSON.stringify(file);
}

export function loadGame(text: string): GameSession {
  const file = migrate(parse(text));
  const { options, log, state } = file;
  if (!isObject(options) || !('seed' in options)) throw new SaveFormatError('save has no new-game options', 'incomplete');
  if (!Array.isArray(log)) throw new SaveFormatError('save has no action log', 'incomplete');
  const upgraded = isObject(state) ? { ...state, schemaVersion: file['schemaVersion'] } : state;
  assertState(upgraded);
  return { options: options as unknown as NewGameOptions, log: log as Action[], state: upgraded };
}
