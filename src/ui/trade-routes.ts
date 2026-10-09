// Trade route itinerary editor: up to four stops, each with the cargoes to unload and to load.
import { GOOD_IDS, GOOD_NAMES, type GoodId } from '../engine/data/goods';
import { TRADE_ROUTES } from '../engine/data/trade-routes';
import type { RouteStop } from '../engine/state';

export interface RouteDraft {
  readonly name: string;
  readonly stops: readonly RouteStop[];
}

export interface RouteEditorOptions {
  readonly title: string;
  readonly name: string;
  readonly colonies: readonly { readonly id: string; readonly name: string }[];
  readonly stops: readonly RouteStop[];
}

/** Show the editor over `host`; resolves with the edited route, or null if cancelled. */
export function editRoute(host: HTMLElement, options: RouteEditorOptions): Promise<RouteDraft | null> {
  return new Promise((resolve) => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const backdrop = document.createElement('div');
    backdrop.className = 'dialog-backdrop';
    const form = document.createElement('form');
    form.className = 'dialog route-editor';
    form.setAttribute('role', 'dialog');
    form.setAttribute('aria-label', options.title);

    const heading = document.createElement('h2');
    heading.textContent = options.title;
    const nameLabel = document.createElement('label');
    nameLabel.textContent = 'Name';
    const name = document.createElement('input');
    name.type = 'text';
    name.maxLength = 24;
    name.value = options.name;
    nameLabel.append(name);
    form.append(heading, nameLabel);

    const table = document.createElement('table');
    const head = table.createTHead().insertRow();
    for (const title of ['Stop', 'Destination', 'Unload', 'Load']) head.appendChild(document.createElement('th')).textContent = title;
    const rows: { colony: HTMLSelectElement; unload: HTMLSelectElement; load: HTMLSelectElement }[] = [];
    const cargoList = (label: string, chosen: readonly GoodId[]): HTMLSelectElement => {
      const select = document.createElement('select');
      select.multiple = true;
      select.size = 4;
      select.setAttribute('aria-label', label);
      for (const good of GOOD_IDS) {
        const option = new Option(GOOD_NAMES[good], good);
        option.selected = chosen.includes(good);
        select.append(option);
      }
      return select;
    };
    for (let i = 0; i < TRADE_ROUTES.maxStops; i++) {
      const stop = options.stops[i];
      const row = table.insertRow();
      row.insertCell().textContent = String(i + 1);
      const colony = document.createElement('select');
      colony.setAttribute('aria-label', `Destination ${i + 1}`);
      colony.append(new Option('(none)', ''));
      for (const c of options.colonies) colony.append(new Option(c.name, c.id));
      colony.value = stop?.colonyId ?? '';
      const unload = cargoList(`Unload at stop ${i + 1}`, stop?.unload ?? []);
      const load = cargoList(`Load at stop ${i + 1}`, stop?.load ?? []);
      row.insertCell().append(colony);
      row.insertCell().append(unload);
      row.insertCell().append(load);
      rows.push({ colony, unload, load });
    }
    form.append(table);

    const problem = document.createElement('p');
    problem.className = 'route-problem';
    problem.setAttribute('aria-live', 'polite');
    const save = document.createElement('button');
    save.type = 'submit';
    save.textContent = 'Save route';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    form.append(problem, save, cancel);

    const finish = (value: RouteDraft | null): void => {
      backdrop.remove();
      previous?.focus();
      resolve(value);
    };
    const picked = (select: HTMLSelectElement): GoodId[] => [...select.selectedOptions].map((o) => o.value as GoodId);
    cancel.addEventListener('click', () => finish(null));
    form.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') finish(null);
      event.stopPropagation();
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const stops: RouteStop[] = rows.filter((r) => r.colony.value !== '').map((r) => ({ colonyId: r.colony.value, unload: picked(r.unload), load: picked(r.load) }));
      if (stops.length === 0) problem.textContent = 'Choose at least one destination.';
      else if (stops.some((s) => s.unload.length > TRADE_ROUTES.maxCargoesPerList || s.load.length > TRADE_ROUTES.maxCargoesPerList)) {
        problem.textContent = `No more than ${TRADE_ROUTES.maxCargoesPerList} cargoes in a list.`;
      } else if (name.value.trim() === '') problem.textContent = 'Give the route a name.';
      else finish({ name: name.value.trim(), stops });
    });

    backdrop.append(form);
    host.append(backdrop);
    name.focus();
  });
}
