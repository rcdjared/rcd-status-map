-- 003_marks.sql
-- Create marks and mark_history tables with RLS and audit trigger

-- 1. Marks table
create table public.marks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  x real not null,
  y real not null,
  status text not null,
  kind text not null default 'fill' check (kind in ('fill', 'pin')),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Index for fast lookup by project
create index idx_marks_project_id on public.marks(project_id);

-- 2. Mark history table (audit log)
create table public.mark_history (
  id bigint generated always as identity primary key,
  mark_id uuid references public.marks(id) on delete cascade,
  old_status text,
  new_status text,
  changed_by uuid references public.profiles(id) on delete set null,
  changed_at timestamptz not null default now()
);

-- Index for lookup by mark
create index idx_mark_history_mark_id on public.mark_history(mark_id);

-- 3. Enable Row Level Security
alter table public.marks enable row level security;
alter table public.mark_history enable row level security;

-- 4. Marks RLS Policies

-- Policy: anyone authenticated can read marks
create policy "Authenticated users can read marks"
  on public.marks
  for select
  to authenticated
  using (true);

-- Policy: editors and admins can insert marks
create policy "Editors and admins can insert marks"
  on public.marks
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'editor')
    )
  );

-- Policy: editors and admins can update marks
create policy "Editors and admins can update marks"
  on public.marks
  for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'editor')
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'editor')
    )
  );

-- Policy: editors and admins can delete marks
create policy "Editors and admins can delete marks"
  on public.marks
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'editor')
    )
  );

-- 5. Mark History RLS Policies

-- Policy: anyone authenticated can read history
create policy "Authenticated users can read mark history"
  on public.mark_history
  for select
  to authenticated
  using (true);

-- Policy: editors and admins can insert history
create policy "Editors and admins can insert mark history"
  on public.mark_history
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'editor')
    )
  );

-- 6. Trigger to automatically record changes in mark_history
create or replace function public.handle_mark_history()
returns trigger
language plpgsql
security definer
as $$
begin
  if tg_op = 'UPDATE' and old.status is distinct from new.status then
    insert into public.mark_history (mark_id, old_status, new_status, changed_by, changed_at)
    values (new.id, old.status, new.status, new.updated_by, now());
  elsif tg_op = 'INSERT' then
    insert into public.mark_history (mark_id, old_status, new_status, changed_by, changed_at)
    values (new.id, null, new.status, new.updated_by, now());
  end if;
  return new;
end;
$$;

create trigger on_mark_change
  after insert or update on public.marks
  for each row
  execute function public.handle_mark_history();
