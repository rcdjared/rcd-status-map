import { supabase, type Project } from './supabase';
import { loadMapImage } from '../map/canvas';
import type { ApiResponse } from './marks';

const LOCAL_CUSTOM_PROJECTS_KEY = 'rrh-custom-projects-v1';

/**
 * Loads custom projects stored locally in localStorage (offline/local fallback).
 */
export function getLocalCustomProjects(): Project[] {
  try {
    const raw = localStorage.getItem(LOCAL_CUSTOM_PROJECTS_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

/**
 * Saves custom projects to localStorage.
 */
export function saveLocalCustomProjects(projects: Project[]): void {
  try {
    localStorage.setItem(LOCAL_CUSTOM_PROJECTS_KEY, JSON.stringify(projects));
  } catch {
    // Ignore storage quota errors
  }
}

/**
 * Fetches all projects from Supabase ordered by name, falling back or merging with locally created projects.
 */
export async function loadProjects(): Promise<ApiResponse<Project[]>> {
  try {
    const localProjects = getLocalCustomProjects();
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      console.warn('Supabase projects fetch error, using local projects:', error.message);
      return { data: localProjects, error: null };
    }

    // Merge remote projects with local projects (avoiding duplicates by id)
    const existingIds = new Set(data.map((p) => p.id));
    const combined = [...data];
    localProjects.forEach((lp) => {
      if (!existingIds.has(lp.id)) {
        combined.push(lp);
      }
    });

    return { data: combined, error: null };
  } catch (err) {
    const localProjects = getLocalCustomProjects();
    return {
      data: localProjects,
      error: null,
    };
  }
}

/**
 * Uploads a map image Blob to Supabase Storage in the 'maps' bucket.
 * If the bucket doesn't exist or storage is not enabled, falls back to returning the provided data URL.
 */
export async function uploadMapImage(
  blob: Blob,
  fileName: string,
  fallbackDataUrl?: string
): Promise<string> {
  const cleanName = `${Date.now()}-${fileName.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

  try {
    const { data, error } = await supabase.storage
      .from('maps')
      .upload(cleanName, blob, {
        contentType: blob.type || 'image/png',
        upsert: true,
      });

    if (error) {
      console.warn('Supabase storage upload error, falling back to data URL:', error.message);
      if (fallbackDataUrl) return fallbackDataUrl;
      return await blobToDataUrl(blob);
    }

    if (data?.path) {
      const { data: pubData } = supabase.storage.from('maps').getPublicUrl(data.path);
      if (pubData?.publicUrl) {
        return pubData.publicUrl;
      }
    }
  } catch (err) {
    console.warn('Supabase storage upload exception, using data URL fallback:', err);
  }

  if (fallbackDataUrl) return fallbackDataUrl;
  return await blobToDataUrl(blob);
}

/**
 * Creates a new project in the Supabase `projects` table.
 * If offline or Supabase fails, saves it to localStorage so the admin can still use it immediately.
 */
export async function createProject(params: {
  name: string;
  map_url: string;
  legend_x?: number;
  legend_y?: number;
}): Promise<ApiResponse<Project>> {
  try {
    const newProjPayload = {
      name: params.name.trim(),
      map_url: params.map_url,
      legend_x: params.legend_x ?? 0.5,
      legend_y: params.legend_y ?? 0.5,
    };

    const { data, error } = await supabase
      .from('projects')
      .insert(newProjPayload)
      .select('*')
      .single();

    if (error) {
      console.warn('Supabase createProject error, falling back to local storage:', error.message);
      const localFallbackProject: Project = {
        id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: params.name.trim(),
        map_url: params.map_url,
        legend_x: params.legend_x ?? 0.5,
        legend_y: params.legend_y ?? 0.5,
        created_at: new Date().toISOString(),
      };
      const existing = getLocalCustomProjects();
      saveLocalCustomProjects([localFallbackProject, ...existing]);
      return { data: localFallbackProject, error: null };
    }

    return { data, error: null };
  } catch (err) {
    const localFallbackProject: Project = {
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: params.name.trim(),
      map_url: params.map_url,
      legend_x: params.legend_x ?? 0.5,
      legend_y: params.legend_y ?? 0.5,
      created_at: new Date().toISOString(),
    };
    const existing = getLocalCustomProjects();
    saveLocalCustomProjects([localFallbackProject, ...existing]);
    return { data: localFallbackProject, error: null };
  }
}

/**
 * Deletes a project from Supabase (and removes it from local custom projects if present).
 * Cascading foreign keys will delete associated marks and mark_history rows.
 */
export async function deleteProject(projectId: string): Promise<ApiResponse<void>> {
  try {
    // Remove from local custom projects
    const locals = getLocalCustomProjects();
    const updatedLocals = locals.filter((p) => p.id !== projectId);
    saveLocalCustomProjects(updatedLocals);

    // If it's a local-only project, no need to call Supabase
    if (projectId.startsWith('local-')) {
      return { data: undefined, error: null };
    }

    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', projectId);

    if (error) {
      return { data: null, error: new Error(error.message) };
    }

    return { data: undefined, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}

function storagePathFromMapUrl(mapUrl: string): string | null {
  const markers = [
    '/storage/v1/object/public/maps/',
    '/storage/v1/object/sign/maps/',
    '/storage/v1/object/authenticated/maps/',
  ];
  for (const marker of markers) {
    const idx = mapUrl.indexOf(marker);
    if (idx !== -1) {
      return decodeURIComponent(mapUrl.slice(idx + marker.length).split('?')[0]);
    }
  }
  return null;
}

/**
 * Loads a project map so the canvas is not tainted by a cross-origin storage URL.
 * Prefers a same-origin blob from Storage download, then falls back to URL fetch.
 */
export async function loadProjectMapImage(mapUrl: string): Promise<HTMLImageElement> {
  const path = storagePathFromMapUrl(mapUrl);
  if (path) {
    const { data, error } = await supabase.storage.from('maps').download(path);
    if (!error && data) {
      const objectUrl = URL.createObjectURL(data);
      try {
        return await loadMapImage(objectUrl);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    }
  }

  return loadMapImage(mapUrl);
}

/**
 * Utility to convert Blob to Data URL
 */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to convert blob to data URL'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Populates the `<select id="mp">` dropdown with project names and attaches a change handler.
 *
 * @param selectElement The `<select>` DOM element
 * @param projects List of projects to display
 * @param selectedId ID of the currently selected project
 * @param onSelect Callback invoked with the selected Project object
 */
export function populateProjectSelect(
  selectElement: HTMLSelectElement,
  projects: Project[],
  selectedId: string | undefined,
  onSelect: (project: Project) => void
): void {
  selectElement.innerHTML = '';

  projects.forEach((proj) => {
    const option = new Option(proj.name, proj.id);
    selectElement.add(option);
  });

  if (selectedId && projects.some((p) => p.id === selectedId)) {
    selectElement.value = selectedId;
  } else if (projects.length > 0) {
    selectElement.value = projects[0].id;
  }

  selectElement.onchange = () => {
    const selected = projects.find((p) => p.id === selectElement.value);
    if (selected) {
      onSelect(selected);
    }
  };
}
