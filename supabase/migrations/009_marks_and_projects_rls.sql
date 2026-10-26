-- 009_marks_and_projects_rls.sql
-- Update Row Level Security for marks and projects:
-- Any signed-in user who isn't disabled can read, and only editors and admins can write.

-- 1. Projects RLS
alter table public.projects enable row level security;

drop policy if exists "Authenticated users can read all projects" on public.projects;
drop policy if exists "Non-disabled users can read projects" on public.projects;
drop policy if exists "Admins can insert projects" on public.projects;
drop policy if exists "Admins can update projects" on public.projects;
drop policy if exists "Admins can delete projects" on public.projects;
drop policy if exists "Editors and admins can insert projects" on public.projects;
drop policy if exists "Editors and admins can update projects" on public.projects;
drop policy if exists "Editors and admins can delete projects" on public.projects;

create policy "Non-disabled users can read projects"
  on public.projects
  for select
  to authenticated
  using (public.get_caller_role() in ('viewer'::public.app_role, 'editor'::public.app_role, 'admin'::public.app_role));

create policy "Editors and admins can insert projects"
  on public.projects
  for insert
  to authenticated
  with check (public.get_caller_role() in ('editor'::public.app_role, 'admin'::public.app_role));

create policy "Editors and admins can update projects"
  on public.projects
  for update
  to authenticated
  using (public.get_caller_role() in ('editor'::public.app_role, 'admin'::public.app_role))
  with check (public.get_caller_role() in ('editor'::public.app_role, 'admin'::public.app_role));

create policy "Editors and admins can delete projects"
  on public.projects
  for delete
  to authenticated
  using (public.get_caller_role() in ('editor'::public.app_role, 'admin'::public.app_role));

-- 2. Marks RLS
alter table public.marks enable row level security;

drop policy if exists "Authenticated users can read marks" on public.marks;
drop policy if exists "Non-disabled users can read marks" on public.marks;
drop policy if exists "Editors and admins can insert marks" on public.marks;
drop policy if exists "Editors and admins can update marks" on public.marks;
drop policy if exists "Editors and admins can delete marks" on public.marks;

create policy "Non-disabled users can read marks"
  on public.marks
  for select
  to authenticated
  using (public.get_caller_role() in ('viewer'::public.app_role, 'editor'::public.app_role, 'admin'::public.app_role));

create policy "Editors and admins can insert marks"
  on public.marks
  for insert
  to authenticated
  with check (public.get_caller_role() in ('editor'::public.app_role, 'admin'::public.app_role));

create policy "Editors and admins can update marks"
  on public.marks
  for update
  to authenticated
  using (public.get_caller_role() in ('editor'::public.app_role, 'admin'::public.app_role))
  with check (public.get_caller_role() in ('editor'::public.app_role, 'admin'::public.app_role));

create policy "Editors and admins can delete marks"
  on public.marks
  for delete
  to authenticated
  using (public.get_caller_role() in ('editor'::public.app_role, 'admin'::public.app_role));

-- 3. Mark History RLS
alter table public.mark_history enable row level security;

drop policy if exists "Authenticated users can read mark history" on public.mark_history;
drop policy if exists "Non-disabled users can read mark history" on public.mark_history;
drop policy if exists "Editors and admins can insert mark history" on public.mark_history;

create policy "Non-disabled users can read mark history"
  on public.mark_history
  for select
  to authenticated
  using (public.get_caller_role() in ('viewer'::public.app_role, 'editor'::public.app_role, 'admin'::public.app_role));

create policy "Editors and admins can insert mark history"
  on public.mark_history
  for insert
  to authenticated
  with check (public.get_caller_role() in ('editor'::public.app_role, 'admin'::public.app_role));
