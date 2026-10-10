// "Choose a European Power" (R-1017): the screen between the title and the map, in the title's
// frame. The four powers as a radio group of cards, an account of the one chosen, what it lands
// with (computed from the rules, never typed), and the player's name. Nothing here touches the
// browser store or the page URL: boot.ts supplies the defaults and keeps the choice.
import { NATION_IDS, NATIONS, type NationId } from '../engine/data/nations';
import { PROFESSIONS, type ProfessionId } from '../engine/data/professions';
import { UNIT_TYPES, type UnitTypeId } from '../engine/data/units';
import type { Difficulty } from '../engine/data/yields';
import { landingParty } from '../engine/game';
import { drawSprite, flagArt } from './pixel-art';

export interface PowerChoice {
  readonly nation: NationId;
  readonly name: string;
}

export interface PowerScreenOptions {
  /** The power selected first. */
  readonly nation: NationId;
  /** A name already given (on the page URL): kept whichever power is chosen. */
  readonly name?: string | null;
  /** Names given before under each power, shown in place of the leader's. */
  readonly names?: Partial<Readonly<Record<NationId, string>>>;
  readonly difficulty: Difficulty;
  onStart(choice: PowerChoice): void;
  onBack(): void;
}

/** The flag's grid is 16 art pixels; the screen shows each at this many pixels. */
const FLAG_SCALE = 3;
export const NAME_LENGTH = 24;

/** "Veteran Soldier" when the skill is the role's own, else the role: "Soldier". */
const roleName = (type: UnitTypeId, profession: ProfessionId): string =>
  PROFESSIONS[profession].expertRole === type ? PROFESSIONS[profession].name : UNIT_TYPES[type].name;

/** "Caravel, Veteran Soldier, Pioneer": what a human power lands with at this level. */
export function landsWith(nation: NationId, difficulty: Difficulty): string {
  const party = landingParty(nation, 'human', difficulty);
  return [UNIT_TYPES[party.ship].name, roleName('soldier', party.soldier), roleName('pioneer', party.pioneer)].join(', ');
}

/** A power's flag on a small canvas, three screen pixels to the art pixel and never smoothed. */
function flagCanvas(nation: NationId): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const art = flagArt(nation);
  // the flag fills rows 2 to 13 of its 16-row grid: the canvas holds just those
  canvas.width = art.size * FLAG_SCALE;
  canvas.height = 12 * FLAG_SCALE;
  canvas.className = 'power-flag';
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.imageSmoothingEnabled = false;
    drawSprite(ctx, art, 0, -2 * FLAG_SCALE, art.size * FLAG_SCALE);
  }
  return canvas;
}

export function createPowerScreen(options: PowerScreenOptions): HTMLElement {
  const form = document.createElement('form');
  form.className = 'title-screen power';

  const cartouche = document.createElement('div');
  cartouche.className = 'cartouche';
  form.append(cartouche);

  const heading = document.createElement('h1');
  heading.id = 'power-heading';
  heading.textContent = 'Choose a European Power';
  cartouche.append(heading);

  let selected: NationId = options.nation;
  /** Set once the player has typed: the name then stays whichever power is chosen. */
  let typed = typeof options.name === 'string' && options.name.trim() !== '';
  const prefill = (nation: NationId): string => options.names?.[nation] ?? NATIONS[nation].leader;

  const list = document.createElement('div');
  list.className = 'power-list';
  list.setAttribute('role', 'radiogroup');
  list.setAttribute('aria-labelledby', heading.id);
  const rows = new Map<NationId, HTMLButtonElement>();
  for (const nation of NATION_IDS) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'power-row';
    row.setAttribute('role', 'radio');
    row.dataset['nation'] = nation;
    row.value = nation;
    const name = document.createElement('span');
    name.className = 'power-name';
    name.textContent = NATIONS[nation].name;
    const leader = document.createElement('span');
    leader.className = 'power-leader';
    leader.textContent = `${NATIONS[nation].leader} \u00b7 ${NATIONS[nation].homePort}`;
    const strength = document.createElement('span');
    strength.className = 'power-strength';
    strength.textContent = NATIONS[nation].strength;
    row.append(flagCanvas(nation), name, leader, strength);
    row.addEventListener('click', () => select(nation, true));
    list.append(row);
    rows.set(nation, row);
  }
  cartouche.append(list);

  const account = document.createElement('p');
  account.className = 'power-account';
  account.setAttribute('aria-live', 'polite');
  const lands = document.createElement('p');
  lands.className = 'power-lands';
  cartouche.append(account, lands);

  const label = document.createElement('label');
  label.className = 'power-name-field';
  label.textContent = 'Your name ';
  const input = document.createElement('input');
  input.type = 'text';
  input.name = 'name';
  input.maxLength = NAME_LENGTH;
  input.autocomplete = 'off';
  input.value = typed ? (options.name as string).trim().slice(0, NAME_LENGTH) : prefill(selected);
  input.addEventListener('input', () => {
    typed = true;
  });
  label.append(input);
  cartouche.append(label);

  const buttons = document.createElement('div');
  buttons.className = 'customize-buttons';
  const start = document.createElement('button');
  start.type = 'submit';
  start.textContent = 'Set Sail';
  const back = document.createElement('button');
  back.type = 'button';
  back.textContent = 'Back';
  back.addEventListener('click', options.onBack);
  buttons.append(start, back);
  cartouche.append(buttons);

  function select(nation: NationId, focus: boolean): void {
    selected = nation;
    for (const [id, row] of rows) {
      const on = id === nation;
      row.setAttribute('aria-checked', on ? 'true' : 'false');
      row.tabIndex = on ? 0 : -1;
      if (on && focus) row.focus();
    }
    account.textContent = NATIONS[nation].account;
    lands.textContent = `Lands with: ${landsWith(nation, options.difficulty)}`;
    if (!typed) input.value = prefill(nation);
  }
  select(selected, false);

  // the radio group's keys: arrows and the digits move the selection, Enter sets sail
  list.addEventListener('keydown', (event) => {
    const at = NATION_IDS.indexOf(selected);
    const digit = Number(event.key);
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') select(NATION_IDS[(at + 1) % NATION_IDS.length] as NationId, true);
    else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') select(NATION_IDS[(at + NATION_IDS.length - 1) % NATION_IDS.length] as NationId, true);
    else if (Number.isInteger(digit) && digit >= 1 && digit <= NATION_IDS.length) select(NATION_IDS[digit - 1] as NationId, true);
    else if (event.key === 'Enter') form.requestSubmit();
    else return;
    event.preventDefault();
  });
  form.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    options.onBack();
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = input.value.trim().slice(0, NAME_LENGTH);
    options.onStart({ nation: selected, name: name === '' ? NATIONS[selected].leader : name });
  });
  return form;
}
