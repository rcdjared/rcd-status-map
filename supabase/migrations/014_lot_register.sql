-- 014_lot_register.sql
-- Store one register row per project PBL, optionally linked to one map mark.

begin;

create table public.lot_register (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null
    references public.projects(id) on delete cascade,
  mark_id uuid
    references public.marks(id) on delete set null,
  phase text not null,
  block text not null,
  lot text not null,
  status text not null,
  created_by uuid
    references public.profiles(id) on delete set null,
  updated_by uuid
    references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lot_register_mark_id_key unique (mark_id),
  constraint lot_register_project_pbl_key unique (project_id, phase, block, lot),
  constraint lot_register_pbl_not_blank check (
    phase !~ '^[[:space:]]*$'
    and block !~ '^[[:space:]]*$'
    and lot !~ '^[[:space:]]*$'
  )
);

comment on column public.lot_register.status is
  'Free text by design: project status categories can change, so historical and imported lot statuses are not constrained to the current status_config.';

create index lot_register_project_status_idx
  on public.lot_register (project_id, status);

create or replace function public.normalize_lot_register_pbl()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.phase := upper(regexp_replace(
    new.phase, '^[[:space:]]+|[[:space:]]+$', '', 'g'
  ));
  new.block := upper(regexp_replace(
    new.block, '^[[:space:]]+|[[:space:]]+$', '', 'g'
  ));
  new.lot := upper(regexp_replace(
    new.lot, '^[[:space:]]+|[[:space:]]+$', '', 'g'
  ));
  return new;
end;
$$;

create trigger lot_register_10_normalize_pbl
  before insert or update on public.lot_register
  for each row
  execute function public.normalize_lot_register_pbl();

create or replace function public.set_lot_register_metadata()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

create trigger lot_register_20_set_metadata
  before insert or update on public.lot_register
  for each row
  execute function public.set_lot_register_metadata();

create or replace function public.validate_lot_register_mark_project()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_mark_project_id uuid;
begin
  if new.mark_id is not null then
    select project_id into v_mark_project_id
    from public.marks
    where id = new.mark_id;

    if v_mark_project_id is distinct from new.project_id then
      raise exception 'A register row and its linked mark must belong to the same project'
        using errcode = '23503';
    end if;
  end if;
  return new;
end;
$$;

create trigger lot_register_05_validate_mark_project
  before insert or update on public.lot_register
  for each row
  execute function public.validate_lot_register_mark_project();

create or replace function public.prevent_linked_mark_project_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.project_id is distinct from old.project_id
    and exists (
      select 1
      from public.lot_register
      where mark_id = old.id
    ) then
    raise exception 'A mark linked to the lot register cannot be moved to another project'
      using errcode = '23503';
  end if;
  return new;
end;
$$;

create trigger marks_prevent_linked_project_change
  before update of project_id on public.marks
  for each row
  execute function public.prevent_linked_mark_project_change();

alter table public.lot_register enable row level security;

drop policy if exists "Non-disabled users can read lot register"
  on public.lot_register;
create policy "Non-disabled users can read lot register"
  on public.lot_register
  for select
  to authenticated
  using (
    public.get_caller_role() in (
      'viewer'::public.app_role,
      'editor'::public.app_role,
      'admin'::public.app_role
    )
  );

drop policy if exists "Editors and admins can insert lot register"
  on public.lot_register;
create policy "Editors and admins can insert lot register"
  on public.lot_register
  for insert
  to authenticated
  with check (
    public.get_caller_role() in (
      'editor'::public.app_role,
      'admin'::public.app_role
    )
  );

drop policy if exists "Editors and admins can update lot register"
  on public.lot_register;
create policy "Editors and admins can update lot register"
  on public.lot_register
  for update
  to authenticated
  using (
    public.get_caller_role() in (
      'editor'::public.app_role,
      'admin'::public.app_role
    )
  )
  with check (
    public.get_caller_role() in (
      'editor'::public.app_role,
      'admin'::public.app_role
    )
  );

drop policy if exists "Editors and admins can delete lot register"
  on public.lot_register;
create policy "Editors and admins can delete lot register"
  on public.lot_register
  for delete
  to authenticated
  using (
    public.get_caller_role() in (
      'editor'::public.app_role,
      'admin'::public.app_role
    )
  );

do $$
begin
  if not exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    raise exception 'Required publication supabase_realtime does not exist';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'lot_register'
  ) then
    alter publication supabase_realtime add table public.lot_register;
  end if;
end;
$$;

commit;
