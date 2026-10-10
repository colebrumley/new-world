// The encyclopedia screen: an index of every entry by category on the left, the chosen page on
// the right. Esc or the button closes it.
import type { FatherId } from '../engine/data/fathers';
import { pediaIndex, pediaPage, type PediaCategory } from './pedia';
import { portraitCanvas } from './portraits';

export interface PediaTarget {
  readonly category: PediaCategory;
  readonly id: string;
}

/** Show the encyclopedia over `host`, open at `start` if given; resolves when it is closed. */
export function showPedia(host: HTMLElement, start: PediaTarget | null = null): Promise<void> {
  return new Promise((resolve) => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = document.createElement('section');
    root.className = 'report-screen pedia-screen';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Encyclopedia');
    root.tabIndex = -1;
    const heading = document.createElement('h2');
    heading.textContent = 'Encyclopedia';
    const body = document.createElement('div');
    body.className = 'pedia-body';
    const nav = document.createElement('nav');
    nav.className = 'pedia-index';
    nav.setAttribute('aria-label', 'Entries');
    const page = document.createElement('article');
    page.className = 'pedia-page';
    page.setAttribute('aria-live', 'polite');

    const show = (target: PediaTarget): void => {
      const found = pediaPage(target.category, target.id);
      if (!found) return;
      root.dataset['entry'] = `${target.category}:${target.id}`;
      for (const b of nav.querySelectorAll('button')) b.setAttribute('aria-current', String(b.dataset['entry'] === root.dataset['entry']));
      const title = document.createElement('h3');
      title.textContent = found.title;
      const facts = document.createElement('table');
      for (const [label, value] of found.facts) {
        const tr = document.createElement('tr');
        const th = document.createElement('th');
        th.scope = 'row';
        th.textContent = label;
        const td = document.createElement('td');
        td.textContent = value;
        tr.append(th, td);
        facts.append(tr);
      }
      // a founding father's page opens with his portrait
      const face = found.category === 'fathers' ? [portraitCanvas(found.id as FatherId, 2)] : [];
      page.replaceChildren(title, ...face, ...(found.facts.length > 0 ? [facts] : []), ...found.prose.map((text) => {
        const p = document.createElement('p');
        p.textContent = text;
        return p;
      }));
    };

    for (const group of pediaIndex()) {
      const box = document.createElement('div');
      box.className = 'pedia-group';
      box.setAttribute('role', 'group');
      box.setAttribute('aria-label', group.title);
      const name = document.createElement('h3');
      name.textContent = group.title;
      box.append(name);
      for (const entry of group.entries) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = entry.title;
        b.dataset['entry'] = `${group.category}:${entry.id}`;
        b.addEventListener('click', () => show({ category: group.category, id: entry.id }));
        box.append(b);
      }
      nav.append(box);
    }

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'report-close';
    close.textContent = 'Close (Esc)';
    const finish = (): void => {
      root.remove();
      previous?.focus();
      resolve();
    };
    close.addEventListener('click', finish);
    root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        finish();
      }
      event.stopPropagation();
    });
    root.addEventListener('contextmenu', (event) => event.preventDefault());
    body.append(nav, page);
    root.append(heading, body, close);
    host.append(root);
    show(start ?? { category: 'concepts', id: 'prices' });
    const current = nav.querySelector<HTMLButtonElement>('button[aria-current="true"]');
    current?.scrollIntoView({ block: 'center' });
    (current ?? close).focus();
  });
}
