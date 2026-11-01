import { supabase, type LotRegisterRow } from './supabase';

export interface SaveLotInput {
  projectId: string;
  markId: string | null;
  phase: string;
  block: string;
  lot: string;
  status: string;
}

export interface UpdateLotDetailsInput {
  phase: string;
  block: string;
  lot: string;
}

export interface LotRegisterChangeHandlers {
  onInsert?: (row: LotRegisterRow) => void;
  onUpdate?: (row: LotRegisterRow) => void;
  onDelete?: (row: Pick<LotRegisterRow, 'id'>) => void;
}

export class LotRegisterApiError extends Error {
  readonly code: string | null;

  constructor(message: string, code: string | null = null) {
    super(message);
    this.name = 'LotRegisterApiError';
    this.code = code;
  }
}

export class DuplicatePblError extends LotRegisterApiError {
  readonly conflictingRowId: string;

  constructor(conflictingRowId: string) {
    super('Another register row already uses this phase, block, and lot.');
    this.name = 'DuplicatePblError';
    this.conflictingRowId = conflictingRowId;
  }
}

function mapLotRegisterError(error: unknown): Error {
  if (error instanceof Error && !('code' in error)) {
    return error;
  }

  const candidate = error as {
    code?: unknown;
    details?: unknown;
    message?: unknown;
  };
  const code = typeof candidate.code === 'string' ? candidate.code : null;
  const details = typeof candidate.details === 'string' ? candidate.details : '';
  const message =
    typeof candidate.message === 'string' ? candidate.message : 'Lot register request failed.';

  if (
    code === '23505' &&
    (message.includes('lot_register_project_pbl_key') ||
      String(candidate.details ?? '').includes('lot_register_project_pbl_key'))
  ) {
    return new LotRegisterApiError(
      'Another register row already uses this phase, block, and lot.',
      code
    );
  }

  if (code === 'P0001' && message === 'DUPLICATE_PBL') {
    const conflictingRowId = /conflicting_lot_id=([0-9a-f-]{36})/i.exec(details)?.[1];
    if (conflictingRowId) {
      return new DuplicatePblError(conflictingRowId);
    }
  }

  return new LotRegisterApiError(
    details ? `${message} ${details}` : message,
    code
  );
}

function mapThrownError(error: unknown): Error {
  if (error instanceof LotRegisterApiError) {
    return error;
  }

  if (
    error !== null &&
    typeof error === 'object' &&
    ('code' in error || 'details' in error)
  ) {
    return mapLotRegisterError(error);
  }

  if (error instanceof Error) {
    return error;
  }
  return new LotRegisterApiError(String(error));
}

function throwOnDatabaseError(error: unknown): void {
  if (error) {
    throw mapLotRegisterError(error);
  }
}

export async function listLots(projectId: string): Promise<LotRegisterRow[]> {
  try {
    const { data, error } = await supabase
      .from('lot_register')
      .select('*')
      .eq('project_id', projectId)
      .order('phase', { ascending: true })
      .order('block', { ascending: true })
      .order('lot', { ascending: true })
      .returns<LotRegisterRow[]>();

    throwOnDatabaseError(error);
    if (!data) {
      throw new LotRegisterApiError('Loading lots returned no data.');
    }
    return data;
  } catch (error) {
    throw mapThrownError(error);
  }
}

export async function saveLot(input: SaveLotInput): Promise<LotRegisterRow> {
  try {
    const { data, error } = await supabase
      .rpc('save_lot', {
        p_project_id: input.projectId,
        p_mark_id: input.markId,
        p_phase: input.phase,
        p_block: input.block,
        p_lot: input.lot,
        p_status: input.status,
      })
      .returns<LotRegisterRow[]>()
      .single();

    throwOnDatabaseError(error);
    if (!data) {
      throw new LotRegisterApiError('Saving the lot returned no register row.');
    }
    return data;
  } catch (error) {
    throw mapThrownError(error);
  }
}

export async function updateLotStatus(
  id: string,
  status: string
): Promise<LotRegisterRow> {
  try {
    const { data, error } = await supabase
      .rpc('update_lot_status', { p_lot_id: id, p_status: status })
      .returns<LotRegisterRow[]>()
      .single();

    throwOnDatabaseError(error);
    if (!data) {
      throw new LotRegisterApiError('Updating the lot returned no register row.');
    }
    return data;
  } catch (error) {
    throw mapThrownError(error);
  }
}

export async function updateLotDetails(
  projectId: string,
  id: string,
  details: UpdateLotDetailsInput
): Promise<LotRegisterRow> {
  const phase = details.phase.trim().toLocaleUpperCase();
  const block = details.block.trim().toLocaleUpperCase();
  const lot = details.lot.trim().toLocaleUpperCase();
  if (!phase || !block || !lot) {
    throw new LotRegisterApiError('Phase, block, and lot are required.');
  }

  try {
    const { data, error } = await supabase
      .from('lot_register')
      .update({ phase, block, lot })
      .eq('id', id)
      .eq('project_id', projectId)
      .select('*')
      .single<LotRegisterRow>();

    throwOnDatabaseError(error);
    if (!data) {
      throw new LotRegisterApiError('Updating the lot details returned no register row.');
    }
    return data;
  } catch (error) {
    throw mapThrownError(error);
  }
}

export async function undoLotStatus(
  id: string,
  previousStatus: string
): Promise<LotRegisterRow> {
  try {
    const { data, error } = await supabase
      .rpc('undo_lot_status', {
        p_lot_id: id,
        p_previous_status: previousStatus,
      })
      .returns<LotRegisterRow[]>()
      .single();

    throwOnDatabaseError(error);
    if (!data) {
      throw new LotRegisterApiError('Undoing the lot status returned no register row.');
    }
    return data;
  } catch (error) {
    throw mapThrownError(error);
  }
}

export async function deleteLot(id: string): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('lot_register')
      .delete()
      .eq('id', id)
      .select('id')
      .maybeSingle();

    throwOnDatabaseError(error);
    if (!data) {
      throw new LotRegisterApiError('Lot was not found or is not writable.');
    }
  } catch (error) {
    throw mapThrownError(error);
  }
}

export function subscribeLots(
  projectId: string,
  handlers: LotRegisterChangeHandlers
): () => void {
  const channel = supabase
    .channel(`lot-register:${projectId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'lot_register',
        filter: `project_id=eq.${projectId}`,
      },
      (payload) => {
        if (payload.eventType === 'INSERT') {
          handlers.onInsert?.(payload.new as LotRegisterRow);
        } else if (payload.eventType === 'UPDATE') {
          handlers.onUpdate?.(payload.new as LotRegisterRow);
        } else if (payload.eventType === 'DELETE') {
          handlers.onDelete?.(payload.old as Pick<LotRegisterRow, 'id'>);
        }
      }
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
