import { supabase, type Database, type MarkRow } from './supabase';

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
      .eq('id', markId);

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

    return { data: { project_id: projectId }, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}
