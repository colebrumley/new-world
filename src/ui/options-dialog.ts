// A dialog of check boxes for one group of options. Changes take effect as they are made;
// Esc, Enter or the button closes it.
import { closeButton } from './dialog';
import type { OptionKey, Options } from './options';

export interface OptionChoice {
  readonly key: OptionKey;
  readonly label: string;
  readonly hint: string;
}

/** Show the group over `host`. `onChange` is called with the new options each time a box is ticked or cleared. */
export function showOptions(host: HTMLElement, title: string, choices: readonly OptionChoice[], current: Options, onChange: (next: Options) => void): Promise<void> {
  return new Promise((resolve) => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    let options = current;
    const backdrop = document.createElement('div');
    backdrop.className = 'dialog-backdrop';
    const root = document.createElement('section');
    root.className = 'dialog options-dialog';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', title);
    const heading = document.createElement('h2');
    heading.textContent = title;
    root.append(heading);
    for (const choice of choices) {
      const label = document.createElement('label');
      label.className = 'option';
      if (choice.hint) label.title = choice.hint;
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = options[choice.key];
      box.dataset['option'] = choice.key;
      box.addEventListener('change', () => {
        options = { ...options, [choice.key]: box.checked };
        onChange(options);
      });
      // the hint, told by resting the pointer on the line, is also a line under the label for a finger (R-1076)
      const words = document.createElement('span');
      words.className = 'option-text';
      words.append(` ${choice.label}`);
      if (choice.hint) {
        const hint = document.createElement('span');
        hint.className = 'option-hint';
        hint.setAttribute('aria-hidden', 'true');
        hint.textContent = choice.hint;
        words.append(hint);
      }
      label.append(box, words);
      root.append(label);
    }
    const done = document.createElement('button');
    done.type = 'button';
    done.className = 'options-done';
    done.textContent = 'Done (Esc)';
    const finish = (): void => {
      backdrop.remove();
      previous?.focus();
      resolve();
    };
    done.addEventListener('click', finish);
    root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' || (event.key === 'Enter' && event.target === done)) {
        event.preventDefault();
        finish();
      }
      event.stopPropagation();
    });
    root.append(done, closeButton(finish));
    backdrop.append(root);
    host.append(backdrop);
    (root.querySelector('input') ?? done).focus();
  });
}
