// A modal question with a short list of answers, in the manner of a pop-up menu.
// Arrow keys move, Enter picks, Escape picks the option marked as the escape.

export interface DialogOptions {
  readonly text: string;
  readonly choices: readonly string[];
  /** Choice highlighted first. */
  readonly initial?: number;
  /** Choice taken on Escape; without it Escape does nothing. */
  readonly escape?: number;
  /**
   * Whether a finger is offered the Close cross that does what Escape does (R-1076): on by default
   * wherever `escape` is set. Set false where the escape answer decides something (pays a tax,
   * accepts a treaty), so that no cross commits the player: the answers themselves are in reach.
   */
  readonly cross?: boolean;
  /** A picture set beside the question: whoever is asking. */
  readonly picture?: HTMLElement;
  /** Lines set as a heading over the question, for an audience or a proclamation. */
  readonly heading?: readonly string[];
  /** A picture for each choice, set before its words; null for a choice without one. */
  readonly choicePictures?: readonly (HTMLElement | null)[];
}

/**
 * The Close button of a dialog that Esc dismisses (R-1076): a cross at its top right that does
 * what Esc does. It is shown only in the compact layout or under a finger (style.css); with a
 * mouse in a full-sized window it takes no room and is not read out.
 */
export function closeButton(onClose: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'dialog-close';
  button.setAttribute('aria-label', 'Close');
  button.textContent = '\u00d7';
  button.addEventListener('click', onClose);
  return button;
}

/**
 * Keep a text field in sight while it has the focus: when it takes it, and again each time the
 * part of the window left to the page changes (a phone's keyboard coming up). Only what scrolls
 * inside the page is scrolled, never the page itself.
 */
export function keepInView(field: HTMLElement): void {
  const bring = (): void => {
    const view = window.visualViewport;
    const top = view?.offsetTop ?? 0;
    const bottom = top + (view?.height ?? window.innerHeight);
    for (let box = field.parentElement; box && box !== document.body && box !== document.documentElement; box = box.parentElement) {
      if (box.scrollHeight <= box.clientHeight) continue;
      const at = field.getBoundingClientRect();
      const frame = box.getBoundingClientRect();
      const low = Math.max(frame.top, top);
      const high = Math.min(frame.bottom, bottom);
      if (at.top < low) box.scrollTop -= low - at.top;
      else if (at.bottom > high) box.scrollTop += Math.min(at.bottom - high, at.top - low);
    }
  };
  field.addEventListener('focus', () => {
    bring();
    const view = window.visualViewport;
    if (!view) return;
    // a dialog taken away with its field still focused fires no blur: the listener goes at the next change instead
    const follow = (): void => {
      if (field.isConnected && document.activeElement === field) bring();
      else view.removeEventListener('resize', follow);
    };
    view.addEventListener('resize', follow);
    field.addEventListener('blur', () => view.removeEventListener('resize', follow), { once: true });
  });
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
      const next = (): void => buttons[(at + 1) % buttons.length]?.focus();
      const before = (): void => buttons[(at + buttons.length - 1) % buttons.length]?.focus();
      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next();
      else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') before();
      else if (event.key === 'Tab') {
        // Tab goes round the answers and never to what lies under the question: the map, or a
        // dialog it was put up over (the cheat console), which must not be worked until it is answered
        event.preventDefault();
        if (event.shiftKey) before();
        else next();
      } else if (event.key === 'Escape' && options.escape !== undefined) finish(options.escape);
      else if (event.key !== 'Enter' && event.key !== ' ') {
        event.preventDefault();
      }
      event.stopPropagation();
    });
    // nor does a press on the veil or on the question's words take the keyboard from the answers
    backdrop.addEventListener('mousedown', (event) => {
      if (!(event.target instanceof Element && event.target.closest('button'))) event.preventDefault();
    });

    if (options.escape !== undefined && options.cross !== false) {
      const escape = options.escape;
      box.append(closeButton(() => finish(escape)));
    }
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
    keepInView(input);
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
    box.append(closeButton(() => finish(null)));
    backdrop.append(box);
    host.append(backdrop);
    input.focus();
    input.select();
  });
}
