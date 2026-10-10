// App shell: puts the title screen up at once and fetches the game itself behind it, so the
// first paint does not wait for the engine.
import { DEFAULT_DIFFICULTY, DIFFICULTIES, type Difficulty } from '../engine/data/yields';
import { createPainting, createTitleScreen, fitPainting, type TitleChoice } from '../ui/title';
import type * as Game from './boot';
import { hasAnySave } from './save-keys';

/** ?difficulty=explorer preselects the level on the title screen. */
function chosenDifficulty(): Difficulty | undefined {
  const asked = new URLSearchParams(location.search).get('difficulty');
  return DIFFICULTIES.find((d) => d === asked);
}

/**
 * Hang the painting behind the title screen. Its canvas goes up empty beside the game's element, where the
 * screens reached from the title share it; the picture is a chunk of its own, asked for only once the title
 * and menu have been painted, so it costs the first paint nothing and the menu never waits for it.
 */
function hangPainting(root: HTMLElement): void {
  const canvas = createPainting();
  const fit = (): void => fitPainting(canvas, window.innerWidth, window.innerHeight);
  fit();
  window.addEventListener('resize', fit);
  root.before(canvas);
  // a frame, then a task: by then the browser has painted the frame the title went up in
  requestAnimationFrame(() => setTimeout(() => void import('../ui/frontispiece').then((art) => art.paint(canvas), () => undefined)));
}

export function boot(root: HTMLElement): void {
  // one fetch, started as soon as the title is on screen and shared by everything that needs it
  let game: Promise<typeof Game> | null = null;
  const load = (): Promise<typeof Game> => (game ??= import('./boot'));
  const disabled = new Set<TitleChoice>(hasAnySave() ? [] : ['load']);
  const title = createTitleScreen((choice) => {
    title.setNotice('');
    void load().then(
      (app) => app.choose(root, choice, title.difficulty(), () => root.replaceChildren(title.element)),
      () => title.setNotice('The game could not be loaded. Check the connection and try again.'),
    );
  }, disabled, chosenDifficulty() ?? DEFAULT_DIFFICULTY);
  root.replaceChildren(title.element);
  // for the load-time budget: when, since the page was asked for, the title screen went up
  performance.mark('new-world:title');
  hangPainting(root);
  void load().then((app) => title.setDescriber(app.describeDifficulty), () => undefined);
  // offline play: the built game registers a worker that keeps every file (see vite.config.ts)
  if (import.meta.env.PROD && 'serviceWorker' in navigator) void navigator.serviceWorker.register('./sw.js').catch(() => undefined);
}
