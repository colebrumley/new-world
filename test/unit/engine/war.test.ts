import { describe, expect, it } from 'vitest';
import { applyAction, validateAction, type GameEvent } from '../../../src/engine/actions';
import { combatOdds } from '../../../src/engine/combat';
import { declareIndependence } from '../../../src/engine/independence';
import { checkInvariants } from '../../../src/engine/invariants';
import { solPercent } from '../../../src/engine/liberty';
import type { Colonist, Colony, GameState, Player, RefForce, Unit } from '../../../src/engine/state';
import { crownMoves, interventionArrives, kingsShare, wartimeHire, warOutcome, warWarning } from '../../../src/engine/war';
import { withColony, withUnit, world } from '../../helpers/world';

const ROWS = ['~~~~~~~~~~~~~~', '~~~~~~~~~~~~~~', '~~..........~~', '~~..........~~', '~~..........~~', '~~..........~~', '~~~~~~~~~~~~~~', '~~~~~~~~~~~~~~'];
const people = (n: number, p = 'c'): Colonist[] => Array.from({ length: n }, (_, i) => ({ id: `${p}${i}`, profession: 'freeColonist' as const, job: { kind: 'idle' as const }, turns: 0 }));
const me = (s: GameState): Player => s.players[0] as Player;
const patch = (s: GameState, change: Partial<Player>): GameState => ({ ...s, players: s.players.map((p) => (p.id === 'a' ? { ...p, ...change } : p)) });
const NONE: RefForce = { regulars: 0, cavalry: 0, artillery: 0, ships: 0 };
const of = <T extends GameEvent['type']>(events: readonly GameEvent[], type: T): Extract<GameEvent, { type: T }>[] => events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);
const town = (s: GameState, id: string, x: number, y: number, pop = 3, sol = 80, extra: Partial<Colony> = {}): GameState =>
  withColony(s, { id, x, y, name: id, colonists: people(pop, id), sol: { n: sol * (pop + 1), d: 100 * (pop + 1) }, ...extra });

/** A war already declared: rebels `a` with ports at (2,3) and (11,3), rivals gone, the Crown under `b`. */
function war(difficulty: GameState['difficulty'] = 'conquistador', second = true): GameState {
  let s = world({ rows: ROWS, difficulty, players: [{ id: 'a' }, { id: 'b', kind: 'ai' }, { id: 'c', kind: 'ai' }, { id: 'd', kind: 'ai' }] });
  s = town(s, 'west', 2, 3);
  if (second) s = town(s, 'east', 11, 3);
  s = withColony(s, { id: 'cc', owner: 'c', x: 6, y: 5, name: 'C', colonists: people(2, 'x') });
  s = withColony(s, { id: 'cd', owner: 'd', x: 8, y: 5, name: 'D', colonists: people(5, 'y') });
  return declareIndependence(s, 'a', []);
}
const king = (s: GameState, id: string, type: Unit['type'], x: number, y: number): GameState => withUnit(s, { id, owner: 'b', type, profession: null, x, y, movesLeft: 0 });
const moves = (s: GameState): { state: GameState; events: GameEvent[] } => {
  const events: GameEvent[] = [];
  return { state: crownMoves(s, 'a', events), events };
};

describe('the setting', () => {
  it('b was the smallest and stands in for the Crown; c is the friend, d hires out soldiers', () => {
    const s = war();
    expect(s.crownPlayer).toBe('b');
    expect(me(s).revolution).toMatchObject({ friend: 'c', patron: 'd', refBeaten: false });
  });
});

describe('the King\'s troops ashore', () => {
  it('march on the nearest rebel colony', () => {
    const { state } = moves(king(war(), 'r', 'regular', 7, 3));
    expect(state.units['r']).toMatchObject({ x: 8, y: 3 }); // east is nearer
    const next = moves(state).state;
    expect(next.units['r']).toMatchObject({ x: 9, y: 3 });
    expect(checkInvariants(next)).toEqual([]);
  });

  it('cavalry covers the ground and storms the colony in the same turn', () => {
    const { state, events } = moves(king(war(), 'h', 'cavalry', 7, 3));
    // three squares to the gate, and the fourth move is the assault on an undefended colony
    expect(of(events, 'colonyCaptured')[0]).toMatchObject({ colonyId: 'east' });
    expect(state.units['h']).toMatchObject({ x: 11, y: 3 });
  });

  it('storm a colony they stand beside; an undefended one falls, and one of them stays to hold it', () => {
    let s = war();
    for (let i = 0; i < 3; i++) s = king(s, `r${i}`, 'regular', 10, 3);
    const { state, events } = moves(s);
    const fallen = of(events, 'colonyCaptured')[0]!;
    expect(fallen).toMatchObject({ colonyId: 'east', from: 'a', to: 'b', plunder: 0 });
    expect(state.colonies['east']?.owner).toBe('b');
    const inside = Object.values(state.units).filter((u) => u.owner === 'b' && u.x === 11 && u.y === 3);
    expect(inside.length).toBeGreaterThanOrEqual(1);
    // next turn the garrison digs in and the rest move on the other colony
    const later = moves(state).state;
    const held = Object.values(later.units).filter((u) => u.owner === 'b' && u.x === 11 && u.y === 3);
    expect(held.filter((u) => u.orders === 'fortified')).toHaveLength(1);
    expect(Object.values(later.units).filter((u) => u.owner === 'b' && u.x < 10).length).toBeGreaterThanOrEqual(1);
    expect(checkInvariants(later)).toEqual([]);
  });

  it('fall on a colonist in the open but leave a fortified veteran on a hill alone', () => {
    let s = king(war(), 'r', 'regular', 6, 3);
    s = withUnit(s, { id: 'farmer', x: 7, y: 2 });
    const caught = moves(s);
    expect(of(caught.events, 'battle')).toHaveLength(1);
    expect(caught.state.units['farmer']?.owner).toBe('b');

    let hill = king(war(), 'r', 'regular', 7, 3);
    hill = { ...hill, map: { ...hill.map, tiles: hill.map.tiles.map((t, i) => (i === 2 * 14 + 7 ? { ...t, relief: 'hills' as const } : t)) } };
    hill = withUnit(hill, { id: 'vet', type: 'continentalArmy', profession: 'veteranSoldier', x: 7, y: 2, orders: 'fortified' });
    const passed = moves(hill);
    expect(of(passed.events, 'battle')).toEqual([]);
    expect(passed.state.units['r']).toMatchObject({ x: 8, y: 3 }); // marches by
  });

  it('a colony the King holds turns against the rebels turn by turn', () => {
    let s = war();
    s = { ...s, colonies: { ...s.colonies, east: { ...(s.colonies['east'] as Colony), owner: 'b' } } };
    const before = solPercent(s, s.colonies['east'] as Colony);
    let next = s;
    for (let i = 0; i < 5; i++) next = moves(next).state;
    expect(solPercent(next, next.colonies['east'] as Colony)).toBeLessThan(before);
    // the rebels' own colony is untouched by this
    expect(next.colonies['west']).toBe(s.colonies['west']);
  });

  it('a repulse is remembered: the rebels have beaten the King\'s men', () => {
    // a fortress full of artillery and Continentals; one regular throws himself at it
    let s = town(war(), 'east', 11, 3, 3, 100, { buildings: ['stockade', 'fort', 'fortress'] });
    for (let i = 0; i < 3; i++) s = withUnit(s, { id: `g${i}`, type: 'artillery', profession: null, x: 11, y: 3, orders: 'fortified' });
    s = king(s, 'r', 'regular', 10, 3);
    let beaten: { state: GameState; events: GameEvent[] } | null = null;
    for (let seed = 1; seed < 40 && !beaten; seed++) {
      const tried = moves({ ...s, rng: world({ rows: ROWS, seed }).rng });
      if (of(tried.events, 'battle').some((e) => !e.attackerWon)) beaten = tried;
    }
    expect(beaten).not.toBeNull();
    expect(of(beaten!.events, 'refBeaten')).toEqual([{ type: 'refBeaten', player: 'a' }]);
    expect(me(beaten!.state).revolution?.refBeaten).toBe(true);
    expect(beaten!.state.units['r']).toBeUndefined(); // regulars who lose are destroyed
  });

  it('and so is a victory in the field', () => {
    let s = king(war(), 'r', 'damagedArtillery', 6, 3);
    s = withUnit(s, { id: 'cav', type: 'continentalCavalry', profession: 'veteranSoldier', x: 5, y: 3 });
    let won: { state: GameState; events: readonly GameEvent[] } | null = null;
    for (let seed = 1; seed < 40 && !won; seed++) {
      const tried = applyAction({ ...s, rng: world({ rows: ROWS, seed }).rng }, { type: 'attack', unitId: 'cav', dx: 1, dy: 0 });
      if (of(tried.events, 'battle').some((e) => e.attackerWon)) won = tried;
    }
    expect(of(won!.events, 'refBeaten')).toHaveLength(1);
    expect(me(won!.state).revolution?.refBeaten).toBe(true);
  });
});

describe('the rebels in the field', () => {
  it('may attack the King\'s troops and the colonies he holds, but nobody else\'s', () => {
    let s = king(war(), 'r', 'regular', 6, 3);
    s = withUnit(s, { id: 'cav', type: 'continentalCavalry', profession: 'veteranSoldier', x: 5, y: 3 });
    expect(validateAction(s, { type: 'attack', unitId: 'cav', dx: 1, dy: 0 }).ok).toBe(true);
    const beside = withUnit(s, { id: 'cav', type: 'continentalCavalry', profession: 'veteranSoldier', x: 5, y: 4 });
    const no = validateAction(beside, { type: 'attack', unitId: 'cav', dx: 1, dy: 1 });
    expect(no.ok ? 'ok' : no.error.code).toBe('noWarsDuringRevolution');
  });

  it('get the bombardment bonus against a colony once a foreign power has come in', () => {
    let s = war();
    s = { ...s, colonies: { ...s.colonies, east: { ...(s.colonies['east'] as Colony), owner: 'b' } } };
    s = king(s, 'r', 'regular', 11, 3);
    s = withUnit(s, { id: 'army', type: 'continentalArmy', profession: 'veteranSoldier', x: 10, y: 3 });
    const labels = (state: GameState): string[] => combatOdds(state, state.units['army'] as Unit, state.units['r'] as Unit).attackLines.map((l) => l.label);
    expect(labels(s)).not.toContain('Bombard');
    expect(labels(s)).toContain('Rebel Unrest');
    const helped = patch(s, { revolution: { ...me(s).revolution!, intervened: true } });
    expect(labels(helped)).toContain('Bombard');
  });
});

describe('foreign intervention arrives', () => {
  const helped = (force = { infantry: 5, cavalry: 3, artillery: 1, ships: 2 }): GameState => {
    const s = war();
    return patch(s, { revolution: { ...me(s).revolution!, intervened: true, force } });
  };
  const arrive = (s: GameState): { state: GameState; events: GameEvent[] } => {
    const events: GameEvent[] = [];
    return { state: interventionArrives(s, 'a', events), events };
  };

  it('a Man-of-War for the rebels and up to six trained units put straight into a port', () => {
    const { state, events } = arrive(helped());
    const come = of(events, 'interventionArrived')[0]!;
    const port = state.colonies[come.colonyId] as Colony;
    const ship = state.units[come.shipId] as Unit;
    expect(ship).toMatchObject({ type: 'manOWar', owner: 'a' });
    expect(Math.max(Math.abs(ship.x - port.x), Math.abs(ship.y - port.y))).toBe(1);
    const landed = come.unitIds.map((id) => state.units[id] as Unit);
    expect(landed.map((u) => u.type).sort()).toEqual(['artillery', 'continentalArmy', 'continentalArmy', 'continentalArmy', 'continentalCavalry', 'continentalCavalry']);
    for (const u of landed) expect(u).toMatchObject({ owner: 'a', x: port.x, y: port.y });
    expect(me(state).revolution?.force).toEqual({ infantry: 2, cavalry: 1, artillery: 0, ships: 1 });
    expect(checkInvariants(state)).toEqual([]);
  });

  it('one ship a turn until the ships are gone, whatever is left behind', () => {
    const first = arrive(helped()).state;
    const second = arrive(first);
    expect(of(second.events, 'interventionArrived')[0]?.unitIds).toHaveLength(3);
    expect(me(second.state).revolution?.force).toEqual({ infantry: 0, cavalry: 0, artillery: 0, ships: 0 });
    expect(arrive(second.state).events).toEqual([]);
    expect(arrive(helped({ infantry: 9, cavalry: 0, artillery: 0, ships: 0 })).events).toEqual([]);
  });

  it('nothing comes before the intervention, and it comes by itself as the rebels\' turn opens', () => {
    expect(arrive(war()).events).toEqual([]);
    const turn = applyAction(patch(helped(), { ref: { ...NONE, regulars: 10 } }), { type: 'endTurn' });
    expect(of(turn.events, 'interventionArrived')).toHaveLength(1);
  });
});

describe('soldiers for hire in wartime', () => {
  const offers = (s: GameState): { state: GameState; events: GameEvent[] }[] => {
    const out: { state: GameState; events: GameEvent[] }[] = [];
    for (let seed = 1; seed <= 60; seed++) {
      const events: GameEvent[] = [];
      const state = wartimeHire({ ...s, rng: world({ rows: ROWS, seed }).rng }, 'a', events);
      out.push({ state, events });
    }
    return out;
  };

  it('about one turn in three the larger neutral offers Continentals with horse or guns, at a price the rebels can pay', () => {
    const tried = offers(patch(war(), { gold: 100000 }));
    const made = tried.filter((t) => t.events.length > 0);
    expect(made.length).toBeGreaterThan(10);
    expect(made.length).toBeLessThan(32);
    for (const { state, events } of made) {
      const offer = me(state).pendingOffer!;
      expect(events).toEqual([{ type: 'royalOffer', player: 'a', offer }]);
      if (offer.kind !== 'continentals') throw new Error('wrong kind of offer');
      expect(offer.from).toBe(state.players.find((p) => p.id === 'd')!.nation);
      expect(offer.army).toBeGreaterThanOrEqual(2);
      expect(offer.army).toBeLessThanOrEqual(3); // 2 + (4 - 2) / 2 on the middle level
      expect(offer.cavalry + offer.artillery).toBe(1);
      const perHead = offer.price / (100 * (offer.army + 2));
      expect(perHead).toBeGreaterThanOrEqual(10); // 2 x (2 + 3)
      expect(perHead).toBeLessThanOrEqual(16);
    }
  });

  it('accepted, they are paid for and join the largest colony at once', () => {
    const { state } = offers(patch(war(), { gold: 100000 })).find((t) => t.events.length > 0)!;
    const offer = me(state).pendingOffer!;
    if (offer.kind !== 'continentals') throw new Error('wrong kind of offer');
    const hired = applyAction(state, { type: 'answerOffer', accept: true });
    expect(me(hired.state).gold).toBe(100000 - offer.price);
    const answered = of(hired.events, 'royalOfferAnswered')[0]!;
    const units = answered.unitIds.map((id) => hired.state.units[id] as Unit);
    expect(units.filter((u) => u.type === 'continentalArmy')).toHaveLength(offer.army);
    expect(units.filter((u) => u.type === 'continentalCavalry')).toHaveLength(offer.cavalry);
    expect(units.filter((u) => u.type === 'artillery')).toHaveLength(offer.artillery);
    for (const u of units) expect(colonyOwnerAt(hired.state, u)).toBe('a');
    expect(checkInvariants(hired.state)).toEqual([]);
  });

  it('no offer the treasury cannot meet, none while the friend\'s ships are still coming, none before the war', () => {
    expect(offers(patch(war(), { gold: 500 })).every((t) => t.events.length === 0)).toBe(true);
    const s = patch(war(), { gold: 100000 });
    const coming = patch(s, { revolution: { ...me(s).revolution!, intervened: true, force: { infantry: 1, cavalry: 0, artillery: 0, ships: 1 } } });
    expect(offers(coming).every((t) => t.events.length === 0)).toBe(true);
    const landed = patch(s, { revolution: { ...me(s).revolution!, intervened: true, force: { infantry: 1, cavalry: 0, artillery: 0, ships: 0 } } });
    expect(offers(landed).some((t) => t.events.length > 0)).toBe(true);
    expect(offers(patch(s, { revolution: null })).every((t) => t.events.length === 0)).toBe(true);
  });
});

function colonyOwnerAt(state: GameState, unit: Unit): string | undefined {
  return Object.values(state.colonies).find((c) => c.x === unit.x && c.y === unit.y)?.owner;
}

describe('how the war ends', () => {
  const taken = (s: GameState, id: string): GameState => ({ ...s, colonies: { ...s.colonies, [id]: { ...(s.colonies[id] as Colony), owner: 'b' } } });

  it('the King wins when the rebels have no port, no colony, or a tenth of the people', () => {
    const s = patch(war(), { ref: { regulars: 20, cavalry: 5, artillery: 5, ships: 3 } });
    expect(warOutcome(s, 'a')).toBeNull();
    expect(warOutcome(taken(taken(s, 'west'), 'east'), 'a')).toBe('crownVictory');
    // an inland colony is no port
    const inland = town(taken(taken(s, 'west'), 'east'), 'mid', 6, 3);
    expect(warOutcome(inland, 'a')).toBe('crownVictory');
    // 3 rebels in one port against 27 under the King: (27 + 1) / (27 + 1 + 3 + 1) = 87%, then 90% with 36
    const big = town(taken(s, 'east'), 'east', 11, 3, 27);
    expect(kingsShare(taken(big, 'east'), 'a')).toBe(87);
    expect(warOutcome(taken(big, 'east'), 'a')).toBeNull();
    const bigger = taken(town(s, 'east', 11, 3, 36), 'east');
    expect(kingsShare(bigger, 'a')).toBe(90);
    expect(warOutcome(bigger, 'a')).toBe('crownVictory');
  });

  it('the rebels win when the King holds no colony, has no troops ashore and next to nothing left to send', () => {
    const spent = patch(war(), { ref: { regulars: 3, cavalry: 0, artillery: 0, ships: 5 } });
    expect(warOutcome(spent, 'a')).toBe('independence');
    expect(warOutcome(patch(spent, { ref: { regulars: 2, cavalry: 4, artillery: 9, ships: 0 } }), 'a')).toBeNull(); // 2 + 1 + 1
    expect(warOutcome(taken(spent, 'east'), 'a')).toBeNull();
    expect(warOutcome(king(spent, 'r', 'regular', 6, 3), 'a')).toBeNull();
    // Tory militia and the King's ships are not his army
    expect(warOutcome(withUnit(king(spent, 'w', 'manOWar', 1, 3), { id: 't', owner: 'b', type: 'soldier', x: 6, y: 3 }), 'a')).toBe('independence');
  });

  it('having beaten him once, the rebels need only wear him down to a remnant', () => {
    let s = patch(war(), { ref: NONE });
    for (let i = 0; i < 7; i++) s = king(s, `r${i}`, 'regular', 6, 3);
    expect(warOutcome(s, 'a')).toBeNull();
    const bold = patch(s, { revolution: { ...me(s).revolution!, refBeaten: true } });
    expect(warOutcome(bold, 'a')).toBe('independence');
    expect(warOutcome(king(bold, 'r7', 'artillery', 6, 3), 'a')).toBeNull();
  });

  it('warns while there is still time', () => {
    const s = patch(war(), { ref: { regulars: 20, cavalry: 5, artillery: 5, ships: 3 } });
    expect(warWarning(s, 'a')).toEqual({ type: 'warWarning', player: 'a', danger: 'colonies', value: 2 });
    let four = s;
    for (const [id, x, y] of [['n1', 4, 2], ['n2', 8, 2], ['i1', 5, 4]] as const) four = town(four, id, x, y);
    expect(warWarning(four, 'a')).toBeNull();
    // five colonies, but only two of them on the sea
    const fewPorts = taken(taken(taken(four, 'n1'), 'n2'), 'west');
    const inlandOnly = town(town(town(fewPorts, 'i2', 7, 4), 'i3', 9, 4), 'i4', 4, 4);
    expect(warWarning({ ...inlandOnly, colonies: Object.fromEntries(Object.entries(inlandOnly.colonies).filter(([, c]) => c.owner !== 'b')) }, 'a')).toEqual({ type: 'warWarning', player: 'a', danger: 'ports', value: 1 });
    // the King holds four fifths of the people
    const share = taken(town(four, 'huge', 9, 2, 80), 'huge');
    expect(warWarning(share, 'a')).toMatchObject({ danger: 'population' });
    expect(warWarning(patch(s, { revolution: null }), 'a')).toBeNull();
  });

  it('in play: rebels with nothing to fight with lose their colonies and the war', () => {
    let s = patch(war('conquistador', false), {});
    const events: GameEvent[] = [];
    for (let i = 0; i < 30 && !s.over; i++) {
      const step = applyAction(s, { type: 'endTurn' });
      s = step.state;
      events.push(...step.events);
      expect(checkInvariants(s)).toEqual([]);
    }
    expect(s.over).toMatchObject({ reason: 'crownVictory', player: 'a' });
    expect(of(events, 'colonyCaptured')).toHaveLength(1);
    expect(of(events, 'gameEnded').at(-1)).toMatchObject({ reason: 'crownVictory' });
    expect(of(events, 'warWarning').length).toBeGreaterThan(0);
  });

  it('in play: a fortress the King cannot carry outlasts his army, and the rebels are free', () => {
    let s = town(war('discoverer', false), 'west', 2, 3, 8, 100, { buildings: ['stockade', 'fort', 'fortress'], goods: { food: 2000 } });
    for (let i = 0; i < 6; i++) s = withUnit(s, { id: `g${i}`, type: i < 3 ? 'artillery' : 'continentalArmy', profession: i < 3 ? null : 'veteranSoldier', x: 2, y: 3, orders: 'fortified' });
    s = patch(s, { ref: { regulars: 6, cavalry: 1, artillery: 1, ships: 2 } });
    const events: GameEvent[] = [];
    for (let i = 0; i < 60 && !s.over; i++) {
      const step = applyAction(s, { type: 'endTurn' });
      s = step.state;
      events.push(...step.events);
      expect(checkInvariants(s)).toEqual([]);
    }
    expect(s.over).toMatchObject({ reason: 'independence', player: 'a' });
    expect(of(events, 'refBeaten')).toHaveLength(1);
    expect(s.colonies['west']?.owner).toBe('a');
  });
});
