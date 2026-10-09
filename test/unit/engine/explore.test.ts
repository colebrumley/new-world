import { describe, expect, it } from 'vitest';
import { applyAction } from '../../../src/engine/actions';
import { SIGHT } from '../../../src/engine/data/sight';
import { knowsTile, revealAround, sightRadius, visibleUnits } from '../../../src/engine/explore';
import { createGame } from '../../../src/engine/game';
import type { GameState, Unit } from '../../../src/engine/state';
import { isExploredBy } from '../../../src/engine/tile';

const TWO = [
  { id: 'a', name: 'A', kind: 'human' },
  { id: 'b', name: 'B', kind: 'ai' },
] as const;

const explored = (s: GameState, player: number): number => s.map.tiles.filter((t) => isExploredBy(t, player)).length;
const place = (s: GameState, id: string, x: number, y: number): GameState => ({ ...s, units: { ...s.units, [id]: { ...(s.units[id] as Unit), x, y } } });

describe('sight radius', () => {
  it('is 1 by default, 2 for scouts and the listed ships, +1 with De Soto', () => {
    expect(SIGHT).toMatchSnapshot();
    expect(sightRadius('colonist', false)).toBe(1);
    expect(sightRadius('caravel', false)).toBe(1);
    expect(sightRadius('manOWar', false)).toBe(1);
    for (const u of ['scout', 'galleon', 'privateer', 'frigate'] as const) expect(sightRadius(u, false)).toBe(2);
    expect(sightRadius('colonist', true)).toBe(2);
    expect(sightRadius('scout', true)).toBe(3);
  });
});

describe('revealAround', () => {
  const base = createGame({ seed: 3, players: TWO, width: 20, height: 20 });

  it('marks a square of the given radius, clipped to the map, for one player only', () => {
    const blank = { ...base.map, tiles: base.map.tiles.map((t) => ({ ...t, explored: 0 })) };
    const r1 = revealAround(blank, 0, 10, 10, 1);
    expect(r1.revealed).toHaveLength(9);
    expect(revealAround(blank, 0, 10, 10, 2).revealed).toHaveLength(25);
    expect(revealAround(blank, 0, 0, 0, 1).revealed).toHaveLength(4);
    expect(revealAround(blank, 0, 19, 10, 2).revealed).toHaveLength(15);
    expect(r1.map.tiles.filter((t) => isExploredBy(t, 1))).toHaveLength(0);
    expect(blank.tiles.every((t) => t.explored === 0)).toBe(true);
  });

  it('reports only newly seen tiles and returns the same map when nothing is new', () => {
    const blank = { ...base.map, tiles: base.map.tiles.map((t) => ({ ...t, explored: 0 })) };
    const first = revealAround(blank, 0, 5, 5, 1);
    const second = revealAround(first.map, 0, 6, 5, 1);
    expect(second.revealed).toHaveLength(3);
    const third = revealAround(second.map, 0, 6, 5, 1);
    expect(third.revealed).toEqual([]);
    expect(third.map).toBe(second.map);
  });
});

describe('exploration in play', () => {
  it('starts with only the surroundings of each unit explored by its owner', () => {
    const s = createGame({ seed: 3, players: TWO, width: 30, height: 30 });
    expect(explored(s, 0)).toBe(9);
    expect(explored(s, 1)).toBe(9);
    const u = s.units['u1'] as Unit;
    expect(knowsTile(s, 0, u.x, u.y)).toBe(true);
    expect(knowsTile(s, 0, 0, 0)).toBe(false);
    expect(knowsTile(s, 1, 0, 0)).toBe(true); // AI powers know the whole map
    expect(knowsTile(s, 0, -1, 0)).toBe(false);
  });

  it('moving reveals new tiles, which stay explored forever', () => {
    let s = place(createGame({ seed: 3, players: TWO, width: 30, height: 30 }), 'u1', 10, 10);
    const before = explored(s, 0);
    const r = applyAction(s, { type: 'moveUnit', unitId: 'u1', dx: 1, dy: 0 });
    const event = r.events.find((e) => e.type === 'tilesExplored');
    expect(event).toMatchObject({ player: 'a' });
    expect(explored(r.state, 0)).toBeGreaterThan(before);
    s = r.state;
    for (let i = 0; i < 6; i++) {
      s = applyAction(s, { type: 'endTurn' }).state;
      s = applyAction(s, { type: 'endTurn' }).state;
      s = applyAction(s, { type: 'moveUnit', unitId: 'u1', dx: 1, dy: 0 }).state;
    }
    expect(knowsTile(s, 0, 10, 10)).toBe(true); // long since left behind
    expect(knowsTile(s, 0, 18, 11)).toBe(true);
    expect(knowsTile(s, 0, 10, 13)).toBe(false);
  });
});

describe('visibleUnits', () => {
  it('shows foreign units only when next to one of your own', () => {
    const s = createGame({ seed: 3, players: TWO, width: 30, height: 30 });
    const apart = place(place(s, 'u1', 5, 5), 'u2', 9, 9);
    expect(visibleUnits(apart, 0).map((u) => u.id)).toEqual(['u1']);
    const close = place(apart, 'u2', 6, 6);
    expect(visibleUnits(close, 0).map((u) => u.id)).toEqual(['u1', 'u2']);
    expect(visibleUnits(place(apart, 'u2', 7, 5), 0).map((u) => u.id)).toEqual(['u1']);
    expect(visibleUnits(apart, 5)).toEqual([]);
  });
});
