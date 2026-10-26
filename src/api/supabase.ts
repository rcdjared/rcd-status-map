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

// Supabase Database generic schema mapping
export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Omit<Profile, 'id'>> & { id: string };
        Update: Partial<Profile>;
      };
      projects: {
        Row: Project;
        Insert: Omit<Project, 'id' | 'created_at'> & { id?: string; created_at?: string };
        Update: Partial<Project>;
      };
      marks: {
        Row: MarkRow;
        Insert: Omit<MarkRow, 'id' | 'updated_at'> & { id?: string; updated_at?: string };
        Update: Partial<MarkRow>;
      };
      mark_history: {
        Row: MarkHistory;
        Insert: Omit<MarkHistory, 'id' | 'changed_at'> & { id?: number; changed_at?: string };
        Update: Partial<MarkHistory>;
      };
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

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
