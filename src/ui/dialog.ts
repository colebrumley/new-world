// A modal question with a short list of answers, in the manner of a pop-up menu.
// Arrow keys move, Enter picks, Escape picks the option marked as the escape.

export interface DialogOptions {
  readonly text: string;
  readonly choices: readonly string[];
  /** Choice highlighted first. */
  readonly initial?: number;
  /** Choice taken on Escape; without it Escape does nothing. */
  readonly escape?: number;
  /** A picture set beside the question: whoever is asking. */
  readonly picture?: HTMLElement;
  /** Lines set as a heading over the question, for an audience or a proclamation. */
  readonly heading?: readonly string[];
  /** A picture for each choice, set before its words; null for a choice without one. */
  readonly choicePictures?: readonly (HTMLElement | null)[];
}

/** Show the question over `host` and resolve with the index of the answer picked. */
export function ask(host: HTMLElement, options: DialogOptions): Promise<number> {
  return new Promise((resolve) => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const backdrop = document.createElement('div');
    backdrop.className = 'dialog-backdrop';
    const box = document.createElement('div');
    box.className = 'dialog';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    const text = document.createElement('p');
    text.textContent = options.text;
    if (options.picture) {
      box.classList.add('dialog-pictured');
      box.append(options.picture);
    }
    if (options.heading && options.heading.length > 0) {
      const heading = document.createElement('h2');
      heading.className = 'dialog-heading';
      options.heading.forEach((line, i) => {
        if (i > 0) heading.append(document.createElement('br'));
        heading.append(line);
      });
      box.append(heading);
    }
    box.append(text);

    const buttons = options.choices.map((label, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      const picture = options.choicePictures?.[index];
      if (picture) {
        button.classList.add('pictured');
        button.prepend(picture);
      }
      button.addEventListener('click', () => finish(index));
      box.append(button);
      return button;
    });

    function finish(index: number): void {
      backdrop.remove();
      previous?.focus();
      resolve(index);
    }

    box.addEventListener('keydown', (event) => {
      const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') buttons[(at + 1) % buttons.length]?.focus();
      else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') buttons[(at + buttons.length - 1) % buttons.length]?.focus();
      else if (event.key === 'Escape' && options.escape !== undefined) finish(options.escape);
      else if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Tab') {
        event.preventDefault();
      }
      event.stopPropagation();
    });

    backdrop.append(box);
    host.append(backdrop);
    buttons[options.initial ?? 0]?.focus();
  });
}

export interface TextDialogOptions {
  readonly text: string;
  readonly initial: string;
  readonly maxLength?: number;
}

/** Ask for a line of text. Resolves with the text on Enter, or null on Escape. */
export function askText(host: HTMLElement, options: TextDialogOptions): Promise<string | null> {
  return new Promise((resolve) => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const backdrop = document.createElement('div');
    backdrop.className = 'dialog-backdrop';
    const box = document.createElement('form');
    box.className = 'dialog';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    const label = document.createElement('label');
    label.textContent = options.text;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = options.initial;
    input.maxLength = options.maxLength ?? 24;
    label.append(input);
    const ok = document.createElement('button');
    ok.type = 'submit';
    ok.textContent = 'OK';
    box.append(label, ok);

    const finish = (value: string | null): void => {
      backdrop.remove();
      previous?.focus();
      resolve(value);
    };
    box.addEventListener('submit', (event) => {
      event.preventDefault();
      finish(input.value);
    });
    box.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') finish(null);
      event.stopPropagation();
    });
    backdrop.append(box);
    host.append(backdrop);
    input.focus();
    input.select();
  });
}
