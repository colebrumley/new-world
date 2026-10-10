// Title screen: a book's frontispiece. The name and five opening choices as plain DOM buttons in a
// cartouche, with the level to play at, and behind them a painting in a wood frame. The painting's
// picture is fetched after the screen is up (frontispiece.ts); what is here is only its canvas.
import { DEFAULT_DIFFICULTY, DIFFICULTIES, type Difficulty } from '../engine/data/yields';

export type TitleChoice = 'newWorld' | 'america' | 'customize' | 'load' | 'hallOfFame';

export const TITLE_CHOICES: readonly { readonly id: TitleChoice; readonly label: string }[] = [
  { id: 'newWorld', label: 'Start a Game in New World' },
  { id: 'america', label: 'Start a Game in America' },
  { id: 'customize', label: 'Customize New World' },
  { id: 'load', label: 'Load Game' },
  { id: 'hallOfFame', label: 'View Hall of Fame' },
];

export interface TitleScreen {
  readonly element: HTMLElement;
  setNotice(text: string): void;
  /** The level chosen for the next new game. */
  difficulty(): Difficulty;
  /** Supply the one-line account of a level, once the rules that know it have loaded. */
  setDescriber(describe: (difficulty: Difficulty) => string): void;
}

/** The painting behind the title screen: its size in art pixels, and the least wood left showing around it, in CSS pixels. */
export const PAINTING = { width: 320, height: 200, margin: 8 } as const;

/** How many times its own size the painting hangs in a window: a whole number, so that every art pixel is a square, and never less than once. */
export function paintingScale(windowWidth: number, windowHeight: number): number {
  const fit = Math.min((windowWidth - 2 * PAINTING.margin) / PAINTING.width, (windowHeight - 2 * PAINTING.margin) / PAINTING.height);
  return Math.max(1, Math.floor(fit));
}

/** The canvas the painting is drawn to. It is empty, and so unseen, until frontispiece.ts has painted it. */
export function createPainting(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.className = 'frontispiece';
  canvas.width = PAINTING.width;
  canvas.height = PAINTING.height;
  canvas.setAttribute('aria-hidden', 'true');
  return canvas;
}

/** Size the painting for a window: the largest whole multiple that fits. CSS centres it on the wood. */
export function fitPainting(canvas: HTMLCanvasElement, windowWidth: number, windowHeight: number): void {
  const scale = paintingScale(windowWidth, windowHeight);
  canvas.dataset['scale'] = String(scale);
  canvas.style.width = `${PAINTING.width * scale}px`;
  canvas.style.height = `${PAINTING.height * scale}px`;
}

export function createTitleScreen(onChoose: (choice: TitleChoice) => void, disabled: ReadonlySet<TitleChoice>, start: Difficulty = DEFAULT_DIFFICULTY): TitleScreen {
  const element = document.createElement('main');
  element.className = 'title-screen';

  const cartouche = document.createElement('div');
  cartouche.className = 'cartouche';
  element.append(cartouche);

  const heading = document.createElement('h1');
  heading.textContent = 'New World';
  cartouche.append(heading);

  const menu = document.createElement('div');
  menu.className = 'title-menu';
  menu.setAttribute('role', 'menu');
  for (const choice of TITLE_CHOICES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset['choice'] = choice.id;
    button.setAttribute('role', 'menuitem');
    button.textContent = choice.label;
    button.disabled = disabled.has(choice.id);
    button.addEventListener('click', () => onChoose(choice.id));
    menu.append(button);
  }
  cartouche.append(menu);

  // the level of the next new game
  const level = document.createElement('label');
  level.className = 'title-difficulty';
  level.textContent = 'Difficulty ';
  const select = document.createElement('select');
  select.name = 'difficulty';
  for (const d of DIFFICULTIES) {
    const option = document.createElement('option');
    option.value = d;
    option.textContent = d.charAt(0).toUpperCase() + d.slice(1);
    option.selected = d === start;
    select.append(option);
  }
  const blurb = document.createElement('p');
  blurb.className = 'title-difficulty-note';
  let describer: ((difficulty: Difficulty) => string) | null = null;
  const describe = (): void => {
    blurb.textContent = describer ? describer(select.value as Difficulty) : '';
  };
  select.addEventListener('change', describe);
  describe();
  level.append(select);
  cartouche.append(level, blurb);

  const notice = document.createElement('p');
  notice.className = 'title-notice';
  notice.setAttribute('aria-live', 'polite');
  cartouche.append(notice);

  return {
    element,
    setNotice(text: string): void {
      notice.textContent = text;
    },
    difficulty: () => select.value as Difficulty,
    setDescriber(next): void {
      describer = next;
      describe();
    },
  };
}
