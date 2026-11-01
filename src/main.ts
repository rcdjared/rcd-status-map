// 1. Styles
import './style.css';
import './redesign.css';

// 2. Map data
import { MAPS } from './map/data';

// 3. Canvas and painting logic
import {
  loadMap,
  setupCanvases,
  drawBaseMap,
  applyZoom,
  applyTransform,
  fitMap,
  zoomAtCursor,
  screenToMapCoords,
  compositeForExport,
  type CanvasGroup,
} from './map/canvas';
import { region } from './map/flood-fill';
import {
  DEFAULT_STATUSES,
  drawMarks,
  getLegendBounds,
  handleMapClick,
  type Mark,
  type PaintMode,
  type StatusMap,
} from './map/painting';

// 4. API & UI functions
import type { User } from '@supabase/supabase-js';
import {
  supabase,
  getUserRole,
  loadProjectLegendPosition,
  loadProjectStatusConfig,
  saveProjectStatusConfig,
  saveProjectLegendPosition,
  subscribeToProjectStatusConfig,
  type Project,
  type ProjectStatusConfig,
} from './api/supabase';
import {
  loadMarks,
  saveMark,
  updateMark,
  undoStatusChange,
  deleteMark,
  clearAllMarks,
  subscribeToMarks,
} from './api/marks';
import type { LotRegisterRow, MarkRow } from './api/supabase';
import {
  listLots,
  saveLot,
  subscribeLots,
  deleteLot,
  updateLotDetails,
  updateLotStatus,
  undoLotStatus,
} from './api/lotRegister';
import { loadProjects, loadProjectMapImage, populateProjectSelect } from './api/projects';
import {
  initAuth,
  showAppScreen,
  showAuthScreen,
  showDisabledScreen,
} from './ui/auth';
import { renderChips, selectChip, updateChipCounts } from './ui/chips';
import { showActionToast, showToast } from './ui/toast';
import { initUsersManagement } from './ui/users';
import { initMapModals } from './ui/map-modals';
import { initDuplicateCleanup, setDuplicateCleanupAdmin } from './ui/duplicate-cleanup';
import type { UndoAction } from './map/undo';
import { initTheme } from './ui/theme';
import {
  initActionButtons,
  initKeyboardShortcuts,
  initMapSelector,
  initModeButtons,
  setToolbarMode,
} from './ui/toolbar';
import { initLotPanel } from './ui/lot-panel';
import { initLotTable } from './ui/lot-table';

// DOM Elements
const baseCanvas = document.querySelector<HTMLCanvasElement>('#base')!;
const fillCanvas = document.querySelector<HTMLCanvasElement>('#fill')!;
const pinsCanvas = document.querySelector<HTMLCanvasElement>('#pins')!;
const canvases: CanvasGroup = { base: baseCanvas, fill: fillCanvas, pins: pinsCanvas };

const box = document.querySelector<HTMLElement>('#box')!;
const stage = document.querySelector<HTMLElement>('#stage')!;
const chipsContainer = document.querySelector<HTMLElement>('#chips')!;
const mapSelect = document.querySelector<HTMLSelectElement>('#mp')!;
const lotTableButton = document.querySelector<HTMLButtonElement>('#btn-lot-table')!;
const btnUploadMap = document.querySelector<HTMLButtonElement>('#btn-upload-map');
const btnDeleteMap = document.querySelector<HTMLButtonElement>('#btn-delete-map');
const btnAddStatus = document.querySelector<HTMLButtonElement>('#btn-add-status');
const duplicateCleanupBtn = document.querySelector<HTMLButtonElement>('#btn-cleanup-duplicates');
const duplicateCleanupBackdrop = document.querySelector<HTMLElement>('#duplicate-cleanup-backdrop');
const duplicateCleanupStatus = document.querySelector<HTMLElement>('#duplicate-cleanup-status');
const duplicateCleanupTableBody = document.querySelector<HTMLElement>('#duplicate-cleanup-table-body');
const duplicateCleanupEmpty = document.querySelector<HTMLElement>('#duplicate-cleanup-empty');
const duplicateCleanupConfirm = document.querySelector<HTMLButtonElement>('#duplicate-cleanup-confirm');
const duplicateCleanupClose = document.querySelector<HTMLButtonElement>('#duplicate-cleanup-close');
const loadingIndicator = document.querySelector<HTMLElement>('#ld')!;
const toastElement = document.querySelector<HTMLElement>('#t')!;

// Navigation & User Management Elements
const navMapBtn = document.querySelector<HTMLElement>('#nav-map-btn');
const navUsersBtn = document.querySelector<HTMLElement>('#nav-users-btn');
const usersView = document.querySelector<HTMLElement>('#users-view');
const userInfoCapsule = document.querySelector<HTMLElement>('#user-info-capsule');
const userEmailDisplay = document.querySelector<HTMLElement>('#user-email-display');
const headerControls = document.querySelector<HTMLElement>('#header-controls');

const modeButtons = Array.from(document.querySelectorAll<HTMLElement>('button[data-m]'));
const undoBtn = document.querySelector<HTMLElement>('#un');
const clearBtn = document.querySelector<HTMLElement>('#cl');
const zoomOutBtn = document.querySelector<HTMLElement>('#zo');
const zoomInBtn = document.querySelector<HTMLElement>('#zi');
const zoomFitBtn = document.querySelector<HTMLElement>('#zf');
const savePngBtn = document.querySelector<HTMLElement>('#png');
const savePdfBtn = document.querySelector<HTMLElement>('#pdf');
const authBtn = document.querySelector<HTMLElement>('#auth-btn');
const roleBadge = document.querySelector<HTMLElement>('#role-badge');
const statusHint = document.querySelector<HTMLElement>('#status-hint');

const authScreen = document.querySelector<HTMLElement>('#auth-screen')!;
const appRoot = document.querySelector<HTMLElement>('#app-root')!;
const disabledScreen = document.querySelector<HTMLElement>('#disabled-screen');
const disabledSignoutBtn = document.querySelector<HTMLElement>('#disabled-signout-btn');

const authForm = document.querySelector<HTMLFormElement>('#auth-form');
const authEmail = document.querySelector<HTMLInputElement>('#auth-email');
const authPassword = document.querySelector<HTMLInputElement>('#auth-password');
const authError = document.querySelector<HTMLElement>('#auth-error');
const authSuccess = document.querySelector<HTMLElement>('#auth-success');
const authSubtitle = document.querySelector<HTMLElement>('#auth-subtitle');
const tabSignIn = document.querySelector<HTMLElement>('#tab-signin');
const tabSignUp = document.querySelector<HTMLElement>('#tab-signup');
const authSubmitBtn = document.querySelector<HTMLButtonElement>('#auth-submit-btn');

const legendBackdrop = document.querySelector<HTMLElement>('#legend-editor-backdrop');
const legendNameInput = document.querySelector<HTMLInputElement>('#legend-name-input');
const legendColorInput = document.querySelector<HTMLInputElement>('#legend-color-input');
const legendCancelBtn = document.querySelector<HTMLButtonElement>('#legend-cancel-btn');
const legendSaveBtn = document.querySelector<HTMLButtonElement>('#legend-save-btn');

// State
const COLOR_STORAGE_KEY = 'rrh-colors-v1';
const statuses: StatusMap = {
  c: { ...DEFAULT_STATUSES.c },
  o: { ...DEFAULT_STATUSES.o },
  a: { ...DEFAULT_STATUSES.a },
};

let legendEditorMode: 'add' | 'edit' = 'add';
let legendEditorKey: string | null = null;
let legendStatusNextIndex = 0;
const MAX_NUMBERED_STATUSES = 10;

let currentUser: User | null = null;
let currentUserRole: 'admin' | 'editor' | 'viewer' | 'disabled' = 'viewer';
let currentProjectId: string | null = null;
let currentProject: Project | null = null;
let marksSubscriptionCleanup: (() => void) | null = null;
let lotsSubscriptionCleanup: (() => void) | null = null;
let projectStatusSubscriptionCleanup: (() => void) | null = null;
let usersManager: ReturnType<typeof initUsersManagement> | null = null;

let currentMapIndex = 0;
let mapToken = 0;
let mapWidth = 0;
let mapHeight = 0;
let pinRadius = 0;
let barrierMap: Uint8Array | null = null;

let marks: Mark[] = [];
let lotRows: LotRegisterRow[] = [];
let history: UndoAction[] = [];
let legendDragStartPosition: [number, number] | null = null;
let legendPos: [number, number] = [0, 0];
let currentStatus = 'c';
let currentMode: PaintMode = 'fill';
let currentZoom = 1;
let highlightedMarkId: string | null = null;
let highlightTimer: ReturnType<typeof setTimeout> | undefined;

function upsertLotRow(row: LotRegisterRow): void {
  const index = lotRows.findIndex((lot) => lot.id === row.id);
  if (index >= 0) lotRows[index] = row;
  else lotRows.push(row);
  lotTable.setRows(lotRows);
}

function applyLotStatusToMap(row: LotRegisterRow): void {
  const mark = marks.find((candidate) => candidate.id === row.mark_id);
  if (!mark || mark.s === row.status) return;

  const previousStatus = mark.s;
  mark.s = row.status;
  mark.updated_at = row.updated_at;
  mark.updated_by = row.updated_by;
  recordUndo({
    kind: 'status',
    markId: mark.id!,
    previousStatus,
    newStatus: row.status,
  });
  renderAll();
  saveState();
  showActionToast(toastElement, 'Lot status updated.', 'Undo', async () => undo(), 5000);
}

function showExistingLot(rowId: string): void {
  const row = lotRows.find((candidate) => candidate.id === rowId);
  if (!row?.mark_id) {
    showToast(toastElement, 'The existing lot is not linked to a map fill.');
    return;
  }
  highlightMapMark(row.mark_id);
}

const lotPanel = initLotPanel(stage, {
  onSave: async (input) => {
    const normalize = (value: string): string => value.trim().toLocaleUpperCase();
    lotRows = await listLots(input.projectId);
    const unmappedMatch = lotRows.find(
      (row) =>
        row.mark_id === null &&
        row.project_id === input.projectId &&
        row.phase === normalize(input.phase) &&
        row.block === normalize(input.block) &&
        row.lot === normalize(input.lot)
    );
    const row = await saveLot(input);
    upsertLotRow(row);
    if (statuses[row.status]) setStatus(row.status);
    applyLotStatusToMap(row);
    return {
      row,
      linkedExisting: Boolean(unmappedMatch && unmappedMatch.id === row.id),
    };
  },
  onCancel: async (context) => {
    if (!context.discardOnCancel || context.row) return;
    if (currentProjectId !== context.projectId) {
      throw new Error('The active project changed before the painted lot could be removed.');
    }
    const { error } = await deleteMark(context.markId);
    if (error) throw error;

    marks = marks.filter((mark) => mark.id !== context.markId);
    history = history
      .map((action) => withoutAddedMark(action, context.markId))
      .filter((action): action is UndoAction => action !== null);
    refreshStatusUi();
    saveState();
    showToast(toastElement, 'Paint canceled; the unregistered fill was removed.');
  },
  onShowExisting: showExistingLot,
  getExistingLotLabel: (rowId) => {
    const row = lotRows.find((candidate) => candidate.id === rowId);
    return row ? `${row.phase}/${row.block}/${row.lot}` : null;
  },
});
const lotTable = initLotTable(stage, lotTableButton, {
  onSelectRow: (row) => {
    if (row.mark_id) highlightMapMark(row.mark_id);
    else showToast(toastElement, 'This register lot is not linked to a map fill.');
  },
  onUpdateStatus: async (row, status) => {
    const updated = await updateLotStatus(row.id, status);
    upsertLotRow(updated);
    applyLotStatusToMap(updated);
    return updated;
  },
  onUpdateDetails: async (row, details) => {
    if (!currentProjectId) throw new Error('Select a project before editing a lot.');
    const updated = await updateLotDetails(currentProjectId, row.id, details);
    upsertLotRow(updated);
    return updated;
  },
  onDeleteRow: async (row) => {
    await deleteLot(row.id);
    lotRows = lotRows.filter((candidate) => candidate.id !== row.id);
    lotTable.setRows(lotRows);
    showToast(toastElement, `Register entry ${row.phase}/${row.block}/${row.lot} deleted.`);
  },
  onError: (message) => showToast(toastElement, `Lot register action failed: ${message}`),
});
lotTable.setStatuses(statuses);
lotTableButton.addEventListener('click', () => void lotPanel.dismiss());
lotTableButton.addEventListener('click', switchToMap);

// 2D Pan and Drag State (supports dragging in all directions)
let panX = 0;
let panY = 0;
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let initialPanX = 0;
let initialPanY = 0;
let pointerMoved = false;
let activePointerId: number | null = null;
let isDraggingLegend = false;
let legendDragOffsetX = 0;
let legendDragOffsetY = 0;

// Navigation view switching
function switchToMap(): void {
  if (navMapBtn) navMapBtn.classList.add('on');
  if (navUsersBtn) navUsersBtn.classList.remove('on');
  if (stage) stage.style.display = 'block';
  if (headerControls) headerControls.style.display = 'grid';
  if (statusHint) statusHint.style.display = 'block';
  if (usersView) usersView.style.display = 'none';
}

async function switchToUsers(): Promise<void> {
  if (currentUserRole !== 'admin') {
    showToast(toastElement, 'Access denied: Administrator permissions required');
    return;
  }
  if (navUsersBtn) navUsersBtn.classList.add('on');
  if (navMapBtn) navMapBtn.classList.remove('on');
  lotPanel.hide();
  lotTable.close();
  if (stage) stage.style.display = 'none';
  if (headerControls) headerControls.style.display = 'none';
  if (statusHint) statusHint.style.display = 'none';
  if (usersView) {
    usersView.style.display = 'block';
    if (!usersManager && currentUser) {
      usersManager = initUsersManagement({
        container: usersView,
        toastElement,
        currentUserId: currentUser.id,
      });
    }
    if (usersManager) {
      await usersManager.load();
    }
  }
}

// Helpers
function getStorageKey(): string {
  const mapId = MAPS[currentMapIndex].id;
  return mapId === 'balayan' ? 'rrh-balayan-status-v1' : `rrh-status-v1-${mapId}`;
}

function saveState(): void {
  try {
    const serializedMarks = marks.map(({ id, t, x, y, s, updated_at, updated_by }) => ({
      id,
      t,
      x,
      y,
      s,
      updated_at,
      updated_by,
    }));
    const savedStatuses = Object.fromEntries(
      Object.entries(statuses).map(([k, v]) => [k, { n: v.n, c: v.c }])
    );
    localStorage.setItem(
      getStorageKey(),
      JSON.stringify({ marks: serializedMarks, lg: legendPos, statuses: savedStatuses })
    );
    localStorage.setItem(COLOR_STORAGE_KEY, JSON.stringify(savedStatuses));
  } catch {
    // Ignore storage quota errors
  }
}

function markFromRow(row: MarkRow): Mark | null {
  const x = row.x <= 1 ? Math.round(row.x * mapWidth) : Math.round(row.x);
  const y = row.y <= 1 ? Math.round(row.y * mapHeight) : Math.round(row.y);
  const mark: Mark = {
    id: row.id,
    t: row.kind === 'pin' ? 'p' : 'f',
    x,
    y,
    s: row.status,
    updated_at: row.updated_at,
    updated_by: row.updated_by,
  };
  if (mark.t === 'f') {
    if (!barrierMap) return null;
    const spans = region(x, y, mapWidth, mapHeight, barrierMap);
    if (spans) mark.sp = spans;
  }
  return mark.t === 'p' || mark.sp ? mark : null;
}

async function reloadMarksFromSupabase(projectId: string): Promise<void> {
  const { data, error } = await loadMarks(projectId);
  if (error || !data) {
    throw error || new Error('Supabase returned no mark data');
  }
  marks = data.map(markFromRow).filter((mark): mark is Mark => mark !== null);
  saveState();
  renderAll();
}

function applyStatusConfig(config: ProjectStatusConfig | null): void {
  if (!config || typeof config !== 'object') return;

  const merged = { ...DEFAULT_STATUSES, ...config };
  for (const key of Object.keys(statuses)) {
    delete (statuses as Record<string, { n: string; c: string } >)[key];
  }
  Object.assign(statuses, merged);
  lotTable.setStatuses(statuses);

  const currentKeyExists = currentStatus && Object.prototype.hasOwnProperty.call(merged, currentStatus);
  if (!currentKeyExists) {
    currentStatus = Object.keys(merged)[0] || 'c';
  }

  renderChips(chipsContainer, statuses, currentStatus, {
    selectable: false,
    onSelect: (key) => setStatus(key),
    onColorChange: (key, newColor) => {
      if (statuses[key]) {
        statuses[key].c = newColor;
        renderAll();
        saveState();
      }
    },
    onRename: (key) => openLegendEditor('edit', key),
    onRemove: (key) => {
      if (Object.keys(statuses).length <= 1) {
        showToast(toastElement, 'At least one status category is required.');
        return;
      }
      const fallbackKey = Object.keys(statuses).find((candidate) => candidate !== key) || key;
      delete statuses[key];
      if (currentStatus === key) currentStatus = fallbackKey;
      persistStatuses();
    },
    onAdd: () => openLegendEditor('add'),
  });
}

function recordUndo(action: UndoAction): void {
  history.push(action);
  if (history.length > 100) {
    history.shift();
  }
}

function withoutAddedMark(action: UndoAction, markId: string): UndoAction | null {
  if (action.kind === 'add' && action.mark.id === markId) return null;
  if (action.kind !== 'batch') return action;
  const actions = action.actions
    .map((child) => withoutAddedMark(child, markId))
    .filter((child): child is UndoAction => child !== null);
  return actions.length ? { ...action, actions } : null;
}

function applyUserRole(role: 'admin' | 'editor' | 'viewer' | 'disabled'): void {
  currentUserRole = role;
  const isAdmin = role === 'admin';
  const isEditor = role === 'editor';
  const canEdit = isAdmin || isEditor;
  if (!canEdit) lotPanel.hide();
  lotTable.setCanEdit(canEdit);
  lotTableButton.style.display = currentUser && currentProjectId ? 'flex' : 'none';
  if (btnAddStatus) btnAddStatus.style.display = canEdit ? 'inline-flex' : 'none';

  if (canEdit) {
    document.body.classList.remove('role-viewer');
    document.body.classList.add('role-admin');
  } else {
    document.body.classList.add('role-viewer');
    document.body.classList.remove('role-admin');
  }

  if (roleBadge) {
    if (role === 'admin') {
      roleBadge.textContent = 'Admin Mode';
      roleBadge.className = 'badge badge-admin';
    } else if (role === 'editor') {
      roleBadge.textContent = 'Editor Mode';
      roleBadge.className = 'badge badge-editor';
    } else if (role === 'disabled') {
      roleBadge.textContent = 'Account Disabled';
      roleBadge.className = 'badge badge-disabled';
    } else {
      roleBadge.textContent = 'Viewer View';
      roleBadge.className = 'badge badge-viewer';
    }
  }

  if (statusHint) {
    if (role === 'admin') {
      statusHint.textContent = '';
    } else if (role === 'editor') {
      statusHint.textContent = 'Editor Mode: Paint a lot, then set its P/B/L and status in Lot details · drag to pan';
    } else if (role === 'disabled') {
      statusHint.textContent = 'Your account has been disabled. Please contact an administrator.';
    } else {
      statusHint.textContent = 'Viewer View: Live lot updates · drag to pan';
    }
  }

  // Show Users management tab only for Admin
  if (navUsersBtn) {
    navUsersBtn.style.display = isAdmin ? 'inline-flex' : 'none';
  }

  // Show Map upload and delete controls only for Admin
  if (btnUploadMap) {
    btnUploadMap.style.display = isAdmin ? 'inline-flex' : 'none';
  }
  if (btnDeleteMap) {
    btnDeleteMap.style.display = isAdmin ? 'inline-flex' : 'none';
  }
  if (duplicateCleanupBtn && duplicateCleanupBackdrop) {
    setDuplicateCleanupAdmin(
      duplicateCleanupBackdrop,
      duplicateCleanupBtn,
      isAdmin && Boolean(currentProjectId)
    );
  }

  // If user was viewing users panel and got demoted, redirect back to map
  if (!isAdmin && usersView && usersView.style.display !== 'none') {
    switchToMap();
  }

  if (!isAdmin && !isEditor) {
    setMode('fill');
  }

  // Update user capsule
  if (currentUser) {
    if (userInfoCapsule) userInfoCapsule.style.display = 'inline-flex';
    if (userEmailDisplay) userEmailDisplay.textContent = currentUser.email || 'Signed In';
  } else {
    if (userInfoCapsule) userInfoCapsule.style.display = 'none';
    if (userEmailDisplay) userEmailDisplay.textContent = '';
  }
}

function clearProjectSubscriptions(): void {
  if (marksSubscriptionCleanup) {
    marksSubscriptionCleanup();
    marksSubscriptionCleanup = null;
  }
  if (lotsSubscriptionCleanup) {
    lotsSubscriptionCleanup();
    lotsSubscriptionCleanup = null;
  }

  if (projectStatusSubscriptionCleanup) {
    projectStatusSubscriptionCleanup();
    projectStatusSubscriptionCleanup = null;
  }
}

function setupRealtimeForCurrentProject(projectId: string): void {
  clearProjectSubscriptions();

  projectStatusSubscriptionCleanup = subscribeToProjectStatusConfig(projectId, (config) => {
    if (!config) return;
    applyStatusConfig(config);
    renderAll();
    saveState();
  });

  marksSubscriptionCleanup = subscribeToMarks(projectId, (change) => {
    if (!mapWidth || !mapHeight || !barrierMap) return;

    if (change.eventType === 'INSERT') {
      const row = change.newRecord;
      if (!row || marks.some((m) => m.id === row.id)) return;
      const m = markFromRow(row);
      if (m) {
        marks.push(m);
        renderAll();
        saveState();
      }
    } else if (change.eventType === 'DELETE') {
      const oldId = change.oldRecord?.id;
      if (oldId) {
        const initialCount = marks.length;
        marks = marks.filter((m) => m.id !== oldId);
        if (marks.length !== initialCount) {
          renderAll();
          saveState();
        }
      }
    } else if (change.eventType === 'UPDATE') {
      const row = change.newRecord;
      if (!row) return;

      const existingIndex = marks.findIndex((m) => m.id === row.id);
      const updatedMark = markFromRow(row);
      if (!updatedMark) return;

      if (existingIndex >= 0) {
        marks[existingIndex] = updatedMark;
      } else {
        marks.push(updatedMark);
      }
      renderAll();
      saveState();
    }
  });

  lotsSubscriptionCleanup = subscribeLots(projectId, {
    onInsert: upsertLotRow,
    onUpdate: upsertLotRow,
    onDelete: ({ id }) => {
      lotRows = lotRows.filter((row) => row.id !== id);
      lotTable.setRows(lotRows);
    },
  });
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
  if (highlightedMarkId) {
    const highlighted = marks.find((mark) => mark.id === highlightedMarkId);
    if (highlighted) {
      pinsCtx.save();
      pinsCtx.strokeStyle = '#facc15';
      pinsCtx.lineWidth = Math.max(3, mapWidth * 0.003);
      pinsCtx.shadowColor = '#111';
      pinsCtx.shadowBlur = Math.max(3, mapWidth * 0.002);
      if (highlighted.t === 'f' && highlighted.sp?.length) {
        let left = mapWidth;
        let right = 0;
        let top = mapHeight;
        let bottom = 0;
        for (const [y, start, end] of highlighted.sp) {
          left = Math.min(left, start);
          right = Math.max(right, end);
          top = Math.min(top, y);
          bottom = Math.max(bottom, y);
        }
        pinsCtx.strokeRect(left, top, right - left + 1, bottom - top + 1);
      } else {
        pinsCtx.beginPath();
        pinsCtx.arc(highlighted.x, highlighted.y, pinRadius * 1.8, 0, Math.PI * 2);
        pinsCtx.stroke();
      }
      pinsCtx.restore();
    }
  }
  updateChipCounts(chipsContainer, counts);
  selectChip(chipsContainer, currentStatus, statuses);
}

function highlightMapMark(markId: string): void {
  const mark = marks.find((candidate) => candidate.id === markId);
  if (!mark) {
    showToast(toastElement, 'The existing lot mark is not loaded on this map.');
    return;
  }

  highlightedMarkId = markId;
  currentZoom = Math.max(
    currentZoom,
    Math.min(0.75, stage.clientWidth / (mapWidth * 0.4))
  );
  applyZoom(box, mapWidth, currentZoom, mapHeight);
  panX = stage.clientWidth / 2 - mark.x * currentZoom;
  panY = stage.clientHeight / 2 - mark.y * currentZoom;
  applyTransform(box, panX, panY);
  renderAll();

  if (highlightTimer) clearTimeout(highlightTimer);
  highlightTimer = setTimeout(() => {
    highlightedMarkId = null;
    highlightTimer = undefined;
    renderAll();
  }, 3000);
}

function openLotPanelFor(mark: Mark, discardOnCancel = false): void {
  if (
    mark.t !== 'f' ||
    !mark.id ||
    !currentUser ||
    !currentProjectId ||
    (currentUserRole !== 'admin' && currentUserRole !== 'editor')
  ) {
    return;
  }
  lotTable.close();
  const row = lotRows.find((candidate) => candidate.mark_id === mark.id) ?? null;
  lotPanel.open(
    {
      projectId: currentProjectId,
      markId: mark.id,
      status: mark.s,
      row,
      discardOnCancel,
    },
    statuses
  );
}

function refreshStatusUi(): void {
  renderAll();
  selectChip(chipsContainer, currentStatus, statuses);
}

function fitAndCenterMap(): void {
  if (!mapWidth || !mapHeight) return;

  // If the stage hasn't been laid out yet (e.g. display was just changed from none),
  // defer to the next animation frame so clientWidth/clientHeight are measured correctly.
  if (stage.clientWidth === 0 || stage.clientHeight === 0) {
    requestAnimationFrame(() => fitAndCenterMap());
    return;
  }

  const fit = fitMap(stage.clientWidth, stage.clientHeight, mapWidth, mapHeight, 20);
  currentZoom = fit.zoom;
  panX = fit.panX;
  panY = fit.panY;
  applyZoom(box, mapWidth, currentZoom, mapHeight);
  applyTransform(box, panX, panY);
}

function setZoom(factor: number): void {
  if (!mapWidth || !mapHeight) return;
  if (!factor) {
    fitAndCenterMap();
    return;
  }
  const stageRect = stage.getBoundingClientRect();
  const centerX = stageRect.left + stage.clientWidth / 2;
  const centerY = stageRect.top + stage.clientHeight / 2;
  const res = zoomAtCursor(
    factor,
    centerX,
    centerY,
    currentZoom,
    panX,
    panY,
    stage
  );
  currentZoom = res.zoom;
  panX = res.panX;
  panY = res.panY;
  applyZoom(box, mapWidth, currentZoom, mapHeight);
  applyTransform(box, panX, panY);
}

async function undo(): Promise<void> {
  const action = history.at(-1);
  if (!action) return;
  lotPanel.close();
  if (!currentUser || !currentProjectId) {
    showToast(toastElement, 'Undo requires a connected project. No local-only undo was applied.');
    return;
  }

  const actions = action.kind === 'batch' ? [...action.actions].reverse() : [action];
  const touchedMarks = new Set<string>();
  const legendUndo: Extract<UndoAction, { kind: 'legend' }>[] = [];
  let failure: Error | null = null;

  for (const inverse of actions) {
    if (inverse.kind === 'add') {
      if (!inverse.mark.id) {
        failure = new Error('The added mark has no saved ID and cannot be undone safely.');
        break;
      }
      const { error } = await deleteMark(inverse.mark.id);
      if (error) {
        failure = error;
        break;
      }
      touchedMarks.add(inverse.mark.id);
    } else if (inverse.kind === 'erase') {
      for (const erased of inverse.marks) {
        if (!erased.id) {
          failure = new Error('An erased mark has no saved ID and cannot be restored safely.');
          break;
        }
        const { error } = await saveMark({
          id: erased.id,
          project_id: currentProjectId,
          x: erased.x / mapWidth,
          y: erased.y / mapHeight,
          status: erased.s,
          kind: erased.t === 'p' ? 'pin' : 'fill',
          updated_by: currentUser.id,
        });
        if (error) {
          failure = error;
          break;
        }
        touchedMarks.add(erased.id);
      }
      if (failure) break;
    } else if (inverse.kind === 'status') {
      const mark = marks.find((candidate) => candidate.id === inverse.markId);
      if (!mark || mark.s !== inverse.newStatus) {
        failure = new Error('This mark changed since your edit. Refresh before undoing.');
        break;
      }
      const linkedLot = lotRows.find((row) => row.mark_id === inverse.markId);
      if (linkedLot) {
        try {
          upsertLotRow(await undoLotStatus(linkedLot.id, inverse.previousStatus));
        } catch (error) {
          failure = error instanceof Error ? error : new Error(String(error));
          break;
        }
      } else {
        const { data, error } = await undoStatusChange(inverse.markId, inverse.previousStatus);
        if (error || !data) {
          failure = error || new Error('Status undo returned no updated mark.');
          break;
        }
      }
      touchedMarks.add(inverse.markId);
    } else if (inverse.kind === 'legend') {
      const { error } = await saveProjectLegendPosition(currentProjectId, inverse.previous);
      if (error) {
        failure = error;
        break;
      }
      legendUndo.push(inverse);
    }
  }

  if (failure) {
    history = [];
    try {
      await reloadMarksFromSupabase(currentProjectId);
    } catch (syncError) {
      const syncMessage = syncError instanceof Error ? syncError.message : String(syncError);
      failure = new Error(`${failure.message}; refreshing from Supabase also failed: ${syncMessage}`);
    }
    if (legendUndo.length) {
      legendPos = legendUndo[legendUndo.length - 1].previous;
      saveState();
      renderAll();
    }
    const partial = actions.length > 1 ? ' Some parts may have been undone.' : '';
    showToast(toastElement, `${failure.message}.${partial} Undo history was cleared to avoid replaying a partial action.`);
    return;
  }

  history.pop();
  for (const legend of legendUndo) {
    legendPos = legend.previous;
  }
  if (touchedMarks.size) {
    try {
      await reloadMarksFromSupabase(currentProjectId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      showToast(toastElement, `Undo saved, but refreshing marks failed: ${message}`);
      return;
    }
  }
  saveState();
  refreshStatusUi();
}

function setStatus(key: string): void {
  if (statuses[key]) {
    currentStatus = key;
    selectChip(chipsContainer, currentStatus, statuses);
  }
}

function generateStatusKey(): string {
  let key = `s${legendStatusNextIndex}`;
  while (statuses[key]) {
    key = `s${++legendStatusNextIndex}`;
  }
  legendStatusNextIndex += 1;
  return key;
}

function closeLegendEditor(): void {
  if (legendBackdrop) {
    legendBackdrop.classList.add('hidden');
    legendBackdrop.setAttribute('aria-hidden', 'true');
  }
  legendEditorMode = 'add';
  legendEditorKey = null;
  if (legendNameInput) legendNameInput.value = '';
  if (legendColorInput) legendColorInput.value = '#1f9d55';
}

function openLegendEditor(mode: 'add' | 'edit', key: string | null = null): void {
  if (mode === 'add' && Object.keys(statuses).length >= MAX_NUMBERED_STATUSES) {
    showToast(toastElement, 'A maximum of 10 status categories can be selected with number keys.');
    return;
  }

  legendEditorMode = mode;
  legendEditorKey = key;

  if (legendBackdrop) {
    legendBackdrop.classList.remove('hidden');
    legendBackdrop.setAttribute('aria-hidden', 'false');
  }

  if (mode === 'edit' && key && statuses[key]) {
    if (legendNameInput) legendNameInput.value = statuses[key].n;
    if (legendColorInput) legendColorInput.value = statuses[key].c;
  } else {
    if (legendNameInput) legendNameInput.value = '';
    if (legendColorInput) legendColorInput.value = '#1f9d55';
  }

  requestAnimationFrame(() => {
    legendNameInput?.focus();
    legendNameInput?.select();
  });
}

async function persistStatuses(): Promise<void> {
  lotTable.setStatuses(statuses);
  const savedStatuses = Object.fromEntries(
    Object.entries(statuses).map(([k, v]) => [k, { n: v.n, c: v.c }])
  );

  saveState();

  if (currentProjectId && (currentUserRole === 'admin' || currentUserRole === 'editor')) {
    const { error } = await saveProjectStatusConfig(currentProjectId, savedStatuses);
    if (error) {
      console.warn('Project status sync failed:', error.message);
    }
  }

  renderChips(chipsContainer, statuses, currentStatus, {
    selectable: false,
    onSelect: (key) => setStatus(key),
    onColorChange: (key, newColor) => {
      if (statuses[key]) {
        statuses[key].c = newColor;
        if (key === currentStatus) {
          selectChip(chipsContainer, currentStatus, statuses);
        }
        renderAll();
        persistStatuses();
      }
    },
    onRename: (key) => openLegendEditor('edit', key),
    onRemove: (key) => {
      if (Object.keys(statuses).length <= 1) {
        showToast(toastElement, 'At least one status category is required.');
        return;
      }
      const nextKey = Object.keys(statuses).find((candidate) => candidate !== key) || key;
      delete statuses[key];
      if (currentStatus === key) {
        currentStatus = nextKey;
      }
      renderChips(chipsContainer, statuses, currentStatus, {
        selectable: false,
        onSelect: (chipKey) => setStatus(chipKey),
        onColorChange: (chipKey, newColor) => {
          if (statuses[chipKey]) {
            statuses[chipKey].c = newColor;
            renderAll();
            persistStatuses();
          }
        },
        onRename: (chipKey) => openLegendEditor('edit', chipKey),
        onRemove: (chipKey) => {
          if (Object.keys(statuses).length <= 1) {
            showToast(toastElement, 'At least one status category is required.');
            return;
          }
          const fallback = Object.keys(statuses).find((candidate) => candidate !== chipKey) || chipKey;
          delete statuses[chipKey];
          if (currentStatus === chipKey) {
            currentStatus = fallback;
          }
          persistStatuses();
        },
        onAdd: () => openLegendEditor('add'),
      });
      renderAll();
      persistStatuses();
    },
    onAdd: () => openLegendEditor('add'),
  });
}

function setMode(mode: PaintMode): void {
  currentMode = mode;
  setToolbarMode(modeButtons, currentMode, box);
}

/**
 * Resolves the Supabase project UUID matching the current map image or name.
 */
async function resolveProjectId(mapIndex: number): Promise<string | null> {
  const mapData = MAPS[mapIndex];
  try {
    const { data } = await supabase
      .from('projects')
      .select('id, name, map_url')
      .or(`map_url.eq.${mapData.img},name.eq.${mapData.n}`)
      .limit(1)
      .maybeSingle();

    if (data?.id) {
      return data.id;
    }
  } catch (err) {
    console.warn('Could not resolve project ID from Supabase:', err);
  }
  return null;
}

// Map Loading
async function openMap(index: number): Promise<void> {
  currentMapIndex = index;
  clearProjectSubscriptions();
  lotPanel.close();
  lotTable.close();
  lotRows = [];
  lotTable.setRows(lotRows);
  lotTableButton.style.display = 'none';
  const thisToken = ++mapToken;

  loadingIndicator.style.display = 'grid';
  barrierMap = null;
  history = [];
  marks = [];
  legendPos = [...MAPS[index].lg];

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

    // 1. Try to resolve project ID from Supabase
    currentProjectId = await resolveProjectId(index);
    lotTableButton.style.display =
      currentUser && currentProjectId ? 'flex' : 'none';
    if (duplicateCleanupBtn && duplicateCleanupBackdrop) {
      setDuplicateCleanupAdmin(
        duplicateCleanupBackdrop,
        duplicateCleanupBtn,
        currentUserRole === 'admin' && Boolean(currentProjectId)
      );
    }
    if (currentProjectId) {
      const { position, error } = await loadProjectLegendPosition(currentProjectId);
      if (position) legendPos = position;
      else if (error) showToast(toastElement, `Could not load legend position: ${error.message}`);
    }
    if (!currentProjectId && currentUser) {
      showToast(toastElement, 'This project is not available from Supabase; cached marks were not loaded.');
    }

    // 2. If project ID resolved, attempt to load marks from Supabase
    if (currentProjectId) {
      const projectStatusConfig = await loadProjectStatusConfig(currentProjectId);
      if (projectStatusConfig) {
        applyStatusConfig(projectStatusConfig);
      }

      const { data: supaMarks, error } = await loadMarks(currentProjectId);
      if (!error && supaMarks) {
        marks = supaMarks.map(markFromRow).filter((mark): mark is Mark => mark !== null);
        saveState();
      } else if (error) {
        showToast(toastElement, `Could not load saved marks: ${error.message}`);
      }
      try {
        lotRows = await listLots(currentProjectId);
        lotTable.setRows(lotRows);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        showToast(toastElement, `Could not load lot register: ${message}`);
      }

      // Connect realtime updates
      setupRealtimeForCurrentProject(currentProjectId);
    }

    // Local cached marks are used only when there is no authenticated server project.
    if (!currentProjectId && !currentUser) {
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
    }

    loadingIndicator.style.display = 'none';
    fitAndCenterMap();
    renderAll();
  } catch (err) {
    console.error('Failed to load map image:', err);
    loadingIndicator.textContent = 'Failed to load map.';
  }
}

/**
 * Loads a project directly from its Supabase record.
 */
async function openProject(proj: Project): Promise<void> {
  clearProjectSubscriptions();
  currentProjectId = proj.id;
  currentProject = proj;
  lotPanel.close();
  lotTable.close();
  lotRows = [];
  lotTable.setRows(lotRows);
  lotTableButton.style.display = currentUser ? 'flex' : 'none';
  if (duplicateCleanupBtn && duplicateCleanupBackdrop) {
    setDuplicateCleanupAdmin(
      duplicateCleanupBackdrop,
      duplicateCleanupBtn,
      currentUserRole === 'admin'
    );
  }
  const thisToken = ++mapToken;

  loadingIndicator.style.display = 'grid';
  barrierMap = null;
  history = [];
  marks = [];
  legendPos = [proj.legend_x ?? 0.5, proj.legend_y ?? 0.5];

  try {
    const img = await loadProjectMapImage(proj.map_url);
    if (thisToken !== mapToken) return;

    const dims = setupCanvases(canvases, img.width, img.height);
    mapWidth = dims.width;
    mapHeight = dims.height;
    pinRadius = dims.pinRadius;

    barrierMap = drawBaseMap(baseCanvas, img);

    const projectStatusConfig = await loadProjectStatusConfig(proj.id);
    if (projectStatusConfig) {
      applyStatusConfig(projectStatusConfig);
    }

    // Fetch marks from Supabase
    const { data: supaMarks, error } = await loadMarks(proj.id);
    if (!error && supaMarks) {
      marks = supaMarks.map(markFromRow).filter((mark): mark is Mark => mark !== null);
      saveState();
    } else if (error) {
      showToast(toastElement, `Could not load saved marks: ${error.message}`);
    }
    try {
      lotRows = await listLots(proj.id);
      lotTable.setRows(lotRows);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      showToast(toastElement, `Could not load lot register: ${message}`);
    }

    setupRealtimeForCurrentProject(proj.id);

    loadingIndicator.style.display = 'none';
    fitAndCenterMap();
    renderAll();
  } catch (err) {
    console.error('Failed to load project map:', err);
    const message = err instanceof Error ? err.message : 'Failed to load map.';
    loadingIndicator.textContent =
      message.includes('tainted') || message.includes('SecurityError')
        ? 'Failed to load map (cross-origin image).'
        : 'Failed to load map.';
  }
}

// 5. Event Listeners
// Handle painting, erasing, pinning, and moving legend on the map
async function processMapClick(clientX: number, clientY: number): Promise<void> {
  if (pointerMoved || !barrierMap || !mapWidth || !mapHeight) return;

  // Viewers cannot paint, erase, pin, or move legend
  if (currentUserRole !== 'admin' && currentUserRole !== 'editor') {
    showToast(toastElement, 'Viewer View: Editing is restricted to administrators.');
    return;
  }
  if (currentUser && !currentProjectId) {
    showToast(toastElement, 'This project is not connected to Supabase, so edits are disabled.');
    return;
  }

  const { x, y } = screenToMapCoords(clientX, clientY, box, mapWidth, mapHeight);

  if (currentMode === 'lg') {
    const previousPosition: [number, number] = [...legendPos];
    const nextPosition: [number, number] = [
      Math.min(x / mapWidth, 0.73),
      Math.min(y / mapHeight, 0.935),
    ];
    if (currentUser && currentProjectId) {
      const { error } = await saveProjectLegendPosition(currentProjectId, nextPosition);
      if (error) {
        showToast(toastElement, `Could not move legend: ${error.message}`);
        return;
      }
    }
    legendPos = nextPosition;
    recordUndo({ kind: 'legend', previous: previousPosition, next: nextPosition });
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
    const shouldPersist = Boolean(currentUser && currentProjectId);
    let remoteChanged = false;
    const syncAfterFailure = async (error: Error): Promise<void> => {
      let message = error.message;
      if (remoteChanged && currentProjectId) {
        history = [];
        try {
          await reloadMarksFromSupabase(currentProjectId);
        } catch (syncError) {
          const syncMessage =
            syncError instanceof Error ? syncError.message : String(syncError);
          message += `; refreshing from Supabase also failed: ${syncMessage}`;
        }
        try {
          lotRows = await listLots(currentProjectId);
          lotTable.setRows(lotRows);
        } catch (syncError) {
          const syncMessage =
            syncError instanceof Error ? syncError.message : String(syncError);
          message += `; refreshing the lot register also failed: ${syncMessage}`;
        }
      }
      showToast(toastElement, `Map change was not fully saved: ${message}`);
    };

    const previousMark = result.updatedMark
      ? marks.find((mark) => mark.id === result.updatedMark?.id)
      : undefined;
    if (shouldPersist && result.updatedMark && previousMark?.s !== result.updatedMark.s) {
      if (!result.updatedMark.id || !currentUser || !currentProjectId) {
        showToast(toastElement, 'Cannot update a fill without its saved mark ID.');
        return;
      }
      const linkedLot = lotRows.find((row) => row.mark_id === result.updatedMark?.id);
      if (linkedLot) {
        try {
          const updatedLot = await saveLot({
            projectId: currentProjectId,
            markId: result.updatedMark.id,
            phase: linkedLot.phase,
            block: linkedLot.block,
            lot: linkedLot.lot,
            status: result.updatedMark.s,
          });
          upsertLotRow(updatedLot);
          result.updatedMark.updated_at = updatedLot.updated_at;
          result.updatedMark.updated_by = updatedLot.updated_by;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          showToast(toastElement, `Could not atomically update lot status: ${message}`);
          return;
        }
      } else {
        const { data, error } = await updateMark(result.updatedMark.id, {
          status: result.updatedMark.s,
          updated_by: currentUser.id,
        });
        if (error || !data) {
          showToast(toastElement, `Could not update fill: ${error?.message || 'No row returned'}`);
          return;
        }
        result.updatedMark.updated_at = data.updated_at;
        result.updatedMark.updated_by = data.updated_by;
      }
      remoteChanged = true;
    }

    const marksToDelete = [
      ...(result.erasedMark ? [result.erasedMark] : []),
      ...(result.erasedMarks || []),
    ];
    const erasedMarkIds = new Set(
      marksToDelete.map((mark) => mark.id).filter((id): id is string => Boolean(id))
    );
    const registerRowsForErasedMarks = new Set(
      lotRows
        .filter((row) => row.mark_id && erasedMarkIds.has(row.mark_id))
        .map((row) => row.id)
    );
    if (shouldPersist) {
      for (const mark of marksToDelete) {
        if (!mark.id) continue;
        const { error } = await deleteMark(mark.id);
        if (error) {
          await syncAfterFailure(error);
          return;
        }
        remoteChanged = true;
      }
      if (marksToDelete.some((mark) => mark.id) && currentProjectId) {
        try {
          lotRows = await listLots(currentProjectId);
          lotTable.setRows(lotRows);
          const unmappedCount = lotRows.filter(
            (row) => registerRowsForErasedMarks.has(row.id) && row.mark_id === null
          ).length;
          if (unmappedCount > 0) {
            showToast(
              toastElement,
              `${unmappedCount} register row${unmappedCount === 1 ? '' : 's'} kept as unmapped.`
            );
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await syncAfterFailure(
            new Error(`Map marks were erased, but the register could not be refreshed: ${message}`)
          );
          return;
        }
      }
    }

    if (result.addedMark && shouldPersist && currentUser && currentProjectId) {
      const markToSave = result.addedMark;
      const { data, error } = await saveMark({
        project_id: currentProjectId,
        x: markToSave.x / mapWidth,
        y: markToSave.y / mapHeight,
        status: markToSave.s,
        kind: markToSave.t === 'p' ? 'pin' : 'fill',
        updated_by: currentUser.id,
      });
      if (error || !data) {
        await syncAfterFailure(error || new Error('No row returned'));
        return;
      }
      markToSave.id = data.id;
      markToSave.updated_at = data.updated_at;
      markToSave.updated_by = data.updated_by;
    }

    const undoActions: UndoAction[] = [];
    if (result.updatedMark && previousMark && previousMark.s !== result.updatedMark.s) {
      undoActions.push({
        kind: 'status',
        markId: result.updatedMark.id!,
        previousStatus: previousMark.s,
        newStatus: result.updatedMark.s,
      });
    }
    if (marksToDelete.length) {
      undoActions.push({ kind: 'erase', marks: marksToDelete });
    }
    if (result.addedMark) {
      undoActions.push({ kind: 'add', mark: result.addedMark });
    }

    const deletedIds = new Set(marksToDelete.map((mark) => mark.id).filter(Boolean));
    marks = marks.filter((mark) => !mark.id || !deletedIds.has(mark.id));
    if (result.updatedMark) {
      const updatedIndex = previousMark
        ? marks.indexOf(previousMark)
        : marks.findIndex((mark) => mark.id === result.updatedMark?.id);
      if (updatedIndex >= 0) marks[updatedIndex] = result.updatedMark;
      else marks.push(result.updatedMark);
    }
    if (result.addedMark && !marks.some((mark) => mark.id && mark.id === result.addedMark?.id)) {
      marks.push(result.addedMark);
    }
    if (undoActions.length === 1) {
      recordUndo(undoActions[0]);
    } else if (undoActions.length > 1) {
      recordUndo({ kind: 'batch', actions: undoActions });
    }
    refreshStatusUi();
    saveState();

    const fillForPanel = result.updatedMark?.t === 'f'
      ? result.updatedMark
      : result.addedMark?.t === 'f'
        ? result.addedMark
        : null;
    if (fillForPanel) openLotPanelFor(fillForPanel, fillForPanel === result.addedMark);

    if (result.updatedMark && previousMark && previousMark.s !== result.updatedMark.s) {
      showActionToast(
        toastElement,
        'Lot status updated.',
        'Undo',
        async () => undo(),
        5000
      );
    }
  }
}

if (
  duplicateCleanupBtn &&
  duplicateCleanupBackdrop &&
  duplicateCleanupStatus &&
  duplicateCleanupTableBody &&
  duplicateCleanupEmpty &&
  duplicateCleanupConfirm &&
  duplicateCleanupClose
) {
  initDuplicateCleanup(
    {
      button: duplicateCleanupBtn,
      backdrop: duplicateCleanupBackdrop,
      status: duplicateCleanupStatus,
      tableBody: duplicateCleanupTableBody,
      emptyMessage: duplicateCleanupEmpty,
      confirmButton: duplicateCleanupConfirm,
      closeButtons: [duplicateCleanupClose],
    },
    async () => {
      if (currentUserRole !== 'admin' || !currentProjectId) {
        throw new Error('Administrator access and an active project are required.');
      }
      const { data, error } = await loadMarks(currentProjectId);
      if (error || !data) {
        throw error || new Error('Supabase returned no mark data.');
      }
      return data
        .map(markFromRow)
        .filter((mark): mark is Mark => mark !== null && mark.t === 'f');
    },
    async (markIds) => {
      if (currentUserRole !== 'admin' || !currentUser || !currentProjectId) {
        return { deleted: 0, error: new Error('Administrator access is required.') };
      }

      let deleted = 0;
      for (const markId of markIds) {
        const { error } = await deleteMark(markId);
        if (error) {
          let cleanupError = error;
          if (deleted > 0) {
            try {
              await reloadMarksFromSupabase(currentProjectId);
            } catch (syncError) {
              const syncMessage =
                syncError instanceof Error ? syncError.message : String(syncError);
              cleanupError = new Error(`${error.message}; refreshing marks also failed: ${syncMessage}`);
            }
          }
          return { deleted, error: cleanupError };
        }
        deleted += 1;
      }

      try {
        await reloadMarksFromSupabase(currentProjectId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { deleted, error: new Error(`Deleted marks, but could not refresh the map: ${message}`) };
      }
      showToast(toastElement, `Removed ${deleted} duplicate fill mark${deleted === 1 ? '' : 's'}.`);
      return { deleted, error: null };
    }
  );
}

// Attach map click handler to stage, verifying the click is within the rendered map box
stage.addEventListener('click', async (e: MouseEvent) => {
  if (pointerMoved) return;
  const boxRect = box.getBoundingClientRect();
  if (
    e.clientX >= boxRect.left &&
    e.clientX <= boxRect.right &&
    e.clientY >= boxRect.top &&
    e.clientY <= boxRect.bottom
  ) {
    await processMapClick(e.clientX, e.clientY);
  }
});

stage.addEventListener('pointerdown', (e: PointerEvent) => {
  if (currentMode === 'lg' && mapWidth && mapHeight) {
    const { x, y } = screenToMapCoords(e.clientX, e.clientY, box, mapWidth, mapHeight);
    const bounds = getLegendBounds(legendPos, statuses, (() => {
      const counts: Record<string, number> = {};
      for (const key of Object.keys(statuses)) counts[key] = 0;
      for (const mark of marks) {
        if (mark.t === 'f' && counts[mark.s] !== undefined) counts[mark.s]++;
      }
      return counts;
    })(), mapWidth, mapHeight);

    const hitLegend =
      x >= bounds.x &&
      x <= bounds.x + bounds.w &&
      y >= bounds.y &&
      y <= bounds.y + bounds.h;

    if (hitLegend) {
      isDraggingLegend = true;
      pointerMoved = true;
      legendDragStartPosition = [...legendPos];
      legendDragOffsetX = x - bounds.x;
      legendDragOffsetY = y - bounds.y;
      e.preventDefault();
      return;
    }
  }

  if (e.button !== 0 && e.button !== 1) return;
  isDragging = true;
  pointerMoved = false;
  dragStartX = e.clientX;
  dragStartY = e.clientY;
  initialPanX = panX;
  initialPanY = panY;
  activePointerId = e.pointerId;
});

window.addEventListener('pointermove', (e: PointerEvent) => {
  if (isDraggingLegend && mapWidth && mapHeight) {
    const { x, y } = screenToMapCoords(e.clientX, e.clientY, box, mapWidth, mapHeight);
    const nextX = Math.min(Math.max((x - legendDragOffsetX) / mapWidth, 0), 0.73);
    const nextY = Math.min(Math.max((y - legendDragOffsetY) / mapHeight, 0.06), 0.935);
    legendPos = [nextX, nextY];
    renderAll();
    saveState();
    return;
  }

  if (!isDragging) return;
  const dx = e.clientX - dragStartX;
  const dy = e.clientY - dragStartY;
  if (!pointerMoved && Math.hypot(dx, dy) > 4) {
    pointerMoved = true;
    stage.classList.add('is-panning');
    if (activePointerId !== null) {
      try {
        stage.setPointerCapture(activePointerId);
      } catch {
        // ignore capture errors
      }
    }
  }
  if (pointerMoved) {
    panX = initialPanX + dx;
    panY = initialPanY + dy;
    applyTransform(box, panX, panY);
  }
});

const handlePointerUp = async () => {
  if (isDraggingLegend) {
    isDraggingLegend = false;
    legendDragOffsetX = 0;
    legendDragOffsetY = 0;
    const previousPosition = legendDragStartPosition;
    legendDragStartPosition = null;
    if (previousPosition && (previousPosition[0] !== legendPos[0] || previousPosition[1] !== legendPos[1])) {
      if (!currentUser || !currentProjectId) {
        legendPos = previousPosition;
        renderAll();
        saveState();
        showToast(toastElement, 'Legend changes require a connected Supabase project.');
        return;
      }
      const nextPosition: [number, number] = [...legendPos];
      const { error } = await saveProjectLegendPosition(currentProjectId, nextPosition);
      if (error) {
        legendPos = previousPosition;
        renderAll();
        saveState();
        showToast(toastElement, `Could not save legend position: ${error.message}`);
        return;
      }
      recordUndo({ kind: 'legend', previous: previousPosition, next: nextPosition });
      saveState();
    }
    return;
  }

  if (!isDragging) return;
  isDragging = false;
  if (activePointerId !== null) {
    try {
      if (stage.hasPointerCapture(activePointerId)) {
        stage.releasePointerCapture(activePointerId);
      }
    } catch {
      // pointer capture might already be released
    }
    activePointerId = null;
  }
  stage.classList.remove('is-panning');
};

window.addEventListener('pointerup', handlePointerUp);
window.addEventListener('pointercancel', handlePointerUp);

// Suppress context menu if the user was right-click dragging
stage.addEventListener('contextmenu', (e: MouseEvent) => {
  if (pointerMoved) {
    e.preventDefault();
  }
});

// Smooth Mouse Wheel Zoom (zooms towards cursor position)
stage.addEventListener(
  'wheel',
  (e: WheelEvent) => {
    e.preventDefault();
    if (!mapWidth || !mapHeight) return;

    // Normalizing wheel delta: scroll up zooms in, scroll down zooms out
    const factor = e.deltaY < 0 ? 1.15 : 0.87;
    const res = zoomAtCursor(
      factor,
      e.clientX,
      e.clientY,
      currentZoom,
      panX,
      panY,
      stage
    );
    currentZoom = res.zoom;
    panX = res.panX;
    panY = res.panY;
    applyZoom(box, mapWidth, currentZoom, mapHeight);
    applyTransform(box, panX, panY);
  },
  { passive: false }
);

// Mobile & Tablet Touch Pinch-to-Zoom and Pan
let touchPinchDist = 0;
let initialPinchZoom = 1;
let initialPinchPanX = 0;
let initialPinchPanY = 0;
let initialPinchMidX = 0;
let initialPinchMidY = 0;

stage.addEventListener(
  'touchstart',
  (e: TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      touchPinchDist = Math.hypot(dx, dy);
      initialPinchZoom = currentZoom;
      initialPinchPanX = panX;
      initialPinchPanY = panY;
      initialPinchMidX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      initialPinchMidY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
    }
  },
  { passive: true }
);

stage.addEventListener(
  'touchmove',
  (e: TouchEvent) => {
    if (e.touches.length === 2 && touchPinchDist > 0 && mapWidth && mapHeight) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const factor = dist / touchPinchDist;

      const currentMidX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const currentMidY = (e.touches[0].clientY + e.touches[1].clientY) / 2;

      const res = zoomAtCursor(
        factor,
        initialPinchMidX,
        initialPinchMidY,
        initialPinchZoom,
        initialPinchPanX + (currentMidX - initialPinchMidX),
        initialPinchPanY + (currentMidY - initialPinchMidY),
        stage
      );
      currentZoom = res.zoom;
      panX = res.panX;
      panY = res.panY;
      applyZoom(box, mapWidth, currentZoom, mapHeight);
      applyTransform(box, panX, panY);
    }
  },
  { passive: true }
);

stage.addEventListener(
  'touchend',
  () => {
    touchPinchDist = 0;
  },
  { passive: true }
);

// UI Toolbar & Mode buttons
initModeButtons(
  modeButtons,
  currentMode,
  (newMode) => {
    currentMode = newMode;
  },
  box
);

initActionButtons(
  {
    undo: undoBtn,
    clear: clearBtn,
    zoomOut: zoomOutBtn,
    zoomIn: zoomInBtn,
    zoomFit: zoomFitBtn,
    savePng: savePngBtn,
    savePdf: savePdfBtn,
  },
  {
    onUndo: () => {
      if (currentUserRole === 'admin' || currentUserRole === 'editor') {
        undo();
      }
    },
    onClear: async () => {
      if (currentUserRole !== 'admin' && currentUserRole !== 'editor') {
        return;
      }
      if (marks.length > 0) {
        // If authenticated and project_id exists, delete all marks from Supabase
        if (currentUser && currentProjectId) {
          const marksBeforeClear = marks;
          const { data, error } = await clearAllMarks(currentProjectId);
          if (error) {
            showToast(toastElement, `Could not clear map: ${error.message}`);
            return;
          }
          const savedIds = new Set(data?.deleted_ids || []);
          if (marksBeforeClear.some((mark) => mark.id && !savedIds.has(mark.id))) {
            try {
              await reloadMarksFromSupabase(currentProjectId);
            } catch (syncError) {
              const message =
                syncError instanceof Error ? syncError.message : String(syncError);
              showToast(toastElement, `Could not verify clear operation: ${message}`);
              return;
            }
            if (marks.length) {
              showToast(toastElement, 'Some marks could not be cleared; the map was refreshed from Supabase.');
              return;
            }
            marks = marksBeforeClear;
          }
        }

        history = [];
        marks = [];
        refreshStatusUi();
        saveState();
        showToast(toastElement, 'Map cleared. Clear cannot be undone safely; undo history was cleared.');
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
          const claude = (
            window as unknown as {
              claude?: {
                use: (
                  svc: string
                ) => Promise<{ save: (opts: { filename: string; data: Blob }) => Promise<void> }>;
              };
            }
          ).claude;
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
    onSavePdf: async () => {
      if (!mapWidth || !mapHeight) return;

      try {
        const { jsPDF } = await import('jspdf');
        const compositeCanvas = compositeForExport(canvases, mapWidth, mapHeight);
        const pdf = new jsPDF({
          orientation: mapWidth > mapHeight ? 'landscape' : 'portrait',
          unit: 'pt',
          format: [mapWidth * 0.75, mapHeight * 0.75],
        });
        pdf.addImage(
          compositeCanvas.toDataURL('image/png'),
          'PNG',
          0,
          0,
          pdf.internal.pageSize.getWidth(),
          pdf.internal.pageSize.getHeight()
        );
        pdf.save(`RCD-${MAPS[currentMapIndex].id}-status-map.pdf`);
      } catch (error) {
        console.error('PDF export failed:', error);
        showToast(toastElement, 'Unable to export the map as a PDF.');
      }
    },
  }
);

// Keyboard Shortcuts (Ctrl+Z, 1-9/0 status, F/P/E modes)
const getStatusKeys = (): string[] => Object.keys(statuses);
initKeyboardShortcuts({
  onUndo: () => {
    if (currentUserRole === 'admin' || currentUserRole === 'editor') {
      undo();
    }
  },
  onSelectStatusIndex: (index) => {
    const statusKeys = getStatusKeys();
    if ((currentUserRole === 'admin' || currentUserRole === 'editor') && statusKeys[index]) {
      setStatus(statusKeys[index]);
    }
  },
  onSetMode: (mode) => {
    if (currentUserRole === 'admin' || currentUserRole === 'editor') {
      setMode(mode);
    }
  },
});

// 5. Initialize Theme (Light and Dark Green Modes)
initTheme();

// 6. Initialize App
try {
  const savedStatuses = JSON.parse(localStorage.getItem(COLOR_STORAGE_KEY) || '{}');
  for (const k in savedStatuses) {
    if (statuses[k]) {
      statuses[k].n = savedStatuses[k].n || statuses[k].n;
      statuses[k].c = savedStatuses[k].c || statuses[k].c;
    }
  }
  const lastMapId = localStorage.getItem('rrh-last');
  const foundIndex = MAPS.findIndex((m) => m.id === lastMapId);
  currentMapIndex = Math.max(0, foundIndex);
} catch {
  // Ignore storage errors
}

// Render status chips
persistStatuses();

legendCancelBtn?.addEventListener('click', closeLegendEditor);
btnAddStatus?.addEventListener('click', () => openLegendEditor('add'));
legendBackdrop?.addEventListener('click', (event) => {
  if (event.target === legendBackdrop) {
    closeLegendEditor();
  }
});
legendSaveBtn?.addEventListener('click', () => {
  const name = legendNameInput?.value.trim() || '';
  const color = legendColorInput?.value || '#1f9d55';
  if (!name) {
    showToast(toastElement, 'Add a status label before saving.');
    return;
  }

  if (legendEditorMode === 'edit' && legendEditorKey && statuses[legendEditorKey]) {
    statuses[legendEditorKey].n = name;
    statuses[legendEditorKey].c = color;
    currentStatus = legendEditorKey;
  } else {
    const newKey = generateStatusKey();
    statuses[newKey] = { n: name, c: color };
    currentStatus = newKey;
  }

  persistStatuses();
  closeLegendEditor();
  refreshStatusUi();
  saveState();
});

// Initialize project list (loads from Supabase if projects exist, else falls back to local MAPS)
async function initProjectList(preferredProjectId?: string): Promise<void> {
  const { data: projects, error } = await loadProjects();
  if (!error && projects && projects.length > 0) {
    const targetId = preferredProjectId || currentProjectId || projects[0].id;
    const targetProj = projects.find((p) => p.id === targetId) || projects[0];
    currentProject = targetProj;

    populateProjectSelect(mapSelect, projects, targetProj.id, (selectedProj) => {
      currentProject = selectedProj;
      openProject(selectedProj);
    });
    await openProject(targetProj);
  } else {
    currentProject = null;
    initMapSelector(mapSelect, MAPS, currentMapIndex, (newIndex) => {
      openMap(newIndex);
    });
    await openMap(currentMapIndex);
  }
}

// Initialize Map Modals for Admin (Upload & Remove Map)
const mapModals = initMapModals({
  onProjectCreated: async (newProj) => {
    await initProjectList(newProj.id);
  },
  onProjectDeleted: async () => {
    currentProjectId = null;
    currentProject = null;
    await initProjectList();
  },
  showToast: (msg) => showToast(toastElement, msg),
});

btnUploadMap?.addEventListener('click', () => {
  if (currentUserRole !== 'admin') {
    showToast(toastElement, 'Access denied: Admin permissions required to upload maps.');
    return;
  }
  mapModals.openUploadModal();
});

btnDeleteMap?.addEventListener('click', () => {
  if (currentUserRole !== 'admin') {
    showToast(toastElement, 'Access denied: Admin permissions required to delete maps.');
    return;
  }
  if (currentProject) {
    mapModals.openDeleteModal(currentProject);
  } else {
    showToast(toastElement, 'Default built-in template maps cannot be deleted.');
  }
});

// Initialize Authentication Gate & Route Guard
if (authScreen && appRoot && authForm && authEmail && authPassword && authError) {
  initAuth(
    {
      authScreen,
      appRoot,
      disabledScreen,
      disabledSignOutButton: disabledSignoutBtn,
      form: authForm,
      emailInput: authEmail,
      passwordInput: authPassword,
      errorContainer: authError,
      successContainer: authSuccess,
      authButton: authBtn,
      tabSignIn,
      tabSignUp,
      subtitle: authSubtitle,
      submitButton: authSubmitBtn,
    },
    {
      onLogin: async (user) => {
        const role = await getUserRole(user.id);

        if (role === 'disabled') {
          currentUser = null;
          showDisabledScreen({ authScreen, appRoot, disabledScreen });
          return;
        }

        currentUser = user;
        showAppScreen({ authScreen, appRoot, disabledScreen });
        applyUserRole(role);
        const roleLabel =
          role === 'admin' ? 'Administrator' : role === 'editor' ? 'Editor' : 'Viewer';
        showToast(toastElement, `Signed in as ${user.email} (${roleLabel})`);

        // Load projects and marks ONLY after user is verified
        await initProjectList();
      },
      onSignOut: () => {
        currentUser = null;
        currentUserRole = 'viewer';
        clearProjectSubscriptions();
        lotPanel.hide();
        lotTable.close();
        lotTable.setRows([]);
        lotTable.setCanEdit(false);
        lotRows = [];
        lotTableButton.style.display = 'none';
        currentProjectId = null;
        if (duplicateCleanupBtn && duplicateCleanupBackdrop) {
          setDuplicateCleanupAdmin(duplicateCleanupBackdrop, duplicateCleanupBtn, false);
          duplicateCleanupBackdrop.style.display = 'none';
          duplicateCleanupBackdrop.setAttribute('aria-hidden', 'true');
        }
        showAuthScreen({ authScreen, appRoot, disabledScreen });

        // Unsubscribe from real-time and clear map canvas memory
        marks = [];
        history = [];
        renderAll();
        showToast(toastElement, 'Signed out');
      },
    }
  );
}

// Navigation tab listeners
navMapBtn?.addEventListener('click', () => {
  switchToMap();
});

navUsersBtn?.addEventListener('click', async () => {
  await switchToUsers();
});
