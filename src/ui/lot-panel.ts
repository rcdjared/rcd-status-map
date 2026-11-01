import {
  DuplicatePblError,
  type SaveLotInput,
} from '../api/lotRegister';
import type { LotRegisterRow } from '../api/supabase';
import type { StatusMap } from '../map/painting';

export interface LotPanelContext {
  projectId: string;
  markId: string;
  status: string;
  row: LotRegisterRow | null;
}

export interface LotPanelSaveResult {
  row: LotRegisterRow;
  linkedExisting: boolean;
}

export interface LotPanelCallbacks {
  onSave: (input: SaveLotInput) => Promise<LotPanelSaveResult>;
  onShowExisting: (rowId: string) => void;
  getExistingLotLabel: (rowId: string) => string | null;
}

export interface LotPanel {
  open(context: LotPanelContext, statuses: StatusMap): void;
  close(): void;
  hide(): void;
  isOpen(): boolean;
}

export function initLotPanel(
  container: HTMLElement,
  callbacks: LotPanelCallbacks
): LotPanel {
  container.insertAdjacentHTML(
    'beforeend',
    `<aside class="lot-panel" aria-labelledby="lot-panel-title" hidden>
      <header class="lot-panel-header">
        <div>
          <h2 id="lot-panel-title">Lot details</h2>
          <p>Register this painted lot with its phase, block, and lot number.</p>
        </div>
        <button type="button" class="lot-panel-close" aria-label="Close lot details">×</button>
      </header>
      <form class="lot-panel-form">
        <label for="lot-phase">Phase</label>
        <input id="lot-phase" name="phase" type="text" maxlength="40" required autocomplete="off">
        <label for="lot-block">Block</label>
        <input id="lot-block" name="block" type="text" maxlength="40" required autocomplete="off">
        <label for="lot-number">Lot</label>
        <input id="lot-number" name="lot" type="text" maxlength="40" required autocomplete="off">
        <label for="lot-status">Status</label>
        <select id="lot-status" name="status" required></select>
        <p class="lot-panel-message" aria-live="polite"></p>
        <p class="lot-panel-warning" role="alert" aria-live="assertive" hidden></p>
        <button type="button" class="lot-panel-show-existing" hidden>Show existing lot</button>
        <div class="lot-panel-actions">
          <button type="button" class="lot-panel-cancel">Cancel</button>
          <button type="submit" class="lot-panel-save">Save lot</button>
        </div>
      </form>
    </aside>`
  );

  const panel = container.querySelector<HTMLElement>('.lot-panel')!;
  const form = panel.querySelector<HTMLFormElement>('form')!;
  const phaseInput = panel.querySelector<HTMLInputElement>('#lot-phase')!;
  const blockInput = panel.querySelector<HTMLInputElement>('#lot-block')!;
  const lotInput = panel.querySelector<HTMLInputElement>('#lot-number')!;
  const statusSelect = panel.querySelector<HTMLSelectElement>('#lot-status')!;
  const message = panel.querySelector<HTMLElement>('.lot-panel-message')!;
  const warning = panel.querySelector<HTMLElement>('.lot-panel-warning')!;
  const showExisting = panel.querySelector<HTMLButtonElement>('.lot-panel-show-existing')!;
  const saveButton = panel.querySelector<HTMLButtonElement>('.lot-panel-save')!;
  const closeButton = panel.querySelector<HTMLButtonElement>('.lot-panel-close')!;
  const cancelButton = panel.querySelector<HTMLButtonElement>('.lot-panel-cancel')!;
  let context: LotPanelContext | null = null;
  let duplicateKey: string | null = null;
  let duplicateRowId: string | null = null;

  const storageKey = (projectId: string): string => `rrh-lot-pbl-v1-${projectId}`;
  const currentPblKey = (): string =>
    [phaseInput.value, blockInput.value, lotInput.value]
      .map((value) => value.trim().toLocaleUpperCase())
      .join('\u001f');

  const saveStickyFields = (): void => {
    if (!context) return;
    try {
      localStorage.setItem(
        storageKey(context.projectId),
        JSON.stringify({ phase: phaseInput.value, block: blockInput.value })
      );
    } catch {
      // Keep the form usable when browser storage is unavailable.
    }
  };

  const clearDuplicate = (): void => {
    duplicateKey = null;
    duplicateRowId = null;
    warning.hidden = true;
    warning.textContent = '';
    showExisting.hidden = true;
    saveButton.disabled = false;
  };

  const onPblInput = (): void => {
    saveStickyFields();
    if (duplicateKey && currentPblKey() !== duplicateKey) {
      clearDuplicate();
    }
  };

  phaseInput.addEventListener('input', onPblInput);
  blockInput.addEventListener('input', onPblInput);
  lotInput.addEventListener('input', () => {
    if (duplicateKey && currentPblKey() !== duplicateKey) {
      clearDuplicate();
    }
  });

  const close = (): void => {
    panel.hidden = true;
    context = null;
  };

  closeButton.addEventListener('click', close);
  cancelButton.addEventListener('click', close);
  showExisting.addEventListener('click', () => {
    if (duplicateRowId) callbacks.onShowExisting(duplicateRowId);
  });

  panel.addEventListener('pointerdown', (event) => event.stopPropagation());
  panel.addEventListener('click', (event) => event.stopPropagation());
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!context || !form.reportValidity()) return;

    const pblKey = currentPblKey();
    if (duplicateKey === pblKey) return;
    saveButton.disabled = true;
    message.textContent = '';
    warning.hidden = true;
    showExisting.hidden = true;

    try {
      const result = await callbacks.onSave({
        projectId: context.projectId,
        markId: context.markId,
        phase: phaseInput.value,
        block: blockInput.value,
        lot: lotInput.value,
        status: statusSelect.value,
      });
      context = { ...context, markId: result.row.mark_id ?? context.markId, row: result.row };
      message.textContent = result.linkedExisting
        ? 'Linked the existing unmapped register row to this lot.'
        : 'Lot saved.';
      lotInput.value = '';
      clearDuplicate();
      lotInput.focus();
    } catch (error) {
      if (error instanceof DuplicatePblError) {
        duplicateKey = pblKey;
        duplicateRowId = error.conflictingRowId;
        const label = callbacks.getExistingLotLabel(duplicateRowId);
        warning.textContent = label
          ? `This PBL belongs to existing lot ${label}.`
          : 'This phase, block, and lot already belongs to a mapped lot.';
        warning.hidden = false;
        showExisting.hidden = false;
        saveButton.disabled = true;
      } else {
        warning.textContent = error instanceof Error ? error.message : String(error);
        warning.hidden = false;
        saveButton.disabled = false;
      }
    }
  });

  return {
    open(nextContext, statuses) {
      context = nextContext;
      duplicateKey = null;
      duplicateRowId = null;
      warning.hidden = true;
      warning.textContent = '';
      showExisting.hidden = true;
      message.textContent = '';
      panel.hidden = false;
      saveButton.disabled = false;

      let sticky: { phase?: string; block?: string } = {};
      try {
        const parsed: unknown = JSON.parse(
          localStorage.getItem(storageKey(nextContext.projectId)) || '{}'
        );
        if (parsed && typeof parsed === 'object') {
          const value = parsed as { phase?: unknown; block?: unknown };
          sticky = {
            phase: typeof value.phase === 'string' ? value.phase : '',
            block: typeof value.block === 'string' ? value.block : '',
          };
        }
      } catch {
        sticky = {};
      }
      phaseInput.value = nextContext.row?.phase ?? sticky.phase ?? '';
      blockInput.value = nextContext.row?.block ?? sticky.block ?? '';
      lotInput.value = nextContext.row?.lot ?? '';
      statusSelect.replaceChildren();
      for (const [key, config] of Object.entries(statuses)) {
        statusSelect.add(new Option(config.n, key));
      }
      if (!Object.prototype.hasOwnProperty.call(statuses, nextContext.status)) {
        statusSelect.add(new Option(`Unknown (${nextContext.status})`, nextContext.status));
      }
      statusSelect.value = nextContext.row?.status ?? nextContext.status;
      lotInput.focus();
    },
    close,
    hide() {
      close();
    },
    isOpen() {
      return !panel.hidden;
    },
  };
}
