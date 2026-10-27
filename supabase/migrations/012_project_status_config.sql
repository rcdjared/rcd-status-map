-- 012_project_status_config.sql
-- Add project-level status config so custom legend categories sync live across users.

alter table public.projects
  add column if not exists status_config jsonb not null default '{}';

-- Realtime needs to include projects table as well for live category updates.
alter publication supabase_realtime add table public.projects;
