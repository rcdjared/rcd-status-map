import type { Json, LotRegisterHistoryRow, LotRegisterRow } from '../api/supabase';
import type { StatusMap } from '../map/painting';
import { summarizeLots } from '../register/summary.ts';
import { registerEscapeDismissable } from './escape-dismiss.ts';

type SortColumn = 'phase' | 'block' | 'lot' | 'status';
type FilterColumn = 'phase' | 'block' | 'status';
const naturalCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
  ignorePunctuation: false,
});

export function compareNatural(left: string, right: string): number {
  return naturalCollator.compare(left, right);
}

export function formatLotHistoryValue(
  field: string,
  value: Json | undefined,
  statuses: StatusMap
): string {
  if (value === null || value === undefined) return '—';
  if (field === 'status' && typeof value === 'string') {
    return statuses[value]?.n ?? value;
  }
  return String(value);
}

export function isVisibleHistoryField(field: string): boolean {
  return field !== 'mark_id' && field !== 'project_id';
}

export function matchesPblSearch(
  row: Pick<LotRegisterRow, 'phase' | 'block' | 'lot'>,
  query: string
): boolean {
  const terms = query.toLocaleLowerCase().split(/[\s,/]+/).filter(Boolean);
  if (!terms.length) return true;

  const fields = [row.phase, row.block, row.lot].map((value) =>
    value.toLocaleLowerCase()
  );
  return terms.every((term) => fields.some((field) => field.includes(term)));
}

export interface LotTableCallbacks {
  onSelectRow: (row: LotRegisterRow) => void;
  onUpdateStatus: (row: LotRegisterRow, status: string) => Promise<LotRegisterRow>;
  onUpdateDetails: (
    row: LotRegisterRow,
    details: Pick<LotRegisterRow, 'phase' | 'block' | 'lot'>
  ) => Promise<LotRegisterRow>;
  onDeleteRow: (row: LotRegisterRow) => Promise<void>;
  onLoadDisplayNames: (profileIds: string[]) => Promise<Map<string, string | null>>;
  onLoadHistory: (row: LotRegisterRow) => Promise<Array<LotRegisterHistoryRow & {
    actorName: string;
  }>>;
  onRestoreHistory: (history: LotRegisterHistoryRow) => Promise<LotRegisterRow>;
  onExportCsv: (rows: LotRegisterRow[], filtered: boolean) => void;
  onExportXlsx: (rows: LotRegisterRow[], filtered: boolean) => void;
  onError: (message: string) => void;
}

export interface LotTable {
  setRows(rows: LotRegisterRow[]): void;
  getRows(): LotRegisterRow[];
  getVisibleRows(): LotRegisterRow[];
  setStatuses(statuses: StatusMap): void;
  setCanEdit(canEdit: boolean): void;
  close(): void;
}

export function initLotTable(
  container: HTMLElement,
  toggleButton: HTMLButtonElement,
  callbacks: LotTableCallbacks
): LotTable {
  container.insertAdjacentHTML(
    'beforeend',
    `<section class="lot-table-panel" aria-labelledby="lot-table-title" hidden>
      <header class="lot-table-header">
        <div class="lot-table-header-main">
          <h2 id="lot-table-title">Lot register</h2>
          <p class="lot-table-count" aria-live="polite"></p>
        </div>
      </header>
      <div class="lot-table-summary" aria-live="polite">
        <div class="lot-table-summary-card">
          <span class="lot-table-summary-label">Total</span>
          <strong data-summary="total">0</strong>
        </div>
        <div class="lot-table-summary-card">
          <span class="lot-table-summary-label">Mapped</span>
          <strong data-summary="mapped">0</strong>
        </div>
        <div class="lot-table-summary-card">
          <span class="lot-table-summary-label">Unmapped</span>
          <strong data-summary="unmapped">0</strong>
        </div>
      </div>
      <div class="lot-table-filters">
        <label>Phase <select data-filter="phase"><option value="">All phases</option></select></label>
        <label>Block <select data-filter="block"><option value="">All blocks</option></select></label>
        <label>Status <select data-filter="status"><option value="">All statuses</option></select></label>
        <label class="lot-table-search">Search lots
          <input type="search" placeholder="Phase, block, or lot (e.g. 1 5 12)" autocomplete="off">
        </label>
      </div>
      <div class="lot-table-scroll">
        <table>
          <thead><tr>
            <th scope="col" data-sort="phase"><button type="button">Phase</button></th>
            <th scope="col" data-sort="block"><button type="button">Block</button></th>
            <th scope="col" data-sort="lot"><button type="button">Lot</button></th>
            <th scope="col" data-sort="status"><button type="button">Status</button></th>
            <th scope="col">Last edited</th>
            <th scope="col" data-actions-header hidden>Actions</th>
          </tr></thead>
          <tbody></tbody>
        </table>
        <p class="lot-table-empty" hidden>No lots match these filters.</p>
      </div>
      <footer class="lot-table-footer">
        <button type="button" class="lot-table-export-trigger" popovertarget="lot-table-export-options">
          Export
        </button>
        <button type="button" class="lot-table-close">Close table</button>
      </footer>
      <div id="lot-table-export-options" class="lot-table-export-panel" popover="auto">
        <button type="button" data-export="csv-filtered">Current CSV</button>
        <button type="button" data-export="csv-all">All CSV</button>
        <button type="button" data-export="xlsx-filtered">Current XLSX</button>
        <button type="button" data-export="xlsx-all">All XLSX</button>
      </div>
      <aside class="lot-history-drawer" aria-labelledby="lot-history-title" hidden>
        <header class="lot-history-header">
          <div>
            <h3 id="lot-history-title">Lot history</h3>
            <p class="lot-history-subtitle"></p>
          </div>
          <button type="button" class="lot-history-close" aria-label="Close lot history">×</button>
        </header>
        <p class="lot-history-message" aria-live="polite"></p>
        <ol class="lot-history-list"></ol>
      </aside>
    </section>`
  );

  const panel = container.querySelector<HTMLElement>('.lot-table-panel')!;
  panel.id = 'lot-table-panel';
  const escapeDismissal = registerEscapeDismissable(panel, () => {
    close();
    return true;
  });
  const closeButton = panel.querySelector<HTMLButtonElement>('.lot-table-close')!;
  const exportTrigger = panel.querySelector<HTMLButtonElement>('.lot-table-export-trigger')!;
  const exportPopover = panel.querySelector<HTMLDivElement>('#lot-table-export-options')!;
  const count = panel.querySelector<HTMLElement>('.lot-table-count')!;
  const summaryTotal = panel.querySelector<HTMLElement>('[data-summary="total"]')!;
  const summaryMapped = panel.querySelector<HTMLElement>('[data-summary="mapped"]')!;
  const summaryUnmapped = panel.querySelector<HTMLElement>('[data-summary="unmapped"]')!;
  const tbody = panel.querySelector<HTMLTableSectionElement>('tbody')!;
  const empty = panel.querySelector<HTMLElement>('.lot-table-empty')!;
  const search = panel.querySelector<HTMLInputElement>('input[type="search"]')!;
  const filters = new Map<FilterColumn, HTMLSelectElement>();
  const headers = Array.from(panel.querySelectorAll<HTMLTableCellElement>('th[data-sort]'));
  const actionsHeader = panel.querySelector<HTMLTableCellElement>('[data-actions-header]')!;
  const historyDrawer = panel.querySelector<HTMLElement>('.lot-history-drawer')!;
  const historyTitle = panel.querySelector<HTMLElement>('#lot-history-title')!;
  const historySubtitle = panel.querySelector<HTMLElement>('.lot-history-subtitle')!;
  const historyMessage = panel.querySelector<HTMLElement>('.lot-history-message')!;
  const historyList = panel.querySelector<HTMLOListElement>('.lot-history-list')!;
  const historyCloseButton = panel.querySelector<HTMLButtonElement>('.lot-history-close')!;
  let rows: LotRegisterRow[] = [];
  let displayNames = new Map<string, string | null>();
  let statuses: StatusMap = {};
  let canEdit = false;
  let editingRowId: string | null = null;
  let activeHistoryRowId: string | null = null;
  let displayNameRequest = 0;
  let historyRequest = 0;
  let sortColumn: SortColumn = 'phase';
  let sortAscending = true;
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  for (const column of ['phase', 'block', 'status'] as const) {
    const select = panel.querySelector<HTMLSelectElement>(`select[data-filter="${column}"]`)!;
    filters.set(column, select);
    select.addEventListener('change', render);
  }

  const setOptions = (
    select: HTMLSelectElement,
    values: string[],
    allLabel: string,
    labelFor: (value: string) => string = (value) => value
  ): void => {
    const previous = select.value;
    const fragment = document.createDocumentFragment();
    fragment.append(new Option(allLabel, ''));
    for (const value of values) fragment.append(new Option(labelFor(value), value));
    select.replaceChildren(fragment);
    if (values.includes(previous)) select.value = previous;
  };

  const updateFilters = (): void => {
    const unique = (values: string[]): string[] =>
      [...new Set(values)].sort(compareNatural);
    setOptions(
      filters.get('phase')!,
      unique(rows.map((row) => row.phase)),
      'All phases'
    );
    setOptions(
      filters.get('block')!,
      unique(rows.map((row) => row.block)),
      'All blocks'
    );
    const statusValues = unique([
      ...Object.keys(statuses),
      ...rows.map((row) => row.status),
    ]);
    setOptions(
      filters.get('status')!,
      statusValues,
      'All statuses',
      (key) => statuses[key]?.n ?? key
    );
  };

  const filteredRows = (): LotRegisterRow[] => {
    const phase = filters.get('phase')!.value;
    const block = filters.get('block')!.value;
    const status = filters.get('status')!.value;
    const query = search.value.trim();
    return rows
      .filter((row) => {
        if (phase && row.phase !== phase) return false;
        if (block && row.block !== block) return false;
        if (status && row.status !== status) return false;
        return matchesPblSearch(row, query);
      })
      .sort((left, right) => {
        const comparison = compareNatural(left[sortColumn], right[sortColumn]);
        return sortAscending ? comparison : -comparison;
      });
  };

  const formatUpdatedAt = (value: string): string => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Unknown time' : date.toLocaleString();
  };

  const loadDisplayNames = (): void => {
    const request = ++displayNameRequest;
    const ids = [...new Set(rows.map((row) => row.updated_by).filter(
      (id): id is string => id !== null && !displayNames.has(id)
    ))];
    if (!ids.length) {
      render();
      return;
    }

    void callbacks.onLoadDisplayNames(ids).then((names) => {
      if (request !== displayNameRequest) return;
      for (const id of ids) displayNames.set(id, names.get(id) ?? null);
      render();
    }).catch((error: unknown) => {
      if (request !== displayNameRequest) return;
      for (const id of ids) displayNames.set(id, null);
      callbacks.onError(
        `Could not load last-editor display names: ${error instanceof Error ? error.message : String(error)}`
      );
      render();
    });
  };

  const renderHistory = (
    history: Array<LotRegisterHistoryRow & { actorName: string }>
  ): void => {
    historyList.replaceChildren();
    if (!history.length) {
      historyMessage.textContent = 'No history has been recorded for this lot.';
      return;
    }
    historyMessage.textContent = '';

    for (const entry of history) {
      const item = document.createElement('li');
      item.className = 'lot-history-entry';

      const heading = document.createElement('div');
      heading.className = 'lot-history-entry-heading';
      const action = document.createElement('strong');
      action.textContent = entry.action === 'INSERT'
        ? 'Created'
        : entry.action === 'DELETE'
          ? 'Deleted'
          : 'Updated';
      const changedAt = document.createElement('time');
      changedAt.dateTime = entry.changed_at;
      changedAt.textContent = formatUpdatedAt(entry.changed_at);
      heading.append(action, changedAt);
      item.append(heading);

      const actor = document.createElement('p');
      actor.className = 'lot-history-actor';
      actor.textContent = entry.actorName;
      item.append(actor);

      const oldValues = entry.old_values && typeof entry.old_values === 'object' &&
        !Array.isArray(entry.old_values)
        ? entry.old_values as Record<string, Json | undefined>
        : {};
      const newValues = entry.new_values && typeof entry.new_values === 'object' &&
        !Array.isArray(entry.new_values)
        ? entry.new_values as Record<string, Json | undefined>
        : {};
      const fields = [...new Set([...Object.keys(oldValues), ...Object.keys(newValues)])];
      const visibleFields = fields.filter(isVisibleHistoryField);
      const changes = document.createElement('ul');
      changes.className = 'lot-history-changes';
      for (const field of visibleFields) {
        const change = document.createElement('li');
        const label = field.replaceAll('_', ' ');
        const oldValue = formatLotHistoryValue(field, oldValues[field], statuses);
        const newValue = formatLotHistoryValue(field, newValues[field], statuses);
        change.textContent = entry.action === 'INSERT'
          ? `${label}: ${newValue}`
          : entry.action === 'DELETE'
            ? `${label}: ${oldValue}`
            : `${label}: ${oldValue} → ${newValue}`;
        changes.append(change);
      }
      item.append(changes);

      if (canEdit && entry.action === 'UPDATE' && fields.length) {
        const restoreButton = document.createElement('button');
        restoreButton.type = 'button';
        restoreButton.className = 'lot-history-restore';
        restoreButton.textContent = 'Restore this version';
        restoreButton.addEventListener('click', async () => {
          restoreButton.disabled = true;
          try {
            const updated = await callbacks.onRestoreHistory(entry);
            rows = rows.map((row) => row.id === updated.id ? updated : row);
            updateFilters();
            render();
            historyMessage.textContent = 'Previous values restored as a new history entry.';
            const request = ++historyRequest;
            const selectedRow = rows.find((row) => row.id === updated.id);
            if (selectedRow) {
              const refreshed = await callbacks.onLoadHistory(selectedRow);
              if (request === historyRequest && activeHistoryRowId === selectedRow.id) {
                renderHistory(refreshed);
              }
            }
          } catch (error) {
            callbacks.onError(
              `Could not restore this version: ${error instanceof Error ? error.message : String(error)}`
            );
            restoreButton.disabled = false;
          }
        });
        item.append(restoreButton);
      }

      historyList.append(item);
    }
  };

  const openHistory = (row: LotRegisterRow): void => {
    activeHistoryRowId = row.id;
    const request = ++historyRequest;
    historyDrawer.hidden = false;
    historyTitle.textContent = `History: ${row.phase}/${row.block}/${row.lot}`;
    historySubtitle.textContent = 'Changes are append-only and cannot be edited or deleted.';
    historyMessage.textContent = 'Loading history…';
    historyList.replaceChildren();
    void callbacks.onLoadHistory(row).then((history) => {
      if (request !== historyRequest || activeHistoryRowId !== row.id) return;
      renderHistory(history);
    }).catch((error: unknown) => {
      if (request !== historyRequest || activeHistoryRowId !== row.id) return;
      historyMessage.textContent =
        `Could not load history: ${error instanceof Error ? error.message : String(error)}`;
      callbacks.onError(historyMessage.textContent);
    });
  };

  const closeHistory = (): void => {
    activeHistoryRowId = null;
    historyRequest += 1;
    historyDrawer.hidden = true;
  };

  function render(): void {
    if (panel.hidden) {
      count.textContent = `${rows.length.toLocaleString()} lots`;
      return;
    }

    const visible = filteredRows();
    const summary = summarizeLots(visible);
    count.textContent = `${visible.length.toLocaleString()} of ${rows.length.toLocaleString()} lots`;
    summaryTotal.textContent = summary.total.toLocaleString();
    summaryMapped.textContent = summary.mapped.toLocaleString();
    summaryUnmapped.textContent = summary.unmapped.toLocaleString();
    empty.hidden = visible.length > 0;
    tbody.replaceChildren();

    const fragment = document.createDocumentFragment();
    for (const row of visible) {
      const tr = document.createElement('tr');
      const isEditing = canEdit && editingRowId === row.id;
      tr.dataset.rowId = row.id;
      tr.tabIndex = 0;
      tr.setAttribute(
        'aria-label',
        `${row.phase}, block ${row.block}, lot ${row.lot}${row.mark_id ? '' : ', unmapped from the map'}`
      );

      for (const [index, value] of [row.phase, row.block, row.lot].entries()) {
        const cell = document.createElement('td');
        if (isEditing) {
          const field = (['phase', 'block', 'lot'] as const)[index];
          const input = document.createElement('input');
          input.type = 'text';
          input.required = true;
          input.value = value;
          input.dataset.field = field;
          input.className = 'lot-table-detail-input';
          input.setAttribute('aria-label', `${field} for ${row.phase}/${row.block}/${row.lot}`);
          input.addEventListener('click', (event) => event.stopPropagation());
          input.addEventListener('keydown', (event) => {
            event.stopPropagation();
            if (event.key === 'Enter') {
              event.preventDefault();
              tr.querySelector<HTMLButtonElement>('[data-action="save"]')?.click();
            }
          });
          cell.append(input);
        } else {
          cell.textContent = value;
        }
        if (!isEditing && index === 2 && !row.mark_id) {
          const unmapped = document.createElement('span');
          unmapped.className = 'lot-table-unmapped';
          unmapped.textContent = 'Unmapped';
          cell.append(unmapped);
        }
        tr.append(cell);
      }

      const statusCell = document.createElement('td');
      const config = statuses[row.status];
      if (canEdit) {
        const select = document.createElement('select');
        select.className = 'lot-table-status-select';
        select.setAttribute('aria-label', `Status for ${row.phase}/${row.block}/${row.lot}`);
        const options = Object.entries(statuses);
        if (!Object.prototype.hasOwnProperty.call(statuses, row.status)) {
          options.push([row.status, { n: row.status, c: '#64748b' }]);
        }
        for (const [key, value] of options) {
          select.add(new Option(value.n, key));
        }
        select.value = row.status;
        if (config?.c) select.style.setProperty('--lot-status-color', config.c);
        select.addEventListener('click', (event) => event.stopPropagation());
        select.addEventListener('keydown', (event) => event.stopPropagation());
        select.addEventListener('change', async () => {
          select.disabled = true;
          try {
            const updated = await callbacks.onUpdateStatus(row, select.value);
            rows = rows.map((candidate) => candidate.id === updated.id ? updated : candidate);
            updateFilters();
            render();
          } catch (error) {
            select.value = row.status;
            callbacks.onError(error instanceof Error ? error.message : String(error));
          } finally {
            select.disabled = false;
          }
        });
        statusCell.append(select);
      } else {
        const chip = document.createElement('span');
        chip.className = 'lot-table-status-chip';
        chip.textContent = config?.n ?? row.status;
        if (config?.c) {
          chip.style.setProperty('--lot-status-color', config.c);
        }
        statusCell.append(chip);
      }
      tr.append(statusCell);

      const lastEdited = document.createElement('td');
      const editorName = row.updated_by
        ? displayNames.get(row.updated_by)?.trim()
        : null;
      lastEdited.textContent = `${editorName || 'Former user'} · ${formatUpdatedAt(row.updated_at)}`;
      tr.append(lastEdited);

      if (canEdit) {
        const actionsCell = document.createElement('td');
        actionsCell.className = 'lot-table-row-actions';
        const addAction = (
          label: string,
          action: string,
          className: string,
          onClick: (button: HTMLButtonElement) => void
        ): HTMLButtonElement => {
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = label;
          button.dataset.action = action;
          button.className = className;
          button.addEventListener('click', (event) => {
            event.stopPropagation();
            onClick(button);
          });
          button.addEventListener('keydown', (event) => event.stopPropagation());
          actionsCell.append(button);
          return button;
        };

        if (isEditing) {
          addAction('Save', 'save', 'lot-table-action-save', async (button) => {
            const inputs = tr.querySelectorAll<HTMLInputElement>('.lot-table-detail-input');
            const details = {
              phase: inputs[0]?.value ?? '',
              block: inputs[1]?.value ?? '',
              lot: inputs[2]?.value ?? '',
            };
            button.disabled = true;
            try {
              const updated = await callbacks.onUpdateDetails(row, details);
              rows = rows.map((candidate) => candidate.id === updated.id ? updated : candidate);
              editingRowId = null;
              updateFilters();
              render();
            } catch (error) {
              callbacks.onError(error instanceof Error ? error.message : String(error));
              button.disabled = false;
            }
          });
          addAction('Cancel', 'cancel', 'lot-table-action-cancel', () => {
            editingRowId = null;
            render();
          });
        } else {
          addAction('History', 'history', 'lot-table-action-history', () => {
            openHistory(row);
          });
          addAction('Edit', 'edit', 'lot-table-action-edit', () => {
            editingRowId = row.id;
            render();
            panel.querySelector<HTMLInputElement>('.lot-table-detail-input')?.focus();
          });
          addAction('Delete', 'delete', 'lot-table-action-delete', async (button) => {
            if (!window.confirm(
              `Delete register entry ${row.phase}/${row.block}/${row.lot}?${row.mark_id ? ' Its linked map mark will also be removed.' : ''}`
            )) {
              return;
            }
            button.disabled = true;
            try {
              await callbacks.onDeleteRow(row);
              rows = rows.filter((candidate) => candidate.id !== row.id);
              editingRowId = null;
              updateFilters();
              render();
            } catch (error) {
              callbacks.onError(error instanceof Error ? error.message : String(error));
              button.disabled = false;
            }
          });
        }
        tr.append(actionsCell);
      }

      const selectRow = (): void => {
        if (isEditing) return;
        callbacks.onSelectRow(row);
      };
      tr.addEventListener('click', selectRow);
      tr.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          selectRow();
        }
      });
      fragment.append(tr);
    }
    tbody.append(fragment);

    for (const header of headers) {
      const column = header.dataset.sort as SortColumn;
      header.setAttribute(
        'aria-sort',
        column === sortColumn ? (sortAscending ? 'ascending' : 'descending') : 'none'
      );
    }
    actionsHeader.hidden = !canEdit;
  };

  for (const header of headers) {
    header.querySelector('button')!.addEventListener('click', () => {
      const column = header.dataset.sort as SortColumn;
      if (sortColumn === column) sortAscending = !sortAscending;
      else {
        sortColumn = column;
        sortAscending = true;
      }
      render();
    });
  }

  const positionExportPopover = (): void => {
    if (!exportPopover.matches(':popover-open')) return;

    const triggerRect = exportTrigger.getBoundingClientRect();
    const popoverRect = exportPopover.getBoundingClientRect();
    const left = Math.max(
      8,
      Math.min(triggerRect.right - popoverRect.width, window.innerWidth - popoverRect.width - 8)
    );
    const top =
      triggerRect.top >= popoverRect.height + 8
        ? triggerRect.top - popoverRect.height - 8
        : Math.min(triggerRect.bottom + 8, window.innerHeight - popoverRect.height - 8);

    exportPopover.style.left = `${left}px`;
    exportPopover.style.top = `${Math.max(8, top)}px`;
  };

  exportPopover.addEventListener('toggle', positionExportPopover);
  window.addEventListener('resize', positionExportPopover);
  window.addEventListener('scroll', positionExportPopover, true);

  for (const exportButton of panel.querySelectorAll<HTMLButtonElement>('[data-export]')) {
    exportButton.addEventListener('click', () => {
      const mode = exportButton.dataset.export ?? 'csv-filtered';
      const filtered = mode.includes('filtered');
      if (mode.startsWith('csv')) {
        callbacks.onExportCsv(filtered ? filteredRows() : rows, filtered);
      } else {
        callbacks.onExportXlsx(filtered ? filteredRows() : rows, filtered);
      }
      exportPopover.hidePopover();
    });
  }

  search.addEventListener('input', () => {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(render, 100);
  });
  closeButton.addEventListener('click', close);
  historyCloseButton.addEventListener('click', closeHistory);
  historyDrawer.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeHistory();
    }
  });
  panel.addEventListener('pointerdown', (event) => event.stopPropagation());
  panel.addEventListener('click', (event) => event.stopPropagation());
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') event.stopPropagation();
  });

  function close(): void {
    const wasOpen = !panel.hidden;
    panel.hidden = true;
    escapeDismissal.deactivate();
    toggleButton.setAttribute('aria-expanded', 'false');
    if (wasOpen && toggleButton.getClientRects().length > 0) toggleButton.focus();
  }

  toggleButton.setAttribute('aria-expanded', 'false');
  toggleButton.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    if (panel.hidden) escapeDismissal.deactivate();
    else escapeDismissal.activate();
    toggleButton.setAttribute('aria-expanded', String(!panel.hidden));
    if (!panel.hidden) {
      updateFilters();
      render();
      search.focus();
    }
  });

  return {
    setRows(nextRows) {
      rows = [...nextRows];
      updateFilters();
      render();
      loadDisplayNames();
    },
    getRows() {
      return [...rows];
    },
    getVisibleRows() {
      return filteredRows();
    },
    setStatuses(nextStatuses) {
      statuses = nextStatuses;
      updateFilters();
      render();
    },
    setCanEdit(nextCanEdit) {
      canEdit = nextCanEdit;
      if (!canEdit) editingRowId = null;
      if (!canEdit) closeHistory();
      actionsHeader.hidden = !canEdit;
      render();
    },
    close,
  };
}
