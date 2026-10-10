// "Customize New World": the four world settings, three choices each.
import {
  CLIMATE_OPTIONS, DEFAULT_WORLD, LAND_FORM_OPTIONS, LAND_MASS_OPTIONS, TEMPERATURE_OPTIONS, type WorldOptions,
} from '../engine/data/mapgen';

const GROUPS = [
  { key: 'landMass', title: 'Land Mass', options: LAND_MASS_OPTIONS, labels: ['Small', 'Normal', 'Large'] },
  { key: 'landForm', title: 'Land Form', options: LAND_FORM_OPTIONS, labels: ['Archipelago', 'Normal', 'Large Continents'] },
  { key: 'temperature', title: 'Temperature', options: TEMPERATURE_OPTIONS, labels: ['Cool', 'Temperate', 'Warm'] },
  { key: 'climate', title: 'Climate', options: CLIMATE_OPTIONS, labels: ['Arid', 'Normal', 'Wet'] },
] as const;

export function createCustomizeScreen(onStart: (world: WorldOptions) => void, onCancel: () => void): HTMLElement {
  const form = document.createElement('form');
  form.className = 'title-screen customize';

  // the same sheet the title screen's menu is set on, in the same frame
  const cartouche = document.createElement('div');
  cartouche.className = 'cartouche';
  form.append(cartouche);

  const heading = document.createElement('h1');
  heading.textContent = 'Customize New World';
  cartouche.append(heading);

  for (const group of GROUPS) {
    const set = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = group.title;
    set.append(legend);
    group.options.forEach((value, i) => {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = group.key;
      input.value = value;
      input.checked = DEFAULT_WORLD[group.key] === value;
      label.append(input, ` ${group.labels[i] ?? value}`);
      set.append(label);
    });
    cartouche.append(set);
  }

  const buttons = document.createElement('div');
  buttons.className = 'customize-buttons';
  const start = document.createElement('button');
  start.type = 'submit';
  start.textContent = 'Start';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = 'Cancel';
  cancel.addEventListener('click', onCancel);
  buttons.append(start, cancel);
  cartouche.append(buttons);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const pick = <K extends keyof WorldOptions>(key: K): WorldOptions[K] => (data.get(key) ?? DEFAULT_WORLD[key]) as WorldOptions[K];
    onStart({ landMass: pick('landMass'), landForm: pick('landForm'), temperature: pick('temperature'), climate: pick('climate') });
  });
  return form;
}
