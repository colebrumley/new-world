import { describe, expect, it } from 'vitest';
import { applyAction, validateAction, type Action, type GameEvent } from '../../../../src/engine/actions';
import { checkCheat, type CheatArgValue, type CheatCommand } from '../../../../src/engine/cheats';
import { TREASURY_SPECS } from '../../../../src/engine/cheats/treasury';
import { creditBells, fatherCost, join, type CongressEvent } from '../../../../src/engine/congress';
import { CHEATS } from '../../../../src/engine/data/cheats';
import { FATHER_IDS } from '../../../../src/engine/data/fathers';
import { MARKET_MODEL } from '../../../../src/engine/data/market';
import { interventionBells, warBells, type IndependenceEvent } from '../../../../src/engine/independence';
import { createRng } from '../../../../src/engine/rng';
import type { GameState, Player, Revolution } from '../../../../src/engine/state';
import { deepFreeze } from '../../../helpers/freeze';
import { world } from '../../../helpers/world';

const base = (kind: 'human' | 'ai' = 'human'): GameState => deepFreeze(world({ rows: ['~..', '...'], players: [{ id: 'a', kind }, { id: 'b', kind: 'ai' }] }));
const me = (state: GameState): Player => state.players[0] as Player;
const patch = (state: GameState, change: Partial<Player>, id = 'a'): GameState => ({ ...state, players: state.players.map((p) => (p.id === id ? { ...p, ...change } : p)) });
const cheat = (command: CheatCommand, player?: string): Action => (player === undefined ? { type: 'cheat', command } : { type: 'cheat', player, command });
const run = (state: GameState, command: CheatCommand, player?: string): { state: GameState; events: readonly GameEvent[] } => applyAction(state, cheat(command, player));
const summary = (events: readonly GameEvent[]): string => {
  const applied = events.filter((e) => e.type === 'cheatApplied');
  expect(applied).toHaveLength(1);
  expect(events[0]).toBe(applied[0]);
  return (applied[0] as { summary: string }).summary;
};
const refusal = (state: GameState, command: CheatCommand): { code: string; message: string } => {
  const check = validateAction(state, cheat(command));
  if (check.ok) throw new Error('expected a refusal');
  return check.error;
};
const gold = (value: number, set = false): CheatCommand => ({ cheat: 'gold', amount: { set, value } });
const REVOLUTION: Revolution = {
  declaredTurn: 0, sentiment: 60, friend: 'b', patron: null, force: { infantry: 2, cavalry: 1, artillery: 1, ships: 1 },
  bells: 0, considered: true, mustered: true, intervened: false, refBeaten: false, uprisings: [],
};
const atWar = (state: GameState, change: Partial<Revolution> = {}): GameState => patch(state, { atWar: true, revolution: { ...REVOLUTION, ...change } });

describe('gold', () => {
  it('adds to the treasury, takes from it and sets it, saying so in plain digits', () => {
    const added = run(base(), gold(5000));
    expect(me(added.state).gold).toBe(5000);
    expect(summary(added.events)).toBe('Added 5000 gold to the treasury.');
    const taken = run(added.state, gold(-1200));
    expect(me(taken.state).gold).toBe(3800);
    expect(summary(taken.events)).toBe('Took 1200 gold from the treasury.');
    const set = run(taken.state, gold(1000000, true));
    expect(me(set.state).gold).toBe(1000000);
    expect(summary(set.events)).toBe('Set the treasury to 1000000 gold.');
    expect(me(run(set.state, gold(0, true)).state).gold).toBe(0);
    expect(me(run(taken.state, gold(-3800)).state).gold).toBe(0);
  });

  it('is refused, not clamped, when the treasury would go below nothing', () => {
    const state = patch(base(), { gold: 300 });
    expect(refusal(state, gold(-301))).toEqual({ code: 'cheatBelowZero', message: 'the treasury holds only 300 gold' });
    expect(refusal(state, gold(-1, true)).code).toBe('cheatBelowZero');
    expect(validateAction(state, cheat(gold(-300))).ok).toBe(true);
  });

  it('is refused for an amount that is no whole number', () => {
    for (const value of [1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) expect(refusal(base(), gold(value)).code, String(value)).toBe('cheatAmount');
    expect(refusal(patch(base(), { gold: 10 }), gold(Number.MAX_SAFE_INTEGER)).code).toBe('cheatAmount');
    expect(refusal(base(), { cheat: 'gold' } as unknown as CheatCommand).code).toBe('cheatAmount');
  });

  it('for a computer power during the human turn adds to that power and marks both', () => {
    const { state } = run(base(), gold(700), 'b');
    expect(state.players.map((p) => p.gold)).toEqual([0, 700]);
    expect(state.players.map((p) => p.cheated)).toEqual([true, true]);
  });
});

describe('crosses', () => {
  it('adds crosses toward the next immigrant', () => {
    const { state, events } = run(patch(base(), { crosses: 7 }), { cheat: 'crosses', count: 200 });
    expect(me(state).crosses).toBe(207);
    expect(summary(events)).toBe('Added 200 crosses.');
  });

  it('is refused for a count below nothing or not whole', () => {
    for (const count of [-1, 2.5, Number.NaN]) expect(refusal(base(), { cheat: 'crosses', count }).code, String(count)).toBe('cheatAmount');
    expect(refusal(base(), { cheat: 'bells', count: -5 })).toEqual({ code: 'cheatAmount', message: 'a count of bells is a whole number of zero or more' });
  });

  it('is refused when a tally would grow past what can be counted by ones', () => {
    const most = Number.MAX_SAFE_INTEGER;
    expect(validateAction(base(), cheat({ cheat: 'crosses', count: most })).ok).toBe(true);
    expect(refusal(patch(base(), { crosses: 1 }), { cheat: 'crosses', count: most })).toEqual({ code: 'cheatAmount', message: 'that is more crosses than can be counted' });
    expect(validateAction(patch(base(), { crosses: 1 }), cheat({ cheat: 'bells', count: most })).ok).toBe(true);
    for (const held of [{ bells: 1 }, { fatherBells: 1 }]) expect(refusal(patch(base(), held), { cheat: 'bells', count: most }).message).toBe('that is more bells than can be counted');
    expect(refusal(atWar(base(), { bells: 1 }), { cheat: 'bells', count: most }).code).toBe('cheatAmount');
  });
});

describe('bells before the Declaration', () => {
  it('adds to the lifetime count and to the bells gathered for the next Father', () => {
    const state = patch(base(), { bells: 40, fatherBells: 3, candidate: 'adamSmith' });
    expect(fatherCost(state, 'a')).toBeGreaterThan(13);
    const { state: next, events } = run(state, { cheat: 'bells', count: 10 });
    expect(me(next)).toMatchObject({ bells: 50, fatherBells: 13, candidate: 'adamSmith', fathers: [] });
    expect(summary(events)).toBe('Added 10 liberty bells.');
    expect(events).toHaveLength(1);
  });

  it('seats the candidate in the same action once the bells cover his price', () => {
    const state = patch(base(), { candidate: 'jakobFugger', boycotts: ['rum'] });
    const { state: next, events } = run(state, { cheat: 'bells', count: fatherCost(state, 'a') });
    expect(events.map((e) => e.type)).toEqual(['cheatApplied', 'fatherJoined', 'congressConvened']);
    expect(events[1]).toEqual({ type: 'fatherJoined', player: 'a', father: 'jakobFugger', count: 1 });
    expect(me(next)).toMatchObject({ fathers: ['jakobFugger'], fatherBells: 0, candidate: null, bells: fatherCost(state, 'a'), boycotts: [] });
    // and the Congress asks at once whom to work toward next
    expect(me(next).fatherOffer.length).toBeGreaterThan(0);
  });

  it('with no candidate has a human power offered names, as at the opening of a turn', () => {
    const state = base();
    const { state: next, events } = run(state, { cheat: 'bells', count: 5 });
    const turn: CongressEvent[] = [];
    const byTurn = creditBells(state, 'a', 5, turn);
    expect(me(next).fatherOffer).toEqual(me(byTurn).fatherOffer);
    expect(me(next).fatherOffer.length).toBeGreaterThan(0);
    expect(me(next).candidate).toBeNull();
    expect(next.rng).toEqual(byTurn.rng);
    expect(events.slice(1)).toEqual(turn);
    expect(events[1]).toMatchObject({ type: 'congressConvened', player: 'a' });
  });

  it('for a computer power settles on a candidate by itself', () => {
    const { state: next, events } = run(base(), { cheat: 'bells', count: 1 }, 'b');
    expect(next.players[1]?.candidate).not.toBeNull();
    expect(events.map((e) => e.type)).toEqual(['cheatApplied', 'candidateChosen']);
    expect(me(next)).toMatchObject({ bells: 0, fatherBells: 0 });
  });

  it('takes the default count from the table', () => {
    const spec = TREASURY_SPECS.find((s) => s.name === 'bells');
    expect(spec?.build({})).toEqual({ cheat: 'bells', count: CHEATS.bells });
  });
});

describe('bells after the Declaration', () => {
  it('still grows the lifetime count, seeks no Father, and counts toward the intervention', () => {
    const state = atWar(patch(base(), { bells: 900, fatherBells: 4 }), { bells: 100 });
    const { state: next, events } = run(state, { cheat: 'bells', count: 250 });
    expect(me(next)).toMatchObject({ bells: 1150, fatherBells: 4, candidate: null, fatherOffer: [] });
    expect(me(next).revolution).toEqual({ ...REVOLUTION, bells: 350 });
    expect(events.map((e) => e.type)).toEqual(['cheatApplied']);
  });

  it('tells the rebels what it will take, the first time, as the turn code does', () => {
    const state = atWar(base(), { considered: false });
    const { state: next, events } = run(state, { cheat: 'bells', count: 1 });
    expect(events[1]).toEqual({ type: 'interventionConsidered', player: 'a', friend: 'b', bells: interventionBells(state) });
    expect(me(next).revolution).toMatchObject({ bells: 1, considered: true });
  });

  it('begins the intervention and starts the count again on reaching the threshold, exactly as the turn code would', () => {
    const need = interventionBells(base());
    const state = atWar(base(), { bells: need - 10 });
    const short = run(state, { cheat: 'bells', count: 9 });
    expect(short.events.map((e) => e.type)).toEqual(['cheatApplied']);
    expect(me(short.state).revolution).toMatchObject({ bells: need - 1, intervened: false });

    const { state: next, events } = run(state, { cheat: 'bells', count: 10 });
    expect(events.slice(1)).toEqual([{ type: 'interventionBegan', player: 'a', friend: 'b' }]);
    expect(me(next).revolution).toMatchObject({ bells: 0, intervened: true, considered: true });
    const turn: IndependenceEvent[] = [];
    const byTurn = warBells(state, 'a', 10, turn);
    expect(me(next).revolution).toEqual(me(byTurn).revolution);
    expect(events.slice(1)).toEqual(turn);
    expect(me(next).bells).toBe(10);
  });
});

describe('father', () => {
  it('seats him through the Congress: counted, the bells gone, no candidate, no offer, and his arrival felt', () => {
    const state = patch(base(), { fatherBells: 77, candidate: 'adamSmith', fatherOffer: ['pocahontas'], boycotts: ['rum', 'cloth'], fathers: ['peterMinuit'] });
    const { state: next, events } = run(state, { cheat: 'father', father: 'jakobFugger' });
    expect(me(next)).toMatchObject({ fathers: ['peterMinuit', 'jakobFugger'], fatherBells: 0, candidate: null, fatherOffer: [], boycotts: [] });
    expect(events).toEqual([
      { type: 'cheatApplied', player: 'a', summary: 'Seated Jakob Fugger in the Congress.' },
      { type: 'fatherJoined', player: 'a', father: 'jakobFugger', count: 2 },
    ]);
    expect(next.rng).toEqual(state.rng);
  });

  it('brings what a Father brings at once (Brewster clears the pool of servants and criminals)', () => {
    const state = patch(base(), { pool: ['pettyCriminal', 'indenturedServant', 'expertFarmer'] });
    const { state: next } = run(state, { cheat: 'father', father: 'williamBrewster' });
    expect(me(next).pool).not.toContain('pettyCriminal');
    expect(me(next).pool).not.toContain('indenturedServant');
  });

  it('keeps the dice where his arrival left them, whichever dice it threw', () => {
    // Jones's frigate rolls for its crossing on the state's own generator
    const state = base();
    const jones = run(state, { cheat: 'father', father: 'johnPaulJones' });
    const byCongress = join(state, 'a', 'johnPaulJones', createRng(state.rng), []);
    expect(byCongress.rng).not.toEqual(state.rng);
    expect(jones.state.rng).toEqual(byCongress.rng);
    expect(Object.values(jones.state.units).map((u) => u.type)).toEqual(['frigate']);
    expect(jones.events.map((e) => e.type)).toContain('frigateGranted');
    // Pocahontas calms the tribes with the generator the Congress hands her
    const angry: GameState = { ...state, tribes: { sioux: { ...state.tribes['sioux']!, alarm: { a: 60 } } } };
    const rng = createRng(angry.rng);
    const calmed = join(angry, 'a', 'pocahontas', rng, []);
    const cheated = run(angry, { cheat: 'father', father: 'pocahontas' }).state;
    expect(cheated.tribes).toEqual(calmed.tribes);
    expect(cheated.rng).toEqual(rng.state());
  });

  it('is refused if he already sits in this power\'s Congress, though another power may have him', () => {
    const state = patch(patch(base(), { fathers: ['pocahontas'] }), { fathers: ['adamSmith'] }, 'b');
    expect(refusal(state, { cheat: 'father', father: 'pocahontas' })).toEqual({ code: 'cheatTarget', message: 'Pocahontas already sits in the Congress' });
    expect(validateAction(state, cheat({ cheat: 'father', father: 'adamSmith' })).ok).toBe(true);
    expect(validateAction(state, cheat({ cheat: 'father', father: 'adamSmith' }, 'b')).ok).toBe(false);
  });

  it('is refused for a name that is no Father', () => {
    expect(refusal(base(), { cheat: 'father', father: 'napoleon' } as unknown as CheatCommand)).toEqual({ code: 'cheatTarget', message: 'there is no Founding Father "napoleon"' });
  });

  it('can fill the whole Congress, one cheat each', () => {
    let state = base();
    for (const father of FATHER_IDS) state = run(state, { cheat: 'father', father }).state;
    expect(me(state).fathers).toEqual([...FATHER_IDS]);
  });
});

describe('tax', () => {
  it('sets the tax rate', () => {
    const { state, events } = run(patch(base(), { taxRate: 40 }), { cheat: 'tax', percent: 0 });
    expect(me(state).taxRate).toBe(0);
    expect(summary(events)).toBe('Set the tax rate to 0 percent.');
    expect(me(run(state, { cheat: 'tax', percent: MARKET_MODEL.maxTax }).state).taxRate).toBe(MARKET_MODEL.maxTax);
  });

  it('is refused outside 0 to the highest rate there is', () => {
    for (const percent of [-1, MARKET_MODEL.maxTax + 1, 100, 12.5]) {
      expect(refusal(base(), { cheat: 'tax', percent }), String(percent)).toEqual({ code: 'cheatAmount', message: `the tax rate is a whole number from 0 to ${MARKET_MODEL.maxTax}` });
    }
  });
});

describe('boycott lift', () => {
  it('lifts every boycott of the power and no other', () => {
    const state = patch(patch(base(), { boycotts: ['rum', 'muskets'] }), { boycotts: ['cloth'] }, 'b');
    const { state: next, events } = run(state, { cheat: 'boycott' });
    expect(next.players.map((p) => p.boycotts)).toEqual([[], ['cloth']]);
    expect(summary(events)).toBe('Lifted every boycott.');
  });
});

describe('the treasury specs', () => {
  // arguments as the parser would hand them over, by spec and argument name
  const ARGS: Record<string, Record<string, CheatArgValue>> = {
    gold: { amount: { set: true, value: 250 } },
    crosses: { count: 30 },
    bells: { count: 30 },
    father: { father: 'thomasJefferson' },
    tax: { percent: 20 },
    boycott: { lift: 'lift' },
  };

  it('are the six of this group', () => {
    expect(TREASURY_SPECS.map((s) => s.name)).toEqual(['gold', 'crosses', 'bells', 'father', 'tax', 'boycott']);
  });

  it.each(TREASURY_SPECS.map((s) => [s.name, s] as const))('%s builds a command the check accepts', (name, spec) => {
    const args = ARGS[name];
    if (!args) throw new Error(`no test arguments for the cheat "${name}"`);
    expect(Object.keys(args).sort()).toEqual(spec.args.map((a) => a.name).sort());
    const state = base();
    const command = spec.build(args);
    expect(checkCheat(state, 'a', command)).toEqual({ ok: true });
    expect(() => applyAction(state, cheat(command))).not.toThrow();
    // and with every optional argument left out
    const required = Object.fromEntries(spec.args.filter((a) => !a.optional).map((a) => [a.name, args[a.name]]));
    expect(checkCheat(state, 'a', spec.build(required))).toEqual({ ok: true });
  });

  it('fill a number left out from the table', () => {
    const built = Object.fromEntries(TREASURY_SPECS.filter((s) => s.args.every((a) => a.optional)).map((s) => [s.name, s.build({})]));
    expect(built).toEqual({
      gold: { cheat: 'gold', amount: { set: false, value: CHEATS.gold } },
      crosses: { cheat: 'crosses', count: CHEATS.crosses },
      bells: { cheat: 'bells', count: CHEATS.bells },
    });
  });

  it('fail loudly when handed an argument of the wrong kind', () => {
    const spec = TREASURY_SPECS.find((s) => s.name === 'gold');
    expect(() => spec?.build({ amount: 5 })).toThrow(TypeError);
  });
});
