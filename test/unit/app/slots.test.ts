import { describe, expect, it } from 'vitest';
import { describeLoadError, describeSession, exportName, keepDecade } from '../../../src/app/slots';
import { firstTurnOfYear } from '../../../src/engine/calendar';
import { loadGame, migrate, saveGame, SaveFormatError, type GameSession } from '../../../src/engine/save';
import { SCHEMA_VERSION, type GameState } from '../../../src/engine/state';
import { withColony, world } from '../../helpers/world';

const ROWS = ['~~~~~~', '~....~', '~....~', '~~~~~~'];
const session = (turn = 0, name = 'Player'): GameSession => {
  const made = withColony(world({ rows: ROWS, seed: 4, players: [{ id: 'a' }, { id: 'b', kind: 'ai', nation: 'france' }] }), { id: 'col', x: 2, y: 1, name: 'C' });
  const state: GameState = { ...made, turn, players: made.players.map((p) => (p.id === 'a' ? { ...p, name } : p)) };
  return { options: { seed: 4 }, log: [], state };
};
const errorOf = (text: string): unknown => {
  try {
    loadGame(text);
    return null;
  } catch (error) {
    return error;
  }
};

describe('a saved game', () => {
  it('is summed up in a line: who, when, how hard, how large', () => {
    expect(describeSession(session())).toBe('Walter Raleigh of England, 1492, Conquistador, 1 colony');
    expect(describeSession(session(firstTurnOfYear(1700) + 1))).toBe('Walter Raleigh of England, Autumn 1700, Conquistador, 1 colony');
    expect(exportName(session(firstTurnOfYear(1620)))).toBe('new-world-england-1620.json');
  });

  it("names the human as they named themselves; a player named only Player (an older save) is the leader", () => {
    expect(describeSession(session(0, 'Cortes'))).toBe('Cortes of England, 1492, Conquistador, 1 colony');
    expect(describeSession(session(0, 'Player'))).toBe('Walter Raleigh of England, 1492, Conquistador, 1 colony');
  });

  it('loads back exactly as it was saved', () => {
    const s = session(42);
    expect(loadGame(saveGame(s))).toEqual(s);
  });
});

describe('a save that will not load says why', () => {
  const good = (): Record<string, unknown> => JSON.parse(saveGame(session())) as Record<string, unknown>;

  it('not a saved game at all', () => {
    for (const text of ['hello', '[1, 2, 3]', '{"some":"json"}']) {
      const error = errorOf(text);
      expect(error).toBeInstanceOf(SaveFormatError);
      expect((error as SaveFormatError).code).toBe('notSave');
      expect(describeLoadError(error)).toBe('That is not a New World saved game.');
    }
  });

  it('from a newer version, or one too old to read', () => {
    const newer = errorOf(JSON.stringify({ ...good(), schemaVersion: SCHEMA_VERSION + 1 }));
    expect((newer as SaveFormatError).code).toBe('newer');
    expect(describeLoadError(newer)).toContain('newer version');
    // a save from before the oldest schema this build can migrate from
    const obsolete = (() => {
      try {
        migrate({ ...good(), schemaVersion: 1 }, {}, 3);
        return null;
      } catch (error) {
        return error;
      }
    })();
    expect((obsolete as SaveFormatError).code).toBe('obsolete');
    expect(describeLoadError(obsolete)).toContain('obsolete');
    expect(describeLoadError(new SaveFormatError('no migration from schema 1', 'obsolete'))).toContain('obsolete');
  });

  it('with a map that is not the size it says', () => {
    const file = good();
    const state = file['state'] as { map: { tiles: unknown[]; width: number; height: number } };
    const damaged = errorOf(JSON.stringify({ ...file, state: { ...state, map: { ...state.map, tiles: state.map.tiles.slice(3) } } }));
    expect((damaged as SaveFormatError).code).toBe('mapSize');
    expect((damaged as SaveFormatError).message).toBe('map size mismatch: 21 squares for a 6 by 4 map');
    expect(describeLoadError(damaged)).toContain('map is not the size');
  });

  it('cut short', () => {
    const file = good();
    const { units: _units, ...rest } = file['state'] as Record<string, unknown>;
    expect((errorOf(JSON.stringify({ ...file, state: rest })) as SaveFormatError).code).toBe('incomplete');
    const { log: _log, ...noLog } = file;
    expect(describeLoadError(errorOf(JSON.stringify(noLog)))).toBe('That saved game is incomplete.');
    expect(describeLoadError(new Error('disk on fire'))).toBe('That saved game could not be read.');
  });
});

describe('the decade copy', () => {
  it('is taken only as a year ending in nought opens', () => {
    // no browser store in this test: what matters is when it tries
    const tries = (turn: number): boolean => {
      const store = new Map<string, string>();
      (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
      try {
        return keepDecade(session(turn)) && store.has('new-world:slot:8');
      } finally {
        delete (globalThis as { localStorage?: unknown }).localStorage;
      }
    };
    expect(tries(firstTurnOfYear(1500))).toBe(true);
    expect(tries(firstTurnOfYear(1501))).toBe(false);
    expect(tries(firstTurnOfYear(1700))).toBe(true); // spring
    expect(tries(firstTurnOfYear(1700) + 1)).toBe(false); // autumn of the same year
    expect(tries(firstTurnOfYear(1705))).toBe(false);
  });
});
