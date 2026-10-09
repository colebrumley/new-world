import { describe, expect, it } from 'vitest';
import { CROSSES } from '../../../src/engine/data/crosses';
import { colonyProduction, colonyTurn } from '../../../src/engine/economy';
import type { Colonist, Colony, GameState } from '../../../src/engine/state';
import { withColony, world } from '../../helpers/world';

const ROWS = ['~~~~~', '~...~', '~...~', '~...~', '~~~~~'];
const preachers = (n: number, profession: Colonist['profession'] = 'freeColonist'): Colonist[] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, profession, job: { kind: 'work', trade: 'preacher' } as const, turns: 0 }));
function town(buildings: string[], colonists: Colonist[] = [{ id: 'i', profession: 'freeColonist', job: { kind: 'idle' }, turns: 0 }], fathers: string[] = [], extra: Partial<Colony> = {}): GameState {
  const s = world({ rows: ROWS, players: [{ id: 'a', fathers }, { id: 'b' }] });
  return withColony(s, { id: 'col', x: 2, y: 2, colonists, buildings, goods: { food: 100 }, ...extra });
}
const crosses = (s: GameState): number => colonyProduction(s, s.colonies['col'] as Colony).produced.crosses;

describe('crosses', () => {
  it('a colony makes 1 by itself, 2 with a Church, 3 with a Cathedral', () => {
    expect(CROSSES).toMatchSnapshot();
    expect(crosses(town([]))).toBe(1);
    expect(crosses(town(['church']))).toBe(2);
    expect(crosses(town(['church', 'cathedral']))).toBe(3);
  });

  it('preachers add 3 each in a Church (Firebrand 6) and twice that in a Cathedral', () => {
    expect(crosses(town(['church'], preachers(1)))).toBe(2 + 3);
    expect(crosses(town(['church'], preachers(3)))).toBe(2 + 9);
    expect(crosses(town(['church'], preachers(1, 'firebrandPreacher')))).toBe(2 + 6);
    expect(crosses(town(['church'], preachers(1, 'indenturedServant')))).toBe(2 + 2);
    expect(crosses(town(['church'], preachers(1, 'pettyCriminal')))).toBe(2 + 1);
    expect(crosses(town(['church', 'cathedral'], preachers(1)))).toBe(3 + 6);
    expect(crosses(town(['church', 'cathedral'], preachers(1, 'firebrandPreacher')))).toBe(3 + 12);
  });

  it('William Penn adds half to each preacher, not to the flat crosses', () => {
    expect(crosses(town([], undefined, ['williamPenn']))).toBe(1);
    expect(crosses(town(['church'], undefined, ['williamPenn']))).toBe(2);
    expect(crosses(town(['church'], preachers(1), ['williamPenn']))).toBe(2 + 4);
    expect(crosses(town(['church'], preachers(2, 'firebrandPreacher'), ['williamPenn']))).toBe(2 + 18);
    expect(crosses(town(['church', 'cathedral'], preachers(1, 'firebrandPreacher'), ['williamPenn']))).toBe(3 + 18);
  });

  it('Sons of Liberty and Tories move preachers but not the flat crosses', () => {
    const keen = town(['church'], preachers(1), [], { solLevel: 2, sol: { n: 100, d: 100 } });
    expect(crosses(keen)).toBe(2 + 5);
    const idle = town(['church'], undefined, [], { solLevel: 2, sol: { n: 100, d: 100 } });
    expect(crosses(idle)).toBe(2);
  });

  it("are added to the power's running total each turn", () => {
    let s = town(['church'], preachers(1));
    s = withColony(s, { id: 'second', x: 2, y: 0 + 1, buildings: [], goods: { food: 50 } });
    s = colonyTurn(colonyTurn(s, 'col', []), 'second', []);
    expect(s.players[0]?.crosses).toBe(5 + 1);
    expect(s.players[1]?.crosses).toBe(0);
  });
});
