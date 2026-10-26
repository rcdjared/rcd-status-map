import type { StatusMap } from '../map/painting';

export interface ChipCallbacks {
  onSelect: (key: string) => void;
  onColorChange: (key: string, color: string) => void;
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

  for (const key of Object.keys(statuses)) {
    const status = statuses[key];
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.dataset.k = key;
    chip.tabIndex = 0;

    const input = document.createElement('input');
    input.type = 'color';
    input.title = 'Change color';
    input.value = status.c;

    const label = document.createElement('span');
    label.textContent = status.n;

    const count = document.createElement('b');
    count.textContent = '0';

    input.addEventListener('input', (e) => {
      e.stopPropagation();
      callbacks.onColorChange(key, input.value);
    });

    chip.addEventListener('click', () => {
      callbacks.onSelect(key);
    });

    chip.appendChild(input);
    chip.appendChild(label);
    chip.appendChild(count);
    container.appendChild(chip);
  }

  selectChip(container, activeKey, statuses);
}
