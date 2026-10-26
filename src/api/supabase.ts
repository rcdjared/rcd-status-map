import { createClient } from '@supabase/supabase-js';

// Table Row Types
export interface Profile {
  id: string; // references auth.users(id)
  display_name: string | null;
  role: 'admin' | 'editor' | 'viewer';
  created_at: string;
}

export interface Project {
  id: string;
  name: string;
  map_url: string;
  legend_x: number;
  legend_y: number;
  created_at: string;
}

export interface MarkRow {
  id: string;
  project_id: string;
  x: number;
  y: number;
  status: string;
  kind: 'fill' | 'pin';
  updated_by: string | null;
  updated_at: string;
}

export interface MarkHistory {
  id: number;
  mark_id: string | null;
  old_status: string | null;
  new_status: string | null;
  changed_by: string | null;
  changed_at: string;
}

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// Standard Supabase generic Database schema
export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: {
          id: string;
          display_name?: string | null;
          role?: 'admin' | 'editor' | 'viewer';
          created_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string | null;
          role?: 'admin' | 'editor' | 'viewer';
          created_at?: string;
        };
        Relationships: [];
      };
      projects: {
        Row: Project;
        Insert: {
          id?: string;
          name: string;
          map_url: string;
          legend_x?: number;
          legend_y?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          map_url?: string;
          legend_x?: number;
          legend_y?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      marks: {
        Row: MarkRow;
        Insert: {
          id?: string;
          project_id: string;
          x: number;
          y: number;
          status: string;
          kind?: 'fill' | 'pin';
          updated_by?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          x?: number;
          y?: number;
          status?: string;
          kind?: 'fill' | 'pin';
          updated_by?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      mark_history: {
        Row: MarkHistory;
        Insert: {
          id?: number;
          mark_id?: string | null;
          old_status?: string | null;
          new_status?: string | null;
          changed_by?: string | null;
          changed_at?: string;
        };
        Update: {
          id?: number;
          mark_id?: string | null;
          old_status?: string | null;
          new_status?: string | null;
          changed_by?: string | null;
          changed_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing from environment variables. ' +
      'Please ensure .env is configured with your Supabase credentials.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Fetches the user's role from the public.profiles table.
 * Defaults to 'viewer' if not found or on error.
 */
export async function getUserRole(
  userId: string
): Promise<'admin' | 'editor' | 'viewer' | 'disabled'> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();

    if (error || !data) {
      return 'viewer';
    }
    return (data.role as 'admin' | 'editor' | 'viewer' | 'disabled') || 'viewer';
  } catch {
    return 'viewer';
  }
}
