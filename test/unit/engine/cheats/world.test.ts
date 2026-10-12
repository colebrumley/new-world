import { describe, expect, it } from 'vitest';
import { applyAction, validateAction, type Action, type GameEvent } from '../../../../src/engine/actions';
import { isHostile } from '../../../../src/engine/alarm';
import { checkCheat, CHEAT_SPECS, type CheatArgValue, type CheatCommand } from '../../../../src/engine/cheats';
import { WORLD_SPECS } from '../../../../src/engine/cheats/world';
import { GOOD_IDS } from '../../../../src/engine/data/goods';
import { MARKET } from '../../../../src/engine/data/market';
import { NATIVES } from '../../../../src/engine/data/tribes';
import { checkInvariants } from '../../../../src/engine/invariants';
import { askPrice, bidPrice } from '../../../../src/engine/market';
import type { GameState, Player, Settlement, TribeState } from '../../../../src/engine/state';
import { deepFreeze } from '../../../helpers/freeze';
import { withBids, world } from '../../../helpers/world';

const VILLAGE: Settlement = {
  id: 's1', tribe: 'sioux', x: 2, y: 1, capital: false, population: 3, growth: 0, taught: false, tributePaid: false,
  alarm: { a: 10, b: 77 }, mission: null, scouted: [], lastBought: null, lastSold: null, haggleMemory: null,
};
const STRANGERS: TribeState = { alarm: { a: 60, b: 9 }, goodwill: {}, met: [], muskets: 0, horses: 0, breeding: 0, silver: 0, peace: [], landSold: 0, grudge: ['a', 'b'], joinedCrown: false, visited: {}, stock: {} };

const base = (kinds: readonly ('human' | 'ai')[] = ['human', 'ai', 'ai']): GameState => {
  const bare = world({ rows: ['~....', '.....', '.....'], players: kinds.map((kind, i) => ({ id: 'abc'[i] as string, kind })) });
  return deepFreeze({ ...bare, settlements: { s1: VILLAGE, s2: { ...VILLAGE, id: 's2', tribe: 'aztec', capital: true, x: 4, y: 2, alarm: {} } }, tribes: { ...bare.tribes, aztec: STRANGERS } });
};
const power = (state: GameState, id = 'a'): Player => state.players.find((p) => p.id === id) as Player;
const patch = (state: GameState, change: Partial<Player>, id = 'a'): GameState => ({ ...state, players: state.players.map((p) => (p.id === id ? { ...p, ...change } : p)) });
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

describe('alarm', () => {
  it("writes a tribe's alarm at the power to the number given, and nobody else's", () => {
    const { state, events } = run(base(), { cheat: 'alarm', target: { kind: 'tribe', tribe: 'aztec' }, percent: 5 });
    expect(state.tribes.aztec?.alarm).toEqual({ a: 5, b: 9 });
    expect(state.settlements.s2?.alarm).toEqual({});
    expect(summary(events)).toBe('Set the alarm of the Aztecs at A to 5.');
    const top = run(state, { cheat: 'alarm', target: { kind: 'tribe', tribe: 'aztec' }, percent: NATIVES.alarmMax }, 'b').state;
    expect(top.tribes.aztec?.alarm).toEqual({ a: 5, b: NATIVES.alarmMax });
  });

  it("writes a settlement's alarm as a percent of the mark at which it turns hostile", () => {
    const calm = run(base(), { cheat: 'alarm', target: { kind: 'settlement', settlementId: 's1' }, percent: 0 });
    expect(calm.state.settlements.s1?.alarm).toEqual({ a: 0, b: 77 });
    expect(calm.state.tribes).toEqual(base().tribes);
    const half = run(base(), { cheat: 'alarm', target: { kind: 'settlement', settlementId: 's1' }, percent: 50 });
    expect(half.state.settlements.s1?.alarm.a).toBe(NATIVES.settlementWary);
    expect(summary(half.events)).toBe(`Set the alarm of the Sioux settlement at 2,1 at A to 50 percent of what turns it hostile (${NATIVES.settlementWary}).`);
    const angry = run(base(), { cheat: 'alarm', target: { kind: 'settlement', settlementId: 's2' }, percent: 100 });
    expect(angry.state.settlements.s2?.alarm).toEqual({ a: NATIVES.settlementHostile });
    expect(isHostile(angry.state.settlements.s2 as Settlement, 'a')).toBe(true);
    expect(isHostile((run(base(), { cheat: 'alarm', target: { kind: 'settlement', settlementId: 's2' }, percent: 99 }).state.settlements.s2) as Settlement, 'a')).toBe(false);
    expect(summary(angry.events)).toContain('the Aztec capital at 4,2');
  });

  it('is refused for a tribe or a settlement there is none of, and for a number out of range', () => {
    expect(refusal(base(), { cheat: 'alarm', target: { kind: 'tribe', tribe: 'inca' }, percent: 5 })).toEqual({ code: 'cheatTarget', message: 'there is no tribe "inca" in the New World' });
    expect(refusal(base(), { cheat: 'alarm', target: { kind: 'settlement', settlementId: 's9' }, percent: 5 })).toEqual({ code: 'cheatTarget', message: 'there is no settlement "s9"' });
    expect(refusal(base(), { cheat: 'alarm', percent: 5 } as unknown as CheatCommand).code).toBe('cheatTarget');
    for (const percent of [-1, 101, 0.5]) {
      expect(refusal(base(), { cheat: 'alarm', target: { kind: 'tribe', tribe: 'sioux' }, percent }).code, String(percent)).toBe('cheatAmount');
      expect(refusal(base(), { cheat: 'alarm', target: { kind: 'settlement', settlementId: 's1' }, percent }).code, String(percent)).toBe('cheatAmount');
    }
  });
});

describe('peace', () => {
  it('makes a treaty with a tribe not yet met: met, at peace, no grudge, and no worse than wary', () => {
    const { state, events } = run(base(), { cheat: 'peace', tribe: 'aztec' });
    const tribe = state.tribes.aztec as TribeState;
    expect(tribe.met).toEqual(['a']);
    expect(tribe.peace).toEqual(['a']);
    expect(tribe.grudge).toEqual(['b']);
    expect(tribe.alarm).toEqual({ a: NATIVES.contactAlarmCap, b: 9 });
    expect(summary(events)).toBe('A and the Aztecs are at peace.');
  });

  it('answers a treaty question still waiting, and leaves the others on the table', () => {
    const asked = patch({ ...base(), tribes: { ...base().tribes, aztec: { ...STRANGERS, met: ['a'] } } }, { pendingTreaties: ['aztec', 'sioux'] });
    const { state } = run(asked, { cheat: 'peace', tribe: 'aztec' });
    expect(power(state).pendingTreaties).toEqual(['sioux']);
    expect(state.tribes.aztec).toMatchObject({ met: ['a'], peace: ['a'], grudge: ['b'], alarm: { a: 60, b: 9 } });
    expect(validateAction(state, { type: 'answerTreaty', tribe: 'aztec', accept: false }).ok).toBe(false);
  });

  it('changes nothing for a tribe already at peace, and lets a computer power give up its war', () => {
    const again = run(base(), { cheat: 'peace', tribe: 'sioux' }).state;
    expect(again.tribes).toEqual(base().tribes);
    const warlike = patch(base(), { tribeWars: ['aztec', 'sioux'] }, 'b');
    const { state } = run(warlike, { cheat: 'peace', tribe: 'aztec' }, 'b');
    expect(power(state, 'b').tribeWars).toEqual(['sioux']);
    expect(state.tribes.aztec).toMatchObject({ met: ['b'], peace: ['b'], grudge: ['a'] });
    expect(power(state, 'a').tribeWars).toBeUndefined();
  });

  it('is refused for a tribe that is not in the New World', () => {
    expect(refusal(base(), { cheat: 'peace', tribe: 'inca' })).toEqual({ code: 'cheatTarget', message: 'there is no tribe "inca" in the New World' });
  });
});

describe('meet', () => {
  it('brings two powers face to face as the game does: at war until they agree, the computer power asking to talk', () => {
    const { state, events } = run(base(), { cheat: 'meet', power: 'b' });
    expect(power(state, 'a').stance).toEqual({ b: 'war' });
    expect(power(state, 'b').stance).toEqual({ a: 'war' });
    expect(power(state, 'a').audiencesDue).toEqual(['b']);
    expect(power(state, 'c').stance).toEqual({});
    expect(summary(events)).toBe('A and B have met.');
  });

  it('between two computer powers settles their relations at once, as their own meeting would', () => {
    const { state } = run(base(), { cheat: 'meet', power: 'c' }, 'b');
    expect(Object.keys(power(state, 'b').stance)).toEqual(['c']);
    expect(power(state, 'b').stance.c).toBe(power(state, 'c').stance.b);
    expect(state.players.map((p) => p.cheated)).toEqual([true, true, undefined]);
  });

  it('is refused if they have met, for itself, for no power, and for a power fighting for its independence', () => {
    const met = run(base(), { cheat: 'meet', power: 'b' }).state;
    expect(refusal(met, { cheat: 'meet', power: 'b' })).toEqual({ code: 'cheatTarget', message: 'A and B have met already' });
    expect(refusal(base(), { cheat: 'meet', power: 'a' })).toEqual({ code: 'cheatTarget', message: 'A cannot treat with itself' });
    expect(refusal(base(), { cheat: 'meet', power: 'z' })).toEqual({ code: 'cheatTarget', message: '"z" is not a power in the New World' });
    expect(refusal(patch(base(), { withdrawn: true }, 'c'), { cheat: 'meet', power: 'c' }).code).toBe('cheatTarget');
    expect(refusal({ ...base(), crownPlayer: 'c' }, { cheat: 'meet', power: 'c' }).code).toBe('cheatTarget');
    expect(refusal(patch(base(), { atWar: true }, 'c'), { cheat: 'meet', power: 'c' })).toEqual({ code: 'cheatTarget', message: 'C is fighting for its independence and meets no one' });
  });
});

describe('stance', () => {
  it('sets peace or war between powers that have met, on both sides', () => {
    const met = run(base(), { cheat: 'meet', power: 'b' }).state;
    const peace = run(met, { cheat: 'stance', power: 'b', stance: 'peace' });
    expect(power(peace.state, 'a').stance).toEqual({ b: 'peace' });
    expect(power(peace.state, 'b').stance).toEqual({ a: 'peace' });
    expect(summary(peace.events)).toBe('A and B are now at peace.');
    const war = run(peace.state, { cheat: 'stance', power: 'b', stance: 'war' });
    expect(power(war.state, 'a').stance).toEqual({ b: 'war' });
    expect(power(war.state, 'b').stance).toEqual({ a: 'war' });
    expect(summary(war.events)).toBe('A and B are now at war.');
  });

  it('with a power not yet met meets it first: both records show the other', () => {
    for (const stance of ['war', 'peace'] as const) {
      const { state } = run(base(), { cheat: 'stance', power: 'b', stance });
      expect(power(state, 'a').stance, stance).toEqual({ b: stance });
      expect(power(state, 'b').stance, stance).toEqual({ a: stance });
      // met as the game meets them: the computer power wishes to speak
      expect(power(state, 'a').audiencesDue, stance).toEqual(['b']);
    }
    const others = run(base(), { cheat: 'stance', power: 'c', stance: 'war' }, 'b').state;
    expect(power(others, 'b').stance).toEqual({ c: 'war' });
    expect(power(others, 'c').stance).toEqual({ b: 'war' });
  });

  it('is refused for itself, for no power, and for a word that is neither', () => {
    expect(refusal(base(), { cheat: 'stance', power: 'a', stance: 'war' }).code).toBe('cheatTarget');
    expect(refusal(base(), { cheat: 'stance', power: 'z', stance: 'war' }).message).toBe('"z" is not a power in the New World');
    expect(refusal(base(), { cheat: 'stance', power: 'b', stance: 'truce' } as unknown as CheatCommand)).toEqual({ code: 'cheatTarget', message: 'a stance is peace or war' });
  });
});

describe('crown', () => {
  it('adds to a part of the Expeditionary Force, takes from it and sets it', () => {
    const before = power(base()).ref;
    const added = run(base(), { cheat: 'crown', part: 'regulars', amount: add(10) });
    expect(power(added.state).ref).toEqual({ ...before, regulars: before.regulars + 10 });
    expect(summary(added.events)).toBe('Added 10 regulars to the Expeditionary Force.');
    const taken = run(added.state, { cheat: 'crown', part: 'ships', amount: add(-before.ships) });
    expect(power(taken.state).ref).toEqual({ ...before, regulars: before.regulars + 10, ships: 0 });
    expect(summary(taken.events)).toBe(`Took ${before.ships} ships from the Expeditionary Force.`);
    for (const part of ['regulars', 'cavalry', 'artillery', 'ships'] as const) {
      const fixed = run(base(), { cheat: 'crown', part, amount: set(0) });
      expect(power(fixed.state).ref, part).toEqual({ ...before, [part]: 0 });
      expect(summary(fixed.events)).toBe(`Set the ${part} of the Expeditionary Force to 0.`);
      expect(power(fixed.state).royalMoney).toBe(0);
    }
    expect(power(added.state, 'b').ref).toEqual(power(base(), 'b').ref);
  });

  it("adds to the King's war chest, takes from it and sets it", () => {
    const state = patch(base(), { royalMoney: 500 });
    const added = run(state, { cheat: 'crown', part: 'gold', amount: add(1000) });
    expect(power(added.state).royalMoney).toBe(1500);
    expect(power(added.state).ref).toEqual(power(state).ref);
    expect(power(added.state).gold).toBe(power(state).gold);
    expect(summary(added.events)).toBe("Added 1000 gold to the King's war chest.");
    expect(power(run(state, { cheat: 'crown', part: 'gold', amount: add(-500) }).state).royalMoney).toBe(0);
    expect(summary(run(state, { cheat: 'crown', part: 'gold', amount: set(7) }).events)).toBe("Set the gold of the King's war chest to 7.");
  });

  it('is refused, not clamped, below nothing; and for an amount that is not whole or a part there is none of', () => {
    const state = patch(base(), { royalMoney: 500 });
    expect(refusal(state, { cheat: 'crown', part: 'gold', amount: add(-501) })).toEqual({ code: 'cheatBelowZero', message: 'the Crown has only 500 gold' });
    expect(refusal(state, { cheat: 'crown', part: 'cavalry', amount: add(-power(state).ref.cavalry - 1) })).toEqual({ code: 'cheatBelowZero', message: `the Crown has only ${power(state).ref.cavalry} cavalry` });
    expect(refusal(state, { cheat: 'crown', part: 'cavalry', amount: set(-1) }).code).toBe('cheatBelowZero');
    expect(refusal(state, { cheat: 'crown', part: 'cavalry', amount: add(0.5) }).code).toBe('cheatAmount');
    expect(refusal(state, { cheat: 'crown', part: 'cavalry' } as unknown as CheatCommand).code).toBe('cheatAmount');
    expect(refusal(state, { cheat: 'crown', part: 'marines', amount: add(1) } as unknown as CheatCommand).code).toBe('cheatTarget');
  });
});

describe('price', () => {
  it('makes Europe pay the power the count for a good, anywhere within the range the good is traded in', () => {
    for (const good of GOOD_IDS) {
      for (let count = MARKET[good].low - 1; count <= MARKET[good].high - 1; count += 1) {
        const { state, events } = run(base(), { cheat: 'price', good, count });
        expect(bidPrice(state, 'a', good), `${good} ${count}`).toBe(count);
        expect(summary(events)).toContain(`pays A ${count} for `);
        expect(checkInvariants(state)).toEqual([]);
      }
    }
  });

  it('holds a price to the limits of the good, and the summary says what it came to', () => {
    const high = run(base(), { cheat: 'price', good: 'furs', count: 500 });
    expect(bidPrice(high.state, 'a', 'furs')).toBe(MARKET.furs.high - 1);
    expect(summary(high.events)).toBe(`Europe now pays A ${MARKET.furs.high - 1} for furs.`);
    const low = run(base(), { cheat: 'price', good: 'tradeGoods', count: 0 });
    expect(bidPrice(low.state, 'a', 'tradeGoods')).toBe(MARKET.tradeGoods.low - 1);
    expect(summary(low.events)).toBe(`Europe now pays A ${MARKET.tradeGoods.low - 1} for trade goods.`);
  });

  it("moves that power's price for that good alone, and the asking price with it", () => {
    const state = withBids(base(), { rum: 10, cloth: 10 });
    const next = run(state, { cheat: 'price', good: 'rum', count: 15 }).state;
    expect(bidPrice(next, 'a', 'rum')).toBe(15);
    expect(askPrice(next, 'a', 'rum') - askPrice(state, 'a', 'rum')).toBe(5);
    expect(bidPrice(next, 'a', 'cloth')).toBe(10);
    expect(next.market.powers.b).toBe(state.market.powers.b);
    expect(next.market.powers.a?.volume).toBe(state.market.powers.a?.volume);
  });

  it('is refused for a good there is none of and for a count that is not whole or below nothing', () => {
    expect(refusal(base(), { cheat: 'price', good: 'bells', count: 3 } as unknown as CheatCommand)).toEqual({ code: 'cheatTarget', message: 'there is no good "bells"' });
    for (const count of [-1, 1.5, Number.NaN]) expect(refusal(base(), { cheat: 'price', good: 'rum', count }).code, String(count)).toBe('cheatAmount');
  });
});

describe('the world specs', () => {
  const ARGS: Record<string, Record<string, CheatArgValue>> = {
    alarm: { target: { kind: 'tribe', value: 'sioux' }, percent: 0 },
    peace: { tribe: 'aztec' },
    meet: { power: 'b' },
    stance: { power: 'c', stance: 'war' },
    crown: { part: 'regulars', amount: { set: true, value: 0 } },
    price: { good: 'furs', count: 5 },
  };

  it('are the six of this group, listed with the rest', () => {
    expect(WORLD_SPECS.map((s) => s.name)).toEqual(['alarm', 'peace', 'meet', 'stance', 'crown', 'price']);
    for (const spec of WORLD_SPECS) expect(CHEAT_SPECS).toContain(spec);
  });

  it.each(WORLD_SPECS.map((s) => [s.name, s] as const))('%s builds a command the check accepts', (name, spec) => {
    const args = ARGS[name];
    if (!args) throw new Error(`no test arguments for the cheat "${name}"`);
    expect(Object.keys(args).sort()).toEqual(spec.args.map((a) => a.name).sort());
    expect(spec.args.every((a) => !a.optional)).toBe(true);
    const state = base();
    const command = spec.build(args);
    expect(checkCheat(state, 'a', command)).toEqual({ ok: true });
    expect(() => applyAction(state, cheat(command))).not.toThrow();
  });

  it('read a settlement as well as a tribe for the alarm', () => {
    const spec = WORLD_SPECS.find((s) => s.name === 'alarm');
    expect(spec?.build({ target: { kind: 'settlement', value: 's1' }, percent: 40 })).toEqual({ cheat: 'alarm', target: { kind: 'settlement', settlementId: 's1' }, percent: 40 });
    expect(spec?.build({ target: { kind: 'tribe', value: 'sioux' }, percent: 40 })).toEqual({ cheat: 'alarm', target: { kind: 'tribe', tribe: 'sioux' }, percent: 40 });
    expect(() => spec?.build({ target: 'sioux', percent: 40 })).toThrow(TypeError);
  });

  it('offer the fixed words of a stance and of the Crown\'s parts', () => {
    expect(WORLD_SPECS.find((s) => s.name === 'stance')?.args[1]?.kind).toEqual({ oneOf: ['peace', 'war'] });
    expect(WORLD_SPECS.find((s) => s.name === 'crown')?.args[0]?.kind).toEqual({ oneOf: ['regulars', 'cavalry', 'artillery', 'ships', 'gold'] });
  });
});
