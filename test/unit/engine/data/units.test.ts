import { describe, expect, it } from 'vitest';
import { PROFESSION_IDS, PROFESSIONS, SPECIALISTS, UNSKILLED } from '../../../../src/engine/data/professions';
import { SIGHT } from '../../../../src/engine/data/sight';
import { RAW_GOODS } from '../../../../src/engine/data/terrain';
import { AI_ROLES, isShip, UNIT_TYPE_IDS, UNIT_TYPES, type UnitTypeId } from '../../../../src/engine/data/units';

describe('unit table', () => {
  it('matches the snapshot', () => {
    expect(UNIT_TYPES).toMatchSnapshot();
  });

  it('has every listed unit with complete fields', () => {
    expect(Object.keys(UNIT_TYPES).sort()).toEqual([...UNIT_TYPE_IDS].sort());
    expect(UNIT_TYPE_IDS).toHaveLength(24);
    for (const id of UNIT_TYPE_IDS) {
      const u = UNIT_TYPES[id];
      expect(u.name.length, id).toBeGreaterThan(0);
      for (const f of ['moves', 'attack', 'defense', 'holds', 'size', 'cost', 'toolsCost', 'guns', 'hull', 'sight'] as const) {
        expect(Number.isInteger(u[f]) && u[f] >= 0, `${id}.${f}`).toBe(true);
      }
      expect(u.moves, id).toBeGreaterThan(0);
      for (const r of u.aiRoles) expect(AI_ROLES).toContain(r);
    }
  });

  it('carries the key numbers from the table', () => {
    const stat = (id: UnitTypeId): number[] => [UNIT_TYPES[id].moves, UNIT_TYPES[id].attack, UNIT_TYPES[id].defense, UNIT_TYPES[id].holds];
    expect(stat('colonist')).toEqual([1, 0, 1, 0]);
    expect(stat('soldier')).toEqual([1, 2, 2, 0]);
    expect(stat('dragoon')).toEqual([4, 3, 3, 0]);
    expect(stat('missionary')).toEqual([2, 0, 1, 0]);
    expect(stat('artillery')).toEqual([1, 7, 5, 0]);
    expect(stat('damagedArtillery')).toEqual([1, 5, 3, 0]);
    expect(stat('wagonTrain')).toEqual([2, 0, 1, 2]);
    expect(stat('caravel')).toEqual([4, 0, 2, 2]);
    expect(stat('galleon')).toEqual([6, 0, 10, 6]);
    expect(stat('privateer')).toEqual([8, 8, 8, 2]);
    expect(stat('manOWar')).toEqual([5, 24, 24, 6]);
    expect(stat('mountedWarrior')).toEqual([4, 3, 3, 0]);
    expect(UNIT_TYPES.treasure.size).toBe(6);
  });

  it('derives build costs as cost x 32 hammers and tools x 10, wagon train excepted', () => {
    expect(UNIT_TYPES.artillery.build).toEqual({ hammers: 192, tools: 40 });
    expect(UNIT_TYPES.caravel.build).toEqual({ hammers: 128, tools: 40 });
    expect(UNIT_TYPES.merchantman.build).toEqual({ hammers: 192, tools: 80 });
    expect(UNIT_TYPES.galleon.build).toEqual({ hammers: 320, tools: 100 });
    expect(UNIT_TYPES.privateer.build).toEqual({ hammers: 256, tools: 120 });
    expect(UNIT_TYPES.frigate.build).toEqual({ hammers: 512, tools: 200 });
    expect(UNIT_TYPES.wagonTrain.build).toEqual({ hammers: 40, tools: 0 });
    expect(UNIT_TYPES.manOWar.build).toBeNull();
    expect(UNIT_TYPE_IDS.filter((id) => UNIT_TYPES[id].build).sort()).toEqual(
      ['artillery', 'caravel', 'frigate', 'galleon', 'merchantman', 'privateer', 'wagonTrain'],
    );
  });

  it('prices, equipment, ships, natives, roles', () => {
    expect(UNIT_TYPE_IDS.filter((id) => UNIT_TYPES[id].europePrice !== null).map((id) => [id, UNIT_TYPES[id].europePrice])).toEqual([
      ['artillery', 500], ['caravel', 1000], ['merchantman', 2000], ['galleon', 3000], ['privateer', 2000], ['frigate', 5000],
    ]);
    expect(UNIT_TYPES.soldier.equipment).toEqual({ muskets: 50, horses: 0, tools: 0 });
    expect(UNIT_TYPES.dragoon.equipment).toEqual({ muskets: 50, horses: 50, tools: 0 });
    expect(UNIT_TYPES.scout.equipment).toEqual({ muskets: 0, horses: 50, tools: 0 });
    expect(UNIT_TYPES.pioneer.equipment.tools).toBe(100);
    expect(UNIT_TYPE_IDS.filter(isShip)).toEqual(['caravel', 'merchantman', 'galleon', 'privateer', 'frigate', 'manOWar']);
    expect(UNIT_TYPE_IDS.filter((id) => UNIT_TYPES[id].native)).toEqual(['brave', 'armedBrave', 'mountedBrave', 'mountedWarrior']);
    expect(UNIT_TYPE_IDS.filter((id) => UNIT_TYPES[id].colonistRole)).toEqual(['colonist', 'soldier', 'pioneer', 'missionary', 'dragoon', 'scout']);
    expect(UNIT_TYPES.caravel.aiRoles).toEqual(['invade', 'explore', 'transport']);
    expect(UNIT_TYPES.scout.aiRoles).toEqual(['settle', 'explore', 'escort']);
    expect(UNIT_TYPES.privateer.aiRoles).toEqual(['naval']);
  });

  it('every unit referenced by other tables exists', () => {
    for (const id of SIGHT.extendedUnits) expect(UNIT_TYPE_IDS).toContain(id);
    for (const id of PROFESSION_IDS) {
      const role = PROFESSIONS[id].expertRole;
      if (role) expect(UNIT_TYPE_IDS).toContain(role);
    }
    expect(UNIT_TYPES.scout.sight).toBe(2);
    expect(UNIT_TYPES.frigate.sight).toBe(2);
    expect(UNIT_TYPES.caravel.sight).toBe(1);
  });
});

describe('profession table', () => {
  it('matches the snapshot', () => {
    expect(PROFESSIONS).toMatchSnapshot();
  });

  it('has 4 unskilled kinds and 22 specialists', () => {
    expect(PROFESSION_IDS).toHaveLength(28);
    expect(UNSKILLED).toHaveLength(4);
    expect(SPECIALISTS).toHaveLength(22);
    expect(PROFESSION_IDS.filter((id) => !PROFESSIONS[id].colonist)).toEqual(['expertTeacher', 'veteranDragoon']);
  });

  it('covers each raw good with exactly one outdoor expert', () => {
    const goods = PROFESSION_IDS.map((id) => PROFESSIONS[id].expertGood).filter((g) => g !== null);
    expect([...goods].sort()).toEqual([...RAW_GOODS].sort());
  });

  it('keeps teach levels and Royal University prices from the table', () => {
    const p = PROFESSIONS;
    expect([p.expertFarmer.teachLevel, p.expertFarmer.europePrice]).toEqual([1, 1100]);
    expect([p.masterSugarPlanter.teachLevel, p.masterSugarPlanter.europePrice]).toEqual([2, null]);
    expect([p.elderStatesman.teachLevel, p.elderStatesman.europePrice]).toEqual([3, 1900]);
    expect([p.veteranSoldier.teachLevel, p.veteranSoldier.europePrice]).toEqual([2, 2000]);
    expect([p.jesuitMissionary.teachLevel, p.jesuitMissionary.europePrice]).toEqual([3, 1400]);
    expect([p.freeColonist.teachLevel, p.freeColonist.europePrice]).toEqual([4, null]);
    expect(PROFESSION_IDS.filter((id) => PROFESSIONS[id].nativeTaught).sort()).toEqual([
      'expertFarmer', 'expertFisherman', 'expertFurTrapper', 'expertOreMiner', 'expertSilverMiner',
      'masterCottonPlanter', 'masterSugarPlanter', 'masterTobaccoPlanter', 'seasonedScout',
    ]);
  });
});
