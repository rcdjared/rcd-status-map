import { supabase, type Project } from './supabase';
import type { ApiResponse } from './marks';

/**
 * Fetches all projects from Supabase ordered by name.
 */
export async function loadProjects(): Promise<ApiResponse<Project[]>> {
  try {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('name', { ascending: true });

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

  if (selectedId) {
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
