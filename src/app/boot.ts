// The routes out of the title screen into a game. This module pulls in the whole engine, so the
// shell (shell.ts) loads it in the background after the title screen is up.
import { DEFAULT_WORLD, type WorldOptions } from '../engine/data/mapgen';
import { NATION_IDS, type NationId } from '../engine/data/nations';
import type { Difficulty } from '../engine/data/yields';
import { describeDifficulty } from '../engine/difficulty';
import { standardPowers, type NewGameOptions } from '../engine/game';
import { loadGame, newSession, type GameSession } from '../engine/save';
import { createCustomizeScreen } from '../ui/customize';
import { createPowerScreen, type PowerChoice } from '../ui/power';
import { showReport } from '../ui/report';
import { showSaveLoad, type SaveChoice } from '../ui/save-dialog';
import type { TitleChoice } from '../ui/title';
import { startGame } from './game-screen';
import { hallReport, readHall } from './hall-of-fame';
import { LAST_NAME_KEY, LAST_POWER_KEY } from './save-keys';
import { describeLoadError, LAST_TURN_SLOT, listSlots, readSlot } from './slots';

type Seats = NonNullable<NewGameOptions['players']>;

const isNation = (id: unknown): id is NationId => (NATION_IDS as readonly unknown[]).includes(id);

/** The chosen power as `p0`, and the three powers the computer plays. `?rivals=0` starts a game alone. */
const powers = (choice: PowerChoice): Seats => {
  const seats = standardPowers(choice.nation, choice.name);
  return new URLSearchParams(location.search).get('rivals') === '0' ? seats.slice(0, 1) : seats;
};

/** A fresh seed, or the one given as ?seed=N so a game can be reproduced. */
function randomSeed(): number {
  const fixed = Number(new URLSearchParams(location.search).get('seed'));
  if (Number.isInteger(fixed) && fixed > 0) return fixed;
  return crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;
}

/** The names given before, by power. A blocked store, or nonsense in it, means none. */
function rememberedNames(): Partial<Record<NationId, string>> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(LAST_NAME_KEY) ?? '{}');
    const names: Partial<Record<NationId, string>> = {};
    if (typeof raw === 'object' && raw !== null) {
      for (const [nation, name] of Object.entries(raw)) if (isNation(nation) && typeof name === 'string' && name.trim() !== '') names[nation] = name;
    }
    return names;
  } catch {
    return {};
  }
}

/** What the power screen opens on: `?nation=` and `?name=` first, then the last game started here, then England and the leader. */
function firstChoice(): { nation: NationId; name: string | null; names: Partial<Record<NationId, string>> } {
  const params = new URLSearchParams(location.search);
  let nation: NationId = 'england';
  try {
    const last = localStorage.getItem(LAST_POWER_KEY);
    if (isNation(last)) nation = last;
  } catch {
    // a blocked store: the plain default
  }
  const asked = params.get('nation');
  if (isNation(asked)) nation = asked;
  const name = params.get('name')?.trim() || null;
  return { nation, name, names: rememberedNames() };
}

/** Keep the choice for next time; a full or forbidden store only means it is not kept. */
function remember(choice: PowerChoice): void {
  try {
    localStorage.setItem(LAST_POWER_KEY, choice.nation);
    localStorage.setItem(LAST_NAME_KEY, JSON.stringify({ ...rememberedNames(), [choice.nation]: choice.name }));
  } catch {
    // not kept
  }
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
  /** The power screen, then the game `begin` makes for the seats chosen; Back returns to the screen `from` puts up. */
  const choosePower = (begin: (players: Seats) => GameSession, from: () => void): void => {
    const screen = createPowerScreen({
      ...firstChoice(),
      difficulty,
      onBack: from,
      onStart: (picked) => {
        remember(picked);
        startGame(root, begin(powers(picked)), { opening: true });
      },
    });
    root.replaceChildren(screen);
    // the keys work at once: the chosen power holds the keyboard
    screen.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]')?.focus();
  };
  const worldGame = (world: WorldOptions) => (players: Seats): GameSession => newSession({ seed: randomSeed(), players, world, difficulty });
  switch (choice) {
    case 'newWorld':
      choosePower(worldGame(DEFAULT_WORLD), back);
      break;
    case 'america':
      choosePower((players) => newSession({ seed: randomSeed(), players, scenario: 'america', difficulty }), back);
      break;
    case 'customize': {
      // Start leads on to the power screen; Back from there shows this same form, its settings as they were
      const customize = createCustomizeScreen((world) => choosePower(worldGame(world), () => root.replaceChildren(customize)), back);
      root.replaceChildren(customize);
      break;
    }
    case 'load':
      void loadFromTitle(root);
      break;
    case 'hallOfFame':
      void showReport(root, hallReport(readHall()));
      break;
  }
}

export { describeDifficulty };
