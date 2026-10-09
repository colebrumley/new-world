// The Save/Load Game dialog: ten slots, with export to and import from a file.

export interface SlotRow {
  readonly index: number;
  readonly label: string;
  readonly summary: string | null;
  readonly writable: boolean;
  readonly problem: string | null;
}

export type SaveChoice =
  | { readonly kind: 'save'; readonly slot: number }
  | { readonly kind: 'load'; readonly slot: number }
  | { readonly kind: 'export' }
  | { readonly kind: 'import'; readonly text: string };

/** Show the dialog over `host`. With `canSave` false (the title screen) only loading and import are offered. Resolves with what was chosen, or null. */
export function showSaveLoad(host: HTMLElement, slots: readonly SlotRow[], canSave: boolean, notice = ''): Promise<SaveChoice | null> {
  return new Promise((resolve) => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const backdrop = document.createElement('div');
    backdrop.className = 'dialog-backdrop';
    const root = document.createElement('section');
    root.className = 'dialog save-dialog';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', canSave ? 'Save or Load Game' : 'Load Game');
    const heading = document.createElement('h2');
    heading.textContent = canSave ? 'Save or Load Game' : 'Load Game';
    root.append(heading);
    const finish = (choice: SaveChoice | null): void => {
      backdrop.remove();
      previous?.focus();
      resolve(choice);
    };
    const button = (text: string, onClick: () => void, disabled = false): HTMLButtonElement => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = text;
      b.disabled = disabled;
      b.addEventListener('click', onClick);
      return b;
    };
    const table = document.createElement('table');
    for (const slot of slots) {
      const tr = document.createElement('tr');
      tr.dataset['slot'] = String(slot.index);
      const name = document.createElement('th');
      name.scope = 'row';
      name.textContent = slot.label;
      const what = document.createElement('td');
      what.className = 'slot-summary';
      what.textContent = slot.problem ?? slot.summary ?? 'Empty';
      const acts = document.createElement('td');
      if (canSave && slot.writable) acts.append(button('Save', () => finish({ kind: 'save', slot: slot.index })));
      acts.append(button('Load', () => finish({ kind: 'load', slot: slot.index }), slot.summary === null || slot.problem !== null));
      for (const b of acts.querySelectorAll('button')) b.setAttribute('aria-label', `${b.textContent} ${slot.label}`);
      tr.append(name, what, acts);
      table.append(tr);
    }
    root.append(table);

    const files = document.createElement('div');
    files.className = 'save-files';
    const picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = '.json,application/json';
    picker.hidden = true;
    picker.addEventListener('change', () => {
      const file = picker.files?.[0];
      if (!file) return;
      void file.text().then((text) => finish({ kind: 'import', text }));
    });
    if (canSave) files.append(button('Export to a file', () => finish({ kind: 'export' })));
    files.append(button('Import from a file', () => picker.click()), picker);
    root.append(files);

    const status = document.createElement('p');
    status.className = 'save-notice';
    status.setAttribute('aria-live', 'polite');
    status.textContent = notice;
    root.append(status);

    const close = button('Close (Esc)', () => finish(null));
    close.className = 'save-close';
    root.append(close);
    root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        finish(null);
      }
      event.stopPropagation();
    });
    backdrop.append(root);
    host.append(backdrop);
    close.focus();
  });
}
