import { describe, expect, it } from 'vitest';
import { COLONY_OPTIONS, DEFAULT_OPTIONS, GAME_OPTIONS, parseOptions, serializeOptions, SOUND_OPTIONS } from '../../../src/ui/options';

describe('options', () => {
  it('are the eight game options, the ten colony report options and the three sound options', () => {
    expect(GAME_OPTIONS.map((o) => o.key)).toEqual(['showIndianMoves', 'showForeignMoves', 'fastPieceSlide', 'endOfTurn', 'autosave', 'combatAnalysis', 'waterShimmer', 'tutorialHints']);
    expect(COLONY_OPTIONS).toHaveLength(10);
    expect(SOUND_OPTIONS.map((o) => o.key)).toEqual(['backgroundMusic', 'eventMusic', 'soundEffects']);
    expect(new Set([...GAME_OPTIONS, ...COLONY_OPTIONS, ...SOUND_OPTIONS].map((o) => o.key)).size).toBe(21);
    expect(DEFAULT_OPTIONS).toMatchSnapshot();
  });

  it('survive being written and read back', () => {
    const changed = { ...DEFAULT_OPTIONS, autosave: false, reportFood: false, fastPieceSlide: true };
    expect(parseOptions(serializeOptions(changed))).toEqual(changed);
  });

  it('fall back to the defaults for anything missing or malformed', () => {
    expect(parseOptions(null)).toEqual(DEFAULT_OPTIONS);
    expect(parseOptions('not json')).toEqual(DEFAULT_OPTIONS);
    expect(parseOptions('[1,2]')).toEqual(DEFAULT_OPTIONS);
    expect(parseOptions('{"autosave":"no","endOfTurn":false,"unknown":true}')).toEqual({ ...DEFAULT_OPTIONS, endOfTurn: false });
  });
});
