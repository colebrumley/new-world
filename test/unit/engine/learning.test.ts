import { describe, expect, it } from 'vitest';
import { applyAction, validateAction, type Action, type GameEvent } from '../../../src/engine/actions';
import { tribalAlarm } from '../../../src/engine/alarm';
import { LEARNING, SKILL_FOR_GOOD, TEACHABLE } from '../../../src/engine/data/learning';
import { settlementPopulation } from '../../../src/engine/data/tribes';
import type { DIFFICULTIES } from '../../../src/engine/data/yields';
import { settlementSkill, type LearningEvent } from '../../../src/engine/learning';
import type { GameState, Settlement, TribeState } from '../../../src/engine/state';
import { setTile, withUnit, world } from '../../helpers/world';

type Level = (typeof DIFFICULTIES)[number];
const village = (tribe: Settlement['tribe'], x: number, y: number, extra: Partial<Settlement> = {}): Settlement => ({
  id: 'v', tribe, x, y, capital: false, population: settlementPopulation(tribe, false).start, growth: 0, taught: false, tributePaid: false,
  alarm: {}, mission: null, scouted: [], lastBought: null, lastSold: null, haggleMemory: null, ...extra,
});
const record = (extra: Partial<TribeState> = {}): TribeState => ({ alarm: {}, goodwill: {}, met: ['a', 'b'], muskets: 0, horses: 0, breeding: 0, silver: 0, peace: ['a', 'b'], landSold: 0, grudge: [], joinedCrown: false, visited: {}, stock: {}, ...extra });
interface Opts { glyph?: string; tribe?: Settlement['tribe']; seed?: number; difficulty?: Level; at?: [number, number]; record?: Partial<TribeState>; village?: Partial<Settlement> }
/** A 9 x 9 map of one kind of ground with a settlement in the middle (or at `at`). */
function country(o: Opts = {}): GameState {
  const glyph = o.glyph ?? '.';
  const rows = Array.from({ length: 9 }, (_, y) => (y === 0 || y === 8 ? '~'.repeat(9) : `~${glyph.repeat(7)}~`));
  const s = world({ rows, seed: o.seed ?? 1, difficulty: o.difficulty ?? 'conquistador' });
  const tribe = o.tribe ?? 'cherokee';
  const [x, y] = o.at ?? [4, 4];
  return { ...s, settlements: { v: village(tribe, x, y, o.village) }, tribes: { [tribe]: record(o.record) } };
}
const skill = (s: GameState): string => settlementSkill(s, s.settlements['v']!);
const pupil = (s: GameState, extra: Partial<Parameters<typeof withUnit>[1]> = {}): GameState => withUnit(s, { id: 'u', x: 3, y: 4, ...extra });
const LEARN: Action = { type: 'enterSettlement', unitId: 'u', settlementId: 'v', action: 'liveAmong' };
const learn = (s: GameState): { state: GameState; events: readonly GameEvent[] } => applyAction(s, LEARN);
const told = (r: { events: readonly GameEvent[] }): Extract<LearningEvent, { type: 'nativesTaught' }> => r.events.find((e) => e.type === 'nativesTaught') as Extract<LearningEvent, { type: 'nativesTaught' }>;

describe('learning tables', () => {
  it('match the snapshot', () => {
    expect({ LEARNING, SKILL_FOR_GOOD, TEACHABLE }).toMatchSnapshot();
  });
});

describe('what a settlement teaches', () => {
  it('follows from what it has to spare, and is the same every time it is asked', () => {
    const s = country();
    expect(skill(s)).toBe(skill(s));
    const seen = new Set<string>();
    for (let seed = 0; seed < 60; seed++) seen.add(skill(country({ seed })));
    // plains: food and a little cotton (and cloth, which villages cannot teach)
    expect([...seen].sort()).toEqual(['expertFarmer', 'masterCottonPlanter']);
  });

  it('forest peoples teach trapping, or scouting on every third diagonal', () => {
    const at = (x: number, y: number): Set<string> => {
      const seen = new Set<string>();
      for (let seed = 0; seed < 80; seed++) seen.add(skill(country({ glyph: 'f', tribe: 'sioux', seed, at: [x, y] })));
      return seen;
    };
    expect(at(4, 4)).toContain('expertFurTrapper'); // 8 is not a multiple of 3
    expect(at(4, 4)).not.toContain('seasonedScout');
    expect(at(4, 5)).toContain('seasonedScout'); // 9 is
    expect(at(4, 5)).not.toContain('expertFurTrapper');
  });

  it('hill villages teach mining, but camps never do; only cities teach silver or weaving', () => {
    const all = (o: Opts, tries = 80): Set<string> => {
      const seen = new Set<string>();
      for (let seed = 0; seed < tries; seed++) {
        let s = country({ ...o, seed });
        // leave a little farmland so that there is always something to teach
        s = setTile(s, 4, 4, { relief: 'flat' });
        seen.add(skill(s));
      }
      return seen;
    };
    expect(all({ glyph: 'h', tribe: 'cherokee' })).toContain('expertOreMiner');
    expect(all({ glyph: 'h', tribe: 'sioux' })).not.toContain('expertOreMiner');
    expect(all({ glyph: 'm', tribe: 'inca' })).toContain('expertSilverMiner');
    expect(all({ glyph: 'm', tribe: 'cherokee' })).not.toContain('expertSilverMiner');
    // weaving is a rare thing to be taught, and only in the cities
    expect(all({ glyph: '.', tribe: 'aztec' }, 1500)).toContain('masterWeaver');
    expect(all({ glyph: '.', tribe: 'cherokee' }, 1500)).not.toContain('masterWeaver');
  });

  it('farmers by the sea are often fishermen', () => {
    const coast = (seed: number): GameState => {
      let s = country({ seed, at: [2, 4] }); // the map edge is ocean two squares west
      for (let y = 2; y <= 6; y++) s = setTile(s, 1, y, { base: 'ocean' });
      return s;
    };
    const seen: Record<string, number> = {};
    for (let seed = 0; seed < 200; seed++) seen[skill(coast(seed))] = (seen[skill(coast(seed))] ?? 0) + 1;
    expect(seen['expertFisherman']).toBeGreaterThan(30);
    expect(seen['expertFarmer']).toBeGreaterThan(30);
    const inland: Record<string, number> = {};
    for (let seed = 0; seed < 100; seed++) inland[skill(country({ seed }))] = 1;
    expect(inland['expertFisherman']).toBeUndefined();
  });

  it('a settlement with nothing to spare still teaches farming', () => {
    expect(skill(country({ glyph: 'a', tribe: 'sioux' }))).toBe('expertFarmer');
  });
});

describe('living among the natives', () => {
  it('a free colonist or servant learns the settlement\'s trade, once per settlement', () => {
    const s = pupil(country());
    const r = learn(s);
    expect(told(r)).toEqual({ type: 'nativesTaught', unitId: 'u', settlementId: 'v', outcome: 'taught', skill: skill(s) });
    expect(r.state.units['u']).toMatchObject({ profession: skill(s), type: 'colonist', movesLeft: 0, x: 3, y: 4 });
    expect(r.state.settlements['v']?.taught).toBe(true);
    expect(told(learn(pupil(country(), { profession: 'indenturedServant' }))).outcome).toBe('taught');
    expect(told(learn(pupil(r.state, { id: 'u', profession: 'freeColonist' }))).outcome).toBe('already');
  });

  it('a capital teaches again and again', () => {
    const s = pupil(country({ village: { capital: true, taught: true } }));
    expect(told(learn(s)).outcome).toBe('taught');
  });

  it('a pioneer may learn too and keeps his tools', () => {
    const r = learn(pupil(country(), { type: 'pioneer', tools: 60 }));
    expect(r.state.units['u']).toMatchObject({ type: 'pioneer', tools: 60 });
    expect(told(r).outcome).toBe('taught');
  });

  it('criminals are turned away and experts are told they know enough', () => {
    expect(told(learn(pupil(country(), { profession: 'pettyCriminal' }))).outcome).toBe('criminal');
    const master = learn(pupil(country(), { profession: 'expertFisherman' }));
    expect(told(master).outcome).toBe('master');
    expect(master.state.units['u']?.profession).toBe('expertFisherman');
    expect(master.state.settlements['v']?.taught).toBe(false);
    // converts and armed units are not offered the choice at all
    const refuse = (extra: Partial<Parameters<typeof withUnit>[1]>): string => {
      const v = validateAction(pupil(country(), extra), LEARN);
      return v.ok ? 'ok' : v.error.code;
    };
    expect(refuse({ profession: 'indianConvert' })).toBe('notAllowed');
    expect(refuse({ type: 'soldier' })).toBe('notAllowed');
    expect(refuse({ type: 'scout' })).toBe('notAllowed');
  });

  it('a restless tribe refuses and takes offence', () => {
    const r = learn(pupil(country({ record: { alarm: { a: 50 } } })));
    expect(told(r).outcome).toBe('angry');
    expect(tribalAlarm(r.state, 'cherokee', 'a')).toBe(53);
    expect(r.state.units['u']?.profession).toBe('freeColonist');
  });

  it('an uneasy tribe sometimes fails to teach, more often on harder levels; the pupil may try again', () => {
    const slow = (difficulty: Level): number => {
      let n = 0;
      for (let seed = 0; seed < 600; seed++) if (told(learn(pupil(country({ seed, difficulty, record: { alarm: { a: 30 } } })))).outcome === 'slow') n++;
      return n / 600;
    };
    expect(slow('discoverer')).toBeCloseTo(0.099, 1);
    expect(slow('conquistador')).toBeCloseTo(0.499, 1);
    expect(slow('viceroy')).toBeCloseTo(0.899, 1);
    let s = pupil(country({ difficulty: 'viceroy', record: { alarm: { a: 30 } } }));
    const r = learn(s);
    if (told(r).outcome === 'slow') {
      expect(r.state.settlements['v']?.taught).toBe(false);
      expect(r.state.units['u']?.profession).toBe('freeColonist');
    }
    s = pupil(country({ record: { alarm: { a: 24 } } }));
    for (let seed = 0; seed < 50; seed++) expect(told(learn(pupil(country({ seed, difficulty: 'viceroy', record: { alarm: { a: 24 } } })))).outcome).toBe('taught');
    expect(s).toBeDefined();
  });

  it('the chief tells a visiting scout what his people teach', () => {
    const s = withUnit(country(), { id: 'sc', type: 'scout', x: 3, y: 4 });
    const r = applyAction(s, { type: 'enterSettlement', unitId: 'sc', settlementId: 'v', action: 'speakWithChief' });
    expect(r.events.find((e) => e.type === 'chiefSpoke')).toMatchObject({ skill: skill(s) });
  });
});
