// Title screen: the original's five opening choices as plain DOM buttons, and the level to play at.
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

export function createTitleScreen(onChoose: (choice: TitleChoice) => void, disabled: ReadonlySet<TitleChoice>, start: Difficulty = DEFAULT_DIFFICULTY): TitleScreen {
  const element = document.createElement('main');
  element.className = 'title-screen';

  const heading = document.createElement('h1');
  heading.textContent = 'New World';
  element.append(heading);

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
  element.append(menu);

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
  element.append(level, blurb);

  const notice = document.createElement('p');
  notice.className = 'title-notice';
  notice.setAttribute('aria-live', 'polite');
  element.append(notice);

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
