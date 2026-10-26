// 1. Styles
import './style.css';

// 2. Map data
import { MAPS } from './map/data';

// 3. Canvas and painting logic
import {
  loadMap,
  setupCanvases,
  drawBaseMap,
  calculateZoom,
  applyZoom,
  screenToMapCoords,
  createPanState,
  handlePanMove,
  compositeForExport,
  type CanvasGroup,
  type PanDragState,
} from './map/canvas';
import { region } from './map/flood-fill';
import {
  DEFAULT_STATUSES,
  drawMarks,
  handleMapClick,
  type Mark,
  type PaintMode,
  type StatusMap,
} from './map/painting';

// 4. UI functions
import { renderChips, selectChip, updateChipCounts } from './ui/chips';
import { showToast } from './ui/toast';
import {
  initActionButtons,
  initKeyboardShortcuts,
  initMapSelector,
  initModeButtons,
  setToolbarMode,
} from './ui/toolbar';

// DOM Elements
const baseCanvas = document.querySelector<HTMLCanvasElement>('#base')!;
const fillCanvas = document.querySelector<HTMLCanvasElement>('#fill')!;
const pinsCanvas = document.querySelector<HTMLCanvasElement>('#pins')!;
const canvases: CanvasGroup = { base: baseCanvas, fill: fillCanvas, pins: pinsCanvas };

const box = document.querySelector<HTMLElement>('#box')!;
const stage = document.querySelector<HTMLElement>('#stage')!;
const chipsContainer = document.querySelector<HTMLElement>('#chips')!;
const mapSelect = document.querySelector<HTMLSelectElement>('#mp')!;
const loadingIndicator = document.querySelector<HTMLElement>('#ld')!;
const toastElement = document.querySelector<HTMLElement>('#t')!;

const modeButtons = Array.from(document.querySelectorAll<HTMLElement>('button[data-m]'));
const undoBtn = document.querySelector<HTMLElement>('#un');
const clearBtn = document.querySelector<HTMLElement>('#cl');
const zoomOutBtn = document.querySelector<HTMLElement>('#zo');
const zoomInBtn = document.querySelector<HTMLElement>('#zi');
const zoomFitBtn = document.querySelector<HTMLElement>('#zf');
const savePngBtn = document.querySelector<HTMLElement>('#png');

// State
const COLOR_STORAGE_KEY = 'rrh-colors-v1';
const statuses: StatusMap = {
  c: { ...DEFAULT_STATUSES.c },
  o: { ...DEFAULT_STATUSES.o },
  a: { ...DEFAULT_STATUSES.a },
};

let currentMapIndex = 0;
let mapToken = 0;
let mapWidth = 0;
let mapHeight = 0;
let pinRadius = 0;
let barrierMap: Uint8Array | null = null;

let marks: Mark[] = [];
let history: Mark[][] = [];
let legendPos: [number, number] = [0, 0];
let currentStatus = 'c';
let currentMode: PaintMode = 'fill';
let currentZoom = 1;

let panState: PanDragState | null = null;
let pointerMoved = false;

// Helpers
function getStorageKey(): string {
  const mapId = MAPS[currentMapIndex].id;
  return mapId === 'balayan' ? 'rrh-balayan-status-v1' : `rrh-status-v1-${mapId}`;
}

function saveState(): void {
  try {
    const serializedMarks = marks.map(({ t, x, y, s }) => ({ t, x, y, s }));
    localStorage.setItem(getStorageKey(), JSON.stringify({ marks: serializedMarks, lg: legendPos }));
    const savedColors = Object.fromEntries(
      Object.entries(statuses).map(([k, v]) => [k, v.c])
    );
    localStorage.setItem(COLOR_STORAGE_KEY, JSON.stringify(savedColors));
  } catch {
    // Ignore storage quota errors
  }
}

function snapshot(): void {
  history.push([...marks]);
  if (history.length > 100) {
    history.shift();
  }
}

function renderAll(): void {
  if (!mapWidth || !mapHeight) return;
  const fillCtx = fillCanvas.getContext('2d')!;
  const pinsCtx = pinsCanvas.getContext('2d')!;
  const counts = drawMarks(
    fillCtx,
    pinsCtx,
    marks,
    statuses,
    legendPos,
    mapWidth,
    mapHeight,
    pinRadius
  );
  updateChipCounts(chipsContainer, counts);
}

function setZoom(factor: number): void {
  if (!mapWidth) return;
  currentZoom = calculateZoom(currentZoom, factor, stage.clientWidth, mapWidth);
  applyZoom(box, mapWidth, currentZoom);
}

function undo(): void {
  if (history.length > 0) {
    marks = history.pop()!;
    renderAll();
    saveState();
  }
}

function setStatus(key: string): void {
  if (statuses[key]) {
    currentStatus = key;
    selectChip(chipsContainer, currentStatus, statuses);
  }
}

function setMode(mode: PaintMode): void {
  currentMode = mode;
  setToolbarMode(modeButtons, currentMode, box);
}

// Map Loading
async function openMap(index: number): Promise<void> {
  currentMapIndex = index;
  const thisToken = ++mapToken;

  loadingIndicator.style.display = 'grid';
  barrierMap = null;
  history = [];
  marks = [];
  legendPos = [...MAPS[index].lg];

  // Restore saved marks and legend position
  try {
    const raw = localStorage.getItem(getStorageKey());
    if (raw) {
      const parsed = JSON.parse(raw);
      marks = Array.isArray(parsed) ? parsed : parsed.marks || [];
      if (parsed && parsed.lg) {
        legendPos = parsed.lg;
      }
    }
  } catch {
    // Ignore corrupt storage
  }

  try {
    localStorage.setItem('rrh-last', MAPS[index].id);
  } catch {
    // Ignore storage errors
  }

  try {
    const img = await loadMap(MAPS[index]);
    if (thisToken !== mapToken) return;

    const dims = setupCanvases(canvases, img.width, img.height);
    mapWidth = dims.width;
    mapHeight = dims.height;
    pinRadius = dims.pinRadius;

    barrierMap = drawBaseMap(baseCanvas, img);

    // Reconstruct lot spans for stored fill marks
    marks = marks.filter((m) => {
      if (m.t === 'p') return true;
      const spans = region(m.x, m.y, mapWidth, mapHeight, barrierMap!);
      if (spans) {
        m.sp = spans;
        return true;
      }
      return false;
    });

    loadingIndicator.style.display = 'none';
    stage.scrollTo(0, 0);
    setZoom(0);
    renderAll();
  } catch (err) {
    console.error('Failed to load map image:', err);
    loadingIndicator.textContent = 'Failed to load map.';
  }
}

// 5. Event Listeners
// Canvas click for painting, erasing, pinning, moving legend
box.addEventListener('click', (e: MouseEvent) => {
  if (pointerMoved || !barrierMap || !mapWidth || !mapHeight) return;

  const { x, y } = screenToMapCoords(e.clientX, e.clientY, box, mapWidth, mapHeight);

  if (currentMode === 'lg') {
    legendPos = [Math.min(x / mapWidth, 0.73), Math.min(y / mapHeight, 0.935)];
    renderAll();
    saveState();
    return;
  }

  const result = handleMapClick(
    currentMode,
    x,
    y,
    currentStatus,
    marks,
    barrierMap,
    mapWidth,
    mapHeight,
    pinRadius
  );

  if (result.error) {
    showToast(toastElement, result.error);
    return;
  }

  if (result.actionTaken) {
    snapshot();
    marks = result.updatedMarks;
    renderAll();
    saveState();
  }
});

// Drag to Pan
stage.addEventListener('pointerdown', (e: PointerEvent) => {
  pointerMoved = false;
  panState = createPanState(e, stage);
});

window.addEventListener('pointermove', (e: PointerEvent) => {
  if (!panState) return;
  const moved = handlePanMove(panState, e, stage);
  if (moved) {
    pointerMoved = true;
  }
});

window.addEventListener('pointerup', () => {
  panState = null;
});

// UI Toolbar & Mode buttons
initModeButtons(modeButtons, currentMode, (newMode) => {
  currentMode = newMode;
}, box);

initActionButtons(
  {
    undo: undoBtn,
    clear: clearBtn,
    zoomOut: zoomOutBtn,
    zoomIn: zoomInBtn,
    zoomFit: zoomFitBtn,
    savePng: savePngBtn,
  },
  {
    onUndo: undo,
    onClear: () => {
      if (marks.length > 0) {
        snapshot();
        marks = [];
        renderAll();
        saveState();
      }
    },
    onZoomOut: () => setZoom(0.8),
    onZoomIn: () => setZoom(1.25),
    onZoomFit: () => setZoom(0),
    onSavePng: () => {
      if (!mapWidth || !mapHeight) return;
      const compositeCanvas = compositeForExport(canvases, mapWidth, mapHeight);
      compositeCanvas.toBlob(async (blob) => {
        if (!blob) return;
        const filename = `RCD-${MAPS[currentMapIndex].id}-status-map.png`;
        try {
          const claude = (window as unknown as { claude?: { use: (svc: string) => Promise<{ save: (opts: { filename: string; data: Blob }) => Promise<void> }> } }).claude;
          const downloads = claude && (await claude.use('downloads'));
          if (downloads) {
            await downloads.save({ filename, data: blob });
            return;
          }
        } catch {
          // Fall through to browser native download
        }

        const a = document.createElement('a');
        a.download = filename;
        a.href = URL.createObjectURL(blob);
        a.click();
        URL.revokeObjectURL(a.href);
      }, 'image/png');
    },
  }
);

// Keyboard Shortcuts (Ctrl+Z, 1 2 3 status, F/P/E modes)
const statusKeys = ['c', 'o', 'a'];
initKeyboardShortcuts({
  onUndo: undo,
  onSelectStatusIndex: (index) => {
    if (statusKeys[index]) {
      setStatus(statusKeys[index]);
    }
  },
  onSetMode: (mode) => setMode(mode),
});

// 6. Initialize App
try {
  const savedColors = JSON.parse(localStorage.getItem(COLOR_STORAGE_KEY) || '{}');
  for (const k in savedColors) {
    if (statuses[k]) {
      statuses[k].c = savedColors[k];
    }
  }
  const lastMapId = localStorage.getItem('rrh-last');
  const foundIndex = MAPS.findIndex((m) => m.id === lastMapId);
  currentMapIndex = Math.max(0, foundIndex);
} catch {
  // Ignore storage errors
}

// Render status chips
renderChips(chipsContainer, statuses, currentStatus, {
  onSelect: (key) => setStatus(key),
  onColorChange: (key, newColor) => {
    if (statuses[key]) {
      statuses[key].c = newColor;
      setStatus(currentStatus);
      renderAll();
      saveState();
    }
  },
});

// Populate map selector and load initial map
initMapSelector(mapSelect, MAPS, currentMapIndex, (newIndex) => {
  openMap(newIndex);
});

// Initial map load
openMap(currentMapIndex);
