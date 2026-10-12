import { describe, expect, it } from 'vitest';
import { applyAction, validateAction, type Action, type GameEvent } from '../../../../src/engine/actions';
import { checkCheat, CHEAT_SPECS, type CheatArgValue, type CheatCommand } from '../../../../src/engine/cheats';
import { COLONIES_SPECS } from '../../../../src/engine/cheats/colonies';
import { BUILDINGS } from '../../../../src/engine/data/buildings';
import { GOOD_IDS } from '../../../../src/engine/data/goods';
import { checkInvariants } from '../../../../src/engine/invariants';
import { solPercent } from '../../../../src/engine/liberty';
import type { Colony, GameState } from '../../../../src/engine/state';
import { deepFreeze } from '../../../helpers/freeze';
import { withColony, world } from '../../../helpers/world';

const base = (colony: Partial<Colony> = {}, fathers: readonly string[] = []): GameState => {
  const bare = world({ rows: ['~....', '.....', '.....'], players: [{ id: 'a', fathers }, { id: 'b', kind: 'ai' }] });
  const mine = withColony(bare, { id: 'c1', name: 'Jamestown', x: 1, y: 1, ...colony });
  return deepFreeze(withColony(mine, { id: 'c2', name: 'Quebec', owner: 'b', x: 3, y: 1 }));
};
const town = (state: GameState, id = 'c1'): Colony => state.colonies[id] as Colony;
const cheat = (command: CheatCommand, player?: string): Action => (player === undefined ? { type: 'cheat', command } : { type: 'cheat', player, command });
const run = (state: GameState, command: CheatCommand, player?: string): { state: GameState; events: readonly GameEvent[] } => applyAction(state, cheat(command, player));
const summary = (events: readonly GameEvent[]): string => {
  expect(events.map((e) => e.type)).toEqual(['cheatApplied']);
  return (events[0] as { summary: string }).summary;
};
const refusal = (state: GameState, command: CheatCommand, player?: string): { code: string; message: string } => {
  const check = validateAction(state, cheat(command, player));
  if (check.ok) throw new Error('expected a refusal');
  return check.error;
};
const add = (value: number) => ({ set: false, value });
const set = (value: number) => ({ set: true, value });

describe('goods', () => {
  it('adds to a good in the warehouse, takes from it and sets it', () => {
    const added = run(base(), { cheat: 'goods', colonyId: 'c1', good: 'muskets', amount: add(300) });
    expect(town(added.state).goods).toEqual({ muskets: 300 });
    expect(summary(added.events)).toBe('Added 300 muskets to the warehouse of Jamestown.');
    const taken = run(added.state, { cheat: 'goods', colonyId: 'c1', good: 'muskets', amount: add(-120) });
    expect(town(taken.state).goods).toEqual({ muskets: 180 });
    expect(summary(taken.events)).toBe('Took 120 muskets from the warehouse of Jamestown.');
    const fixed = run(taken.state, { cheat: 'goods', colonyId: 'c1', good: 'tradeGoods', amount: set(40) });
    expect(town(fixed.state).goods).toEqual({ muskets: 180, tradeGoods: 40 });
    expect(summary(fixed.events)).toBe('Set trade goods in the warehouse of Jamestown to 40.');
  });

  it('keeps no good at nothing, and may fill the warehouse past its room', () => {
    const emptied = run(base({ goods: { ore: 50 } }), { cheat: 'goods', colonyId: 'c1', good: 'ore', amount: add(-50) });
    expect(town(emptied.state).goods).toEqual({});
    const over = run(emptied.state, { cheat: 'goods', colonyId: 'c1', good: 'ore', amount: add(5000) });
    expect(town(over.state).goods).toEqual({ ore: 5000 });
    expect(checkInvariants(over.state)).toEqual([]);
  });

  it('with "all" touches every one of the sixteen goods', () => {
    expect(GOOD_IDS).toHaveLength(16);
    const state = base({ goods: { food: 20, tools: 7 } });
    const added = run(state, { cheat: 'goods', colonyId: 'c1', good: 'all', amount: add(100) });
    expect(town(added.state).goods).toEqual({ ...Object.fromEntries(GOOD_IDS.map((g) => [g, 100])), food: 120, tools: 107 });
    expect(summary(added.events)).toBe('Added 100 of every good to the warehouse of Jamestown.');
    const fixed = run(added.state, { cheat: 'goods', colonyId: 'c1', good: 'all', amount: set(30) });
    expect(town(fixed.state).goods).toEqual(Object.fromEntries(GOOD_IDS.map((g) => [g, 30])));
    expect(summary(fixed.events)).toBe('Set every good in the warehouse of Jamestown to 30.');
    expect(town(run(fixed.state, { cheat: 'goods', colonyId: 'c1', good: 'all', amount: add(-30) }).state).goods).toEqual({});
  });

  it('is refused whole, not clamped, when any good would go below nothing', () => {
    const state = base({ goods: { food: 20, tools: 7 } });
    expect(refusal(state, { cheat: 'goods', colonyId: 'c1', good: 'tools', amount: add(-8) })).toEqual({ code: 'cheatBelowZero', message: 'Jamestown holds only 7 tools' });
    expect(refusal(state, { cheat: 'goods', colonyId: 'c1', good: 'all', amount: add(-7) })).toEqual({ code: 'cheatBelowZero', message: 'Jamestown holds only 0 sugar' });
    expect(refusal(state, { cheat: 'goods', colonyId: 'c1', good: 'food', amount: set(-1) }).code).toBe('cheatBelowZero');
  });

  it('is refused for an amount that is not whole, and for a good there is none of', () => {
    for (const value of [1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) expect(refusal(base(), { cheat: 'goods', colonyId: 'c1', good: 'food', amount: add(value) }).code, String(value)).toBe('cheatAmount');
    expect(refusal(base(), { cheat: 'goods', colonyId: 'c1', good: 'food' } as unknown as CheatCommand).code).toBe('cheatAmount');
    expect(refusal(base(), { cheat: 'goods', colonyId: 'c1', good: 'hammers', amount: add(1) } as unknown as CheatCommand)).toEqual({ code: 'cheatTarget', message: 'there is no good "hammers"' });
  });
});

describe('hammers', () => {
  it('adds to the hammers put by, takes from them and sets them', () => {
    const added = run(base({ hammers: 10 }), { cheat: 'hammers', colonyId: 'c1', amount: add(100) });
    expect(town(added.state).hammers).toBe(110);
    expect(summary(added.events)).toBe('Added 100 hammers to Jamestown.');
    const taken = run(added.state, { cheat: 'hammers', colonyId: 'c1', amount: add(-110) });
    expect(town(taken.state).hammers).toBe(0);
    expect(summary(taken.events)).toBe('Took 110 hammers from Jamestown.');
    const fixed = run(taken.state, { cheat: 'hammers', colonyId: 'c1', amount: set(64) });
    expect(town(fixed.state).hammers).toBe(64);
    expect(summary(fixed.events)).toBe('Set hammers in Jamestown to 64.');
  });

  it('is refused below nothing and for an amount that is not whole', () => {
    expect(refusal(base({ hammers: 10 }), { cheat: 'hammers', colonyId: 'c1', amount: add(-11) })).toEqual({ code: 'cheatBelowZero', message: 'Jamestown has only 10 hammers put by' });
    expect(refusal(base(), { cheat: 'hammers', colonyId: 'c1', amount: add(0.5) }).code).toBe('cheatAmount');
  });
});

describe('finish', () => {
  const fort = { kind: 'building', id: 'fort' } as const;

  it('gives the colony the hammers and the tools its project still needs, and no gold changes hands', () => {
    const state = base({ construction: fort, hammers: 20, goods: { tools: 4 }, buildings: ['stockade'] });
    const { state: next, events } = run(state, { cheat: 'finish', colonyId: 'c1' });
    expect(town(next).hammers).toBe(BUILDINGS.fort.hammers);
    expect(town(next).goods).toEqual({ tools: BUILDINGS.fort.tools });
    expect(town(next).buildings).toEqual(['stockade']);
    expect(next.players[0]?.gold).toBe(state.players[0]?.gold);
    expect(summary(events)).toBe(`Gave Jamestown the ${BUILDINGS.fort.hammers - 20} hammers and ${BUILDINGS.fort.tools - 4} tools its Fort still needs.`);
  });

  it('leaves what the colony has over and above its project', () => {
    const { state: next } = run(base({ construction: fort, hammers: 500, goods: { tools: 4 } }), { cheat: 'finish', colonyId: 'c1' });
    expect(town(next).hammers).toBe(500);
    expect(town(next).goods).toEqual({ tools: BUILDINGS.fort.tools });
  });

  /** End turns until the first power's comes round again (its colonies are worked as its turn opens). */
  const round = (state: GameState): { state: GameState; events: GameEvent[] } => {
    let next = state;
    const events: GameEvent[] = [];
    do {
      const step = applyAction(next, { type: 'endTurn' });
      next = step.state;
      events.push(...step.events);
    } while (next.current !== 0);
    return { state: next, events };
  };

  it('followed by the end of the turn completes the project with the treasury unchanged', () => {
    const state = base({ construction: fort, buildings: ['stockade'] });
    const gold = state.players[0]?.gold;
    const cheated = run(state, { cheat: 'finish', colonyId: 'c1' }).state;
    const ended = round(cheated);
    expect(ended.events).toContainEqual({ type: 'buildingCompleted', colonyId: 'c1', building: 'fort', tools: BUILDINGS.fort.tools });
    expect(town(ended.state).buildings).toEqual(['stockade', 'fort']);
    expect(town(ended.state).hammers).toBeLessThan(BUILDINGS.fort.hammers);
    expect(ended.state.players[0]?.gold).toBe(gold);
    // and without the cheat the same turn builds nothing
    expect(town(round(state).state).buildings).toEqual(['stockade']);
  });

  it('is refused with nothing under construction, with the building standing, and with nothing wanting', () => {
    expect(refusal(base(), { cheat: 'finish', colonyId: 'c1' })).toEqual({ code: 'cheatTarget', message: 'Jamestown has nothing under construction' });
    expect(refusal(base({ construction: fort, buildings: ['stockade', 'fort'] }), { cheat: 'finish', colonyId: 'c1' })).toEqual({ code: 'cheatTarget', message: 'Jamestown already has its Fort' });
    const ready = base({ construction: fort, hammers: BUILDINGS.fort.hammers, goods: { tools: BUILDINGS.fort.tools } });
    expect(refusal(ready, { cheat: 'finish', colonyId: 'c1' })).toEqual({ code: 'cheatTarget', message: 'Jamestown already has all its Fort needs' });
  });
});

describe('building', () => {
  it('adds the building and every earlier link of its chain the colony lacks', () => {
    const { state, events } = run(base(), { cheat: 'building', colonyId: 'c1', building: 'fortress' });
    expect(town(state).buildings).toEqual(['stockade', 'fort', 'fortress']);
    expect(summary(events)).toBe('Built in Jamestown: Stockade, Fort and Fortress.');
    const partly = run(base({ buildings: ['townHall', 'weaversHouse'] }), { cheat: 'building', colonyId: 'c1', building: 'textileMill' });
    expect(town(partly.state).buildings).toEqual(['townHall', 'weaversHouse', 'weaversShop', 'textileMill']);
    expect(summary(partly.events)).toBe("Built in Jamestown: Weaver's Shop and Textile Mill.");
  });

  it('asks nothing of the colony: not its size, the coast, or the Congress', () => {
    const state = base();
    expect(town(state).colonists).toHaveLength(1);
    expect(BUILDINGS.university.minPopulation).toBeGreaterThan(1);
    expect(BUILDINGS.customHouse.needsFather).not.toBeNull();
    for (const building of ['university', 'customHouse', 'shipyard'] as const) {
      const next = run(state, { cheat: 'building', colonyId: 'c1', building }).state;
      expect(town(next).buildings, building).toContain(building);
      expect(checkInvariants(next), building).toEqual([]);
    }
    const one = run(state, { cheat: 'building', colonyId: 'c1', building: 'stable' });
    expect(town(one.state).buildings).toEqual(['stable']);
    expect(summary(one.events)).toBe('Built in Jamestown: Stable.');
  });

  it('is refused if the colony has it, if there is none such, and for one never built in play', () => {
    expect(refusal(base({ buildings: ['stockade', 'fort'] }), { cheat: 'building', colonyId: 'c1', building: 'fort' })).toEqual({ code: 'cheatTarget', message: 'Jamestown already has the Fort' });
    expect(refusal(base(), { cheat: 'building', colonyId: 'c1', building: 'pyramid' } as unknown as CheatCommand)).toEqual({ code: 'cheatTarget', message: 'there is no building "pyramid"' });
    expect(BUILDINGS.townHall2.unused).toBe(true);
    expect(refusal(base(), { cheat: 'building', colonyId: 'c1', building: 'townHall2' }).code).toBe('cheatTarget');
  });
});

describe('liberty', () => {
  it('sets membership to the percent given and leaves the denominator as it was', () => {
    for (const d of [100, 200, 150, 317, 1000]) {
      for (const percent of [0, 1, 33, 50, 99, 100]) {
        const state = base({ sol: { n: 7, d } });
        const { state: next, events } = run(state, { cheat: 'liberty', colonyId: 'c1', percent });
        expect(town(next).sol.d, `${percent} of ${d}`).toBe(d);
        expect(solPercent(next, town(next)), `${percent} of ${d}`).toBe(percent);
        expect(summary(events)).toBe(`Set Sons of Liberty membership in Jamestown to ${percent} percent.`);
      }
    }
  });

  it('leaves the bonus level for the turn to settle', () => {
    const next = run(base({ sol: { n: 0, d: 200 }, solLevel: 0 }), { cheat: 'liberty', colonyId: 'c1', percent: 100 }).state;
    expect(town(next).sol).toEqual({ n: 200, d: 200 });
    expect(town(next).solLevel).toBe(0);
  });

  it('with a small denominator reads the nearest percent that is no less, and the summary says which', () => {
    const { state: next, events } = run(base({ sol: { n: 0, d: 3 } }), { cheat: 'liberty', colonyId: 'c1', percent: 50 });
    expect(town(next).sol).toEqual({ n: 2, d: 3 });
    expect(summary(events)).toBe('Set Sons of Liberty membership in Jamestown to 66 percent.');
  });

  it('counts the points a Father adds on top, so that the colony still reads the percent given', () => {
    const state = base({ sol: { n: 0, d: 200 } }, ['simonBolivar']);
    const half = run(state, { cheat: 'liberty', colonyId: 'c1', percent: 50 }).state;
    expect(town(half).sol).toEqual({ n: 60, d: 200 });
    expect(solPercent(half, town(half))).toBe(50);
    // it cannot read less than his points
    const low = run(state, { cheat: 'liberty', colonyId: 'c1', percent: 5 });
    expect(town(low.state).sol).toEqual({ n: 0, d: 200 });
    expect(summary(low.events)).toBe('Set Sons of Liberty membership in Jamestown to 20 percent.');
  });

  it('is refused outside 0 to 100', () => {
    for (const percent of [-1, 101, 2.5]) expect(refusal(base(), { cheat: 'liberty', colonyId: 'c1', percent }).code, String(percent)).toBe('cheatAmount');
  });
});

describe('a colony named in a cheat', () => {
  const COMMANDS: readonly CheatCommand[] = [
    { cheat: 'goods', colonyId: 'c2', good: 'food', amount: add(1) },
    { cheat: 'hammers', colonyId: 'c2', amount: add(1) },
    { cheat: 'finish', colonyId: 'c2' },
    { cheat: 'building', colonyId: 'c2', building: 'stockade' },
    { cheat: 'liberty', colonyId: 'c2', percent: 50 },
  ];

  it('must belong to the power the cheat is for, and is named when it does not', () => {
    for (const command of COMMANDS) expect(refusal(base(), command), command.cheat).toEqual({ code: 'cheatTarget', message: 'Quebec is not a colony of A' });
  });

  it('may be another power\'s when the cheat is for that power', () => {
    const { state } = run(base(), { cheat: 'hammers', colonyId: 'c2', amount: add(9) }, 'b');
    expect(town(state, 'c2').hammers).toBe(9);
    expect(state.players.map((p) => p.cheated)).toEqual([true, true]);
    expect(refusal(base(), { cheat: 'hammers', colonyId: 'c1', amount: add(9) }, 'b').message).toBe('Jamestown is not a colony of B');
  });

  it('must exist', () => {
    for (const colonyId of ['c9', 'constructor', undefined]) {
      expect(refusal(base(), { cheat: 'hammers', colonyId, amount: add(1) } as unknown as CheatCommand).code, String(colonyId)).toBe('cheatTarget');
    }
    expect(refusal(base(), { cheat: 'finish', colonyId: 'c9' }).message).toBe('there is no colony "c9"');
  });
});

describe('the colony specs', () => {
  const ARGS: Record<string, Record<string, CheatArgValue>> = {
    goods: { colony: 'c1', good: { kind: 'good', value: 'muskets' }, amount: { set: false, value: 300 } },
    hammers: { colony: 'c1', amount: { set: true, value: 50 } },
    finish: { colony: 'c1' },
    building: { colony: 'c1', building: 'fortress' },
    liberty: { colony: 'c1', percent: 80 },
  };

  it('are the five of this group, listed with the rest', () => {
    expect(COLONIES_SPECS.map((s) => s.name)).toEqual(['goods', 'hammers', 'finish', 'building', 'liberty']);
    for (const spec of COLONIES_SPECS) expect(CHEAT_SPECS).toContain(spec);
  });

  it.each(COLONIES_SPECS.map((s) => [s.name, s] as const))('%s builds a command the check accepts', (name, spec) => {
    const args = ARGS[name];
    if (!args) throw new Error(`no test arguments for the cheat "${name}"`);
    expect(Object.keys(args).sort()).toEqual(spec.args.map((a) => a.name).sort());
    expect(spec.args.every((a) => !a.optional)).toBe(true);
    const state = base({ construction: { kind: 'unit', unit: 'wagonTrain' } });
    const command = spec.build(args);
    expect(checkCheat(state, 'a', command)).toEqual({ ok: true });
    expect(() => applyAction(state, cheat(command))).not.toThrow();
  });

  it('read "all" for every good', () => {
    const spec = COLONIES_SPECS.find((s) => s.name === 'goods');
    expect(spec?.build({ colony: 'c1', good: { kind: 'word', value: 'all' }, amount: { set: true, value: 0 } })).toEqual({ cheat: 'goods', colonyId: 'c1', good: 'all', amount: { set: true, value: 0 } });
  });

  it('fail loudly when handed an argument of the wrong kind', () => {
    const spec = COLONIES_SPECS.find((s) => s.name === 'goods');
    expect(() => spec?.build({ colony: 'c1', good: 'muskets', amount: { set: false, value: 1 } })).toThrow(TypeError);
    expect(() => spec?.build({ colony: 7, good: { kind: 'good', value: 'muskets' }, amount: { set: false, value: 1 } })).toThrow(TypeError);
  });
});
