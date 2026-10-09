// The routes out of the title screen into a game. This module pulls in the whole engine, so the
// shell (shell.ts) loads it in the background after the title screen is up.
import { DEFAULT_WORLD, type WorldOptions } from '../engine/data/mapgen';
import type { Difficulty } from '../engine/data/yields';
import { describeDifficulty } from '../engine/difficulty';
import { loadGame, newSession } from '../engine/save';
import { createCustomizeScreen } from '../ui/customize';
import { showReport } from '../ui/report';
import { showSaveLoad, type SaveChoice } from '../ui/save-dialog';
import type { TitleChoice } from '../ui/title';
import { startGame } from './game-screen';
import { hallReport, readHall } from './hall-of-fame';
import { describeLoadError, LAST_TURN_SLOT, listSlots, readSlot } from './slots';

/** The player, and the three rival powers the computer plays. `?rivals=0` starts a game alone. */
const HUMAN = [{ id: 'p0', name: 'Player', kind: 'human', nation: 'england' }] as const;
const RIVALS = [
  { id: 'france', name: 'France', kind: 'ai', nation: 'france' },
  { id: 'spain', name: 'Spain', kind: 'ai', nation: 'spain' },
  { id: 'netherlands', name: 'Netherlands', kind: 'ai', nation: 'netherlands' },
] as const;
const powers = (): NonNullable<Parameters<typeof newSession>[0]['players']> =>
  new URLSearchParams(location.search).get('rivals') === '0' ? HUMAN : [...HUMAN, ...RIVALS];

/** A fresh seed, or the one given as ?seed=N so a game can be reproduced. */
function randomSeed(): number {
  const fixed = Number(new URLSearchParams(location.search).get('seed'));
  if (Number.isInteger(fixed) && fixed > 0) return fixed;
  return crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;
}

/** With only the game last played to choose from it is simply resumed; otherwise the slots are shown. */
async function loadFromTitle(root: HTMLElement): Promise<void> {
  let notice = '';
  for (;;) {
    const slots = listSlots();
    const filled = slots.filter((s) => s.summary !== null);
    let choice: SaveChoice | null = filled.length === 1 && filled[0]?.index === LAST_TURN_SLOT && notice === '' ? { kind: 'load', slot: LAST_TURN_SLOT } : null;
    choice ??= await showSaveLoad(root, slots, false, notice);
    if (!choice || choice.kind === 'save' || choice.kind === 'export') return;
    try {
      const loaded = choice.kind === 'load' ? readSlot(choice.slot) : loadGame(choice.text);
      if (loaded) {
        startGame(root, loaded);
        return;
      }
      notice = 'That slot is empty.';
    } catch (error) {
      notice = describeLoadError(error);
    }
  }
}

/** Act on a choice made on the title screen. `back` puts the title screen up again. */
export function choose(root: HTMLElement, choice: TitleChoice, difficulty: Difficulty, back: () => void): void {
  const startWorld = (world: WorldOptions): void => startGame(root, newSession({ seed: randomSeed(), players: powers(), world, difficulty }));
  switch (choice) {
    case 'newWorld':
      startWorld(DEFAULT_WORLD);
      break;
    case 'america':
      startGame(root, newSession({ seed: randomSeed(), players: powers(), scenario: 'america', difficulty }));
      break;
    case 'customize':
      root.replaceChildren(createCustomizeScreen(startWorld, back));
      break;
    case 'load':
      void loadFromTitle(root);
      break;
    case 'hallOfFame':
      void showReport(root, hallReport(readHall()));
      break;
  }
}

export { describeDifficulty };
