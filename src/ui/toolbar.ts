import type { PaintMode } from '../map/painting';
import type { MapData } from '../map/data';

export interface ActionButtons {
  undo?: HTMLElement | null;
  clear?: HTMLElement | null;
  zoomOut?: HTMLElement | null;
  zoomIn?: HTMLElement | null;
  zoomFit?: HTMLElement | null;
  savePng?: HTMLElement | null;
  savePdf?: HTMLElement | null;
}

export interface ActionCallbacks {
  onUndo?: () => void;
  onClear?: () => void;
  onZoomOut?: () => void;
  onZoomIn?: () => void;
  onZoomFit?: () => void;
  onSavePng?: () => void;
  onSavePdf?: () => void;
}

export interface ShortcutCallbacks {
  onUndo: () => void;
  onSelectStatusIndex: (index: number) => void;
  onSetMode: (mode: PaintMode) => void;
}

/**
 * Updates visual state of mode buttons and sets the canvas cursor.
 */
export function setToolbarMode(
  buttons: HTMLElement[],
  activeMode: PaintMode,
  boxElement?: HTMLElement | null
): void {
  buttons.forEach((btn) => {
    const isCurrent = btn.dataset.m === activeMode;
    btn.classList.toggle('on', isCurrent);
  });

  if (boxElement) {
    boxElement.style.cursor = activeMode === 'erase' ? 'not-allowed' : 'crosshair';
  }
}

/**
 * Initializes click handlers on the paint mode buttons.
 */
export function initModeButtons(
  buttons: HTMLElement[],
  initialMode: PaintMode,
  onModeChange: (mode: PaintMode) => void | boolean | Promise<void | boolean>,
  boxElement?: HTMLElement | null
): void {
  buttons.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const mode = btn.dataset.m as PaintMode | undefined;
      if (mode) {
        const accepted = await onModeChange(mode);
        if (accepted === false) return;
        setToolbarMode(buttons, mode, boxElement);
      }
    });
  });

  setToolbarMode(buttons, initialMode, boxElement);
}

/**
 * Populates map selector `<select>` with options and connects the change listener.
 */
export function initMapSelector(
  selectElement: HTMLSelectElement,
  maps: MapData[],
  selectedIndex: number,
  onSelect: (index: number) => void
): void {
  selectElement.innerHTML = '';
  maps.forEach((m, i) => {
    selectElement.add(new Option(m.n, String(i)));
  });

  selectElement.value = String(selectedIndex);
  selectElement.addEventListener('change', () => {
    onSelect(Number(selectElement.value));
  });
}

/**
 * Connects action buttons (undo, clear, zoom, fit, and map exports).
 */
export function initActionButtons(
  buttons: ActionButtons,
  callbacks: ActionCallbacks
): void {
  const repositionMenu = (
    menu: HTMLDetailsElement | null,
    panelSelector: string
  ): void => {
    if (!menu?.open) return;
    const summary = menu.querySelector<HTMLElement>('summary');
    const panel = menu.querySelector<HTMLElement>(panelSelector);
    if (!summary || !panel) return;

    const bounds = summary.getBoundingClientRect();
    const left = Math.max(
      8,
      Math.min(bounds.right - panel.offsetWidth, window.innerWidth - panel.offsetWidth - 8)
    );
    const below = bounds.bottom + 6;
    const top = below + panel.offsetHeight <= window.innerHeight - 8
      ? below
      : Math.max(8, bounds.top - panel.offsetHeight - 6);
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  };

  const exportMenu = buttons.savePng?.closest<HTMLDetailsElement>('.export-menu') ?? null;
  const clearMenu = buttons.clear?.closest<HTMLDetailsElement>('.clear-menu') ?? null;
  const repositionPopovers = (): void => {
    repositionMenu(exportMenu, '.export-menu-panel');
    repositionMenu(clearMenu, '.clear-menu-panel');
  };
  exportMenu?.addEventListener('toggle', () => repositionPopovers());
  clearMenu?.addEventListener('toggle', () => repositionPopovers());
  window.addEventListener('resize', repositionPopovers);
  window.addEventListener('scroll', repositionPopovers, true);

  if (buttons.undo && callbacks.onUndo) {
    buttons.undo.addEventListener('click', callbacks.onUndo);
  }
  if (buttons.clear && callbacks.onClear) {
    buttons.clear.addEventListener('click', () => {
      buttons.clear?.closest('details')?.removeAttribute('open');
      callbacks.onClear?.();
    });
  }
  if (buttons.zoomOut && callbacks.onZoomOut) {
    buttons.zoomOut.addEventListener('click', callbacks.onZoomOut);
  }
  if (buttons.zoomIn && callbacks.onZoomIn) {
    buttons.zoomIn.addEventListener('click', callbacks.onZoomIn);
  }
  if (buttons.zoomFit && callbacks.onZoomFit) {
    buttons.zoomFit.addEventListener('click', callbacks.onZoomFit);
  }
  if (buttons.savePng && callbacks.onSavePng) {
    buttons.savePng.addEventListener('click', () => {
      buttons.savePng?.closest('details')?.removeAttribute('open');
      callbacks.onSavePng?.();
    });
  }
  if (buttons.savePdf && callbacks.onSavePdf) {
    buttons.savePdf.addEventListener('click', () => {
      buttons.savePdf?.closest('details')?.removeAttribute('open');
      callbacks.onSavePdf?.();
    });
  }
}

/**
 * Listens for global keyboard shortcuts (Ctrl+Z for undo, 1-9/0 for statuses, F/P/E for modes).
 * Returns an unbind cleanup function.
 */
export function initKeyboardShortcuts(callbacks: ShortcutCallbacks): () => void {
  const handler = (e: KeyboardEvent) => {
    const target = e.target;
    if (
      target instanceof HTMLElement &&
      (target.isContentEditable || target.matches('input, textarea, select'))
    ) {
      return;
    }

    const key = e.key.toLowerCase();

    if ((e.ctrlKey || e.metaKey) && key === 'z') {
      e.preventDefault();
      callbacks.onUndo();
      return;
    }

    if (/^[0-9]$/.test(key)) {
      callbacks.onSelectStatusIndex(key === '0' ? 9 : Number(key) - 1);
      return;
    }

    const modeKeyMap: Record<string, PaintMode> = {
      f: 'fill',
      p: 'pin',
      e: 'erase',
    };

    if (modeKeyMap[key]) {
      callbacks.onSetMode(modeKeyMap[key]);
    }
  };

  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}
