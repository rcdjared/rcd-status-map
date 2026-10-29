import type { StatusMap } from '../map/painting';

function createActionIcon(paths: string[]): SVGSVGElement {
  const namespace = 'http://www.w3.org/2000/svg';
  const icon = document.createElementNS(namespace, 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('width', '15');
  icon.setAttribute('height', '15');
  icon.setAttribute('fill', 'none');
  icon.setAttribute('stroke', 'currentColor');
  icon.setAttribute('stroke-width', '2');
  icon.setAttribute('stroke-linecap', 'round');
  icon.setAttribute('stroke-linejoin', 'round');

  paths.forEach((pathData) => {
    const path = document.createElementNS(namespace, 'path');
    path.setAttribute('d', pathData);
    icon.appendChild(path);
  });

  return icon;
}

export interface ChipCallbacks {
  onSelect: (key: string) => void;
  onColorChange: (key: string, color: string) => void;
  onRename: (key: string) => void;
  onRemove: (key: string) => void;
  onAdd: () => void;
}

/**
 * Updates the visual selection state of all chip elements inside the container.
 */
export function selectChip(
  container: HTMLElement,
  selectedKey: string,
  statuses: StatusMap
): void {
  const chips = container.querySelectorAll<HTMLElement>('.chip');
  chips.forEach((chip) => {
    const key = chip.dataset.k;
    const isSelected = key === selectedKey;
    chip.classList.toggle('on', isSelected);
    if (key && statuses[key]) {
      chip.style.setProperty('--c', statuses[key].c);
    }
  });
}

/**
 * Updates the numerical count badge (`<b>`) inside each chip element.
 */
export function updateChipCounts(
  container: HTMLElement,
  counts: Record<string, number>
): void {
  const chips = container.querySelectorAll<HTMLElement>('.chip');
  chips.forEach((chip) => {
    const key = chip.dataset.k;
    if (key) {
      const countEl = chip.querySelector('b');
      if (countEl) {
        countEl.textContent = String(counts[key] || 0);
      }
    }
  });
}

/**
 * Renders status chips into the given container element and attaches event handlers.
 *
 * @param container The container DOM element (e.g. `#chips`)
 * @param statuses Current status configuration map
 * @param activeKey The initially selected status key (e.g. 'c')
 * @param callbacks Handlers for status selection and color picking
 */
export function renderChips(
  container: HTMLElement,
  statuses: StatusMap,
  activeKey: string,
  callbacks: ChipCallbacks
): void {
  container.innerHTML = '';

  for (const [index, key] of Object.keys(statuses).entries()) {
    const status = statuses[key];
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.dataset.k = key;
    chip.tabIndex = 0;
    if (index < 10) {
      const shortcut = index === 9 ? '0' : String(index + 1);
      chip.title = `Press ${shortcut} to select ${status.n}`;
      const shortcutHint = document.createElement('kbd');
      shortcutHint.className = 'chip-shortcut';
      shortcutHint.textContent = shortcut;
      shortcutHint.setAttribute('aria-label', `Keyboard shortcut ${shortcut}`);
      chip.appendChild(shortcutHint);
    }

    const menu = document.createElement('details');
    menu.className = 'chip-menu';
    menu.addEventListener('click', (e) => e.stopPropagation());

    const menuToggle = document.createElement('summary');
    menuToggle.setAttribute('aria-label', `Edit ${status.n} status`);
    menuToggle.title = `Edit ${status.n} status`;
    menuToggle.textContent = '⋯';

    const menuPanel = document.createElement('div');
    menuPanel.className = 'chip-menu-panel';

    const input = document.createElement('input');
    input.type = 'color';
    input.title = 'Change color';
    input.value = status.c;
    input.setAttribute('aria-label', `Change ${status.n} color`);

    const label = document.createElement('span');
    label.textContent = status.n;

    const count = document.createElement('b');
    count.textContent = '0';

    const renameBtn = document.createElement('button');
    renameBtn.type = 'button';
    renameBtn.className = 'chip-action';
    renameBtn.title = 'Rename status';
    renameBtn.setAttribute('aria-label', 'Rename status');
    renameBtn.appendChild(createActionIcon([
      'M12 20h9',
      'M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z',
    ]));

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'chip-action danger';
    removeBtn.title = 'Remove status';
    removeBtn.setAttribute('aria-label', 'Remove status');
    removeBtn.appendChild(createActionIcon([
      'M3 6h18',
      'M8 6V4h8v2',
      'M19 6l-1 14H6L5 6',
      'M10 11v6',
      'M14 11v6',
    ]));

    input.addEventListener('input', (e) => {
      e.stopPropagation();
      callbacks.onColorChange(key, input.value);
    });

    renameBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      callbacks.onRename(key);
    });

    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      callbacks.onRemove(key);
    });

    chip.addEventListener('click', () => {
      callbacks.onSelect(key);
    });

    chip.appendChild(label);
    chip.appendChild(count);
    menuPanel.appendChild(input);
    menuPanel.appendChild(renameBtn);
    menuPanel.appendChild(removeBtn);
    menu.appendChild(menuToggle);
    menu.appendChild(menuPanel);
    chip.appendChild(menu);
    container.appendChild(chip);
  }

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'chip chip-add';
  addBtn.textContent = '+ Add status';
  addBtn.addEventListener('click', () => callbacks.onAdd());
  container.appendChild(addBtn);

  selectChip(container, activeKey, statuses);
}
