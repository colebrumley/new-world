import { describe, expect, it } from 'vitest';
import { applyAction, validateAction, type Action, type GameEvent } from '../../../src/engine/actions';
import { infiltrationRisk, isBesieged, type AssaultEvent } from '../../../src/engine/assault';
import { NAVAL, REPAIR_HEAD_START } from '../../../src/engine/data/naval';
import type { DIFFICULTIES } from '../../../src/engine/data/yields';
import { checkInvariants } from '../../../src/engine/invariants';
import { damageShip, repairShips, sinkShip, type ShipEvent } from '../../../src/engine/ships';
import type { Colonist, Colony, GameState, Goods, Player } from '../../../src/engine/state';
import { setTile, withColony, withUnit, world } from '../../helpers/world';

type Level = (typeof DIFFICULTIES)[number];
type Result = { state: GameState; events: readonly GameEvent[] };
const ROWS = ['~~~~~~~~~~~~', '~..........~', '~..........~', '~..........~', '~..........~', '~~~~~~~~~~~~'];
const people = (n: number, p = 'c'): Colonist[] => Array.from({ length: n }, (_, i) => ({ id: `${p}${i}`, profession: 'freeColonist' as const, job: { kind: 'idle' as const }, turns: 0 }));
interface Opts { seed?: number; difficulty?: Level; pop?: number; goods?: Goods; buildings?: string[]; fathers?: string[]; theirGold?: number; atWar?: boolean; theirFathers?: string[]; sol?: [number, number] }
/** Player b's colony at (6,2); our soldier at (5,2). Player b also has a larger colony elsewhere. */
function siege(o: Opts = {}): GameState {
  let s = world({ rows: ROWS, seed: o.seed ?? 1, difficulty: o.difficulty ?? 'viceroy', players: [{ id: 'a', fathers: o.fathers ?? [], atWar: o.atWar ?? false }, { id: 'b', kind: 'ai', fathers: o.theirFathers ?? [] }] });
  s = { ...s, players: s.players.map((p) => (p.id === 'b' ? { ...p, gold: o.theirGold ?? 0 } : p)) };
  s = withColony(s, { id: 'town', owner: 'b', x: 6, y: 2, name: 'Theirs', colonists: people(o.pop ?? 2), goods: o.goods ?? {}, buildings: o.buildings ?? [], ...(o.sol ? { sol: { n: o.sol[0], d: o.sol[1] } } : {}) });
  s = withColony(s, { id: 'other', owner: 'b', x: 9, y: 4, name: 'Other', colonists: people(6, 'o') });
  return withUnit(s, { id: 'me', type: 'soldier', x: 5, y: 2 });
}
const ATTACK: Action = { type: 'attack', unitId: 'me', dx: 1, dy: 0 };
const event = <K extends (AssaultEvent | ShipEvent)['type']>(r: Result, type: K): Extract<AssaultEvent | ShipEvent, { type: K }> | undefined =>
  r.events.find((e) => e.type === type) as Extract<AssaultEvent | ShipEvent, { type: K }> | undefined;
function fight(make: (seed: number) => GameState, attackerWins: boolean, action: Action = ATTACK): Result {
  for (let seed = 0; seed < 500; seed++) {
    const r = applyAction(make(seed), action);
    if (event(r, 'battle')?.attackerWon === attackerWins) return r;
  }
  throw new Error('no such result');
}
const code = (s: GameState, a: Action): string => {
  const v = validateAction(s, a);
  return v.ok ? 'ok' : v.error.code;
};
const player = (s: GameState, id: string): Player => s.players.find((p) => p.id === id) as Player;

describe('naval tables', () => {
  it('match the snapshot', () => {
    expect({ NAVAL, REPAIR_HEAD_START }).toMatchSnapshot();
  });
});

describe('assaulting a colony', () => {
  it('a colony with nobody under arms is defended by a drafted colonist, and falls if he loses', () => {
    const first = applyAction(siege(), ATTACK);
    // drafted colonist 8, colony +50% = 12, halved against a soldier = 6
    expect(event(first, 'battle')).toMatchObject({ defenderId: null, x: 6, y: 2, attack: 24, defense: 6 });
    expect(event(first, 'warBegan')).toEqual({ type: 'warBegan', by: 'a', on: 'b' });

    const won = fight((seed) => siege({ seed, theirGold: 800, sol: [2, 2] }), true);
    expect(won.state.colonies['town']).toMatchObject({ owner: 'a', name: 'Theirs', sol: { n: 1, d: 2 } });
    expect(won.state.colonies['town']?.colonists).toHaveLength(2);
    expect(won.state.units['me']).toMatchObject({ x: 6, y: 2, movesLeft: 0 });
    // plunder: their treasury in proportion to this colony's share of their people (2 of 8)
    expect(event(won, 'colonyCaptured')).toEqual({ type: 'colonyCaptured', colonyId: 'town', name: 'Theirs', from: 'b', to: 'a', plunder: 200, unitId: 'me' });
    expect(player(won.state, 'a').gold).toBe(200);
    expect(player(won.state, 'b').gold).toBe(600);
    expect(won.state.map.tiles[2 * 12 + 6]?.claim).toBe('a');
    expect(checkInvariants(won.state)).toEqual([]);
  });

  it('a garrison fights first, and its defeat does not lose the colony', () => {
    const guarded = (seed: number): GameState => withUnit(siege({ seed }), { id: 'guard', owner: 'b', type: 'soldier', x: 6, y: 2 });
    const won = fight(guarded, true);
    expect(event(won, 'battle')?.defenderId).toBe('guard');
    expect(won.state.units['guard']).toMatchObject({ type: 'colonist', owner: 'b' });
    expect(won.state.colonies['town']?.owner).toBe('b');
    expect(won.state.units['me']).toMatchObject({ x: 5, y: 2 });
    // the disarmed garrison is no garrison: the next assault meets a drafted colonist
    const second = applyAction(withUnit(won.state, { id: 'me2', type: 'soldier', x: 5, y: 3 }), { type: 'attack', unitId: 'me2', dx: 1, dy: -1 });
    expect(event(second, 'battle')?.defenderId).toBeNull();
  });

  it('everyone on the square is taken with the colony, and ships in port flee damaged', () => {
    const full = (seed: number): GameState => {
      let s = withUnit(siege({ seed }), { id: 'idle', owner: 'b', x: 6, y: 2, profession: 'veteranSoldier' });
      s = withUnit(s, { id: 'wagon', owner: 'b', type: 'wagonTrain', profession: null, x: 6, y: 2, cargo: { furs: 60 } });
      s = withUnit(s, { id: 'ship', owner: 'b', type: 'caravel', profession: null, x: 6, y: 2, cargo: { ore: 100 } });
      return withUnit(s, { id: 'rider', owner: 'b', x: 6, y: 2, aboard: 'ship' });
    };
    const won = fight(full, true);
    expect(won.state.units['idle']).toMatchObject({ owner: 'a', profession: 'freeColonist' });
    expect(won.state.units['wagon']).toMatchObject({ owner: 'a', cargo: { furs: 60 } });
    // no drydock anywhere: the ship makes for Europe, its cargo and passenger lost
    expect(won.state.units['ship']).toMatchObject({ owner: 'b', cargo: {}, repair: 2, voyage: { phase: 'inEurope' } });
    expect(won.state.units['rider']).toBeUndefined();
    expect(event(won, 'shipDamaged')).toMatchObject({ unitId: 'ship', to: 'europe', turns: 2, lost: { ore: 100 } });
    expect(checkInvariants(won.state)).toEqual([]);
  });

  it('fortifications make the drafted colonist far harder to beat', () => {
    const defense = (buildings: string[]): number => event(applyAction(siege({ buildings }), ATTACK), 'battle')!.defense;
    expect([defense([]), defense(['stockade']), defense(['stockade', 'fort']), defense(['stockade', 'fort', 'fortress'])]).toEqual([6, 8, 10, 12]);
  });

  it('with Revere the drafted colonist takes 50 muskets from the stores and fights as a soldier', () => {
    const r = applyAction(siege({ theirFathers: ['paulRevere'], goods: { muskets: 70 } }), ATTACK);
    expect(event(r, 'battle')?.defense).toBe(24);
    expect(event(r, 'musketsIssued')).toEqual({ type: 'musketsIssued', colonyId: 'town', amount: 50 });
    expect(r.state.colonies['town']?.goods.muskets).toBe(20);
    expect(event(applyAction(siege({ theirFathers: ['paulRevere'], goods: { muskets: 40 } }), ATTACK), 'battle')?.defense).toBe(6);
  });

  it('nothing is plundered once independence has been declared, and a rebel power may only attack the Crown\'s colonies', () => {
    expect(code(siege({ atWar: true }), ATTACK)).toBe('noWarsDuringRevolution');
    const crown = (seed: number): GameState => ({ ...siege({ seed, atWar: true, theirGold: 800 }), crownPlayer: 'b' });
    expect(code(crown(1), ATTACK)).toBe('ok');
    const won = fight(crown, true);
    expect(event(won, 'colonyCaptured')?.plunder).toBe(0);
  });

  it('a losing attacker is stripped like any other', () => {
    const lost = fight((seed) => withUnit(siege({ seed, buildings: ['stockade', 'fort', 'fortress'] }), { id: 'guard', owner: 'b', type: 'artillery', profession: null, x: 6, y: 2 }), false);
    expect(lost.state.units['me']?.type).toBe('colonist');
    expect(lost.state.colonies['town']?.owner).toBe('b');
  });

  it('needs an armed land unit beside the colony', () => {
    expect(code(siege(), ATTACK)).toBe('ok');
    expect(code(withUnit(siege(), { id: 'me', x: 5, y: 2 }), ATTACK)).toBe('cannotAttack');
    expect(code(withUnit(siege(), { id: 'me', type: 'soldier', x: 5, y: 2, movesLeft: 0 }), ATTACK)).toBe('noMovesLeft');
  });
});

describe('siege', () => {
  const home = (): GameState => withColony(world({ rows: ROWS, players: [{ id: 'a' }, { id: 'b', kind: 'ai' }] }), { id: 'col', x: 3, y: 2, name: 'Home', colonists: people(3), goods: { muskets: 60 } });
  const enemy = (s: GameState, id: string, x: number, y: number, type: 'soldier' | 'scout' | 'colonist' = 'soldier'): GameState => withUnit(s, { id, owner: 'b', type, x, y });
  const col = (s: GameState): Colony => s.colonies['col'] as Colony;

  it('a colony is besieged when foreign fighting units around it outnumber its own', () => {
    expect(isBesieged(home(), col(home()))).toBe(false);
    const one = enemy(home(), 'e1', 4, 2);
    expect(isBesieged(one, col(one))).toBe(true);
    const matched = withUnit(one, { id: 'g', type: 'soldier', x: 3, y: 2 });
    expect(isBesieged(matched, col(matched))).toBe(false);
    const far = enemy(home(), 'e1', 5, 2);
    expect(isBesieged(far, col(far))).toBe(false);
    // scouts and unarmed colonists do not besiege anyone
    expect(isBesieged(enemy(home(), 'e1', 4, 2, 'scout'), col(home()))).toBe(false);
    expect(isBesieged(enemy(home(), 'e1', 4, 2, 'colonist'), col(home()))).toBe(false);
    // nor do the troops of a power we are at peace with
    const friends = { ...one, players: one.players.map((p) => (p.id === 'a' ? { ...p, stance: { b: 'peace' as const } } : p)) };
    expect(isBesieged(friends, col(friends))).toBe(false);
  });

  it('under siege a colonist leaves only as a soldier, armed from the stores', () => {
    const s = enemy(home(), 'e1', 4, 2);
    const r = applyAction(s, { type: 'leaveColony', colonyId: 'col', colonistId: 'c0' });
    expect(r.state.units['c0']).toMatchObject({ type: 'soldier', x: 3, y: 2 });
    expect(r.state.colonies['col']?.goods.muskets).toBe(10);
    // with the stores empty nobody may leave
    expect(code(r.state, { type: 'leaveColony', colonyId: 'col', colonistId: 'c1' })).toBe('ok'); // the new soldier evens the numbers
    const still = enemy(r.state, 'e2', 4, 3);
    expect(code(still, { type: 'leaveColony', colonyId: 'col', colonistId: 'c1' })).toBe('underSiege');
    // in peace he walks out as he is
    expect(applyAction(home(), { type: 'leaveColony', colonyId: 'col', colonistId: 'c0' }).state.units['c0']?.type).toBe('colonist');
  });
});

describe('a scout at a foreign colony', () => {
  const scouting = (o: Opts = {}, profession: 'freeColonist' | 'seasonedScout' = 'freeColonist'): GameState => withUnit(siege(o), { id: 'me', type: 'scout', profession, x: 5, y: 2 });
  const SNEAK: Action = { type: 'infiltrateColony', unitId: 'me', dx: 1, dy: 0 };

  it('is caught by chance: likelier at a fortified colony and on harder levels, less for a seasoned scout', () => {
    const risk = (o: Opts, profession: 'freeColonist' | 'seasonedScout' = 'freeColonist'): number => {
      const s = scouting(o, profession);
      return infiltrationRisk(s, s.units['me']!, s.colonies['town'] as Colony);
    };
    expect(risk({ difficulty: 'conquistador' })).toBe(12);
    expect(risk({ difficulty: 'conquistador', buildings: ['stockade', 'fort', 'fortress'] })).toBe(18);
    expect(risk({ difficulty: 'conquistador' }, 'seasonedScout')).toBe(6);
    expect(risk({ difficulty: 'viceroy' })).toBe(14);
    expect(risk({ difficulty: 'discoverer' })).toBe(10);
  });

  it('caught, the scout is lost and the colony keeps 100 horses; otherwise he has seen it', () => {
    let caught = 0;
    for (let seed = 0; seed < 720; seed++) {
      const r = applyAction(scouting({ seed, difficulty: 'conquistador' }), SNEAK);
      const e = event(r, 'colonyInfiltrated')!;
      expect(e).toMatchObject({ colonyId: 'town', unitId: 'me', player: 'a' });
      if (e.caught) {
        caught++;
        expect(r.state.units['me']).toBeUndefined();
        expect(r.state.colonies['town']?.goods.horses).toBe(100);
      } else {
        expect(r.state.units['me']).toMatchObject({ movesLeft: 0, x: 5, y: 2 });
        expect(r.state.colonies['town']?.goods.horses ?? 0).toBe(0);
      }
    }
    expect(caught / 720).toBeCloseTo(12 / 36, 1);
    expect(code(siege(), SNEAK)).toBe('notAScout');
    expect(code(scouting(), { ...SNEAK, dx: -1 })).toBe('noTarget');
  });
});

describe('damaged ships', () => {
  const afloat = (drydock: boolean, atWar = false): GameState => {
    let s = world({ rows: ROWS, players: [{ id: 'a', atWar }, { id: 'b' }] });
    s = withColony(s, { id: 'col', x: 2, y: 1, name: 'Home', buildings: drydock ? ['docks', 'drydock'] : ['docks'] });
    s = setTile(s, 8, 1, { base: 'ocean' });
    s = withUnit(s, { id: 'ship', type: 'frigate', profession: null, x: 8, y: 1, cargo: { furs: 100 } });
    return withUnit(s, { id: 'rider', type: 'soldier', x: 8, y: 1, aboard: 'ship' });
  };
  const hit = (s: GameState): { state: GameState; events: ShipEvent[] } => {
    const events: ShipEvent[] = [];
    return { state: damageShip(s, 'ship', events), events };
  };

  it('lose all aboard and go to the nearest drydock, or to Europe, for a time set by their size', () => {
    const home = hit(afloat(true));
    expect(home.state.units['ship']).toMatchObject({ x: 2, y: 1, cargo: {}, repair: 6, voyage: null, movesLeft: 0 });
    expect(home.state.units['rider']).toBeUndefined();
    expect(home.events).toEqual([{ type: 'shipDamaged', unitId: 'ship', owner: 'a', to: 'col', turns: 6, lost: { furs: 100, muskets: 50 } }]);
    const away = hit(afloat(false));
    expect(away.state.units['ship']).toMatchObject({ repair: 12, voyage: { phase: 'inEurope', turnsLeft: 0 } });
    expect(checkInvariants(away.state)).toEqual([]);
  });

  it('with no drydock and Europe closed, they sink', () => {
    const r = hit(afloat(false, true));
    expect(r.state.units['ship']).toBeUndefined();
    expect(r.events[0]).toMatchObject({ type: 'shipSunk', lost: { furs: 100, muskets: 50 } });
    expect(hit(afloat(true, true)).state.units['ship']?.repair).toBe(6);
    const sunk: ShipEvent[] = [];
    expect(sinkShip(afloat(true), 'ship', sunk).units['rider']).toBeUndefined();
  });

  it('cannot move or sail until repaired, a turn at a time', () => {
    let s = hit(afloat(true)).state;
    expect(code(s, { type: 'moveUnit', unitId: 'ship', dx: 0, dy: -1 })).toBe('underRepair');
    const events: ShipEvent[] = [];
    for (let i = 0; i < 5; i++) s = repairShips(s, 'a', events);
    expect(s.units['ship']?.repair).toBe(1);
    expect(events).toEqual([]);
    s = repairShips(s, 'a', events);
    expect(events).toEqual([{ type: 'shipRepaired', unitId: 'ship', owner: 'a' }]);
    expect(s.units['ship']?.repair).toBe(0);
    // the turn does it by itself
    let live = hit(afloat(false)).state;
    expect(code(live, { type: 'sailFromEurope', unitId: 'ship' })).toBe('underRepair');
    for (let i = 0; i < 24; i++) live = applyAction(live, { type: 'endTurn' }).state;
    expect(live.units['ship']?.repair).toBe(0);
    expect(code(live, { type: 'sailFromEurope', unitId: 'ship' })).toBe('ok');
  });
});
