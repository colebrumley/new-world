import { describe, expect, it } from 'vitest';
import { applyAction, validateAction, type Action, type GameEvent } from '../../../src/engine/actions';
import { AI_NAVY } from '../../../src/engine/data/ai';
import { ROYAL } from '../../../src/engine/data/royal';
import { DIFFICULTIES } from '../../../src/engine/data/yields';
import { docksOf } from '../../../src/engine/europe';
import { checkInvariants } from '../../../src/engine/invariants';
import { bidPrice } from '../../../src/engine/market';
import {
  foreignIndependence, frigateOffer, frigateWarranted, growRef, kingsWar, mercenaryOffer, militaryStrength, navalAid, navalStrength, nextRefUnit, powerSize,
  royalIncome, royalTransport, royalTransportCut, startingRef, succession, type RoyalEvent,
} from '../../../src/engine/royal';
import type { Colony, Colonist, GameState, Player, Unit } from '../../../src/engine/state';
import { withColony, withUnit, world } from '../../helpers/world';

type Level = (typeof DIFFICULTIES)[number];
const ROWS = ['~~~~~~~~~~~~~~', '~..~..~..~..~~', '~..~..~..~..~~', '~~~~~~~~~~~~~~', '~..~..~..~..~~', '~~~~~~~~~~~~~~', '~~~~~~~~~~~~~~', '~~~~~~~~~~~~~~', '~~~~~~~~~~~~~s'];
const patch = (s: GameState, id: string, change: Partial<Player>): GameState => ({ ...s, players: s.players.map((p) => (p.id === id ? { ...p, ...change } : p)) });
const player = (s: GameState, id = 'a'): Player => s.players.find((p) => p.id === id) as Player;
const people = (n: number, prefix: string): Colonist[] => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, profession: 'freeColonist' as const, job: { kind: 'idle' as const }, turns: 0 }));
const code = (s: GameState, a: Action): string => {
  const v = validateAction(s, a);
  return v.ok ? 'ok' : v.error.code;
};
/** Try seeds until the event of interest happens (or not), so tests need not know the generator. */
function seek<T>(make: (seed: number) => T, want: (t: T) => boolean, limit = 400): T {
  for (let seed = 0; seed < limit; seed++) {
    const t = make(seed);
    if (want(t)) return t;
  }
  throw new Error('no seed gave the wanted outcome');
}
const base = (opts: { seed?: number; difficulty?: Level; fathers?: string[]; kinds?: ('human' | 'ai')[] } = {}): GameState =>
  world({
    rows: ROWS, seed: opts.seed ?? 1, difficulty: opts.difficulty ?? 'conquistador',
    players: [{ id: 'a', kind: opts.kinds?.[0] ?? 'human', fathers: opts.fathers ?? [] }, { id: 'b', kind: opts.kinds?.[1] ?? 'ai' }, { id: 'c', kind: 'ai' }, { id: 'd', kind: 'ai' }],
  });

describe('royal tables', () => {
  it('match the snapshot', () => {
    expect(ROYAL).toMatchSnapshot();
  });
});

describe('the Expeditionary Force', () => {
  it('starts larger on harder levels', () => {
    expect(DIFFICULTIES.map((d) => Object.values(startingRef(d)))).toEqual([[15, 5, 2, 2], [23, 10, 8, 5], [31, 15, 14, 8], [39, 20, 20, 11], [47, 25, 26, 14]]);
  });

  it('the Crown saves 10 + 8 a level each turn, doubling from 1600, 1700 and 1750', () => {
    const at = (turn: number, difficulty: Level = 'discoverer'): number => royalIncome({ ...base({ difficulty }), turn });
    expect(at(0)).toBe(10);
    expect(at(0, 'viceroy')).toBe(42);
    expect(at(107)).toBe(10); // 1599
    expect(at(108)).toBe(20); // 1600
    expect(at(308)).toBe(40); // 1700
    expect(at(408)).toBe(80); // 1750
  });

  it('adds cavalry, guns and ships in proportion to the regulars', () => {
    expect(nextRefUnit({ regulars: 15, cavalry: 5, artillery: 3, ships: 2 })).toBe('regulars');
    expect(nextRefUnit({ regulars: 16, cavalry: 5, artillery: 4, ships: 3 })).toBe('cavalry');
    expect(nextRefUnit({ regulars: 16, cavalry: 6, artillery: 3, ships: 3 })).toBe('artillery');
    expect(nextRefUnit({ regulars: 16, cavalry: 6, artillery: 3, ships: 2 })).toBe('ships');
  });

  it('every 1800 of royal money buys one more unit; the rest carries over', () => {
    const s = patch(base(), 'a', { royalMoney: 3700 - 26 });
    const events: RoyalEvent[] = [];
    const r = growRef(s, 'a', events);
    expect(events.map((e) => e.type)).toEqual(['refGrew', 'refGrew']);
    expect(player(r).royalMoney).toBe(100);
    const total = (f: Player['ref']): number => f.regulars + f.cavalry + f.artillery + f.ships;
    expect(total(player(r).ref)).toBe(total(player(s).ref) + 2);
    expect(growRef(patch(s, 'a', { atWar: true }), 'a', []).players).toEqual(patch(s, 'a', { atWar: true }).players);
    expect(player(growRef(patch(base(), 'b', { royalMoney: 5000 }), 'b', []), 'b').royalMoney).toBe(5000);
  });

  it('taxes on sales and back taxes go into the royal purse', () => {
    let s = patch(base(), 'a', { taxRate: 30, gold: 100000, boycotts: ['rum'] });
    s = withUnit(s, { id: 'ship', type: 'galleon', x: -1, y: -1, cargo: { furs: 100 } });
    s = { ...s, units: { ...s.units, ship: { ...(s.units['ship'] as Unit), voyage: { phase: 'inEurope', turnsLeft: 0, origin: [13, 8] } } } };
    const tax = Math.trunc((100 * bidPrice(s, 'a', 'furs') * 30) / 100);
    const sold = applyAction(s, { type: 'sellGoods', unitId: 'ship', good: 'furs', amount: 100 }).state;
    expect(player(sold).royalMoney).toBe(tax);
    const r = applyAction(sold, { type: 'payBackTaxes', good: 'rum' });
    const paid = (r.events.find((e) => e.type === 'boycottLifted') as { paid: number }).paid;
    expect(player(r.state).royalMoney).toBe(tax + paid);
  });
});

describe("the King's war", () => {
  const ready = (seed: number, opts: Parameters<typeof base>[0] = {}): GameState =>
    ({ ...patch(base({ ...opts, seed }), 'a', { stance: { b: 'peace', c: 'peace', d: 'peace' } }), turn: 250 });
  const run = (s: GameState): { state: GameState; events: RoyalEvent[] } => {
    const events: RoyalEvent[] = [];
    return { state: kingsWar(s, 'a', events), events };
  };

  it('sets the player at war with a rival it was at peace with, and sends gold and a veteran', () => {
    const r = seek((seed) => run(ready(seed)), (t) => t.events.length > 0);
    const e = r.events[0] as Extract<RoyalEvent, { type: 'kingDeclaredWar' }>;
    expect(e).toMatchObject({ type: 'kingDeclaredWar', player: 'a', gold: 300, soldiers: 1 });
    expect(player(r.state).stance[e.enemy]).toBe('war');
    expect(player(r.state, e.enemy).stance['a']).toBe('war');
    expect(player(r.state).gold).toBe(300);
    expect(docksOf(r.state, 'a').map((u) => [u.type, u.profession])).toEqual([['soldier', 'veteranSoldier']]);
    expect(checkInvariants(r.state)).toEqual([]);
  });

  it('comes with odds of (level + 1) in 21 when three rivals are at peace', () => {
    let fired = 0;
    for (let seed = 0; seed < 2000; seed++) if (run(ready(seed)).events.length > 0) fired++;
    expect(fired / 2000).toBeCloseTo(3 / 21, 1);
  });

  it('sends more against a stronger rival, within the caps', () => {
    const strong = (seed: number): GameState => {
      let s = patch(ready(seed), 'a', { stance: { b: 'peace' } });
      for (let i = 0; i < 12; i++) s = withUnit(s, { id: `art${i}`, owner: 'b', type: 'artillery', profession: null, x: 4, y: 1 });
      return s;
    };
    const r = seek((seed) => run(strong(seed)), (t) => t.events.length > 0);
    const lead = militaryStrength(r.state, 'b');
    expect(lead).toBeGreaterThan(40);
    expect(r.events[0]).toMatchObject({ soldiers: Math.min(4, (lead >> 3) + 1), gold: Math.min(1500, 300 + 25 * lead) });
  });

  it('never with Franklin, too early, with no rival at peace, or while already at war', () => {
    for (let seed = 0; seed < 150; seed++) {
      expect(run(ready(seed, { fathers: ['benjaminFranklin'] })).events).toEqual([]);
      expect(run({ ...ready(seed), turn: 150 }).events).toEqual([]);
      expect(run(patch(ready(seed), 'a', { stance: {} })).events).toEqual([]);
      expect(run(patch(ready(seed), 'a', { stance: { b: 'peace', c: 'war' } })).events).toEqual([]);
    }
  });
});

describe("the King's frigate", () => {
  const threatened = (kind: 'human' | 'ai' = 'human'): GameState => {
    let s = withColony(base({ kinds: [kind, 'ai'] }), { id: 'col', owner: 'a', x: 1, y: 1, name: 'Home' });
    s = withUnit(s, { id: 'raider', owner: 'b', type: 'frigate', profession: null, x: 6, y: 3 });
    return patch({ ...s, turn: 16 }, 'a', { entry: [13, 8] });
  };

  it('is warranted on every eighth turn when a foreign frigate lies near a colony and we have none', () => {
    expect(frigateWarranted(threatened(), 'a')).toBe(true);
    expect(frigateWarranted({ ...threatened(), turn: 17 }, 'a')).toBe(false);
    expect(frigateWarranted(withUnit(threatened(), { id: 'ours', owner: 'a', type: 'frigate', profession: null, x: 0, y: 0 }), 'a')).toBe(false);
    const far = threatened();
    expect(frigateWarranted({ ...far, units: { raider: { ...(far.units['raider'] as Unit), x: 7 } } }, 'a')).toBe(false);
    const privateer = threatened();
    expect(frigateWarranted({ ...privateer, units: { raider: { ...(privateer.units['raider'] as Unit), type: 'privateer' } } }, 'a')).toBe(false);
  });

  it('is also warranted when lesser warships hover near more than three colonies', () => {
    let s = base();
    const sites: [number, number][] = [[1, 1], [4, 1], [7, 1], [10, 1]];
    sites.forEach(([x, y], i) => {
      s = withColony(s, { id: `c${i}`, owner: 'a', x, y, name: `C${i}` });
    });
    s = { ...s, turn: 8 };
    const three = withUnit(s, { id: 'p', owner: 'b', type: 'privateer', profession: null, x: 3, y: 3 });
    expect(frigateWarranted(three, 'a')).toBe(false);
    const all = withUnit(three, { id: 'p2', owner: 'b', type: 'privateer', profession: null, x: 9, y: 3 });
    expect(frigateWarranted(all, 'a')).toBe(true);
  });

  it('a human is asked; accepting sends the ship and adds ten points of tax', () => {
    const events: GameEvent[] = [];
    const asked = frigateOffer(threatened(), 'a', events as RoyalEvent[]);
    expect(events).toEqual([{ type: 'royalOffer', player: 'a', offer: { kind: 'frigate', tax: 10 } }]);
    expect(player(asked).pendingOffer).toEqual({ kind: 'frigate', tax: 10 });
    const r = applyAction(patch(asked, 'a', { taxRate: 12 }), { type: 'answerOffer', accept: true });
    const ship = Object.values(r.state.units).find((u) => u.owner === 'a' && u.type === 'frigate') as Unit;
    expect(ship.voyage).toMatchObject({ phase: 'toNewWorld' });
    expect(player(r.state)).toMatchObject({ taxRate: 22, pendingOffer: null });
    expect(r.events.map((e) => e.type)).toEqual(['frigateGranted', 'shipSailed', 'taxChanged', 'royalOfferAnswered']);
    expect(checkInvariants(r.state)).toEqual([]);
  });

  it('declining, or leaving it unanswered, costs nothing', () => {
    const asked = frigateOffer(threatened(), 'a', []);
    const no = applyAction(asked, { type: 'answerOffer', accept: false });
    expect(player(no.state)).toMatchObject({ taxRate: 0, pendingOffer: null });
    expect(Object.values(no.state.units).filter((u) => u.owner === 'a')).toEqual([]);
    const lapsed = applyAction(asked, { type: 'endTurn' });
    expect(player(lapsed.state).pendingOffer).toBeNull();
    expect(lapsed.events.find((e) => e.type === 'royalOfferAnswered')).toMatchObject({ accepted: false });
    expect(code(no.state, { type: 'answerOffer', accept: true })).toBe('noOfferPending');
  });

  it('a computer power just gets the ship', () => {
    const events: GameEvent[] = [];
    const r = frigateOffer(threatened('ai'), 'a', events as RoyalEvent[]);
    expect(events.map((e) => e.type)).toEqual(['frigateGranted', 'shipSailed']);
    expect(player(r)).toMatchObject({ taxRate: 0, pendingOffer: null });
  });
});

describe('naval aid for a computer power', () => {
  const ship = (s: GameState, id: string, owner: string, type: Unit['type']): GameState => withUnit(s, { id, owner, type, profession: null, x: 6, y: 3 });
  /** Computer power a with a colony; b, c and d each with a frigate (attack 4 apiece: an average of 4). */
  const fleets = (opts: Parameters<typeof base>[0] = {}): GameState => {
    let s = withColony(base({ kinds: ['ai', 'ai'], ...opts }), { id: 'col', owner: 'a', x: 1, y: 1, name: 'Home' });
    for (const o of ['b', 'c', 'd']) s = ship(s, `f-${o}`, o, 'frigate');
    return s;
  };
  const aid = (s: GameState): { state: GameState; events: RoyalEvent[] } => {
    const events: RoyalEvent[] = [];
    return { state: navalAid(s, 'a', events), events };
  };
  const granted = (s: GameState): Unit | undefined => Object.values(aid(s).state.units).find((u) => u.owner === 'a' && (u.type === 'privateer' || u.type === 'frigate'));

  it('with no ship of any kind left it is given a warship in Europe, free', () => {
    const r = aid(fleets());
    const got = granted(fleets()) as Unit;
    expect(got.voyage).toMatchObject({ phase: 'inEurope' });
    expect(r.events).toEqual([{ type: 'warshipGranted', player: 'a', unitId: got.id, unitType: got.type }]);
    expect(player(r.state).gold).toBe(player(fleets()).gold);
    expect(checkInvariants(r.state)).toEqual([]);
    // a privateer oftener than a frigate, by their prices
    const kinds = Array.from({ length: 60 }, (_, seed) => granted(fleets({ seed }))?.type);
    expect(kinds.filter((k) => k === 'privateer').length).toBeGreaterThan(kinds.filter((k) => k === 'frigate').length);
    expect(kinds.filter((k) => k === 'frigate').length).toBeGreaterThan(0);
  });

  it('not for a human, a power fighting for independence, or one with nothing in the New World', () => {
    expect(aid(fleets({ kinds: ['human', 'ai'] })).events).toEqual([]);
    expect(aid(patch(fleets(), 'a', { atWar: true })).events).toEqual([]);
    expect(aid({ ...fleets(), colonies: {} }).events).toEqual([]);
  });

  it('a power with only transports gets none: the chance goes by the strength it has', () => {
    const s = ship(fleets({ difficulty: 'viceroy' }), 'm', 'a', 'merchantman');
    expect(navalStrength(s, 'a')).toBe(0);
    for (let seed = 0; seed < 40; seed++) expect(aid(ship(fleets({ difficulty: 'viceroy', seed }), 'm', 'a', 'merchantman')).events).toEqual([]);
  });

  it('under half the average strength it is helped now and then, the oftener the harder the level, and never on the easiest', () => {
    // a privateer of its own (8) against four frigates among the other three (an average of 21)
    const weak = (difficulty: Level, seed: number): GameState => ship(ship(fleets({ difficulty, seed }), 'p', 'a', 'privateer'), 'f2-b', 'b', 'frigate');
    const own = navalStrength(weak('viceroy', 0), 'a');
    const average = (navalStrength(weak('viceroy', 0), 'b') + navalStrength(weak('viceroy', 0), 'c') + navalStrength(weak('viceroy', 0), 'd')) / 3;
    expect(AI_NAVY.aidBelow * own).toBeLessThan(average);
    const times = (difficulty: Level): number => Array.from({ length: 400 }, (_, seed) => aid(weak(difficulty, seed)).events.length).reduce((a, b) => a + b, 0);
    expect(times('discoverer')).toBe(0);
    const hardest = times('viceroy');
    // the chance is strength / average x 20 percent
    const percent = Math.trunc((own * AI_NAVY.aidPercent[4]) / average);
    expect(hardest).toBeGreaterThan(0);
    expect(percent).toBeGreaterThan(0);
    expect(hardest).toBeLessThan(3 * 4 * percent); // 400 tries: about 4 x percent of them
    // as strong as half the average, or stronger: nothing
    for (let seed = 0; seed < 40; seed++) expect(aid(ship(weak('viceroy', seed), 'p2', 'a', 'frigate')).events).toEqual([]);
  });
});

describe('mercenaries', () => {
  const rich = (seed: number, gold = 100000): GameState => patch(withColony(base({ seed }), { id: 'col', owner: 'a', x: 1, y: 1, name: 'Home', colonists: people(3, 'h') }), 'a', { gold });
  const run = (s: GameState): { state: GameState; events: RoyalEvent[] } => {
    const events: RoyalEvent[] = [];
    return { state: mercenaryOffer(s, 'a', events), events };
  };
  type Mercs = Extract<Player['pendingOffer'], { kind: 'mercenaries' }>;

  it('are offered about one turn in 21 by our own Crown or a friendly one, at a price by size and level', () => {
    let offers = 0;
    for (let seed = 0; seed < 3000; seed++) {
      const r = run(rich(seed));
      const offer = player(r.state).pendingOffer as Mercs | null;
      if (!offer) continue;
      offers++;
      expect(offer.from).toBe('england'); // nobody else is at peace with us
      expect(offer.dragoons).toBeGreaterThanOrEqual(1);
      expect(offer.dragoons).toBeLessThanOrEqual(4);
      expect([0, 1, 2]).toContain(offer.artillery);
      if (offer.artillery > 0) expect(offer.dragoons).toBeLessThanOrEqual(3);
      const perWeight = offer.price / 100 / (offer.dragoons + 2 * offer.artillery);
      expect(perWeight).toBeGreaterThanOrEqual(12);
      expect(perWeight).toBeLessThanOrEqual(18);
    }
    expect(offers / 3000).toBeCloseTo(1 / 21 / 4, 2);
  });

  it('are not offered to a treasury that cannot pay, to a power without colonies, or in wartime', () => {
    for (let seed = 0; seed < 600; seed++) {
      expect(run(rich(seed, 1000)).events).toEqual([]);
      expect(run(patch(base({ seed }), 'a', { gold: 100000 })).events).toEqual([]);
      expect(run(patch(rich(seed), 'a', { atWar: true })).events).toEqual([]);
    }
  });

  it('accepting pays the price and musters them in the largest colony', () => {
    const offered = seek((seed) => run(rich(seed)).state, (s) => player(s).pendingOffer !== null, 3000);
    const offer = player(offered).pendingOffer as Mercs;
    expect(code(patch(offered, 'a', { gold: offer.price - 1 }), { type: 'answerOffer', accept: true })).toBe('cannotAfford');
    expect(code(patch(offered, 'a', { gold: offer.price - 1 }), { type: 'answerOffer', accept: false })).toBe('ok');
    const r = applyAction(offered, { type: 'answerOffer', accept: true });
    const hired = Object.values(r.state.units).filter((u) => u.owner === 'a');
    expect(hired.filter((u) => u.type === 'dragoon' && u.profession === 'veteranDragoon')).toHaveLength(offer.dragoons);
    expect(hired.filter((u) => u.type === 'artillery')).toHaveLength(offer.artillery);
    expect(hired.every((u) => u.x === 1 && u.y === 1 && u.voyage === null)).toBe(true);
    expect(player(r.state).gold).toBe(100000 - offer.price);
    expect(checkInvariants(r.state)).toEqual([]);
  });
});

describe('royal transport of treasure', () => {
  it('takes the larger of twice the tax and 50..70 by level, capped at 90', () => {
    expect(DIFFICULTIES.map((difficulty) => royalTransportCut(base({ difficulty }), 'a'))).toEqual([50, 55, 60, 65, 70]);
    expect(royalTransportCut(patch(base(), 'a', { taxRate: 35 }), 'a')).toBe(70);
    expect(royalTransportCut(patch(base(), 'a', { taxRate: 60 }), 'a')).toBe(90);
    expect(royalTransport(base(), 'a', 4250)).toEqual({ fee: 2550, net: 1700 });
  });

  it('with Cortes only the tax rate is taken; after the Declaration nothing', () => {
    const cortes = patch(base({ fathers: ['hernanCortes'] }), 'a', { taxRate: 12 });
    expect(royalTransportCut(cortes, 'a')).toBe(12);
    expect(royalTransport(cortes, 'a', 1000)).toEqual({ fee: 120, net: 880 });
    expect(royalTransportCut(patch(base(), 'a', { atWar: true }), 'a')).toBe(0);
  });
});

describe('the War of Succession', () => {
  const rebels = (n: number, d: number): Partial<Colony> => ({ sol: { n, d } });
  function setup(sentiment: 'low' | 'high'): GameState {
    let s = base();
    s = withColony(s, { id: 'mine', owner: 'a', x: 1, y: 1, name: 'Mine', colonists: people(4, 'm'), ...rebels(sentiment === 'high' ? 2 : 1, 4) });
    s = withColony(s, { id: 'big', owner: 'b', x: 4, y: 1, name: 'Big', colonists: people(6, 'b') });
    s = withColony(s, { id: 'mid', owner: 'c', x: 7, y: 1, name: 'Mid', colonists: people(5, 'c') });
    s = withColony(s, { id: 'small', owner: 'd', x: 10, y: 1, name: 'Small', colonists: people(1, 'd'), ...rebels(1, 1) });
    s = withUnit(s, { id: 'dguard', owner: 'd', type: 'soldier', x: 10, y: 1 });
    s = withUnit(s, { id: 'dship', owner: 'd', type: 'caravel', profession: null, x: -1, y: -1 });
    s = { ...s, units: { ...s.units, dship: { ...(s.units['dship'] as Unit), voyage: { phase: 'inEurope', turnsLeft: 0, origin: [13, 8] } } } };
    return s;
  }
  const run = (s: GameState, force = false): { state: GameState; events: RoyalEvent[] } => {
    const events: RoyalEvent[] = [];
    return { state: succession(s, 'a', events, force), events };
  };

  it('sizes a power by ships, colonies and colonists', () => {
    expect(powerSize(setup('low'), 'd')).toBe(3 + 2 + 1);
    expect(powerSize(setup('low'), 'b')).toBe(2 + 6);
  });

  it('waits for the human power to reach 50% rebel sentiment, unless forced', () => {
    expect(run(setup('low')).events).toEqual([]);
    expect(run(setup('low'), true).events).toHaveLength(1);
  });

  it('the smallest computer power is absorbed by the next smallest and leaves the game', () => {
    const r = run(setup('high'));
    expect(r.events).toEqual([{ type: 'succession', loser: 'd', heir: 'c', colonies: 1, units: 1, lost: {} }]);
    expect(r.state.colonies['small']).toMatchObject({ owner: 'c', sol: { n: 0, d: 1 } });
    expect(r.state.units['dguard']?.owner).toBe('c');
    expect(r.state.units['dship']).toBeUndefined();
    expect(player(r.state, 'd').withdrawn).toBe(true);
    expect(r.state.succession).toEqual({ loser: 'd', heir: 'c' });
    expect(checkInvariants(r.state)).toEqual([]);
    expect(run(r.state).events).toEqual([]); // only once
  });

  it('a withdrawn power takes no more turns', () => {
    let s = run(setup('high')).state;
    const seen: string[] = [];
    for (let i = 0; i < 6; i++) {
      s = applyAction(s, { type: 'endTurn' }).state;
      seen.push(s.players[s.current]?.id ?? '?');
    }
    expect(seen).toEqual(['b', 'c', 'a', 'b', 'c', 'a']);
    expect(s.turn).toBe(2);
  });

  it('does not happen with two human powers, or with fewer than two computer powers', () => {
    const two = setup('high');
    expect(run({ ...two, players: two.players.map((p) => (p.id === 'b' ? { ...p, kind: 'human' as const } : p)) }).events).toEqual([]);
    const lone = setup('high');
    expect(run({ ...lone, players: lone.players.map((p) => (p.id === 'b' || p.id === 'c' ? { ...p, withdrawn: true } : p)) }).events).toEqual([]);
  });
});

describe('independence for the others', () => {
  const rival = (pop: number, n: number, difficulty: Level = 'conquistador'): GameState =>
    withColony(base({ difficulty }), { id: 'theirs', owner: 'b', x: 4, y: 1, name: 'Theirs', colonists: people(pop, 't'), sol: { n, d: pop } });
  const run = (s: GameState): { state: GameState; events: RoyalEvent[] } => {
    const events: RoyalEvent[] = [];
    return { state: foreignIndependence(s, 'b', events), events };
  };

  it('is granted when rebels reach 10 x (8 - level)', () => {
    // 100% of 60 colonists would be needed on the middle level; a colony cannot be that big, so use many
    let s = base();
    const sites: [number, number][] = [[4, 1], [7, 1], [10, 1], [4, 4], [7, 4], [10, 4]];
    sites.forEach(([x, y], i) => {
      s = withColony(s, { id: `t${i}`, owner: 'b', x, y, name: `T${i}`, colonists: people(10, `t${i}-`), sol: { n: 10, d: 10 } });
    });
    const r = run(s);
    expect(r.events).toEqual([{ type: 'independenceGranted', player: 'b' }]);
    expect(player(r.state, 'b').independent).toBe(true);
    expect(run(r.state).events).toEqual([]);
    expect(run({ ...s, colonies: Object.fromEntries(Object.entries(s.colonies).slice(0, 5)) }).events).toEqual([{ type: 'independenceTalk', player: 'b', rebels: 50, rising: true }]);
  });

  it('is talked of when close and rising, and again when it falls away', () => {
    const near = run(rival(25, 25, 'viceroy')); // 25 rebels against a mark of 40
    expect(near.events).toEqual([{ type: 'independenceTalk', player: 'b', rebels: 25, rising: true }]);
    expect(run(near.state).events).toEqual([]);
    const fallen = { ...near.state, colonies: { theirs: { ...(near.state.colonies['theirs'] as Colony), sol: { n: 15, d: 25 } } } };
    expect(run(fallen).events).toEqual([{ type: 'independenceTalk', player: 'b', rebels: 15, rising: false }]);
    expect(run(rival(10, 10, 'viceroy')).events).toEqual([]);
  });

  it('never for a human power, nor once the human has declared', () => {
    const events: RoyalEvent[] = [];
    foreignIndependence(rival(25, 25, 'viceroy'), 'a', events);
    expect(events).toEqual([]);
    expect(run(patch(rival(25, 25, 'viceroy'), 'a', { atWar: true })).events).toEqual([]);
  });
});
