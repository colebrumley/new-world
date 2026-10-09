import { describe, expect, it } from 'vitest';
import { applyAction, validateAction, type Action, type GameEvent } from '../../../src/engine/actions';
import { firstTurnOfYear } from '../../../src/engine/calendar';
import { TAX, TAX_BANDS } from '../../../src/engine/data/tax';
import { solPercent } from '../../../src/engine/liberty';
import type { Colony, GameState } from '../../../src/engine/state';
import { answerTax, changeTax, liftAllBoycotts, partyCandidate, taxEvent, taxPeriod, type TaxEvent } from '../../../src/engine/tax';
import { createRng } from '../../../src/engine/rng';
import { withColony, world } from '../../helpers/world';

// One colony on the coast (a port), one inland.
const ROWS = ['~~~~~~~~', '~~.....~', '~~.....~', '~~.....~', '~~~~~~~~'];
interface Spec { turn?: number; seed?: number; tax?: number; gold?: number; difficulty?: GameState['difficulty']; ai?: boolean; goods?: Colony['goods']; fathers?: string[]; colonies?: boolean; weddings?: number }
function realm(spec: Spec = {}): GameState {
  const s = world({
    rows: ROWS, seed: spec.seed ?? 1, difficulty: spec.difficulty ?? 'conquistador',
    players: [{ id: 'a', kind: spec.ai ? 'ai' : 'human', taxRate: spec.tax ?? 10, fathers: spec.fathers ?? [] }, { id: 'b', kind: 'ai' }],
  });
  let next: GameState = { ...s, turn: spec.turn ?? 36, players: s.players.map((p) => (p.id === 'a' ? { ...p, gold: spec.gold ?? 0, royalWeddings: spec.weddings ?? 0 } : p)) };
  if (spec.colonies === false) return next;
  next = withColony(next, { id: 'port', x: 2, y: 2, name: 'Boston', goods: spec.goods ?? { food: 50, rum: 80, furs: 30 } });
  return withColony(next, { id: 'inland', x: 5, y: 2, name: 'Concord', goods: { food: 50, rum: 300, cloth: 90 } });
}
const fire = (s: GameState): { state: GameState; events: TaxEvent[] } => {
  const events: TaxEvent[] = [];
  return { state: taxEvent(s, 'a', events), events };
};
const code = (s: GameState, a: Action): string => {
  const v = validateAction(s, a);
  return v.ok ? 'ok' : v.error.code;
};
const me = (s: GameState) => s.players[0]!;

describe('when the King reviews the tax', () => {
  it('every 18 turns before 1600, 15 after, 12 after 1700 and 9 after 1750, two fewer per harder level', () => {
    expect({ TAX, TAX_BANDS: TAX_BANDS.map((b) => ({ ...b, under: String(b.under) })) }).toMatchSnapshot();
    const at = (year: number, difficulty: GameState['difficulty'] = 'conquistador'): number => taxPeriod(realm({ turn: firstTurnOfYear(year), difficulty }));
    expect([at(1550), at(1650), at(1720), at(1760)]).toEqual([18, 15, 12, 9]);
    expect([at(1550, 'discoverer'), at(1550, 'explorer'), at(1550, 'governor'), at(1550, 'viceroy')]).toEqual([22, 20, 16, 14]);
    expect(at(1760, 'viceroy')).toBe(5);
  });

  it('only on those turns, from turn 30 on, for a human power that holds a colony and is not at war', () => {
    expect(fire(realm({ turn: 36 })).events.length).toBeGreaterThan(0);
    expect(fire(realm({ turn: 37 })).events).toEqual([]);
    expect(fire(realm({ turn: 18 })).events).toEqual([]);
    expect(fire(realm({ turn: 36, ai: true })).events).toEqual([]);
    expect(fire(realm({ turn: 36, colonies: false })).events).toEqual([]);
    const war = realm({ turn: 36 });
    expect(fire({ ...war, players: war.players.map((p) => ({ ...p, atWar: true })) }).events).toEqual([]);
  });

  it('usually raises it: by 1 for a wedding, 2 for a war, 3-4 or 5-8 for the Acts; sometimes lowers it by 2-5', () => {
    const seen: Record<string, number[]> = {};
    for (let seed = 1; seed <= 600; seed++) {
      const r = fire(realm({ seed, tax: 20 }));
      const change = r.events.find((e) => e.type === 'taxChanged');
      if (!change || change.type !== 'taxChanged') continue;
      (seen[change.reason] ??= []).push(change.to - change.from);
      expect(me(r.state).taxRate).toBe(change.to);
    }
    const range = (reason: string): number[] => [Math.min(...(seen[reason] ?? [])), Math.max(...(seen[reason] ?? []))];
    expect(range('victory')[0]).toBeGreaterThanOrEqual(-5);
    expect(range('victory')[1]).toBeLessThanOrEqual(-2);
    expect(range('wedding')).toEqual([1, 1]);
    expect(range('war')).toEqual([2, 2]);
    // the wedding band is the widest, the cut the rarest
    expect(seen['wedding']!.length).toBeGreaterThan(seen['war']!.length);
    expect(seen['wedding']!.length).toBeGreaterThan(seen['victory']?.length ?? 0);
  });

  it('a full treasury pushes the roll toward the heavier Acts', () => {
    const acts = (gold: number): number => {
      let n = 0;
      for (let seed = 1; seed <= 300; seed++) {
        const change = fire(realm({ seed, gold, tax: 20 })).events.find((e) => e.type === 'taxChanged');
        if (change?.type === 'taxChanged' && (change.reason === 'navigationAct' || change.reason === 'stampAct')) n++;
      }
      return n;
    };
    expect(acts(60000)).toBeGreaterThan(acts(0) + 100);
  });

  it('names the wedding by number and the enemy by name, never the same enemy twice running', () => {
    let s = realm({ weddings: 2 });
    const names = new Set<string>();
    let last = '';
    for (let i = 0; i < 400; i++) {
      const r = fire({ ...s, rng: createRng(i + 1).state() });
      const change = r.events.find((e) => e.type === 'taxChanged');
      if (change?.type === 'taxChanged' && change.reason === 'war') {
        expect(change.detail).not.toBe(last);
        last = change.detail;
        names.add(change.detail);
        s = { ...s, players: r.state.players.map((p) => ({ ...p, taxRate: 10, pendingTax: null })) };
      }
      if (change?.type === 'taxChanged' && change.reason === 'wedding') expect(change.detail).toMatch(/^\d+(st|nd|rd|th)$/);
    }
    expect(names.size).toBe(8);
    const worn = fire(realm({ weddings: 30, seed: 3 }));
    expect(worn.events.some((e) => e.type === 'taxChanged' && e.reason === 'wedding')).toBe(false);
  });

  it('never passes 75% and never goes below nil', () => {
    const top = changeTax(realm({ tax: 73 }), 'a', 8, 'stampAct', '', createRng(1), []);
    expect(me(top).taxRate).toBe(75);
    expect(me(changeTax(realm({ tax: 75 }), 'a', 5, 'stampAct', '', createRng(1), [])).taxRate).toBe(75);
    expect(me(changeTax(realm({ tax: 3 }), 'a', -5, 'victory', '', createRng(1), [])).taxRate).toBe(0);
    const events: TaxEvent[] = [];
    changeTax(realm({ tax: 0 }), 'a', -5, 'victory', '', createRng(1), events);
    expect(events).toEqual([]);
  });

  it('runs at the start of the power\'s turn', () => {
    const s = realm({ turn: 35 });
    const r = applyAction(applyAction(s, { type: 'endTurn' }).state, { type: 'endTurn' });
    expect(r.state.turn).toBe(36);
    expect(r.events.some((e: GameEvent) => e.type === 'taxChanged')).toBe(true);
  });
});

describe('the party', () => {
  const raised = (spec: Spec = {}): { state: GameState; events: TaxEvent[] } => {
    const events: TaxEvent[] = [];
    return { state: changeTax(realm(spec), 'a', 4, 'navigationAct', '', createRng(spec.seed ?? 1), events), events };
  };

  it('is offered over a good held in a port colony, in the colony holding most of it', () => {
    const r = raised();
    const pending = me(r.state).pendingTax!;
    expect(pending.increase).toBe(4);
    expect(pending.colonyId).toBe('port'); // Concord has more rum, but it is not a port
    expect(['food', 'rum', 'furs']).toContain(pending.good);
    expect(r.events.map((e) => e.type)).toEqual(['taxChanged', 'partyOffered']);
  });

  it('favours goods the power trades most, counting food and tools at half and horses and muskets at a quarter', () => {
    const s = realm({ goods: { food: 100, rum: 100, muskets: 100 } });
    const traded = { ...s.market.powers['a']!, netSold: { ...s.market.powers['a']!.netSold, rum: 2000, food: 2000, muskets: 2000 } };
    const market = { ...s.market, powers: { ...s.market.powers, a: traded } };
    const picks: Record<string, number> = {};
    for (let seed = 1; seed <= 700; seed++) {
      const pick = partyCandidate({ ...s, market }, me(s), createRng(seed));
      picks[pick!.good] = (picks[pick!.good] ?? 0) + 1;
    }
    // weights 20 : 10 : 5
    expect(picks['rum']).toBeGreaterThan(picks['food']! * 1.5);
    expect(picks['food']).toBeGreaterThan(picks['muskets']! * 1.4);
  });

  it('is not offered with no port stock, to an AI, or for a tax cut', () => {
    expect(me(raised({ goods: {} }).state).pendingTax).toBeNull();
    expect(me(raised({ ai: true }).state).pendingTax).toBeNull();
    const events: TaxEvent[] = [];
    const cut = changeTax(realm({ tax: 20 }), 'a', -3, 'victory', '', createRng(1), events);
    expect(me(cut).pendingTax).toBeNull();
    expect(partyCandidate(realm({ colonies: false }), me(realm({ colonies: false })), createRng(1))).toBeNull();
  });

  it('accepting leaves the new rate in place', () => {
    const r = raised();
    expect(code(r.state, { type: 'answerTax', party: false })).toBe('ok');
    const after = applyAction(r.state, { type: 'answerTax', party: false }).state;
    expect(me(after)).toMatchObject({ taxRate: 14, pendingTax: null, boycotts: [] });
    expect(code(after, { type: 'answerTax', party: false })).toBe('noTaxPending');
  });

  it('holding it undoes the rise, dumps up to 100 of the good, rouses the colony and brings a boycott', () => {
    const start = raised({ goods: { food: 50, rum: 80 }, seed: 5 });
    const pending = me(start.state).pendingTax!;
    const before = start.state.colonies['port']!;
    const events: TaxEvent[] = [];
    const after = answerTax(start.state, 'a', true, events);
    const had = before.goods[pending.good] ?? 0;
    expect(me(after)).toMatchObject({ taxRate: 10, pendingTax: null, boycotts: [pending.good] });
    expect(after.colonies['port']!.goods[pending.good] ?? 0).toBe(Math.max(0, had - 100));
    expect(after.colonies['port']!.sol.n).toBe(before.sol.n + Math.min(100, had));
    expect(solPercent(after, after.colonies['port']!)).toBeGreaterThan(solPercent(start.state, before));
    expect(events).toEqual([{ type: 'partyHeld', player: 'a', colonyId: 'port', good: pending.good, destroyed: Math.min(100, had), taxRate: 10 }]);
  });

  it('a rise left unanswered when the turn ends is taken as accepted', () => {
    const r = raised();
    const ended = applyAction(r.state, { type: 'endTurn' }).state;
    expect(me(ended)).toMatchObject({ taxRate: 14, pendingTax: null });
  });

  it('a boycotted good is not offered again', () => {
    const s = realm({ goods: { rum: 80 } });
    const boycotting = { ...s, players: s.players.map((p) => (p.id === 'a' ? { ...p, boycotts: ['rum' as const] } : p)) };
    expect(partyCandidate(boycotting, me(boycotting), createRng(1))).toBeNull();
  });
});

describe('Fugger', () => {
  it('lifts every boycott at no charge', () => {
    const s = realm();
    const boycotting = { ...s, players: s.players.map((p) => (p.id === 'a' ? { ...p, gold: 5, boycotts: ['rum' as const, 'furs' as const] } : p)) };
    expect(me(liftAllBoycotts(boycotting, 'a'))).toMatchObject({ boycotts: [], gold: 5 });
    expect(liftAllBoycotts(boycotting, 'b').players[0]?.boycotts).toEqual(['rum', 'furs']);
  });
});
