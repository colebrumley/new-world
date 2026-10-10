import { describe, expect, it } from 'vitest';
import { applyAction, validateAction, type Action, type GameEvent } from '../../../src/engine/actions';
import { checkInvariants } from '../../../src/engine/invariants';
import { evasionWeight, fortFire, isSunk, navalOdds, patrolAndForts, shipStrength, type NavalEvent } from '../../../src/engine/naval';
import { createRng } from '../../../src/engine/rng';
import type { Colony, GameState, Goods, Player, Unit } from '../../../src/engine/state';
import { withColony, withUnit, world } from '../../helpers/world';

type Result = { state: GameState; events: readonly GameEvent[] };
const ROWS = ['~~~~~~~~~~~~', '~~~~~~~~~~~~', '~~~~~~~~~~~~', '~~~~~~....~~', '~~~~~~....~~', '~~~~~~~~~~~~'];
interface Opts { seed?: number; fathers?: string[]; theirFathers?: string[]; atWar?: boolean; peace?: boolean; turn?: number }
function sea(o: Opts = {}): GameState {
  const s = world({ rows: ROWS, seed: o.seed ?? 1, difficulty: 'viceroy', players: [{ id: 'a', fathers: o.fathers ?? [], atWar: o.atWar ?? false }, { id: 'b', kind: 'ai', fathers: o.theirFathers ?? [] }] });
  const stance = o.peace ? { stance: { b: 'peace' as const } } : {};
  const theirs = o.peace ? { stance: { a: 'peace' as const } } : {};
  return { ...s, turn: o.turn ?? 10, players: s.players.map((p) => (p.id === 'a' ? { ...p, ...stance } : { ...p, ...theirs })) };
}
type Spec = Partial<Parameters<typeof withUnit>[1]>;
const ship = (s: GameState, id: string, type: Unit['type'], owner: string, x: number, y: number, extra: Spec = {}): GameState => withUnit(s, { id, type, owner, profession: null, x, y, ...extra });
/** Our warship at (2,2) and their ship at (3,2). */
const meeting = (mine: Unit['type'], theirs: Unit['type'], o: Opts = {}, cargo: Goods = {}, myCargo: Goods = {}): GameState =>
  ship(ship(sea(o), 'me', mine, 'a', 2, 2, { cargo: myCargo }), 'foe', theirs, 'b', 3, 2, { cargo });
const FIRE: Action = { type: 'attack', unitId: 'me', dx: 1, dy: 0 };
const event = <K extends NavalEvent['type']>(r: { events: readonly (GameEvent | NavalEvent)[] }, type: K): Extract<NavalEvent, { type: K }> | undefined =>
  r.events.find((e) => e.type === type) as Extract<NavalEvent, { type: K }> | undefined;
const code = (s: GameState, a: Action): string => {
  const v = validateAction(s, a);
  return v.ok ? 'ok' : v.error.code;
};
function until(make: (seed: number) => GameState, want: (r: Result) => boolean, action: Action = FIRE): Result {
  for (let seed = 0; seed < 800; seed++) {
    const r = applyAction(make(seed), action);
    if (want(r)) return r;
  }
  throw new Error('no such result');
}
const player = (s: GameState, id: string): Player => s.players.find((p) => p.id === id) as Player;

describe('ships\' strength', () => {
  it('is the table value in eighths, less an eighth for every hold in use', () => {
    const s = ship(ship(sea(), 'f', 'frigate', 'a', 2, 2), 'g', 'galleon', 'a', 4, 2, { cargo: { furs: 250 } });
    expect(shipStrength(s, s.units['f']!, 'attack')).toBe(128);
    expect(shipStrength(s, s.units['f']!, 'defense')).toBe(128);
    expect(shipStrength(s, s.units['g']!, 'defense')).toBe(80 - 3);
    expect(shipStrength(s, s.units['g']!, 'attack')).toBe(0);
    const carrying = withUnit(s, { id: 'rider', x: 2, y: 2, aboard: 'f' });
    expect(shipStrength(carrying, carrying.units['f']!, 'attack')).toBe(127);
  });

  it('a privateer under Drake has half again, attacking and defending', () => {
    const plain = ship(sea(), 'p', 'privateer', 'a', 2, 2);
    const drake = ship(sea({ fathers: ['francisDrake'] }), 'p', 'privateer', 'a', 2, 2);
    expect([shipStrength(plain, plain.units['p']!, 'attack'), shipStrength(drake, drake.units['p']!, 'attack'), shipStrength(drake, drake.units['p']!, 'defense')]).toEqual([64, 96, 96]);
    const frigate = ship(sea({ fathers: ['francisDrake'] }), 'f', 'frigate', 'a', 2, 2);
    expect(shipStrength(frigate, frigate.units['f']!, 'attack')).toBe(128);
  });

  it('the attacker has half again, and fights tired with less than a move left', () => {
    const s = meeting('frigate', 'privateer');
    expect(navalOdds(s, s.units['me']!, s.units['foe']!)).toEqual({ attack: 192, defense: 64 });
    const tired: GameState = { ...s, units: { ...s.units, me: { ...s.units['me']!, movesLeft: 1 } } };
    expect(navalOdds(tired, tired.units['me']!, tired.units['foe']!).attack).toBe(64);
  });

  it('nimbleness: movement plus three, doubled for a privateer, a little more for a galleon, much less when laden', () => {
    const w = (type: Unit['type'], cargo: Goods = {}, fathers: string[] = []): number => {
      const s = ship(sea({ fathers }), 'x', type, 'a', 2, 2, { cargo });
      return evasionWeight(s, s.units['x']!);
    };
    expect(w('caravel')).toBe(15);
    expect(w('merchantman')).toBe(18);
    expect(w('galleon')).toBe(24);
    expect(w('privateer')).toBe(54);
    expect(w('frigate')).toBe(21);
    expect(w('merchantman', { furs: 300 })).toBe(6);
    expect(w('caravel', { furs: 200, ore: 200 })).toBe(1);
    expect(w('caravel', {}, ['ferdinandMagellan'])).toBe(18);
  });
});

describe('attacking at sea', () => {
  it('only privateers, frigates and men-of-war attack, and only ships at sea', () => {
    expect(code(meeting('frigate', 'caravel'), FIRE)).toBe('ok');
    expect(code(meeting('privateer', 'caravel'), FIRE)).toBe('ok');
    expect(code(meeting('manOWar', 'caravel'), FIRE)).toBe('ok');
    expect(code(meeting('galleon', 'caravel'), FIRE)).toBe('cannotAttack');
    expect(code(meeting('frigate', 'caravel'), { ...FIRE, dx: -1 })).toBe('noTarget');
    const own = ship(ship(sea(), 'me', 'frigate', 'a', 2, 2), 'foe', 'caravel', 'a', 3, 2);
    expect(code(own, FIRE)).toBe('noTarget');
    const docked = withColony(ship(sea(), 'me', 'frigate', 'a', 5, 3), { id: 'col', owner: 'b', x: 6, y: 3, name: 'C' });
    expect(code(ship(docked, 'foe', 'caravel', 'b', 6, 3), FIRE)).not.toBe('ok');
  });

  it('a weaker ship may run: nimble and empty it often does, laden it rarely does', () => {
    const fled = (cargo: Goods): number => {
      let n = 0;
      for (let seed = 0; seed < 800; seed++) if (event(applyAction(meeting('frigate', 'caravel', { seed }, cargo), FIRE), 'shipEvaded')) n++;
      return n / 800;
    };
    expect(fled({})).toBeCloseTo(15 / 36, 1);
    expect(fled({ furs: 200 })).toBeCloseTo(7 / 28, 1);
    // an equal or stronger ship stands and fights
    for (let seed = 0; seed < 60; seed++) expect(event(applyAction(meeting('frigate', 'frigate', { seed }), FIRE), 'shipEvaded')).toBeUndefined();
    const ran = until((seed) => meeting('frigate', 'caravel', { seed }), (r) => !!event(r, 'shipEvaded'));
    expect(ran.state.units['foe']).toMatchObject({ x: 3, y: 2, repair: 0 });
    expect(ran.state.units['me']?.movesLeft).toBe(15);
  });

  it('a frigate\'s attack is an act of war; a privateer\'s is nobody\'s', () => {
    expect(applyAction(meeting('frigate', 'merchantman'), FIRE).events.some((e) => e.type === 'warBegan')).toBe(true);
    const r = applyAction(meeting('privateer', 'merchantman'), FIRE);
    expect(r.events.some((e) => e.type === 'warBegan')).toBe(false);
    expect(player(r.state, 'a').stance['b']).toBeUndefined();
  });

  it('the beaten ship is crippled or sunk; its cargo goes to the victor while there is room, the best first', () => {
    const prize = until((seed) => meeting('frigate', 'galleon', { seed }, { furs: 100, silver: 100, ore: 100, lumber: 100, food: 100 }), (r) => event(r, 'battle')?.attackerWon === true);
    const taken = prize.events.filter((e) => e.type === 'cargoCaptured');
    expect(taken).toHaveLength(4); // a frigate has four holds
    expect(prize.state.units['me']?.cargo).toMatchObject({ silver: 100 });
    expect(Object.values(prize.state.units['me']!.cargo).reduce((a, b) => a + (b ?? 0), 0)).toBe(400);
    const foe = prize.state.units['foe'];
    if (foe) expect(foe).toMatchObject({ cargo: {}, repair: 10, voyage: { phase: 'inEurope' } });
    else expect(event(prize, 'shipSunk')).toMatchObject({ unitId: 'foe' });
    expect(checkInvariants(prize.state)).toEqual([]);
  });

  it('with the loser gone the victor sails onto its square', () => {
    const r = until((seed) => meeting('frigate', 'merchantman', { seed }), (x) => event(x, 'battle')?.attackerWon === true);
    expect(r.state.units['me']).toMatchObject({ x: 3, y: 2 });
  });

  it('an attacker that loses is the one crippled or sunk', () => {
    const r = until((seed) => meeting('privateer', 'manOWar', { seed }), (x) => event(x, 'battle')?.attackerWon === false);
    const me = r.state.units['me'];
    if (me) expect(me.repair).toBeGreaterThan(0);
    else expect(event(r, 'shipSunk')?.unitId).toBe('me');
    expect(r.state.units['foe']).toMatchObject({ x: 3, y: 2, repair: 0 });
  });

  it('soldiers aboard a beaten ship are lost with it', () => {
    const r = until((seed) => withUnit(meeting('frigate', 'galleon', { seed }), { id: 'troops', owner: 'b', type: 'soldier', x: 3, y: 2, aboard: 'foe' }), (x) => event(x, 'battle')?.attackerWon === true);
    expect(r.state.units['troops']).toBeUndefined();
    const lost = event(r, 'shipSunk') ?? event(r, 'shipDamaged');
    expect(lost?.lost).toMatchObject({ muskets: 50 });
  });
});

describe('sunk or crippled', () => {
  const fate = (s: GameState, loserId: string, guns: number, victorId: string | null, n = 2000): number => {
    const rng = createRng(6);
    let sunk = 0;
    for (let i = 0; i < n; i++) if (isSunk(s, s.units[loserId]!, guns, victorId ? s.units[victorId]! : null, rng)) sunk++;
    return sunk / n;
  };
  /** Give player b enough other ships and colonies that the fleet rules do not interfere. */
  const fleet = (s: GameState): GameState => {
    let next = s;
    for (let i = 0; i < 3; i++) next = ship(next, `spare${i}`, 'merchantman', 'b', 1 + i, 4);
    return next;
  };

  it('goes by the victor\'s guns against the loser\'s hull', () => {
    const s = fleet(meeting('frigate', 'merchantman'));
    // frigate guns 12 against a merchantman's hull 8
    expect(fate(s, 'foe', 12, 'me')).toBeCloseTo(12 / 20, 1);
    expect(fate(s, 'foe', 4, 'me')).toBeCloseTo(4 / 12, 1);
    expect(fate(s, 'foe', 0, 'me')).toBe(0);
  });

  it('a power is never left without transport, and old caravels are not worth saving', () => {
    const lone = meeting('frigate', 'merchantman');
    expect(fate(lone, 'foe', 12, 'me')).toBe(0); // their only ship
    const late = fleet(meeting('frigate', 'caravel', { turn: 100 }));
    expect(fate(late, 'foe', 1, 'me')).toBe(1);
    const early = fleet(meeting('frigate', 'caravel', { turn: 10 }));
    expect(fate(early, 'foe', 1, 'me')).toBeLessThan(0.5);
  });

  it('a power\'s only warship of a kind is spared if it has a colony; surplus warships go down', () => {
    const only = withColony(meeting('manOWar', 'frigate'), { id: 'col', owner: 'b', x: 6, y: 3, name: 'C' });
    expect(fate(only, 'foe', 32, 'me')).toBe(0);
    const surplus = ship(only, 'second', 'frigate', 'b', 1, 4);
    expect(fate(surplus, 'foe', 32, 'me')).toBe(1); // two frigates, one colony
  });
});

describe('zone of patrol and forts', () => {
  const pass = (s: GameState): { state: GameState; events: NavalEvent[] } => {
    const events: NavalEvent[] = [];
    return { state: patrolAndForts(s, 'me', events), events };
  };

  it('a hostile warship alongside may cost a passing ship movement: more for bigger warships', () => {
    const seen: Record<number, number> = {};
    for (let seed = 0; seed < 600; seed++) {
      const r = pass(ship(ship(sea({ seed }), 'me', 'merchantman', 'a', 2, 2), 'foe', 'frigate', 'b', 3, 2));
      const e = event(r, 'shipSlowed')!;
      seen[e.cost] = (seen[e.cost] ?? 0) + 1;
      expect(r.state.units['me']?.movesLeft).toBe(15 - e.cost);
    }
    // weights 18 against 21 + 2: slips past 17 times in 41, half cost once, full cost otherwise
    expect(seen[0]! / 600).toBeCloseTo(17 / 41, 1);
    expect(seen[6]! / 600).toBeCloseTo(23 / 41, 1);
    const big = pass(ship(ship(sea(), 'me', 'merchantman', 'a', 2, 2, { cargo: { furs: 400 } }), 'foe', 'manOWar', 'b', 3, 2));
    expect([0, 4, 8]).toContain(event(big, 'shipSlowed')?.cost);
  });

  it('unarmed ships, friends at peace and one\'s own exert no zone; privateers trouble and are troubled by everyone', () => {
    const quiet = (s: GameState): boolean => pass(s).events.length === 0;
    expect(quiet(ship(ship(sea(), 'me', 'merchantman', 'a', 2, 2), 'foe', 'galleon', 'b', 3, 2))).toBe(true);
    expect(quiet(ship(ship(sea({ peace: true }), 'me', 'merchantman', 'a', 2, 2), 'foe', 'frigate', 'b', 3, 2))).toBe(true);
    expect(quiet(ship(ship(sea(), 'me', 'merchantman', 'a', 2, 2), 'foe', 'frigate', 'a', 3, 2))).toBe(true);
    expect(quiet(ship(ship(sea({ peace: true }), 'me', 'merchantman', 'a', 2, 2), 'foe', 'privateer', 'b', 3, 2))).toBe(false);
    expect(quiet(ship(ship(sea({ peace: true }), 'me', 'privateer', 'a', 2, 2), 'foe', 'frigate', 'b', 3, 2))).toBe(false);
    expect(quiet(ship(ship(sea(), 'me', 'merchantman', 'a', 2, 2), 'foe', 'frigate', 'b', 5, 2))).toBe(true);
  });

  it('it applies as a ship moves', () => {
    const s = ship(ship(sea(), 'me', 'merchantman', 'a', 1, 2), 'foe', 'frigate', 'b', 3, 2);
    const r = applyAction(s, { type: 'moveUnit', unitId: 'me', dx: 1, dy: 0 });
    expect(event(r, 'shipSlowed')).toMatchObject({ unitId: 'me', by: 'foe' });
  });

  // A channel one square wide at x = 5 between two shores: every way up it passes every square.
  const CHANNEL = ['~~~~~~~~~~~~', '~~~~~~~~~~~~', '~....~....~~', '~....~....~~', '~....~....~~', '~~~~~~~~~~~~'];
  const channel = (o: Opts = {}): GameState => ({ ...sea(o), map: world({ rows: CHANNEL, seed: 1 }).map });

  it('it applies to every step a ship sails under Go To orders, not only the first', () => {
    // a frigate off (6,1) reaches the channel's second square (5,2) but not its first (5,3)
    const s = ship(ship(channel(), 'me', 'merchantman', 'a', 5, 4), 'foe', 'frigate', 'b', 6, 1);
    const r = applyAction(s, { type: 'goTo', unitId: 'me', x: 5, y: 2 });
    const slowed = r.events.filter((e) => e.type === 'shipSlowed');
    expect(slowed).toHaveLength(1);
    expect(slowed[0]).toMatchObject({ unitId: 'me', by: 'foe' });
    expect(r.state.units['me']).toMatchObject({ x: 5, y: 2, movesLeft: 15 - 3 - 3 - (slowed[0] as { cost: number }).cost, orders: 'none' });
  });

  it('a fortress on the way stops a ship under Go To orders, which stand for next turn', () => {
    const held = ship(withColony(channel(), { id: 'col', owner: 'b', x: 6, y: 3, name: 'C', buildings: ['stockade', 'fort', 'fortress'] }), 'me', 'merchantman', 'a', 5, 4);
    const stopped = applyAction(held, { type: 'goTo', unitId: 'me', x: 5, y: 1 });
    expect(stopped.state.units['me']).toMatchObject({ x: 5, y: 3, movesLeft: 0, orders: 'goto', destination: [5, 1] });
    expect(event(stopped, 'shipSlowed')).toMatchObject({ unitId: 'me', by: 'col', cost: 15 - 3 });
  });

  it('it applies to a ship following a trade route', () => {
    // a caravel (12 thirds) at the channel's head bound down it for a port at (6,4): (5,2) under a
    // frigate's guns, (5,3), then docking. Held up for a full 6 it falls short with its orders standing.
    const make = (seed: number): GameState => {
      let s = withColony(channel({ seed }), { id: 'port', owner: 'a', x: 6, y: 4, name: 'Port', colonists: [{ id: 'p1', profession: 'freeColonist', job: { kind: 'idle' }, turns: 0 }] });
      s = ship(ship(s, 'me', 'caravel', 'a', 5, 1), 'foe', 'frigate', 'b', 6, 1);
      return applyAction(s, { type: 'createTradeRoute', kind: 'sea', stops: [{ colonyId: 'port', unload: [], load: [] }] }).state;
    };
    const sail: Action = { type: 'assignTradeRoute', unitId: 'me', routeId: 'r1' };
    expect(Object.keys(make(1).tradeRoutes)).toEqual(['r1']);
    const held = until(make, (r) => event(r, 'shipSlowed')?.cost === 6, sail);
    expect(held.state.units['me']).toMatchObject({ x: 5, y: 3, movesLeft: 0, orders: 'trade' });
    const slipped = until(make, (r) => event(r, 'shipSlowed')?.cost === 0, sail);
    expect(slipped.state.units['me']).toMatchObject({ x: 6, y: 4, movesLeft: 0, orders: 'trade' });
  });

  it('forts fire on hostile ships lying off them, harder with artillery inside', () => {
    const fort = (buildings: string[], guns = 0, o: Opts = {}): GameState => {
      let s = withColony(sea(o), { id: 'col', owner: 'a', x: 6, y: 3, name: 'Fort', buildings });
      for (let i = 0; i < guns; i++) s = withUnit(s, { id: `gun${i}`, type: 'artillery', profession: null, x: 6, y: 3 });
      return ship(ship(s, 'foe', 'merchantman', 'b', 5, 3), 'spare', 'merchantman', 'b', 1, 1);
    };
    const hits = (s: GameState): number => {
      let n = 0;
      for (let seed = 0; seed < 500; seed++) {
        const events: NavalEvent[] = [];
        fortFire({ ...s, rng: sea({ seed }).rng }, s.colonies['col'] as Colony, events);
        if (event({ events }, 'fortFired')?.hit) n++;
      }
      return n / 500;
    };
    expect(hits(fort(['stockade']))).toBe(0);
    // fort: 4 points, with the attacker's edge 48 eighths against a merchantman's 48
    expect(hits(fort(['stockade', 'fort']))).toBeCloseTo(0.5, 1);
    expect(hits(fort(['stockade', 'fort', 'fortress']))).toBeCloseTo(96 / 144, 1);
    expect(hits(fort(['stockade', 'fort'], 2))).toBeCloseTo(144 / 192, 1);
    expect(hits(fort(['stockade', 'fort', 'fortress'], 0, { peace: true }))).toBe(0);
    // it happens in the colony's turn, and a hit cripples or sinks
    let s = fort(['stockade', 'fort', 'fortress'], 3);
    let fired = false;
    for (let i = 0; i < 6 && !fired; i++) {
      const r = applyAction(s, { type: 'endTurn' });
      s = r.state;
      fired = r.events.some((e) => e.type === 'fortFired' && e.hit);
      if (fired) expect(r.events.some((e) => (e.type === 'shipDamaged' || e.type === 'shipSunk') && e.unitId === 'foe')).toBe(true);
    }
    expect(fired).toBe(true);
    expect(checkInvariants(s)).toEqual([]);
  });
});
