// A full-screen adviser's report: a title and sections of headed lines. Esc, Enter or the button
// closes it. Each adviser builds its content as plain data (see ui/reports/*).

import { portraitCanvas, type PortraitId } from './portraits';

export interface ReportSection {
  readonly heading: string;
  /** Each line is a row of cells; a single cell spans the row. */
  readonly rows: readonly (readonly string[])[];
  /** Shown when there are no rows. */
  readonly empty?: string;
  /** For each row, the map square it is about (clicking the row goes there), or null. */
  readonly zoom?: readonly (readonly [number, number] | null)[];
  /** For each row, whose portrait stands at its head (ui/portraits.ts), or null. */
  readonly portraits?: readonly (PortraitId | null)[];
}

export interface Report {
  readonly id: string;
  readonly title: string;
  readonly sections: readonly ReportSection[];
}

/** Show the report over `host`; resolves when it is closed, with the map square of the row that was picked, if one was. */
export function showReport(host: HTMLElement, report: Report): Promise<readonly [number, number] | null> {
  return new Promise((resolve) => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = document.createElement('section');
    root.className = 'report-screen';
    root.dataset['report'] = report.id;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', report.title);
    root.tabIndex = -1;
    const title = document.createElement('h2');
    title.textContent = report.title;
    root.append(title);
    const finish = (target: readonly [number, number] | null): void => {
      root.remove();
      previous?.focus();
      resolve(target);
    };
    for (const section of report.sections) {
      const box = document.createElement('div');
      box.className = 'report-section';
      box.setAttribute('role', 'group');
      box.setAttribute('aria-label', section.heading);
      const heading = document.createElement('h3');
      heading.textContent = section.heading;
      box.append(heading);
      if (section.rows.length === 0) {
        const none = document.createElement('p');
        none.className = 'empty';
        none.textContent = section.empty ?? 'None.';
        box.append(none);
      } else {
        const table = document.createElement('table');
        section.rows.forEach((cells, rowIndex) => {
          const tr = document.createElement('tr');
          const target = section.zoom?.[rowIndex] ?? null;
          if (target) {
            tr.className = 'zoom';
            tr.tabIndex = 0;
            tr.dataset['zoom'] = `${target[0]},${target[1]}`;
            tr.title = 'Show on the map';
            tr.addEventListener('click', () => finish(target));
            tr.addEventListener('keydown', (event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              event.stopPropagation();
              finish(target);
            });
          }
          const face = section.portraits?.[rowIndex] ?? null;
          if (face) tr.classList.add('pictured');
          cells.forEach((cell, index) => {
            const td = document.createElement(index === 0 ? 'th' : 'td');
            if (index === 0) td.scope = 'row';
            if (cells.length === 1) td.colSpan = 4;
            td.textContent = cell;
            if (face && index === 0) td.prepend(portraitCanvas(face));
            tr.append(td);
          });
          table.append(tr);
        });
        box.append(table);
      }
      root.append(box);
    }
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'report-close';
    close.textContent = 'Close (Esc)';
    close.addEventListener('click', () => finish(null));
    root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' || event.key === 'Enter') {
        event.preventDefault();
        finish(null);
      }
      event.stopPropagation();
    });
    root.append(close);
    host.append(root);
    close.focus();
  });
}
