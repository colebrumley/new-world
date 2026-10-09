import { describe, expect, it } from 'vitest';
import { CAPITAL_DEMAND_DOUBLE, CAPITAL_DEMAND_HALF_MORE, CAPITAL_SUPPLY_DOUBLE, CENSUS_COLD, CENSUS_CROPS, CENSUS_FOOD, CENSUS_HEAT, CENSUS_ORE, FUR_FORESTS, NATIVE_ECONOMY } from '../../../src/engine/data/native-economy';
import { GOOD_IDS } from '../../../src/engine/data/goods';
import { settlementPopulation } from '../../../src/engine/data/tribes';
import { chiefProduct, landCensus, settlementEconomy, wantedGoods } from '../../../src/engine/native-economy';
import type { GameState, Settlement, TribeState } from '../../../src/engine/state';
import { setTile, withColony, world } from '../../helpers/world';

const village = (tribe: Settlement['tribe'], extra: Partial<Settlement> = {}): Settlement => ({
  id: 'v', tribe, x: 3, y: 3, capital: false, population: settlementPopulation(tribe, false).start, growth: 0, taught: false, tributePaid: false,
  alarm: {}, mission: null, scouted: [], lastBought: null, lastSold: null, haggleMemory: null, ...extra,
});
const record = (extra: Partial<TribeState> = {}): TribeState => ({ alarm: {}, goodwill: {}, met: [], muskets: 0, horses: 0, breeding: 0, silver: 0, peace: [], landSold: 0, grudge: [], joinedCrown: false, visited: {}, stock: {}, ...extra });
/** A 7 x 7 map whose inner 5 x 5 block is all one kind of ground, with the settlement in the middle. */
function country(glyph: string, tribe: Settlement['tribe'], extra: Partial<Settlement> = {}, tribeExtra: Partial<TribeState> = {}): GameState {
  const rows = Array.from({ length: 7 }, (_, y) => (y === 0 || y === 6 ? '~~~~~~~' : `~${glyph.repeat(5)}~`));
  const s = world({ rows });
  return { ...s, settlements: { v: village(tribe, extra) }, tribes: { [tribe]: record(tribeExtra) } };
}
const econ = (s: GameState): ReturnType<typeof settlementEconomy> => settlementEconomy(s, s.settlements['v']!);

describe('native economy tables', () => {
  it('match the snapshot', () => {
    expect({ NATIVE_ECONOMY, CENSUS_FOOD, CENSUS_CROPS, CENSUS_ORE, CENSUS_COLD, CENSUS_HEAT, FUR_FORESTS, CAPITAL_DEMAND_DOUBLE, CAPITAL_DEMAND_HALF_MORE, CAPITAL_SUPPLY_DOUBLE }).toMatchSnapshot();
  });
});

describe('the land census', () => {
  it('tallies open ground by kind', () => {
    const s = country('.', 'sioux'); // plains
    expect(landCensus(s, s.settlements['v']!)).toEqual({ food: 125, sugar: 0, tobacco: 0, cotton: 25, ore: 0, hills: 0, mountains: 0, furRich: 0, furPoor: 0, cold: 50, heat: 0 });
  });

  it('counts forests for fur and a little food, and hills and mountains for ore', () => {
    let s = country('f', 'sioux'); // forested plains: mixed forest
    expect(landCensus(s, s.settlements['v']!)).toMatchObject({ food: 25, furRich: 25, furPoor: 0, cold: 50, cotton: 0 });
    s = setTile(setTile(country('.', 'sioux'), 1, 1, { relief: 'hills' }), 2, 1, { relief: 'mountains' });
    expect(landCensus(s, s.settlements['v']!)).toMatchObject({ hills: 1, mountains: 1, food: 115 });
  });

  it('counts the sea by the tribe\'s skill and leaves out tiles a colony is working', () => {
    const coast = (tribe: Settlement['tribe']): number => {
      let s = country('.', tribe);
      for (let x = 1; x <= 5; x++) s = setTile(s, x, 1, { base: 'ocean' });
      return landCensus(s, s.settlements['v']!).food;
    };
    // five ocean tiles: camp people gain 2 x floor(5/3), the Inca 2 x floor(20/3)
    expect(coast('sioux')).toBe(100 + 2);
    expect(coast('inca')).toBe(100 + 12);
    const base = country('.', 'sioux');
    const farmed = withColony(base, { id: 'col', x: 5, y: 5, name: 'C', colonists: [{ id: 'w', profession: 'freeColonist', job: { kind: 'field', dx: -1, dy: -1, good: 'food' }, turns: 0 }] });
    expect(landCensus(farmed, farmed.settlements['v']!).food).toBe(120);
  });
});

describe('demand and supply', () => {
  it('a camp on the plains has food and cotton to spare and wants tobacco, cloth and trade goods', () => {
    const { demand, supply } = econ(country('.', 'sioux'));
    // P = 4, t = 0: food (0 + 4) x 125 / 7 = 71, wanted 0
    expect(supply.food).toBe(71);
    expect(demand.food).toBe(0);
    expect(supply.cotton).toBeGreaterThan(0);
    expect(supply.ore).toBe(0);
    expect(supply.silver).toBe(0);
    expect(demand.tools).toBe(0);
    // tobacco (6 - 0) x 4 + 2 x 50 + 5 = 129 -> capped at 50
    expect(demand.tobacco).toBe(50);
    expect(demand.tradeGoods).toBe(2 * 7 + 8);
    expect(demand.muskets).toBe(28);
    expect(demand.horses).toBe(36);
    for (const g of GOOD_IDS) {
      expect(demand[g], g).toBeGreaterThanOrEqual(0);
      expect(demand[g], g).toBeLessThanOrEqual(50);
      expect(supply[g], g).toBeGreaterThanOrEqual(0);
    }
  });

  it('a settlement with no food of its own wants it badly', () => {
    const { demand, supply } = econ(country('h', 'sioux')); // all hills
    expect(supply.food).toBe(0);
    expect(demand.food).toBe(50);
    expect(supply.ore).toBe(0); // camps mine nothing
    expect(econ(country('h', 'cherokee')).supply.ore).toBeGreaterThan(40);
  });

  it('only the city peoples have silver, the Inca most of all', () => {
    const hills = (tribe: Settlement['tribe'], silver = 0): number => {
      const s = setTile(setTile(country('.', tribe, {}, { silver }), 1, 1, { relief: 'mountains' }), 2, 1, { relief: 'mountains' });
      return econ(s).supply.silver;
    };
    expect(hills('cherokee')).toBe(0);
    expect(hills('aztec')).toBe(8);
    expect(hills('inca')).toBe(16);
    expect(hills('aztec', 12)).toBe(20);
  });

  it('armed and mounted tribes want fewer muskets and horses', () => {
    const d = econ(country('.', 'sioux', {}, { muskets: 3, horses: 9 })).demand;
    expect(d.muskets).toBe(16);
    expect(d.horses).toBe(0);
  });

  it('a capital wants more and has more of the made goods', () => {
    const plain = econ(country('.', 'aztec'));
    const capital = econ(country('.', 'aztec', { capital: true }));
    expect(capital.supply.cloth).toBeGreaterThan(plain.supply.cloth);
    expect(capital.demand.tradeGoods).toBeGreaterThan(plain.demand.tradeGoods);
  });

  it('remembers what the tribe has been sold and has sold', () => {
    const fresh = econ(country('.', 'sioux'));
    const glutted = econ(country('.', 'sioux', {}, { stock: { tradeGoods: 250 } }));
    expect(glutted.demand.tradeGoods).toBe(fresh.demand.tradeGoods - 6);
    const drained = econ(country('.', 'sioux', {}, { stock: { cotton: -250 } }));
    expect(drained.supply.cotton).toBeLessThan(fresh.supply.cotton);
  });

  it('names the three goods most wanted, skipping the last bought and last sold', () => {
    const s = country('.', 'sioux');
    const all = wantedGoods(s, s.settlements['v']!);
    expect(all).toHaveLength(3);
    const { demand } = econ(s);
    expect(demand[all[0]!]).toBeGreaterThanOrEqual(demand[all[2]!]);
    const again = country('.', 'sioux', { lastBought: all[0]!, lastSold: all[1]! });
    const next = wantedGoods(again, again.settlements['v']!);
    expect(next).not.toContain(all[0]);
    expect(next).not.toContain(all[1]);
  });

  it('knows what it has most of', () => {
    const s = country('.', 'sioux');
    expect(chiefProduct(s, s.settlements['v']!)).toEqual({ good: 'food', supply: 71 });
  });
});
