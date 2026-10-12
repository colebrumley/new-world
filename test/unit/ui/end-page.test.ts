import { describe, expect, it } from 'vitest';
import type { GameOverReason, GameState } from '../../../src/engine/state';
import { END_BUTTON, END_CHOICE_LABELS, END_HEADLINE, END_KIND, END_STATUS, END_TEXT, PLAY_ON_NOTE, endPageModel } from '../../../src/ui/end-page';
import { scoreReport } from '../../../src/ui/reports/score';
import { withColony, world } from '../../helpers/world';

const REASONS: readonly GameOverReason[] = ['retiredEarly', 'retired', 'warLost', 'independence', 'crownVictory', 'noColonies'];

/** A small game with something to score, ended for `reason` in the spring of 1800. */
function ended(reason: GameOverReason | null): GameState {
  const rows = Array.from({ length: 8 }, (_, y) => (y === 0 || y === 7 ? '~'.repeat(10) : `~~${'.'.repeat(6)}~~`));
  let state = world({ rows, seed: 3, players: [{ id: 'p0', kind: 'human', fathers: ['peterMinuit', 'adamSmith'] }] });
  state = withColony(state, { id: 'col', owner: 'p0', x: 3, y: 3, name: 'Jamestown' });
  state = { ...state, turn: 508, players: state.players.map((p) => ({ ...p, gold: 42000 })) };
  return { ...state, over: reason ? { reason, turn: 508, player: 'p0' } : null };
}

describe('the end page', () => {
  it('has a headline, a kind and closing words for each of the six endings', () => {
    expect({ END_KIND, END_HEADLINE, END_TEXT }).toMatchInlineSnapshot(`
      {
        "END_HEADLINE": {
          "crownVictory": "Defeat: the rebellion is put down",
          "independence": "Victory: independence is won",
          "noColonies": "Defeat: your charter is withdrawn",
          "retired": "Retirement: your term is over",
          "retiredEarly": "Retirement: you lay down your office",
          "warLost": "Defeat: the war is not won",
        },
        "END_KIND": {
          "crownVictory": "loss",
          "independence": "win",
          "noColonies": "loss",
          "retired": "retirement",
          "retiredEarly": "retirement",
          "warLost": "loss",
        },
        "END_TEXT": {
          "crownVictory": "The Crown has put down the rebellion. Our leaders go into exile, and the colonies return to the King.",
          "independence": "The King's army is broken and his colonies are ours. The Crown recognises our independence: a new nation is born.",
          "noColonies": "You hold no colony in the New World. The Crown has withdrawn your charter.",
          "retired": "The year is 1800 and your term as Viceroy is over. The colonies will be judged as they stand.",
          "retiredEarly": "You have laid down the Viceroy's office. The colonies will be judged as they stand.",
          "warLost": "It is 1850 and the war is not won. The Congress makes its peace with the Crown.",
        },
      }
    `);
    expect(Object.keys(END_HEADLINE).sort()).toEqual([...REASONS].sort());
  });

  it('each headline says plainly whether it is a win, a loss or a retirement', () => {
    const word = { win: 'Victory', loss: 'Defeat', retirement: 'Retirement' } as const;
    for (const reason of REASONS) expect(END_HEADLINE[reason].startsWith(`${word[END_KIND[reason]]}: `), reason).toBe(true);
    // one victory; the two defeats in war and the lost charter are losses
    expect(REASONS.filter((r) => END_KIND[r] === 'win')).toEqual(['independence']);
    expect(REASONS.filter((r) => END_KIND[r] === 'loss')).toEqual(['warLost', 'crownVictory', 'noColonies']);
  });

  it('is the headline, the words and the date of the game that ended', () => {
    for (const reason of REASONS) {
      const page = endPageModel(ended(reason));
      expect(page, reason).toMatchObject({ reason, kind: END_KIND[reason], headline: END_HEADLINE[reason], text: END_TEXT[reason], date: 'Spring 1800' });
    }
  });

  it('gives the score, the rating and the honour as the score report gives them', () => {
    const state = ended('retired');
    const page = endPageModel(state);
    const [score, rating] = scoreReport(state, 'p0').sections;
    expect(score?.rows.at(-1)).toEqual(['Total', '', page?.score]);
    expect(rating?.rows[0]).toEqual(['Rating', page?.rating]);
    expect(rating?.rows[1]).toEqual([page?.honour]);
    expect(Number(page?.score)).toBeGreaterThan(0);
    expect(page?.rating).toMatch(/^\d+%$/);
    expect(page?.honour).toMatch(/named/);
  });

  it('offers Play on only after the 1800 and 1850 reckonings, and says the game will not be scored again', () => {
    for (const reason of REASONS) {
      const page = endPageModel(ended(reason));
      const playOn = reason === 'retired' || reason === 'warLost';
      expect(page?.choices, reason).toEqual(playOn ? ['reckoning', 'playOn', 'newGame', 'loadGame', 'lookOver'] : ['reckoning', 'newGame', 'loadGame', 'lookOver']);
      expect(page?.note, reason).toBe(playOn ? PLAY_ON_NOTE : '');
    }
    expect(PLAY_ON_NOTE).toContain('will not be scored again');
  });

  it('names its choices, and the way back to it', () => {
    expect(END_CHOICE_LABELS).toEqual({ reckoning: 'The reckoning', playOn: 'Play on', newGame: 'New game', loadGame: 'Load game', lookOver: 'Look over the map' });
    expect(END_BUTTON).toBe('The end');
    expect(END_STATUS).toContain('The game has ended');
  });

  it('is not there for a game still being played', () => {
    expect(endPageModel(ended(null))).toBeNull();
  });
});
