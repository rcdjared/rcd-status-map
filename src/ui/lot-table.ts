import type { LotRegisterRow } from '../api/supabase';
import type { StatusMap } from '../map/painting';

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

export interface LotTableCallbacks {
  onSelectRow: (row: LotRegisterRow) => void;
  onUpdateStatus: (row: LotRegisterRow, status: string) => Promise<LotRegisterRow>;
  onUpdateDetails: (
    row: LotRegisterRow,
    details: Pick<LotRegisterRow, 'phase' | 'block' | 'lot'>
  ) => Promise<LotRegisterRow>;
  onDeleteRow: (row: LotRegisterRow) => Promise<void>;
  onError: (message: string) => void;
}

export interface LotTable {
  setRows(rows: LotRegisterRow[]): void;
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
        <div>
          <h2 id="lot-table-title">Lot register</h2>
          <p class="lot-table-count" aria-live="polite"></p>
        </div>
        <button type="button" class="lot-table-close" aria-label="Close lot register">×</button>
      </header>
      <div class="lot-table-filters">
        <label>Phase <select data-filter="phase"><option value="">All phases</option></select></label>
        <label>Block <select data-filter="block"><option value="">All blocks</option></select></label>
        <label>Status <select data-filter="status"><option value="">All statuses</option></select></label>
        <label class="lot-table-search">Search PBL
          <input type="search" placeholder="Search phase, block, or lot" autocomplete="off">
        </label>
      </div>
      <div class="lot-table-scroll">
        <table>
          <thead><tr>
            <th scope="col" data-sort="phase"><button type="button">Phase</button></th>
            <th scope="col" data-sort="block"><button type="button">Block</button></th>
            <th scope="col" data-sort="lot"><button type="button">Lot</button></th>
            <th scope="col" data-sort="status"><button type="button">Status</button></th>
            <th scope="col" data-actions-header hidden>Actions</th>
          </tr></thead>
          <tbody></tbody>
        </table>
        <p class="lot-table-empty" hidden>No lots match these filters.</p>
      </div>
    </section>`
  );

  const panel = container.querySelector<HTMLElement>('.lot-table-panel')!;
  panel.id = 'lot-table-panel';
  const closeButton = panel.querySelector<HTMLButtonElement>('.lot-table-close')!;
  const count = panel.querySelector<HTMLElement>('.lot-table-count')!;
  const tbody = panel.querySelector<HTMLTableSectionElement>('tbody')!;
  const empty = panel.querySelector<HTMLElement>('.lot-table-empty')!;
  const search = panel.querySelector<HTMLInputElement>('input[type="search"]')!;
  const filters = new Map<FilterColumn, HTMLSelectElement>();
  const headers = Array.from(panel.querySelectorAll<HTMLTableCellElement>('th[data-sort]'));
  const actionsHeader = panel.querySelector<HTMLTableCellElement>('[data-actions-header]')!;
  let rows: LotRegisterRow[] = [];
  let statuses: StatusMap = {};
  let canEdit = false;
  let editingRowId: string | null = null;
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
    const query = search.value.trim().toLocaleLowerCase();
    return rows
      .filter((row) => {
        if (phase && row.phase !== phase) return false;
        if (block && row.block !== block) return false;
        if (status && row.status !== status) return false;
        if (
          query &&
          !`${row.phase} ${row.block} ${row.lot}`.toLocaleLowerCase().includes(query)
        ) {
          return false;
        }
        return true;
      })
      .sort((left, right) => {
        const comparison = compareNatural(left[sortColumn], right[sortColumn]);
        return sortAscending ? comparison : -comparison;
      });
  };

  function render(): void {
    if (panel.hidden) {
      count.textContent = `${rows.length.toLocaleString()} lots`;
      return;
    }

    const visible = filteredRows();
    count.textContent = `${visible.length.toLocaleString()} of ${rows.length.toLocaleString()} lots`;
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
          addAction('Edit', 'edit', 'lot-table-action-edit', () => {
            editingRowId = row.id;
            render();
            panel.querySelector<HTMLInputElement>('.lot-table-detail-input')?.focus();
          });
          addAction('Delete', 'delete', 'lot-table-action-delete', async (button) => {
            if (!window.confirm(
              `Delete register entry ${row.phase}/${row.block}/${row.lot}?${row.mark_id ? ' Its map fill will remain.' : ''}`
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
        close();
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

  search.addEventListener('input', () => {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(render, 100);
  });
  closeButton.addEventListener('click', close);
  panel.addEventListener('pointerdown', (event) => event.stopPropagation());
  panel.addEventListener('click', (event) => event.stopPropagation());
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });

  function close(): void {
    const wasOpen = !panel.hidden;
    panel.hidden = true;
    toggleButton.setAttribute('aria-expanded', 'false');
    if (wasOpen && toggleButton.getClientRects().length > 0) toggleButton.focus();
  }

  toggleButton.setAttribute('aria-expanded', 'false');
  toggleButton.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    toggleButton.setAttribute('aria-expanded', String(!panel.hidden));
    if (!panel.hidden) {
      updateFilters();
      render();
      panel.querySelector<HTMLButtonElement>('.lot-table-close')?.focus();
    }
  });

  return {
    setRows(nextRows) {
      rows = [...nextRows];
      updateFilters();
      render();
    },
    setStatuses(nextStatuses) {
      statuses = nextStatuses;
      updateFilters();
      render();
    },
    setCanEdit(nextCanEdit) {
      canEdit = nextCanEdit;
      if (!canEdit) editingRowId = null;
      actionsHeader.hidden = !canEdit;
      render();
    },
    close,
  };
}
