import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { listValidActions } from '../../../src/engine/actions';
import { createRng } from '../../../src/engine/rng';
import {
  deserialize, loadGame, migrate, newSession, replay, saveGame, SaveFormatError, serialize, stepSession,
  type GameSession, type Migration,
} from '../../../src/engine/save';
import { SCHEMA_VERSION } from '../../../src/engine/state';

const FIXTURES = join(import.meta.dirname, '../../fixtures/saves');
const OPTIONS = {
  seed: 'save-test',
  players: [
    { id: 'a', name: 'A', kind: 'human' },
    { id: 'b', name: 'B', kind: 'ai' },
  ],
} as const;

function randomSession(seed: number, steps: number): GameSession {
  const rng = createRng(seed);
  let session = newSession({ ...OPTIONS, seed });
  for (let i = 0; i < steps; i++) session = stepSession(session, rng.pick(listValidActions(session.state))).session;
  return session;
}

describe('save/load', () => {
  it('serialize/deserialize round-trips a snapshot', () => {
    const { state } = randomSession(3, 40);
    expect(deserialize(serialize(state))).toEqual(state);
    expect(state.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it.each([1, 2, 3, 4, 5])('replaying 200 random actions from the seed equals the snapshot (seed %i)', (seed) => {
    const session = randomSession(seed, 200);
    expect(session.log).toHaveLength(200);
    expect(replay(session.options, session.log)).toEqual(session.state);
    const loaded = loadGame(saveGame(session));
    expect(loaded).toEqual(session);
    expect(replay(loaded.options, loaded.log)).toEqual(loaded.state);
  });

  it('rejects malformed saves with SaveFormatError', () => {
    const good = JSON.parse(saveGame(randomSession(1, 3))) as Record<string, unknown>;
    const bad: unknown[] = ['{', '[]', '{}', { ...good, schemaVersion: SCHEMA_VERSION + 1 }, { ...good, log: 0 }, { ...good, state: {} }, { ...good, options: {} }];
    for (const b of bad) expect(() => loadGame(typeof b === 'string' ? b : JSON.stringify(b))).toThrow(SaveFormatError);
    expect(() => deserialize('{"schemaVersion":1}')).toThrow(SaveFormatError);
    expect(() => deserialize('nope')).toThrow(SaveFormatError);
  });
});

describe('migration registry', () => {
  const chain: Record<number, Migration> = {
    1: (raw) => ({ ...raw, added: 'in-v2' }),
    2: (raw) => ({ ...raw, renamed: raw['added'], added: 'still' }),
  };

  it('runs each step in order up to the target and stamps the version', () => {
    expect(migrate({ schemaVersion: 1, x: 1 }, chain, 3)).toEqual({ schemaVersion: 3, x: 1, added: 'still', renamed: 'in-v2' });
    expect(migrate({ schemaVersion: 2, added: 'q' }, chain, 3)).toEqual({ schemaVersion: 3, added: 'still', renamed: 'q' });
    expect(migrate({ schemaVersion: 3 }, chain, 3)).toEqual({ schemaVersion: 3 });
  });

  it('fails loudly on gaps, future versions and missing versions', () => {
    expect(() => migrate({ schemaVersion: 1 }, {}, 2)).toThrow(/no migration from schema 1/);
    expect(() => migrate({ schemaVersion: 9 }, chain, 3)).toThrow(/newer version/);
    expect(() => migrate({}, chain, 3)).toThrow(SaveFormatError);
    expect(() => migrate(null, chain, 3)).toThrow(SaveFormatError);
  });
});

describe('fixture saves', () => {
  // UPDATE_FIXTURES=1 writes the fixture for the current schema version. Do that once per
  // schema bump, and never overwrite a fixture for a version that has been released.
  const current = join(FIXTURES, `v${SCHEMA_VERSION}.json`);
  if (process.env['UPDATE_FIXTURES'] || !existsSync(current)) writeFileSync(current, `${saveGame(randomSession(1994, 60))}\n`);

  const files = readdirSync(FIXTURES).filter((f) => /^v\d+\.json$/.test(f));

  it('has a fixture for every schema version', () => {
    expect(files.sort()).toEqual(Array.from({ length: SCHEMA_VERSION }, (_, i) => `v${i + 1}.json`));
  });

  it.each(files)('%s loads and yields a current-version state', (file) => {
    const session = loadGame(readFileSync(join(FIXTURES, file), 'utf8'));
    expect(session.state.schemaVersion).toBe(SCHEMA_VERSION);
    expect(session.log.length).toBeGreaterThan(0);
    expect(Object.keys(session.state.units).length + Object.keys(session.state.colonies).length).toBeGreaterThan(0);
  });
});
