import { supabase, type Database, type MarkRow } from './supabase';
import { canUndoStatusChange } from '../map/undo';

export interface MarkData {
  id?: string;
  project_id: string;
  x: number;
  y: number;
  status: string;
  kind: 'fill' | 'pin';
  updated_by?: string | null;
}

export interface ApiResponse<T> {
  data: T | null;
  error: Error | null;
}

/**
 * Fetches all marks for a given project from Supabase, ordered chronologically.
 */
export async function loadMarks(
  projectId: string
): Promise<ApiResponse<MarkRow[]>> {
  try {
    const { data, error } = await supabase
      .from('marks')
      .select('*')
      .eq('project_id', projectId)
      .order('updated_at', { ascending: true });

    if (error) {
      return { data: null, error: new Error(error.message) };
    }

    return { data, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}

/**
 * Upserts a single mark (insert if new, update if matching id exists).
 */
export async function saveMark(
  mark: MarkData
): Promise<ApiResponse<MarkRow>> {
  try {
    const payload: Database['public']['Tables']['marks']['Insert'] = {
      ...mark,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('marks')
      .upsert(payload)
      .select()
      .single();

    if (error) {
      return { data: null, error: new Error(error.message) };
    }

    return { data, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}

export async function updateMark(
  markId: string,
  updates: Pick<MarkData, 'status' | 'updated_by'>
): Promise<ApiResponse<MarkRow>> {
  try {
    const { data, error } = await supabase
      .from('marks')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', markId)
      .select()
      .single();

    if (error) {
      return { data: null, error: new Error(error.message) };
    }
    return { data, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}

export async function undoStatusChange(
  markId: string,
  previousStatus: string
): Promise<ApiResponse<MarkRow>> {
  try {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      return { data: null, error: new Error('Sign in before undoing a status change.') };
    }

    const { data: latestChange, error: historyError } = await supabase
      .from('mark_history')
      .select('old_status, new_status, changed_by')
      .eq('mark_id', markId)
      .order('changed_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (historyError) {
      return { data: null, error: new Error(historyError.message) };
    }
    if (
      !latestChange ||
      latestChange.old_status !== previousStatus ||
      !canUndoStatusChange(
        previousStatus,
        latestChange.new_status ?? '',
        latestChange.changed_by,
        authData.user.id
      )
    ) {
      return {
        data: null,
        error: new Error('This status was changed by another action. Refresh before undoing.'),
      };
    }

    const { data, error } = await supabase
      .from('marks')
      .update({
        status: previousStatus,
        updated_by: authData.user.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', markId)
      .eq('status', latestChange.new_status)
      .select()
      .maybeSingle();

    if (error) {
      return { data: null, error: new Error(error.message) };
    }
    if (!data) {
      return {
        data: null,
        error: new Error('This mark changed since the action. Undo was cancelled.'),
      };
    }
    return { data, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}

/**
 * Deletes a mark by its UUID.
 */
export async function deleteMark(
  markId: string
): Promise<ApiResponse<{ id: string }>> {
  try {
    const { error } = await supabase
      .from('marks')
      .delete()
      .eq('id', markId)
      .select('id')
      .single();

    if (error) {
      return { data: null, error: new Error(error.message) };
    }

    return { data: { id: markId }, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}

/**
 * Deletes all marks associated with a specific project.
 */
export async function clearAllMarks(
  projectId: string
): Promise<ApiResponse<{ project_id: string }>> {
  try {
    const { error } = await supabase
      .from('marks')
      .delete()
      .eq('project_id', projectId);

    if (error) {
      return { data: null, error: new Error(error.message) };
    }

    return {
      data: { project_id: projectId },
      error: null,
    };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}

export interface RealtimeMarkChange {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  newRecord: MarkRow | null;
  oldRecord: { id: string } | null;
}

/**
 * Subscribes to realtime Postgres changes for marks belonging to a specific project.
 * Returns an unsubscribe callback.
 */
export function subscribeToMarks(
  projectId: string,
  onChange: (change: RealtimeMarkChange) => void
): () => void {
  const channel = supabase
    .channel(`marks:${projectId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'marks',
        filter: `project_id=eq.${projectId}`,
      },
      (payload) => {
        onChange({
          eventType: payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
          newRecord: (payload.new as MarkRow) || null,
          oldRecord: (payload.old as { id: string }) || null,
        });
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
