import { describe, expect, it } from 'vitest';
import { RESOURCE_BONUS, RESOURCE_IDS, RESOURCE_TERRAINS } from '../../../src/engine/data/resources';
import { RAW_GOODS, TERRAIN_IDS, baseYield, type RawGood } from '../../../src/engine/data/terrain';
import { CENTER_TILE, DEPLETION, YIELD_RULES } from '../../../src/engine/data/yields';
import { createGame } from '../../../src/engine/game';
import { createRng } from '../../../src/engine/rng';
import { makeTile, terrainOf, type Tile } from '../../../src/engine/tile';
import {
  colonyCenterYield, countWaterNeighbors, depleteTile, depletionWeight, tickDepletion, tileYield, type OutdoorWorker,
} from '../../../src/engine/yields';

const expert = (good: RawGood): OutdoorWorker => ({ expertGood: good, convert: false });
const convert: OutdoorWorker = { expertGood: null, convert: true };
const plains = makeTile({ base: 'plains' });
const mixed = makeTile({ base: 'plains', forest: true });
const savannah = makeTile({ base: 'savannah' });
const hills = makeTile({ base: 'plains', relief: 'hills' });
const mountains = makeTile({ base: 'plains', relief: 'mountains' });
const ocean = makeTile();
const COAST = { waterNeighbors: 5 };
const OPEN_SEA = { waterNeighbors: 7 };

// One tile per terrain row, for the base-yield sweep.
const SAMPLE: Record<string, Tile> = {
  tundra: makeTile({ base: 'tundra' }), desert: makeTile({ base: 'desert' }), plains, prairie: makeTile({ base: 'prairie' }),
  grassland: makeTile({ base: 'grassland' }), savannah, marsh: makeTile({ base: 'marsh' }), swamp: makeTile({ base: 'swamp' }),
  boreal: makeTile({ base: 'tundra', forest: true }), scrub: makeTile({ base: 'desert', forest: true }), mixed,
  broadleaf: makeTile({ base: 'prairie', forest: true }), conifer: makeTile({ base: 'grassland', forest: true }),
  tropical: makeTile({ base: 'savannah', forest: true }), wetland: makeTile({ base: 'marsh', forest: true }),
  rain: makeTile({ base: 'swamp', forest: true }), arctic: makeTile({ base: 'arctic' }), hills, mountains,
};

describe('rule tables', () => {
  it('match their snapshots', () => {
    expect({ YIELD_RULES, CENTER_TILE, DEPLETION, RESOURCE_TERRAINS, RESOURCE_BONUS }).toMatchSnapshot();
  });

  it('place every resource on real terrain rows and boost only goods', () => {
    for (const id of RESOURCE_IDS) {
      expect(RESOURCE_TERRAINS[id].length).toBeGreaterThan(0);
      for (const t of RESOURCE_TERRAINS[id]) expect(TERRAIN_IDS).toContain(t);
      for (const g of Object.keys(RESOURCE_BONUS[id])) expect(RAW_GOODS).toContain(g);
    }
  });
});

describe('tileYield: base', () => {
  it('equals the adjusted table value on bare land for a free colonist (silver aside)', () => {
    for (const [id, tile] of Object.entries(SAMPLE)) {
      expect(terrainOf(tile)).toBe(id);
      for (const good of RAW_GOODS) {
        if (good === 'silver' || good === 'fish') continue;
        expect(tileYield(tile, good), `${id} ${good}`).toBe(baseYield(terrainOf(tile), good));
      }
    }
    expect(tileYield(plains, 'food')).toBe(5);
    expect(tileYield(mixed, 'lumber')).toBe(6);
    expect(tileYield(hills, 'food')).toBe(2);
    expect(tileYield(hills, 'ore')).toBe(4);
  });

  it('treats servants, criminals and off-trade experts like free colonists', () => {
    expect(tileYield(plains, 'food', expert('ore'))).toBe(5);
    expect(tileYield(mixed, 'lumber', expert('food'))).toBe(6);
  });
});

describe('tileYield: plow, road, river', () => {
  it('plow adds 1 to food and the three crops only', () => {
    const t = { ...savannah, plowed: true };
    expect(tileYield(t, 'food')).toBe(5);
    expect(tileYield(t, 'sugar')).toBe(4);
    expect(tileYield({ ...plains, plowed: true }, 'cotton')).toBe(3);
    expect(tileYield({ ...plains, plowed: true }, 'ore')).toBe(1);
  });

  it('road adds 2 to lumber and furs, 1 to ore, nothing to crops', () => {
    const t = { ...mixed, road: true };
    expect(tileYield(t, 'lumber')).toBe(8);
    expect(tileYield(t, 'furs')).toBe(5);
    expect(tileYield({ ...hills, road: true }, 'ore')).toBe(5);
    expect(tileYield({ ...plains, road: true }, 'food')).toBe(5);
    expect(tileYield({ ...plains, road: true }, 'cotton')).toBe(2);
  });

  it('minor river: +1 food, crops and ore, +2 lumber and furs', () => {
    const t = { ...mixed, river: 'minor' as const };
    expect(tileYield({ ...plains, river: 'minor' }, 'food')).toBe(6);
    expect(tileYield({ ...plains, river: 'minor' }, 'cotton')).toBe(3);
    expect(tileYield({ ...hills, river: 'minor' }, 'ore')).toBe(5);
    expect(tileYield(t, 'lumber')).toBe(8);
    expect(tileYield(t, 'furs')).toBe(5);
  });

  it('major river doubles the river step only when no other step applied', () => {
    expect(tileYield({ ...plains, river: 'major' }, 'food')).toBe(6); // food step already taken
    expect(tileYield({ ...plains, river: 'major' }, 'cotton')).toBe(4);
    expect(tileYield({ ...plains, river: 'major', plowed: true }, 'cotton')).toBe(4); // plow +1, river +1
    expect(tileYield({ ...mixed, river: 'major' }, 'lumber')).toBe(10);
    expect(tileYield({ ...mixed, river: 'major', road: true }, 'lumber')).toBe(10); // road +2, river +2
    expect(tileYield({ ...mixed, river: 'major' }, 'furs')).toBe(7); // (3+2) + 2
    expect(tileYield({ ...hills, river: 'major' }, 'ore')).toBe(6);
    expect(tileYield({ ...hills, river: 'major', road: true }, 'ore')).toBe(6);
  });

  it('gives nothing to goods the terrain does not produce', () => {
    expect(tileYield({ ...plains, river: 'major', road: true, plowed: true }, 'sugar')).toBe(0);
    expect(tileYield({ ...makeTile({ base: 'arctic' }), plowed: true, river: 'minor' }, 'food')).toBe(0);
  });
});

describe('tileYield: experts', () => {
  it('farmer +2, planters and the rest x2', () => {
    expect(tileYield(plains, 'food', expert('food'))).toBe(7);
    expect(tileYield(savannah, 'sugar', expert('sugar'))).toBe(6);
    expect(tileYield(mixed, 'furs', expert('furs'))).toBe(6);
    expect(tileYield(mixed, 'lumber', expert('lumber'))).toBe(12);
    expect(tileYield(hills, 'ore', expert('ore'))).toBe(8);
  });

  it('doubles the improvement step for non-food experts, but lumber gets the same +2 as anyone', () => {
    expect(tileYield({ ...savannah, plowed: true }, 'sugar', expert('sugar'))).toBe(8);
    expect(tileYield({ ...hills, road: true }, 'ore', expert('ore'))).toBe(10);
    expect(tileYield({ ...mixed, road: true }, 'lumber', expert('lumber'))).toBe(14);
    expect(tileYield({ ...mixed, road: true }, 'furs', expert('furs'))).toBe(10); // (3+1)x2 + 2
    expect(tileYield({ ...plains, plowed: true }, 'food', expert('food'))).toBe(8);
  });
});

describe('tileYield: resources', () => {
  it('food resources add 2 (expert 4)', () => {
    const wheat = { ...plains, resource: 'wheat' as const };
    expect(tileYield(wheat, 'food')).toBe(7);
    expect(tileYield(wheat, 'food', expert('food'))).toBe(11);
    expect(tileYield(makeTile({ base: 'desert', resource: 'oasis' }), 'food')).toBe(4);
    const game = makeTile({ base: 'tundra', forest: true, resource: 'game' });
    expect(tileYield(game, 'food')).toBe(4);
    expect(tileYield(game, 'furs')).toBe(5);
    expect(tileYield(game, 'furs', expert('furs'))).toBe(10);
  });

  it('prime crops double before plow and river are added', () => {
    const prime = { ...savannah, resource: 'primeSugar' as const, plowed: true };
    expect(tileYield(prime, 'sugar')).toBe(7);
    expect(tileYield(prime, 'sugar', expert('sugar'))).toBe(14);
    expect(tileYield(makeTile({ base: 'prairie', resource: 'primeCotton' }), 'cotton')).toBe(6);
    expect(tileYield(makeTile({ base: 'grassland', resource: 'primeTobacco' }), 'tobacco')).toBe(6);
    expect(tileYield(prime, 'food')).toBe(5);
  });

  it('beaver, timber, ore and minerals', () => {
    expect(tileYield({ ...mixed, resource: 'beaver' }, 'furs')).toBe(6);
    expect(tileYield({ ...mixed, resource: 'beaver' }, 'furs', expert('furs'))).toBe(12);
    const timber = makeTile({ base: 'grassland', forest: true, resource: 'primeTimber' });
    expect(tileYield(timber, 'lumber')).toBe(10);
    expect(tileYield(timber, 'lumber', expert('lumber'))).toBe(20);
    expect(tileYield({ ...hills, resource: 'oreDeposit' }, 'ore')).toBe(6);
    expect(tileYield({ ...hills, resource: 'oreDeposit' }, 'ore', expert('ore'))).toBe(12);
    const minerals = makeTile({ base: 'tundra', resource: 'minerals' });
    expect(tileYield(minerals, 'ore')).toBe(5);
    expect(tileYield(minerals, 'silver')).toBe(1);
    expect(tileYield(minerals, 'silver', expert('silver'))).toBe(2);
  });

  it('silver needs a deposit; bare mountains give 1 only with a road or an expert', () => {
    expect(tileYield(mountains, 'silver')).toBe(0);
    expect(tileYield({ ...mountains, road: true }, 'silver')).toBe(1);
    expect(tileYield(mountains, 'silver', expert('silver'))).toBe(1);
    expect(tileYield({ ...mountains, road: true, river: 'major' }, 'silver', expert('silver'))).toBe(1);
    const deposit = { ...mountains, resource: 'silverDeposit' as const };
    expect(tileYield(deposit, 'silver')).toBe(3);
    expect(tileYield(deposit, 'silver', expert('silver'))).toBe(6);
    expect(tileYield({ ...deposit, road: true }, 'silver')).toBe(4);
    expect(tileYield({ ...deposit, road: true }, 'silver', expert('silver'))).toBe(8);
    const spent = { ...mountains, resource: 'depletedMine' as const };
    expect(tileYield(spent, 'silver')).toBe(1);
    expect(tileYield(spent, 'silver', expert('silver'))).toBe(2);
    expect(tileYield({ ...spent, road: true }, 'silver')).toBe(2);
    expect(tileYield(mountains, 'ore')).toBe(4);
  });
});

describe('tileYield: fish', () => {
  it('depends on neighbouring water and needs Docks', () => {
    expect(tileYield(ocean, 'fish', undefined, COAST)).toBe(4);
    expect(tileYield(ocean, 'fish', undefined, { waterNeighbors: 0 })).toBe(4);
    expect(tileYield(ocean, 'fish', undefined, { waterNeighbors: 6 })).toBe(2);
    expect(tileYield(ocean, 'fish', undefined, OPEN_SEA)).toBe(2);
    expect(tileYield(ocean, 'fish', undefined, { waterNeighbors: 8 })).toBe(1);
    expect(tileYield(makeTile({ base: 'seaLane' }), 'fish', undefined, COAST)).toBe(4);
    expect(tileYield(ocean, 'fish', undefined, { ...COAST, hasDocks: false })).toBe(0);
    expect(tileYield(plains, 'fish', undefined, COAST)).toBe(0);
    expect(tileYield(ocean, 'food', undefined, COAST)).toBe(0);
  });

  it('expert +2, fishery +3 (expert +6)', () => {
    expect(tileYield(ocean, 'fish', expert('fish'), COAST)).toBe(6);
    const fishery = makeTile({ resource: 'fishery' });
    expect(tileYield(fishery, 'fish', undefined, COAST)).toBe(7);
    expect(tileYield(fishery, 'fish', expert('fish'), COAST)).toBe(12);
    expect(tileYield(fishery, 'fish', undefined, OPEN_SEA)).toBe(5);
  });

  it('counts water neighbours on a map, off-map as land', () => {
    const { map } = createGame({ seed: 1, width: 8, height: 8 }); // 2-tile ocean ring around plains
    expect(countWaterNeighbors(map, 0, 0)).toBe(3);
    expect(countWaterNeighbors(map, 1, 3)).toBe(5);
    expect(countWaterNeighbors(map, 2, 2)).toBe(5);
    expect(countWaterNeighbors(map, 4, 4)).toBe(0);
    expect(countWaterNeighbors(map, 1, 1)).toBe(7);
  });
});

describe('tileYield: Sons of Liberty, Tories, Hudson, converts', () => {
  it('SoL bonus goes in before the expert and lumber multipliers', () => {
    expect(tileYield(plains, 'food', undefined, { solBonus: 1 })).toBe(6);
    expect(tileYield(plains, 'food', undefined, { solBonus: 2 })).toBe(7);
    expect(tileYield(plains, 'food', expert('food'), { solBonus: 1 })).toBe(9); // counted twice for food experts
    expect(tileYield(savannah, 'sugar', expert('sugar'), { solBonus: 1 })).toBe(8);
    expect(tileYield(mixed, 'lumber', undefined, { solBonus: 1 })).toBe(8);
    expect(tileYield(plains, 'sugar', undefined, { solBonus: 2 })).toBe(0);
  });

  it('Tory penalty comes off last and never below zero; it nets against the SoL bonus', () => {
    expect(tileYield(plains, 'food', undefined, { toryPenalty: 2 })).toBe(3);
    expect(tileYield(plains, 'ore', undefined, { toryPenalty: 3 })).toBe(0);
    expect(tileYield(savannah, 'sugar', expert('sugar'), { toryPenalty: 1 })).toBe(5);
    expect(tileYield(plains, 'food', undefined, { toryPenalty: 2, solBonus: 1 })).toBe(4);
    expect(tileYield(plains, 'food', undefined, { toryPenalty: 1, solBonus: 1 })).toBe(5);
  });

  it('Hudson doubles the final fur figure', () => {
    expect(tileYield(mixed, 'furs', undefined, { hasHudson: true })).toBe(6);
    expect(tileYield({ ...mixed, road: true }, 'furs', undefined, { hasHudson: true })).toBe(10);
    expect(tileYield(mixed, 'lumber', undefined, { hasHudson: true })).toBe(6);
  });

  it('converts get +1 on food, crops, furs and fish only', () => {
    expect(tileYield(plains, 'food', convert)).toBe(6);
    expect(tileYield(plains, 'cotton', convert)).toBe(3);
    expect(tileYield(mixed, 'furs', convert)).toBe(4);
    expect(tileYield(ocean, 'fish', convert, COAST)).toBe(5);
    expect(tileYield(mixed, 'lumber', convert)).toBe(6);
    expect(tileYield(hills, 'ore', convert)).toBe(4);
    expect(tileYield(plains, 'sugar', convert)).toBe(0);
  });
});

describe('colonyCenterYield', () => {
  it('food by terrain and difficulty', () => {
    expect(colonyCenterYield(plains, 'conquistador').food).toBe(3);
    expect(colonyCenterYield(plains, 'explorer').food).toBe(4);
    expect(colonyCenterYield(plains, 'discoverer').food).toBe(5);
    expect(colonyCenterYield(mixed, 'viceroy').food).toBe(2);
    expect(colonyCenterYield(hills, 'viceroy').food).toBe(2);
    expect(colonyCenterYield(makeTile({ base: 'desert' }), 'viceroy').food).toBe(1);
    expect(colonyCenterYield(makeTile({ base: 'arctic' }), 'viceroy').food).toBe(0);
    expect(colonyCenterYield({ ...plains, plowed: true, resource: 'wheat' }, 'viceroy', 2).food).toBe(8);
    expect(colonyCenterYield({ ...plains, river: 'major', road: true }, 'viceroy').food).toBe(3);
  });

  it('picks the best secondary good, earliest on ties, never lumber', () => {
    expect(colonyCenterYield(plains, 'viceroy').secondary).toEqual({ good: 'cotton', amount: 2 });
    expect(colonyCenterYield(savannah, 'viceroy').secondary).toEqual({ good: 'sugar', amount: 3 });
    expect(colonyCenterYield(mixed, 'viceroy').secondary).toEqual({ good: 'furs', amount: 3 });
    expect(colonyCenterYield(makeTile({ base: 'marsh' }), 'viceroy').secondary).toEqual({ good: 'tobacco', amount: 2 });
    expect(colonyCenterYield(makeTile({ base: 'arctic' }), 'viceroy').secondary).toBeNull();
    expect(colonyCenterYield({ ...savannah, resource: 'primeSugar' }, 'viceroy').secondary).toEqual({ good: 'sugar', amount: 6 });
    expect(colonyCenterYield(makeTile({ base: 'tundra', resource: 'minerals' }), 'viceroy').secondary).toEqual({ good: 'ore', amount: 5 });
    expect(colonyCenterYield({ ...plains, river: 'major' }, 'discoverer', 1).secondary).toEqual({ good: 'cotton', amount: 6 });
    expect(colonyCenterYield({ ...plains, plowed: true, road: true }, 'viceroy').secondary).toEqual({ good: 'cotton', amount: 2 });
  });
});

describe('depletion', () => {
  it('weights only mining on Minerals and Silver Deposits', () => {
    const minerals = makeTile({ base: 'tundra', resource: 'minerals' });
    const silver = { ...mountains, resource: 'silverDeposit' as const };
    expect(depletionWeight(minerals, 'ore')).toBe(1);
    expect(depletionWeight(minerals, 'silver')).toBe(2);
    expect(depletionWeight(silver, 'silver')).toBe(1);
    expect(depletionWeight(silver, 'ore')).toBe(0);
    expect(depletionWeight({ ...hills, resource: 'oreDeposit' }, 'ore')).toBe(0);
    expect(depletionWeight(minerals, 'food')).toBe(0);
  });

  it('ticks by chance (d+1)/(d+2) per unit of weight and fires at 50', () => {
    const run = (difficulty: 'discoverer' | 'viceroy'): number => {
      const rng = createRng(4);
      let counter = 0;
      let turns = 0;
      for (; turns < 1000; turns++) {
        const r = tickDepletion(counter, 1, difficulty, rng);
        counter = r.counter;
        if (r.depleted) break;
      }
      return turns;
    };
    expect(run('discoverer')).toBeGreaterThan(65);
    expect(run('discoverer')).toBeLessThan(130);
    expect(run('viceroy')).toBeGreaterThan(50);
    expect(run('viceroy')).toBeLessThan(75);
    expect(tickDepletion(49, 0, 'viceroy', createRng(1))).toEqual({ counter: 49, depleted: false });
    const big = tickDepletion(48, 40, 'viceroy', createRng(1));
    expect(big.depleted).toBe(true);
    expect(big.counter).toBeLessThan(40);
  });

  it('turns a Silver Deposit into a Depleted Mine and removes Minerals', () => {
    expect(depleteTile({ ...mountains, resource: 'silverDeposit' }).resource).toBe('depletedMine');
    expect(depleteTile(makeTile({ base: 'marsh', resource: 'minerals' })).resource).toBeNull();
    const ore = { ...hills, resource: 'oreDeposit' as const };
    expect(depleteTile(ore)).toBe(ore);
  });
});
