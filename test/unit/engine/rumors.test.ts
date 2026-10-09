import { describe, expect, it } from 'vitest';
import { applyAction, listValidActions, validateAction, type Action, type GameEvent } from '../../../src/engine/actions';
import { tribalAlarm } from '../../../src/engine/alarm';
import { FOUNTAIN_TERRAIN, RUMOR_ROLLS, RUMORS } from '../../../src/engine/data/rumors';
import { settlementPopulation } from '../../../src/engine/data/tribes';
import { docksOf } from '../../../src/engine/europe';
import { checkInvariants } from '../../../src/engine/invariants';
import { createRng } from '../../../src/engine/rng';
import { explorerSkill, exploreRumor, rollRumor, type RumorEvent } from '../../../src/engine/rumors';
import type { Colonist, GameState, Player, Settlement, TribeState, Unit } from '../../../src/engine/state';
import { setTile, withColony, withUnit, world } from '../../helpers/world';

const village = (tribe: Settlement['tribe'], x: number, y: number): Settlement => ({
  id: 'v', tribe, x, y, capital: false, population: settlementPopulation(tribe, false).start, growth: 0, taught: false, tributePaid: false,
  alarm: {}, mission: null, scouted: [], lastBought: null, lastSold: null, haggleMemory: null,
});
const record = (extra: Partial<TribeState> = {}): TribeState => ({ alarm: {}, goodwill: {}, met: ['a'], muskets: 0, horses: 0, breeding: 0, silver: 0, peace: ['a'], landSold: 0, grudge: [], joinedCrown: false, visited: {}, stock: {}, ...extra });
const people = (n: number, p = 'c'): Colonist[] => Array.from({ length: n }, (_, i) => ({ id: `${p}${i}`, profession: 'freeColonist' as const, job: { kind: 'idle' as const }, turns: 0 }));
interface Opts { seed?: number; glyph?: string; fathers?: string[]; explored?: number; cibolas?: number; big?: boolean; kind?: 'human' | 'ai'; atWar?: boolean; player?: Partial<Player> }
/** A party at (3,3) standing on a rumor, on ground of the given kind. `big` gives the power colonies enough to lose a party. */
function at(type: Unit['type'], o: Opts = {}, profession: Unit['profession'] = 'freeColonist'): GameState {
  const g = o.glyph ?? '.';
  const rows = Array.from({ length: 12 }, (_, y) => (y === 0 || y === 11 ? '~'.repeat(14) : `~${g.repeat(12)}~`));
  let s = world({ rows, seed: o.seed ?? 1, players: [{ id: 'a', fathers: o.fathers ?? [], kind: o.kind ?? 'human', atWar: o.atWar ?? false }, { id: 'b' }] });
  s = { ...s, rumors: { explored: o.explored ?? 10, cibolas: o.cibolas ?? 0 }, players: s.players.map((p) => (p.id === 'a' ? { ...p, ...o.player } : p)) };
  if (o.big) {
    s = withColony(s, { id: 'c1', x: 8, y: 2, name: 'One', colonists: people(4, 'x') });
    s = withColony(s, { id: 'c2', x: 8, y: 5, name: 'Two', colonists: people(4, 'y') });
    s = withColony(s, { id: 'c3', x: 8, y: 8, name: 'Three', colonists: people(4, 'z') });
  }
  s = setTile(s, 3, 3, { rumor: true });
  return withUnit(s, { id: 'u', type, profession, x: 3, y: 3 });
}
const explore = (s: GameState): { state: GameState; events: RumorEvent[] } => {
  const events: RumorEvent[] = [];
  return { state: exploreRumor(s, 'u', events), events };
};
const found = (r: { events: readonly (RumorEvent | GameEvent)[] }): Extract<RumorEvent, { type: 'rumorExplored' }> => r.events.find((e) => e.type === 'rumorExplored') as Extract<RumorEvent, { type: 'rumorExplored' }>;
function tally(make: (seed: number) => GameState, n = 1800): Record<string, number> {
  const seen: Record<string, number> = {};
  for (let seed = 0; seed < n; seed++) {
    const o = found(explore(make(seed))).outcome;
    seen[o] = (seen[o] ?? 0) + 1;
  }
  return seen;
}
const until = (make: (seed: number) => GameState, want: string): { state: GameState; events: RumorEvent[] } => {
  for (let seed = 0; seed < 2000; seed++) {
    const r = explore(make(seed));
    if (found(r).outcome === want) return r;
  }
  throw new Error(`no ${want}`);
};
const gold = (s: GameState): number => s.players[0]?.gold ?? 0;

describe('rumor tables', () => {
  it('match the snapshot', () => {
    expect({ RUMORS, RUMOR_ROLLS, FOUNTAIN_TERRAIN }).toMatchSnapshot();
    expect(RUMOR_ROLLS).toHaveLength(9);
  });
});

describe('who is exploring', () => {
  it('scouts are better at it, seasoned scouts better still, and De Soto helps scouts only', () => {
    const skill = (type: Unit['type'], profession: Unit['profession'], fathers: string[] = []): number => {
      const s = at(type, { fathers }, profession);
      return explorerSkill(s, s.units['u']!).skill;
    };
    expect([skill('colonist', 'freeColonist'), skill('scout', 'freeColonist'), skill('scout', 'seasonedScout')]).toEqual([0, 1, 2]);
    expect([skill('colonist', 'freeColonist', ['hernandoDeSoto']), skill('scout', 'freeColonist', ['hernandoDeSoto']), skill('scout', 'seasonedScout', ['hernandoDeSoto'])]).toEqual([0, 2, 3]);
    expect(skill('soldier', 'seasonedScout')).toBe(0);
  });
});

describe('what a rumor turns out to be', () => {
  it('on open plains, for an ordinary party of a small power: mostly nothing, some gold, sometimes survivors', () => {
    const seen = tally((seed) => at('colonist', { seed }));
    // fountain (wrong ground), cibola (wrong ground) and the lost party (too small a power) all come to little
    expect(seen['fountain']).toBeUndefined();
    expect(seen['cibola']).toBeUndefined();
    expect(seen['vanished'] ?? 0).toBeLessThan(60); // only by way of a failed fountain or city
    for (const one of ['ruins', 'gift', 'survivors', 'burial']) expect(seen[one]! / 1800).toBeCloseTo(1 / 9, 1);
    expect(seen['nothing']! / 1800).toBeGreaterThan(0.4);
  });

  it('the Fountain of Youth needs wet or grassy ground and four rumors already explored', () => {
    expect(tally((seed) => at('colonist', { seed, glyph: 'g' }))['fountain']! / 1800).toBeCloseTo(1 / 9, 1);
    expect(tally((seed) => at('colonist', { seed, glyph: 'w' }))['fountain']).toBeGreaterThan(100);
    // the count includes the rumor being explored: the fourth can be the Fountain, the third cannot
    expect(tally((seed) => at('colonist', { seed, glyph: 'g', explored: 2 }))['fountain']).toBeUndefined();
    expect(tally((seed) => at('colonist', { seed, glyph: 'g', explored: 3 }))['fountain']).toBeGreaterThan(100);
    // once independence is declared nobody comes from Europe: it is a city of gold instead, if the ground allows
    expect(tally((seed) => at('colonist', { seed, glyph: 'g', atWar: true }))['fountain']).toBeUndefined();
  });

  it('the Cities of Cibola lie in rough country, and no more than seven are ever found', () => {
    expect(tally((seed) => at('colonist', { seed, glyph: 'h' }))['cibola']! / 1800).toBeCloseTo(1 / 9, 1);
    expect(tally((seed) => at('colonist', { seed, glyph: 'm' }))['cibola']).toBeGreaterThan(100);
    expect(tally((seed) => at('colonist', { seed, glyph: 'h', cibolas: 7 }))['cibola']).toBeUndefined();
    expect(tally((seed) => at('colonist', { seed, glyph: 'h', atWar: true }))['cibola']! / 1800).toBeCloseTo(2 / 9, 1);
  });

  it('a larger power may lose its party, though the first such loss is turned into burial mounds', () => {
    const first = tally((seed) => at('colonist', { seed, big: true }));
    expect(first['vanished'] ?? 0).toBeLessThan(40);
    expect(first['burial']! / 1800).toBeCloseTo(2 / 9, 1);
    const later = tally((seed) => at('colonist', { seed, big: true, player: { rumorLossSpared: true } }));
    expect(later['vanished']! / 1800).toBeCloseTo(1 / 9, 1);
    // scouts are lost half as often, seasoned scouts a third
    expect(tally((seed) => at('scout', { seed, big: true, player: { rumorLossSpared: true } }))['vanished']! / 1800).toBeCloseTo(1 / 18, 1);
  });

  it('De Soto\'s scouts never come back with nothing', () => {
    const seen = tally((seed) => at('scout', { seed, big: true, fathers: ['hernandoDeSoto'], player: { rumorLossSpared: true } }), 900);
    expect(seen['nothing']).toBeUndefined();
    expect(seen['vanished']).toBeUndefined();
    expect(seen['shrines']).toBeUndefined();
    expect(seen['fountain']).toBeGreaterThan(60); // any ground will do for them
    // an ordinary party gets no such help
    expect(tally((seed) => at('colonist', { seed, big: true, fathers: ['hernandoDeSoto'] }), 300)['nothing']).toBeGreaterThan(50);
  });

  it('is decided by the dice alone for the same state', () => {
    const s = at('colonist', { seed: 5 });
    expect(rollRumor(s, s.units['u']!, createRng(9))).toEqual(rollRumor(s, s.units['u']!, createRng(9)));
  });
});

describe('what is found', () => {
  it('the rumor is gone, and the count of rumors explored goes up', () => {
    const r = explore(at('colonist'));
    expect(r.state.map.tiles[3 * 14 + 3]?.rumor).toBe(false);
    expect(r.state.rumors.explored).toBe(11);
    expect(found(r)).toMatchObject({ unitId: 'u', player: 'a', x: 3, y: 3 });
    expect(checkInvariants(r.state)).toEqual([]);
    const none = setTile(at('colonist'), 3, 3, { rumor: false });
    expect(exploreRumor(none, 'u', [])).toBe(none);
  });

  it('ruins hold 30 to 240 gold, more for scouts; a friendly village gives 8 to 80', () => {
    const amounts = (type: Unit['type'], profession: Unit['profession'], want: string): number[] => {
      const out: number[] = [];
      for (let seed = 0; seed < 1500; seed++) {
        const r = explore(at(type, { seed }, profession));
        if (found(r).outcome === want) {
          out.push(found(r).gold);
          expect(gold(r.state)).toBe(found(r).gold);
        }
      }
      return out;
    };
    const range = (xs: number[]): [number, number] => [Math.min(...xs), Math.max(...xs)];
    expect(range(amounts('colonist', 'freeColonist', 'ruins'))).toEqual([30, 240]);
    expect(range(amounts('scout', 'freeColonist', 'ruins'))).toEqual([45, 360]);
    expect(range(amounts('scout', 'seasonedScout', 'ruins'))).toEqual([60, 480]);
    expect(range(amounts('colonist', 'freeColonist', 'gift'))).toEqual([8, 80]);
  });

  it('a City of Cibola yields a treasure train of 2100 to 4000, more for scouts', () => {
    const r = until((seed) => at('colonist', { seed, glyph: 'h' }), 'cibola');
    const train = r.state.units[found(r).newUnitId!]!;
    expect(train).toMatchObject({ type: 'treasure', owner: 'a', x: 3, y: 3 });
    expect(train.treasure).toBeGreaterThanOrEqual(2100);
    expect(train.treasure).toBeLessThanOrEqual(4000);
    expect(r.state.rumors.cibolas).toBe(1);
    const scout = until((seed) => at('scout', { seed, glyph: 'h' }, 'seasonedScout'), 'cibola');
    expect(scout.state.units[found(scout).newUnitId!]!.treasure).toBeGreaterThanOrEqual(4100);
  });

  it('survivors of a lost colony join as a free colonist', () => {
    const r = until((seed) => at('colonist', { seed }), 'survivors');
    expect(r.state.units[found(r).newUnitId!]).toMatchObject({ type: 'colonist', profession: 'freeColonist', owner: 'a', x: 3, y: 3 });
  });

  it('a party that vanishes is gone with all it carried', () => {
    const r = until((seed) => at('scout', { seed, big: true, player: { rumorLossSpared: true } }), 'vanished');
    expect(r.state.units['u']).toBeUndefined();
    expect(found(r).lost).toEqual({ horses: 50 });
  });

  it('holy shrines anger the tribe whose settlement is near', () => {
    const near = (seed: number): GameState => ({ ...at('colonist', { seed, glyph: 'h', cibolas: 7 }), settlements: { v: village('sioux', 5, 3) }, tribes: { sioux: record() } });
    const r = until(near, 'shrines');
    // a throw of 1..6 plus 5 x (2 - 0 + 1) on the middle level
    expect(tribalAlarm(r.state, 'sioux', 'a')).toBeGreaterThanOrEqual(16);
    expect(tribalAlarm(r.state, 'sioux', 'a')).toBeLessThanOrEqual(21);
    expect(tally((seed) => at('colonist', { seed, glyph: 'h', cibolas: 7 }), 600)['shrines']).toBeUndefined(); // nobody near
  });
});

describe('the Fountain of Youth', () => {
  const fountain = (o: Opts = {}): GameState => until((seed) => at('colonist', { seed, glyph: 'g', ...o }), 'fountain').state;

  it('lets a human pick eight immigrants from the pool, free, without touching the crosses', () => {
    let s: GameState = { ...fountain(), players: fountain().players.map((p) => (p.id === 'a' ? { ...p, crosses: 5, gold: 0 } : p)) };
    expect(s.players[0]?.fountain).toBe(8);
    const pick: Action = { type: 'chooseImmigrant', slot: 2 };
    expect(validateAction(s, pick).ok).toBe(true);
    for (let i = 0; i < 8; i++) s = applyAction(s, { type: 'chooseImmigrant', slot: i % 3 }).state;
    expect(s.players[0]).toMatchObject({ fountain: 0, crosses: 5, gold: 0, recruits: 0 });
    expect(docksOf(s, 'a')).toHaveLength(8);
    expect(validateAction(s, pick).ok).toBe(false);
    expect(checkInvariants(s)).toEqual([]);
  });

  it('left unpicked, they come by lot when the turn ends; a computer power takes them at once', () => {
    const ended = applyAction(fountain(), { type: 'endTurn' });
    expect(ended.state.players[0]?.fountain).toBe(0);
    expect(ended.events.filter((e) => e.type === 'immigrantArrived')).toHaveLength(8);
    const ai = fountain({ kind: 'ai' });
    expect(ai.players[0]?.fountain).toBe(0);
    expect(docksOf(ai, 'a')).toHaveLength(8);
  });
});

describe('burial mounds', () => {
  const mounds = (o: Opts = {}): GameState => until((seed) => at('colonist', { seed, ...o }), 'burial').state;

  it('wait for the party to decide; leaving them costs nothing', () => {
    const s = mounds();
    expect(s.players[0]?.pendingBurial).toMatchObject({ unitId: 'u', x: 3, y: 3, skill: 0 });
    expect(listValidActions(s).filter((a) => a.type === 'answerBurial')).toHaveLength(2);
    const left = applyAction(s, { type: 'answerBurial', search: false });
    expect(left.events).toEqual([{ type: 'burialSearched', unitId: 'u', player: 'a', find: 'left', gold: 0, newUnitId: null, sacredTo: null }]);
    expect(left.state.players[0]?.pendingBurial).toBeNull();
    expect(validateAction(left.state, { type: 'answerBurial', search: true }).ok).toBe(false);
    expect(applyAction(s, { type: 'endTurn' }).events.find((e) => e.type === 'burialSearched')).toMatchObject({ find: 'left' });
  });

  it('searched, they are empty, or hold trinkets, or a treasure', () => {
    const seen: Record<string, number> = {};
    for (let seed = 0; seed < 900; seed++) {
      const r = explore(at('colonist', { seed }));
      if (found(r).outcome !== 'burial') continue;
      const dug = applyAction(r.state, { type: 'answerBurial', search: true });
      const e = dug.events.find((x) => x.type === 'burialSearched') as Extract<RumorEvent, { type: 'burialSearched' }>;
      seen[e.find] = (seen[e.find] ?? 0) + 1;
      if (e.find === 'trinkets') {
        expect(e.gold).toBeGreaterThanOrEqual(30);
        expect(e.gold).toBeLessThanOrEqual(240);
        expect(gold(dug.state)).toBe(e.gold);
      }
      if (e.find === 'treasure') {
        const train = dug.state.units[e.newUnitId!]!;
        expect(train.treasure).toBeGreaterThanOrEqual(2200);
        expect(train.treasure).toBeLessThanOrEqual(3600);
      }
      expect(e.sacredTo).toBeNull();
    }
    const total = (seen['empty'] ?? 0) + (seen['trinkets'] ?? 0) + (seen['treasure'] ?? 0);
    expect(seen['empty']! / total).toBeCloseTo(0.24, 1);
    expect(seen['trinkets']! / total).toBeCloseTo(0.4, 1);
    expect(seen['treasure']! / total).toBeCloseTo(0.36, 1);
  });

  it('may be sacred to the tribe nearby, which then goes to war over them', () => {
    let sacred = 0;
    let searched = 0;
    for (let seed = 0; seed < 1500; seed++) {
      const base = at('colonist', { seed });
      const s = { ...base, settlements: { v: village('sioux', 4, 3) }, tribes: { sioux: record() } };
      const r = explore(s);
      if (found(r).outcome !== 'burial') continue;
      searched++;
      const dug = applyAction(r.state, { type: 'answerBurial', search: true });
      const e = dug.events.find((x) => x.type === 'burialSearched') as Extract<RumorEvent, { type: 'burialSearched' }>;
      if (e.sacredTo) {
        sacred++;
        expect(tribalAlarm(dug.state, 'sioux', 'a')).toBe(100);
      } else expect(tribalAlarm(dug.state, 'sioux', 'a')).toBe(0);
    }
    // the settlement is one square off: three chances in six
    expect(sacred / searched).toBeCloseTo(0.5, 1);
  });

  it('a computer power always digs', () => {
    const r = until((seed) => at('colonist', { seed, kind: 'ai' }), 'burial');
    expect(r.state.players[0]?.pendingBurial).toBeNull();
    expect(r.events.some((e) => e.type === 'burialSearched' && e.find !== 'left')).toBe(true);
  });
});

describe('walking onto a rumor', () => {
  it('a land unit that moves onto one explores it; a move elsewhere does not', () => {
    let s = setTile(at('colonist'), 3, 3, { rumor: false });
    s = setTile(s, 4, 3, { rumor: true });
    const r = applyAction(s, { type: 'moveUnit', unitId: 'u', dx: 1, dy: 0 });
    expect(found(r)).toMatchObject({ x: 4, y: 3 });
    expect(r.state.map.tiles[3 * 14 + 4]?.rumor).toBe(false);
    const away = applyAction(s, { type: 'moveUnit', unitId: 'u', dx: -1, dy: 0 });
    expect(away.events.some((e) => e.type === 'rumorExplored')).toBe(false);
    expect(away.state.map.tiles[3 * 14 + 4]?.rumor).toBe(true);
  });
});
