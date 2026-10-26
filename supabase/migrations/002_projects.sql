-- 002_projects.sql
-- Create projects table with RLS policies

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  map_url text not null,
  legend_x real default 0.5,
  legend_y real default 0.5,
  created_at timestamptz not null default now()
);

-- Enable Row Level Security
alter table public.projects enable row level security;

-- Policy: authenticated users can read all projects
create policy "Authenticated users can read all projects"
  on public.projects
  for select
  to authenticated
  using (true);

-- Policy: only admins can insert projects
create policy "Admins can insert projects"
  on public.projects
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

-- Policy: only admins can update projects
create policy "Admins can update projects"
  on public.projects
  for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

-- Policy: only admins can delete projects
create policy "Admins can delete projects"
  on public.projects
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );
