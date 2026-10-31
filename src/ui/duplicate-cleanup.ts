import { findDuplicateFillGroups, newestMark, type DuplicateMarkGroup } from '../map/duplicate-marks';
import type { Mark } from '../map/painting';

export interface DuplicateCleanupElements {
  button: HTMLButtonElement;
  backdrop: HTMLElement;
  status: HTMLElement;
  tableBody: HTMLElement;
  emptyMessage: HTMLElement;
  confirmButton: HTMLButtonElement;
  closeButtons: HTMLButtonElement[];
}

export interface DuplicateCleanupResult {
  deleted: number;
  error: Error | null;
}

export function initDuplicateCleanup(
  elements: DuplicateCleanupElements,
  onLoad: () => Promise<Mark[]>,
  onDelete: (markIds: string[]) => Promise<DuplicateCleanupResult>
): void {
  let groups: DuplicateMarkGroup[] = [];

  function close(): void {
    elements.backdrop.style.display = 'none';
    elements.backdrop.setAttribute('aria-hidden', 'true');
  }

  function render(): void {
    elements.tableBody.replaceChildren();
    const duplicates = findDuplicateFillGroups(groups.flatMap((group) => group.marks));
    groups = duplicates;
    elements.emptyMessage.style.display = groups.length ? 'none' : 'block';
    elements.confirmButton.disabled = groups.length === 0;

    groups.forEach((group, groupIndex) => {
      const keep = newestMark(group.marks);
      for (const mark of group.marks) {
        const row = document.createElement('tr');
        const values = [
          `Lot ${groupIndex + 1}`,
          mark.id || 'Unsaved mark',
          mark.s,
          mark.updated_at ? new Date(mark.updated_at).toLocaleString() : 'Unknown',
          mark.updated_by || 'Unknown',
          mark === keep ? 'Keep (newest)' : 'Duplicate',
        ];
        for (const value of values) {
          const cell = document.createElement('td');
          cell.textContent = value;
          row.append(cell);
        }
        elements.tableBody.append(row);
      }
    });

    const duplicateCount = groups.reduce((count, group) => count + group.marks.length - 1, 0);
    elements.confirmButton.textContent = `Confirm and delete ${duplicateCount} duplicate${duplicateCount === 1 ? '' : 's'}`;
  }

  async function refresh(): Promise<void> {
    elements.status.textContent = 'Loading marks from Supabase…';
    elements.confirmButton.disabled = true;
    elements.emptyMessage.style.display = 'none';
    try {
      const marks = await onLoad();
      groups = findDuplicateFillGroups(marks);
      render();
      elements.status.textContent = groups.length
        ? `Dry run: found ${groups.length} duplicate lot group${groups.length === 1 ? '' : 's'}. No data has been changed.`
        : 'No duplicate fill groups found.';
    } catch (error) {
      groups = [];
      elements.tableBody.replaceChildren();
      elements.emptyMessage.style.display = 'none';
      elements.confirmButton.disabled = true;
      elements.status.textContent =
        error instanceof Error ? `Could not load marks: ${error.message}` : 'Could not load marks.';
    }
  }

  elements.button.addEventListener('click', async () => {
    if (elements.backdrop.dataset.admin !== 'true') return;
    elements.backdrop.style.display = 'flex';
    elements.backdrop.setAttribute('aria-hidden', 'false');
    await refresh();
  });

  elements.closeButtons.forEach((button) => button.addEventListener('click', close));
  elements.backdrop.addEventListener('click', (event) => {
    if (event.target === elements.backdrop) close();
  });

  elements.confirmButton.addEventListener('click', async () => {
    if (elements.backdrop.dataset.admin !== 'true') return;
    const duplicateIds = groups.flatMap((group) => {
      const keep = newestMark(group.marks);
      return group.marks
        .filter((mark) => mark !== keep)
        .map((mark) => mark.id)
        .filter((id): id is string => Boolean(id));
    });
    if (!duplicateIds.length) return;

    elements.confirmButton.disabled = true;
    elements.status.textContent = 'Deleting duplicate marks…';
    let result: DuplicateCleanupResult;
    try {
      result = await onDelete(duplicateIds);
    } catch (error) {
      result = {
        deleted: 0,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
    await refresh();
    const refreshedStatus = elements.status.textContent;
    if (result.error) {
      elements.status.textContent =
        `${result.deleted} duplicate${result.deleted === 1 ? '' : 's'} deleted before an error: ${result.error.message}. ${refreshedStatus}`;
    } else {
      elements.status.textContent =
        `${result.deleted} duplicate${result.deleted === 1 ? '' : 's'} deleted. ${refreshedStatus}`;
    }
  });

  elements.backdrop.dataset.admin = 'false';
}

export function setDuplicateCleanupAdmin(
  backdrop: HTMLElement,
  button: HTMLButtonElement,
  isAdmin: boolean
): void {
  backdrop.dataset.admin = String(isAdmin);
  button.style.display = isAdmin ? 'inline-flex' : 'none';
}
