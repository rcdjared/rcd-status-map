import { supabase } from './supabase';

export interface UserProfile {
  id: string;
  email: string | null;
  display_name: string | null;
  role: 'admin' | 'editor' | 'viewer' | 'disabled';
  created_at: string;
}

export interface RoleChangeLog {
  id: string;
  target_user_id: string;
  old_role: string;
  new_role: string;
  changed_by: string;
  changed_at: string;
  changer_email?: string;
}

export interface ApiResponse<T> {
  data: T | null;
  error: Error | null;
}

/**
 * Fetch all users from public.profiles (Admin only via RLS).
 */
export async function fetchUsers(): Promise<ApiResponse<UserProfile[]>> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, display_name, role, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      return { data: null, error: new Error(error.message) };
    }

    return { data: (data as UserProfile[]) || [], error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error('Failed to fetch users'),
    };
  }
}

/**
 * Change a user's role by calling the secure Postgres function set_user_role().
 */
export async function setUserRole(
  userId: string,
  newRole: 'admin' | 'editor' | 'viewer' | 'disabled'
): Promise<ApiResponse<void>> {
  try {
    const { error } = await supabase.rpc('set_user_role', {
      target_user_id: userId,
      new_role: newRole,
    });

    if (error) {
      return { data: null, error: new Error(error.message) };
    }

    return { data: null, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error('Failed to update role'),
    };
  }
}

/**
 * Fetch role change audit history for a specific user.
 */
export async function fetchRoleChanges(
  userId?: string
): Promise<ApiResponse<RoleChangeLog[]>> {
  try {
    let query = supabase
      .from('role_changes')
      .select('id, target_user_id, old_role, new_role, changed_by, changed_at')
      .order('changed_at', { ascending: false });

    if (userId) {
      query = query.eq('target_user_id', userId);
    }

    const { data, error } = await query;
    if (error) {
      return { data: null, error: new Error(error.message) };
    }

    return { data: (data as RoleChangeLog[]) || [], error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error('Failed to fetch role history'),
    };
  }
}

/**
 * Invite / Create a user with Supabase auth.
 */
export async function createUserWithRole(
  email: string,
  password: string,
  role: 'admin' | 'editor' | 'viewer' | 'disabled' = 'viewer'
): Promise<ApiResponse<UserProfile>> {
  try {
    const { data: authData, error: authErr } = await supabase.auth.signUp({
      email,
      password,
    });

    if (authErr) {
      return { data: null, error: new Error(authErr.message) };
    }

    const user = authData.user;
    if (!user) {
      return { data: null, error: new Error('User creation returned no user') };
    }

    // If an initial role other than 'viewer' was requested, update via RPC
    if (role !== 'viewer') {
      const { error: roleErr } = await supabase.rpc('set_user_role', {
        target_user_id: user.id,
        new_role: role,
      });
      if (roleErr) {
        console.warn('Initial role update warning:', roleErr.message);
      }
    }

    return {
      data: {
        id: user.id,
        email: user.email || email,
        display_name: null,
        role,
        created_at: new Date().toISOString(),
      },
      error: null,
    };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error('Failed to create user'),
    };
  }
}
