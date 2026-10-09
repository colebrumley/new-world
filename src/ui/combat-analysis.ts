// The Combat Analysis dialog (R-603): both sides' strengths and the modifiers behind them, shown
// before an attack is ordered.
import type { CombatAnalysis } from '../engine/analysis';

function column(title: string, side: CombatAnalysis['attacker'], field: string): HTMLElement {
  const box = document.createElement('div');
  box.className = 'combat-side';
  box.dataset['side'] = field;
  const head = document.createElement('h3');
  head.textContent = title;
  const name = document.createElement('p');
  name.className = 'combat-unit';
  name.textContent = `${side.name} (${side.base})`;
  const list = document.createElement('ul');
  for (const line of side.lines) {
    const item = document.createElement('li');
    item.textContent = `${line.label} ${line.percent > 0 ? '+' : ''}${line.percent}%`;
    list.append(item);
  }
  const total = document.createElement('p');
  total.className = 'combat-total';
  total.dataset['field'] = `${field}-strength`;
  total.textContent = `Strength ${side.strength}`;
  box.append(head, name, list, total);
  return box;
}

/** Show the analysis and ask whether to attack. Resolves true to attack. Enter attacks, Escape holds. */
export function askCombat(host: HTMLElement, analysis: CombatAnalysis, note = ''): Promise<boolean> {
  return new Promise((resolve) => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const backdrop = document.createElement('div');
    backdrop.className = 'dialog-backdrop';
    const box = document.createElement('div');
    box.className = 'dialog combat-analysis';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', 'Combat Analysis');
    const title = document.createElement('h2');
    title.textContent = 'Combat Analysis';
    const sides = document.createElement('div');
    sides.className = 'combat-sides';
    sides.append(column('Attacker', analysis.attacker, 'attack'), column('Defender', analysis.defender, 'defense'));
    const odds = document.createElement('p');
    odds.className = 'combat-odds';
    odds.dataset['field'] = 'combat-chance';
    odds.textContent = `Chance of victory ${analysis.chance}%${analysis.mayEvade ? ' (if they do not outrun us)' : ''}`;
    box.append(title, sides, odds);
    if (note) {
      const warning = document.createElement('p');
      warning.className = 'combat-note';
      warning.textContent = note;
      box.append(warning);
    }
    const finish = (attack: boolean): void => {
      backdrop.remove();
      previous?.focus();
      resolve(attack);
    };
    const go = document.createElement('button');
    go.type = 'button';
    go.textContent = 'Attack';
    go.addEventListener('click', () => finish(true));
    const hold = document.createElement('button');
    hold.type = 'button';
    hold.textContent = 'Hold';
    hold.addEventListener('click', () => finish(false));
    box.append(go, hold);
    box.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') finish(false);
      else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') hold.focus();
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') go.focus();
      else if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Tab') event.preventDefault();
      event.stopPropagation();
    });
    backdrop.append(box);
    host.append(backdrop);
    go.focus();
  });
}
