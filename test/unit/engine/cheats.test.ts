import { describe, expect, it } from 'vitest';
import { applyAction, InvalidActionError, validateAction, type Action, type GameEvent } from '../../../src/engine/actions';
import { applyCheat, CHEAT_SPECS, checkCheat, type CheatCommand, type CheatEvent } from '../../../src/engine/cheats';
import type { GameState, Player } from '../../../src/engine/state';
import { deepFreeze } from '../../helpers/freeze';
import { world } from '../../helpers/world';

const base = (): GameState => deepFreeze(world({ rows: ['~..', '...'], players: [{ id: 'a' }, { id: 'b', kind: 'ai' }, { id: 'c', kind: 'ai' }] }));
const of = (state: GameState, id: string): Player => state.players.find((p) => p.id === id) as Player;
const patch = (state: GameState, id: string, change: Partial<Player>): GameState => ({ ...state, players: state.players.map((p) => (p.id === id ? { ...p, ...change } : p)) });
const GOLD: CheatCommand = { cheat: 'gold', amount: { set: false, value: 500 } };
const cheat = (command: CheatCommand, player?: string): Action => (player === undefined ? { type: 'cheat', command } : { type: 'cheat', player, command });
const refusal = (state: GameState, action: Action): { code: string; message: string } => {
  const check = validateAction(state, action);
  if (check.ok) throw new Error('expected a refusal');
  return check.error;
};

describe('the cheat specs', () => {
  it('have unique names, and a line of help and an example each', () => {
    const names = CHEAT_SPECS.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names.slice(0, 7)).toEqual(['gold', 'crosses', 'bells', 'father', 'tax', 'boycott', 'reveal']);
    for (const spec of CHEAT_SPECS) {
      expect(spec.name, spec.name).toMatch(/^[a-z]+$/);
      expect(spec.about.trim().length, spec.name).toBeGreaterThan(0);
      expect(spec.example.trim().length, spec.name).toBeGreaterThan(0);
      // the example is a line of that cheat
      expect(spec.example.split(' ')[0], spec.name).toBe(spec.name);
      const argNames = spec.args.map((a) => a.name);
      expect(new Set(argNames).size, spec.name).toBe(argNames.length);
      // no required argument after an optional one: the line is read left to right
      const firstOptional = spec.args.findIndex((a) => a.optional);
      if (firstOptional >= 0) expect(spec.args.slice(firstOptional).every((a) => a.optional), spec.name).toBe(true);
    }
  });
});

describe('the cheat action', () => {
  it('applies for the current player by default, pushes one cheatApplied event and marks the player', () => {
    const { state, events } = applyAction(base(), cheat(GOLD));
    expect(of(state, 'a').gold).toBe(500);
    expect(events).toEqual([{ type: 'cheatApplied', player: 'a', summary: 'Added 500 gold to the treasury.' }]);
    expect(of(state, 'a').cheated).toBe(true);
    expect(of(state, 'b').cheated).toBeUndefined();
    expect(of(state, 'c').cheated).toBeUndefined();
  });

  it('for another power changes that power and marks both it and the power whose turn it is', () => {
    const { state, events } = applyAction(base(), cheat(GOLD, 'b'));
    expect(of(state, 'a').gold).toBe(0);
    expect(of(state, 'b').gold).toBe(500);
    expect(events).toEqual([{ type: 'cheatApplied', player: 'b', summary: 'Added 500 gold to the treasury.' }]);
    expect(of(state, 'a').cheated).toBe(true);
    expect(of(state, 'b').cheated).toBe(true);
    expect(of(state, 'c').cheated).toBeUndefined();
  });

  it('leaves the marks as they are at a second cheat, and they survive the turn', () => {
    const once = applyAction(base(), cheat(GOLD, 'b')).state;
    const twice = applyAction(once, cheat(GOLD)).state;
    expect(twice.players.map((p) => p.cheated)).toEqual([true, true, undefined]);
    expect(of(twice, 'a')).toEqual({ ...of(once, 'a'), gold: 500 });
    expect(of(twice, 'b')).toBe(of(once, 'b'));
    const later = applyAction(twice, { type: 'endTurn' }).state;
    expect(later.players.map((p) => p.cheated)).toEqual([true, true, undefined]);
  });

  it('writes nothing but plain JSON', () => {
    const { state } = applyAction(base(), cheat(GOLD, 'b'));
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  it('is refused once the game has ended', () => {
    const over: GameState = { ...base(), over: { reason: 'retiredEarly', turn: 0, player: 'a' } };
    expect(refusal(over, cheat(GOLD))).toEqual({ code: 'gameOver', message: 'the game has ended' });
    expect(() => applyAction(over, cheat(GOLD))).toThrow(InvalidActionError);
  });

  it('is refused for anyone who is not a European power still in the New World', () => {
    const state = base();
    for (const who of ['nobody', 'tribe:sioux', '']) {
      const error = refusal(state, cheat(GOLD, who));
      expect(error.code, who).toBe('cheatPower');
      expect(error.message, who).toContain('not a power in the New World');
    }
    expect(refusal(patch(state, 'b', { withdrawn: true }), cheat(GOLD, 'b')).code).toBe('cheatPower');
    // the place the Crown's army holds in the table is no power either
    expect(refusal({ ...state, crownPlayer: 'c' }, cheat(GOLD, 'c')).code).toBe('cheatPower');
    expect(validateAction(patch(state, 'b', { withdrawn: true }), cheat(GOLD, 'c')).ok).toBe(true);
  });

  it('is refused when the command is none there is', () => {
    const state = base();
    const unknown = { cheat: 'omnipotence' } as unknown as CheatCommand;
    expect(refusal(state, cheat(unknown))).toEqual({ code: 'cheatUnknown', message: 'there is no cheat "omnipotence"' });
    expect(refusal(state, cheat(null as unknown as CheatCommand)).code).toBe('cheatUnknown');
    expect(() => applyAction(state, cheat(unknown))).toThrow(InvalidActionError);
  });

  it('is allowed while a question is on the table', () => {
    const asked = patch(base(), 'a', { fatherOffer: ['adamSmith', 'pocahontas'] });
    const { state } = applyAction(asked, cheat(GOLD));
    expect(of(state, 'a').fatherOffer).toEqual(['adamSmith', 'pocahontas']);
    expect(of(state, 'a').gold).toBe(500);
  });
});

describe('checkCheat and applyCheat', () => {
  it('agree with the action: the same check, the same state, the same events', () => {
    const state = base();
    expect(checkCheat(state, 'b', GOLD)).toEqual({ ok: true });
    expect(checkCheat(state, 'x', GOLD).ok).toBe(false);
    const events: CheatEvent[] = [];
    const direct = applyCheat(state, 'b', GOLD, events);
    const acted = applyAction(state, cheat(GOLD, 'b'));
    expect(direct).toEqual(acted.state);
    expect(events as GameEvent[]).toEqual(acted.events);
  });
});
