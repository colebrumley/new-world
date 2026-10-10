import { describe, expect, it } from 'vitest';
import { applyAction, listValidActions, validateAction, type Action, type GameEvent } from '../../../src/engine/actions';
import { tribalAlarm } from '../../../src/engine/alarm';
import { DIPLOMACY } from '../../../src/engine/data/diplomacy';
import { settlementPopulation } from '../../../src/engine/data/tribes';
import type { DIFFICULTIES } from '../../../src/engine/data/yields';
import {
  alliancePrice, contactSweep, dealing, diplomacyTurn, powersMeet, pressureOn, privateerOutrage, setStance, settleAudiences, sizeUp, wantsWar, withDealing,
  type DiplomacyEvent,
} from '../../../src/engine/diplomacy';
import { docksOf } from '../../../src/engine/europe';
import { checkInvariants } from '../../../src/engine/invariants';
import { createRng } from '../../../src/engine/rng';
import type { Audience, Colonist, GameState, Player, Settlement, TribeState } from '../../../src/engine/state';
import { setTile, withColony, withUnit, world } from '../../helpers/world';

type Level = (typeof DIFFICULTIES)[number];
type Result = { state: GameState; events: readonly GameEvent[] };
const ROWS = Array.from({ length: 14 }, (_, y) => (y === 0 || y === 13 ? '~'.repeat(20) : `~${'.'.repeat(18)}~`));
const people = (n: number, p: string): Colonist[] => Array.from({ length: n }, (_, i) => ({ id: `${p}${i}`, profession: 'freeColonist' as const, job: { kind: 'idle' as const }, turns: 0 }));
interface Opts { seed?: number; difficulty?: Level; turn?: number; fathers?: string[]; gold?: number; theirGold?: number; kinds?: ('human' | 'ai')[] }
/** Player a (human) with Home at (4,4); player b (computer, France) with Paris at (12,4); player c (computer, Spain) far away. */
function lands(o: Opts = {}): GameState {
  let s = world({
    rows: ROWS, seed: o.seed ?? 1, difficulty: o.difficulty ?? 'conquistador',
    players: [{ id: 'a', kind: o.kinds?.[0] ?? 'human', fathers: o.fathers ?? [] }, { id: 'b', kind: o.kinds?.[1] ?? 'ai', nation: 'france' }, { id: 'c', kind: 'ai', nation: 'spain' }],
  });
  s = { ...s, turn: o.turn ?? 120, players: s.players.map((p) => (p.id === 'a' ? { ...p, gold: o.gold ?? 2000 } : p.id === 'b' ? { ...p, gold: o.theirGold ?? 1000 } : p)) };
  s = withColony(s, { id: 'home', owner: 'a', x: 4, y: 4, name: 'Home', colonists: people(6, 'h') });
  s = withColony(s, { id: 'paris', owner: 'b', x: 12, y: 4, name: 'Paris', colonists: people(6, 'p') });
  return withColony(s, { id: 'madrid', owner: 'c', x: 12, y: 10, name: 'Madrid', colonists: people(6, 'm') });
}
const army = (s: GameState, owner: string, n: number, x: number, y: number, prefix = owner): GameState => {
  let next = s;
  for (let i = 0; i < n; i++) next = withUnit(next, { id: `${prefix}${x}-${y}-${i}`, owner, type: 'artillery', profession: null, x, y });
  return next;
};
const me = (s: GameState, id = 'a'): Player => s.players.find((p) => p.id === id) as Player;
const code = (s: GameState, a: Action): string => {
  const v = validateAction(s, a);
  return v.ok ? 'ok' : v.error.code;
};
const meet = (s: GameState, a = 'a', b = 'b'): { state: GameState; events: DiplomacyEvent[] } => {
  const events: DiplomacyEvent[] = [];
  return { state: powersMeet(s, a, b, events), events };
};
const hold = (s: GameState): Result => applyAction(meet(s).state, { type: 'holdAudience', with: 'b' });
const reply = (s: GameState, r: Action & { type: 'audienceReply' }): Result => applyAction(s, r);
const say = (s: GameState, answer: 'yes' | 'no' | 'goInPeace' | 'withdraw' | 'valueLives' | 'pay' | 'threaten'): Result => reply(s, { type: 'audienceReply', reply: answer });
const question = (r: Result): Extract<DiplomacyEvent, { type: 'audienceQuestion' }> | undefined =>
  [...r.events].reverse().find((e) => e.type === 'audienceQuestion') as Extract<DiplomacyEvent, { type: 'audienceQuestion' }> | undefined;
const audience = (overrides: Partial<Audience>): Audience => ({ human: 'a', ai: 'b', stage: 'menu', demand: 0, fear: 0, hostile: false, cameHostile: false, tributeRefused: false, gold: 0, pressure: 0, ...overrides });

describe('diplomacy table', () => {
  it('matches the snapshot', () => {
    expect(DIPLOMACY).toMatchSnapshot();
  });
});

describe('meeting', () => {
  it('powers whose units or colonies come alongside have met; until they agree otherwise it is war', () => {
    const r = meet(lands());
    expect(r.events).toEqual([{ type: 'powersMet', a: 'a', b: 'b' }, { type: 'audienceRequested', human: 'a', ai: 'b' }]);
    expect(me(r.state).stance).toEqual({ b: 'war' });
    expect(me(r.state, 'b').stance).toEqual({ a: 'war' });
    expect(me(r.state).audiencesDue).toEqual(['b']);
    expect(meet(r.state).events).toEqual([]); // already asked
  });

  it('happens when a unit steps beside a foreign unit or colony', () => {
    const s = withUnit(lands(), { id: 'u', x: 9, y: 4 });
    const far = applyAction(s, { type: 'moveUnit', unitId: 'u', dx: 1, dy: 0 });
    expect(far.events.some((e) => e.type === 'powersMet')).toBe(false);
    const near = applyAction(withUnit(lands(), { id: 'u', x: 10, y: 4 }), { type: 'moveUnit', unitId: 'u', dx: 1, dy: 0 });
    expect(near.events.filter((e) => e.type === 'powersMet')).toEqual([{ type: 'powersMet', a: 'a', b: 'b' }]);
    expect(checkInvariants(near.state)).toEqual([]);
    const events: DiplomacyEvent[] = [];
    contactSweep(lands(), 'a', events);
    expect(events).toEqual([]);
  });

  it('a second audience is granted only sixteen turns after the last', () => {
    const talked = say(say(hold(lands()).state, 'yes').state, 'goInPeace').state; // peace made, and the envoy dismissed
    expect(dealing(talked, 'b', 'a').lastTalk).toBe(120);
    expect(meet({ ...talked, turn: 130 }).events).toEqual([]);
    expect(meet({ ...talked, turn: 136 }).events).toEqual([{ type: 'audienceRequested', human: 'a', ai: 'b' }]);
  });

  it('nobody parleys with a power fighting for its independence', () => {
    const s = lands();
    const declared = { ...s, players: s.players.map((p) => (p.id === 'a' ? { ...p, atWar: true } : p)) };
    expect(meet(declared).state).toBe(declared);
  });
});

describe('an audience', () => {
  it('with a power that has no quarrel: it proposes peace, and a treaty binds it for a while', () => {
    const r = hold(lands());
    expect(question(r)).toEqual({ type: 'audienceQuestion', human: 'a', ai: 'b', stage: 'worthy', gold: 0, hostile: false });
    expect(listValidActions(r.state).filter((a) => a.type === 'audienceReply').map((a) => (a as { reply: string }).reply)).toEqual(['yes', 'no']);
    const peace = say(r.state, 'yes');
    expect(peace.events.find((e) => e.type === 'treatySigned')).toEqual({ type: 'treatySigned', a: 'a', b: 'b' });
    expect(me(peace.state).stance['b']).toBe('peace');
    // with a treaty comes the menu
    expect(question(peace)?.stage).toBe('menu');
    const left = say(peace.state, 'goInPeace');
    expect(left.state.audience).toBeNull();
    expect(left.events.at(-1)).toEqual({ type: 'audienceEnded', human: 'a', ai: 'b', peace: true });
    expect(dealing(left.state, 'b', 'a')).toMatchObject({ lastTalk: 120, truce: 8 }); // 2 x (6 - level 2)
    expect(checkInvariants(left.state)).toEqual([]);
  });

  it('refusing peace leaves the two at war; a power that fears us may buy its peace instead', () => {
    const war = say(hold(lands()).state, 'no');
    expect(war.state.audience).toBeNull();
    expect(me(war.state).stance['b']).toBe('war');
    // a much stronger human frightens them
    const strong = army(lands({ theirGold: 5000 }), 'a', 6, 4, 4);
    const afraid = say(hold(strong).state, 'no');
    const offer = question(afraid)!;
    expect(offer.stage).toBe('cash');
    expect(offer.gold).toBeGreaterThan(0);
    const taken = say(afraid.state, 'yes');
    expect(me(taken.state).gold).toBe(2000 + offer.gold);
    expect(me(taken.state, 'b').gold).toBe(5000 - offer.gold);
    expect(me(taken.state).stance['b']).toBe('peace');
    expect(me(say(afraid.state, 'no').state).stance['b']).toBe('war');
  });

  it('a stronger power with our soldiers at its gates takes a hard line: withdraw, pay, or face war', () => {
    // their army is the larger, and ours stands beside Paris
    let s = army(lands(), 'b', 8, 12, 4);
    s = army(s, 'a', 2, 11, 4);
    s = withDealing(setStance(s, 'a', 'b', 'peace'), 'b', 'a', { lastTalk: 10 });
    const r = applyAction({ ...s, players: s.players.map((p) => (p.id === 'a' ? { ...p, audiencesDue: ['b'] } : p)) }, { type: 'holdAudience', with: 'b' });
    const first = question(r)!;
    expect(first).toMatchObject({ stage: 'sieges', hostile: true });
    expect(pressureOn(r.state, 'a', 'b').strength).toBe(14);
    // agreeing sends those troops home and cools them
    const agreed = say(r.state, 'yes');
    expect(agreed.events.find((e) => e.type === 'forcesWithdrawn')).toMatchObject({ player: 'a' });
    expect(docksOf(agreed.state, 'a')).toHaveLength(2);
    expect(question(agreed)?.stage).toBe('menu');
    // refusing brings the demand for tribute
    const refused = say(r.state, 'no');
    const tribute = question(refused)!;
    expect(tribute).toMatchObject({ stage: 'tribute', hostile: true });
    expect(tribute.gold % 50).toBe(0);
    expect(tribute.gold).toBeGreaterThan(100);
    const paid = say(refused.state, 'yes');
    expect(me(paid.state).gold).toBe(2000 - tribute.gold);
    expect(me(paid.state).stance['b']).toBe('peace');
    const defied = say(refused.state, 'no');
    expect(defied.events.some((e) => e.type === 'warDeclared' && e.by === 'b' && e.on === 'a')).toBe(true);
    expect(me(defied.state).stance['b']).toBe('war');
    expect(dealing(defied.state, 'a', 'b').grudge).toBe(true); // they broke the treaty
  });

  it('asks for tribute the treasury can only just pay: a demand cut to fit a round treasury is still put', () => {
    // the hard line again, but with 600 gold the demand is cut to exactly what we hold
    for (const gold of [600, 601]) {
      let s = army(lands({ gold }), 'b', 8, 12, 4);
      s = army(s, 'a', 2, 11, 4);
      s = withDealing(setStance(s, 'a', 'b', 'peace'), 'b', 'a', { lastTalk: 10 });
      expect(sizeUp(s, 'a', 'b', createRng(1))).toMatchObject({ demand: 600, hostile: true });
      const r = applyAction({ ...s, players: s.players.map((p) => (p.id === 'a' ? { ...p, audiencesDue: ['b'] } : p)) }, { type: 'holdAudience', with: 'b' });
      expect(question(r)?.stage).toBe('sieges');
      const refused = say(r.state, 'no');
      expect(question(refused)).toMatchObject({ stage: 'tribute', gold: 600, hostile: true });
      expect(refused.events.some((e) => e.type === 'warDeclared' || e.type === 'audienceEnded')).toBe(false);
      expect(code(refused.state, { type: 'audienceReply', reply: 'yes' })).toBe('ok');
      const paid = say(refused.state, 'yes');
      expect(me(paid.state).gold).toBe(gold - 600);
      expect(me(paid.state).stance['b']).toBe('peace');
      expect(paid.events.some((e) => e.type === 'warDeclared')).toBe(false);
    }
  });

  it('sizes the other power up by strength, pressure, grudges and the times', () => {
    const view = (s: GameState): ReturnType<typeof sizeUp> => sizeUp(s, 'a', 'b', createRng(1));
    const even = view(lands());
    expect(even).toMatchObject({ demand: 0, fear: 0, hostile: false, pressure: 0 });
    const pressed = army(army(lands(), 'b', 8, 12, 4), 'a', 2, 11, 4);
    const base = view(pressed);
    expect(base.demand).toBeGreaterThan(0);
    expect(view(withDealing(pressed, 'b', 'a', { grudge: true, lastTalk: 5 })).demand).toBeGreaterThan(view(withDealing(pressed, 'b', 'a', { lastTalk: 5 })).demand);
    expect(view({ ...withDealing(pressed, 'b', 'a', { lastTalk: 5 }), turn: 30 }).demand).toBeLessThan(view(withDealing(pressed, 'b', 'a', { lastTalk: 5 })).demand);
    const franklin = army(army(lands({ fathers: ['benjaminFranklin'] }), 'b', 8, 12, 4), 'a', 2, 11, 4);
    expect(view(franklin).hostile).toBe(false);
    expect(view(franklin).demand).toBeLessThan(base.demand + 1);
    expect(view(army(lands(), 'a', 6, 4, 4)).fear).toBeGreaterThan(0);
  });

  it('answers must fit the question, and the gold must be there', () => {
    const r = hold(lands());
    expect(code(r.state, { type: 'audienceReply', reply: 'withdraw' })).toBe('badReply');
    expect(code(lands(), { type: 'audienceReply', reply: 'yes' })).toBe('noAudience');
    expect(code(lands(), { type: 'holdAudience', with: 'b' })).toBe('notDue');
    expect(code(r.state, { type: 'holdAudience', with: 'b' })).toBe('badReply');
    const broke: GameState = { ...lands({ gold: 10 }), audience: audience({ stage: 'tribute', gold: 500, hostile: true }) };
    expect(code(broke, { type: 'audienceReply', reply: 'yes' })).toBe('cannotAfford');
    expect(code(broke, { type: 'audienceReply', reply: 'no' })).toBe('ok');
  });
});

describe('the treaty menu', () => {
  const treaty = (s: GameState, extra: Partial<Audience> = {}): GameState => ({ ...setStance(s, 'a', 'b', 'peace'), audience: audience(extra) });

  it('"withdraw your forces": nothing to withdraw, or a frightened power complies', () => {
    expect(say(treaty(lands()), 'withdraw').state.audience).toBeNull();
    const theirs = army(lands(), 'b', 2, 5, 4);
    const scared = say(treaty(theirs, { fear: 3 }), 'withdraw');
    expect(scared.events.find((e) => e.type === 'forcesWithdrawn')).toMatchObject({ player: 'b' });
    expect(docksOf(scared.state, 'b')).toHaveLength(2);
  });

  it('"withdraw": otherwise it names a price; we may pay, threaten or let it be', () => {
    const theirs = army(lands(), 'b', 2, 5, 4);
    const asked = say(treaty(theirs), 'withdraw');
    // 25 x (level 2 + 2) x their 14 points at our gates
    expect(question(asked)).toMatchObject({ stage: 'withdraw', gold: 1400 });
    const paid = say(asked.state, 'pay');
    expect(me(paid.state).gold).toBe(600);
    expect(docksOf(paid.state, 'b')).toHaveLength(2);
    expect(say(asked.state, 'no').state.units['b5-4-0']).toMatchObject({ x: 5, y: 4 });
    let backedDown = 0;
    let war = 0;
    for (let seed = 0; seed < 200; seed++) {
      const t = say({ ...asked.state, rng: lands({ seed }).rng }, 'threaten');
      if (t.events.some((e) => e.type === 'warDeclared')) war++;
      else if (t.events.some((e) => e.type === 'forcesWithdrawn')) backedDown++;
    }
    expect(war).toBeGreaterThan(20); // we have no army: the threat is mostly hollow
    expect(backedDown + war).toBe(200);
  });

  it('"how much do you value your lives": a frightened power pays; an unafraid one shrugs, or fights if it came in anger', () => {
    const gift = say(treaty(lands({ theirGold: 900 }), { fear: 4 }), 'valueLives');
    expect(gift.events.find((e) => e.type === 'goldPaid')).toEqual({ type: 'goldPaid', from: 'b', to: 'a', amount: 400, why: 'gift' });
    const shrug = say(treaty(lands()), 'valueLives');
    expect(shrug.events.some((e) => e.type === 'warDeclared' || e.type === 'goldPaid')).toBe(false);
    const angry = say(treaty(lands(), { cameHostile: true }), 'valueLives');
    expect(angry.events.some((e) => e.type === 'warDeclared')).toBe(true);
  });

  it('"alliance": for a price they make war on a power they know, who will not forget who paid', () => {
    const met = setStance(lands(), 'b', 'c', 'peace');
    const price = alliancePrice(met, 'a', 'c');
    expect(price).toBeGreaterThanOrEqual(500);
    expect(price).toBeLessThanOrEqual(10000);
    const hired = reply(treaty(met), { type: 'audienceReply', reply: 'alliance', target: 'c' });
    expect(me(hired.state).gold).toBe(2000 - price);
    expect(me(hired.state, 'b').stance['c']).toBe('war');
    expect(dealing(hired.state, 'c', 'a').grudge).toBe(true);
    expect(hired.events.find((e) => e.type === 'allyHired')).toEqual({ type: 'allyHired', by: 'a', ally: 'b', against: 'c' });
    expect(code(treaty(lands()), { type: 'audienceReply', reply: 'alliance', target: 'c' })).toBe('noTarget'); // they have never met
    expect(code(treaty(met), { type: 'audienceReply', reply: 'alliance' })).toBe('noTarget');
    expect(code(treaty(setStance(lands(), 'b', 'c', 'war')), { type: 'audienceReply', reply: 'alliance', target: 'c' })).toBe('noTarget');
    expect(code(treaty(lands({ gold: 100 }), {}), { type: 'audienceReply', reply: 'alliance', target: 'c' })).toBe('noTarget');
  });

  it('"alliance" against a tribe sets that tribe on them', () => {
    const v: Settlement = { id: 'v', tribe: 'sioux', x: 16, y: 8, capital: false, population: settlementPopulation('sioux', false).start, growth: 0, taught: false, tributePaid: false, alarm: {}, mission: null, scouted: [], lastBought: null, lastSold: null, haggleMemory: null };
    const tribe: TribeState = { alarm: {}, goodwill: {}, met: ['a', 'b'], muskets: 0, horses: 0, breeding: 0, silver: 0, peace: ['a', 'b'], landSold: 0, grudge: [], joinedCrown: false, visited: {}, stock: {} };
    const s: GameState = { ...treaty(lands()), settlements: { v }, tribes: { sioux: tribe } };
    const hired = reply(s, { type: 'audienceReply', reply: 'alliance', target: 'tribe:sioux' });
    expect(tribalAlarm(hired.state, 'sioux', 'b')).toBe(50); // the French: increases halved
    expect(hired.events.find((e) => e.type === 'allyHired')).toMatchObject({ against: 'tribe:sioux' });
  });
});

describe('envoys left waiting', () => {
  it('are heard out with the mildest answers when the turn ends: peace accepted, nothing paid', () => {
    const waiting = meet(lands()).state;
    const ended = applyAction(waiting, { type: 'endTurn' });
    expect(me(ended.state).stance['b']).toBe('peace');
    expect(me(ended.state).audiencesDue).toEqual([]);
    expect(ended.state.audience).toBeNull();
    const events: DiplomacyEvent[] = [];
    const settled = settleAudiences(hold(lands()).state, 'a', events);
    expect(settled.audience).toBeNull();
    expect(me(settled).gold).toBe(2000);
  });
});

describe('acts of war and their memory', () => {
  it('attacking a treaty partner breaks the treaty and leaves a grudge', () => {
    let s = setStance(lands(), 'a', 'b', 'peace');
    s = withUnit(withUnit(s, { id: 'mine', type: 'soldier', x: 8, y: 8 }), { id: 'theirs', owner: 'b', type: 'soldier', x: 9, y: 8 });
    const r = applyAction(s, { type: 'attack', unitId: 'mine', dx: 1, dy: 0 });
    expect(me(r.state).stance['b']).toBe('war');
    expect(dealing(r.state, 'b', 'a').grudge).toBe(true);
    expect(dealing(r.state, 'a', 'b').grudge).toBe(false);
  });

  it('a privateer starts no war, but its victim remembers and may come to mean harm', () => {
    let grudges = 0;
    for (let seed = 0; seed < 1010; seed++) {
      const s = privateerOutrage(setStance(lands(), 'a', 'b', 'peace'), 'a', 'b', createRng(seed));
      expect(dealing(s, 'b', 'a').piracy).toBe(true);
      expect(me(s).stance['b']).toBe('peace');
      if (dealing(s, 'b', 'a').grudge || dealing(s, 'b', 'a').intent) grudges++;
    }
    expect(grudges / 1010).toBeCloseTo(3 / 101, 1);
  });

  it('piracy is raised at the next audience; agreeing sends the privateers home', () => {
    let s = setTile(lands(), 1, 1, { base: 'ocean' });
    s = withUnit(s, { id: 'rover', type: 'privateer', profession: null, x: 1, y: 1 });
    s = withDealing(s, 'b', 'a', { piracy: true });
    const r = hold(s);
    expect(question(r)?.stage).toBe('piracy');
    const agreed = say(r.state, 'yes');
    expect(agreed.state.units['rover']?.voyage).toMatchObject({ phase: 'inEurope' });
    expect(dealing(agreed.state, 'b', 'a').piracy).toBe(false);
  });

  it('truces run down a turn at a time, and a power that means harm breaks its treaty when its truce is over', () => {
    let s = withDealing(setStance(lands(), 'a', 'b', 'peace'), 'b', 'a', { truce: 2, intent: true });
    const events: DiplomacyEvent[] = [];
    s = diplomacyTurn(s, 'b', events);
    s = diplomacyTurn(s, 'b', events);
    expect(dealing(s, 'b', 'a').truce).toBe(0);
    expect(events).toEqual([]);
    let broke = 0;
    for (let seed = 0; seed < 400; seed++) {
      const out: DiplomacyEvent[] = [];
      diplomacyTurn({ ...s, rng: lands({ seed }).rng }, 'b', out);
      if (out.some((e) => e.type === 'warDeclared')) broke++;
    }
    expect(broke / 400).toBeCloseTo(1 / 4, 1);
  });
});

describe('computer powers among themselves', () => {
  const two = (o: Opts = {}): GameState => {
    const s = lands({ ...o, kinds: ['ai', 'ai'] });
    // one of them must be a power of some size before either thinks of war
    return { ...s, colonies: { ...s.colonies, home: { ...s.colonies['home']!, colonists: people(9, 'h') } } };
  };

  it('sign a treaty when neither wants war', () => {
    // players 0 and 1 talk on turns where 0 + 1 + turn divides by three
    const r = meet(two({ turn: 119 }));
    expect(r.events).toEqual([{ type: 'powersMet', a: 'a', b: 'b' }, { type: 'treatySigned', a: 'a', b: 'b' }]);
    expect(me(r.state).stance['b']).toBe('peace');
    // a first meeting is always talked over; later ones only on the third turns
    expect(meet(two({ turn: 120 })).events).toEqual([{ type: 'powersMet', a: 'a', b: 'b' }, { type: 'treatySigned', a: 'a', b: 'b' }]);
    const atWar = setStance(two({ turn: 120 }), 'a', 'b', 'war');
    expect(meet(atWar).events).toEqual([]);
    expect(meet({ ...atWar, turn: 119 }).events).toEqual([{ type: 'treatySigned', a: 'a', b: 'b' }]);
  });

  it('want war only when clearly the stronger, late enough, and with nothing else on their hands', () => {
    const strong = army(two({ turn: 119 }), 'a', 6, 4, 4);
    expect(wantsWar(strong, 'a', 'b')).toBe(true);
    expect(wantsWar(strong, 'b', 'a')).toBe(false);
    expect(wantsWar({ ...strong, turn: 30 }, 'a', 'b')).toBe(false);
    expect(wantsWar(two({ turn: 119 }), 'a', 'b')).toBe(false);
    const peace = setStance(strong, 'a', 'b', 'peace');
    const broken = meet(peace);
    expect(broken.events).toEqual([{ type: 'warDeclared', by: 'a', on: 'b' }]);
    expect(dealing(broken.state, 'b', 'a').grudge).toBe(true);
    // while a human is the strongest power, the others keep their peace
    const humanOnTop = army(strong, 'c', 9, 12, 10);
    const ruled = { ...humanOnTop, players: humanOnTop.players.map((p) => (p.id === 'c' ? { ...p, kind: 'human' as const } : p)) };
    expect(wantsWar(ruled, 'a', 'b')).toBe(false);
  });
});

describe('a scout and the mayor', () => {
  it('gains an audience at once, whatever the calendar says', () => {
    const talked = withDealing(setStance(lands(), 'a', 'b', 'peace'), 'b', 'a', { lastTalk: 119 });
    const s = withUnit(talked, { id: 'sc', type: 'scout', x: 11, y: 4 });
    const r = applyAction(s, { type: 'meetMayor', unitId: 'sc', dx: 1, dy: 0 });
    expect(question(r)?.stage).toBe('menu');
    expect(r.state.units['sc']?.movesLeft).toBe(0);
    expect(code(withUnit(talked, { id: 'sc', type: 'soldier', x: 11, y: 4 }), { type: 'meetMayor', unitId: 'sc', dx: 1, dy: 0 })).toBe('noTarget');
    const rebel = { ...s, players: s.players.map((p) => (p.id === 'a' ? { ...p, atWar: true } : p)) };
    expect(code(rebel, { type: 'meetMayor', unitId: 'sc', dx: 1, dy: 0 })).toBe('noAudience');
  });
});

describe('trade in foreign colonies', () => {
  const wagon = (o: Opts = {}, peace = true): GameState => {
    const s = withUnit(lands(o), { id: 'w', type: 'wagonTrain', profession: null, x: 11, y: 4, cargo: { cloth: 100 } });
    return peace ? setStance(s, 'a', 'b', 'peace') : setStance(s, 'a', 'b', 'war');
  };
  const SELL: Action = { type: 'sellAbroad', unitId: 'w', colonyId: 'paris', good: 'cloth' };

  it('needs a treaty and Jan de Witt', () => {
    expect(code(wagon(), SELL)).toBe('noDeWitt');
    expect(code(wagon({ fathers: ['janDeWitt'] }, false), SELL)).toBe('atWar');
    expect(code(wagon({ fathers: ['janDeWitt'] }), SELL)).toBe('ok');
    expect(code(wagon({ fathers: ['janDeWitt'] }), { ...SELL, good: 'rum' })).toBe('noCargo');
    expect(code(wagon({ fathers: ['janDeWitt'] }), { ...SELL, colonyId: 'madrid' })).toBe('noTarget');
  });

  it('moves the cargo into their warehouse for gold from their treasury', () => {
    const r = applyAction(wagon({ fathers: ['janDeWitt'] }), SELL);
    const sold = r.events[0] as Extract<DiplomacyEvent, { type: 'soldAbroad' }>;
    expect(sold).toMatchObject({ type: 'soldAbroad', colonyId: 'paris', good: 'cloth', amount: 100 });
    expect(sold.gold).toBeGreaterThan(0);
    expect(r.state.units['w']?.cargo).toEqual({});
    expect(r.state.colonies['paris']?.goods.cloth).toBe(100);
    expect(me(r.state).gold).toBe(2000 + sold.gold);
    expect(me(r.state, 'b').gold).toBe(1000 - sold.gold);
    const poor = applyAction(wagon({ fathers: ['janDeWitt'], theirGold: 30 }), SELL);
    expect(me(poor.state, 'b').gold).toBe(0);
  });
});
