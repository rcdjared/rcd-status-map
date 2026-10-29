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
  onSelectStatusIndex: (index: number) => void; // 1 -> index 0 ('c'), 2 -> index 1 ('o'), 3 -> index 2 ('a')
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
  onModeChange: (mode: PaintMode) => void,
  boxElement?: HTMLElement | null
): void {
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.m as PaintMode | undefined;
      if (mode) {
        setToolbarMode(buttons, mode, boxElement);
        onModeChange(mode);
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
  if (buttons.undo && callbacks.onUndo) {
    buttons.undo.addEventListener('click', callbacks.onUndo);
  }
  if (buttons.clear && callbacks.onClear) {
    buttons.clear.addEventListener('click', callbacks.onClear);
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
    buttons.savePng.addEventListener('click', callbacks.onSavePng);
  }
  if (buttons.savePdf && callbacks.onSavePdf) {
    buttons.savePdf.addEventListener('click', callbacks.onSavePdf);
  }
}

/**
 * Listens for global keyboard shortcuts (Ctrl+Z for undo, 1/2/3 for statuses, F/P/E for modes).
 * Returns an unbind cleanup function.
 */
export function initKeyboardShortcuts(callbacks: ShortcutCallbacks): () => void {
  const handler = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;

    const key = e.key.toLowerCase();

    if ((e.ctrlKey || e.metaKey) && key === 'z') {
      e.preventDefault();
      callbacks.onUndo();
      return;
    }

    if (key === '1' || key === '2' || key === '3') {
      callbacks.onSelectStatusIndex(Number(key) - 1);
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
